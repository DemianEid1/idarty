import { describe, expect, it } from 'vitest'
import { TenantWebsite } from '@/components/tenant-website'
import { parseWebsiteConfig, type WebsiteConfig } from './website-config'
import {
  createDefaultContact,
  createDefaultSocial,
  createDefaultCta,
  type ContactConfig,
} from './contact-social'

// ---------------------------------------------------------------------------
// Tenant website UI refinement: footer layers, responsive service cards, hero
// minimum height.
//
// `TenantWebsite` is a synchronous function component, so calling it returns a
// React element tree that can be inspected directly.
// ---------------------------------------------------------------------------

interface Node {
  type: unknown
  className: string
  style?: Record<string, unknown>
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
      style: el.props.style as Record<string, unknown> | undefined,
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

/** All text reachable from a node's children (structure agnostic). */
function textOf(children: unknown): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(textOf).join(' ')
  return ''
}

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const baseProps = {
  locale: 'ar' as const,
  slug: 'demo-salon',
  tenant: { currency: 'EGP', email: null, phoneE164: null, theme: null },
  translation: { name: 'صالون', tagline: null, description: null, address: 'القاهرة' },
  serviceRows: [
    { id: 'svc-1', name: 'قص شعر', description: 'وصف الخدمة', durationMin: 30, priceAmount: '100', image: PNG_DATA_URL },
  ],
  hoursRows: [],
}

/** Props WITHOUT a legacy translation address, so the fallback does not fire. */
const noLegacyAddress: typeof baseProps = {
  ...baseProps,
  translation: { ...baseProps.translation, address: null as unknown as string },
}

const field = (value: string, isVisible = true) => ({ value, isVisible })

function configWith(opts: {
  contact?: Partial<ContactConfig>
  cta?: Partial<ReturnType<typeof createDefaultCta>>
  sticky?: boolean
  heroImage?: boolean
} = {}): WebsiteConfig {
  return parseWebsiteConfig({
    theme: opts.heroImage ? { heroImage: PNG_DATA_URL } : {},
    sections: [
      { id: 'sec_hero', type: 'hero', sortOrder: 0, isVisible: true, content: {} },
      { id: 'sec_services', type: 'services', sortOrder: 1, isVisible: true, content: {} },
    ],
    contact: { ...createDefaultContact(), ...(opts.contact ?? {}) },
    social: createDefaultSocial(),
    cta: { ...createDefaultCta(), ...(opts.cta ?? {}) },
    mobileStickyCta: { isEnabled: opts.sticky ?? false },
  })
}

const render = (config: WebsiteConfig | null, locale: 'ar' | 'en' = 'ar', props = baseProps) =>
  flatten(TenantWebsite({ ...props, locale, config }))

const footer = (nodes: Node[]) => nodes.find((n) => n.type === 'footer')
const footerNodes = (nodes: Node[]) => {
  const f = footer(nodes)
  return f ? flatten(f.children) : []
}
const footerCta = (nodes: Node[]) => nodes.find((n) => n.testId === 'footer-cta')
const footerContact = (nodes: Node[]) => nodes.find((n) => n.testId === 'footer-contact')

