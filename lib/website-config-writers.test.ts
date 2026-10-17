import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Writer inventory: every writer of the website configuration.
//
//   1. lib/publish-actions.ts   — saveDraft (draft only), publishChanges
//                                 (draft + published, behind the publish gate),
//                                 discardDraft (draft only)
//   2. branding-actions.ts      — draft only, via the SHARED write validator
//   3. scripts/backfill-*.ts    — audited: default-only, idempotent, never
//                                 overwrites an existing row
//
// These tests assert both the behavioural contract and the structural facts
// (which files may write the `published` column).
// ---------------------------------------------------------------------------

const auditCalls: Array<{ entry: any }> = []

vi.mock('@/lib/audit', () => ({
  logAudit: async (entry: any) => {
    auditCalls.push({ entry })
  },
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

vi.mock('@/lib/authz', () => ({
  requireTenantAccess: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
    tenant: { id: 'tenant-1', slug: 'bebo-salon' },
    membership: { role: 'owner' },
  })),
}))

let websiteConfigRow: Record<string, unknown> | null = null
const updateSet = vi.fn((..._a: unknown[]) => ({ where: vi.fn(async () => undefined) }))
const update = vi.fn((..._a: unknown[]) => ({ set: updateSet }))
const insertValues = vi.fn((..._a: unknown[]) => ({ onConflictDoUpdate: vi.fn(async () => undefined) }))
const insert = vi.fn((..._a: unknown[]) => ({ values: insertValues }))
let transactionCalled = false

vi.mock('@/lib/db', () => ({
  db: {
    query: { websiteConfig: { findFirst: vi.fn(async () => websiteConfigRow) } },
    update: (...a: unknown[]) => update(...a),
    insert: (...a: unknown[]) => insert(...a),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      transactionCalled = true
      return fn({ update: (...a: unknown[]) => update(...a) })
    }),
  },
}))

const baseConfig = (extra: Record<string, unknown> = {}) => ({
  theme: {},
  sections: [{ id: 'sec_hero', type: 'hero', content: {} }],
  contact: {
    phone: { value: '', isVisible: false },
    whatsapp: { value: '', isVisible: false },
    email: { value: '', isVisible: false },
    address: { value: '', isVisible: false },
    googleMapsUrl: { value: '', isVisible: false },
  },
  social: {
    instagram: { url: '', isEnabled: false },
    facebook: { url: '', isEnabled: false },
    tiktok: { url: '', isEnabled: false },
    youtube: { url: '', isEnabled: false },
  },
  cta: { action: 'booking', label: { ar: '', en: '' } },
  mobileStickyCta: { isEnabled: false },
  ...extra,
})

const validPhone = { value: '+201000000000', isVisible: true }

