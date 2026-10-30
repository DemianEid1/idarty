import { describe, expect, it } from 'vitest'
import { TenantWebsite } from '@/components/tenant-website'
import { parseWebsiteConfig, type WebsiteConfig } from './website-config'
import { createDefaultContact, createDefaultSocial, createDefaultCta } from './contact-social'

// ---------------------------------------------------------------------------
// Public tenant website — navigation isolation.
//
// The public tenant website must not expose a way back to the Idarty landing
// page or the dashboard. Its ONLY legitimate navigation targets are:
//
//   1. the tenant's own pages     -> /{locale}/tenants/{slug}...
//   2. in-page section anchors    -> #services
//   3. external contact/social    -> tel:, mailto:, https://wa.me/..., maps
//
// `TenantWebsite` is a synchronous function component, so calling it returns a
// React element tree that can be inspected directly — no Playwright needed.
// ---------------------------------------------------------------------------

interface Node {
  type: unknown
  className: string
  href?: string
  target?: string
  rel?: string
  testId?: string
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
      testId: el.props['data-testid'] as string | undefined,
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

function textOf(children: unknown): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(textOf).join(' ')
  return ''
}

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const SLUG = 'bebo-salon'

const baseProps = {
  slug: SLUG,
  tenant: { currency: 'EGP', email: null, phoneE164: null, theme: null },
  translation: { name: 'صالون بيبو', tagline: null, description: null, address: 'القاهرة' },
  serviceRows: [
    { id: 'svc-1', name: 'قص شعر', description: 'وصف', durationMin: 30, priceAmount: '100', image: PNG_DATA_URL },
  ],
  hoursRows: [],
}

/** A config with all three sections visible and every contact/social field on. */
function fullConfig() {
  return parseWebsiteConfig({
    theme: {},
    sections: [
      { id: 'sec_hero', type: 'hero', sortOrder: 0, isVisible: true, content: {} },
      { id: 'sec_services', type: 'services', sortOrder: 1, isVisible: true, content: {} },
      { id: 'sec_contact', type: 'contact', sortOrder: 2, isVisible: true, content: {} },
    ],
    contact: {
      ...createDefaultContact(),
      phone: { value: '+201234567890', isVisible: true },
      email: { value: 'hello@bebo.com', isVisible: true },
      address: { value: 'شارع النيل', isVisible: true },
      googleMapsUrl: { value: 'https://maps.google.com/?q=bebo', isVisible: true },
      whatsapp: { value: '+201234567890', isVisible: true },
    },
    social: {
      ...createDefaultSocial(),
      facebook: { url: 'https://facebook.com/bebo', isEnabled: true },
      instagram: { url: 'https://instagram.com/bebo', isEnabled: true },
    },
    cta: createDefaultCta(),
    mobileStickyCta: { isEnabled: true },
  })
}

const defaultBranches = [
  {
    id: 'b1',
    name: 'الفرع الرئيسي',
    address: 'شارع النيل',
    googleMapsUrl: 'https://maps.google.com/?q=bebo',
    isDefault: true,
  },
]

const render = (config: WebsiteConfig | null, locale: 'ar' | 'en' = 'ar', branches = defaultBranches) =>
  flatten(TenantWebsite({ ...baseProps, locale, config, branches }))

const links = (nodes: Node[]) => nodes.filter((n) => typeof n.href === 'string' && n.href.length > 0)

const footer = (nodes: Node[]) => {
  const start = nodes.findIndex((n) => n.type === 'footer')
  return start === -1 ? [] : nodes.slice(start)
}

describe('1. the Idarty footer attribution is not a link', () => {
  it('renders no anchor with href="/" anywhere on the public site', () => {
    const nodes = render(fullConfig())
    expect(links(nodes).filter((n) => n.href === '/')).toEqual([])
  })

  it('the attribution text is still present (appearance preserved)', () => {
    const nodes = footer(render(fullConfig()))
    const texts = nodes.map((n) => textOf(n.children)).join(' | ')
    expect(texts).toContain('مدعوم بواسطة')
    expect(texts).toContain('إدارتي')
  })

  it('the attribution carries no navigation handler or link attributes', () => {
    const nodes = render(fullConfig())
    const brand = nodes.find((n) => n.className.includes('text-brand-teal') && n.className.includes('font-semibold'))
    expect(brand).toBeTruthy()
    expect(brand!.href).toBeUndefined()
    expect(brand!.target).toBeUndefined()
    expect(brand!.rel).toBeUndefined()
    // A <span>, never an anchor/Link.
    expect(String(brand!.type)).not.toBe('a')
  })

  it('the attribution is non-interactive in both locales', () => {
    for (const locale of ['ar', 'en'] as const) {
      const nodes = render(fullConfig(), locale)
      expect(links(nodes).filter((n) => n.href === '/')).toEqual([])
      const brand = nodes.find(
        (n) => n.className.includes('text-brand-teal') && n.className.includes('font-semibold')
      )
      expect(brand!.href).toBeUndefined()
    }
  })

  it('does not use the cursor-pointer affordance on the attribution', () => {
    const nodes = render(fullConfig())
    const brand = nodes.find((n) => n.className.includes('text-brand-teal') && n.className.includes('font-semibold'))
    expect(brand!.className).not.toContain('cursor-pointer')
  })
})

