import { describe, expect, it } from 'vitest'
import { TenantWebsite } from '@/components/tenant-website'
import { LocaleSwitchLink } from '@/components/locale-switcher'
import { createDefaultWebsiteConfig } from './website-config'
import { applyPreset } from './theme-presets'

// ---------------------------------------------------------------------------
// Responsive quality of the public tenant website.
//
// These are SOURCE-LEVEL checks on the rendered element tree: they assert the
// classes/attributes that make the layout robust at narrow widths (text wrapping,
// shrink/truncate on the header, min-w-0 on flex/grid children, mobile padding).
//
// They do NOT measure pixels — real viewport measurement lives in the Playwright
// audit (scripts/_responsive-audit.mjs). See the phase report for those numbers.
// ---------------------------------------------------------------------------

const baseProps = {
  locale: 'ar' as const,
  slug: 'bebo-salon',
  tenant: { currency: 'EGP', email: null, phoneE164: null, theme: null },
  translation: { name: 'صالون', tagline: 'شريط', description: 'وصف', address: 'القاهرة' },
  serviceRows: [
    { id: 's1', name: 'خدمة', description: 'وصف', durationMin: 60, priceAmount: '100' },
  ],
  hoursRows: [{ weekday: 0, startTime: '09:00', endTime: '17:00' }],
  config: createDefaultWebsiteConfig(),
}

/** A rendered element, flattened from the React element tree. */
interface Node {
  type: unknown
  className: string
  style?: Record<string, unknown>
  href?: string
  title?: string
  alt?: string
  testId?: string
  children: unknown
}

/**
 * Flatten a React element tree. Elements carry `{ type, props }`; we read the
 * class/style/href off `props` (the previous version wrongly read them off the
 * element itself).
 */
function flatten(node: unknown, depth = 0, out: Node[] = []): Node[] {
  if (depth > 20 || node === null || typeof node !== 'object') return out
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
      title: el.props.title as string | undefined,
      alt: el.props.alt as string | undefined,
      testId: el.props['data-testid'] as string | undefined,
      children: el.props.children,
    })
    flatten(el.props.children, depth + 1, out)
  }
  return out
}

const render = (locale: 'ar' | 'en' = 'ar', config = baseProps.config) =>
  flatten(TenantWebsite({ ...baseProps, locale, config }))

const find = (nodes: Node[], pred: (n: Node) => boolean) => nodes.find(pred)

/**
 * The tenant brand-name span, located by its STABLE hook rather than by a
 * utility class. The class list legitimately changes with typography/spacing
 * work, but `data-testid` is the documented contract (the Playwright spec
 * selects it the same way), so tests do not break on cosmetic churn.
 */
const brandName = (nodes: Node[]) =>
  find(nodes, (n) => n.testId === 'tenant-brand-name')

/** The brand link that wraps the logo + name. */
const brandLink = (nodes: Node[]) =>
  find(links(nodes), (n) => n.className.includes('min-w-0') && n.className.includes('items-center'))

/**
 * Any element that links somewhere. Next.js `<Link>` does NOT render as
 * `type === 'a'` in the element tree (only raw `<a>` tags do), so match on the
 * presence of an `href` prop instead of the element type.
 */
const links = (nodes: Node[]) => nodes.filter((n) => typeof n.href === 'string' && n.href.length > 0)

describe('responsive: text wrapping safety', () => {
  it('the hero heading wraps long words', () => {
    expect(find(render(), (n) => n.type === 'h1')!.className).toContain('break-words')
  })

  it('the hero description wraps long words', () => {
    const p = find(render(), (n) => n.type === 'p' && n.className.includes('max-w-xl'))!
    expect(p.className).toContain('break-words')
  })

  it('the services heading wraps', () => {
    expect(find(render(), (n) => n.type === 'h2')!.className).toContain('break-words')
  })

  it('service names wrap', () => {
    expect(find(render(), (n) => n.type === 'h3')!.className).toContain('break-words')
  })

  it('the hero CTA label wraps inside the button', () => {
    const heroCta = find(
      links(render()),
      (n) => n.className.includes('max-w-full') && String(n.href ?? '').endsWith('/book')
    )!
    expect(heroCta).toBeTruthy()
    const label = flatten(heroCta.children).find((n) => n.type === 'span' && n.className.includes('break-words'))
    expect(label).toBeTruthy()
  })

  it('the site root carries the tenant-site wrapping scope', () => {
    expect(find(render(), (n) => n.type === 'main')!.className).toContain('tenant-site')
  })

  it('inline icons are shrink-0 so they cannot be squashed', () => {
    const icons = render().filter((n) => n.className.includes('h-4 w-4') || n.className.includes('h-5 w-5'))
    expect(icons.length).toBeGreaterThan(0)
    for (const icon of icons) expect(icon.className).toContain('shrink-0')
  })
})