describe('website config writer inventory', () => {
  beforeEach(() => {
    auditCalls.length = 0
    websiteConfigRow = null
    transactionCalled = false
    update.mockClear()
    updateSet.mockClear()
    insert.mockClear()
    insertValues.mockClear()
  })

  // =========================================================================
  // saveDraft
  // =========================================================================
  describe('saveDraft', () => {
    it('writes only the draft column', async () => {
      const { saveDraft } = await import('./publish-actions')
      const result = await saveDraft({ slug: 'bebo-salon', locale: 'ar', config: baseConfig() })
      expect(result.ok).toBe(true)
      const values = insertValues.mock.calls[0][0] as Record<string, unknown>
      expect(values.draft).toBeDefined()
      expect(values).not.toHaveProperty('published')
      expect(values).not.toHaveProperty('publishedAt')
      expect(values).not.toHaveProperty('publishedBy')
      expect(transactionCalled).toBe(false)
    })

    it('is ALLOWED while the CTA action has no valid destination', async () => {
      const { saveDraft } = await import('./publish-actions')
      const result = await saveDraft({
        slug: 'bebo-salon',
        locale: 'ar',
        // call selected with no phone: publishable? no. savable? yes.
        config: baseConfig({ cta: { action: 'call', label: { ar: '', en: '' } } }),
      })
      expect(result.ok).toBe(true)
      expect(insert).toHaveBeenCalled()
    })

    it('reports a structured error and writes nothing for an invalid config', async () => {
      const { saveDraft } = await import('./publish-actions')
      const result = await saveDraft({ slug: 'bebo-salon', locale: 'ar', config: { sections: 'nope' } })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('VALIDATION_FAILED')
      expect(insert).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // publishChanges — the gate covers BOTH branches
  // =========================================================================
  describe('publishChanges gate', () => {
    it('publishes a booking config (direct-config branch)', async () => {
      const { publishChanges } = await import('./publish-actions')
      const result = await publishChanges({ slug: 'bebo-salon', locale: 'ar', config: baseConfig() })
      expect(result.ok).toBe(true)
      const setArg = updateSet.mock.calls[0][0] as Record<string, unknown>
      expect(setArg.published).toBeDefined()
      expect(setArg.publishedBy).toBe('user-1')
    })

    it('BLOCKS publishing call without a valid destination (direct-config branch)', async () => {
      const { publishChanges } = await import('./publish-actions')
      const result = await publishChanges({
        slug: 'bebo-salon',
        locale: 'ar',
        config: baseConfig({ cta: { action: 'call', label: { ar: '', en: '' } } }),
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('CTA_NO_DESTINATION')
        expect(result.errors?.[0].code).toBe('CTA_NO_DESTINATION')
      }
      // No write of any kind occurred.
      expect(update).not.toHaveBeenCalled()
      expect(insert).not.toHaveBeenCalled()
      expect(transactionCalled).toBe(false)
    })

    it('BLOCKS publishing whatsapp without a valid destination', async () => {
      const { publishChanges } = await import('./publish-actions')
      const result = await publishChanges({
        slug: 'bebo-salon',
        locale: 'ar',
        config: baseConfig({ cta: { action: 'whatsapp', label: { ar: '', en: '' } } }),
      })
      expect(result.ok).toBe(false)
      expect(transactionCalled).toBe(false)
    })

    it('ALLOWS publishing call with a valid visible phone', async () => {
      const { publishChanges } = await import('./publish-actions')
      const result = await publishChanges({
        slug: 'bebo-salon',
        locale: 'ar',
        config: baseConfig({
          cta: { action: 'call', label: { ar: '', en: '' } },
          contact: { ...baseConfig().contact, phone: validPhone },
        }),
      })
      expect(result.ok).toBe(true)
      expect(transactionCalled).toBe(true)
    })

    it('BLOCKS publishing when the stored draft has an invalid CTA (stored-draft branch)', async () => {
      websiteConfigRow = {
        tenantId: 'tenant-1',
        draft: baseConfig({ cta: { action: 'call', label: { ar: '', en: '' } } }),
        published: null,
      }
      const { publishChanges } = await import('./publish-actions')
      const result = await publishChanges({ slug: 'bebo-salon', locale: 'ar' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('CTA_NO_DESTINATION')
      expect(transactionCalled).toBe(false)
    })

    it('publishes a valid stored draft (stored-draft branch)', async () => {
      websiteConfigRow = { tenantId: 'tenant-1', draft: baseConfig(), published: null }
      const { publishChanges } = await import('./publish-actions')
      const result = await publishChanges({ slug: 'bebo-salon', locale: 'ar' })
      expect(result.ok).toBe(true)
      expect(transactionCalled).toBe(true)
    })

    it('BLOCKS publishing an oversized stored draft value', async () => {
      websiteConfigRow = {
        tenantId: 'tenant-1',
        draft: baseConfig({
          contact: { ...baseConfig().contact, address: { value: 'x'.repeat(5000), isVisible: true } },
        }),
        published: null,
      }
      const { publishChanges } = await import('./publish-actions')
      const result = await publishChanges({ slug: 'bebo-salon', locale: 'ar' })
      expect(result.ok).toBe(false)
      expect(transactionCalled).toBe(false)
    })

    it('returns NO_DRAFT when there is no row and no config', async () => {
      websiteConfigRow = null
      const { publishChanges } = await import('./publish-actions')
      const result = await publishChanges({ slug: 'bebo-salon', locale: 'ar' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('NO_DRAFT')
    })
  })

  // =========================================================================
  // discardDraft
  // =========================================================================
  describe('discardDraft', () => {
    it('writes only the draft column, never published', async () => {
      websiteConfigRow = { tenantId: 'tenant-1', draft: baseConfig(), published: baseConfig() }
      const { discardDraft } = await import('./publish-actions')
      await discardDraft({ slug: 'bebo-salon', locale: 'ar' })
      const setArg = updateSet.mock.calls[0][0] as Record<string, unknown>
      expect(setArg.draft).toBeDefined()
      expect(setArg).not.toHaveProperty('published')
      expect(setArg).not.toHaveProperty('publishedAt')
    })
  })

  // =========================================================================
  // Structural: which files may write `published`
  // =========================================================================
  describe('published-column writers (structural)', () => {
    const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')

    it('publish-actions.ts is the only application writer of `published`', () => {
      const source = read('lib/publish-actions.ts')
      expect(source).toContain('published:')
      // Exactly one write site, inside publishChanges.
      expect((source.match(/published:/g) ?? []).length).toBe(1)
    })

    it('branding-actions.ts never writes `published`', () => {
      const source = read('app/[locale]/tenants/[slug]/dashboard/branding-actions.ts')
      expect(source).not.toContain('published:')
      expect(source).not.toContain('publishedAt')
      expect(source).not.toContain('publishedBy')
    })

    it('branding-actions.ts uses the SHARED write validator', () => {
      const source = read('app/[locale]/tenants/[slug]/dashboard/branding-actions.ts')
      expect(source).toContain('validateWebsiteConfigForWrite')
      // ...and keeps a tolerant read, so an existing long value is never blanked.
      expect(source).toContain('safeParseWebsiteConfig')
    })

    it('the preview route performs no write at all', () => {
      const source = read('app/[locale]/tenants/[slug]/preview/page.tsx')
      expect(source).not.toContain('publishChanges')
      expect(source).not.toContain('saveDraft')
      expect(source).not.toContain('.update(websiteConfig)')
      expect(source).not.toContain('.insert(websiteConfig)')
    })
  })

  // =========================================================================
  // Backfill script — audited exception
  // =========================================================================
  describe('backfill script (audited writer)', () => {
    const source = readFileSync(resolve(process.cwd(), 'scripts/backfill-website-config.ts'), 'utf8')

    it('only inserts, never updates or deletes', () => {
      expect(source).toContain('INSERT INTO website_config')
      expect(source).not.toMatch(/UPDATE\s+website_config/i)
      expect(source).not.toMatch(/DELETE\s+FROM\s+website_config/i)
    })

    it('is idempotent and cannot overwrite an existing row', () => {
      expect(source).toContain('ON CONFLICT (tenant_id) DO NOTHING')
      // It only selects tenants that have NO website_config row.
      expect(source).toContain('WHERE wc.tenant_id IS NULL')
    })

    it('writes only a default-derived configuration', () => {
      // The published value is the default config merged with the tenant theme —
      // it never copies arbitrary stored data, so it is always publishable.
      expect(source).toContain('createDefaultWebsiteConfig')
      expect(source).toContain('theme.primaryColor')
    })

    it('skips soft-deleted tenants', () => {
      expect(source).toContain('t.deleted_at IS NULL')
    })
  })
})
