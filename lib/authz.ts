import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { memberships, tenants } from '@/lib/db/schema'
import { requireSession } from '@/lib/auth'
import { user } from '@/lib/db/schema'
import { logAudit } from '@/lib/audit'

export const roleRank = { receptionist: 1, staff: 2, manager: 3, admin: 4, owner: 5 } as const
export type MemberRole = keyof typeof roleRank

/**
 * Schema-capability probe for `tenants.booking_capacity`.
 *
 * The probe result is process-local: a warm serverless instance that cached
 * "column absent" keeps that answer for the life of the process even after
 * migration 0012 adds the column. Two properties bound the damage:
 *
 *  - The answer is cached with a short TTL and re-probed afterwards, so a
 *    stale "absent" answer expires on its own.
 *  - A cached "absent" only ever omits the column from the SELECT. It never
 *    decides the capacity value - that always comes from the row, and falls
 *    back to 1 only when the column is genuinely absent.
 *
 * This is NOT migration-triggered invalidation. No production code path can
 * observe that a migration just ran, so nothing here claims that. The TTL is
 * the entire mechanism and the only bound on staleness.
 */
const CAPACITY_COLUMN_TTL_MS = 60_000

let bookingCapacityColumnAvailable: boolean | null = null
let bookingCapacityColumnProbedAt = 0

export function setBookingCapacityColumnAvailable(available: boolean | null) {
  bookingCapacityColumnAvailable = available
  bookingCapacityColumnProbedAt = available === null ? 0 : Date.now()
}

async function isBookingCapacityColumnPresent(): Promise<boolean> {
  const now = Date.now()
  if (
    bookingCapacityColumnAvailable !== null &&
    now - bookingCapacityColumnProbedAt < CAPACITY_COLUMN_TTL_MS
  ) {
    return bookingCapacityColumnAvailable
  }
  try {
    const res = await db.execute(
      sql`SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'tenants'::regclass AND attname = 'booking_capacity' AND NOT attisdropped) AS has_col`
    )
    const present = Boolean((res?.rows?.[0] as any)?.has_col)
    bookingCapacityColumnAvailable = present
    bookingCapacityColumnProbedAt = now
    return present
  } catch {
    // Probe failed: do not cache a negative answer, so the next call retries.
    bookingCapacityColumnAvailable = null
    bookingCapacityColumnProbedAt = 0
    return false
  }
}

export async function requireTenantAccess(headers: Headers, slug: string, minimumRole: MemberRole = 'receptionist') {
  const session = await requireSession(headers)
  const hasCapacityCol = await isBookingCapacityColumnPresent()

  const baseTenantSelection = {
    id: tenants.id,
    slug: tenants.slug,
    status: tenants.status,
    businessType: tenants.businessType,
    defaultLocale: tenants.defaultLocale,
    supportedLocales: tenants.supportedLocales,
    timezone: tenants.timezone,
    currency: tenants.currency,
    phoneE164: tenants.phoneE164,
    email: tenants.email,
    theme: tenants.theme,
    createdAt: tenants.createdAt,
    updatedAt: tenants.updatedAt,
  }

  const membershipSelection = {
    id: memberships.id,
    tenantId: memberships.tenantId,
    userId: memberships.userId,
    role: memberships.role,
    status: memberships.status,
    createdAt: memberships.createdAt,
  }

  const rows = hasCapacityCol
    ? await db
        .select({
          tenant: {
            ...baseTenantSelection,
            bookingCapacity: tenants.bookingCapacity,
          },
          membership: membershipSelection,
        })
        .from(memberships)
        .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
        .where(and(eq(memberships.userId, session.user.id), eq(tenants.slug, slug), eq(memberships.status, 'active')))
        .limit(1)
    : await db
        .select({
          tenant: baseTenantSelection,
          membership: membershipSelection,
        })
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
  return {
    session,
    tenant: {
      ...access.tenant,
      bookingCapacity: (access.tenant as any).bookingCapacity ?? 1,
    },
    membership: access.membership,
  }
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
