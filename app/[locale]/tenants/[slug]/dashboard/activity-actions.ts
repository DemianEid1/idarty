'use server'

import { headers } from 'next/headers'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { auditLogs, memberships, staff, staffTranslations, tenantInvitations } from '@/lib/db/schema'
import { requirePermission } from '@/lib/permissions'
import type { MemberRole } from '@/lib/authz'

export interface StaffActivityLogItem {
  id: number
  action: string
  entityType: string
  entityId: string | null
  metadata: Record<string, unknown>
  createdAt: Date
}

export interface StaffProfileDetails {
  id: string
  name: string
  role: MemberRole
  email: string | null
  phone: string | null
  status: 'active' | 'invited' | 'local'
  joinedAt: Date | null
  invitedAt: Date | null
}

const inputSchema = z.object({
  slug: z.string().min(1),
  staffId: z.string().uuid(),
})

export async function getStaffActivityHistory(slug: string, staffId: string) {
  inputSchema.parse({ slug, staffId })
  const access = await requirePermission(await headers(), slug, 'team:activity:view')

  // 1. Fetch staff
  const [person] = await db
    .select()
    .from(staff)
    .where(and(eq(staff.id, staffId), eq(staff.tenantId, access.tenant.id)))
    .limit(1)

  if (!person) {
    throw new Error('STAFF_NOT_FOUND')
  }

  // 2. Fetch staff translation
  const [translation] = await db
    .select({ name: staffTranslations.name })
    .from(staffTranslations)
    .where(eq(staffTranslations.staffId, staffId))
    .limit(1)

  // 3. Resolve user ID & membership
  let userId: string | null = null
  let membershipStatus: 'active' | 'invited' | 'local' = 'local'
  let joinedAt: Date | null = null
  let invitedAt: Date | null = null

  if (person.membershipId) {
    const [membership] = await db
      .select({
        userId: memberships.userId,
        status: memberships.status,
        createdAt: memberships.createdAt,
      })
      .from(memberships)
      .where(and(eq(memberships.id, person.membershipId), eq(memberships.tenantId, access.tenant.id)))
      .limit(1)

    if (membership) {
      userId = membership.userId
      membershipStatus = membership.status === 'active' ? 'active' : 'local'
      joinedAt = membership.createdAt
    }
  } else if (person.role === 'owner') {
    const [ownerMem] = await db
      .select({
        userId: memberships.userId,
        createdAt: memberships.createdAt,
      })
      .from(memberships)
      .where(and(eq(memberships.tenantId, access.tenant.id), eq(memberships.role, 'owner')))
      .limit(1)
    if (ownerMem) {
      userId = ownerMem.userId
      membershipStatus = 'active'
      joinedAt = ownerMem.createdAt
    }
  }

  // Check pending invitation if not active
  if (membershipStatus !== 'active') {
    const [invitation] = await db
      .select({ createdAt: tenantInvitations.createdAt })
      .from(tenantInvitations)
      .where(and(eq(tenantInvitations.staffId, staffId), eq(tenantInvitations.tenantId, access.tenant.id)))
      .limit(1)
    if (invitation) {
      membershipStatus = 'invited'
      invitedAt = invitation.createdAt
    }
  }

  // 4. If linked user exists, fetch audit logs
  let logs: StaffActivityLogItem[] = []
  if (userId) {
    const rawLogs = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, access.tenant.id), eq(auditLogs.actorUserId, userId)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(50)

    logs = rawLogs.map((l) => ({
      id: Number(l.id),
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      metadata: (l.metadata as Record<string, unknown>) ?? {},
      createdAt: l.createdAt,
    }))
  }

  return {
    ok: true as const,
    profile: {
      id: person.id,
      name: translation?.name || (person.role === 'owner' ? 'Owner' : 'Staff Member'),
      role: person.role as MemberRole,
      email: person.email,
      phone: person.phoneE164,
      status: membershipStatus,
      joinedAt,
      invitedAt,
    },
    logs,
  }
}
