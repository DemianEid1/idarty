import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Draft/Publish freshness + Arabic/English consistency.
//
// ROOT CAUSE 1 — publish served a stale public page.
// The public route caches its data through `unstable_cache` tagged
// `tenant-public-<slug>-<locale>`. `publishChanges` invalidated it with
// `revalidateTag(tag, 'max')`, which per the bundled Next.js 16 docs only marks
// the entry STALE: "The next request for that data kicks off a revalidation and
// is served stale content while it runs" — and with the `max` profile the window
// is a year, so the FIRST request after publishing always showed the OLD site.
// Fixed by `updateTag`, which expires the entry so the next request waits for
// fresh data (read-your-own-writes).
//
// ROOT CAUSE 2 — Arabic and English diverged.
// `website_config` is ONE row per tenant (`tenantId` is the primary key), so the
// configuration is SHARED across locales. Invalidating only
// `tenant-public-<slug>-<currentLocale>` left the OTHER locale serving the older
// published configuration, so the two language pages showed different versions
// of the same config. Both locale tags are now invalidated.
// ---------------------------------------------------------------------------

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')

const revalidatePathMock = vi.fn()
const revalidateTagMock = vi.fn()
const updateTagMock = vi.fn()

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePathMock(path),
  revalidateTag: (tag: string, profile: string) => revalidateTagMock(tag, profile),
  updateTag: (tag: string) => updateTagMock(tag),
}))

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

const requireTenantAccessMock = vi.fn(async () => ({
  tenant: { id: 'tenant-1', slug: 'bebo-salon' },
  session: { user: { id: 'user-1' } },
  role: 'admin',
}))
vi.mock('@/lib/authz', () => ({
  requireTenantAccess: () => requireTenantAccessMock(),
}))

vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))

// A minimal in-memory `website_config` row keyed by tenantId — one row per
// tenant, which is exactly the shared-across-locales model under test.
type Row = { tenantId: string; draft: Record<string, unknown>; published: Record<string, unknown> | null }
let row: Row | null = null
const transactionMock = vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
  await fn({
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          // `publishChanges` updates the existing row; create it if the tenant
          // has never saved a draft, mirroring an upsert.
          if (!row) row = { tenantId: 'tenant-1', draft: {}, published: null }
          Object.assign(row, values)
        },
      }),
    }),
  })
})

vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => {
          if (!row) row = { tenantId: 'tenant-1', draft: {}, published: null }
          Object.assign(row, set)
        },
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (row) Object.assign(row, values)
        },
      }),
    }),
    transaction: (fn: (tx: unknown) => Promise<void>) => transactionMock(fn),
    query: {
      websiteConfig: {
        findFirst: async () => row,
      },
    },
  },
}))

vi.mock('@/lib/db/schema', () => ({
  websiteConfig: { tenantId: 'tenantId', draft: 'draft', published: 'published' },
  tenants: { id: 'id', slug: 'slug' },
}))

import { saveDraft, publishChanges } from '@/lib/publish-actions'
import { createDefaultWebsiteConfig, parseWebsiteConfig } from '@/lib/website-config'

const validConfig = () => parseWebsiteConfig(createDefaultWebsiteConfig())

beforeEach(() => {
  row = null
  revalidatePathMock.mockClear()
  revalidateTagMock.mockClear()
  updateTagMock.mockClear()
})

describe('publish invalidates the public cache IMMEDIATELY (not stale-while-revalidate)', () => {
  it('uses updateTag, not revalidateTag, for the public data tags', async () => {
    const res = await publishChanges({ slug: 'bebo-salon', locale: 'ar', config: validConfig() })
    expect(res.ok).toBe(true)
    // `updateTag` expires the entry; `revalidateTag(tag, 'max')` would serve one
    // stale response, which is the reported "publish does not show the latest".
    expect(updateTagMock).toHaveBeenCalled()
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })

  it('expires BOTH locale caches because the config is shared', async () => {
    await publishChanges({ slug: 'bebo-salon', locale: 'ar', config: validConfig() })
    const tags = updateTagMock.mock.calls.map((c) => String(c[0]))
    expect(tags).toContain('tenant-public-bebo-salon-ar')
    expect(tags).toContain('tenant-public-bebo-salon-en')
  })

  it('does the same when publishing from the English locale', async () => {
    await publishChanges({ slug: 'bebo-salon', locale: 'en', config: validConfig() })
    const tags = updateTagMock.mock.calls.map((c) => String(c[0]))
    expect(tags).toContain('tenant-public-bebo-salon-ar')
    expect(tags).toContain('tenant-public-bebo-salon-en')
  })

  it('also expires both locales when publishing a stored draft (no explicit config)', async () => {
    row = { tenantId: 'tenant-1', draft: validConfig() as unknown as Record<string, unknown>, published: null }
    const res = await publishChanges({ slug: 'bebo-salon', locale: 'ar' })
    expect(res.ok).toBe(true)
    const tags = updateTagMock.mock.calls.map((c) => String(c[0]))
    expect(tags).toContain('tenant-public-bebo-salon-ar')
    expect(tags).toContain('tenant-public-bebo-salon-en')
  })

  it('writes the SAME config to draft and published (one shared row)', async () => {
    await publishChanges({ slug: 'bebo-salon', locale: 'ar', config: validConfig() })
    expect(row).not.toBeNull()
    expect(row!.published).toEqual(row!.draft)
  })
})