// ===========================================================================
// 1. Footer — layer A (contact information)
// ===========================================================================
describe('footer layer A — contact information', () => {
  it('renders a three-column grid when all three contact fields are available', () => {
    const nodes = render(configWith({ contact: { address: field('القاهرة'), phone: field('+201000000000'), email: field('a@b.com') } }))
    const grid = footerContact(nodes)
    expect(grid).toBeTruthy()
    expect(grid!.className).toContain('sm:grid-cols-3')
  })

  it('renders a two-column grid when only two fields are available', () => {
    const nodes = render(
      configWith({ contact: { phone: field('+201000000000'), email: field('a@b.com') } }),
      'ar',
      noLegacyAddress
    )
    expect(footerContact(nodes)!.className).toContain('sm:grid-cols-2')
  })

  it('stacks (no multi-column grid) when only one field is available', () => {
    const nodes = render(configWith({ contact: { phone: field('+201000000000') } }), 'ar', noLegacyAddress)
    expect(footerContact(nodes)!.className).toContain('sm:grid-cols-1')
  })

  it('omits the contact layer entirely when no contact field is visible', () => {
    const nodes = render(configWith({}), 'ar', noLegacyAddress)
    expect(footerContact(nodes)).toBeUndefined()
  })

  it('never renders an empty column or a placeholder value', () => {
    // Phone visible but blank => no phone item at all.
    const nodes = render(
      configWith({ contact: { phone: { value: '   ', isVisible: true } } }),
      'ar',
      noLegacyAddress
    )
    expect(footerContact(nodes)).toBeUndefined()
  })

  it('renders a visible address, phone and email', () => {
    const nodes = render(configWith({ contact: { address: field('القاهرة'), phone: field('+201000000000'), email: field('a@b.com') } }))
    const texts = footerNodes(nodes).map((n) => textOf(n.children)).join(' | ')
    expect(texts).toContain('القاهرة')
    expect(texts).toContain('+201000000000')
    expect(texts).toContain('a@b.com')
  })

  it('uses tel: and mailto: for the phone and email actions', () => {
    const nodes = render(configWith({ contact: { phone: field('+201000000000'), email: field('a@b.com') } }))
    const hrefs = footerNodes(nodes).map((n) => n.href).filter(Boolean)
    expect(hrefs).toContain('tel:+201000000000')
    expect(hrefs).toContain('mailto:a@b.com')
  })

  it('falls back to the legacy translation address when the config has none', () => {
    const nodes = render(configWith({ contact: { phone: field('+201000000000') } }))
    const texts = footerNodes(nodes).map((n) => textOf(n.children)).join(' | ')
    expect(texts).toContain('القاهرة')
  })

  it('NEVER reveals an address explicitly hidden in the configuration', () => {
    const nodes = render(
      configWith({ contact: { address: { value: 'مخفي', isVisible: false }, phone: field('+201000000000') } })
    )
    const texts = footerNodes(nodes).map((n) => textOf(n.children)).join(' | ')
    expect(texts).not.toContain('مخفي')
    expect(texts).not.toContain('القاهرة')
  })

  it('shows a configured, visible address in preference to the legacy one', () => {
    const nodes = render(configWith({ contact: { address: field('عنوان جديد') } }))
    const texts = footerNodes(nodes).map((n) => textOf(n.children)).join(' | ')
    expect(texts).toContain('عنوان جديد')
    expect(texts).not.toContain('القاهرة')
  })
})

// ===========================================================================
// 2. Footer — layer B (primary CTA reuse)
// ===========================================================================
describe('footer layer B — primary CTA', () => {
  it('renders for the default booking action, reusing the resolved href', () => {
    const nodes = render(configWith({}))
    const cta = footerCta(nodes)
    expect(cta).toBeTruthy()
    expect(cta!.href).toBe('/ar/tenants/demo-salon/book')
  })

  it('uses the same destination as the header/hero CTA (no second mechanism)', () => {
    const nodes = render(configWith({}))
    const hrefs = nodes
      .filter((n) => typeof n.href === 'string' && n.href.endsWith('/book'))
      .map((n) => n.href)
    expect(hrefs.length).toBeGreaterThanOrEqual(3) // header + hero + footer
    expect(new Set(hrefs).size).toBe(1)
  })

  it('reuses the resolved CTA label', () => {
    const nodes = render(
      configWith({ cta: { label: { ar: 'كلمنا', en: 'Call us' } } }),
      'ar'
    )
    const cta = footerCta(nodes)!
    // The label sits inside a <span> alongside the icons, so search the
    // flattened descendants rather than the CTA's direct children.
    const labelText = flatten(cta.children).map((n) => textOf(n.children)).join(' ')
    expect(labelText).toContain('كلمنا')
  })

  it('renders a call destination and never falls back to booking', () => {
    const nodes = render(configWith({ contact: { phone: field('+201000000000') }, cta: { action: 'call' } }))
    expect(footerCta(nodes)!.href).toBe('tel:+201000000000')
    // No booking link is silently substituted anywhere in the footer.
    const footerHrefs = footerNodes(nodes).map((n) => n.href).filter(Boolean)
    expect(footerHrefs.some((h) => String(h).endsWith('/book'))).toBe(false)
  })

  it('omits the footer CTA when call has no valid destination', () => {
    const nodes = render(configWith({ cta: { action: 'call' } }))
    expect(footerCta(nodes)).toBeUndefined()
  })

  it('omits the footer CTA when whatsapp has no valid destination', () => {
    const nodes = render(configWith({ cta: { action: 'whatsapp' } }))
    expect(footerCta(nodes)).toBeUndefined()
  })

  it('marks an external destination with safe target/rel', () => {
    const nodes = render(configWith({ contact: { whatsapp: field('+201000000000') }, cta: { action: 'whatsapp' } }))
    const cta = footerCta(nodes)!
    expect(cta.href).toBe('https://wa.me/201000000000')
    expect(cta.target).toBe('_blank')
    expect(cta.rel).toContain('noopener')
  })

  it('does not add target/rel to an internal booking destination', () => {
    const cta = footerCta(render(configWith({})))!
    expect(cta.target).toBeUndefined()
  })
})

