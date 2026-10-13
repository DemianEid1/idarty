import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Service image CROP server-action behaviour.
 *
 * Replaces the previous focal-point suite: the single-point control was
 * superseded by the cropper, so these assert the crop contract instead
 * (persistence, losslessness, authorization, tenant isolation, validation).
 *
 * The database, authorization, audit and cache layers are mocked, following the
 * pattern in publish-actions.test.ts, so the REAL action code runs.
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

let serviceRow: Record<string, unknown> | null = null
let lookupFilter: unknown = null

const updateWhere = vi.fn(async () => undefined)
const updateSet = vi.fn((..._args: unknown[]) => ({ where: updateWhere }))
const update = vi.fn((..._args: unknown[]) => ({ set: updateSet }))

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      services: {
        findFirst: vi.fn(async (args: { where?: unknown }) => {
          lookupFilter = args?.where
          return serviceRow
        }),
      },
    },
    update: (...args: unknown[]) => update(...args),
    insert: vi.fn(),
    transaction: vi.fn(),
  },
}))

vi.mock('@/lib/authz', () => ({
  requireTenantAccess: vi.fn(async (_h: Headers, _slug: string, minimumRole?: string) => {
    if (_slug !== 'bebo-salon') throw new Error('FORBIDDEN')
    return {
      session: { user: { id: 'user-1' } },
      tenant: { id: AUTHORIZED_TENANT, slug: 'bebo-salon' },
      membership: { role: minimumRole ?? 'manager' },
    }
  }),
}))

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const SERVICE_UUID = '11111111-2222-4333-8444-555555555555'

const load = () => import('@/app/[locale]/tenants/[slug]/dashboard/service-image-actions')

