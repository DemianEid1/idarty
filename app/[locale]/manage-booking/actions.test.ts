import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Tests for customer cancellation audit logging.
 * Verifies that tenantId is correctly derived from the booking record.
 */

const logAuditCalls: Array<{ entry: any; headers?: Headers }> = []

vi.mock('@/lib/audit', () => ({
  logAudit: async (entry: any, headers?: Headers) => {
    logAuditCalls.push({ entry, headers })
  },
}))

vi.mock('@/lib/booking-capacity', () => ({
  acquireTenantBookingLock: vi.fn(async () => {}),
}))

vi.mock('@/lib/db', () => {
  const mockDb = {
    transaction: vi.fn(async (cb: any) => cb(mockDb)),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [[]]),
          })),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => [{ id: 'booking-123' }]),
        })),
      })),
    })),
  }
  return { db: mockDb }
})

vi.mock('@/lib/email/send', () => ({
  sendTransactionalEmail: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/lib/booking-manage', () => ({
  verifyBookingManageToken: vi.fn(() => 'booking-uuid-123'),
  createBookingManageToken: vi.fn(() => 'token-abc'),
}))

describe('customer cancellation audit', () => {
  beforeEach(() => {
    logAuditCalls.length = 0
  })

  it('includes tenantId derived from booking record in audit log', async () => {
    const { cancelPublicBooking } = await import('./actions')

    // Mock the db.select to return booking details with tenantId
    const { db } = await import('@/lib/db')
    const selectMock = vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [{
              email: 'customer@example.com',
              startsAt: new Date('2026-10-07T10:00:00Z'),
              locale: 'ar',
              tenantId: 'tenant-uuid-456',
            }]),
          })),
        })),
      })),
    }))
    ;(db as any).select = selectMock

    await cancelPublicBooking({
      token: 'valid-token-with-sufficient-length-for-validation',
      locale: 'ar',
    })

    expect(logAuditCalls.length).toBe(1)
    const { entry } = logAuditCalls[0]

    expect(entry.action).toBe('booking.cancelled.customer')
    expect(entry.entityId).toBe('booking-uuid-123')
    expect(entry.tenantId).toBe('tenant-uuid-456')
    expect(entry.metadata).toEqual({ reason: 'customer_request' })
  })

  it('does not trust client-provided tenantId', async () => {
    const { cancelPublicBooking } = await import('./actions')

    const { db } = await import('@/lib/db')
    const selectMock = vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [{
              email: 'customer@example.com',
              startsAt: new Date('2026-10-07T10:00:00Z'),
              locale: 'en',
              tenantId: 'tenant-from-db',
            }]),
          })),
        })),
      })),
    }))
    ;(db as any).select = selectMock

    await cancelPublicBooking({
      token: 'valid-token-with-sufficient-length-for-validation',
      locale: 'en',
    })

    // Verify tenantId comes from DB, not from client input
    expect(logAuditCalls[0].entry.tenantId).toBe('tenant-from-db')
  })
})
