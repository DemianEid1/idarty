import { describe, expect, it } from 'vitest'
import {
  buildTenantMetadata,
  tenantPublicPath,
  type TenantMetadataInput,
} from './tenant-metadata'
import {
  resolvePublicOrigin,
  resolvePublicImageUrl,
  truncateForMetadata,
  absoluteUrl,
  METADATA_DESCRIPTION_MAX,
} from './site-url'

// ---------------------------------------------------------------------------
// Public tenant page metadata.
//
// The builder is pure, so these tests exercise the real resolution rules without
// a database or a request.
// ---------------------------------------------------------------------------

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const ORIGIN = 'https://idarty.example.com'

/**
 * Read the Twitter card type. `Metadata['twitter']` is a UNION in Next 16 and
 * only some members declare `card`, so this narrows instead of indexing blindly.
 */
function twitterCard(metadata: { twitter?: unknown }): string | undefined {
  const t = metadata.twitter as { card?: string } | undefined
  return t?.card
}

function input(overrides: Partial<TenantMetadataInput> = {}): TenantMetadataInput {
  return {
    locale: 'ar',
    slug: 'nile-wellness',
    translation: {
      name: 'مركز النيل للعافية',
      tagline: 'رعاية قريبة ومنظمة',
      description: 'عيادة مجتمعية مع حجز بسيط ورعاية مدروسة.',
    },
    publishedConfig: null,
    origin: ORIGIN,
    ...overrides,
  }
}

// ===========================================================================
// 1. Localized metadata
// ===========================================================================
describe('localized metadata', () => {
  it('uses the Arabic name and description on the Arabic route', () => {
    const m = buildTenantMetadata(input({ locale: 'ar' }))
    expect(m.title).toBe('مركز النيل للعافية')
    expect(m.description).toBe('عيادة مجتمعية مع حجز بسيط ورعاية مدروسة.')
    expect(m.openGraph?.locale).toBe('ar_EG')
  })

  it('uses the English name and description on the English route', () => {
    const m = buildTenantMetadata(
      input({
        locale: 'en',
        translation: {
          name: 'Nile Wellness Center',
          tagline: 'Care that feels close',
          description: 'A community clinic with simple booking.',
        },
      })
    )
    expect(m.title).toBe('Nile Wellness Center')
    expect(m.description).toBe('A community clinic with simple booking.')
    expect(m.openGraph?.locale).toBe('en_US')
  })

  it('produces different canonical URLs per locale', () => {
    const ar = buildTenantMetadata(input({ locale: 'ar' }))
    const en = buildTenantMetadata(input({ locale: 'en' }))
    expect(ar.alternates?.canonical).toBe(`${ORIGIN}/ar/tenants/nile-wellness`)
    expect(en.alternates?.canonical).toBe(`${ORIGIN}/en/tenants/nile-wellness`)
  })
})

// ===========================================================================
// 2. Tenant-specific title/description
// ===========================================================================
describe('tenant-specific values', () => {
  it('titles with the tenant name, not the platform name', () => {
    const m = buildTenantMetadata(input())
    expect(m.title).toBe('مركز النيل للعافية')
    expect(String(m.title)).not.toContain('Idarty')
  })

  it('falls back to the tagline when there is no description', () => {
    const m = buildTenantMetadata(
      input({ translation: { name: 'X', tagline: 'شريط', description: null } })
    )
    expect(m.description).toBe('شريط')
  })

  it('sets og:siteName to the tenant name', () => {
    expect(buildTenantMetadata(input()).openGraph?.siteName).toBe('مركز النيل للعافية')
  })
})

