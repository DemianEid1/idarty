import { describe, expect, it, vi, beforeEach } from 'vitest'
import { parseWebsiteConfig, safeParseWebsiteConfig } from './website-config'
import {
  validateImageBase64,
  isValidHeroImageDataUrl,
  MAX_HERO_IMAGE_SIZE,
  MAX_SERVICE_IMAGE_SIZE,
} from './image-validation'

/**
 * Phase 3.4 image management — validation and draft/publish integrity.
 *
 * `validateImageBase64` and the hero-image bound live in the framework-free
 * `lib/image-validation.ts` module (a `'use server'` file may only export async
 * functions). The service-image server actions are exercised with the database,
 * authorization, audit and cache layers mocked, following the pattern in
 * publish-actions.test.ts.
 */

const auditCalls: Array<{ entry: any; headers?: Headers }> = []

vi.mock('@/lib/audit', () => ({
  logAudit: async (entry: any, headers?: Headers) => {
    auditCalls.push({ entry, headers })
  },
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
}))

vi.mock('@/lib/authz', () => ({
  requireTenantAccess: vi.fn(async (_headers: Headers, _slug: string, minimumRole?: string) => ({
    session: { user: { id: 'user-1' } },
    tenant: { id: 'tenant-1', slug: 'bebo-salon' },
    membership: { role: minimumRole ?? 'manager' },
  })),
}))

let serviceRow: Record<string, unknown> | null = null

const updateWhere = vi.fn(async () => undefined)
const updateSet = vi.fn((..._args: unknown[]) => ({ where: updateWhere }))
const update = vi.fn((..._args: unknown[]) => ({ set: updateSet }))

const insertValues = vi.fn((..._args: unknown[]) => ({
  onConflictDoUpdate: vi.fn(async () => undefined),
}))
const insert = vi.fn((..._args: unknown[]) => ({ values: insertValues }))

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      websiteConfig: { findFirst: vi.fn(async () => null) },
      services: { findFirst: vi.fn(async () => serviceRow) },
    },
    update: (...args: unknown[]) => update(...args),
    insert: (...args: unknown[]) => insert(...args),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) =>
      fn({ update: (...args: unknown[]) => update(...args) })
    ),
  },
}))