describe('save draft persists the submitted config and never touches published', () => {
  it('stores the exact config it was given', async () => {
    const config = parseWebsiteConfig({ ...createDefaultWebsiteConfig(), theme: { primaryColor: '#123456' } })
    const res = await saveDraft({ slug: 'bebo-salon', locale: 'ar', config })
    expect(res.ok).toBe(true)
    expect((row!.draft as { theme: { primaryColor?: string } }).theme.primaryColor).toBe('#123456')
    // Saving a draft must never change the public site.
    expect(row!.published).toBeNull()
  })

  it('does not invalidate the public cache (draft is not public)', async () => {
    await saveDraft({ slug: 'bebo-salon', locale: 'ar', config: validConfig() })
    expect(updateTagMock).not.toHaveBeenCalled()
  })

  it('refreshes the dashboard so the editor re-reads the persisted draft', async () => {
    await saveDraft({ slug: 'bebo-salon', locale: 'ar', config: validConfig() })
    const paths = revalidatePathMock.mock.calls.map((c) => String(c[0]))
    expect(paths.some((p) => p.endsWith('/dashboard'))).toBe(true)
  })
})

describe('locale consistency: the configuration is shared, content is per-locale', () => {
  it('stores exactly ONE website_config row per tenant (tenantId is the primary key)', () => {
    const schema = read('lib/db/schema.ts')
    expect(schema).toMatch(/websiteConfig = pgTable\('website_config',\s*\{\s*tenantId: uuid\('tenant_id'\)\.primaryKey\(\)/)
  })

  it('keeps both locales inside the one config, so neither can overwrite the other', () => {
    const cfg = read('lib/website-config.ts')
    // Localized text lives under `content.ar` / `content.en` in the SAME object.
    expect(cfg).toMatch(/websiteSectionContent = z\s*\.object\(\{\s*ar: localizedContent,\s*en: localizedContent,/)
  })

  it('reads the published config without filtering by locale', () => {
    const page = read('app/[locale]/tenants/[slug]/page.tsx')
    // The lookup is by tenantId only — the same row serves both languages.
    expect(page).toContain('eq(websiteConfig.tenantId, tenant.id)')
    expect(page).not.toContain('eq(websiteConfig.locale')
  })

  it('preview reads the DRAFT and the public page reads the PUBLISHED config', () => {
    expect(read('app/[locale]/tenants/[slug]/preview/page.tsx')).toContain('config={draftConfig}')
    expect(read('app/[locale]/tenants/[slug]/page.tsx')).toContain('config={publishedConfig}')
  })

  it('invalidates both locales from the branding writer too (shared config)', () => {
    const branding = read('app/[locale]/tenants/[slug]/dashboard/branding-actions.ts')
    expect(branding).toContain('updateTag(`tenant-public-${data.slug}-ar`)')
    expect(branding).toContain('updateTag(`tenant-public-${data.slug}-en`)')
    expect(branding).not.toContain("revalidateTag(`tenant-public-${data.slug}-${data.locale}`")
  })

  it('no writer invalidates only the current locale for shared website data', () => {
    // publish-actions + branding-actions are the two writers of website_config.
    for (const f of [
      'lib/publish-actions.ts',
      'app/[locale]/tenants/[slug]/dashboard/branding-actions.ts',
    ]) {
      const src = read(f)
      expect(src, `${f} must not scope invalidation to one locale`).not.toMatch(
        /revalidateTag\(`tenant-public-\$\{[^}]+\}-\$\{[^}]+\}`/
      )
    }
  })
})

describe('the public route cache is tagged per locale and keyed by slug+locale', () => {
  it('tags the cached loader with the slug and locale', () => {
    const page = read('app/[locale]/tenants/[slug]/page.tsx')
    expect(page).toContain('tags: [`tenant-public-${slug}-${locale}`]')
    expect(page).toContain("['tenant-public', slug, locale]")
  })

  it('publishes the tag names the writers invalidate', () => {
    const page = read('app/[locale]/tenants/[slug]/page.tsx')
    const actions = read('lib/publish-actions.ts')
    // Both sides agree on the exact tag format.
    expect(page).toContain('`tenant-public-${slug}-${locale}`')
    expect(actions).toContain('`tenant-public-${input.slug}-ar`')
    expect(actions).toContain('`tenant-public-${input.slug}-en`')
  })
})
