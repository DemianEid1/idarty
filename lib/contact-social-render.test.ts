import { describe, expect, it } from 'vitest'
import { TenantWebsite } from '@/components/tenant-website'
import { createDefaultWebsiteConfig, parseWebsiteConfig, type WebsiteConfig } from './website-config'
import {
  createDefaultContact,
  createDefaultSocial,
  createDefaultCta,
  type ContactConfig,
  type CtaConfig,
} from './contact-social'

// ---------------------------------------------------------------------------
// Public renderer: CTA matrix, href safety, sticky CTA, legacy preservation.
//
// `TenantWebsite` is a synchronous function component, so calling it returns a
// React element tree that can be inspected directly — this exercises the REAL
// component rather than a re-implementation.
// ---------------------------------------------------------------------------

interface Node {
  type: unknown
  className: string
  style?: Record<string, unknown>
  href?: string
  target?: string
  rel?: string
  ariaLabel?: string
  title?: string
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
      ariaLabel: el.props['aria-label'] as string | undefined,
      title: el.props.title as string | undefined,
      testId: el.props['data-testid'] as string | undefined,
      children: el.props.children,
    })
    // Nested function components (ContactSection, SocialLinks, MobileStickyCta)
    // are separate elements in the tree. Invoke them so their rendered output is
    // inspected too — otherwise their hrefs would be invisible to these tests.
    if (typeof el.type === 'function') {
      try {
        const rendered = (el.type as (p: Record<string, unknown>) => unknown)(el.props)
        flatten(rendered, depth + 1, out)
      } catch {
        /* not a plain function component; children are flattened below */
      }
    }
    flatten(el.props.children, depth + 1, out)
  }
  return out
}

const baseProps = {
  locale: 'ar' as const,
  slug: 'demo-salon',
  tenant: { currency: 'EGP', email: null, phoneE164: null, theme: null },
  translation: { name: 'صالون', tagline: null, description: null, address: null },
  serviceRows: [
    { id: 'svc-1', name: 'خدمة', description: null, durationMin: 30, priceAmount: '100' },
  ],
  hoursRows: [],
}

const field = (value: string, isVisible = true) => ({ value, isVisible })

function configWith(opts: {
  contact?: Partial<ContactConfig>
  cta?: Partial<CtaConfig>
  sticky?: boolean
  heroCtaLabel?: string
}): WebsiteConfig {
  return parseWebsiteConfig({
    theme: {},
    sections: [
      {
        id: 'sec_hero',
        type: 'hero',
        sortOrder: 0,
        isVisible: true,
        content: opts.heroCtaLabel ? { ar: { ctaLabel: opts.heroCtaLabel }, en: {} } : {},
      },
      { id: 'sec_services', type: 'services', sortOrder: 1, isVisible: true, content: {} },
      // The Main CTA renders inside the contact section, so the fixture must
      // include it for the CTA to have a home.
      { id: 'sec_contact', type: 'contact', sortOrder: 2, isVisible: true, content: {} },
    ],
    contact: { ...createDefaultContact(), ...(opts.contact ?? {}) },
    social: createDefaultSocial(),
    cta: { ...createDefaultCta(), ...(opts.cta ?? {}) },
    mobileStickyCta: { isEnabled: opts.sticky ?? false },
  })
}

const render = (config: WebsiteConfig | null, locale: 'ar' | 'en' = 'ar') =>
  flatten(TenantWebsite({ ...baseProps, locale, config }))

const links = (nodes: Node[]) => nodes.filter((n) => typeof n.href === 'string' && n.href.length > 0)

/** The header CTA: the /book- or tel:/wa.me link inside <header><nav>. */
const headerCta = (nodes: Node[]) => {
  const nav = nodes.find((n) => n.type === 'nav')
  if (!nav) return undefined
  return flatten(nav.children).find(
    (n) =>
      typeof n.href === 'string' &&
      (n.href.endsWith('/book') || n.href.startsWith('tel:') || n.href.startsWith('https://wa.me/'))
  )
}

/**
 * The hero's OWN booking button. Identified by its stable testid, so it is
 * unambiguous now that the configurable Main CTA renders elsewhere.
 */
const heroCta = (nodes: Node[]) => nodes.find((n) => n.testId === 'hero-booking-cta')

/**
 * The configurable Main CTA, rendered as a compact pill in the Contact section.
 * Identified by its testid; absent whenever the configured action has no valid
 * destination.
 */
