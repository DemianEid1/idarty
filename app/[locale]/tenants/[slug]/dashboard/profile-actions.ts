'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { and, eq, not } from 'drizzle-orm'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import { requireTenantAccess } from '@/lib/authz'
import { db } from '@/lib/db'
import { user, account, session, staff, staffTranslations, memberships } from '@/lib/db/schema'
import { logAudit } from '@/lib/audit'

export async function updateUserProfile(formData: FormData) {
  const slug = formData.get('slug') as string
  const locale = (formData.get('locale') as string) || 'ar'
  const name = (formData.get('name') as string)?.trim()
  const phone = (formData.get('phone') as string)?.trim()
  const preferredLocale = (formData.get('preferredLocale') as string) || 'ar'

  if (!slug || !name) {
    throw new Error('MISSING_FIELDS')
  }

  const reqHeaders = await headers()
  const access = await requireTenantAccess(reqHeaders, slug)
  const userId = access.session.user.id

  // Update user record
  await db
    .update(user)
    .set({
      name,
      preferredLocale,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId))

  // Update staff profile and translations if a staff profile exists for this membership
  const mem = await db.query.memberships.findFirst({
    where: and(eq(memberships.tenantId, access.tenant.id), eq(memberships.userId, userId)),
  })
  if (mem) {
    if (phone) {
      await db
        .update(staff)
        .set({
          phoneE164: phone,
          updatedAt: new Date(),
        })
        .where(and(eq(staff.tenantId, access.tenant.id), eq(staff.membershipId, mem.id)))
    }
    const st = await db.query.staff.findFirst({
      where: and(eq(staff.tenantId, access.tenant.id), eq(staff.membershipId, mem.id)),
    })
    if (st) {
      await db
        .update(staffTranslations)
        .set({ name })
        .where(and(eq(staffTranslations.staffId, st.id), eq(staffTranslations.locale, locale as any)))
    }
  }

  await logAudit({
    tenantId: access.tenant.id,
    actorUserId: userId,
    action: 'user.profile.update',
    entityType: 'user',
    entityId: userId,
    metadata: { name, preferredLocale },
  })

  revalidatePath(`/${locale}/tenants/${slug}/dashboard`)
  return { ok: true }
}

export async function changeUserPassword(formData: FormData) {
  const slug = formData.get('slug') as string
  const locale = (formData.get('locale') as string) || 'ar'
  const currentPassword = (formData.get('currentPassword') as string) || ''
  const newPassword = (formData.get('newPassword') as string) || ''
  const confirmPassword = (formData.get('confirmPassword') as string) || ''

  if (!slug || !newPassword) {
    throw new Error('MISSING_FIELDS')
  }

  if (newPassword.length < 8) {
    throw new Error('PASSWORD_TOO_SHORT')
  }

  if (newPassword !== confirmPassword) {
    throw new Error('PASSWORDS_DO_NOT_MATCH')
  }

  const reqHeaders = await headers()
  const access = await requireTenantAccess(reqHeaders, slug)
  const userId = access.session.user.id

  // Find existing credential account
  const credentialAccount = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.providerId, 'credential')),
  })

  if (credentialAccount?.password) {
    if (!currentPassword) {
      throw new Error('CURRENT_PASSWORD_REQUIRED')
    }
    const isValid = await verifyPassword({
      hash: credentialAccount.password,
      password: currentPassword,
    })
    if (!isValid) {
      throw new Error('INVALID_CURRENT_PASSWORD')
    }
  }

  const newHash = await hashPassword(newPassword)

  if (credentialAccount) {
    await db
      .update(account)
      .set({
        password: newHash,
        updatedAt: new Date(),
      })
      .where(eq(account.id, credentialAccount.id))
  } else {
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: newHash,
    })
  }

  await logAudit({
    tenantId: access.tenant.id,
    actorUserId: userId,
    action: 'user.password.change',
    entityType: 'user',
    entityId: userId,
    metadata: {},
  })

  revalidatePath(`/${locale}/tenants/${slug}/dashboard`)
  return { ok: true }
}

export async function revokeOtherSessions(slug: string, locale: string) {
  const reqHeaders = await headers()
  const access = await requireTenantAccess(reqHeaders, slug)
  const userId = access.session.user.id
  const currentSessionId = access.session.session.id

  // Delete all sessions for this user except current
  await db
    .delete(session)
    .where(and(eq(session.userId, userId), not(eq(session.id, currentSessionId))))

  await logAudit({
    tenantId: access.tenant.id,
    actorUserId: userId,
    action: 'user.sessions.revoke_others',
    entityType: 'session',
    entityId: currentSessionId,
    metadata: {},
  })

  revalidatePath(`/${locale}/tenants/${slug}/dashboard`)
  return { ok: true }
}
