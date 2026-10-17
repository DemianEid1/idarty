import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MobileStickyCta } from '@/components/mobile-sticky-cta'
import { TenantWebsite } from '@/components/tenant-website'
import { parseWebsiteConfig, type WebsiteConfig } from './website-config'
import {
  createDefaultContact,
  createDefaultSocial,
  createDefaultCta,
  type ContactConfig,
  type CtaConfig,
} from './contact-social'

// ---------------------------------------------------------------------------
// Mobile sticky CTA as a single floating action icon.
//
// The component is rendered with React's server renderer so the REAL markup is
// inspected (a hook-free component, but this keeps the assertions markup-level).
// The full site tree is walked for the integration-level guarantees (exactly one
// icon, visibility gating, destination matching the configured action).
// ---------------------------------------------------------------------------

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')

interface Node {
  type: unknown
  className: string
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
      href: el.props.href as string | undefined,
      target: el.props.target as string | undefined,
      rel: el.props.rel as string | undefined,
      ariaLabel: el.props['aria-label'] as string | undefined,
      title: el.props.title as string | undefined,
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
  sticky?: boolean
}): WebsiteConfig {
  return parseWebsiteConfig({
    theme: {},
    sections: [
      { id: 'sec_hero', type: 'hero', sortOrder: 0, isVisible: true, content: {} },
      { id: 'sec_services', type: 'services', sortOrder: 1, isVisible: true, content: {} },
      { id: 'sec_contact', type: 'contact', sortOrder: 2, isVisible: true, content: {} },
    ],
    contact: { ...createDefaultContact(), ...(opts.contact ?? {}) },
    social: createDefaultSocial(),
    cta: { ...createDefaultCta(), ...(opts.cta ?? {}) },
    mobileStickyCta: { isEnabled: opts.sticky ?? false },
  })
}

const renderSite = (config: WebsiteConfig | null, locale: 'ar' | 'en' = 'ar') =>
  flatten(TenantWebsite({ ...baseProps, locale, config }))

const wrapper = (nodes: Node[]) => nodes.find((n) => n.testId === 'mobile-sticky-cta')
const wrapperLinks = (nodes: Node[]) => {
  const w = wrapper(nodes)
  return w ? flatten(w.children).filter((n) => typeof n.href === 'string') : []
}

// ---------------------------------------------------------------------------
// 1. Exactly one icon, per action
// ---------------------------------------------------------------------------