const contactCta = (nodes: Node[]) => nodes.find((n) => n.testId === 'contact-cta')

/** The sticky bar's inner link (the testid sits on the wrapper element). */
const stickyCta = (nodes: Node[]) => nodes.find((n) => n.testId === 'mobile-sticky-cta')

const stickyCtaLink = (nodes: Node[]) => {
  const wrapper = stickyCta(nodes)
  if (!wrapper) return undefined
  return flatten(wrapper.children).find((n) => typeof n.href === 'string')
}

const serviceCta = (nodes: Node[]) =>
  nodes.find((n) => typeof n.href === 'string' && n.href.includes('?service='))

// ===========================================================================
// 1. Booking (default) — legacy parity
// ===========================================================================
describe('CTA matrix: booking', () => {
  it('renders header, hero and service CTAs with booking destinations', () => {
    const nodes = render(configWith({}))
    expect(headerCta(nodes)?.href).toBe('/ar/tenants/demo-salon/book')
    expect(heroCta(nodes)?.href).toBe('/ar/tenants/demo-salon/book')
    expect(serviceCta(nodes)?.href).toBe('/ar/tenants/demo-salon/book?service=svc-1')
  })

  it('renders the Main CTA as a pill in the Contact section', () => {
    // The contact section must have data to render (its empty guard is
    // unchanged), so give the fixture a visible phone.
    const nodes = render(configWith({ contact: { phone: field('+201000000000') } }))
    const cta = contactCta(nodes)
    expect(cta).toBeTruthy()
    expect(cta!.href).toBe('/ar/tenants/demo-salon/book')
    // A compact rounded pill, not a full-width block.
    expect(cta!.className).toContain('rounded-full')
    expect(cta!.className).toContain('inline-flex')
    // Not stretched to the container: assert on the standalone `w-full` utility.
    expect(cta!.className.split(/\s+/)).not.toContain('w-full')
  })

  it('keeps the Main CTA reachable in the header and footer when the contact section is empty', () => {
    // With no visible contact data the contact section is dropped, but the CTA
    // still renders in the header and footer, so it is never lost.
    const nodes = render(configWith({}))
    expect(contactCta(nodes)).toBeUndefined()
    expect(headerCta(nodes)?.href).toBe('/ar/tenants/demo-salon/book')
    expect(nodes.some((n) => n.testId === 'footer-cta')).toBe(true)
  })

  it('does not render the sticky CTA when disabled (legacy behaviour)', () => {
    expect(stickyCta(render(configWith({ sticky: false })))).toBeUndefined()
  })

  it('does NOT add bottom padding when the sticky CTA is off', () => {
    const main = render(configWith({ sticky: false })).find((n) => n.type === 'main')!
    expect(main.style?.paddingBottom).toBeUndefined()
  })

  it('preserves a legacy hero CTA label when the CTA label is empty', () => {
    const nodes = render(configWith({ heroCtaLabel: 'احجز الآن' }))
    const label = flatten(heroCta(nodes)!.children).find((n) => n.type === 'span')
    expect(String(label?.children)).toBe('احجز الآن')
  })

  it('falls back to the historical label when neither is set', () => {
    const label = flatten(heroCta(render(configWith({})))!.children).find((n) => n.type === 'span')
    expect(String(label?.children)).toBe('احجز موعداً')
  })
})

// ===========================================================================
// 2. Valid call / whatsapp
// ===========================================================================
describe('CTA matrix: valid call and whatsapp', () => {
  it('call uses a tel: destination for the Main CTA, and service stays on ?service=', () => {
    const nodes = render(configWith({ contact: { phone: field('+201000000000') }, cta: { action: 'call' } }))
    expect(headerCta(nodes)?.href).toBe('tel:+201000000000')
    expect(contactCta(nodes)?.href).toBe('tel:+201000000000')
    expect(serviceCta(nodes)?.href).toBe('/ar/tenants/demo-salon/book?service=svc-1')
  })

  it('whatsapp uses a wa.me destination for the Main CTA', () => {
    const nodes = render(
      configWith({ contact: { whatsapp: field('+201000000000') }, cta: { action: 'whatsapp' } })
    )
    expect(headerCta(nodes)?.href).toBe('https://wa.me/201000000000')
    expect(contactCta(nodes)?.href).toBe('https://wa.me/201000000000')
  })

  it('external CTA links open safely (target=_blank + rel=noopener noreferrer)', () => {
    const nodes = render(
      configWith({ contact: { whatsapp: field('+201000000000') }, cta: { action: 'whatsapp' } })
    )
    const cta = contactCta(nodes)!
    expect(cta.href!.startsWith('https://wa.me/')).toBe(true)
    expect(cta.target).toBe('_blank')
    expect(cta.rel).toContain('noopener')
    expect(cta.rel).toContain('noreferrer')
  })

  it('a tel: link is never given target=_blank', () => {
    const nodes = render(configWith({ contact: { phone: field('+201000000000') }, cta: { action: 'call' } }))
    const cta = contactCta(nodes)!
    expect(cta.href!.startsWith('tel:')).toBe(true)
    expect(cta.target).toBeUndefined()
  })
})

