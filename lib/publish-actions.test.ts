import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Tests for the Website Builder draft/publish server actions.
 *
 * Focus: the discard contract and draft/published isolation. These exercise the
 * real action code with the database, authorization, audit and cache layers
 * mocked, following the pattern used by app/[locale]/manage-booking/actions.test.ts.
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

// Mutable row returned by db.query.websiteConfig.findFirst
let websiteConfigRow: Record<string, unknown> | null = null
const updateSet = vi.fn((..._args: unknown[]) => ({ where: vi.fn(async () => undefined) }))
const update = vi.fn((..._args: unknown[]) => ({ set: updateSet }))
const insertValues = vi.fn((..._args: unknown[]) => ({
  onConflictDoUpdate: vi.fn(async () => undefined),
}))
const insert = vi.fn((..._args: unknown[]) => ({ values: insertValues }))

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      websiteConfig: {
        findFirst: vi.fn(async () => websiteConfigRow),
      },
    },
    update: (...args: unknown[]) => update(...args),
    insert: (...args: unknown[]) => insert(...args),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        update: (...args: unknown[]) => update(...args),
      })
    ),
  },
}))

describe('website builder server actions', () => {
  beforeEach(() => {
    auditCalls.length = 0
    websiteConfigRow = null
    update.mockClear()
    updateSet.mockClear()
    insert.mockClear()
    insertValues.mockClear()
  })

  describe('discardDraft', () => {
    it('resets the draft to the published configuration', async () => {
      const published = { theme: {}, sections: [{ id: 's1', type: 'hero', content: {} }] }
      websiteConfigRow = { tenantId: 'tenant-1', draft: { theme: {}, sections: [] }, published }

      const { discardDraft } = await import('./publish-actions')
      const result = await discardDraft({ slug: 'bebo-salon', locale: 'ar' })

      expect(result.ok).toBe(true)
      expect(updateSet).toHaveBeenCalled()
      const setArg = updateSet.mock.calls[0][0] as Record<string, unknown>
      expect(setArg.draft).toEqual(published)
    })

    it('falls back to a valid default config when the tenant never published', async () => {
      // The regression: previously this reset the draft to `{}`, which parses to
      // ZERO sections, leaving the editor with no section controls at all.
      websiteConfigRow = { tenantId: 'tenant-1', draft: { theme: {}, sections: [] }, published: null }

      const { discardDraft } = await import('./publish-actions')
      const result = await discardDraft({ slug: 'bebo-salon', locale: 'ar' })

      expect(result.ok).toBe(true)
      const setArg = updateSet.mock.calls[0][0] as Record<string, unknown>
      const draft = setArg.draft as { sections?: unknown[] }
      expect(Array.isArray(draft.sections)).toBe(true)
      expect(draft.sections!.length).toBeGreaterThan(0)
    })

    it('returns the resolved config so the editor can sync without stale props', async () => {
      websiteConfigRow = { tenantId: 'tenant-1', draft: {}, published: null }

      const { discardDraft } = await import('./publish-actions')
      const result = await discardDraft({ slug: 'bebo-salon', locale: 'ar' })

      expect(result.ok).toBe(true)
      expect(result.config).not.toBeNull()
      expect(result.config!.sections.length).toBeGreaterThan(0)
    })

    it('returns ok with a null config when no row exists', async () => {
      websiteConfigRow = null

      const { discardDraft } = await import('./publish-actions')
      const result = await discardDraft({ slug: 'bebo-salon', locale: 'ar' })

      expect(result.ok).toBe(true)
      expect(result.config).toBeNull()
      expect(updateSet).not.toHaveBeenCalled()
    })

    it('never deletes business data — only updates the draft column', async () => {
      websiteConfigRow = { tenantId: 'tenant-1', draft: {}, published: null }

      const { discardDraft } = await import('./publish-actions')
      await discardDraft({ slug: 'bebo-salon', locale: 'ar' })

      const setArg = updateSet.mock.calls[0][0] as Record<string, unknown>
      expect(Object.keys(setArg).sort()).toEqual(['draft', 'updatedAt'])
    })
  })

  // ---------------------------------------------------------------------------
  // Theme presets: a preset is applied to the DRAFT only. Saving a preset must
  // never touch the published configuration, and the published row must be the
  // only thing the public website reads.
  // ---------------------------------------------------------------------------
  describe('theme preset isolation', () => {
    it('saving a preset-themed draft never writes the published column', async () => {
      const { saveDraft } = await import('./publish-actions')
      const { applyPreset } = await import('./theme-presets')
      const { createDefaultWebsiteConfig } = await import('./website-config')

      const themed = applyPreset(createDefaultWebsiteConfig(), 'salon')
      const result = await saveDraft({ slug: 'bebo-salon', locale: 'ar', config: themed })

      expect(result.ok).toBe(true)
      const valuesArg = insertValues.mock.calls[0][0] as Record<string, unknown>
      expect(valuesArg).not.toHaveProperty('published')
      expect(valuesArg).not.toHaveProperty('publishedAt')
      expect(valuesArg).not.toHaveProperty('publishedBy')
      // The draft carries the preset's colors.
      expect((valuesArg.draft as any).theme.primaryColor).toBe('#DB2777')
    })

    it('a preset-themed draft is a valid configuration the server accepts', async () => {
      const { saveDraft } = await import('./publish-actions')
      const { THEME_PRESETS, applyPreset } = await import('./theme-presets')
      const { createDefaultWebsiteConfig } = await import('./website-config')

      for (const preset of THEME_PRESETS) {
        insert.mockClear()
        const themed = applyPreset(createDefaultWebsiteConfig(), preset.id)
        const result = await saveDraft({ slug: 'bebo-salon', locale: 'ar', config: themed })
        expect(result.ok).toBe(true)
        expect(insert).toHaveBeenCalled()
      }
    })
  })

  describe('saveDraft', () => {
    it('writes only the draft column and never publishes', async () => {
      const { saveDraft } = await import('./publish-actions')
      const result = await saveDraft({
        slug: 'bebo-salon',
        locale: 'ar',
        config: { theme: {}, sections: [{ id: 's1', type: 'hero', content: {} }] },
      })

      expect(result.ok).toBe(true)
      const valuesArg = insertValues.mock.calls[0][0] as Record<string, unknown>
      expect(valuesArg.draft).toBeDefined()
      expect(valuesArg).not.toHaveProperty('published')
      expect(valuesArg).not.toHaveProperty('publishedAt')
    })

    it('reports an invalid configuration as a structured error and writes nothing', async () => {
      const { saveDraft } = await import('./publish-actions')
      const result = await saveDraft({ slug: 'bebo-salon', locale: 'ar', config: { sections: 'nope' } })

      // Failures are reported as data, not thrown, so the editor can keep the
      // tenant's text on screen and show a field-level message.
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('VALIDATION_FAILED')
        expect(result.errors?.length).toBeGreaterThan(0)
      }
      // The security-relevant half: nothing reached the database.
      expect(insert).not.toHaveBeenCalled()
    })

    it('reports an oversized contact value as a field error and writes nothing', async () => {
      const { saveDraft } = await import('./publish-actions')
      const result = await saveDraft({
        slug: 'bebo-salon',
        locale: 'ar',
        config: {
          theme: {},
          sections: [{ id: 's1', type: 'hero', content: {} }],
          contact: {
            phone: { value: '', isVisible: false },
            whatsapp: { value: '', isVisible: false },
            email: { value: '', isVisible: false },
            address: { value: 'x'.repeat(5000), isVisible: true },
            googleMapsUrl: { value: '', isVisible: false },
          },
        },
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors?.some((e) => e.field === 'contact.address.value' && e.code === 'TOO_LONG')).toBe(true)
      }
      expect(insert).not.toHaveBeenCalled()
    })

    it('reports an oversized section content value and writes nothing', async () => {
      const { saveDraft } = await import('./publish-actions')
      const result = await saveDraft({
        slug: 'bebo-salon',
        locale: 'ar',
        config: {
          theme: {},
          sections: [{ id: 's1', type: 'hero', content: { en: { headline: 'x'.repeat(600) } } }],
        },
      })
      expect(result.ok).toBe(false)
      expect(insert).not.toHaveBeenCalled()
    })
  })

  describe('publishChanges', () => {
    it('writes both draft and published when given an explicit config', async () => {
      const { publishChanges } = await import('./publish-actions')
      const result = await publishChanges({
        slug: 'bebo-salon',
        locale: 'ar',
        config: { theme: {}, sections: [{ id: 's1', type: 'hero', content: {} }] },
      })

      expect(result.ok).toBe(true)
      const setArg = updateSet.mock.calls[0][0] as Record<string, unknown>
      expect(setArg.draft).toBeDefined()
      expect(setArg.published).toBeDefined()
      expect(setArg.publishedAt).toBeInstanceOf(Date)
      expect(setArg.publishedBy).toBe('user-1')
    })

    it('returns NO_DRAFT when asked to publish without a config and no row exists', async () => {
      websiteConfigRow = null

      const { publishChanges } = await import('./publish-actions')
      const result = await publishChanges({ slug: 'bebo-salon', locale: 'ar' })

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('NO_DRAFT')
    })
  })
})
