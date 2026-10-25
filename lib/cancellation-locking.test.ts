import { describe, expect, it, vi } from 'vitest'
import { NodePgTransaction } from 'drizzle-orm/node-postgres'

/**
 * Locking consistency for the capacity-RELEASING status writes.
 *
 * `cancelBooking`, `markNoShow` and `cancelPublicBooking` all move a booking out
 * of `confirmed`, which frees tenant capacity. The capacity CONSUMERS (public
 * booking, manual booking, reschedule) take the tenant advisory lock before they
 * read. These three did not, so a cancellation committing inside a creation
 * transaction's window could leave that creation reading a stale-higher count
 * and rejecting a slot that was actually free.
 *
 * These tests run the REAL action code with the database, authorization, cache,
 * audit and email layers mocked — the same approach as the other action tests in
 * this repo — and assert on the ORDER of database-visible operations.
 *
 * HONEST LIMITATION: this is a mock-level contract test. It proves the lock is
 * requested, inside a transaction, BEFORE the update. It does NOT prove
 * PostgreSQL concurrency behaviour — that needs two real connections racing on a
 * real database, which is not available here. `pg_advisory_xact_lock` outside a
 * transaction is a PostgreSQL-level no-op, so only a real connection can
 * demonstrate the lock is actually held.
 */

const AUTHORIZED_TENANT = 'authorized-tenant-uuid'
const BOOKING_UUID = '11111111-2222-4333-8444-555555555555'

// Ordered log of database-visible operations, used to prove lock-before-update.
let events: string[] = []
// Arguments passed to `tx.execute` — i.e. the advisory-lock statement.
let lockArgs: unknown[] = []
let updatedRows: Array<{ id: string }> = [{ id: BOOKING_UUID }]
let selectRows: unknown[] = [
  {
    id: BOOKING_UUID,
    startsAt: new Date('2026-01-01T10:00:00.000Z'),
    locale: 'ar',
    email: null,
    tenantId: AUTHORIZED_TENANT,
  },
]

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: async () => {} }))
vi.mock('@/lib/email/send', () => ({ sendTransactionalEmail: async () => {} }))
vi.mock('@/lib/booking-manage', () => ({
  createBookingManageToken: () => 'manage-token',
  verifyBookingManageToken: () => BOOKING_UUID,
}))

// Authorization always resolves to AUTHORIZED_TENANT, regardless of the slug in
// the request. That is deliberate: it lets a test prove the lock is keyed on the
// AUTHORIZED tenant and not on anything the caller supplied.
vi.mock('@/lib/authz', () => ({
  requireTenantAccess: async () => ({
    session: { user: { id: 'user-1' } },
    tenant: { id: AUTHORIZED_TENANT, slug: 'bebo-salon' },
    membership: { role: 'manager' },
  }),
}))

/**
 * A stub that IS a real Drizzle `NodePgTransaction`, so `acquireTenantBookingLock`
 * passes its `assertTransaction` guard against the actual class rather than a
 * duck-typed object. No connection is ever opened.
 */
function makeTx() {
  const tx = new NodePgTransaction(
    { sql: (strings: TemplateStringsArray, ...params: unknown[]) => ({ strings, params }) } as never,
    {} as never,
    undefined,
  )
  ;(tx as any).execute = vi.fn(async (arg: unknown) => {
    lockArgs.push(arg)
    events.push('lock')
    return { rows: [] }
  })
  ;(tx as any).update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => {
          events.push('update')
          return updatedRows
        }),
      })),
    })),
  }))
  return tx
}

vi.mock('@/lib/db', () => ({
  db: {
    // `limit` terminates the select chain used by both cancel paths.
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(async () => selectRows) })),
        })),
      })),
    })),
    // Throwing here is the point: any status write that is NOT wrapped in
    // `db.transaction` fails the test loudly instead of silently passing.
    update: vi.fn(() => {
      throw new Error('db.update called OUTSIDE a transaction')
    }),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(makeTx())),
  },
}))

const loadDashboard = () =>
  import('@/app/[locale]/tenants/[slug]/dashboard/booking-actions')
const loadManage = () => import('@/app/[locale]/manage-booking/actions')

function reset() {
  events = []
  lockArgs = []
  updatedRows = [{ id: BOOKING_UUID }]
}

describe('capacity-releasing status writes take the tenant lock before updating', () => {
  it('cancelBooking: lock is acquired before the status update', async () => {
    const { cancelBooking } = await loadDashboard()
    reset()

    const result = await cancelBooking({ slug: 'bebo-salon', bookingId: BOOKING_UUID })

    // Order matters: the lock must precede the write, never follow it.
    expect(events).toEqual(['lock', 'update'])
    expect(result).toEqual({ ok: true })
  })

  it('markNoShow: lock is acquired before the status update', async () => {
    const { markNoShow } = await loadDashboard()
    reset()

    const result = await markNoShow({ slug: 'bebo-salon', bookingId: BOOKING_UUID })

    expect(events).toEqual(['lock', 'update'])
    expect(result).toEqual({ ok: true })
  })

  it('cancelPublicBooking: lock is acquired before the status update', async () => {
    const { cancelPublicBooking } = await loadManage()
    reset()

    const result = await cancelPublicBooking({ token: 't'.repeat(48), locale: 'ar' })

    expect(events).toEqual(['lock', 'update'])
    expect(result).toEqual({ ok: true })
  })

  it('locks on the AUTHORIZED tenant, not a caller-supplied value', async () => {
    const { cancelBooking } = await loadDashboard()
    reset()

    await cancelBooking({ slug: 'bebo-salon', bookingId: BOOKING_UUID })

    // The lock statement is a parameterised query; its bound parameter is the
    // tenant id. The request carries no tenant id at all — it is derived from
    // `requireTenantAccess`, which the mock pins to AUTHORIZED_TENANT.
    expect(JSON.stringify(lockArgs)).toContain(AUTHORIZED_TENANT)
  })

  it('cancelPublicBooking locks the tenant resolved from the verified booking', async () => {
    const { cancelPublicBooking } = await loadManage()
    reset()

    await cancelPublicBooking({ token: 't'.repeat(48), locale: 'ar' })

    expect(JSON.stringify(lockArgs)).toContain(AUTHORIZED_TENANT)
  })

  it('an inactive booking still acquires the lock and reports the existing message', async () => {
    const { cancelBooking } = await loadDashboard()
    reset()
    updatedRows = []

    const result = await cancelBooking({ slug: 'bebo-salon', bookingId: BOOKING_UUID })

    // The lock is taken regardless of whether the guarded UPDATE matches; the
    // user-facing outcome and status-guard semantics are unchanged.
    expect(events).toEqual(['lock', 'update'])
    expect(result).toEqual({ ok: false, message: 'Booking is no longer active' })
  })

  it('cancelPublicBooking returns the existing message when the booking is gone', async () => {
    const { cancelPublicBooking } = await loadManage()
    reset()
    updatedRows = []

    const result = await cancelPublicBooking({ token: 't'.repeat(48), locale: 'ar' })

    // Locale 'ar' selects the Arabic copy; the outcome and message are unchanged.
    expect(result).toEqual({ ok: false, message: 'لا يمكن إلغاء هذا الموعد.' })
  })
})
