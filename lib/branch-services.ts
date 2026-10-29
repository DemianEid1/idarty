import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { branchServices, branches, services } from '@/lib/db/schema'

/**
 * Branch-specific service availability.
 *
 * A service is defined once per tenant; `branch_services` only records whether
 * that service can be booked at a given branch. A missing row means available,
 * so historical data and services created by older code paths keep working.
 */

/**
 * SQL predicate (usable inside a query on `services`): the service is not
 * explicitly disabled at the given branch.
 */
export function serviceAvailableAtBranchSql(branchId: string) {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${branchServices}
    WHERE ${branchServices.branchId} = ${branchId}
      AND ${branchServices.serviceId} = ${services.id}
      AND ${branchServices.isAvailable} = false
  )`
}

/**
 * SQL predicate (usable inside a query on `services`): at least one active
 * branch can book the service. Used by the public website, which is not
 * branch-scoped — a service disabled everywhere should not be advertised.
 * When a tenant has no branches at all (pre-migration data), the service stays
 * visible to preserve previous behaviour.
 */
export function serviceVisibleOnPublicSiteSql() {
  return sql`(
    NOT EXISTS (
      SELECT 1 FROM ${branches}
      WHERE ${branches.tenantId} = ${services.tenantId}
        AND ${branches.archivedAt} IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM ${branches}
      WHERE ${branches.tenantId} = ${services.tenantId}
        AND ${branches.isActive} = true
        AND ${branches.archivedAt} IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM ${branchServices}
          WHERE ${branchServices.branchId} = ${branches.id}
            AND ${branchServices.serviceId} = ${services.id}
            AND ${branchServices.isAvailable} = false
        )
    )
  )`
}

/**
 * Authoritative availability check for a single branch/service pair, scoped to
 * the tenant. Returns false when the branch does not belong to the tenant, so a
 * caller can never validate against another tenant's branch.
 */
export async function isServiceAvailableAtBranch(
  tenantId: string,
  branchId: string,
  serviceId: string
): Promise<boolean> {
  const branch = await db.query.branches.findFirst({
    where: and(
      eq(branches.id, branchId),
      eq(branches.tenantId, tenantId),
      eq(branches.isActive, true),
      sql`${branches.archivedAt} IS NULL`
    ),
    columns: { id: true },
  })
  if (!branch) return false

  const row = await db.query.branchServices.findFirst({
    where: and(
      eq(branchServices.tenantId, tenantId),
      eq(branchServices.branchId, branchId),
      eq(branchServices.serviceId, serviceId)
    ),
  })
  return row ? row.isAvailable : true
}