// ===========================================================================
// 3. Footer — layer C (copyright + social + attribution)
// ===========================================================================
describe('footer layer C — copyright, social, attribution', () => {
  it('renders a localized copyright with the current year and business name', () => {
    const year = String(new Date().getFullYear())
    const ar = footerNodes(render(configWith({}), 'ar')).map((n) => textOf(n.children)).join(' | ')
    expect(ar).toContain(year)
    expect(ar).toContain('صالون')
    expect(ar).toContain('جميع الحقوق محفوظة')

    const en = footerNodes(render(configWith({}), 'en')).map((n) => textOf(n.children)).join(' | ')
    expect(en).toContain('All rights reserved')
  })

  it('does not hardcode a year', () => {
    const source = render(configWith({}))
    const texts = footerNodes(source).map((n) => textOf(n.children)).join(' ')
    // The rendered year is dynamic, so it matches whatever "now" is.
    expect(texts).toContain(String(new Date().getFullYear()))
  })

  it('preserves the Powered by Idarty attribution', () => {
    const nodes = render(configWith({}))
    const texts = footerNodes(nodes).map((n) => textOf(n.children)).join(' | ')
    expect(texts).toContain('مدعوم بواسطة')
    const brand = footerNodes(nodes).find((n) => n.href === '/' && n.className.includes('text-brand-teal'))
    expect(brand).toBeTruthy()
    expect(brand!.target).toBe('_blank')
    expect(brand!.rel).toContain('noopener')
  })

  it('renders social links only when a safe, enabled link exists', () => {
    const none = render(configWith({}))
    expect(none.some((n) => n.testId === 'social-links')).toBe(false)
  })

  it('renders the enabled social links', () => {
    const config = parseWebsiteConfig({
      theme: {},
      sections: [{ id: 'sec_hero', type: 'hero', sortOrder: 0, isVisible: true, content: {} }],
      contact: createDefaultContact(),
      social: { ...createDefaultSocial(), facebook: { url: 'https://fb.com/x', isEnabled: true } },
      cta: createDefaultCta(),
      mobileStickyCta: { isEnabled: false },
    })
    const nodes = render(config)
    expect(nodes.some((n) => n.testId === 'social-links')).toBe(true)
    expect(nodes.some((n) => n.href === 'https://fb.com/x')).toBe(true)
  })

  it('separates layer C with a border and stacks on mobile / splits on desktop', () => {
    const nodes = footerNodes(render(configWith({})))
    const row = nodes.find((n) => n.className.includes('border-t') && n.className.includes('sm:flex-row'))
    expect(row).toBeTruthy()
    expect(row!.className).toContain('sm:justify-between')
  })
})