describe('2. no unintended dashboard or admin navigation is exposed', () => {
  it('contains no link to any dashboard route', () => {
    for (const locale of ['ar', 'en'] as const) {
      const hrefs = links(render(fullConfig(), locale)).map((n) => n.href!)
      expect(hrefs.filter((h) => h.includes('dashboard'))).toEqual([])
    }
  })

  it('contains no link to the platform admin area', () => {
    const hrefs = links(render(fullConfig())).map((n) => n.href!)
    expect(hrefs.filter((h) => h.includes('/admin'))).toEqual([])
  })

  it('contains no link to the Idarty landing page', () => {
    const hrefs = links(render(fullConfig())).map((n) => n.href!)
    expect(hrefs.filter((h) => h === '/' || h === '/ar' || h === '/en')).toEqual([])
  })
})

describe('3. every internal link stays inside the tenant', () => {
  it('all site-internal links are tenant-scoped or in-page anchors', () => {
    for (const locale of ['ar', 'en'] as const) {
      const internal = links(render(fullConfig(), locale)).filter(
        (n) => n.href!.startsWith('/') && !n.href!.startsWith('//')
      )
      for (const link of internal) {
        const ok =
          link.href!.startsWith(`/${locale}/tenants/${SLUG}`) || link.href!.startsWith('#')
        expect(ok, `unexpected internal link: ${link.href}`).toBe(true)
      }
    }
  })

  it('the tenant logo/header link points at the tenant homepage', () => {
    const header = render(fullConfig()).slice(
      render(fullConfig()).findIndex((n) => n.type === 'header'),
      render(fullConfig()).findIndex((n) => n.type === 'footer')
    )
    const brandLink = header.find((n) => typeof n.href === 'string' && n.href.includes('/tenants/'))
    expect(brandLink).toBeTruthy()
    expect(brandLink!.href).toBe(`/ar/tenants/${SLUG}`)
  })

  it('the tenant logo link preserves the slug in both locales', () => {
    for (const locale of ['ar', 'en'] as const) {
      const nodes = render(fullConfig(), locale)
      const header = nodes.slice(
        nodes.findIndex((n) => n.type === 'header'),
        nodes.findIndex((n) => n.type === 'footer')
      )
      const brandLink = header.find((n) => typeof n.href === 'string' && n.href.includes('/tenants/'))
      expect(brandLink!.href).toBe(`/${locale}/tenants/${SLUG}`)
    }
  })
})

describe('4. booking CTAs still navigate to the correct tenant booking route', () => {
  it('the hero booking CTA targets the tenant booking route', () => {
    const hero = render(fullConfig()).find((n) => n.testId === 'hero-booking-cta')
    expect(hero).toBeTruthy()
    expect(hero!.href).toBe(`/ar/tenants/${SLUG}/book`)
  })

  it('each service card books the SAME tenant with the service preselected', () => {
    const serviceLinks = links(render(fullConfig())).filter((n) => n.href!.includes('/book?service='))
    expect(serviceLinks.length).toBeGreaterThan(0)
    for (const link of serviceLinks) {
      expect(link.href).toBe(`/ar/tenants/${SLUG}/book?service=svc-1`)
    }
  })

  it('booking links preserve the locale and slug in English too', () => {
    const hero = render(fullConfig(), 'en').find((n) => n.testId === 'hero-booking-cta')
    expect(hero!.href).toBe(`/en/tenants/${SLUG}/book`)
  })
})

describe('5. legitimate functionality is NOT disabled', () => {
  it('keeps the language switcher available', () => {
    // The caller supplies it as `localeSwitch`; with no prop there is simply no
    // switcher, so assert the component still accepts and renders one.
    const nodes = flatten(
      TenantWebsite({
        ...baseProps,
        locale: 'ar',
        config: fullConfig(),
        localeSwitch: <a href={`/en/tenants/${SLUG}`} hrefLang="en">EN</a>,
      })
    )
    expect(links(nodes).some((n) => n.href === `/en/tenants/${SLUG}`)).toBe(true)
  })

  it('keeps external contact links (tel, mailto, maps, whatsapp, social)', () => {
    const hrefs = links(render(fullConfig())).map((n) => n.href!)
    expect(hrefs.some((h) => h.startsWith('tel:'))).toBe(true)
    expect(hrefs.some((h) => h.startsWith('mailto:'))).toBe(true)
    expect(hrefs.some((h) => h.startsWith('https://maps.google.com'))).toBe(true)
    expect(hrefs.some((h) => h.startsWith('https://wa.me/'))).toBe(true)
    expect(hrefs.some((h) => h === 'https://facebook.com/bebo')).toBe(true)
    expect(hrefs.some((h) => h === 'https://instagram.com/bebo')).toBe(true)
  })

  it('keeps the in-page services section anchor', () => {
    const hrefs = links(render(fullConfig())).map((n) => n.href!)
    expect(hrefs).toContain('#services')
  })

  it('keeps the mobile sticky CTA pointing at the tenant booking route', () => {
    const sticky = render(fullConfig()).find((n) => n.testId === 'mobile-sticky-cta')
    expect(sticky).toBeTruthy()
    const stickyLinks = links(flatten(sticky!.children))
    expect(stickyLinks.length).toBeGreaterThan(0)
    expect(stickyLinks[0].href).toBe(`/ar/tenants/${SLUG}/book`)
  })

  it('keeps the footer primary CTA inside the tenant', () => {
    const footerLinks = links(footer(render(fullConfig())))
    const cta = footerLinks.find((n) => n.testId === 'footer-cta')
    expect(cta).toBeTruthy()
    expect(cta!.href).toBe(`/ar/tenants/${SLUG}/book`)
  })
})
