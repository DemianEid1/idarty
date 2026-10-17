import { describe, expect, it } from 'vitest'
import { TenantWebsite } from '@/components/tenant-website'
import { parseWebsiteConfig } from './website-config'

// ---------------------------------------------------------------------------
// Public tenant website — hero loading priority and the footer branding link.
//
// `TenantWebsite` is a synchronous function component, so calling it returns a
// React element tree that can be inspected directly.
// ---------------------------------------------------------------------------

interface Node {
  type: unknown
  className: string
  href?: string
  target?: string
  rel?: string
  src?: string
  alt?: string
  fetchPriority?: string
  decoding?: string
  loading?: string
  children: unknown
}

function flatten(node: unknown, depth = 0, out: Node[] = []): Node[] {
  if (depth > 40 || node === null || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const c of node) flatten(c, depth + 1, out)
    return out
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> }
  if (el.props && el.type !== undefined) {
    out.push({
      type: el.type,
      className: String(el.props.className ?? ''),
      href: el.props.href as string | undefined,
      target: el.props.target as string | undefined,
      rel: el.props.rel as string | undefined,
      src: el.props.src as string | undefined,
      alt: el.props.alt as string | undefined,
      fetchPriority: el.props.fetchPriority as string | undefined,
      decoding: el.props.decoding as string | undefined,
      loading: el.props.loading as string | undefined,
      children: el.props.children,
    })
    if (typeof el.type === 'function') {
      try {
        flatten((el.type as (p: Record<string, unknown>) => unknown)(el.props), depth + 1, out)
      } catch {
        /* not a plain function component */
      }
    }
    flatten(el.props.children, depth + 1, out)
  }
  return out
}

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const baseProps = {
  locale: 'ar' as const,
  slug: 'demo-salon',
  tenant: { currency: 'EGP', email: null, phoneE164: null, theme: null },
  translation: { name: 'صالون', tagline: null, description: null, address: null },
  serviceRows: [
    { id: 'svc-1', name: 'خدمة', description: null, durationMin: 30, priceAmount: '100', image: PNG_DATA_URL },
  ],
  hoursRows: [],
}

const configWithHero = (crop: boolean) =>
  parseWebsiteConfig({
    theme: {
      heroImage: PNG_DATA_URL,
      ...(crop ? { heroImageCrop: { x: 0, y: 0, width: 1, height: 1 } } : {}),
    },
    sections: [
      { id: 'sec_hero', type: 'hero', sortOrder: 0, isVisible: true, content: {} },
      // The services section is needed for the service-card images (which must
      // stay lazy) and the service-specific booking link.
      { id: 'sec_services', type: 'services', sortOrder: 1, isVisible: true, content: {} },
    ],
  })

const render = (config: ReturnType<typeof parseWebsiteConfig> | null) =>
  flatten(TenantWebsite({ ...baseProps, config }))

// ===========================================================================
// 1. Hero loading priority
// ===========================================================================
describe('hero image loading priority', () => {
  it('marks the hero <img> high priority (crop rendering path)', () => {
    const imgs = render(configWithHero(true)).filter((n) => n.type === 'img')
    const hero = imgs.find((n) => n.src === PNG_DATA_URL && n.className.includes('object-cover'))
    expect(hero).toBeTruthy()
    expect(hero!.fetchPriority).toBe('high')
  })

  it('decodes the hero asynchronously', () => {
    const hero = render(configWithHero(true))
      .filter((n) => n.type === 'img')
      .find((n) => n.src === PNG_DATA_URL && n.className.includes('object-cover'))
    expect(hero!.decoding).toBe('async')
  })

  it('does NOT defer the hero with loading="lazy"', () => {
    const hero = render(configWithHero(true))
      .filter((n) => n.type === 'img')
      .find((n) => n.src === PNG_DATA_URL && n.className.includes('object-cover'))
    expect(hero!.loading).toBeUndefined()
  })

  it('keeps service-card images lazy', () => {
    const serviceImgs = render(configWithHero(true)).filter(
      (n) => n.type === 'img' && n.loading === 'lazy'
    )
    expect(serviceImgs.length).toBeGreaterThan(0)
    // The lazy images are never the hero.
    for (const img of serviceImgs) expect(img.fetchPriority).not.toBe('high')
  })

  it('does not eager-load every image on the page', () => {
    const eager = render(configWithHero(true)).filter((n) => n.fetchPriority === 'high')
    expect(eager).toHaveLength(1)
  })

  it('renders no hero <img> at all when there is no hero image', () => {
    const imgs = render(null).filter((n) => n.type === 'img')
    expect(imgs.every((n) => n.fetchPriority !== 'high')).toBe(true)
  })

  it('preserves the crop layer wrapper and object-cover classes', () => {
    const hero = render(configWithHero(true))
      .filter((n) => n.type === 'img')
      .find((n) => n.fetchPriority === 'high')!
    expect(hero.className).toContain('object-cover')
    expect(hero.className).toContain('h-full')
    expect(hero.className).toContain('w-full')
  })

  it('uses a CSS background (not an <img>) on the no-crop path', () => {
    const nodes = render(configWithHero(false))
    // No high-priority <img> exists on this path — it is a background image.
    expect(nodes.filter((n) => n.type === 'img' && n.fetchPriority === 'high')).toHaveLength(0)
  })
})

// ===========================================================================
// 2. Footer branding link
// ===========================================================================
describe('footer branding link', () => {
  const footerBrand = (locale: 'ar' | 'en' = 'ar') => {
    const nodes = flatten(TenantWebsite({ ...baseProps, locale, config: null }))
    // The Idarty mark link: href="/" with the branding aria-label.
    return nodes.find((n) => n.href === '/' && n.className.includes('text-brand-teal'))
  }

  it('opens in a new tab', () => {
    const link = footerBrand()
    expect(link).toBeTruthy()
    expect(link!.target).toBe('_blank')
  })

  it('carries a safe rel value', () => {
    const link = footerBrand()
    expect(link!.rel).toContain('noopener')
    expect(link!.rel).toContain('noreferrer')
  })

  it('preserves the destination', () => {
    expect(footerBrand()!.href).toBe('/')
  })

  it('preserves the branding text in both locales', () => {
    const ar = flatten(TenantWebsite({ ...baseProps, locale: 'ar', config: null }))
    const en = flatten(TenantWebsite({ ...baseProps, locale: 'en', config: null }))
    const textOf = (nodes: Node[]) => {
      const link = nodes.find((n) => n.href === '/' && n.className.includes('text-brand-teal'))!
      return flatten(link.children).map((n) => n.children).filter((c) => typeof c === 'string')
    }
    expect(textOf(ar)).toContain('إدارتي')
    expect(textOf(en)).toContain('Idarty')
  })

  it('does not change service booking links', () => {
    const nodes = render(configWithHero(true))
    const service = nodes.find((n) => typeof n.href === 'string' && n.href.includes('?service='))
    expect(service?.href).toBe('/ar/tenants/demo-salon/book?service=svc-1')
    expect(service?.target).toBeUndefined()
  })
})