// ===========================================================================
// 3. Invalid call / whatsapp — suppressed, never a fallback
// ===========================================================================
describe('CTA matrix: invalid call and whatsapp are suppressed', () => {
  it('invalid call suppresses the Main CTA but NOT the hero booking button', () => {
    const nodes = render(
      configWith({ contact: { phone: field('01012345678') }, cta: { action: 'call' } })
    )
    // The Main CTA has no valid destination, so it is suppressed everywhere...
    expect(headerCta(nodes)).toBeUndefined()
    expect(contactCta(nodes)).toBeUndefined()
    // ...while the hero keeps its OWN booking button (independent of the CTA).
    expect(heroCta(nodes)?.href).toBe('/ar/tenants/demo-salon/book')
  })

  it('missing phone suppresses the Main CTA but not the hero', () => {
    const nodes = render(configWith({ cta: { action: 'call' } }))
    expect(headerCta(nodes)).toBeUndefined()
    expect(contactCta(nodes)).toBeUndefined()
    expect(heroCta(nodes)?.href).toBe('/ar/tenants/demo-salon/book')
  })

  it('a hidden but valid phone still suppresses the CTA', () => {
    const nodes = render(
      configWith({ contact: { phone: { value: '+201000000000', isVisible: false } }, cta: { action: 'call' } })
    )
    expect(headerCta(nodes)).toBeUndefined()
    expect(contactCta(nodes)).toBeUndefined()
  })

  it('invalid whatsapp suppresses the Main CTA but not the hero', () => {
    const nodes = render(
      configWith({ contact: { whatsapp: field('01012345678') }, cta: { action: 'whatsapp' } })
    )
    expect(headerCta(nodes)).toBeUndefined()
    expect(contactCta(nodes)).toBeUndefined()
    expect(heroCta(nodes)?.href).toBe('/ar/tenants/demo-salon/book')
  })

  it('service booking links survive even when the primary CTA is suppressed', () => {
    const nodes = render(
      configWith({ contact: { phone: field('01012345678') }, cta: { action: 'call' } })
    )
    expect(serviceCta(nodes)?.href).toBe('/ar/tenants/demo-salon/book?service=svc-1')
  })
})