describe('saveServiceImageCrop', () => {
  beforeEach(() => {
    auditCalls.length = 0
    serviceRow = null
    lookupFilter = null
    update.mockClear()
    updateSet.mockClear()
    updateWhere.mockClear()
  })

  it('persists a crop WITHOUT touching the stored image', async () => {
    const { saveServiceImageCrop } = await load()
    serviceRow = { id: SERVICE_UUID, tenantId: AUTHORIZED_TENANT, image: PNG_DATA_URL }

    const result = await saveServiceImageCrop({
      slug: 'bebo-salon',
      locale: 'ar',
      serviceId: SERVICE_UUID,
      crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
    })

    expect(result.ok).toBe(true)
    const setArg = updateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.imageCropX).toBe('0.1000')
    expect(setArg.imageCropY).toBe('0.2000')
    expect(setArg.imageCropWidth).toBe('0.5000')
    expect(setArg.imageCropHeight).toBe('0.6000')
    // The image data must NOT be rewritten — no re-encode, no destructive crop.
    expect(setArg).not.toHaveProperty('image')
  })

  it('mirrors the crop centre into the legacy focal columns', async () => {
    const { saveServiceImageCrop } = await load()
    serviceRow = { id: SERVICE_UUID, tenantId: AUTHORIZED_TENANT, image: PNG_DATA_URL }

    await saveServiceImageCrop({
      slug: 'bebo-salon',
      locale: 'ar',
      serviceId: SERVICE_UUID,
      // Centre of this rect is (0.5, 0.5) => 50%, 50%.
      crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    })

    const setArg = updateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.imageFocalX).toBe(50)
    expect(setArg.imageFocalY).toBe(50)
  })

  it('writes only the crop columns, the legacy focal columns and updatedAt', async () => {
    const { saveServiceImageCrop } = await load()
    serviceRow = { id: SERVICE_UUID, tenantId: AUTHORIZED_TENANT, image: PNG_DATA_URL }
    await saveServiceImageCrop({
      slug: 'bebo-salon',
      locale: 'ar',
      serviceId: SERVICE_UUID,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    })
    const setArg = updateSet.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(setArg).sort()).toEqual([
      'imageCropHeight',
      'imageCropWidth',
      'imageCropX',
      'imageCropY',
      'imageFocalX',
      'imageFocalY',
      'updatedAt',
    ])
  })

  it('scopes the lookup to the authorized tenant', async () => {
    const { saveServiceImageCrop } = await load()
    serviceRow = { id: SERVICE_UUID, tenantId: AUTHORIZED_TENANT, image: PNG_DATA_URL }
    await saveServiceImageCrop({
      slug: 'bebo-salon',
      locale: 'ar',
      serviceId: SERVICE_UUID,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    })

    // Drizzle's SQL object holds circular table refs, so walk it for string
    // leaves. The clause must contain BOTH ids; a bare serviceId would let
    // another tenant's row be matched.
    const leaves: string[] = []
    const seen = new WeakSet<object>()
    const walk = (node: unknown, depth = 0) => {
      if (depth > 8 || node === null || typeof node !== 'object') {
        if (typeof node === 'string' || typeof node === 'number') leaves.push(String(node))
        return
      }
      if (seen.has(node as object)) return
      seen.add(node as object)
      if (Array.isArray(node)) return node.forEach((c) => walk(c, depth + 1))
      const chunks = (node as { queryChunks?: unknown[] }).queryChunks
      if (Array.isArray(chunks)) chunks.forEach((c) => walk(c, depth + 1))
      for (const value of Object.values(node as Record<string, unknown>)) walk(value, depth + 1)
    }
    walk(lookupFilter)

    const joined = leaves.join('|')
    expect(joined).toContain(SERVICE_UUID)
    expect(joined).toContain(AUTHORIZED_TENANT)
  })

  it('rejects a cross-tenant service (lookup returns nothing)', async () => {
    const { saveServiceImageCrop } = await load()
    serviceRow = null

    const result = await saveServiceImageCrop({
      slug: 'bebo-salon',
      locale: 'ar',
      serviceId: SERVICE_UUID,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    })

    expect(result.ok).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses to crop a service that has no image', async () => {
    const { saveServiceImageCrop } = await load()
    serviceRow = { id: SERVICE_UUID, tenantId: AUTHORIZED_TENANT, image: null }

    const result = await saveServiceImageCrop({
      slug: 'bebo-salon',
      locale: 'ar',
      serviceId: SERVICE_UUID,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    })

    expect(result.ok).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects an unauthorized slug before any lookup', async () => {
    const { saveServiceImageCrop } = await load()
    await expect(
      saveServiceImageCrop({
        slug: 'someone-elses-salon',
        locale: 'ar',
        serviceId: SERVICE_UUID,
        crop: { x: 0, y: 0, width: 1, height: 1 },
      })
    ).rejects.toThrow('FORBIDDEN')
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects a crop outside 0..1', async () => {
    const { saveServiceImageCrop } = await load()
    serviceRow = { id: SERVICE_UUID, tenantId: AUTHORIZED_TENANT, image: PNG_DATA_URL }
    await expect(
      saveServiceImageCrop({
        slug: 'bebo-salon',
        locale: 'ar',
        serviceId: SERVICE_UUID,
        crop: { x: -0.5, y: 0, width: 1, height: 1 },
      })
    ).rejects.toThrow()
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects a degenerate (zero-size) crop', async () => {
    const { saveServiceImageCrop } = await load()
    serviceRow = { id: SERVICE_UUID, tenantId: AUTHORIZED_TENANT, image: PNG_DATA_URL }
    await expect(
      saveServiceImageCrop({
        slug: 'bebo-salon',
        locale: 'ar',
        serviceId: SERVICE_UUID,
        crop: { x: 0, y: 0, width: 0, height: 1 },
      })
    ).rejects.toThrow()
  })

  it('records an audit entry', async () => {
    const { saveServiceImageCrop } = await load()
    serviceRow = { id: SERVICE_UUID, tenantId: AUTHORIZED_TENANT, image: PNG_DATA_URL }
    await saveServiceImageCrop({
      slug: 'bebo-salon',
      locale: 'ar',
      serviceId: SERVICE_UUID,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    })
    expect(auditCalls.some((c) => c.entry.action === 'service.image.crop.saved')).toBe(true)
  })
})

