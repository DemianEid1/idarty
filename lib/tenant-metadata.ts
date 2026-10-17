import type { Metadata } from 'next'
import type { Locale } from '@/lib/i18n'
import { resolvePublicOrigin, resolvePublicImageUrl, truncateForMetadata } from '@/lib/site-url'

// ---------------------------------------------------------------------------
// Public tenant page metadata.
//
// Built from PUBLISHED public data only:
//   * the tenant's published translation (name / tagline / description)
//   * the tenant's PUBLISHED website configuration (hero image, hero headline)
//
// Draft website configuration is never read here, and internal identifiers
// (tenant id, membership ids, slug-as-id) are never emitted.
//
// The builder is a pure function so it can be unit tested without a database.
// ---------------------------------------------------------------------------

export interface TenantMetadataInput {
  locale: Locale
  slug: string
  /** Localized translation, already resolved to the requested locale. */
  translation: {
    name: string
    tagline: string | null
    description: string | null
  } | null
  /** Published website config (or null when the tenant has never published). */
  publishedConfig: {
    theme?: { heroImage?: string; logo?: string } | null
    sections?: Array<{ type: string; content?: { ar?: Record<string, string>; en?: Record<string, string> } }> | null
  } | null
  /** Trusted absolute origin, or null when none is configured. */
  origin?: string | null
}

const FALLBACK_TITLE: Record<Locale, string> = {
  ar: 'مساحة عمل',
  en: 'Workspace',
}

const FALLBACK_DESCRIPTION: Record<Locale, string> = {
  ar: 'اختر الخدمة والوقت المناسبين لك.',
  en: 'Choose a service and a time that works for you.',
}

const OG_LOCALE: Record<Locale, string> = {
  ar: 'ar_EG',
  en: 'en_US',
}

/** The tenant's public path for a locale. */
export function tenantPublicPath(locale: Locale, slug: string): string {
  return `/${locale}/tenants/${encodeURIComponent(slug)}`
}

/**
 * The hero headline a visitor actually sees, from the PUBLISHED config.
 * Mirrors the renderer's precedence (locale first, then the other locale).
 */
function publishedHeroHeadline(input: TenantMetadataInput): string | null {
  const hero = input.publishedConfig?.sections?.find((s) => s.type === 'hero')
  if (!hero?.content) return null
  const own = hero.content[input.locale]?.headline
  const other = hero.content[input.locale === 'ar' ? 'en' : 'ar']?.headline
  const value = (own || other || '').trim()
  return value || null
}

/**
 * Build the metadata object for a public tenant page.
 *
 * Every optional field degrades safely: a missing description, a missing image,
 * or an unconfigured origin simply omits that field rather than emitting a
 * placeholder or a relative URL.
 */
export function buildTenantMetadata(input: TenantMetadataInput): Metadata {
  const { locale, slug } = input
  const origin = input.origin === undefined ? resolvePublicOrigin() : input.origin

  const name = (input.translation?.name || '').trim() || FALLBACK_TITLE[locale]
  const rawDescription =
    (input.translation?.description || '').trim() ||
    (input.translation?.tagline || '').trim() ||
    publishedHeroHeadline(input) ||
    FALLBACK_DESCRIPTION[locale]
  const description = truncateForMetadata(rawDescription)

  const path = tenantPublicPath(locale, slug)
  const canonical = origin ? `${origin}${path}` : null

  // Only an ABSOLUTE http(s) image can be crawled. Stored hero images are base64
  // data URLs, so this is normally null and the image is omitted.
  const image = resolvePublicImageUrl(input.publishedConfig?.theme?.heroImage)

  const metadata: Metadata = {
    title: name,
    description,
    openGraph: {
      title: name,
      description,
      type: 'website',
      siteName: name,
      locale: OG_LOCALE[locale],
      ...(canonical ? { url: canonical } : {}),
      ...(image ? { images: [{ url: image, alt: name }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: name,
      description,
      ...(image ? { images: [image] } : {}),
    },
  }

  // Canonical + language alternates are emitted ONLY when a trusted origin is
  // configured, so a relative or wrong-domain URL is never published.
  if (canonical) {
    metadata.alternates = {
      canonical,
      languages: {
        ar: `${origin}${tenantPublicPath('ar', slug)}`,
        en: `${origin}${tenantPublicPath('en', slug)}`,
      },
    }
  }

  return metadata
}
