import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Tenant dashboard structure: navigation order, tenant display name, and the
// responsive mobile-navigation contract.
//
// The dashboard page is an async Server Component that needs DB access, so it
// cannot be rendered here. These assertions pin the structure that matters and
// would otherwise regress silently. The responsive drawer BEHAVIOUR (open/close,
// Escape, focus trap, RTL anchoring) is verified in the browser by
// e2e-responsive/dashboard-navigation.spec.ts.
// ---------------------------------------------------------------------------

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8')

const dashboard = read('../app/[locale]/tenants/[slug]/dashboard/page.tsx')
const mobileNav = read('../components/dashboard-mobile-nav.tsx')

describe('sidebar navigation order', () => {
  const expectedOrder = ['overview', 'customers', 'services', 'team', 'website', 'settings']

  it('declares the nav items in the required order', () => {
    // Isolate the `const nav = [...]` block.
    const start = dashboard.indexOf('const nav = [')
    const end = dashboard.indexOf(']', dashboard.indexOf("id: 'settings'"))
    const block = dashboard.slice(start, end)
    const ids = [...block.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1])
    expect(ids).toEqual(expectedOrder)
  })

  it('does not duplicate any nav entry', () => {
    const start = dashboard.indexOf('const nav = [')
    const end = dashboard.indexOf(']', dashboard.indexOf("id: 'settings'"))
    const block = dashboard.slice(start, end)
    const ids = [...block.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps every nav destination as a ?tab= query link', () => {
    for (const id of expectedOrder) {
      expect(dashboard).toContain(`href={\`?tab=\${n.id}\`}`)
    }
  })

  it('renders the SAME nav array in both the sidebar and the mobile drawer', () => {
    // One source of truth: both render from `nav`.
    expect(dashboard).toContain('{nav.map(')
    expect(dashboard).toContain('items={nav}')
  })

  it('preserves active-item highlighting in the sidebar', () => {
    expect(dashboard).toContain("tab === n.id ? 'bg-brand-teal font-semibold text-white shadow-sm'")
  })

  it('preserves the platform-admin entry and its destination', () => {
    expect(dashboard).toContain('isPlatformAdmin')
    expect(dashboard).toContain('`/${locale}/admin`')
  })
})

describe('tenant display name', () => {
  it('derives the heading from the tenant translation, not a hardcoded label', () => {
    expect(dashboard).toContain('const tenantDisplayName = tenantTranslation?.name?.trim() || access.tenant.slug')
  })

  it('prefers the display name over the slug', () => {
    // translation first, slug only as fallback
    const idx = dashboard.indexOf('const tenantDisplayName')
    const line = dashboard.slice(idx, dashboard.indexOf('\n', idx))
    expect(line.indexOf('tenantTranslation')).toBeLessThan(line.indexOf('access.tenant.slug'))
  })

  it('uses the display name for the page heading', () => {
    // There are two <h1>s: the suspended-account screen and the dashboard
    // heading. Target the dashboard one (the only one rendering the name).
    expect(dashboard).toContain('>{tenantDisplayName}</h1>')
  })

  it('no longer heads the page with the generic workspace title', () => {
    const h1Idx = dashboard.indexOf('>{tenantDisplayName}</h1>')
    const h1Start = dashboard.lastIndexOf('<h1', h1Idx)
    const h1 = dashboard.slice(h1Start, dashboard.indexOf('</h1>', h1Idx))
    expect(h1).not.toContain('{t.title}')
  })

  it('keeps the heading safe for long names (wrapping, not overflow)', () => {
    const h1Idx = dashboard.indexOf('>{tenantDisplayName}</h1>')
    const h1Start = dashboard.lastIndexOf('<h1', h1Idx)
    const h1 = dashboard.slice(h1Start, dashboard.indexOf('>', h1Start))
    expect(h1).toContain('break-words')
  })

  it('shows the display name in the sidebar workspace card too', () => {
    expect(dashboard).toContain('{tenantDisplayName}</p>')
  })
})

describe('website editor spacing', () => {
  it('adds a top gap before the website editor heading', () => {
    expect(dashboard).toContain('<div className="mt-9 mb-6">')
  })

  it('does not change other tabs spacing', () => {
    // Overview/customers/services/team already used mt-9 and keep it.
    expect(dashboard).toContain('className="mt-9 grid gap-4 sm:grid-cols-3"')
    expect(dashboard).toContain('className="mt-9 rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6"')
  })
})

describe('responsive navigation contract', () => {
  it('the desktop sidebar is hidden below lg', () => {
    expect(dashboard).toContain('hidden w-64 border-e border-border bg-paper p-5 lg:block')
  })

  it('the mobile trigger is only shown below lg', () => {
    expect(mobileNav).toContain('lg:hidden')
  })

  it('the trigger has a localized accessible label and expanded state', () => {
    expect(mobileNav).toContain("aria-label={rtl ? 'فتح قائمة التنقل' : 'Open navigation menu'}")
    expect(mobileNav).toContain('aria-expanded={open}')
    expect(mobileNav).toContain('aria-haspopup="dialog"')
  })

  it('the drawer is a labelled modal dialog', () => {
    expect(mobileNav).toContain('role="dialog"')
    expect(mobileNav).toContain('aria-modal="true"')
    expect(mobileNav).toContain("aria-label={rtl ? 'قائمة التنقل' : 'Navigation menu'}")
  })

  it('closes on Escape', () => {
    expect(mobileNav).toContain("event.key === 'Escape'")
  })

  it('closes on backdrop click', () => {
    expect(mobileNav).toContain('onClick={close}')
  })

  it('has a visible localized close button', () => {
    expect(mobileNav).toContain("aria-label={rtl ? 'إغلاق القائمة' : 'Close menu'}")
  })

  it('traps Tab focus inside the panel', () => {
    expect(mobileNav).toContain("event.key !== 'Tab'")
    expect(mobileNav).toContain('last.focus()')
    expect(mobileNav).toContain('first.focus()')
  })

  it('locks background scroll while open', () => {
    expect(mobileNav).toContain("document.body.style.overflow = 'hidden'")
  })

  it('returns focus to the trigger on close', () => {
    expect(mobileNav).toContain('triggerRef.current?.focus()')
  })

  it('anchors the panel with the logical start edge (RTL-safe)', () => {
    // `start-0` resolves to the right in Arabic and the left in English.
    expect(mobileNav).toContain('start-0')
    expect(mobileNav).not.toContain('left-0')
  })

  it('closes the drawer after navigating', () => {
    const navLink = mobileNav.slice(mobileNav.indexOf('href={`?tab='))
    expect(navLink.slice(0, 200)).toContain('onClick={close}')
  })

  it('marks the active item for assistive tech', () => {
    expect(mobileNav).toContain("aria-current={isActive ? 'page' : undefined}")
  })

  it('reuses the passed-in nav items instead of defining its own', () => {
    expect(mobileNav).not.toContain("id: 'overview'")
    expect(mobileNav).toContain('items.map(')
  })
})
