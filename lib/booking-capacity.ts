import { and, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm'
import { bookings, bookingItems, tenants } from '@/lib/db/schema'

/**
 * Derives a stable, collision-safe 64-bit signed integer from a tenant UUID
 * and acquires a PostgreSQL transaction-scoped advisory lock.
 *
 * The lock is automatically released by PostgreSQL when the enclosing transaction
 * commits or rolls back, guaranteeing that no locks can be orphaned.
 */
export async function acquireTenantBookingLock(tx: any, tenantId: string): Promise<void> {
  // Refuse to take a transaction-scoped advisory lock outside a transaction.
  // Without this guard the lock would silently not be held and capacity
  // enforcement would degrade to an unprotected read-then-write race.
  assertTransaction(tx, 'acquireTenantBookingLock')
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(('x' || substr(md5('tenant_booking_capacity:' || ${tenantId}::text), 1, 16))::bit(64)::bigint)`
  )
}

/**
 * Type guard: is `tx` a real Drizzle transaction object?
 *
 * `pg_advisory_xact_lock` only holds for the lifetime of the transaction it is
 * issued inside. Called outside one, PostgreSQL raises "WARNING: there is no
 * transaction in progress" and the lock is released at the end of the statement
 * - a silent no-op that would leave capacity enforcement unprotected. Every
 * production caller is inside `db.transaction(...)`, but that is convention, not
 * enforcement, so this guard turns a silent failure into a loud one.
 *
 * Detection is based on the Drizzle node-postgres transaction class, which sets
 * `static [entityKind] = "NodePgTransaction"`. We check for the marker rather
 * than importing the class, so this stays decoupled from the driver. Note this
 * identifies a real transaction object; it cannot verify that a `BEGIN` has
 * actually been issued on the wire - see the module-level note on the test suite
 * for how that is verified separately.
 */
export function isBookingTransaction(tx: any): boolean {
  if (!tx || typeof tx !== 'object') return false
  // Drizzle marks its classes with a STATIC symbol key. Verified against
  // drizzle-orm@0.45.3: `Symbol.for('drizzle:entityKind')` (colon, not dot) is
  // defined on `NodePgTransaction` and inherited by subclasses. A plain mock
  // object has no constructor carrying that marker.
  const marker = tx.constructor?.[Symbol.for('drizzle:entityKind')]
  return marker === 'NodePgTransaction'
}

/**
 * Throws unless `tx` is a real Drizzle transaction, so the tenant advisory lock
 * can never be silently skipped.
 */
export function assertTransaction(tx: unknown, operation: string): void {
  if (!isBookingTransaction(tx)) {
    throw new Error(
      `[booking-capacity] ${operation} requires an active database transaction. ` +
        `pg_advisory_xact_lock outside a transaction is a no-op.`
    )
  }
}

export interface BookingInterval {
  bookingId: string
  blockStartsAt: Date | string | number
  blockEndsAt: Date | string | number
}

/**
 * Calculates the peak instantaneous concurrency of existing bookings
 * strictly within the requested [requestStart, requestEnd) interval.
 *
 * Intervals are treated as half-open: [start, end).
 * End events are processed before start events at identical timestamps.
 * Multi-item bookings are merged so that a single booking ID does not
 * inflate tenant-level capacity occupancy.
 */
export function calculatePeakConcurrency(
  existingItems: BookingInterval[],
  requestStart: Date | string | number,
  requestEnd: Date | string | number
): number {
  const reqStartMs =
    typeof requestStart === 'number'
      ? requestStart
      : new Date(requestStart).getTime()
  const reqEndMs =
    typeof requestEnd === 'number'
      ? requestEnd
      : new Date(requestEnd).getTime()

  if (Number.isNaN(reqStartMs) || Number.isNaN(reqEndMs) || reqStartMs >= reqEndMs || existingItems.length === 0) {
    return 0
  }

  // Step 1: Group items by bookingId so multiple items of the same booking
  // are merged into disjoint intervals for that booking.
  const itemsByBooking = new Map<string, { start: number; end: number }[]>()
  for (const item of existingItems) {
    const s =
      typeof item.blockStartsAt === 'number'
        ? item.blockStartsAt
        : new Date(item.blockStartsAt).getTime()
    const e =
      typeof item.blockEndsAt === 'number'
        ? item.blockEndsAt
        : new Date(item.blockEndsAt).getTime()

    if (Number.isNaN(s) || Number.isNaN(e) || s >= e) continue

    // Only consider items that intersect the requested window
    if (s < reqEndMs && e > reqStartMs) {
      const list = itemsByBooking.get(item.bookingId)
      if (list) {
        list.push({ start: s, end: e })
      } else {
        itemsByBooking.set(item.bookingId, [{ start: s, end: e }])
      }
    }
  }

  // Step 2: For each booking, merge overlapping/touching intervals and clip to [reqStartMs, reqEndMs)
  interface SweepEvent {
    time: number
    delta: number // -1 for end, +1 for start
  }
  const events: SweepEvent[] = []

  for (const [, intervals] of itemsByBooking) {
    // Sort intervals by start time
    intervals.sort((a, b) => a.start - b.start)

    // Merge overlapping or touching intervals for this booking
    const merged: { start: number; end: number }[] = []
    let current = intervals[0]
    for (let i = 1; i < intervals.length; i++) {
      const next = intervals[i]
      if (next.start <= current.end) {
        current.end = Math.max(current.end, next.end)
      } else {
        merged.push(current)
        current = next
      }
    }
    merged.push(current)

    // Clip each merged interval to [reqStartMs, reqEndMs) and create sweep events
    for (const inv of merged) {
      const clippedStart = Math.max(inv.start, reqStartMs)
      const clippedEnd = Math.min(inv.end, reqEndMs)
      if (clippedStart < clippedEnd) {
        events.push({ time: clippedStart, delta: 1 })
        events.push({ time: clippedEnd, delta: -1 })
      }
    }
  }

  // Step 3: Sort events.
  // Primary sort: time ASC.
  // Secondary sort: delta ASC (-1 before +1) so that an interval ending at T
  // releases concurrency before another interval starting at T claims concurrency.
  events.sort((a, b) => a.time - b.time || a.delta - b.delta)

  // Step 4: Sweep line to calculate peak concurrency
  let running = 0
  let peak = 0
  for (const event of events) {
    running += event.delta
    if (running > peak) {
      peak = running
    }
  }

  return peak
}

/**
 * Calculates the peak instantaneous concurrency of active bookings
 * whose buffered intervals intersect the requested [blockStart, blockEnd)
 * window for the specified tenant.
 */
export async function getPeakActiveBookingConcurrency(
  tx: any,
  tenantId: string,
  blockStart: Date,
  blockEnd: Date,
  excludeBookingId?: string
): Promise<number> {
  const conditions = [
    eq(bookingItems.tenantId, tenantId),
    inArray(bookings.status, ['pending', 'confirmed']),
    lt(bookingItems.blockStartsAt, blockEnd),
    gt(bookingItems.blockEndsAt, blockStart),
  ]

  if (excludeBookingId) {
    conditions.push(ne(bookingItems.bookingId, excludeBookingId))
  }

  const rows = await tx
    .select({
      bookingId: bookingItems.bookingId,
      blockStartsAt: bookingItems.blockStartsAt,
      blockEndsAt: bookingItems.blockEndsAt,
    })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .where(and(...conditions))

  return calculatePeakConcurrency(rows, blockStart, blockEnd)
}

/**
 * Compatibility alias for getPeakActiveBookingConcurrency.
 */
export const getActiveBookingOverlapCount = getPeakActiveBookingConcurrency

export interface CapacityCheckResult {
  allowed: boolean
  currentOverlaps: number
  maxCapacity: number
}

/**
 * Authoritatively verifies whether a tenant has available booking capacity
 * within a serialized database transaction.
 *
 * 1. Acquires a tenant-scoped transaction advisory lock.
 * 2. Under READ COMMITTED, queries committed active overlapping bookings.
 * 3. Enforces that peakExistingConcurrency < maxCapacity (defaulting to 1).
 */
export async function assertTenantBookingCapacity(
  tx: any,
  tenantId: string,
  blockStart: Date,
  blockEnd: Date,
  excludeBookingId?: string
): Promise<CapacityCheckResult> {
  // Step 1: Acquire exclusive transaction advisory lock for this tenant
  await acquireTenantBookingLock(tx, tenantId)

  // Step 2: Retrieve the tenant's configured booking capacity.
  //
  // Migration 0012 is REQUIRED by this code path, not optional. The booking
  // write itself inserts `staff_id = NULL`, which the pre-0012 schema rejects
  // with SQLSTATE 23502 (not_null_violation) — so no fallback here can make the
  // pre-0012 schema usable. Worse, swallowing 42703 and carrying on is actively
  // harmful: in PostgreSQL a failed statement ABORTS the enclosing transaction,
  // so the peak-concurrency query below would then fail with 25P02
  // (in_failed_sql_transaction), an obscure error that hides the real cause and
  // leaves the caller guessing.
  //
  // So: fail clearly and stop. Naming the missing migration is actionable; the
  // 25P02 cascade is not. Every other failure (permissions, timeouts, dropped
  // connections, malformed queries) still propagates unchanged.
  let maxCapacity = 1
  try {
    const tenantRecord = await tx.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { bookingCapacity: true },
    })
    maxCapacity = Math.max(1, tenantRecord?.bookingCapacity ?? 1)
  } catch (err: any) {
    if (err?.code === '42703') {
      const schemaError = new Error(
        '[booking-capacity] tenants.booking_capacity does not exist: migration ' +
          '0012_tenant_booking_capacity.sql has not been applied to this database. ' +
          'The application requires it. Refusing to continue inside an aborted transaction.'
      )
      ;(schemaError as any).code = 'SCHEMA_NOT_MIGRATED'
      throw schemaError
    }
    throw err
  }

  // Step 3: Calculate peak concurrent active bookings during [blockStart, blockEnd)
  const peakConcurrency = await getPeakActiveBookingConcurrency(
    tx,
    tenantId,
    blockStart,
    blockEnd,
    excludeBookingId
  )

  return {
    allowed: peakConcurrency < maxCapacity,
    currentOverlaps: peakConcurrency,
    maxCapacity,
  }
}