describe('responsive: header fits narrow screens', () => {
  it('the header row can shrink and has a nonzero gap', () => {
    const row = find(render(), (n) => n.type === 'div' && n.className.includes('max-w-7xl') && n.className.includes('justify-between'))!
    // Any nonzero gap satisfies the design; the exact step (gap-2 vs gap-3) is
    // a spacing decision, not a contract. What matters is that a gap exists so
    // the brand and the nav cannot touch.
    const gap = row.className.match(/(?:^|\s)gap-(\d+(?:\.\d+)?)(?:\s|$)/)
    expect(gap, `no gap utility on header row: ${row.className}`).toBeTruthy()
    expect(Number(gap![1])).toBeGreaterThan(0)
  })

  it('the brand name is visible at every breakpoint and never hidden', () => {
    const nameSpan = brandName(render())
    expect(nameSpan).toBeTruthy()
    // The business name is the tenant's identity on the public site, so it is
    // rendered at every width. Hiding it below `sm` (the previous behaviour)
    // removed the brand name from every mobile viewport.
    expect(nameSpan!.className).not.toContain('hidden')
    expect(nameSpan!.className).not.toContain('sm:inline-block')
  })

  it('the brand name can shrink but keeps a readable floor', () => {
    const nameSpan = brandName(render())!
    // A min-width floor stops flex from sacrificing the brand name first; the
    // class must not be the 0-width `min-w-0` (that is what squeezed it to
    // ~40px on a 320px viewport). `min-w-18` = 4.5rem = 72px.
    expect(nameSpan.className).toContain('min-w-18')
    expect(nameSpan.className).not.toMatch(/(^|\s)min-w-0(\s|$)/)
  })

  it('the brand name wraps to two lines on mobile and one line from sm up', () => {
    const nameSpan = brandName(render())!
    // Mobile: up to TWO lines, then truncation.
    expect(nameSpan.className).toContain('line-clamp-2')
    // From `sm` up: a single line.
    expect(nameSpan.className).toContain('sm:line-clamp-1')
    expect(nameSpan.className).toContain('leading-tight')
  })

  it('the brand name exposes the full text when it is clipped', () => {
    // `title` is the accessible fallback for a long, ellipsized business name.
    expect(brandName(render())!.title).toBe('صالون')
  })

  it('the brand name carries a stable test hook for the layout tests', () => {
    // The Playwright spec selects this element by testid rather than by its
    // position among siblings, so the attribute is part of the contract.
    expect(brandName(render())!.testId).toBe('tenant-brand-name')
  })

  it('the brand name is not duplicated by the logo alt text', () => {
    const brand = brandLink(render())!
    const img = flatten(brand.children).find((n) => n.type === 'img')
    // The name sits next to the logo, so a business-name alt would make screen
    // readers announce it twice; the decorative logo uses alt="".
    if (img) expect(img.alt).toBe('')
  })

  it('the draft-preview header is identical (builder preview renders the name)', () => {
    // The builder's /preview route renders this same component with a
    // `previewBanner` slot. The header is NOT conditional on that prop, so the
    // brand name must appear in the preview exactly as it does on the live site.
    const withBanner = flatten(
      TenantWebsite({
        ...baseProps,
        // `previewBanner` is a ReactNode slot; a string is valid and avoids JSX
        // in this .ts file.
        previewBanner: 'Draft Preview — This page is not public',
      })
    )
    const nameSpan = find(withBanner, (n) => n.testId === 'tenant-brand-name')
    expect(nameSpan).toBeTruthy()
    expect(nameSpan!.className).not.toContain('hidden')
    expect(nameSpan!.title).toBe('صالون')
    // Preview parity includes the clamping behaviour.
    expect(nameSpan!.className).toContain('line-clamp-2')
    expect(nameSpan!.className).toContain('sm:line-clamp-1')
  })

  it('the nav can shrink below its content', () => {
    expect(find(render(), (n) => n.type === 'nav')!.className).toContain('min-w-0')
  })

  it('the header booking CTA truncates its label', () => {
    const cta = find(
      links(render()),
      (n) => n.className.includes('min-w-0') && String(n.href ?? '').endsWith('/book')
    )!
    expect(cta).toBeTruthy()
    const label = flatten(cta.children).find((n) => n.type === 'span' && n.className.includes('truncate'))
    expect(label).toBeTruthy()
  })

  it('the header CTA keeps a touch-friendly height', () => {
    const cta = find(
      links(render()),
      (n) => n.className.includes('px-3') && String(n.href ?? '').endsWith('/book')
    )!
    expect(cta.className).toContain('py-2')
  })

  it('the header uses tighter horizontal padding on mobile', () => {
    const row = find(render(), (n) => n.type === 'div' && n.className.includes('max-w-7xl') && n.className.includes('justify-between'))!
    expect(row.className).toContain('px-4')
    expect(row.className).toContain('sm:px-6')
  })

  it('the services anchor is hidden on mobile', () => {
    const anchor = find(links(render()), (n) => n.href === '#services')!
    expect(anchor.className).toContain('hidden')
    expect(anchor.className).toContain('sm:inline-block')
  })
})

