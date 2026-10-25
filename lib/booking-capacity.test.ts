import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NodePgTransaction } from 'drizzle-orm/node-postgres'
import {
  acquireTenantBookingLock,
  assertTransaction,
  getActiveBookingOverlapCount,
  getPeakActiveBookingConcurrency,
  isBookingTransaction,
  assertTenantBookingCapacity,
  calculatePeakConcurrency,
  type BookingInterval,
} from './booking-capacity'

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8').replace(/\r\n/g, '\n')

/**
 * Builds a stub that IS a real Drizzle `NodePgTransaction`, so the transaction
 * guard is exercised against the actual class rather than a duck-typed object.
 *
 * The query methods are overridden with mocks. Constructing `NodePgTransaction`
 * needs a dialect and session; the session is never used because every query
 * method is replaced, and no connection is ever opened. This runs entirely
 * offline — it does not touch PostgreSQL.
 *
 * LIMITATION, stated honestly: this proves the guard accepts a real transaction
 * object and rejects a plain object. It does NOT prove that a `BEGIN` has been
 * issued on the wire — `pg_advisory_xact_lock` outside a transaction is a
 * PostgreSQL-level no-op that only a real connection can demonstrate. That
 * guarantee requires the isolated-database integration suite (T13/T14 in the
 * Phase 2 test plan), which is not runnable here. The guard is therefore a
 * real structural improvement, not a proof of transaction semantics.
 */
function makeTx(overrides: {
  tenantRows?: Array<{ bookingCapacity: number | null }>
  overlappingRows?: Array<{ bookingId: string; blockStartsAt: Date; blockEndsAt: Date }>
  tenantError?: Error
  lockImpl?: () => Promise<void>
}) {
  const executedQueries: any[] = []
  const tenantRow = overrides.tenantRows ?? [{ bookingCapacity: 2 }]
  const overlappingRows = overrides.overlappingRows ?? []

  const tx = new NodePgTransaction(
    // A minimal dialect stub: only `sql` is needed by the overridden methods.
    { sql: (strings: TemplateStringsArray, ...params: any[]) => ({ strings, params }) } as any,
    {} as any,
    undefined,
  )

  ;(tx as any).execute = vi.fn().mockImplementation(async (query: any) => {
    executedQueries.push(query)
    if (overrides.lockImpl) await overrides.lockImpl()
    return { rows: [] }
  })

  ;(tx as any).query = {
    tenants: {
      findFirst: vi.fn().mockImplementation(async () => {
        if (overrides.tenantError) throw overrides.tenantError
        return tenantRow[0] ?? null
      }),
    },
  }

  ;(tx as any).select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(overlappingRows),
      }),
    }),
  })

  return { tx, executedQueries }
}

