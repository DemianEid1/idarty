import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Requirement 5 — the service delete action.
 *
 * `archiveService` is the EXISTING action, reused (not replaced). These pin its
 * real contract: soft delete only, tenant-scoped, authorized, audited, and
 * idempotent. The database, authorization and cache layers are mocked so the
 * actual action code runs.
 *
 * The hard-delete claim is verified against the real database separately (a
 * `DELETE FROM services` for a booked service is rejected by
 * `booking_items_tenant_id_service_id_fkey`); here we assert the code path.
 */

const auditCalls: Array<{ entry: any }> = []

vi.mock('@/lib/audit', () => ({
  logAudit: async (entry: any) => {
    auditCalls.push({ entry })
  },
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

const AUTHORIZED_TENANT = 'tenant-1'

let updatedRows: Array<{ id: string }> = []
let whereClause: unknown = null

const returning = vi.fn(async () => updatedRows)
const updateWhere = vi.fn((...args: unknown[]) => {
  whereClause = args[0]
  return { returning }
})
const updateSet = vi.fn((..._args: unknown[]) => ({ where: updateWhere }))
const update = vi.fn((..._args: unknown[]) => ({ set: updateSet }))

vi.mock('@/lib/db', () => ({
  db: {
    update: (...args: unknown[]) => update(...args),
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(async () => [{ value: 2 }]) })),
    })),
    query: { services: { findFirst: vi.fn(async () => null) } },
    insert: vi.fn(),
    transaction: vi.fn(),
  },
}))

vi.mock('@/lib/authz', () => ({
  requireTenantAccess: vi.fn(async (_h: Headers, slug: string, minimumRole?: string) => {
    if (slug !== 'bebo-salon') throw new Error('FORBIDDEN')
    return {
      session: { user: { id: 'user-1' } },
      tenant: { id: AUTHORIZED_TENANT, slug: 'bebo-salon' },
      membership: { role: minimumRole ?? 'manager' },
    }
  }),
}))

const SERVICE_UUID = '11111111-2222-4333-8444-555555555555'

function formData(over: Record<string, string> = {}) {
  const fd = new FormData()
  fd.set('slug', over.slug ?? 'bebo-salon')
  fd.set('locale', over.locale ?? 'ar')
  fd.set('serviceId', over.serviceId ?? SERVICE_UUID)
  return fd
}

const load = () => import('@/app/[locale]/tenants/[slug]/dashboard/actions')

describe('req 5 — archiveService (the Delete action)', () => {
  beforeEach(() => {
    auditCalls.length = 0
    updatedRows = [{ id: SERVICE_UUID }]
    whereClause = null
    update.mockClear()
    updateSet.mockClear()
    updateWhere.mockClear()
    returning.mockClear()
  })

  it('SOFT deletes: deactivates and stamps deletedAt, never hard-deletes the row', async () => {
    const { archiveService } = await load()
    const result = await archiveService(formData())

    expect(result.ok).toBe(true)
    const setArg = updateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.isActive).toBe(false)
    expect(setArg.deletedAt).toBeInstanceOf(Date)
    // No row removal anywhere.
    expect(update).toHaveBeenCalled()
  })

  it('scopes the write to the authorized tenant AND an active service', async () => {
    const { archiveService } = await load()
    await archiveService(formData())

    // Walk the where clause (Drizzle SQL holds circular refs).
    const leaves: string[] = []
    const seen = new WeakSet<object>()
    const walk = (node: unknown, depth = 0) => {
      if (depth > 8 || node === null || typeof node !== 'object') {
        if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
          leaves.push(String(node))
        }
        return
      }
      if (seen.has(node as object)) return
      seen.add(node as object)
      if (Array.isArray(node)) return node.forEach((c) => walk(c, depth + 1))
      const chunks = (node as { queryChunks?: unknown[] }).queryChunks
      if (Array.isArray(chunks)) chunks.forEach((c) => walk(c, depth + 1))
      for (const v of Object.values(node as Record<string, unknown>)) walk(v, depth + 1)
    }
    walk(whereClause)

    const joined = leaves.join('|')
    expect(joined).toContain(SERVICE_UUID)
    expect(joined).toContain(AUTHORIZED_TENANT)
    // The `isActive = true` guard makes a repeated click a no-op.
    expect(joined).toContain('true')
  })

  it('rejects an unauthorized slug before any write', async () => {
    const { archiveService } = await load()
    await expect(archiveService(formData({ slug: 'someone-elses-salon' }))).rejects.toThrow('FORBIDDEN')
    expect(update).not.toHaveBeenCalled()
  })

  it('audits a successful delete', async () => {
    const { archiveService } = await load()
    await archiveService(formData())
    const entry = auditCalls.find((c) => c.entry.action === 'service.deleted')
    expect(entry).toBeDefined()
    expect(entry!.entry.tenantId).toBe(AUTHORIZED_TENANT)
    expect(entry!.entry.entityId).toBe(SERVICE_UUID)
    expect(entry!.entry.metadata.mode).toBe('soft_delete')
  })

  it('does not audit when nothing matched (already deleted)', async () => {
    const { archiveService } = await load()
    updatedRows = [] // the guarded WHERE matched no row
    await archiveService(formData())
    expect(auditCalls.some((c) => c.entry.action === 'service.deleted')).toBe(false)
  })

  it('rejects a malformed service id', async () => {
    const { archiveService } = await load()
    await expect(archiveService(formData({ serviceId: 'not-a-uuid' }))).rejects.toThrow()
    expect(update).not.toHaveBeenCalled()
  })

  it('preserves booking history: no delete of bookings or booking_items', async () => {
    const { archiveService } = await load()
    await archiveService(formData())
    // Only a single UPDATE on services is issued.
    expect(update).toHaveBeenCalledTimes(1)
    expect(returning).toHaveBeenCalledTimes(1)
  })
})

describe('req 5 — countServiceBookings', () => {
  it('returns the booking count for the confirmation dialog', async () => {
    const { countServiceBookings } = await load()
    const result = await countServiceBookings(formData())
    expect(result.ok).toBe(true)
    expect(result.bookings).toBe(2)
  })

  it('rejects an unauthorized slug', async () => {
    const { countServiceBookings } = await load()
    await expect(countServiceBookings(formData({ slug: 'nope' }))).rejects.toThrow('FORBIDDEN')
  })
})