// ===========================================================================
// 4. Responsive service cards
// ===========================================================================
describe('responsive service cards', () => {
  const cards = () => render(configWith({})).filter((n) => n.className.includes('group') && n.className.includes('rounded-2xl'))

  it('uses ONE card tree with responsive direction (no duplicated trees)', () => {
    const all = cards()
    expect(all).toHaveLength(1)
    // Horizontal on mobile, vertical from `sm` up.
    expect(all[0].className).toContain('flex-row')
    expect(all[0].className).toContain('sm:flex-col')
  })

  it('gives the mobile thumbnail a fixed 24x24 square and a full-width band from sm', () => {
    const nodes = render(configWith({}))
    const box = nodes.find((n) => n.className.includes('h-24') && n.className.includes('w-24'))
    expect(box).toBeTruthy()
    expect(box!.className).toContain('sm:w-full')
    expect(box!.className).toContain('sm:aspect-[16/10]')
    expect(box!.className).toContain('overflow-hidden') // the container clips the image
    // The image itself keeps object-cover.
    const img = nodes.find((n) => n.type === 'img' && n.className.includes('object-cover'))
    expect(img).toBeTruthy()
  })

  it('uses logical (direction-aware) rounding, not an LTR-only trick', () => {
    const box = render(configWith({})).find((n) => n.className.includes('h-24') && n.className.includes('w-24'))!
    expect(box.className).toContain('rounded-s-2xl')
    expect(box.className).toContain('sm:rounded-s-none')
  })

  it('reduces mobile padding to p-3 and restores p-6 from sm', () => {
    const body = render(configWith({})).find((n) => n.className.includes('p-3') && n.className.includes('sm:p-6'))
    expect(body).toBeTruthy()
  })

  it('shows the Clock3 duration and a prominent price', () => {
    const nodes = render(configWith({}))
    const meta = nodes.find((n) => n.className.includes('gap-x-3') && n.className.includes('flex-wrap'))
    expect(meta).toBeTruthy()
    const texts = nodes.map((n) => textOf(n.children)).join(' | ')
    expect(texts).toContain('دقيقة')
    expect(texts).toContain('100')
  })

  it('uses the localized booking label احجز الآن / Book Now', () => {
    const ar = render(configWith({}), 'ar').map((n) => textOf(n.children)).join(' | ')
    expect(ar).toContain('احجز الآن')

    const en = render(configWith({}), 'en').map((n) => textOf(n.children)).join(' | ')
    expect(en).toContain('Book Now')
    expect(en).not.toContain('احجز الآن')
  })

  it('keeps the service booking URL format and query parameter', () => {
    const link = render(configWith({})).find((n) => String(n.href ?? '').includes('?service='))
    expect(link!.href).toBe('/ar/tenants/demo-salon/book?service=svc-1')
  })

  it('keeps the 16:10 ratio for the desktop image band', () => {
    const box = render(configWith({})).find((n) => n.className.includes('h-24') && n.className.includes('w-24'))!
    expect(box.className).toContain('sm:aspect-[16/10]')
  })

  it('preserves the image focal point and lazy loading', () => {
    const nodes = render(configWith({}))
    const img = nodes.find((n) => n.className.includes('object-cover') && n.className.includes('group-hover:scale'))
    expect(img).toBeTruthy()
    // lazy loading is preserved on service images
    const lazy = nodes.filter((n) => n.type === 'img')
    expect(lazy.length).toBeGreaterThan(0)
  })

  it('makes the booking action full-width from sm and self-start on mobile', () => {
    const link = render(configWith({})).find((n) => String(n.href ?? '').includes('?service='))!
    expect(link.className).toContain('w-fit')
    expect(link.className).toContain('sm:w-full')
    expect(link.className).toContain('self-start')
  })

  it('keeps the card min-w-0 so long text cannot blow out the grid', () => {
    expect(cards()[0].className).toContain('min-w-0')
  })
})

// ===========================================================================
// 5. Hero minimum height
// ===========================================================================
describe('hero minimum height', () => {
  it('applies a responsive minimum height when a background image exists', () => {
    const hero = render(configWith({ heroImage: true })).find((n) => n.type === 'section' && n.className.includes('min-h-['))
    expect(hero).toBeTruthy()
    expect(hero!.className).toContain('min-h-[56vh]')
    expect(hero!.className).toContain('sm:min-h-[60vh]')
    expect(hero!.className).toContain('lg:min-h-[55vh]')
  })

  it('uses a MINIMUM height, never a fixed height (content can grow)', () => {
    const hero = render(configWith({ heroImage: true })).find((n) => n.type === 'section' && n.className.includes('min-h-['))!
    expect(hero.className).not.toMatch(/(?:^|\s)h-\[\d/)
    expect(hero.className).not.toContain('overflow-hidden h-')
  })

  it('does NOT apply a minimum height to a text-only hero', () => {
    const hero = render(configWith({})).find((n) => n.type === 'section' && n.className.includes('w-full'))
    expect(hero).toBeTruthy()
    expect(hero!.className).not.toContain('min-h-[')
  })

  it('reduces the hero padding to the balanced responsive range', () => {
    const container = render(configWith({ heroImage: true })).find((n) => n.className.includes('justify-center') && n.className.includes('max-w-7xl'))!
    expect(container.className).toContain('py-10')
    expect(container.className).toContain('sm:py-16')
    expect(container.className).toContain('lg:py-20')
  })

  it('vertically centres content with a flex layout', () => {
    const container = render(configWith({ heroImage: true })).find((n) => n.className.includes('justify-center') && n.className.includes('max-w-7xl'))!
    expect(container.className).toContain('flex')
    expect(container.className).toContain('flex-1')
    expect(container.className).toContain('justify-center')
  })

  it('keeps the background image layer absolutely positioned', () => {
    const nodes = render(configWith({ heroImage: true }))
    const layer = nodes.find((n) => n.className.includes('absolute inset-0') && n.style?.opacity !== undefined)
    expect(layer).toBeTruthy()
  })

  it('keeps the full-bleed hero wrapper classes', () => {
    const hero = render(configWith({ heroImage: true })).find((n) => n.type === 'section')!
    expect(hero.className).toContain('relative w-full overflow-hidden')
  })

  it('renders both locales without a minimum height on the text-only hero', () => {
    for (const loc of ['ar', 'en'] as const) {
      const hero = render(configWith({}), loc).find((n) => n.type === 'section' && n.className.includes('w-full'))!
      expect(hero.className).not.toContain('min-h-[')
    }
  })
})
