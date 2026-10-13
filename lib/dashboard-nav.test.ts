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

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8').replace(/\r\n/g, '\n')

// The dashboard is split across three files now, and each assertion below is
// pointed at the file that OWNS the concern:
//   - page.tsx             -> the active tab's content
//   - dashboard/layout.tsx -> the persistent shell (sidebar + header)
//   - lib/dashboard-nav.tsx-> the shared nav array + copy
const dashboard = read('../app/[locale]/tenants/[slug]/dashboard/page.tsx')
const shell = read('../app/[locale]/tenants/[slug]/dashboard/layout.tsx')
const navModule = read('../lib/dashboard-nav.tsx')
const sidebarLink = read('../components/dashboard-sidebar-link.tsx')
const mobileNav = read('../components/dashboard-mobile-nav.tsx')
const publicWebsiteLink = read('../components/public-website-link.tsx')
const routes = read('../lib/routes.ts')

describe('sidebar navigation order', () => {
  const expectedOrder = ['overview', 'customers', 'services', 'team', 'website', 'settings']

  it('declares the nav items in the required order', () => {
    // Isolate the `const nav = [...]` block.
    const start = navModule.indexOf('export function buildDashboardNav')
    const end = navModule.indexOf(']', navModule.indexOf("id: 'settings'"))
    const block = navModule.slice(start, end)
    const ids = [...block.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1])
    expect(ids).toEqual(expectedOrder)
  })

  it('does not duplicate any nav entry', () => {
    const start = navModule.indexOf('export function buildDashboardNav')
    const end = navModule.indexOf(']', navModule.indexOf("id: 'settings'"))
    const block = navModule.slice(start, end)
    const ids = [...block.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps every nav destination as a ?tab= query link', () => {
    for (const id of expectedOrder) {
      // The href is built by the sidebar link component.
      expect(sidebarLink).toContain('href={`?tab=${item.id}`}')
    }
  })

  it('renders the SAME nav array in both the sidebar and the mobile drawer', () => {
    // One source of truth: the shell renders the sidebar from `nav` and
    // passes the SAME array to the mobile drawer.
    expect(shell).toContain('{nav.map((item) => (')
    expect(shell).toContain('items={nav}')
    expect(navModule).toContain('export function buildDashboardNav')
  })

  it('preserves active-item highlighting in the sidebar', () => {
    expect(sidebarLink).toContain("isActive ? 'bg-brand-teal font-semibold text-white shadow-sm'")
  })

  it('preserves the platform-admin entry and its destination', () => {
    expect(shell).toContain('isPlatformAdmin')
    expect(shell).toContain('`/${typedLocale}/admin`')
  })

  it('uses the Store icon ONLY for the Website nav item', () => {
    const start = navModule.indexOf('export function buildDashboardNav')
    const end = navModule.indexOf(']', navModule.indexOf("id: 'settings'"))
    const block = navModule.slice(start, end)
    // Exactly one Store icon, on the website item.
    const storeIcons = block.match(/<Store\b/g) ?? []
    expect(storeIcons.length).toBe(1)
    const websiteLine = block.slice(block.indexOf("id: 'website'"), block.indexOf("id: 'settings'"))
    expect(websiteLine).toContain('<Store')
    // No other nav item gained Store.
    expect(block.slice(0, block.indexOf("id: 'website'"))).not.toContain('<Store')
  })

  it('keeps the same icon size and aria-hidden on every nav icon', () => {
    const start = navModule.indexOf('export function buildDashboardNav')
    const end = navModule.indexOf(']', navModule.indexOf("id: 'settings'"))
    const block = navModule.slice(start, end)
    const icons = block.match(/aria-hidden="true" className="h-4 w-4"/g) ?? []
    expect(icons.length).toBe(6)
  })
})

describe('sidebar spacing and active state', () => {
  it('uses tight item spacing without collapsing the list', () => {
    // Same tight item spacing; the nav is also the sidebar's scroll region.
    expect(shell).toContain('space-y-0.5 overflow-y-auto')
    expect(shell).toContain('min-h-0 flex-1')
  })

  it('applies the teal active treatment only to the selected item', () => {
    // Single conditional: active gets teal, inactive gets a hover only.
    expect(sidebarLink).toContain("isActive ? 'bg-brand-teal font-semibold text-white shadow-sm' : 'text-[#647087] hover:bg-surface'")
  })

  it('does not reintroduce the Workspace identity card', () => {
    expect(shell).not.toContain('mt-10 rounded-2xl bg-surface p-4')
  })
})

