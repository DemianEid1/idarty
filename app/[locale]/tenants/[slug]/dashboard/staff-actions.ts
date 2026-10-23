"use server"

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import crypto from 'node:crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { memberships, staff, staffTranslations, tenantInvitations, tenantTranslations } from '@/lib/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { requireTenantAccess } from '@/lib/authz'
import { staffEditPatch } from '@/lib/phase-b-policy'
import { sendTransactionalEmail } from '@/lib/email/send'
import { publicOrigin } from '@/lib/auth'

const roleRank = { receptionist: 1, staff: 2, manager: 3, admin: 4, owner: 5 } as const
const assignableRoleSchema = z.enum(['admin', 'manager', 'staff', 'receptionist'])

// Auto-format Egyptian local numbers to E.164.
// Empty string or omitted value is treated as null.
const e164 = z
  .string()
  .trim()
  .max(30)
  .transform((v) => {
    if (!v) return v
    const cleaned = v.replace(/[\s-]/g, '') // Remove spaces and dashes
    if (/^01[0125]\d{8}$/.test(cleaned)) {
      return '+2' + cleaned // Prepend Egypt code
    }
    return cleaned
  })
  .refine((v) => v === '' || /^\+[1-9]\d{6,14}$/.test(v), {
    message: 'Phone must be a valid local number (e.g. 010...) or international format (+...)',
  })
  .transform((v) => v || undefined)

const schema = z.object({
  slug: z.string().min(1),
  locale: z.enum(['ar', 'en']),
  name: z.string().trim().min(2).max(80),
  role: assignableRoleSchema.default('staff'),
  email: z.string().email().optional().or(z.literal('')),
  phone: e164.optional(),
})

const idSchema = z.object({
  slug: z.string().min(1),
  locale: z.enum(['ar', 'en']),
  staffId: z.string().uuid(),
})

export async function updateStaff(formData: FormData) {
  const input = schema.extend({ staffId: z.string().uuid() }).parse({
    slug: formData.get('slug'),
    locale: formData.get('locale'),
    staffId: formData.get('staffId'),
    name: formData.get('name'),
    role: formData.get('role') ?? 'staff',
    email: formData.get('email') ?? '',
    phone: formData.get('phone') ?? '',
  })
  const access = await requireTenantAccess(await headers(), input.slug, 'admin')

  await db.transaction(async (tx) => {
    const [existingStaff] = await tx
      .select()
      .from(staff)
      .where(and(eq(staff.id, input.staffId), eq(staff.tenantId, access.tenant.id), eq(staff.isActive, true)))
    if (!existingStaff) throw new Error('STAFF_NOT_FOUND')

    const isOwnerStaff = existingStaff.role === 'owner'
    const targetRole = isOwnerStaff ? 'owner' : input.role

    if (!isOwnerStaff) {
      if (input.role === ('owner' as any)) {
        throw new Error('CANNOT_ASSIGN_OWNER_ROLE')
      }
      if (access.membership.role !== 'owner' && roleRank[input.role] >= roleRank[access.membership.role]) {
        throw new Error('CANNOT_ASSIGN_EQUAL_OR_HIGHER_ROLE')
      }
    }

    await tx
      .update(staff)
      .set({
        role: targetRole,
        ...staffEditPatch(input.email || null, input.phone || null),
        updatedAt: new Date(),
      })
      .where(eq(staff.id, input.staffId))

    await tx
      .insert(staffTranslations)
      .values({
        tenantId: access.tenant.id,
        staffId: input.staffId,
        locale: input.locale,
        name: input.name,
      })
      .onConflictDoUpdate({
        target: [staffTranslations.staffId, staffTranslations.locale],
        set: { name: input.name },
      })

    // If staff has linked membership and is not owner, synchronize role
    if (existingStaff.membershipId && !isOwnerStaff) {
      await tx
        .update(memberships)
        .set({ role: targetRole, updatedAt: new Date() })
        .where(and(eq(memberships.id, existingStaff.membershipId), eq(memberships.tenantId, access.tenant.id)))
    }

    // If staff has pending invitation, synchronize role
    if (!isOwnerStaff) {
      await tx
        .update(tenantInvitations)
        .set({ role: targetRole, updatedAt: new Date() })
        .where(and(eq(tenantInvitations.staffId, input.staffId), eq(tenantInvitations.tenantId, access.tenant.id), isNull(tenantInvitations.acceptedAt)))
    }
  })

  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  revalidatePath(`/${input.locale === 'ar' ? 'en' : 'ar'}/tenants/${input.slug}/dashboard`)
  return { ok: true as const }
}