// ===========================================================================
// 4. Sticky CTA interactions
// ===========================================================================
describe('mobile sticky CTA — one floating action icon', () => {
  it('renders when enabled and the CTA is valid', () => {
    const nodes = render(configWith({ sticky: true }))
    expect(stickyCta(nodes)).toBeTruthy()
    expect(stickyCtaLink(nodes)!.href).toBe('/ar/tenants/demo-salon/book')
  })

  it('renders exactly ONE circular icon-only action', () => {
    const nodes = render(configWith({ sticky: true }))
    // Exactly one link inside the floating wrapper — no group of icons.
    const links = flatten(stickyCta(nodes)!.children).filter((n) => typeof n.href === 'string')
    expect(links).toHaveLength(1)
    const btn = links[0]
    // A circle: h-12 w-12 + rounded-full, and no visible text.
    expect(btn.className).toContain('h-12')
    expect(btn.className).toContain('w-12')
    expect(btn.className).toContain('rounded-full')
    expect(btn.className).toContain('justify-center')
    const texts = flatten(btn.children).filter((n) => typeof n.children === 'string')
    expect(texts).toHaveLength(0)
  })

  it('exposes the label as an accessible name instead of visible text', () => {
    const nodes = render(configWith({ sticky: true }))
    const btn = flatten(stickyCta(nodes)!.children).find((n) => typeof n.href === 'string')!
    expect(btn.ariaLabel).toBe('احجز موعداً')
    expect(btn.title).toBe('احجز موعداً')
  })

  it('is fixed to a bottom corner with logical RTL-aware alignment', () => {
    const wrapper = stickyCta(render(configWith({ sticky: true })))!
    expect(wrapper.className).toContain('fixed')
    expect(wrapper.className).toContain('bottom-0')
    // `end-0` is the LOGICAL inline edge, so it mirrors for RTL automatically.
    expect(wrapper.className).toContain('end-0')
    expect(wrapper.className).not.toContain('inset-x-0')
  })

  it('hides the header CTA on mobile only (hidden md:flex) when it renders', () => {
    const nodes = render(configWith({ sticky: true }))
    // The header CTA is present in the tree but constrained to md and up.
    expect(headerCta(nodes)?.className).toContain('hidden md:flex')
  })

  it('does NOT hide the header CTA when the sticky CTA cannot render', () => {
    // enabled but the action has no valid destination => no floating button =>
    // the header CTA must remain visible, or mobile would have no action.
    const nodes = render(
      configWith({ sticky: true, cta: { action: 'call' }, contact: { phone: field('01012345678') } })
    )
    expect(stickyCta(nodes)).toBeUndefined()
    expect(headerCta(nodes)).toBeUndefined() // suppressed, but not by the sticky rule
    const ok = render(configWith({ sticky: true }))
    expect(headerCta(ok)).toBeTruthy()
  })

  it('reserves bottom padding only while it renders', () => {
    const on = render(configWith({ sticky: true })).find((n) => n.type === 'main')!
    // The reserved space is applied by a mobile-only CSS class
    // (`.tenant-site--has-sticky-cta`), not an inline style — so the class is
    // what the tree carries.
    expect(on.className).toContain('tenant-site--has-sticky-cta')

    const off = render(configWith({ sticky: false })).find((n) => n.type === 'main')!
    expect(off.className).not.toContain('tenant-site--has-sticky-cta')
  })

  it('is hidden from md and up', () => {
    expect(stickyCta(render(configWith({ sticky: true })))!.className).toContain('md:hidden')
  })

  it('carries a safe-area inset style', () => {
    const style = stickyCta(render(configWith({ sticky: true })))!.style
    expect(String(style?.paddingBottom)).toContain('env(safe-area-inset-bottom')
  })

  it('uses the same destination as the primary CTA', () => {
    const nodes = render(
      configWith({ sticky: true, contact: { whatsapp: field('+201000000000') }, cta: { action: 'whatsapp' } })
    )
    expect(stickyCtaLink(nodes)!.href).toBe('https://wa.me/201000000000')
  })

  it('is absent when disabled even with a valid action', () => {
    expect(stickyCta(render(configWith({ sticky: false, contact: { phone: field('+201000000000') }, cta: { action: 'call' } })))).toBeUndefined()
  })
})

// ===========================================================================
// 5. href safety across the whole rendered tree
// ===========================================================================
describe('rendered href safety', () => {
  const unsafeConfig = () =>
    parseWebsiteConfig({
      theme: {},
      sections: [
        { id: 'sec_hero', type: 'hero', sortOrder: 0, isVisible: true, content: {} },
        { id: 'sec_contact', type: 'contact', sortOrder: 1, isVisible: true, content: {} },
      ],
      contact: {
        ...createDefaultContact(),
        phone: field('javascript:alert(1)'),
        email: field('not-an-email'),
        googleMapsUrl: field('javascript:alert(1)'),
      },
      social: {
        instagram: { url: 'javascript:alert(1)', isEnabled: true },
        facebook: { url: 'data:text/html,x', isEnabled: true },
        tiktok: { url: 'https://tiktok.com/x', isEnabled: true },
        youtube: { url: 'ftp://youtube.com', isEnabled: false },
      },
      cta: createDefaultCta(),
      mobileStickyCta: { isEnabled: true },
    })

  it('never emits a javascript: or data: href anywhere', () => {
    for (const href of links(render(unsafeConfig())).map((n) => n.href!)) {
      expect(href.startsWith('javascript:')).toBe(false)
      expect(href.startsWith('data:')).toBe(false)
    }
  })

  it('never emits a mailto: for an invalid email', () => {
    expect(links(render(unsafeConfig())).some((n) => n.href!.startsWith('mailto:'))).toBe(false)
  })

  it('never emits a tel: for an invalid phone', () => {
    expect(links(render(unsafeConfig())).some((n) => n.href!.startsWith('tel:'))).toBe(false)
  })

  it('still renders the one safe social link (tiktok) in every placement', () => {
    // Contact section, header and footer all render the one enabled safe link.
    const social = links(render(unsafeConfig())).filter((n) => n.href!.includes('tiktok.com'))
    expect(social.length).toBeGreaterThanOrEqual(1)
    expect(social.every((n) => n.href === 'https://tiktok.com/x')).toBe(true)
  })

  it('renders no Maps link for an unsafe Maps URL', () => {
    expect(links(render(unsafeConfig())).some((n) => n.href!.includes('maps'))).toBe(false)
  })
})