describe('floating action icon — exactly one, matching the configured action', () => {
  it('renders ONE circular icon-only button for booking', () => {
    const nodes = renderSite(configWith({ sticky: true }))
    const links = wrapperLinks(nodes)
    expect(links).toHaveLength(1)
    expect(links[0].href).toBe(BOOK)
  })

  it('booking uses the calendar icon (not a text label)', () => {
    const html = renderToStaticMarkup(
      createElement(MobileStickyCta, {
        href: BOOK,
        label: 'احجز موعداً',
        external: false,
        action: 'booking' as const,
      })
    )
    // The lucide calendar icon renders an <svg> with a <path>.
    expect(html).toContain('<svg')
    expect(html).toContain('<path')
    // The label appears ONLY as an attribute (the accessible name), never as
    // visible text content between tags.
    expect(html).toContain('aria-label="احجز موعداً"')
    expect(html).toContain('title="احجز موعداً"')
    expect(html).not.toContain('>احجز موعداً<')
  })

  it('whatsapp uses the WhatsApp brand mark and a wa.me destination', () => {
    const nodes = renderSite(
      configWith({ sticky: true, contact: { whatsapp: field('+201000000000') }, cta: { action: 'whatsapp' } })
    )
    const links = wrapperLinks(nodes)
    expect(links).toHaveLength(1)
    expect(links[0].href).toBe('https://wa.me/201000000000')
    // External destinations open safely.
    expect(links[0].target).toBe('_blank')
    expect(links[0].rel).toContain('noreferrer')
    // The brand glyph renders as a single filled path, normalised into the
    // 20-unit viewBox the other platform icons use (see WhatsAppIcon).
    const html = renderToStaticMarkup(
      createElement(MobileStickyCta, {
        href: 'https://wa.me/201000000000',
        label: 'واتساب',
        external: true,
        action: 'whatsapp' as const,
      })
    )
    expect(html).toContain('<path')
    expect(html).not.toContain('viewBox="0 0 24 24"')
  })

  it('call uses the phone icon and a tel: destination with no target', () => {
    const nodes = renderSite(
      configWith({ sticky: true, contact: { phone: field('+201000000000') }, cta: { action: 'call' } })
    )
    const links = wrapperLinks(nodes)
    expect(links).toHaveLength(1)
    expect(links[0].href!.startsWith('tel:')).toBe(true)
    // A tel: link must never be treated as an external tab-opener.
    expect(links[0].target).toBeUndefined()
  })

  it('renders only ONE button element (never a group of icons)', () => {
    const nodes = renderSite(configWith({ sticky: true }))
    const w = wrapper(nodes)!
    const links = flatten(w.children).filter((n) => typeof n.href === 'string')
    expect(links).toHaveLength(1)
    // Exactly one icon inside that single link. Lucide renders a function
    // component, so count the icon component rather than a raw 'svg' tag.
    const svgMarkup = renderToStaticMarkup(
      createElement(MobileStickyCta, {
        href: BOOK,
        label: 'Book',
        external: false,
        action: 'booking' as const,
      })
    )
    expect((svgMarkup.match(/<svg/g) ?? []).length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 2. Visual design
// ---------------------------------------------------------------------------

describe('floating action icon — compact circular design', () => {
  const html = renderToStaticMarkup(
    createElement(MobileStickyCta, {
      href: BOOK,
      label: 'Book',
      external: false,
      action: 'booking' as const,
    })
  )

  it('is a 48px circle', () => {
    expect(html).toContain('h-12')
    expect(html).toContain('w-12')
    expect(html).toContain('rounded-full')
  })

  it('is icon-only with a comfortable touch target', () => {
    // h-12 w-12 = 48x48, the recommended minimum touch target.
    expect(html).toMatch(/h-12 w-12/)
  })

  it('has a subtle shadow and a visible focus state', () => {
    expect(html).toContain('shadow-lg')
    expect(html).toContain('focus-visible:ring-2')
  })

  it('uses the tenant theme color with white icon contrast', () => {
    expect(html).toContain('text-white')
    expect(html).toContain('var(--site-primary)')
  })

  it('is fixed to a bottom corner and mobile-only', () => {
    expect(html).toContain('fixed')
    expect(html).toContain('bottom-0')
    expect(html).toContain('md:hidden')
  })

  it('respects the safe-area inset and horizontal safe spacing', () => {
    expect(html).toContain('env(safe-area-inset-bottom')
    expect(html).toContain('p-4')
  })

  it('uses the logical inline edge so RTL mirrors automatically', () => {
    expect(html).toContain('end-0')
    expect(html).not.toContain('inset-x-0')
  })

  it('is not a full-width bar any more', () => {
    // The old design was `w-full` with a text label; neither may remain.
    expect(html).not.toContain('w-full')
    expect(html).not.toContain('rounded-xl')
  })
})

// ---------------------------------------------------------------------------
// 3. Visibility rules
// ---------------------------------------------------------------------------

describe('floating action icon — visibility', () => {
  it('does not render when the tenant has it disabled', () => {
    expect(wrapper(renderSite(configWith({ sticky: false })))).toBeUndefined()
  })

  it('does not render when call has no valid destination', () => {
    const nodes = renderSite(configWith({ sticky: true, cta: { action: 'call' } }))
    expect(wrapper(nodes)).toBeUndefined()
  })

  it('does not render when whatsapp has no valid destination', () => {
    const nodes = renderSite(configWith({ sticky: true, cta: { action: 'whatsapp' } }))
    expect(wrapper(nodes)).toBeUndefined()
  })

  it('does not render when the destination is hidden', () => {
    const nodes = renderSite(
      configWith({
        sticky: true,
        cta: { action: 'call' },
        contact: { phone: { value: '+201000000000', isVisible: false } },
      })
    )
    expect(wrapper(nodes)).toBeUndefined()
  })

  it('never renders an empty or nonfunctional button', () => {
    // Every rendered button must have a non-empty href.
    const cases: Parameters<typeof configWith>[0][] = [
      { sticky: true },
      { sticky: true, cta: { action: 'call' }, contact: { phone: field('+201000000000') } },
      { sticky: true, cta: { action: 'whatsapp' }, contact: { whatsapp: field('+201000000000') } },
    ]
    for (const opts of cases) {
      const links = wrapperLinks(renderSite(configWith(opts)))
      expect(links).toHaveLength(1)
      expect(links[0].href!.length).toBeGreaterThan(0)
    }
  })

  it('renders in both locales with the right destination', () => {
    expect(wrapperLinks(renderSite(configWith({ sticky: true }), 'ar'))[0].href).toBe(BOOK)
    expect(wrapperLinks(renderSite(configWith({ sticky: true }), 'en'))[0].href).toBe(
      '/en/tenants/demo-salon/book'
    )
  })

  it('keeps the header CTA hidden on mobile only while it renders', () => {
    const nodes = renderSite(configWith({ sticky: true }))
    const header = nodes.find(
      (n) => typeof n.href === 'string' && n.className.includes('hidden md:flex')
    )
    expect(header).toBeTruthy()
  })

  it('reserves safe-area bottom space only while it renders', () => {
    // The reserved space is applied by the mobile-only CSS class
    // `.tenant-site--has-sticky-cta` (globals.css), so the class is the contract.
    const mainClass = (sticky: boolean) =>
      flatten(TenantWebsite({ ...baseProps, config: configWith({ sticky }) }))
        .find((n) => n.type === 'main')!
        .className
    expect(mainClass(true)).toContain('tenant-site--has-sticky-cta')
    expect(mainClass(false)).not.toContain('tenant-site--has-sticky-cta')

    // And the class carries the safe-area-aware padding, mobile only.
    const css = read('app/globals.css')
    expect(css).toContain('.tenant-site--has-sticky-cta')
    expect(css).toMatch(
      /\.tenant-site--has-sticky-cta\s*\{[^}]*padding-bottom:[^;]*env\(safe-area-inset-bottom/
    )
    // Desktop (`md`) drops it, since the floating button is `md:hidden`.
    expect(css).toMatch(/@media \(min-width: 48rem\)\s*\{\s*\.tenant-site--has-sticky-cta\s*\{\s*padding-bottom: 0/)
  })
})

// ---------------------------------------------------------------------------
// 5. Draft / published parity
//
// Both routes render the SAME `TenantWebsite` component; the only difference is
// which configuration is passed (draft for /preview, published for the public
// page). So parity is a property of the component, and is asserted here by
// rendering the same config through the one code path.
// ---------------------------------------------------------------------------

describe('draft preview and published rendering use the same floating button', () => {
  it('renders the identical button for a draft and a published config', () => {
    const draft = configWith({ sticky: true, cta: { action: 'call' }, contact: { phone: field('+201000000000') } })
    const published = configWith({ sticky: true, cta: { action: 'call' }, contact: { phone: field('+201000000000') } })
    const a = wrapperLinks(renderSite(draft))
    const b = wrapperLinks(renderSite(published))
    expect(a).toHaveLength(1)
    expect(a[0].href).toBe(b[0].href)
    expect(a[0].className).toBe(b[0].className)
  })

  it('a draft-only change is visible in the draft render and not the published one', () => {
    // Published: booking (default). Draft: whatsapp with a valid number.
    const published = configWith({ sticky: true })
    const draft = configWith({
      sticky: true,
      cta: { action: 'whatsapp' },
      contact: { whatsapp: field('+201000000000') },
    })
    expect(wrapperLinks(renderSite(published))[0].href).toBe(BOOK)
    expect(wrapperLinks(renderSite(draft))[0].href).toBe('https://wa.me/201000000000')
  })

  it('both routes render the same component (single source of truth)', () => {
    const publicRoute = read('app/[locale]/tenants/[slug]/page.tsx')
    const previewRoute = read('app/[locale]/tenants/[slug]/preview/page.tsx')
    expect(publicRoute).toContain("import { TenantWebsite } from '@/components/tenant-website'")
    expect(previewRoute).toContain("import { TenantWebsite } from '@/components/tenant-website'")
    // The public route passes the PUBLISHED config; preview passes the DRAFT.
    expect(publicRoute).toContain('config={publishedConfig}')
    expect(previewRoute).toContain('config={draftConfig}')
  })
})

// ---------------------------------------------------------------------------
// 6. Scope guards — nothing else changed
// ---------------------------------------------------------------------------

describe('scope: no other CTA surface was modified', () => {
  const site = read('components/tenant-website.tsx')
  const sticky = read('components/mobile-sticky-cta.tsx')

  it('keeps the header CTA as the original rounded-lg compact button', () => {
    expect(site).toContain("rounded-lg px-3 py-2 text-sm font-semibold")
  })

  it('keeps the footer CTA as the original full-width pill', () => {
    expect(site).toContain('flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5')
  })

  it('keeps the hero booking button independent', () => {
    expect(site).toContain('heroBookingHref')
    expect(site).toContain('data-testid="hero-booking-cta"')
  })

  it('keeps service preselection intact', () => {
    expect(site).toContain('?service=${item.id}')
  })

  it('reuses the existing CTA configuration — no new fields', () => {
    // The component only reads the props it is given; it declares no config.
    expect(sticky).not.toContain('useState')
    expect(sticky).not.toContain('z.object')
    // No new schema field was introduced anywhere.
    const cfg = read('lib/contact-social.ts')
    expect(cfg).not.toContain('floatingCta')
    expect(cfg).not.toContain('stickyIcon')
  })

  it('derives its icon from the existing action enum only', () => {
    expect(sticky).toContain("action === 'whatsapp'")
    expect(sticky).toContain("action === 'call'")
    // Default branch covers 'booking' — the only remaining CTA_ACTIONS member.
    expect(sticky).toContain('CalendarDays')
  })
})