describe('Business Insights is removed from the Overview UI', () => {
  it('renders no insights section', () => {
    expect(dashboard).not.toContain('insights')
    expect(dashboard).not.toContain('رؤى سريعة')
    expect(dashboard).not.toContain("'Insights'")
  })

  it('leaves no empty container or section-specific spacing behind', () => {
    // The appointments card follows the onboarding block directly.
    expect(dashboard).toContain(')}\n\n            <div className="mt-6 rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6"><h2 className="text-lg font-semibold">{t.appointments}</h2>')
  })

  it('drops the now-unused pending-count query', () => {
    expect(dashboard).not.toContain("bookings.status, 'pending'")
  })

  it('keeps the statistics cards, quick actions and onboarding intact', () => {
    expect(dashboard).toContain('lg:grid-cols-4')
    expect(dashboard).toContain("?tab=services")
    expect(dashboard).toContain('OnboardingSuccess')
  })
})

describe('onboarding completion', () => {
  const success = read('../components/onboarding-success.tsx')

  it('swaps the checklist for a success message only when complete', () => {
    expect(dashboard).toContain('onboardingComplete ? (')
    expect(dashboard).toContain('<OnboardingSuccess')
  })

  it('keeps the checklist rendered while incomplete', () => {
    expect(dashboard).toContain("{rtl ? 'خطوات البدء' : 'Getting started'}")
    expect(dashboard).toContain('{checklist.map((item) => (')
  })

  it('shows the requested localized success copy', () => {
    expect(success).toContain("'تم إعداد مساحة العمل بنجاح'")
    expect(success).toContain("'Your workspace is all set!'")
  })

  it('is dismissible and persists without a DB migration', () => {
    expect(success).toContain('window.localStorage.setItem(storageKey')
    expect(success).toContain("aria-label={rtl ? 'إخفاء رسالة الإعداد' : 'Dismiss setup message'}")
    expect(success).not.toContain('fetch(')
  })

  it('namespaces persistence per tenant', () => {
    expect(dashboard).toContain('storageKey={`idarty:onboarding-success:${access.tenant.id}`}')
  })
})

describe('unified public website link control', () => {
  it('sources the URL from the project URL helper, not a hardcoded domain', () => {
    expect(dashboard).toContain('publicTenantUrl(locale, slug)')
    expect(dashboard).toContain("import { publicTenantUrl } from '@/lib/routes'")
    expect(publicWebsiteLink).not.toContain('idarty.vercel.app')
    expect(dashboard).not.toContain('idarty.vercel.app')
  })

  it('replaces the separate View website button and the old copy field', () => {
    expect(dashboard).toContain('<PublicWebsiteLink url={publicUrl} locale={locale} siteName={tenantDisplayName} />')
    // No leftover duplicate controls.
    expect(dashboard).not.toContain('PublicLinkCopy')
    expect(dashboard).not.toContain("'عرض الموقع'")
    expect(dashboard).not.toContain("'View website'")
  })

  it('opens the public site in a new tab', () => {
    expect(publicWebsiteLink).toContain('target="_blank"')
    expect(publicWebsiteLink).toContain('rel="noreferrer"')
    expect(publicWebsiteLink).toContain('href={url}')
    expect(publicWebsiteLink).toContain('<ExternalLink')
    expect(publicWebsiteLink).toContain("aria-label={rtl ? 'فتح الموقع في تبويب جديد' : 'Open website in a new tab'}")
  })

  it('copies the full absolute URL resolved against the browser origin', () => {
    expect(publicWebsiteLink).toContain('navigator.clipboard.writeText(absolute)')
    expect(publicWebsiteLink).toContain('window.location.origin')
    expect(publicWebsiteLink).toContain('<Copy')
  })

  it('shows truncated display text but exposes the full URL', () => {
    expect(publicWebsiteLink).toContain('truncate font-mono')
    expect(publicWebsiteLink).toContain('title={url}')
  })

  it('provides localized success and failure feedback', () => {
    expect(publicWebsiteLink).toContain("rtl ? 'تم نسخ الرابط' : 'Link copied'")
    expect(publicWebsiteLink).toContain("rtl ? 'تعذر نسخ الرابط' : 'Could not copy'")
    expect(publicWebsiteLink).toContain('role="status"')
    expect(publicWebsiteLink).toContain('aria-live="polite"')
  })

  it('uses a Check icon for the copied state', () => {
    expect(publicWebsiteLink).toContain('<Check')
  })

  it('handles clipboard failure gracefully', () => {
    expect(publicWebsiteLink).toContain('} catch {')
    expect(publicWebsiteLink).toContain('document.execCommand')
    expect(publicWebsiteLink).toContain("setStatus(ok ? 'copied' : 'error')")
  })

  it('wraps on narrow screens without forcing overflow', () => {
    expect(publicWebsiteLink).toContain('flex flex-wrap items-center')
    expect(publicWebsiteLink).toContain('min-w-0')
    expect(publicWebsiteLink).not.toContain('overflow-x')
  })

  it('spans the content width with the groups at opposite edges', () => {
    // Full-width card; identity at the start edge and the actions at the end
    // edge, with the free space between them.
    expect(publicWebsiteLink).toContain('w-full rounded-3xl')
    expect(publicWebsiteLink).toContain('flex flex-wrap items-center justify-between')
    // Identity group can shrink so the url truncates instead of overflowing.
    expect(publicWebsiteLink).toContain('flex min-w-0 items-center gap-3')
    // Actions stay grouped together (never split apart).
    expect(publicWebsiteLink).toContain('flex shrink-0 items-center gap-2')
  })

  it('is placed above the Quick Actions row', () => {
    // Anchor on the actual row markup, not the phrase (which also appears in
    // an earlier comment elsewhere in the page).
    const cardIdx = dashboard.indexOf('<PublicWebsiteLink')
    const qaRowIdx = dashboard.indexOf('mt-4 flex flex-wrap gap-2')
    expect(cardIdx).toBeGreaterThan(-1)
    expect(qaRowIdx).toBeGreaterThan(-1)
    // The card is rendered before the quick-actions row in source order.
    expect(cardIdx).toBeLessThan(qaRowIdx)
    // And the row still holds exactly the three remaining actions.
    const row = dashboard.slice(qaRowIdx, dashboard.indexOf('</div>', qaRowIdx))
    expect(row).toContain('?tab=services')
    expect(row).toContain('?tab=team')
    expect(row).toContain('?tab=website')
    expect(row).not.toContain('<PublicWebsiteLink')
  })

  it('keeps the other quick actions unchanged', () => {
    expect(dashboard).toContain("?tab=services")
    expect(dashboard).toContain("?tab=team")
    expect(dashboard).toContain("?tab=website")
  })
})

