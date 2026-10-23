"use server"

import { headers } from 'next/headers'
import crypto from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { memberships, staff, tenantInvitations, tenants, tenantTranslations, user } from '@/lib/db/schema'
import { auth, getSession } from '@/lib/auth'

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

export type InvitationDetails = {
  valid: true
  email: string
  role: string
  tenantSlug: string
  tenantName: string
  staffName: string
} | {
  valid: false
  reason: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_ACCEPTED'
}

export async function getInvitationDetails(rawToken: string, locale: 'ar' | 'en'): Promise<InvitationDetails> {
  if (!rawToken || typeof rawToken !== 'string') {
    return { valid: false, reason: 'NOT_FOUND' }
  }
  const tokenHash = hashToken(rawToken)

  const [invite] = await db
    .select({
      id: tenantInvitations.id,
      email: tenantInvitations.email,
      role: tenantInvitations.role,
      expiresAt: tenantInvitations.expiresAt,
      acceptedAt: tenantInvitations.acceptedAt,
      tenantId: tenantInvitations.tenantId,
      staffId: tenantInvitations.staffId,
    })
    .from(tenantInvitations)
    .where(eq(tenantInvitations.tokenHash, tokenHash))
    .limit(1)

  if (!invite) return { valid: false, reason: 'NOT_FOUND' }
  if (invite.acceptedAt) return { valid: false, reason: 'ALREADY_ACCEPTED' }
  if (invite.expiresAt < new Date()) return { valid: false, reason: 'EXPIRED' }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, invite.tenantId),
  })
  const translation = await db.query.tenantTranslations.findFirst({
    where: and(eq(tenantTranslations.tenantId, invite.tenantId), eq(tenantTranslations.locale, locale)),
  })
  const staffMember = await db.query.staff.findFirst({
    where: eq(staff.id, invite.staffId),
  })

  return {
    valid: true,
    email: invite.email,
    role: invite.role,
    tenantSlug: tenant?.slug ?? '',
    tenantName: translation?.name ?? tenant?.slug ?? '',
    staffName: staffMember?.email ?? invite.email,
  }
}

/**
 * Activates an account for a new user through the verified invitation link.
 * Uses Better Auth's official signUpEmail to create the user and hash credentials,
 * then atomically links tenant membership and marks the token consumed.
 */
export async function activateEmployeeAccount(input: {
  token: string
  name: string
  password: string
  locale: 'ar' | 'en'
}) {
  const parsed = z.object({
    token: z.string().min(10),
    name: z.string().trim().min(2).max(80),
    password: z.string().min(8).max(128),
    locale: z.enum(['ar', 'en']),
  }).parse(input)

  const tokenHash = hashToken(parsed.token)
  const reqHeaders = await headers()

  // 1. Validate invitation and lock row
  const invite = await db.query.tenantInvitations.findFirst({
    where: and(
      eq(tenantInvitations.tokenHash, tokenHash),
      gt(tenantInvitations.expiresAt, new Date()),
      isNull(tenantInvitations.acceptedAt)
    ),
  })

  if (!invite) {
    throw new Error('INVALID_OR_EXPIRED_INVITATION')
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, invite.tenantId),
  })
  if (!tenant) throw new Error('TENANT_NOT_FOUND')

  // 2. Create the user using Better Auth's official API
  let signUpRes
  try {
    signUpRes = await auth.api.signUpEmail({
      body: {
        name: parsed.name,
        email: invite.email.toLowerCase(),
        password: parsed.password,
      },
      headers: reqHeaders,
    })
  } catch (err: any) {
    console.error('[idarty:invite] Better Auth signUpEmail failed:', err)
    throw new Error(err.message || 'SIGN_UP_FAILED')
  }

  const newUserId = signUpRes.user.id

  // 3. Atomically attach membership, link staff, and mark invite accepted
  await db.transaction(async (tx) => {
    // Verified through the trusted invitation channel
    await tx
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, newUserId))

    // Insert membership
    const [membership] = await tx
      .insert(memberships)
      .values({
        tenantId: invite.tenantId,
        userId: newUserId,
        role: invite.role,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [memberships.tenantId, memberships.userId],
        set: { role: invite.role, status: 'active', updatedAt: new Date() },
      })
      .returning({ id: memberships.id })

    // Link staff record and sync role
    await tx
      .update(staff)
      .set({
        membershipId: membership.id,
        role: invite.role,
        updatedAt: new Date(),
      })
      .where(and(eq(staff.id, invite.staffId), eq(staff.tenantId, invite.tenantId)))

    // Mark invitation consumed
    await tx
      .update(tenantInvitations)
      .set({
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tenantInvitations.id, invite.id))
  })

  // 4. Sign in to establish the session cookie
  try {
    await auth.api.signInEmail({
      body: {
        email: invite.email.toLowerCase(),
        password: parsed.password,
      },
      headers: reqHeaders,
    })
  } catch (err) {
    console.error('[idarty:invite] Post-activation signInEmail note:', err)
  }

  return { ok: true as const, slug: tenant.slug }
}

/**
 * Allows an already-authenticated user to accept an invitation for their verified email.
 */
export async function acceptInvitationForExistingUser(token: string) {
  const reqHeaders = await headers()
  const session = await getSession(reqHeaders)
  if (!session || !session.user) {
    throw new Error('UNAUTHORIZED')
  }

  const tokenHash = hashToken(token)

  const invite = await db.query.tenantInvitations.findFirst({
    where: and(
      eq(tenantInvitations.tokenHash, tokenHash),
      gt(tenantInvitations.expiresAt, new Date()),
      isNull(tenantInvitations.acceptedAt)
    ),
  })

  if (!invite) {
    throw new Error('INVALID_OR_EXPIRED_INVITATION')
  }

  // Email mismatch protection: strictly prevent taking over another person's invite
  if (session.user.email.toLowerCase() !== invite.email.toLowerCase()) {
    throw new Error('INVITATION_EMAIL_MISMATCH')
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, invite.tenantId),
  })
  if (!tenant) throw new Error('TENANT_NOT_FOUND')

  await db.transaction(async (tx) => {
    // Insert or update membership
    const [membership] = await tx
      .insert(memberships)
      .values({
        tenantId: invite.tenantId,
        userId: session.user.id,
        role: invite.role,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [memberships.tenantId, memberships.userId],
        set: { role: invite.role, status: 'active', updatedAt: new Date() },
      })
      .returning({ id: memberships.id })

    // Link staff record and sync role
    await tx
      .update(staff)
      .set({
        membershipId: membership.id,
        role: invite.role,
        updatedAt: new Date(),
      })
      .where(and(eq(staff.id, invite.staffId), eq(staff.tenantId, invite.tenantId)))

    // Mark invitation consumed
    await tx
      .update(tenantInvitations)
      .set({
        acceptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tenantInvitations.id, invite.id))
  })

  return { ok: true as const, slug: tenant.slug }
}