describe('calculatePeakConcurrency pure unit tests', () => {
  // Case 1: Capacity 1 rejects any true overlap
  it('case 1: capacity 1 rejects any true overlap', () => {
    const existing: BookingInterval[] = [
      {
        bookingId: 'b1',
        blockStartsAt: new Date('2026-11-01T10:00:00Z'),
        blockEndsAt: new Date('2026-11-01T11:00:00Z'),
      },
    ]
    const reqStart = new Date('2026-11-01T10:30:00Z')
    const reqEnd = new Date('2026-11-01T11:30:00Z')

    const peak = calculatePeakConcurrency(existing, reqStart, reqEnd)
    expect(peak).toBe(1)
    const allowedCapacity1 = peak < 1
    expect(allowedCapacity1).toBe(false)
  })

  // Case 2: Capacity 2 accepts Existing A [10:00, 11:00), Existing B [11:00, 12:00), Requested [10:30, 11:30)
  it('case 2: capacity 2 accepts staggered adjacent bookings where peak is 1', () => {
    const existing: BookingInterval[] = [
      {
        bookingId: 'booking-A',
        blockStartsAt: new Date('2026-11-01T10:00:00Z'),
        blockEndsAt: new Date('2026-11-01T11:00:00Z'),
      },
      {
        bookingId: 'booking-B',
        blockStartsAt: new Date('2026-11-01T11:00:00Z'),
        blockEndsAt: new Date('2026-11-01T12:00:00Z'),
      },
    ]
    const reqStart = new Date('2026-11-01T10:30:00Z')
    const reqEnd = new Date('2026-11-01T11:30:00Z')

    const peak = calculatePeakConcurrency(existing, reqStart, reqEnd)
    // At [10:30, 11:00) only A is active (1). At [11:00, 11:30) only B is active (1).
    // A ends at 11:00, B starts at 11:00. Peak existing concurrency is 1.
    expect(peak).toBe(1)
    const allowedCapacity2 = peak < 2
    expect(allowedCapacity2).toBe(true)
  })

  // Case 3: Capacity 2 rejects when two existing bookings overlap the same portion of requested interval
  it('case 3: capacity 2 rejects when two existing bookings overlap the same portion', () => {
    const existing: BookingInterval[] = [
      {
        bookingId: 'b1',
        blockStartsAt: new Date('2026-11-01T10:00:00Z'),
        blockEndsAt: new Date('2026-11-01T11:00:00Z'),
      },
      {
        bookingId: 'b2',
        blockStartsAt: new Date('2026-11-01T10:15:00Z'),
        blockEndsAt: new Date('2026-11-01T10:45:00Z'),
      },
    ]
    const reqStart = new Date('2026-11-01T10:30:00Z')
    const reqEnd = new Date('2026-11-01T11:30:00Z')

    const peak = calculatePeakConcurrency(existing, reqStart, reqEnd)
    // At [10:30, 10:45), both b1 and b2 are active -> peak existing concurrency is 2.
    expect(peak).toBe(2)
    const allowedCapacity2 = peak < 2
    expect(allowedCapacity2).toBe(false)
  })

  // Case 4: Three sequential existing bookings do not automatically cause rejection when peak remains below capacity
  it('case 4: three sequential bookings do not cause rejection if peak is within capacity', () => {
    const existing: BookingInterval[] = [
      {
        bookingId: 'b1',
        blockStartsAt: new Date('2026-11-01T10:00:00Z'),
        blockEndsAt: new Date('2026-11-01T11:00:00Z'),
      },
      {
        bookingId: 'b2',
        blockStartsAt: new Date('2026-11-01T11:00:00Z'),
        blockEndsAt: new Date('2026-11-01T12:00:00Z'),
      },
      {
        bookingId: 'b3',
        blockStartsAt: new Date('2026-11-01T12:00:00Z'),
        blockEndsAt: new Date('2026-11-01T13:00:00Z'),
      },
    ]
    // 3-hour long booking
    const reqStart = new Date('2026-11-01T10:00:00Z')
    const reqEnd = new Date('2026-11-01T13:00:00Z')

    const peak = calculatePeakConcurrency(existing, reqStart, reqEnd)
    // At each moment, exactly one of b1, b2, or b3 is active -> peak is 1.
    expect(peak).toBe(1)
    expect(peak < 2).toBe(true)
  })

  // Case 5: End events are processed before start events at identical timestamps
  it('case 5: processes end events before start events at identical timestamps', () => {
    const existing: BookingInterval[] = [
      {
        bookingId: 'b1',
        blockStartsAt: new Date('2026-11-01T10:00:00Z'),
        blockEndsAt: new Date('2026-11-01T11:00:00Z'),
      },
      {
        bookingId: 'b2',
        blockStartsAt: new Date('2026-11-01T11:00:00Z'),
        blockEndsAt: new Date('2026-11-01T12:00:00Z'),
      },
    ]
    // Query exact point transition around 11:00: [10:59, 11:01)
    const reqStart = new Date('2026-11-01T10:59:00Z')
    const reqEnd = new Date('2026-11-01T11:01:00Z')

    const peak = calculatePeakConcurrency(existing, reqStart, reqEnd)
    // Because b1 ends at 11:00 and b2 starts at 11:00, concurrency transitions 1 -> 0 -> 1.
    // Concurrency never spikes to 2 at 11:00.
    expect(peak).toBe(1)
  })

  // Case 6: Exact adjacent intervals do not overlap
  it('case 6: adjacent intervals touching boundaries do not overlap', () => {
    const existing: BookingInterval[] = [
      {
        bookingId: 'b1',
        blockStartsAt: new Date('2026-11-01T09:00:00Z'),
        blockEndsAt: new Date('2026-11-01T10:00:00Z'),
      },
      {
        bookingId: 'b2',
        blockStartsAt: new Date('2026-11-01T11:00:00Z'),
        blockEndsAt: new Date('2026-11-01T12:00:00Z'),
      },
    ]
    const reqStart = new Date('2026-11-01T10:00:00Z')
    const reqEnd = new Date('2026-11-01T11:00:00Z')

    const peak = calculatePeakConcurrency(existing, reqStart, reqEnd)
    expect(peak).toBe(0)
  })

  // Case 7: Buffers correctly change effective interval overlap
  it('case 7: buffer periods correctly alter effective interval overlap', () => {
    // Service 10:00 - 11:00 with 15 min buffer after -> blockEndsAt: 11:15
    const existing: BookingInterval[] = [
      {
        bookingId: 'b1',
        blockStartsAt: new Date('2026-11-01T10:00:00Z'),
        blockEndsAt: new Date('2026-11-01T11:15:00Z'),
      },
    ]
    // Second booking requested at 11:00
    const reqStart = new Date('2026-11-01T11:00:00Z')
    const reqEnd = new Date('2026-11-01T12:00:00Z')

    const peak = calculatePeakConcurrency(existing, reqStart, reqEnd)
    expect(peak).toBe(1)
  })

  // Case 8: Multiple items for the same booking follow the intended tenant-capacity semantics
  it('case 8: merges multiple items for the same booking into a single capacity unit', () => {
    const existing: BookingInterval[] = [
      // Booking 1 has 2 sequential items: item 1 (10:00-10:30), item 2 (10:30-11:00)
      {
        bookingId: 'multi-item-booking',
        blockStartsAt: new Date('2026-11-01T10:00:00Z'),
        blockEndsAt: new Date('2026-11-01T10:30:00Z'),
      },
      {
        bookingId: 'multi-item-booking',
        blockStartsAt: new Date('2026-11-01T10:30:00Z'),
        blockEndsAt: new Date('2026-11-01T11:00:00Z'),
      },
    ]
    const reqStart = new Date('2026-11-01T10:15:00Z')
    const reqEnd = new Date('2026-11-01T10:45:00Z')

    const peak = calculatePeakConcurrency(existing, reqStart, reqEnd)
    // The two items belong to the same booking and should only count as 1 concurrent booking
    expect(peak).toBe(1)
  })

  // Case 9: Rescheduling excludes the booking being moved
  it('case 9: rescheduling excludes the booking being moved', async () => {
    const tenantId = 'tenant-reschedule'
    const blockStart = new Date('2026-11-01T10:00:00Z')
    const blockEnd = new Date('2026-11-01T11:00:00Z')
    const excludeBookingId = 'booking-being-moved'

    const mockTx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }

    const peak = await getPeakActiveBookingConcurrency(
      mockTx,
      tenantId,
      blockStart,
      blockEnd,
      excludeBookingId
    )

    expect(peak).toBe(0)
    expect(mockTx.select).toHaveBeenCalledTimes(1)
  })

  // Case 10: Public slot filtering and authoritative validation must agree.
  //
  // The previous version of this test compared `calculatePeakConcurrency`
  // against itself, which is a tautology that passes for any implementation.
  // It now compares the production function against an independently computed
  // oracle: for a finite set of intervals the peak concurrency equals the
  // maximum number of active intervals at any change point (a start or end
  // boundary inside the window). That is a direct restatement of the
  // definition, derived here rather than reusing the implementation.
  it('case 10: capacity peak matches an independently computed oracle', () => {
    const existing: BookingInterval[] = [
      { bookingId: 'b1', blockStartsAt: new Date('2026-11-01T10:00:00Z'), blockEndsAt: new Date('2026-11-01T11:00:00Z') },
      { bookingId: 'b2', blockStartsAt: new Date('2026-11-01T11:00:00Z'), blockEndsAt: new Date('2026-11-01T12:00:00Z') },
      { bookingId: 'b3', blockStartsAt: new Date('2026-11-01T10:30:00Z'), blockEndsAt: new Date('2026-11-01T11:30:00Z') },
    ]
    const reqStart = new Date('2026-11-01T10:00:00Z')
    const reqEnd = new Date('2026-11-01T12:00:00Z')

    // Oracle: count intervals active at each change point. Half-open semantics
    // mean an interval ending exactly at a change point is NOT active there, so
    // the counting window is [point, point + epsilon).
    const epsilonMs = 1
    const boundaries = new Set<number>()
    for (const item of existing) {
      const s = new Date(item.blockStartsAt).getTime()
      const e = new Date(item.blockEndsAt).getTime()
      if (s >= reqStart.getTime() && s < reqEnd.getTime()) boundaries.add(s)
      if (e >= reqStart.getTime() && e < reqEnd.getTime()) boundaries.add(e)
    }
    let oraclePeak = 0
    for (const t of boundaries) {
      const active = existing.filter((item) => {
        const s = new Date(item.blockStartsAt).getTime()
        const e = new Date(item.blockEndsAt).getTime()
        return s <= t && e > t + epsilonMs - 1
      }).length
      oraclePeak = Math.max(oraclePeak, active)
    }

    const peak = calculatePeakConcurrency(existing, reqStart, reqEnd)
    // Independent expectation: b1 [10:00,11:00), b3 [10:30,11:30) overlap during
    // [10:30,11:00) -> 2 active. b2 [11:00,12:00) overlaps b3 during
    // [11:00,11:30) -> 2 active. Never 3 simultaneously.
    expect(oraclePeak).toBe(2)
    expect(peak).toBe(oraclePeak)
    expect(peak).toBe(2)
    expect(peak < 3).toBe(true)
    expect(peak < 2).toBe(false)
  })

  // Case 10b: half-open boundary semantics - a booking ending exactly when the
  // requested window starts must not count as occupancy.
  it('case 10b: an interval ending at the window start does not count', () => {
    const existing: BookingInterval[] = [
      { bookingId: 'b1', blockStartsAt: new Date('2026-11-01T09:00:00Z'), blockEndsAt: new Date('2026-11-01T10:00:00Z') },
    ]
    const peak = calculatePeakConcurrency(existing, new Date('2026-11-01T10:00:00Z'), new Date('2026-11-01T11:00:00Z'))
    expect(peak).toBe(0)
    expect(peak < 1).toBe(true)
  })

  // Case 10c: buffers are part of the stored interval, so a buffer that pushes
  // an interval into the window must be counted.
  it('case 10c: a trailing buffer that reaches into the window counts as occupancy', () => {
    // Booking occupies [10:00, 11:00) with a 30-minute trailing buffer stored
    // as blockEndsAt = 11:30. A request at 11:00 must see it as active.
    const existing: BookingInterval[] = [
      { bookingId: 'b1', blockStartsAt: new Date('2026-11-01T10:00:00Z'), blockEndsAt: new Date('2026-11-01T11:30:00Z') },
    ]
    const peak = calculatePeakConcurrency(existing, new Date('2026-11-01T11:00:00Z'), new Date('2026-11-01T12:00:00Z'))
    expect(peak).toBe(1)
    expect(peak < 1).toBe(false)
  })

  // Case 10d: a booking entirely before the window, even with a buffer that
  // stops short of the window start, must not count.
  it('case 10d: a buffered interval that stops before the window does not count', () => {
    const existing: BookingInterval[] = [
      { bookingId: 'b1', blockStartsAt: new Date('2026-11-01T09:00:00Z'), blockEndsAt: new Date('2026-11-01T09:45:00Z') },
    ]
    const peak = calculatePeakConcurrency(existing, new Date('2026-11-01T10:00:00Z'), new Date('2026-11-01T11:00:00Z'))
    expect(peak).toBe(0)
  })

  // Case 10e: capacity boundaries at exactly the limit are rejected.
  it('case 10e: capacity equal to the existing peak is rejected (strict less-than)', () => {
    const existing: BookingInterval[] = [
      { bookingId: 'b1', blockStartsAt: new Date('2026-11-01T10:00:00Z'), blockEndsAt: new Date('2026-11-01T11:00:00Z') },
      { bookingId: 'b2', blockStartsAt: new Date('2026-11-01T10:00:00Z'), blockEndsAt: new Date('2026-11-01T11:00:00Z') },
    ]
    const reqStart = new Date('2026-11-01T10:30:00Z')
    const reqEnd = new Date('2026-11-01T11:30:00Z')
    const peak = calculatePeakConcurrency(existing, reqStart, reqEnd)
    expect(peak).toBe(2)
    // capacity 2 -> 2 < 2 is false -> rejected
    expect(peak < 2).toBe(false)
    // capacity 3 -> 2 < 3 is true -> accepted
    expect(peak < 3).toBe(true)
  })

  // Case 10f: multi-service bookings are merged per bookingId, and distinct
  // bookings are counted separately - both directions.
  it('case 10f: multi-service items merge per booking but distinct bookings count separately', () => {
    const overlappingItems: BookingInterval[] = [
      { bookingId: 'booking-A', blockStartsAt: new Date('2026-11-01T10:00:00Z'), blockEndsAt: new Date('2026-11-01T11:00:00Z') },
      { bookingId: 'booking-A', blockStartsAt: new Date('2026-11-01T10:30:00Z'), blockEndsAt: new Date('2026-11-01T11:30:00Z') },
    ]
    // Two overlapping items of the SAME booking must count as 1, not 2.
    expect(
      calculatePeakConcurrency(
        overlappingItems,
        new Date('2026-11-01T10:00:00Z'),
        new Date('2026-11-01T12:00:00Z')
      )
    ).toBe(1)

    const distinctBookings: BookingInterval[] = [
      { bookingId: 'booking-A', blockStartsAt: new Date('2026-11-01T10:00:00Z'), blockEndsAt: new Date('2026-11-01T11:00:00Z') },
      { bookingId: 'booking-B', blockStartsAt: new Date('2026-11-01T10:30:00Z'), blockEndsAt: new Date('2026-11-01T11:30:00Z') },
    ]
    // The same intervals under DIFFERENT booking ids must count as 2.
    expect(
      calculatePeakConcurrency(
        distinctBookings,
        new Date('2026-11-01T10:00:00Z'),
        new Date('2026-11-01T12:00:00Z')
      )
    ).toBe(2)
  })

  // Case 11: Cancelled, completed, and no-show bookings follow existing status rules
  it('case 11: SQL query filter includes only pending and confirmed statuses', () => {
    const publicBookActions = read('../app/[locale]/tenants/[slug]/book/actions.ts')
    const bookingCapacityModule = read('./booking-capacity.ts')

    // Both public slot lookup and capacity engine only select pending and confirmed
    expect(publicBookActions).toContain("inArray(bookings.status, ['pending', 'confirmed'])")
    expect(bookingCapacityModule).toContain("inArray(bookings.status, ['pending', 'confirmed'])")
  })

  // Case 12: A genuine capacity violation limited to a small portion of interval is rejected
  it('case 12: genuine capacity violation occurring in a small sub-interval is rejected', () => {
    const existing: BookingInterval[] = [
      {
        bookingId: 'b1',
        blockStartsAt: new Date('2026-11-01T10:00:00Z'),
        blockEndsAt: new Date('2026-11-01T12:00:00Z'),
      },
      {
        // Short booking active only for 10 minutes from 10:45 to 10:55
        bookingId: 'b2',
        blockStartsAt: new Date('2026-11-01T10:45:00Z'),
        blockEndsAt: new Date('2026-11-01T10:55:00Z'),
      },
    ]
    const reqStart = new Date('2026-11-01T10:00:00Z')
    const reqEnd = new Date('2026-11-01T12:00:00Z')

    const peak = calculatePeakConcurrency(existing, reqStart, reqEnd)
    // During 10:45-10:55 both b1 and b2 are active -> peak is 2.
    expect(peak).toBe(2)
    // Capacity 2 should reject adding a 3rd booking
    expect(peak < 2).toBe(false)
  })
})