describe('saveServiceImage with a crop', () => {
  beforeEach(() => {
    auditCalls.length = 0
    serviceRow = null
    update.mockClear()
    updateSet.mockClear()
    updateWhere.mockClear()
  })

  it('saves the image and its crop together', async () => {
    const { saveServiceImage } = await load()
    serviceRow = { id: SERVICE_UUID, tenantId: AUTHORIZED_TENANT, image: null }

    const result = await saveServiceImage({
      slug: 'bebo-salon',
      locale: 'ar',
      serviceId: SERVICE_UUID,
      imageBase64: PNG_DATA_URL,
      crop: { x: 0.2, y: 0.1, width: 0.6, height: 0.8 },
    })

    expect(result.ok).toBe(true)
    const setArg = updateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.image).toBe(PNG_DATA_URL)
    expect(setArg.imageCropX).toBe('0.2000')
    expect(setArg.imageCropHeight).toBe('0.8000')
  })

  it('still rejects an invalid image even when a crop is supplied', async () => {
    const { saveServiceImage } = await load()
    serviceRow = { id: SERVICE_UUID, tenantId: AUTHORIZED_TENANT, image: null }

    const result = await saveServiceImage({
      slug: 'bebo-salon',
      locale: 'ar',
      serviceId: SERVICE_UUID,
      imageBase64: 'not-an-image',
      crop: { x: 0, y: 0, width: 1, height: 1 },
    })

    // Cropping must never bypass the MIME/content validation.
    expect(result.ok).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects an oversized image even when a crop is supplied', async () => {
    const { saveServiceImage } = await load()
    serviceRow = { id: SERVICE_UUID, tenantId: AUTHORIZED_TENANT, image: null }

    const bigPng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(600 * 1024, 0x41),
    ]).toString('base64')

    const result = await saveServiceImage({
      slug: 'bebo-salon',
      locale: 'ar',
      serviceId: SERVICE_UUID,
      imageBase64: `data:image/png;base64,${bigPng}`,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    })

    expect(result.ok).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects a crop outside 0..1 as part of the save', async () => {
    const { saveServiceImage } = await load()
    serviceRow = { id: SERVICE_UUID, tenantId: AUTHORIZED_TENANT, image: null }
    await expect(
      saveServiceImage({
        slug: 'bebo-salon',
        locale: 'ar',
        serviceId: SERVICE_UUID,
        imageBase64: PNG_DATA_URL,
        crop: { x: 0, y: 0, width: 5, height: 1 },
      })
    ).rejects.toThrow()
    expect(update).not.toHaveBeenCalled()
  })
})

describe('removeServiceImage clears ALL crop metadata', () => {
  beforeEach(() => {
    serviceRow = null
    update.mockClear()
    updateSet.mockClear()
    updateWhere.mockClear()
  })

  it('nulls the image, the crop rectangle and the legacy focal point', async () => {
    const { removeServiceImage } = await load()
    serviceRow = { id: SERVICE_UUID, tenantId: AUTHORIZED_TENANT, image: PNG_DATA_URL }

    const result = await removeServiceImage({
      slug: 'bebo-salon',
      locale: 'ar',
      serviceId: SERVICE_UUID,
    })

    expect(result.ok).toBe(true)
    const setArg = updateSet.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.image).toBeNull()
    expect(setArg.imageCropX).toBeNull()
    expect(setArg.imageCropY).toBeNull()
    expect(setArg.imageCropWidth).toBeNull()
    expect(setArg.imageCropHeight).toBeNull()
    expect(setArg.imageFocalX).toBeNull()
    expect(setArg.imageFocalY).toBeNull()
  })
})