// ===========================================================================
// 3. Published (never draft) content
// ===========================================================================
describe('published content only', () => {
  it('uses the published hero headline when the translation has no description', () => {
    const m = buildTenantMetadata(
      input({
        translation: { name: 'X', tagline: null, description: null },
        publishedConfig: {
          sections: [{ type: 'hero', content: { ar: { headline: 'عنوان منشور' } } }],
        },
      })
    )
    expect(m.description).toBe('عنوان منشور')
  })

  it('prefers the locale-specific hero headline', () => {
    const m = buildTenantMetadata(
      input({
        locale: 'en',
        translation: { name: 'X', tagline: null, description: null },
        publishedConfig: {
          sections: [
            { type: 'hero', content: { ar: { headline: 'عربي' }, en: { headline: 'English' } } },
          ],
        },
      })
    )
    expect(m.description).toBe('English')
  })

  it('accepts a published hero image and ignores a draft-shaped config', () => {
    // The caller only ever passes the PUBLISHED config; the builder has no
    // draft input at all, which is the structural guarantee.
    const m = buildTenantMetadata(
      input({ publishedConfig: { theme: { heroImage: 'https://cdn.example.com/hero.jpg' } } })
    )
    expect(m.openGraph?.images).toEqual([
      { url: 'https://cdn.example.com/hero.jpg', alt: 'مركز النيل للعافية' },
    ])
  })

  it('never emits an internal identifier', () => {
    const serialized = JSON.stringify(buildTenantMetadata(input()))
    // No uuid-like tenant id anywhere in the metadata.
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
  })
})

// ===========================================================================
// 4. Missing description / image
// ===========================================================================
describe('missing optional content', () => {
  it('falls back to a localized description when everything is absent', () => {
    const ar = buildTenantMetadata(
      input({ translation: null, publishedConfig: null })
    )
    expect(ar.description).toBe('اختر الخدمة والوقت المناسبين لك.')

    const en = buildTenantMetadata(
      input({ locale: 'en', translation: null, publishedConfig: null })
    )
    expect(en.description).toBe('Choose a service and a time that works for you.')
  })

  it('falls back to a localized title when the name is empty', () => {
    const m = buildTenantMetadata(
      input({ translation: { name: '   ', tagline: null, description: null } })
    )
    expect(m.title).toBe('مساحة عمل')
  })

  it('omits the OG image when no image is available', () => {
    const m = buildTenantMetadata(input({ publishedConfig: null }))
    expect(m.openGraph?.images).toBeUndefined()
  })

  it('uses a summary card when there is no image, large card when there is', () => {
    expect(twitterCard(buildTenantMetadata(input()))).toBe('summary')
    expect(
      twitterCard(
        buildTenantMetadata(
          input({ publishedConfig: { theme: { heroImage: 'https://cdn.example.com/h.jpg' } } })
        )
      )
    ).toBe('summary_large_image')
  })
})

// ===========================================================================
// 5. Canonical + language alternates
// ===========================================================================
describe('canonical and alternates', () => {
  it('emits an absolute canonical plus both language alternates', () => {
    const m = buildTenantMetadata(input({ locale: 'ar' }))
    expect(m.alternates?.canonical).toBe(`${ORIGIN}/ar/tenants/nile-wellness`)
    expect(m.alternates?.languages).toEqual({
      ar: `${ORIGIN}/ar/tenants/nile-wellness`,
      en: `${ORIGIN}/en/tenants/nile-wellness`,
    })
  })

  it('sets the OG url to the canonical', () => {
    const m = buildTenantMetadata(input({ locale: 'en' }))
    expect(m.openGraph?.url).toBe(`${ORIGIN}/en/tenants/nile-wellness`)
  })

  it('omits canonical and alternates entirely when no origin is configured', () => {
    const m = buildTenantMetadata(input({ origin: null }))
    expect(m.alternates).toBeUndefined()
    expect(m.openGraph?.url).toBeUndefined()
    // The rest of the metadata still renders.
    expect(m.title).toBe('مركز النيل للعافية')
  })

  it('percent-encodes the slug in the path', () => {
    expect(tenantPublicPath('ar', 'a b')).toBe('/ar/tenants/a%20b')
  })
})

