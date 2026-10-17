import { describe, expect, it } from 'vitest'
import { TenantWebsite } from '@/components/tenant-website'
import { parseWebsiteConfig, type WebsiteConfig } from './website-config'
import {
  createDefaultContact,
  createDefaultSocial,
  createDefaultCta,
  FALLBACK_CTA_LABEL,
  type ContactConfig,
  type CtaConfig,
} from './contact-social'

// ---------------------------------------------------------------------------
// Hero booking button vs the configurable Main CTA.
//
// These are now INDEPENDENT: the hero always owns a booking button, and the
// configurable Main CTA renders separately as a pill in the Contact section.
// Before the split the hero reused the Main CTA's href and label, so switching
// the CTA to "Call"/"WhatsApp" silently repointed the hero's booking action.
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
        const rendered = (el.type as (p: Record<string, unknown>) => unknown)(el.props)
        flatten(rendered, depth + 1, out)
      } catch {
        /* not a plain function component */
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
const BOOK = '/ar/tenants/demo-salon/book'

function configWith(opts: {
  contact?: Partial<ContactConfig>
  cta?: Partial<CtaConfig>
  heroCtaLabel?: string
  sticky?: boolean
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

const heroCta = (nodes: Node[]) => nodes.find((n) => n.testId === 'hero-booking-cta')
const contactCta = (nodes: Node[]) => nodes.find((n) => n.testId === 'contact-cta')
const serviceCta = (nodes: Node[]) =>
  nodes.find((n) => typeof n.href === 'string' && n.href.includes('?service='))

// ---------------------------------------------------------------------------
// 1. The hero button is independent
// ---------------------------------------------------------------------------

describe('hero booking button is independent of the Main CTA', () => {
  it('always points at the booking route, whatever the CTA action is', () => {
    for (const action of ['booking', 'call', 'whatsapp'] as const) {
      const nodes = render(
        configWith({
          cta: { action },
          contact: { phone: field('+201000000000'), whatsapp: field('+201000000000') },
        })
      )
      expect(heroCta(nodes)?.href, `action=${action}`).toBe(BOOK)
    }
  })

  it('still renders when the CTA action has NO valid destination', () => {
    // call with an invalid phone: the Main CTA is suppressed, the hero is not.
    const nodes = render(configWith({ cta: { action: 'call' }, contact: { phone: field('01012345678') } }))
    expect(contactCta(nodes)).toBeUndefined()
    expect(heroCta(nodes)?.href).toBe(BOOK)
  })

  it('does not become a tel: or wa.me link when the CTA is call/whatsapp', () => {
    const call = render(configWith({ cta: { action: 'call' }, contact: { phone: field('+201000000000') } }))
    const hero = heroCta(call)!
    expect(hero.href!.startsWith('tel:')).toBe(false)
    expect(hero.href).toBe(BOOK)
    // The Main CTA is the one that becomes tel:.
    expect(contactCta(call)?.href!.startsWith('tel:')).toBe(true)
  })

  it('is never an external link (no target/rel)', () => {
    const nodes = render(configWith({ cta: { action: 'whatsapp' }, contact: { whatsapp: field('+201000000000') } }))
    const hero = heroCta(nodes)!
    expect(hero.target).toBeUndefined()
    expect(hero.rel).toBeUndefined()
  })

  it('uses its OWN hero ctaLabel, not the Main CTA label', () => {
    const nodes = render(
      configWith({ heroCtaLabel: 'احجز الآن', cta: { label: { ar: 'اتصل بنا', en: 'Call us' } } })
    )
    const heroLabel = flatten(heroCta(nodes)!.children).find((n) => n.type === 'span')
    expect(String(heroLabel?.children)).toBe('احجز الآن')
  })

  it('falls back to the standard booking label when the hero label is empty', () => {
    const nodes = render(configWith({ cta: { label: { ar: 'اتصل بنا', en: 'Call us' } } }))
    const heroLabel = flatten(heroCta(nodes)!.children).find((n) => n.type === 'span')
    expect(String(heroLabel?.children)).toBe(FALLBACK_CTA_LABEL.ar)
  })

  it('renders in both locales', () => {
    const cfg = configWith({ heroCtaLabel: 'Book now' })
    expect(heroCta(render(cfg, 'ar'))?.href).toBe(BOOK)
    expect(heroCta(render(cfg, 'en'))?.href).toBe('/en/tenants/demo-salon/book')
  })

  it('stays compact and rounded rather than full-width', () => {
    const hero = heroCta(render(configWith({})))!
    expect(hero.className).toContain('inline-flex')
    expect(hero.className).toContain('rounded-xl')
    expect(hero.className.split(/\s+/)).not.toContain('w-full')
  })

  it('renders for a legacy null config too', () => {
    expect(heroCta(render(null))?.href).toBe(BOOK)
  })
})

// ---------------------------------------------------------------------------
// 2. The Main CTA follows its configuration
// ---------------------------------------------------------------------------

describe('Main CTA follows its configured action', () => {
  const withContact = (contact: Partial<ContactConfig>, cta: Partial<CtaConfig>) =>
    render(configWith({ contact, cta }))

  it('booking -> the tenant booking route', () => {
    // The contact section must render for the pill to appear, so give it a
    // visible field (its empty guard is unchanged by this task).
    expect(
      contactCta(withContact({ phone: field('+201000000000') }, { action: 'booking' }))?.href
    ).toBe(BOOK)
  })

  it('call -> the configured tel: destination', () => {
    const cta = contactCta(withContact({ phone: field('+201000000000') }, { action: 'call' }))!
    expect(cta.href!.startsWith('tel:')).toBe(true)
  })

  it('whatsapp -> the configured wa.me destination, opening safely', () => {
    const cta = contactCta(withContact({ whatsapp: field('+201000000000') }, { action: 'whatsapp' }))!
    expect(cta.href!.startsWith('https://wa.me/')).toBe(true)
    expect(cta.target).toBe('_blank')
    expect(cta.rel).toContain('noopener')
    expect(cta.rel).toContain('noreferrer')
  })

  it('respects a hidden phone by suppressing the CTA', () => {
    const nodes = withContact({ phone: { value: '+201000000000', isVisible: false } }, { action: 'call' })
    expect(contactCta(nodes)).toBeUndefined()
  })

  it('renders the configured label', () => {
    const nodes = withContact(
      { phone: field('+201000000000') },
      { action: 'call', label: { ar: 'اتصل بنا', en: 'Call us' } }
    )
    const label = flatten(contactCta(nodes)!.children).find(
      (n) => n.type === 'span' && n.className.includes('break-words')
    )
    expect(String(label?.children)).toBe('اتصل بنا')
  })

  it('renders in the Contact section, as a compact pill', () => {
    const cta = contactCta(withContact({ phone: field('+201000000000') }, {}))!
    expect(cta.className).toContain('rounded-full')
    expect(cta.className).toContain('inline-flex')
    expect(cta.className.split(/\s+/)).not.toContain('w-full')
  })
})

// ---------------------------------------------------------------------------
// 3. Service booking links are untouched
// ---------------------------------------------------------------------------

describe('service booking buttons remain functional', () => {
  it('preserves service preselection regardless of the CTA action', () => {
    for (const action of ['booking', 'call', 'whatsapp'] as const) {
      const nodes = render(
        configWith({
          cta: { action },
          contact: { phone: field('+201000000000'), whatsapp: field('+201000000000') },
        })
      )
      expect(serviceCta(nodes)?.href, `action=${action}`).toBe(`${BOOK}?service=svc-1`)
    }
  })

  it('keeps service links when the Main CTA is suppressed', () => {
    const nodes = render(configWith({ cta: { action: 'call' }, contact: { phone: field('01012345678') } }))
    expect(contactCta(nodes)).toBeUndefined()
    expect(serviceCta(nodes)?.href).toBe(`${BOOK}?service=svc-1`)
  })

  it('keeps the Services section standalone and ordered', () => {
    const nodes = render(configWith({}))
    expect(nodes.some((n) => n.type === 'section' && n.testId === undefined)).toBe(true)
    expect(serviceCta(nodes)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// 4. Draft/published parity
// ---------------------------------------------------------------------------

describe('draft preview and published rendering stay consistent', () => {
  it('renders identically for the same config (the only difference is which config is passed)', () => {
    const draft = configWith({ heroCtaLabel: 'معاينة', cta: { action: 'call' }, contact: { phone: field('+201000000000') } })
    const published = configWith({ heroCtaLabel: 'معاينة', cta: { action: 'call' }, contact: { phone: field('+201000000000') } })
    const a = render(draft)
    const b = render(published)
    expect(heroCta(a)?.href).toBe(heroCta(b)?.href)
    expect(contactCta(a)?.href).toBe(contactCta(b)?.href)
  })

  it('a draft-only CTA change is visible in the draft render and not the published one', () => {
    const publishedCfg = configWith({ contact: { phone: field('+201000000000') } })
    const draftCfg = configWith({
      contact: { phone: field('+201000000000') },
      cta: { action: 'call' },
    })
    expect(contactCta(render(publishedCfg))?.href).toBe(BOOK)
    expect(contactCta(render(draftCfg))?.href!.startsWith('tel:')).toBe(true)
    // The hero is unaffected by the draft change.
    expect(heroCta(render(draftCfg))?.href).toBe(BOOK)
  })

  it('does not let a CTA change alter the hero button (no shared state)', () => {
    const before = render(configWith({ contact: { phone: field('+201000000000') } }))
    const after = render(configWith({ contact: { phone: field('+201000000000') }, cta: { action: 'call' } }))
    expect(heroCta(before)?.href).toBe(heroCta(after)?.href)
  })
})