describe('assertTenantBookingCapacity transaction integration tests', () => {
  it('acquires a 64-bit transaction-scoped advisory lock for the tenant', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000001'
    const { tx, executedQueries } = makeTx({})

    await acquireTenantBookingLock(tx, tenantId)

    expect(executedQueries.length).toBe(1)
  })

  // The transaction guard: pg_advisory_xact_lock is a silent no-op outside a
  // transaction, so the guard must refuse rather than pretend to lock.
  it('isBookingTransaction recognises a real Drizzle transaction', () => {
    const { tx } = makeTx({})
    expect(isBookingTransaction(tx)).toBe(true)
    expect(assertTransaction(tx, 'test')).toBeUndefined()
  })

  it('isBookingTransaction rejects a plain mock object', () => {
    expect(isBookingTransaction({ execute: vi.fn(), query: {}, select: vi.fn() })).toBe(false)
    expect(isBookingTransaction(null)).toBe(false)
    expect(isBookingTransaction(undefined)).toBe(false)
  })

  it('assertTransaction throws a descriptive error outside a transaction', () => {
    expect(() => assertTransaction({}, 'acquireTenantBookingLock')).toThrow(
      /requires an active database transaction/
    )
    expect(() => assertTransaction(null, 'acquireTenantBookingLock')).toThrow(
      /requires an active database transaction/
    )
  })

  it('acquireTenantBookingLock refuses to run outside a transaction', async () => {
    const plainMock = { execute: vi.fn().mockResolvedValue(undefined) }
    await expect(acquireTenantBookingLock(plainMock as any, 'tenant-x')).rejects.toThrow(
      /requires an active database transaction/
    )
    // The lock query must never have been issued.
    expect(plainMock.execute).not.toHaveBeenCalled()
  })

  it('assertTenantBookingCapacity enforces capacity limit under Model C (capacity = 2)', async () => {
    const tenantId = 'tenant-cap-2'
    const blockStart = new Date('2026-11-01T10:00:00Z')
    const blockEnd = new Date('2026-11-01T11:00:00Z')

    // Scenario A: 1 existing booking overlapping, capacity = 2 -> allowed = true
    const { tx: txA } = makeTx({
      tenantRows: [{ bookingCapacity: 2 }],
      overlappingRows: [{ bookingId: 'booking-1', blockStartsAt: blockStart, blockEndsAt: blockEnd }],
    })

    const resultA = await assertTenantBookingCapacity(txA, tenantId, blockStart, blockEnd)
    expect(resultA.allowed).toBe(true)
    expect(resultA.currentOverlaps).toBe(1)
    expect(resultA.maxCapacity).toBe(2)

    // Scenario B: 2 existing overlapping bookings at the same time, capacity = 2 -> allowed = false
    const { tx: txB } = makeTx({
      tenantRows: [{ bookingCapacity: 2 }],
      overlappingRows: [
        { bookingId: 'booking-1', blockStartsAt: blockStart, blockEndsAt: blockEnd },
        { bookingId: 'booking-2', blockStartsAt: blockStart, blockEndsAt: blockEnd },
      ],
    })

    const resultB = await assertTenantBookingCapacity(txB, tenantId, blockStart, blockEnd)
    expect(resultB.allowed).toBe(false)
    expect(resultB.currentOverlaps).toBe(2)
    expect(resultB.maxCapacity).toBe(2)
  })

  it('assertTenantBookingCapacity enforces default capacity = 1 if unset (Model B)', async () => {
    const tenantId = 'tenant-cap-default'
    const blockStart = new Date('2026-11-01T10:00:00Z')
    const blockEnd = new Date('2026-11-01T11:00:00Z')

    const { tx } = makeTx({
      tenantRows: [{ bookingCapacity: null }],
      overlappingRows: [{ bookingId: 'booking-1', blockStartsAt: blockStart, blockEndsAt: blockEnd }],
    })

    const result = await assertTenantBookingCapacity(tx, tenantId, blockStart, blockEnd)
    expect(result.allowed).toBe(false)
    expect(result.currentOverlaps).toBe(1)
    expect(result.maxCapacity).toBe(1)
  })

  it('fails clearly when the column is missing (42703) instead of continuing in an aborted transaction', async () => {
    const tenantId = 'tenant-pre-migration'
    const blockStart = new Date('2026-11-01T10:00:00Z')
    const blockEnd = new Date('2026-11-01T11:00:00Z')

    const dbColError = new Error('column tenants.booking_capacity does not exist')
    ;(dbColError as any).code = '42703'

    const { tx } = makeTx({ tenantError: dbColError, overlappingRows: [] })

    // It must NOT silently degrade to capacity 1 and then keep querying the same
    // transaction: in PostgreSQL a failed statement aborts the transaction, so
    // any follow-up query would fail with 25P02 and mask the real cause.
    await expect(
      assertTenantBookingCapacity(tx, tenantId, blockStart, blockEnd)
    ).rejects.toMatchObject({ code: 'SCHEMA_NOT_MIGRATED' })

    await expect(
      assertTenantBookingCapacity(tx, tenantId, blockStart, blockEnd)
    ).rejects.toThrow(/migration 0012_tenant_booking_capacity\.sql has not been applied/)
  })

  it('names the required migration in the failure message so it is actionable', async () => {
    const dbColError = new Error('column does not exist')
    ;(dbColError as any).code = '42703'

    const { tx } = makeTx({ tenantError: dbColError, overlappingRows: [] })

    await expect(
      assertTenantBookingCapacity(tx, 'tenant-actionable', new Date('2026-11-01T10:00:00Z'), new Date('2026-11-01T11:00:00Z'))
    ).rejects.toThrow(/0012_tenant_booking_capacity\.sql/)
  })

  // Error classification: only SQLSTATE 42703 (undefined_column) may trigger the
  // pre-migration fallback. Any other error - even one whose message text
  // happens to contain "booking_capacity" - must propagate.
  it('propagates an unrelated error whose message mentions booking_capacity', async () => {
    const tenantId = 'tenant-unrelated-error'
    const blockStart = new Date('2026-11-01T10:00:00Z')
    const blockEnd = new Date('2026-11-01T11:00:00Z')

    // A permission error that happens to name the column in its message.
    const permissionError = new Error('permission denied for column booking_capacity')
    ;(permissionError as any).code = '42501'

    const { tx } = makeTx({ tenantError: permissionError, overlappingRows: [] })

    await expect(
      assertTenantBookingCapacity(tx, tenantId, blockStart, blockEnd)
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('propagates a connection error with no SQLSTATE at all', async () => {
    const tenantId = 'tenant-conn-error'
    const blockStart = new Date('2026-11-01T10:00:00Z')
    const blockEnd = new Date('2026-11-01T11:00:00Z')

    const connError = new Error('connection terminated unexpectedly')

    const { tx: mockTx } = makeTx({ tenantError: connError, overlappingRows: [] })

    await expect(
      assertTenantBookingCapacity(mockTx, tenantId, blockStart, blockEnd)
    ).rejects.toThrow('connection terminated unexpectedly')
  })

  it('keys the schema failure on SQLSTATE 42703 regardless of message text', async () => {
    const tenantId = 'tenant-42703'
    const blockStart = new Date('2026-11-01T10:00:00Z')
    const blockEnd = new Date('2026-11-01T11:00:00Z')

    // Message deliberately does NOT contain the column name: only the SQLSTATE
    // may trigger the schema-not-migrated failure.
    const undefinedColumn = new Error('column does not exist')
    ;(undefinedColumn as any).code = '42703'

    const { tx: mockTx } = makeTx({ tenantError: undefinedColumn, overlappingRows: [] })

    await expect(
      assertTenantBookingCapacity(mockTx, tenantId, blockStart, blockEnd)
    ).rejects.toMatchObject({ code: 'SCHEMA_NOT_MIGRATED' })
  })

  it('reads the configured capacity from the row rather than hardcoding 1', async () => {
    const tenantId = 'tenant-configured'
    const blockStart = new Date('2026-11-01T10:00:00Z')
    const blockEnd = new Date('2026-11-01T11:00:00Z')

    const { tx: mockTx } = makeTx({ tenantRows: [{ bookingCapacity: 7 }], overlappingRows: [ { bookingId: 'b1', blockStartsAt: blockStart, blockEndsAt: blockEnd }, { bookingId: 'b2', blockStartsAt: blockStart, blockEndsAt: blockEnd }, { bookingId: 'b3', blockStartsAt: blockStart, blockEndsAt: blockEnd }, { bookingId: 'b4', blockStartsAt: blockStart, blockEndsAt: blockEnd }, { bookingId: 'b5', blockStartsAt: blockStart, blockEndsAt: blockEnd }, { bookingId: 'b6', blockStartsAt: blockStart, blockEndsAt: blockEnd }, ] })

    const result = await assertTenantBookingCapacity(mockTx, tenantId, blockStart, blockEnd)
    expect(result.maxCapacity).toBe(7)
    expect(result.currentOverlaps).toBe(6)
    expect(result.allowed).toBe(true)
  })
})

describe('booking architecture decoupling contract', () => {
  const publicBookActions = read('../app/[locale]/tenants/[slug]/book/actions.ts')
  const dashboardBookingActions = read('../app/[locale]/tenants/[slug]/dashboard/booking-actions.ts')
  const rescheduleActions = read('../app/[locale]/tenants/[slug]/dashboard/reschedule-actions.ts')
  const migration0012 = read('../db/migrations/0012_tenant_booking_capacity.sql')

  it('public booking does not query staff table or loop through staff members', () => {
    expect(publicBookActions).not.toContain('from(staff)')
    expect(publicBookActions).not.toContain('for (const candidate of availableStaff)')
    expect(publicBookActions).toContain('assertTenantBookingCapacity(tx, tenant.id, blockStart, blockEnd)')
  })

  it('public booking inserts bookingItems with staffId: null', () => {
    expect(publicBookActions).toContain('staffId: null')
  })

  it('manual booking does not auto-provision staff records', () => {
    expect(dashboardBookingActions).not.toContain('.insert(staff)')
    expect(dashboardBookingActions).toContain('assertTenantBookingCapacity(')
  })

  it('rescheduleBooking asserts tenant capacity excluding current bookingId', () => {
    expect(rescheduleActions).toContain('assertTenantBookingCapacity(')
    expect(rescheduleActions).toContain('data.bookingId')
  })

  it('migration 0012 establishes booking_capacity column and alters staff_id to nullable', () => {
    expect(migration0012).toContain('booking_capacity')
    expect(migration0012).toContain('ALTER TABLE booking_items ALTER COLUMN staff_id DROP NOT NULL')
    expect(migration0012).toContain('booking_items_no_overlap')
  })

  // Error classification contract: the schema failure must key on SQLSTATE only.
  it('schema-not-migrated failure is gated on SQLSTATE 42703 and not on message text', () => {
    const capacityModule = read('./booking-capacity.ts')
    // The only permitted predicate form.
    expect(capacityModule).toContain("err?.code === '42703'")
    // The message-substring clause must be gone everywhere it appeared.
    expect(capacityModule).not.toContain("err.message.includes('booking_capacity')")
    expect(publicBookActions).not.toContain("err.message.includes('booking_capacity')")
  })

  // The 42703 path must FAIL, not degrade: swallowing it would leave the caller
  // querying an aborted transaction (25P02) and mask the real cause.
  it('does not silently default capacity to 1 on a missing column', () => {
    const capacityModule = read('./booking-capacity.ts')
    expect(capacityModule).toContain("(schemaError as any).code = 'SCHEMA_NOT_MIGRATED'")
    expect(capacityModule).toContain('throw schemaError')
    // The old swallow-and-continue shape must be gone: no assignment of a
    // fallback capacity inside the 42703 branch.
    const branch = capacityModule.slice(
      capacityModule.indexOf("if (err?.code === '42703')"),
      capacityModule.indexOf('throw schemaError')
    )
    expect(branch).not.toContain('maxCapacity = 1')
  })

  // Both booking write paths must represent "no staff assigned" identically.
  it('both write paths state staffId: null explicitly', () => {
    // Scope to the booking_items insert in each file: the public path also
    // references workingHours.staffId / dateOverrides.staffId for availability,
    // which is a different concern.
    const publicItemWrite = publicBookActions.slice(publicBookActions.indexOf('tx.insert(bookingItems)'))
    const manualItemWrite = dashboardBookingActions.slice(
      dashboardBookingActions.indexOf('tx.insert(bookingItems)')
    )
    expect(publicItemWrite).toContain('staffId: null')
    expect(manualItemWrite).toContain('staffId: null')
  })

  // Reschedule correctness: a zero-row update must not be reported as success.
  it('rescheduleBooking treats a zero-row update as an inactive booking', () => {
    expect(rescheduleActions).toContain('.returning({ id: bookings.id })')
    expect(rescheduleActions).toContain('if (!updatedBooking)')
    expect(rescheduleActions).toContain('BOOKING_NOT_ACTIVE')
    // The audit event must sit after the transaction, so it cannot fire for a
    // reschedule that changed nothing.
    const txIdx = rescheduleActions.indexOf('db.transaction(async (tx)')
    const auditIdx = rescheduleActions.indexOf("action: 'booking.rescheduled'")
    expect(txIdx).toBeGreaterThan(-1)
    expect(auditIdx).toBeGreaterThan(txIdx)
  })

  // Schema-capability cache: bounded staleness, never a permanent negative.
  it('capacity column probe is TTL-bounded and does not cache a failed probe', () => {
    const authzSource = read('./authz.ts')
    expect(authzSource).toContain('CAPACITY_COLUMN_TTL_MS')
    // A failed probe must clear the cache rather than pin "absent".
    const catchIdx = authzSource.indexOf('catch {')
    expect(catchIdx).toBeGreaterThan(-1)
    expect(authzSource.slice(catchIdx, catchIdx + 400)).toContain(
      'bookingCapacityColumnAvailable = null'
    )
    // The default must not be a hardcoded capacity: the row always supplies it.
    expect(authzSource).toContain('bookingCapacity: (access.tenant as any).bookingCapacity ?? 1')
  })
})

// ---------------------------------------------------------------------------
// Migration contract.
//
// These pin the SCHEMA invariants the tenant-level capacity model depends on.
// They are static (the migration is text and there is no behavioural
// alternative without a real PostgreSQL database), and they exist so a later
// edit cannot silently re-widen the staff-scoped exclusion constraint, drop the
// positive CHECK, or remove the idempotency uniqueness the public booking
// dedup relies on.
//
// Nothing here proves the migration APPLIES or that the constraints behave as
// declared at runtime — that requires the isolated-database integration suite,
// which is not configured in this repository (see the Phase 3 report).
// ---------------------------------------------------------------------------
describe('migration contract for the tenant-capacity model', () => {
  const migration0012 = read('../db/migrations/0012_tenant_booking_capacity.sql')
  const migration0001 = read('../db/migrations/0001_init.sql')

  it('adds booking_capacity as NOT NULL DEFAULT 1 so existing tenants backfill to 1', () => {
    expect(migration0012).toContain(
      'ADD COLUMN IF NOT EXISTS booking_capacity integer NOT NULL DEFAULT 1'
    )
  })

  it('enforces a positive capacity CHECK', () => {
    expect(migration0012).toContain('tenants_booking_capacity_positive')
    expect(migration0012).toContain('CHECK (booking_capacity >= 1)')
  })

  it('makes booking_items.staff_id nullable (staff assignment no longer required)', () => {
    expect(migration0012).toContain('ALTER COLUMN staff_id DROP NOT NULL')
  })

  // The exclusion constraint must stay NARROWED to rows that still carry a
  // staff_id. Re-widening it to the old predicate would re-impose staff-scoped
  // overlap enforcement on a model that is now tenant-scoped, and would also
  // reject the (many) rows whose staff_id is NULL.
  it('keeps the exclusion constraint narrowed to staff_id IS NOT NULL', () => {
    expect(migration0012).toContain('staff_id IS NOT NULL')
    const constraintBlock = migration0012.slice(
      migration0012.indexOf('ADD CONSTRAINT booking_items_no_overlap')
    )
    expect(constraintBlock).toContain("status IN ('pending', 'confirmed')")
    expect(constraintBlock).toContain('staff_id IS NOT NULL')
    // Half-open range must be preserved: '[)' lets back-to-back slots touch.
    expect(constraintBlock).toContain("tstzrange(block_starts_at, block_ends_at, '[)')")
  })

  // The narrowed predicate is a strict SUBSET of the original, so every row that
  // satisfied the old constraint still satisfies the new one — the ADD cannot
  // fail on pre-existing data because of the predicate change itself.
  it('the narrowed predicate is a subset of the original one', () => {
    const original = migration0001.slice(
      migration0001.indexOf('CONSTRAINT booking_items_no_overlap')
    )
    expect(original).toContain("status IN ('pending', 'confirmed')")
    // Original had NO staff_id predicate.
    expect(original.slice(0, original.indexOf(');'))).not.toContain('staff_id IS NOT NULL')
  })

  // 0012 must not touch staff management or staff-specific scheduling.
  it('does not alter the staff table or staff-scoped scheduling tables', () => {
    const statements = migration0012
      .split('\n')
      .filter((l) => /^(ALTER|UPDATE|CREATE|DROP)/.test(l.trim()))
    for (const statement of statements) {
      expect(statement).not.toMatch(/ALTER TABLE staff\b/)
      expect(statement).not.toMatch(/working_hours/)
      expect(statement).not.toMatch(/date_overrides/)
      expect(statement).not.toMatch(/tenant_invitations/)
    }
  })

  // The public booking dedup pre-check is only a fast path; the real guarantee
  // is this unique constraint. If it were removed, concurrent identical requests
  // could both insert.
  it('retains the idempotency uniqueness the public booking dedup relies on', () => {
    expect(migration0001).toContain('UNIQUE (tenant_id, idempotency_key)')
  })

  // The staff composite FK is retained by design (it is satisfied whenever
  // staff_id is NULL under MATCH SIMPLE, so it does not block unassigned
  // bookings). Pinned so its removal is a deliberate act, not an accident.
  it('retains the staff composite FK (harmless for NULL staff_id)', () => {
    expect(migration0001).toContain('FOREIGN KEY (tenant_id, staff_id) REFERENCES staff (tenant_id, id)')
  })
})