// Valid 1x1 PNG (magic bytes 89 50 4E 47 0D 0A 1A 0A).
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`

// A payload with a valid JPEG magic-byte prefix (FF D8 FF).
const JPEG_DATA_URL = `data:image/jpeg;base64,${Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from('jpeg payload'),
]).toString('base64')}`

// A payload with a valid RIFF....WEBP header.
const WEBP_DATA_URL = `data:image/webp;base64,${Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP'),
  Buffer.from('webp payload'),
]).toString('base64')}`

/** Build an oversized but structurally valid PNG data URL. */
function oversizedPngDataUrl(bytes: number): string {
  return `data:image/png;base64,${Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(bytes, 0x41),
  ]).toString('base64')}`
}

const SERVICE_UUID = '11111111-2222-4333-8444-555555555555'

describe('Phase 3.4 image management', () => {
  beforeEach(() => {
    auditCalls.length = 0
    serviceRow = null
    update.mockClear()
    updateSet.mockClear()
    updateWhere.mockClear()
    insert.mockClear()
    insertValues.mockClear()
  })

  // -------------------------------------------------------------------------
  // Upload validation
  // -------------------------------------------------------------------------
  describe('validateImageBase64', () => {
    it('accepts valid PNG, JPEG and WebP data URLs', () => {
      expect(validateImageBase64(PNG_DATA_URL, MAX_HERO_IMAGE_SIZE).ok).toBe(true)
      expect(validateImageBase64(JPEG_DATA_URL, MAX_HERO_IMAGE_SIZE).ok).toBe(true)
      expect(validateImageBase64(WEBP_DATA_URL, MAX_HERO_IMAGE_SIZE).ok).toBe(true)
    })

    it('rejects an external URL (uploads only, no arbitrary remote images)', () => {
      expect(validateImageBase64('https://example.com/image.png', MAX_HERO_IMAGE_SIZE).ok).toBe(false)
    })

    it('rejects an unsupported MIME type', () => {
      const gif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
      expect(validateImageBase64(gif, MAX_HERO_IMAGE_SIZE).ok).toBe(false)
    })

    it('rejects a data URL with no payload', () => {
      expect(validateImageBase64('data:image/png;base64,', MAX_HERO_IMAGE_SIZE).ok).toBe(false)
    })

    it('rejects a payload exceeding the size limit', () => {
      expect(validateImageBase64(oversizedPngDataUrl(2000), 1024).ok).toBe(false)
    })

    it('rejects content that contradicts the declared MIME type', () => {
      // Claim PNG, supply non-PNG bytes — a renamed file must not pass.
      const notPng = Buffer.from('not a png image at all').toString('base64')
      expect(validateImageBase64(`data:image/png;base64,${notPng}`, MAX_HERO_IMAGE_SIZE).ok).toBe(false)
    })

    it('rejects a JPEG-labelled payload without JPEG magic bytes', () => {
      const notJpeg = Buffer.from('definitely not a jpeg').toString('base64')
      expect(validateImageBase64(`data:image/jpeg;base64,${notJpeg}`, MAX_HERO_IMAGE_SIZE).ok).toBe(false)
    })

    it('rejects a WebP-labelled payload without the WEBP marker', () => {
      const badWebp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(20, 0x41)]).toString('base64')
      expect(validateImageBase64(`data:image/webp;base64,${badWebp}`, MAX_HERO_IMAGE_SIZE).ok).toBe(false)
    })

    it('documents the upload limits', () => {
      expect(MAX_HERO_IMAGE_SIZE).toBe(2 * 1024 * 1024)
      expect(MAX_SERVICE_IMAGE_SIZE).toBe(500 * 1024)
    })
  })

  // -------------------------------------------------------------------------
  // Hero image — schema bound (the editor saves it through the normal draft
  // workflow, so the SERVER-SIDE schema is what actually validates it).
  // -------------------------------------------------------------------------
  describe('heroImage schema bound', () => {
    const withHeroImage = (heroImage: string) => ({
      theme: { heroImage },
      sections: [{ id: 's1', type: 'hero', content: {} }],
    })

    it('accepts a valid hero image data URL', () => {
      const result = parseWebsiteConfig(withHeroImage(PNG_DATA_URL))
      expect(result.theme.heroImage).toBe(PNG_DATA_URL)
    })

    it('accepts a config with no hero image (backward compatible)', () => {
      const result = parseWebsiteConfig({ theme: {}, sections: [] })
      expect(result.theme.heroImage).toBeUndefined()
    })

    it('rejects an oversized hero image submitted directly to the server', () => {
      // 3MB of decoded content, well past the 2MB limit.
      expect(() => parseWebsiteConfig(withHeroImage(oversizedPngDataUrl(3 * 1024 * 1024)))).toThrow()
    })

    it('rejects a mislabelled hero image', () => {
      const notPng = Buffer.from('not a png at all').toString('base64')
      expect(() => parseWebsiteConfig(withHeroImage(`data:image/png;base64,${notPng}`))).toThrow()
    })

    it('rejects an external URL used as a hero image', () => {
      expect(() => parseWebsiteConfig(withHeroImage('https://example.com/hero.jpg'))).toThrow()
    })

    it('safeParseWebsiteConfig returns null for an invalid hero image', () => {
      expect(safeParseWebsiteConfig(withHeroImage('data:image/png;base64,zzz'))).toBeNull()
    })

    it('preserves unrelated theme fields and section content alongside the image', () => {
      const result = parseWebsiteConfig({
        theme: { heroImage: PNG_DATA_URL, primaryColor: '#123456', logo: 'data:image/png;base64,AAA' },
        sections: [{ id: 's1', type: 'hero', content: { ar: { headline: 'عنوان' } } }],
      })
      expect(result.theme.heroImage).toBe(PNG_DATA_URL)
      expect(result.theme.primaryColor).toBe('#123456')
      expect(result.theme.logo).toBe('data:image/png;base64,AAA')
      expect(result.sections[0].content.ar?.headline).toBe('عنوان')
    })

    it('agrees with isValidHeroImageDataUrl', () => {
      expect(isValidHeroImageDataUrl(PNG_DATA_URL)).toBe(true)
      expect(isValidHeroImageDataUrl('not-a-data-url')).toBe(false)
    })

    it('survives applying a theme preset (preset changes colors only)', async () => {
      const { applyPreset } = await import('./theme-presets')
      const config = parseWebsiteConfig(withHeroImage(PNG_DATA_URL))
      const themed = applyPreset(config, 'salon')
      // The preset repaints the colors and leaves the hero image alone.
      expect(themed.theme.heroImage).toBe(PNG_DATA_URL)
      expect(themed.theme.primaryColor).toBe('#DB2777')
    })

    it('survives a saveDraft → parse round-trip without publishing', async () => {
      const { saveDraft } = await import('./publish-actions')
      const config = parseWebsiteConfig(withHeroImage(PNG_DATA_URL))
      const result = await saveDraft({ slug: 'bebo-salon', locale: 'ar', config })
      expect(result.ok).toBe(true)
      // Only the draft column is written — the published site is untouched.
      const valuesArg = insertValues.mock.calls[0][0] as Record<string, unknown>
      expect((valuesArg.draft as any).theme.heroImage).toBe(PNG_DATA_URL)
      expect(valuesArg).not.toHaveProperty('published')
      expect(valuesArg).not.toHaveProperty('publishedAt')
    })
  })

  // -------------------------------------------------------------------------
  // Service images — server actions
  // -------------------------------------------------------------------------
  describe('saveServiceImage', () => {
    it('saves an image against the correct service', async () => {
      const { saveServiceImage } = await import(
        '@/app/[locale]/tenants/[slug]/dashboard/service-image-actions'
      )
      serviceRow = { id: SERVICE_UUID, tenantId: 'tenant-1', name: 'Haircut' }

      const result = await saveServiceImage({
        slug: 'bebo-salon',
        locale: 'ar',
        serviceId: SERVICE_UUID,
        imageBase64: PNG_DATA_URL,
      })
      expect(result.ok).toBe(true)
      expect(updateSet).toHaveBeenCalled()
      const setArg = updateSet.mock.calls[0][0] as Record<string, unknown>
      expect(setArg.image).toBe(PNG_DATA_URL)
    })

    it('rejects an invalid image without writing', async () => {
      const { saveServiceImage } = await import(
        '@/app/[locale]/tenants/[slug]/dashboard/service-image-actions'
      )
      serviceRow = { id: SERVICE_UUID, tenantId: 'tenant-1', name: 'Haircut' }

      const result = await saveServiceImage({
        slug: 'bebo-salon',
        locale: 'ar',
        serviceId: SERVICE_UUID,
        imageBase64: 'not-valid',
      })
      expect(result.ok).toBe(false)
      expect(update).not.toHaveBeenCalled()
    })

    it('rejects when the service does not belong to this tenant', async () => {
      const { saveServiceImage } = await import(
        '@/app/[locale]/tenants/[slug]/dashboard/service-image-actions'
      )
      // The tenant-scoped lookup returns nothing for another tenant's service.
      serviceRow = null

      const result = await saveServiceImage({
        slug: 'bebo-salon',
        locale: 'ar',
        serviceId: SERVICE_UUID,
        imageBase64: PNG_DATA_URL,
      })
      expect(result.ok).toBe(false)
      expect(update).not.toHaveBeenCalled()
    })

    it('rejects an oversized service image (500KB limit)', async () => {
      const { saveServiceImage } = await import(
        '@/app/[locale]/tenants/[slug]/dashboard/service-image-actions'
      )
      serviceRow = { id: SERVICE_UUID, tenantId: 'tenant-1', name: 'Haircut' }

      const result = await saveServiceImage({
        slug: 'bebo-salon',
        locale: 'ar',
        serviceId: SERVICE_UUID,
        imageBase64: oversizedPngDataUrl(600 * 1024),
      })
      expect(result.ok).toBe(false)
      expect(update).not.toHaveBeenCalled()
    })

    it('rejects a malformed service id', async () => {
      const { saveServiceImage } = await import(
        '@/app/[locale]/tenants/[slug]/dashboard/service-image-actions'
      )
      serviceRow = { id: SERVICE_UUID, tenantId: 'tenant-1', name: 'Haircut' }

      await expect(
        saveServiceImage({
          slug: 'bebo-salon',
          locale: 'ar',
          serviceId: 'not-a-uuid',
          imageBase64: PNG_DATA_URL,
        })
      ).rejects.toThrow()
      expect(update).not.toHaveBeenCalled()
    })

    it('records an audit entry on success', async () => {
      const { saveServiceImage } = await import(
        '@/app/[locale]/tenants/[slug]/dashboard/service-image-actions'
      )
      serviceRow = { id: SERVICE_UUID, tenantId: 'tenant-1', name: 'Haircut' }
      await saveServiceImage({
        slug: 'bebo-salon',
        locale: 'ar',
        serviceId: SERVICE_UUID,
        imageBase64: PNG_DATA_URL,
      })
      expect(auditCalls.some((c) => c.entry.action === 'service.image.saved')).toBe(true)
    })
  })

  describe('removeServiceImage', () => {
    it('sets the service image to null', async () => {
      const { removeServiceImage } = await import(
        '@/app/[locale]/tenants/[slug]/dashboard/service-image-actions'
      )
      serviceRow = { id: SERVICE_UUID, tenantId: 'tenant-1', name: 'Haircut', image: PNG_DATA_URL }

      const result = await removeServiceImage({
        slug: 'bebo-salon',
        locale: 'ar',
        serviceId: SERVICE_UUID,
      })
      expect(result.ok).toBe(true)
      const setArg = updateSet.mock.calls[0][0] as Record<string, unknown>
      expect(setArg.image).toBeNull()
    })

    it('succeeds when the service has no image', async () => {
      const { removeServiceImage } = await import(
        '@/app/[locale]/tenants/[slug]/dashboard/service-image-actions'
      )
      serviceRow = { id: SERVICE_UUID, tenantId: 'tenant-1', name: 'Haircut', image: null }

      const result = await removeServiceImage({
        slug: 'bebo-salon',
        locale: 'ar',
        serviceId: SERVICE_UUID,
      })
      expect(result.ok).toBe(true)
    })

    it('rejects when the service does not belong to this tenant', async () => {
      const { removeServiceImage } = await import(
        '@/app/[locale]/tenants/[slug]/dashboard/service-image-actions'
      )
      serviceRow = null

      const result = await removeServiceImage({
        slug: 'bebo-salon',
        locale: 'ar',
        serviceId: SERVICE_UUID,
      })
      expect(result.ok).toBe(false)
      expect(update).not.toHaveBeenCalled()
    })

    it('only writes the image and crop columns — never unrelated service data', async () => {
      const { removeServiceImage } = await import(
        '@/app/[locale]/tenants/[slug]/dashboard/service-image-actions'
      )
      serviceRow = { id: SERVICE_UUID, tenantId: 'tenant-1', name: 'Haircut', image: PNG_DATA_URL }

      await removeServiceImage({ slug: 'bebo-salon', locale: 'ar', serviceId: SERVICE_UUID })

      const setArg = updateSet.mock.calls[0][0] as Record<string, unknown>
      // The crop rectangle AND the legacy focal columns are cleared alongside
      // the image, so no stale crop can be applied to a future image.
      expect(Object.keys(setArg).sort()).toEqual([
        'image',
        'imageCropHeight',
        'imageCropWidth',
        'imageCropX',
        'imageCropY',
        'imageFocalX',
        'imageFocalY',
        'updatedAt',
      ])
      // Name, price, duration and activation are untouched.
      expect(setArg).not.toHaveProperty('priceAmount')
      expect(setArg).not.toHaveProperty('durationMin')
      expect(setArg).not.toHaveProperty('isActive')
    })
  })
})