describe('public website link card', () => {
  it('renders as a standalone card with the muted section label', () => {
    expect(publicWebsiteLink).toContain("rtl ? 'رابط الموقع العام' : 'Public Website Link'")
    expect(publicWebsiteLink).toContain('rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6')
  })

  it('groups the website identity with a globe icon on the start side', () => {
    expect(publicWebsiteLink).toContain('<Globe')
    expect(publicWebsiteLink).toContain("rtl ? `موقع ${siteName}` : `${siteName} Website`")
    // URL sits under the title in muted text, kept LTR for readability.
    expect(publicWebsiteLink).toContain('dir="ltr" title={url}')
    expect(publicWebsiteLink).toContain('text-ink-muted')
  })

  it('places Copy then Open on the end side, teal primary for Open', () => {
    const copyIdx = publicWebsiteLink.indexOf('aria-label={rtl ? \'نسخ رابط الموقع\'')
    const openIdx = publicWebsiteLink.indexOf('aria-label={rtl ? \'فتح الموقع في تبويب جديد\'')
    expect(copyIdx).toBeGreaterThan(-1)
    expect(openIdx).toBeGreaterThan(copyIdx)
    // Open keeps the teal primary treatment; Copy stays neutral with a border.
    expect(publicWebsiteLink).toContain('bg-brand-teal text-white')
    expect(publicWebsiteLink).toContain('border border-border bg-paper text-[#516078]')
  })

  it('keeps both action buttons the same compact square size', () => {
    const nines = publicWebsiteLink.match(/h-9 w-9/g) ?? []
    expect(nines.length).toBeGreaterThanOrEqual(2)
  })

  it('is NOT duplicated inside the Quick Actions row', () => {
    const rowStart = dashboard.indexOf('Quick actions')
    const rowEnd = dashboard.indexOf('</div>', dashboard.indexOf('?tab=website'))
    const row = dashboard.slice(rowStart, rowEnd)
    expect(row).not.toContain('<PublicWebsiteLink')
    // ...but it is rendered once, right after the row.
    expect((dashboard.match(/<PublicWebsiteLink/g) ?? []).length).toBe(1)
  })

  it('avoids fixed widths / min-heights that would create empty space', () => {
    expect(publicWebsiteLink).not.toMatch(/min-h-\[/)
    expect(publicWebsiteLink).not.toMatch(/w-\[\d+px\]/)
    expect(publicWebsiteLink).not.toMatch(/max-w-\[/)
  })
})

describe('quick actions icons', () => {
  it('uses Plus for Add Service and keeps the teal primary styling', () => {
    expect(dashboard).toContain('<Plus aria-hidden="true" className="h-4 w-4 shrink-0" />')
    expect(dashboard).toContain('bg-brand-teal px-4 py-2.5 text-sm font-semibold text-white')
  })

  it('uses Pencil for Edit Website and Users for Add Team Member', () => {
    expect(dashboard).toContain('<Pencil aria-hidden="true" className="h-4 w-4 shrink-0" />')
    expect(dashboard).toContain('<Users aria-hidden="true" className="h-4 w-4 shrink-0" />')
  })

  it('keeps one consistent icon size and stroke convention', () => {
    // All quick-action icons are 16px with aria-hidden; no filled/oversized icons.
    expect(dashboard).not.toMatch(/fill="currentColor"/)
    expect(dashboard).toContain('className="h-4 w-4 shrink-0"')
  })
})

describe('Services icon', () => {
  const navBlock = () => {
    const start = navModule.indexOf('export function buildDashboardNav')
    const end = navModule.indexOf(']', navModule.indexOf("id: 'settings'"))
    return navModule.slice(start, end)
  }

  it('maps Layers to Services only', () => {
    const b = navBlock()
    const services = b.slice(b.indexOf("id: 'services'"), b.indexOf("id: 'team'"))
    expect(services).toContain('<Layers')
    expect(services).not.toContain('<ClipboardList')
    expect((b.match(/<Layers/g) ?? []).length).toBe(1)
  })

  it('leaves the Services label, size and accessibility attributes intact', () => {
    const b = navBlock()
    const services = b.slice(b.indexOf("id: 'services'"), b.indexOf("id: 'team'"))
    expect(services).toContain('label: t.services')
    expect(services).toContain('aria-hidden="true" className="h-4 w-4"')
  })

  it('keeps ClipboardList for the services stat card', () => {
    expect(dashboard).toContain('<Stat icon={<ClipboardList className="h-5 w-5" />}')
  })
})

describe('Overview icon', () => {
  const navBlock = () => {
    const start = navModule.indexOf('export function buildDashboardNav')
    const end = navModule.indexOf(']', navModule.indexOf("id: 'settings'"))
    return navModule.slice(start, end)
  }

  it('maps LayoutDashboard to Overview only', () => {
    const b = navBlock()
    const overview = b.slice(b.indexOf("id: 'overview'"), b.indexOf("id: 'customers'"))
    expect(overview).toContain('<LayoutDashboard')
    expect(overview).not.toContain('<CalendarDays')
    // No other nav item uses LayoutDashboard.
    expect((b.match(/<LayoutDashboard/g) ?? []).length).toBe(1)
  })

  it('keeps CalendarDays on Team & Schedule', () => {
    const b = navBlock()
    const team = b.slice(b.indexOf("id: 'team'"), b.indexOf("id: 'website'"))
    expect(team).toContain('<CalendarDays')
  })

  it('keeps the Overview label, size and accessibility attributes', () => {
    const b = navBlock()
    const overview = b.slice(b.indexOf("id: 'overview'"), b.indexOf("id: 'customers'"))
    expect(overview).toContain("label: locale === 'ar' ? 'نظرة عامة' : 'Overview'")
    expect(overview).toContain('aria-hidden="true" className="h-4 w-4"')
  })
})

describe('Team & Schedule icon', () => {
  const navBlock = () => {
    const start = navModule.indexOf('export function buildDashboardNav')
    const end = navModule.indexOf(']', navModule.indexOf("id: 'settings'"))
    return navModule.slice(start, end)
  }

  it('maps CalendarDays to Team & Schedule only', () => {
    const team = navBlock().slice(navBlock().indexOf("id: 'team'"), navBlock().indexOf("id: 'website'"))
    expect(team).toContain('<CalendarDays')
    expect(team).not.toContain('<Users')
  })

  it('leaves the Customers icon as Users', () => {
    const customers = navBlock().slice(navBlock().indexOf("id: 'customers'"), navBlock().indexOf("id: 'services'"))
    expect(customers).toContain('<Users')
    expect(customers).not.toContain('<CalendarDays')
  })

  it('keeps the icon size, aria-hidden and label unchanged', () => {
    const team = navBlock().slice(navBlock().indexOf("id: 'team'"), navBlock().indexOf("id: 'website'"))
    expect(team).toContain('aria-hidden="true" className="h-4 w-4"')
    expect(team).toContain("label: locale === 'ar' ? 'الفريق والجدول' : 'Team & Schedule'")
  })
})

describe('tenant display name', () => {
  it('derives the heading from the tenant translation, not a hardcoded label', () => {
    // Resolved by a shared helper so the shell and the page cannot diverge.
    expect(shell).toContain('resolveTenantDisplayName(tenantTranslation, access.tenant.slug)')
    expect(read('../lib/tenant-display-name.ts')).toContain('translation?.name?.trim() || slug')
  })

  it('prefers the display name over the slug', () => {
    // translation first, slug only as fallback
    const helper = read('../lib/tenant-display-name.ts')
    const ret = helper.slice(helper.indexOf('return '))
    const line = ret.slice(0, ret.indexOf('\n'))
    expect(line.indexOf('name')).toBeLessThan(line.indexOf('slug'))
  })

  it('uses the display name for the page heading', () => {
    // There are two <h1>s: the suspended-account screen and the dashboard
    // heading. Target the dashboard one (the only one rendering the name).
    expect(shell).toContain('>{tenantDisplayName}</h1>')
  })

  it('no longer heads the page with the generic workspace title', () => {
    const h1Idx = shell.indexOf('>{tenantDisplayName}</h1>')
    const h1Start = shell.lastIndexOf('<h1', h1Idx)
    const h1 = shell.slice(h1Start, shell.indexOf('</h1>', h1Idx))
    expect(h1).not.toContain('{t.title}')
  })

  it('keeps the heading safe for long names (wrapping, not overflow)', () => {
    const h1Idx = shell.indexOf('>{tenantDisplayName}</h1>')
    const h1Start = shell.lastIndexOf('<h1', h1Idx)
    const h1 = shell.slice(h1Start, shell.indexOf('>', h1Start))
    expect(h1).toContain('break-words')
  })

  it('does not render the display name in a sidebar card (removed by design)', () => {
    // The sidebar workspace identity card was removed: it duplicated the
    // dashboard <h1> and was not a navigation target. The name is still shown
    // in the page heading, and settings stay reachable via the Settings tab.
    expect(shell).not.toContain('{tenantDisplayName}</p>')
    expect(shell).not.toContain('mt-10 rounded-2xl bg-surface p-4')
  })
})

describe('website editor spacing', () => {
  it('adds a top gap before the website editor heading', () => {
    expect(dashboard).toContain('<div className="mt-9 mb-6">')
  })

  it('does not change other tabs spacing', () => {
    // Overview/customers/services/team already used mt-9 and keep it.
    expect(dashboard).toContain('className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"')
    expect(dashboard).toContain('className="mt-9 rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6"')
  })
})

describe('responsive navigation contract', () => {
  it('the desktop sidebar is hidden below lg and pinned to the viewport at lg', () => {
    // Hidden below lg (the mobile drawer takes over) and, at lg, a sticky
    // full-height flex column so it stays put while the content scrolls.
    // It now lives in the persistent layout, so it survives tab navigation.
    expect(shell).toContain(
      'hidden w-64 shrink-0 border-e border-border bg-paper lg:sticky lg:top-0 lg:h-screen lg:flex lg:flex-col'
    )
    expect(shell).toContain('lg:h-screen')
    expect(shell).toContain('lg:sticky lg:top-0')
  })

  it('the sidebar nav is the only scrolling region; brand and admin link stay fixed', () => {
    // The nav absorbs overflow...
    expect(shell).toContain('min-h-0 flex-1 space-y-0.5 overflow-y-auto px-5 pb-5 text-sm')
    // ...while the logo and the admin link are shrink-0 so they are never
    // scrolled out of reach.
    const aside = shell.slice(
      shell.indexOf('<aside'),
      shell.indexOf('</aside>')
    )
    expect(aside).toContain('<div className="shrink-0 p-5">')
    expect(aside).toContain('className="shrink-0 border-t border-border p-5"')
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
    // The item moved into DrawerNavLink, which calls back to close the drawer.
    expect(mobileNav).toContain('onNavigate={close}')
    const drawerLink = read('../components/drawer-nav-link.tsx')
    expect(drawerLink).toContain('onNavigate()')
  })

  it('marks the active item for assistive tech', () => {
    expect(read('../components/drawer-nav-link.tsx')).toContain("aria-current={isActive ? 'page' : undefined}")
  })

  it('reuses the passed-in nav items instead of defining its own', () => {
    expect(mobileNav).not.toContain("id: 'overview'")
    expect(mobileNav).toContain('items.map(')
  })
})