// ===========================================================================
// 6. Image URL safety
// ===========================================================================
describe('public image URL resolution', () => {
  it('accepts absolute http(s) URLs', () => {
    expect(resolvePublicImageUrl('https://cdn.example.com/a.png')).toBe(
      'https://cdn.example.com/a.png'
    )
    expect(resolvePublicImageUrl('http://cdn.example.com/a.png')).toBe(
      'http://cdn.example.com/a.png'
    )
  })

  it('rejects base64 data URLs (crawlers cannot fetch them)', () => {
    expect(resolvePublicImageUrl(PNG_DATA_URL)).toBeNull()
    // ...and therefore the OG image is omitted rather than emitted.
    const m = buildTenantMetadata(input({ publishedConfig: { theme: { heroImage: PNG_DATA_URL } } }))
    expect(m.openGraph?.images).toBeUndefined()
    expect(twitterCard(m)).toBe('summary')
  })

  it('rejects relative, unsafe and non-string values', () => {
    for (const bad of ['/hero.png', 'javascript:alert(1)', 'data:image/png;base64,AA', '', 42, null]) {
      expect(resolvePublicImageUrl(bad), String(bad)).toBeNull()
    }
  })

  it('rejects a data URL in the logo slot too', () => {
    const m = buildTenantMetadata(input({ publishedConfig: { theme: { logo: PNG_DATA_URL } } }))
    expect(m.openGraph?.images).toBeUndefined()
  })
})

// ===========================================================================
// 7. Description length
// ===========================================================================
describe('description length limiting', () => {
  it('does not mutate the stored configuration', () => {
    const long = 'كلمة '.repeat(100)
    const translation = { name: 'X', tagline: null, description: long }
    const m = buildTenantMetadata(input({ translation }))
    expect(m.description!.length).toBeLessThanOrEqual(METADATA_DESCRIPTION_MAX + 1)
    // The input object is untouched.
    expect(translation.description).toBe(long)
  })

  it('truncates on a word boundary with an ellipsis', () => {
    const text = 'word '.repeat(80)
    const out = truncateForMetadata(text)
    expect(out.length).toBeLessThanOrEqual(METADATA_DESCRIPTION_MAX + 1)
    expect(out.endsWith('…')).toBe(true)
  })

  it('leaves a short description untouched', () => {
    expect(truncateForMetadata('قصير')).toBe('قصير')
  })

  it('collapses whitespace without changing meaning', () => {
    expect(truncateForMetadata('a   b\n\nc')).toBe('a b c')
  })
})

// ===========================================================================
// 8. Trusted origin resolution
// ===========================================================================
describe('trusted origin resolution', () => {
  it('prefers NEXT_PUBLIC_APP_URL', () => {
    expect(
      resolvePublicOrigin({
        NEXT_PUBLIC_APP_URL: 'https://a.example.com',
        BETTER_AUTH_URL: 'https://b.example.com',
      })
    ).toBe('https://a.example.com')
  })

  it('falls back through the project convention order', () => {
    expect(resolvePublicOrigin({ BETTER_AUTH_URL: 'https://b.example.com' })).toBe(
      'https://b.example.com'
    )
    expect(resolvePublicOrigin({ VERCEL_URL: 'x.vercel.app' })).toBe('https://x.vercel.app')
  })

  it('adds https when the protocol is missing and strips trailing slashes', () => {
    expect(resolvePublicOrigin({ NEXT_PUBLIC_APP_URL: 'example.com/' })).toBe(
      'https://example.com'
    )
  })

  it('returns null when nothing is configured (never guesses)', () => {
    expect(resolvePublicOrigin({})).toBeNull()
  })

  it('ignores blank values', () => {
    expect(resolvePublicOrigin({ NEXT_PUBLIC_APP_URL: '   ', VERCEL_URL: 'x.vercel.app' })).toBe(
      'https://x.vercel.app'
    )
  })

  it('never derives an origin from a request Host header', () => {
    // `headers` is not consulted at all — the resolver is env-only.
    expect(resolvePublicOrigin({ HOST: 'evil.example.com', host: 'evil.example.com' })).toBeNull()
  })
})

describe('absoluteUrl', () => {
  it('builds an absolute URL from a path and origin', () => {
    expect(absoluteUrl('/ar/tenants/x', 'https://a.example.com')).toBe(
      'https://a.example.com/ar/tenants/x'
    )
  })

  it('returns null without an origin (never a relative metadata URL)', () => {
    expect(absoluteUrl('/ar/tenants/x', null)).toBeNull()
  })
})