export async function archiveStaff(formData: FormData) {
  const input = idSchema.parse({ slug: formData.get('slug'), locale: formData.get('locale'), staffId: formData.get('staffId') })
  const access = await requireTenantAccess(await headers(), input.slug, 'admin')

  const [person] = await db
    .select()
    .from(staff)
    .where(and(eq(staff.id, input.staffId), eq(staff.tenantId, access.tenant.id), eq(staff.isActive, true)))
    .limit(1)
  if (!person) return { ok: false as const }

  // Prevent self-archiving by the current actor
  if (person.membershipId === access.membership.id) {
    throw new Error('CANNOT_ARCHIVE_SELF')
  }

  await db.transaction(async (tx) => {
    await tx
      .update(staff)
      .set({ isActive: false, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(staff.id, input.staffId))

    // Suspend linked membership immediately
    if (person.membershipId) {
      await tx
        .update(memberships)
        .set({ status: 'suspended', updatedAt: new Date() })
        .where(and(eq(memberships.id, person.membershipId), eq(memberships.tenantId, access.tenant.id)))
    }

    // Clean up any pending unaccepted invitations
    await tx
      .delete(tenantInvitations)
      .where(and(eq(tenantInvitations.staffId, input.staffId), eq(tenantInvitations.tenantId, access.tenant.id), isNull(tenantInvitations.acceptedAt)))
  })

  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  revalidatePath(`/${input.locale === 'ar' ? 'en' : 'ar'}/tenants/${input.slug}/dashboard`)
  return { ok: true as const }
}

export async function createStaff(formData: FormData) {
  const input = schema.parse({
    slug: formData.get('slug'),
    locale: formData.get('locale'),
    name: formData.get('name'),
    role: formData.get('role') ?? 'staff',
    email: formData.get('email') ?? '',
    phone: formData.get('phone') ?? '',
  })
  const access = await requireTenantAccess(await headers(), input.slug, 'admin')

  // Prevent role escalation
  if (input.role === ('owner' as any)) {
    throw new Error('CANNOT_ASSIGN_OWNER_ROLE')
  }
  if (access.membership.role !== 'owner' && roleRank[input.role] >= roleRank[access.membership.role]) {
    throw new Error('CANNOT_ASSIGN_EQUAL_OR_HIGHER_ROLE')
  }

  let rawToken: string | null = null

  const created = await db.transaction(async (tx) => {
    const [person] = await tx
      .insert(staff)
      .values({
        tenantId: access.tenant.id,
        role: input.role,
        email: input.email || null,
        phoneE164: input.phone || null,
      })
      .returning({ id: staff.id })

    await tx.insert(staffTranslations).values(
      (['ar', 'en'] as const).map((loc) => ({
        tenantId: access.tenant.id,
        staffId: person.id,
        locale: loc,
        name: input.name,
      }))
    )

    // Decoupled: Zero automatic insertions into staffServices!

    // If email is provided, create a secure single-use invitation record
    if (input.email) {
      rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

      await tx.insert(tenantInvitations).values({
        tenantId: access.tenant.id,
        staffId: person.id,
        email: input.email.toLowerCase(),
        role: input.role,
        tokenHash,
        invitedByUserId: access.session.user.id,
        expiresAt,
      })
    }

    return person
  })

  // Send invitation email out-of-band if email was provided
  if (input.email && rawToken) {
    const origin = publicOrigin()
    const inviteUrl = `${origin}/${input.locale}/invite/claim?token=${rawToken}`
    const tTranslation = await db.query.tenantTranslations.findFirst({
      where: and(eq(tenantTranslations.tenantId, access.tenant.id), eq(tenantTranslations.locale, input.locale)),
    })
    const roleLabels = {
      ar: { admin: 'مشرف', manager: 'مدير', staff: 'عضو فريق', receptionist: 'موظف استقبال' },
      en: { admin: 'Admin', manager: 'Manager', staff: 'Staff', receptionist: 'Receptionist' },
    }
    const roleName = roleLabels[input.locale][input.role]

    await sendTransactionalEmail({
      to: input.email,
      locale: input.locale,
      template: 'invite',
      url: inviteUrl,
      workspaceName: tTranslation?.name ?? access.tenant.slug,
      roleName,
      idempotencyKey: `invite/${created.id}/${Date.now()}`,
    }).catch((err) => {
      console.error('[idarty] invite email dispatch failed:', err)
    })
  }

  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  revalidatePath(`/${input.locale === 'ar' ? 'en' : 'ar'}/tenants/${input.slug}/dashboard`)
  return { ok: true as const, id: created.id }
}

export async function resendStaffInvitation(formData: FormData) {
  const input = idSchema.parse({
    slug: formData.get('slug'),
    locale: formData.get('locale'),
    staffId: formData.get('staffId'),
  })
  const access = await requireTenantAccess(await headers(), input.slug, 'admin')

  const [person] = await db
    .select({
      id: staff.id,
      email: staff.email,
      role: staff.role,
      membershipId: staff.membershipId,
    })
    .from(staff)
    .where(and(eq(staff.id, input.staffId), eq(staff.tenantId, access.tenant.id), eq(staff.isActive, true)))
    .limit(1)

  if (!person || !person.email) {
    throw new Error('STAFF_HAS_NO_EMAIL')
  }

  if (person.membershipId) {
    throw new Error('STAFF_ALREADY_ACTIVATED')
  }

  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  await db.transaction(async (tx) => {
    // Invalidate prior pending invitations
    await tx
      .delete(tenantInvitations)
      .where(and(eq(tenantInvitations.staffId, person.id), eq(tenantInvitations.tenantId, access.tenant.id), isNull(tenantInvitations.acceptedAt)))

    await tx.insert(tenantInvitations).values({
      tenantId: access.tenant.id,
      staffId: person.id,
      email: person.email!.toLowerCase(),
      role: person.role,
      tokenHash,
      invitedByUserId: access.session.user.id,
      expiresAt,
    })
  })

  const origin = publicOrigin()
  const inviteUrl = `${origin}/${input.locale}/invite/claim?token=${rawToken}`
  const tTranslation = await db.query.tenantTranslations.findFirst({
    where: and(eq(tenantTranslations.tenantId, access.tenant.id), eq(tenantTranslations.locale, input.locale)),
  })
  const roleLabels = {
    ar: { admin: 'مشرف', manager: 'مدير', staff: 'عضو فريق', receptionist: 'موظف استقبال' },
    en: { admin: 'Admin', manager: 'Manager', staff: 'Staff', receptionist: 'Receptionist' },
  }
  const roleName = roleLabels[input.locale][person.role as keyof typeof roleLabels.ar] ?? person.role

  await sendTransactionalEmail({
    to: person.email,
    locale: input.locale,
    template: 'invite',
    url: inviteUrl,
    workspaceName: tTranslation?.name ?? access.tenant.slug,
    roleName,
    idempotencyKey: `resend-invite/${person.id}/${Date.now()}`,
  }).catch((err) => {
    console.error('[idarty] resend invite email dispatch failed:', err)
  })

  return { ok: true as const }
}