// ===========================================================================
// 6. Contact section presence / absence
// ===========================================================================
describe('contact section rendering', () => {
  const contactConfig = (patch: Record<string, unknown>) =>
    parseWebsiteConfig({
      theme: {},
      sections: [
        { id: 'sec_hero', type: 'hero', sortOrder: 0, isVisible: true, content: {} },
        { id: 'sec_contact', type: 'contact', sortOrder: 1, isVisible: true, content: {} },
      ],
      contact: { ...createDefaultContact(), ...patch },
      social: createDefaultSocial(),
      cta: createDefaultCta(),
      mobileStickyCta: { isEnabled: false },
    })

  it('renders the section when a field is visible and populated', () => {
    const nodes = render(contactConfig({ address: field('القاهرة') }))
    expect(nodes.some((n) => n.testId === 'contact-section')).toBe(true)
  })

  it('does NOT render an empty contact section', () => {
    const nodes = render(contactConfig({}))
    expect(nodes.some((n) => n.testId === 'contact-section')).toBe(false)
  })

  it('does NOT render when the only populated field is hidden', () => {
    const nodes = render(contactConfig({ address: { value: 'القاهرة', isVisible: false } }))
    expect(nodes.some((n) => n.testId === 'contact-section')).toBe(false)
  })

  it('renders a valid phone as a tel: action', () => {
    const nodes = render(contactConfig({ phone: field('+201000000000') }))
    expect(links(nodes).some((n) => n.href === 'tel:+201000000000')).toBe(true)
  })

  it('renders an invalid phone as plain text, not a link', () => {
    const nodes = render(contactConfig({ phone: field('01012345678') }))
    expect(links(nodes).some((n) => n.href!.startsWith('tel:'))).toBe(false)
    // ...but the tenant's own text is still shown.
    const texts = nodes.map((n) => n.children).filter((c) => typeof c === 'string')
    expect(texts).toContain('01012345678')
  })
})

// ===========================================================================
// 7. Legacy / RTL-LTR / draft isolation
// ===========================================================================
describe('legacy rendering and locale behaviour', () => {
  it('a null config renders the legacy default sections and booking CTA', () => {
    const nodes = render(null)
    expect(headerCta(nodes)?.href).toBe('/ar/tenants/demo-salon/book')
    expect(heroCta(nodes)).toBeTruthy()
  })

  it('Arabic renders rtl, English renders ltr', () => {
    const ar = TenantWebsite({ ...baseProps, locale: 'ar', config: createDefaultWebsiteConfig() }) as {
      props: { dir: string }
    }
    const en = TenantWebsite({ ...baseProps, locale: 'en', config: createDefaultWebsiteConfig() }) as {
      props: { dir: string }
    }
    expect(ar.props.dir).toBe('rtl')
    expect(en.props.dir).toBe('ltr')
  })

  it('the same config produces the same CTA in both locales', () => {
    const config = configWith({ contact: { phone: field('+201000000000') }, cta: { action: 'call' } })
    expect(headerCta(render(config, 'ar'))?.href).toBe('tel:+201000000000')
    expect(headerCta(render(config, 'en'))?.href).toBe('tel:+201000000000')
  })

  it('never renders the header CTA without a resolvable destination', () => {
    const config = configWith({ cta: { action: 'whatsapp' } })
    expect(headerCta(render(config))).toBeUndefined()
    expect(contactCta(render(config))).toBeUndefined()
    // The hero's own booking button is unaffected by the CTA configuration.
    expect(heroCta(render(config))?.href).toBe('/ar/tenants/demo-salon/book')
  })
})