describe('responsive: sections and cards', () => {
  it('section content uses tighter mobile padding and relaxes on desktop', () => {
    const containers = render().filter(
      (n) => n.type === 'div' && n.className.includes('max-w-7xl') && n.className.includes('px-4')
    )
    // hero container + services container
    expect(containers.length).toBeGreaterThanOrEqual(2)
    for (const c of containers) expect(c.className).toContain('sm:px-6')
  })

  it('the services section keeps the single global background (no inline bg)', () => {
    const services = find(render(), (n) => n.type === 'section' && n.className.includes('border-t'))!
    expect(services.style?.backgroundColor).toBeUndefined()
  })

  it('service cards are min-w-0 so long text cannot blow out the grid', () => {
    const cards = render().filter(
      (n) => n.type === 'div' && n.className.includes('bg-paper') && n.className.includes('rounded-2xl')
    )
    expect(cards.length).toBeGreaterThan(0)
    for (const card of cards) expect(card.className).toContain('min-w-0')
  })

  it('the card keeps price and action from colliding', () => {
    // The metadata row (duration + price) wraps, and the booking action is its
    // own row beneath it, so the two can never overlap — even at 320px. The
    // exact `justify-between`/`gap-3` pairing is no longer the mechanism, so the
    // assertion targets the properties that actually prevent a collision.
    const nodes = render()
    const metadataRow = find(
      nodes,
      (n) => n.type === 'div' && n.className.includes('flex-wrap') && n.className.includes('items-center')
    )
    expect(metadataRow).toBeTruthy()
    expect(metadataRow!.className).toContain('flex-wrap')

    const action = find(
      links(nodes),
      (n) => String(n.href ?? '').includes('?service=')
    )
    expect(action).toBeTruthy()
    // The action carries its own width/spacing rules rather than sharing a row.
    expect(action!.className).toMatch(/w-fit|sm:w-full/)
  })

  it('the grid keeps responsive column counts', () => {
    const grid = find(render(), (n) => n.type === 'div' && n.className.includes('grid'))!
    expect(grid.className).toContain('sm:grid-cols-2')
    expect(grid.className).toContain('lg:grid-cols-3')
  })

  it('cards keep their neutral surface (not a primary-colored surface)', () => {
    for (const card of render().filter((n) => n.className.includes('bg-paper'))) {
      expect(card.style?.backgroundColor).toBeUndefined()
    }
  })
})

describe('responsive: RTL/LTR and theme preserved', () => {
  it('Arabic renders rtl and English renders ltr on the root', () => {
    const ar = TenantWebsite({ ...baseProps, locale: 'ar' }) as { props: { dir: string } }
    const en = TenantWebsite({ ...baseProps, locale: 'en' }) as { props: { dir: string } }
    expect(ar.props.dir).toBe('rtl')
    expect(en.props.dir).toBe('ltr')
  })

  it('responsive classes do not change the theme colors', () => {
    const config = applyPreset(createDefaultWebsiteConfig(), 'clinic')
    const main = TenantWebsite({ ...baseProps, config }) as { props: { style: Record<string, string> } }
    expect(main.props.style['--site-bg']).toBe('#F7FAFF')
    expect(main.props.style['--site-primary']).toBe('#2563EB')
    expect(main.props.style.backgroundColor).toBe('#F7FAFF')
  })

  it('primary buttons still use the primary color', () => {
    const primaries = render().filter((n) => n.style?.backgroundColor === 'var(--site-primary)')
    expect(primaries.length).toBeGreaterThanOrEqual(3)
  })

  it('the services grid has identical classes in both locales', () => {
    const grid = (loc: 'ar' | 'en') => find(render(loc), (n) => n.type === 'div' && n.className.includes('grid'))!.className
    expect(grid('ar')).toBe(grid('en'))
  })

  it('the language switcher still targets the same tenant in the other locale', () => {
    const link = LocaleSwitchLink({ currentLocale: 'ar', href: '/en/tenants/bebo-salon' }) as {
      props: { href: string }
    }
    expect(link.props.href).toBe('/en/tenants/bebo-salon')
  })
})
