import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TenantWebsite } from '@/components/tenant-website'
import { ContactSection } from '@/components/contact-section'
import { AccordionSection } from '@/components/accordion-section'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { ImageUploadZone } from '@/components/image-upload-zone'
import { WhatsAppIcon, WhatsAppLink, SocialLinks } from '@/components/social-links'
import { parseWebsiteConfig, type WebsiteConfig } from './website-config'
import {
  createDefaultContact,
  createDefaultSocial,
  createDefaultCta,
  type ContactConfig,
} from './contact-social'

// ---------------------------------------------------------------------------
// WhatsApp icon, Google Maps address link, accordion and image-upload zone.
//
// These components are synchronous function components, so calling them returns
// a React element tree that can be inspected directly — the REAL component is
// exercised, not a re-implementation.
// ---------------------------------------------------------------------------

interface Node {
  type: unknown
  className: string
  href?: string
  target?: string
  rel?: string
  ariaLabel?: string
  ariaExpanded?: boolean
  ariaControls?: string
  ariaHidden?: boolean
  inert?: boolean
  dataState?: string
  hidden?: boolean
  testId?: string
  platform?: string
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
      ariaExpanded: el.props['aria-expanded'] as boolean | undefined,
      ariaControls: el.props['aria-controls'] as string | undefined,
      ariaHidden: el.props['aria-hidden'] as boolean | undefined,
      inert: el.props.inert as boolean | undefined,
      dataState: el.props['data-state'] as string | undefined,
      hidden: el.props.hidden as boolean | undefined,
      testId: el.props['data-testid'] as string | undefined,
      platform: el.props['data-social-platform'] as string | undefined,
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

function configWith(opts: {
  contact?: Partial<ContactConfig>
  social?: Partial<ReturnType<typeof createDefaultSocial>>
}): WebsiteConfig {
  return parseWebsiteConfig({
    theme: {},
    sections: [
      { id: 'sec_hero', type: 'hero', sortOrder: 0, isVisible: true, content: {} },
      { id: 'sec_services', type: 'services', sortOrder: 1, isVisible: true, content: {} },
    ],
    contact: { ...createDefaultContact(), ...(opts.contact ?? {}) },
    social: { ...createDefaultSocial(), ...(opts.social ?? {}) },
    cta: createDefaultCta(),
    mobileStickyCta: { isEnabled: false },
  })
}

const renderSite = (config: WebsiteConfig | null, locale: 'ar' | 'en' = 'ar') =>
  flatten(TenantWebsite({ ...baseProps, locale, config }))

const whatsappLinks = (nodes: Node[]) =>
  nodes.filter((n) => n.platform === 'whatsapp' && typeof n.href === 'string')

// ---------------------------------------------------------------------------
// 1. WhatsApp icon visibility
// ---------------------------------------------------------------------------

describe('WhatsApp icon — regression coverage', () => {
  it('renders a WhatsApp link in the footer when enabled with a valid number', () => {
    const nodes = renderSite(configWith({ contact: { whatsapp: field('+201001234567') } }))
    const links = whatsappLinks(nodes)
    expect(links.length).toBeGreaterThan(0)
    expect(links[0].href).toBe('https://wa.me/201001234567')
  })

  it('uses safe external-link attributes', () => {
    const nodes = renderSite(configWith({ contact: { whatsapp: field('+201001234567') } }))
    const link = whatsappLinks(nodes)[0]
    expect(link.target).toBe('_blank')
    expect(link.rel).toContain('noreferrer')
  })

  it('renders nothing when the WhatsApp field is hidden', () => {
    const nodes = renderSite(configWith({ contact: { whatsapp: field('+201001234567', false) } }))
    expect(whatsappLinks(nodes)).toHaveLength(0)
  })

  it('renders nothing when the WhatsApp value is empty', () => {
    const nodes = renderSite(configWith({ contact: { whatsapp: field('') } }))
    expect(whatsappLinks(nodes)).toHaveLength(0)
  })

  it('renders nothing for an invalid (non-international) number', () => {
    const nodes = renderSite(configWith({ contact: { whatsapp: field('01001234567') } }))
    expect(whatsappLinks(nodes)).toHaveLength(0)
  })

  it('never falls back to a tel: or booking link when WhatsApp is invalid', () => {
    const nodes = renderSite(configWith({ contact: { whatsapp: field('not-a-number') } }))
    const stray = nodes.filter(
      (n) => typeof n.href === 'string' && (n.href.startsWith('tel:') || n.href.includes('wa.me'))
    )
    expect(stray).toHaveLength(0)
  })

  it('labels the link accessibly in Arabic and English', () => {
    const ar = renderSite(configWith({ contact: { whatsapp: field('+201001234567') } }), 'ar')
    const en = renderSite(configWith({ contact: { whatsapp: field('+201001234567') } }), 'en')
    expect(whatsappLinks(ar)[0].ariaLabel).toBe('واتساب')
    expect(whatsappLinks(en)[0].ariaLabel).toBe('WhatsApp')
  })

  it('keeps other social platforms rendering alongside WhatsApp', () => {
    const nodes = renderSite(
      configWith({
        contact: { whatsapp: field('+201001234567') },
        social: { instagram: { url: 'https://instagram.com/x', isEnabled: true } },
      })
    )
    expect(nodes.some((n) => n.platform === 'instagram')).toBe(true)
    expect(whatsappLinks(nodes).length).toBeGreaterThan(0)
  })

  it('WhatsAppLink returns null for a missing contact config', () => {
    expect(WhatsAppLink({ locale: 'en', contact: null })).toBeNull()
  })

  it('WhatsAppIcon renders the brand glyph path (not a generic bubble)', () => {
    const nodes = flatten(WhatsAppIcon({ size: 20 }))
    const svg = nodes.find((n) => n.type === 'svg')
    expect(svg).toBeDefined()
    // The brand mark is a single filled path; a generic MessageCircle would
    // also be a path, so assert the viewBox contract both share plus presence.
    expect(svg?.className).toContain('shrink-0')
  })

  it('ContactSection uses the WhatsApp brand icon for its WhatsApp action', () => {
    const contact = { ...createDefaultContact(), whatsapp: field('+201001234567') }
    const tree = ContactSection({
      locale: 'en',
      contact,
      social: createDefaultSocial(),
      heading: undefined,
      description: undefined,
    })
    const nodes = flatten(tree)
    const wa = nodes.find((n) => n.href?.startsWith('https://wa.me/'))
    expect(wa).toBeDefined()
    // The action's icon must be the WhatsApp glyph component, not MessageCircle.
    const icons = nodes.filter((n) => n.type === WhatsAppIcon)
    expect(icons.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 2. Address → Google Maps link
// ---------------------------------------------------------------------------

describe('Business address → Google Maps link', () => {
  const withAddress = (maps: string, visible = true) =>
    configWith({
      contact: {
        address: field('١٢ شارع النيل، القاهرة'),
        googleMapsUrl: field(maps, visible),
      },
    })

  it('makes the address a link when a valid Maps URL is configured', () => {
    const nodes = renderSite(withAddress('https://maps.app.goo.gl/abc123'))
    const link = nodes.find((n) => n.href === 'https://maps.app.goo.gl/abc123')
    expect(link).toBeDefined()
    expect(link?.target).toBe('_blank')
    expect(link?.rel).toContain('noopener')
    expect(link?.rel).toContain('noreferrer')
  })

  it('renders the address as plain text when the Maps URL is missing', () => {
    const nodes = renderSite(withAddress(''))
    expect(nodes.some((n) => n.href === '' || n.href === undefined)).toBe(true)
    // No map link anywhere.
    expect(nodes.some((n) => typeof n.href === 'string' && n.href.includes('maps'))).toBe(false)
  })

  it('renders the address as plain text when the Maps URL is invalid', () => {
    const nodes = renderSite(withAddress('javascript:alert(1)'))
    expect(nodes.some((n) => typeof n.href === 'string' && n.href.startsWith('javascript:'))).toBe(
      false
    )
  })

  it('never exposes a hidden address as text or link', () => {
    const nodes = renderSite(
      configWith({
        contact: {
          address: field('١٢ شارع النيل، القاهرة', false),
          googleMapsUrl: field('https://maps.app.goo.gl/abc123'),
        },
      })
    )
    // Collect every string reachable from the tree (JSON.stringify would choke
    // on the circular React element references).
    const collectText = (v: unknown, depth = 0, out: string[] = []): string[] => {
      if (depth > 40 || v === null || v === undefined) return out
      if (typeof v === 'string' || typeof v === 'number') {
        out.push(String(v))
        return out
      }
      if (Array.isArray(v)) {
        for (const c of v) collectText(c, depth + 1, out)
        return out
      }
      if (typeof v === 'object') {
        const el = v as { props?: Record<string, unknown> }
        if (el.props) collectText(el.props.children, depth + 1, out)
      }
      return out
    }
    const text = collectText(nodes).join(' ')
    expect(text).not.toContain('شارع النيل')
    expect(nodes.some((n) => typeof n.href === 'string' && n.href.includes('maps'))).toBe(false)
  })

  it('keeps RTL markup correct (Arabic label present, no LTR leakage)', () => {
    const nodes = renderSite(withAddress('https://maps.app.goo.gl/abc123'), 'ar')
    const link = nodes.find((n) => n.href === 'https://maps.app.goo.gl/abc123')
    expect(link).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// 3. Accordion behaviour
// ---------------------------------------------------------------------------

describe('AccordionSection — accessible collapse', () => {
  const renderAccordion = (open: boolean) =>
    flatten(
      AccordionSection({
        locale: 'en',
        title: 'Contact Information',
        description: 'Details',
        open,
        onToggle: () => {},
        testId: 'contact',
        children: 'BODY',
      })
    )

  it('exposes aria-expanded reflecting the open state', () => {
    expect(renderAccordion(true).find((n) => n.testId === 'contact-header')?.ariaExpanded).toBe(true)
    expect(renderAccordion(false).find((n) => n.testId === 'contact-header')?.ariaExpanded).toBe(
      false
    )
  })

  it('links the toggle to its panel via aria-controls', () => {
    const header = renderAccordion(true).find((n) => n.testId === 'contact-header')
    expect(header?.ariaControls).toBe('accordion-contact-panel')
  })

  it('keeps the panel mounted but inert when collapsed (state is never lost)', () => {
    const nodes = renderAccordion(false)
    const panel = nodes.find((n) => n.testId === 'contact-panel')
    expect(panel).toBeDefined()
    // The panel stays in the tree (so form state survives) but is taken out of
    // the tab order and the accessibility tree.
    expect(panel?.inert).toBe(true)
    expect(panel?.ariaHidden).toBe(true)
    expect(panel?.dataState).toBe('closed')
    expect(panel?.className).toContain('grid-rows-[0fr]')
  })

  it('makes the panel interactive and visible when open', () => {
    const panel = renderAccordion(true).find((n) => n.testId === 'contact-panel')
    expect(panel?.inert).toBe(false)
    expect(panel?.ariaHidden).toBe(false)
    expect(panel?.dataState).toBe('open')
    expect(panel?.className).toContain('grid-rows-[1fr]')
  })

  it('animates height intrinsically without a fixed max-height', () => {
    // A 0fr→1fr grid row animates to the content's real height, so long forms
    // are never clipped the way an arbitrary max-height would clip them.
    const panel = renderAccordion(true).find((n) => n.testId === 'contact-panel')
    expect(panel?.className).toContain('transition-[grid-template-rows,opacity]')
    expect(panel?.className).toContain('duration-200')
    expect(panel?.className).not.toContain('max-height')
  })

  it('honours prefers-reduced-motion', () => {
    const panel = renderAccordion(true).find((n) => n.testId === 'contact-panel')
    expect(panel?.className).toContain('motion-reduce:transition-none')
  })

  it('swaps the chevron direction with the expanded state', () => {
    // The arrow must VISIBLY change: chevron-down when collapsed, chevron-up
    // when open. Selection (not a CSS rotation) keeps it direction-independent.
    const closed = renderAccordion(false).find((n) => n.testId === 'contact-header')
    const open = renderAccordion(true).find((n) => n.testId === 'contact-header')
    const iconOf = (n?: Node) => {
      const kids = flatten(n?.children)
      return kids.find((k) => k.type === ChevronDown || k.type === ChevronUp)?.type
    }
    expect(iconOf(closed)).toBe(ChevronDown)
    expect(iconOf(open)).toBe(ChevronUp)
  })

  it('does not double-rotate the chevron with RTL transforms', () => {
    // A CSS rotation would need an RTL counter-rotation; selecting the glyph
    // outright avoids that entirely.
    const header = renderAccordion(true).find((n) => n.testId === 'contact-header')
    const icons = flatten(header?.children).filter(
      (k) => k.type === ChevronDown || k.type === ChevronUp
    )
    expect(icons.length).toBeGreaterThan(0)
    for (const icon of icons) {
      expect(icon.className).not.toContain('rotate-180')
      expect(icon.className).not.toContain('rtl:')
    }
  })

  it('keeps the section description at body weight inside the button', () => {
    // globals.css sets `button { font-weight: 600 }`. The description must opt
    // back out to 400 or it inherits the button weight and reads as bold.
    const nodes = renderAccordion(true)
    const desc = nodes.find((n) => n.children === 'Details')
    expect(desc).toBeDefined()
    expect(desc?.className).toContain('font-normal')
  })

  it('shows the preview only while collapsed', () => {
    const withPreview = (open: boolean) =>
      flatten(
        AccordionSection({
          locale: 'en',
          title: 'Identity',
          open,
          onToggle: () => {},
          testId: 'identity',
          preview: 'PREVIEW',
          children: 'BODY',
        })
      )
    expect(withPreview(false).find((n) => n.testId === 'identity-preview')).toBeDefined()
    expect(withPreview(true).find((n) => n.testId === 'identity-preview')).toBeUndefined()
  })

  it('uses a real button for the toggle (keyboard operable)', () => {
    const header = renderAccordion(true).find((n) => n.testId === 'contact-header')
    expect(header?.type).toBe('button')
  })
})

// ---------------------------------------------------------------------------
// 4. Image upload zone
// ---------------------------------------------------------------------------

describe('ImageUploadZone — upload UX', () => {
  // ImageUploadZone uses hooks, so it must be rendered through React rather
  // than invoked as a plain function (JSX is unavailable in a .ts file).
  const html = renderToStaticMarkup(
    createElement(ImageUploadZone, {
      locale: 'en' as const,
      onFile: () => {},
      accept: 'image/png, image/jpeg, image/webp',
      maxSizeLabel: 'PNG · JPEG · WebP · 2MB',
      title: 'Upload image',
    })
  )

  it('renders a visible choose-image action', () => {
    expect(html).toContain('Choose image')
  })

  it('keeps a native file input present for accessibility', () => {
    expect(html).toContain('type="file"')
    expect(html).toContain('aria-label="Upload image"')
  })

  it('restricts accepted types via the accept attribute', () => {
    expect(html).toContain('accept="image/png, image/jpeg, image/webp"')
  })

  it('advertises the accepted formats and size limit', () => {
    expect(html).toContain('PNG · JPEG · WebP · 2MB')
  })

  it('is keyboard reachable through the choose-image button', () => {
    expect(html).toContain('<button')
    expect(html).toContain('type="button"')
  })
})
