import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { memberships, tenants } from '@/lib/db/schema'
import { requireSession } from '@/lib/auth'
import { user } from '@/lib/db/schema'
import { logAudit } from '@/lib/audit'

export const roleRank = { receptionist: 1, staff: 2, manager: 3, admin: 4, owner: 5 } as const
export type MemberRole = keyof typeof roleRank

export async function requireTenantAccess(headers: Headers, slug: string, minimumRole: MemberRole = 'receptionist') {
  const session = await requireSession(headers)
  const rows = await db
    .select({ tenant: tenants, membership: memberships })
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .where(and(eq(memberships.userId, session.user.id), eq(tenants.slug, slug), eq(memberships.status, 'active')))
    .limit(1)
  const access = rows[0]
  if (!access) {
    await logAudit({
      actorUserId: session.user.id,
      action: 'authz.tenant.unauthorized',
      entityType: 'tenant',
      metadata: { slug, reason: 'no_active_membership' },
    }, headers)
    throw new Error('FORBIDDEN')
  }
  if (roleRank[access.membership.role] < roleRank[minimumRole]) {
    await logAudit({
      actorUserId: session.user.id,
      action: 'authz.tenant.insufficient_role',
      entityType: 'tenant',
      entityId: access.tenant.id,
      tenantId: access.tenant.id,
      metadata: { slug, requiredRole: minimumRole, actualRole: access.membership.role },
    }, headers)
    throw new Error('FORBIDDEN')
  }
  return { session, ...access }
}

export async function requirePlatformAdmin(headers: Headers) {
  const session = await requireSession(headers)
  // isPlatformAdmin is registered as an additionalField in better-auth and comes through on the session
  const isPlatformAdmin = (session.user as { isPlatformAdmin?: boolean }).isPlatformAdmin
  if (!isPlatformAdmin) {
    await logAudit({
      actorUserId: session.user.id,
      action: 'authz.admin.unauthorized',
      entityType: 'user',
      entityId: session.user.id,
      metadata: { reason: 'not_platform_admin' },
    }, headers)
    throw new Error('FORBIDDEN')
  }
  return session
}
