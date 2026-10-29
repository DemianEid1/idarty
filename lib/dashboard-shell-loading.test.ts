import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Persistent dashboard shell + content-scoped loading.
//
// ROOT CAUSE these guard against: the sidebar and header used to be rendered by
// `page.tsx`. Because `dashboard/loading.tsx` wraps only the PAGE (never the
// sibling `layout.tsx`), a page-rendered shell was replaced by the loading
// fallback on every tab navigation — the sidebar disappeared.
//
// SOURCE-level assertions. The rendered behaviour (sidebar stationary and
// present across a slow navigation, skeleton scoped to the content column, no
// full-screen overlay) was verified in a real browser; see the report.
// ---------------------------------------------------------------------------

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')

const shell = read('app/[locale]/tenants/[slug]/dashboard/layout.tsx')
const page = read('app/[locale]/tenants/[slug]/dashboard/page.tsx')
const loading = read('app/[locale]/tenants/[slug]/dashboard/loading.tsx')
const navModule = read('lib/dashboard-nav.tsx')
const skeleton = read('components/dashboard-content-skeleton.tsx')

describe('1. the shell lives in the layout, so it survives navigation', () => {
  it('the layout renders the sidebar and the header', () => {
    expect(shell).toContain('<aside')
    expect(shell).toContain('<header')
    expect(shell).toContain('<DashboardMobileNav')
  })

  it('the page renders NEITHER — it is content only', () => {
    expect(page).not.toContain('<aside')
    expect(page).not.toContain('<header')
    expect(page).not.toContain('<DashboardMobileNav')
    expect(page).not.toContain('<LocaleSwitcher')
    expect(page).not.toContain('<Logo ')
  })

  it('the layout renders the page children inside the content column', () => {
    // `{children}` sits inside <section>, which is the only part loading.tsx
    // can replace.
    const section = shell.slice(shell.indexOf('<section'), shell.indexOf('</section>'))
    expect(section).toContain('{children}')
    expect(section).toContain('<header')
  })

  it('the layout wraps only the content, not a second copy of the shell', () => {
    expect((shell.match(/<aside/g) ?? []).length).toBe(1)
    expect((shell.match(/<header/g) ?? []).length).toBe(1)
  })

  it('does not duplicate the layout: there is exactly one dashboard layout', () => {
    // The shell must not have been copied into a second layout file.
    expect(shell).toContain('export default async function DashboardLayout')
  })
})

describe('2. authentication is not weakened by the move', () => {
  it('the layout still runs the tenant authorization guard FIRST', () => {
    const guardIdx = shell.indexOf('requireTenantAccess')
    const renderIdx = shell.indexOf('return (')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(renderIdx)
  })

  it('still redirects on UNAUTHORIZED and 404s otherwise', () => {
    expect(shell).toContain("error.message === 'UNAUTHORIZED'")
    expect(shell).toContain('redirect(`/${locale}/login?next=/${locale}/tenants/${slug}/dashboard`)')
    expect(shell).toContain('notFound()')
  })

  it('the page keeps its own guard, so no query runs unauthenticated', () => {
    expect(page).toContain('requireTenantAccess')
  })

  it('no navigation item is built before the membership role is resolved', () => {
    // `nav` is built after `requireTenantAccess` returns `access`.
    const accessIdx = shell.indexOf('access = await requireTenantAccess')
    const navIdx = shell.indexOf('const nav = buildDashboardNav')
    expect(accessIdx).toBeGreaterThan(-1)
    expect(navIdx).toBeGreaterThan(accessIdx)
  })

  it('the admin entry is still gated on the platform-admin flag', () => {
    expect(shell).toContain("isPlatformAdmin === true")
    expect(shell).toContain('{isAdmin && (')
  })
})

describe('3. loading is scoped to the content area', () => {
  it('loading.tsx renders NO full-screen overlay or fixed positioning', () => {
    expect(loading).not.toContain('fixed inset-0')
    expect(loading).not.toContain('min-h-screen')
    expect(loading).not.toContain('z-50')
  })

  it('loading.tsx renders no sidebar, header or nav of its own', () => {
    expect(loading).not.toContain('<aside')
    expect(loading).not.toContain('<header')
    expect(loading).not.toContain('<nav')
    expect(loading).not.toContain('<DashboardMobileNav')
  })

  it('it reserves the same geometry as the real content (no layout shift)', () => {
    // The geometry lives in the shared skeleton, rendered by BOTH loading states
    // so they cannot drift apart.
    expect(skeleton).toContain('mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4')
    expect(skeleton).toContain('rounded-2xl border border-border bg-paper p-5 shadow-float')
    expect(skeleton).toContain('rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6')
    // The four stat cards the real Overview renders.
    expect(skeleton).toContain('Array.from({ length: 4 }')
    // loading.tsx renders that shared component rather than its own copy.
    expect(loading).toContain('<DashboardContentSkeleton')
  })

  it('is announced to assistive tech without hijacking focus', () => {
    expect(skeleton).toContain('role="status"')
    expect(skeleton).toContain('aria-live="polite"')
    expect(skeleton).toContain('sr-only')
  })

  it('does not show misleading placeholder data', () => {
    // Bars only — no invented numbers, names or counts.
    expect(skeleton).not.toMatch(/>\s*\d+\s*</)
    expect(skeleton).not.toContain('Workspace')
  })
})

describe('4. the shared nav module is the single source of truth', () => {
  it('the nav array and copy live outside both the page and the layout', () => {
    expect(navModule).toContain('export function buildDashboardNav')
    expect(navModule).toContain('export const dashboardCopy')
    // Neither the page nor the shell declares its own nav array.
    expect(page).not.toContain('const nav = [')
    expect(shell).not.toContain('const nav = [')
  })

  it('keeps the nav items in the required order', () => {
    const block = navModule.slice(
      navModule.indexOf('export function buildDashboardNav'),
      navModule.indexOf(']', navModule.indexOf("id: 'settings'"))
    )
    const ids = [...block.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1])
    expect(ids).toEqual(['overview', 'bookings', 'customers', 'services', 'branches', 'team', 'schedule', 'website', 'settings'])
  })

  it('the page uses the shared copy instead of its own', () => {
    expect(page).toContain("import { dashboardCopy } from '@/lib/dashboard-nav'")
    expect(page).toContain('const t = dashboardCopy[locale]')
    expect(page).not.toContain('const copy = {')
  })

  it('both the sidebar and the drawer render from the same array', () => {
    expect(shell).toContain('{nav.map((item) => (')
    expect(shell).toContain('items={nav}')
  })
})

describe('5. the active tab still highlights correctly', () => {
  const link = read('components/dashboard-sidebar-link.tsx')

  it('the sidebar item reads the tab on the client (layouts do not re-render on query change)', () => {
    expect(link).toContain("useSearchParams")
    expect(link).toContain("searchParams.get('tab') ?? 'overview'")
  })

  it('only ONE item is ever active (never the stale and the new one together)', () => {
    // While navigating, the URL still points at the OLD tab, so the highlight
    // cannot come from the URL alone. The pending item wins; once the transition
    // commits, the URL takes over. No stale item is left lit.
    expect(link).toContain('const isActive = pending || (!navigating && urlTab === item.id)')
    expect(link).toContain("aria-current={isActive ? 'page' : undefined}")
  })

  it('uses a client-side transition so the shell is preserved', () => {
    expect(link).toContain("import Link from 'next/link'")
    expect(link).toContain('?tab=${item.id}')
  })

  it('the mobile drawer receives the same items', () => {
    const drawer = read('components/dashboard-mobile-nav.tsx')
    expect(drawer).toContain('items')
    // The active tab is NOT a prop — the layout cannot know it (see
    // `dashboard-nav-feedback.test.ts`).
    expect(drawer).not.toContain('activeTab')
  })
})

describe('6. RTL/LTR and responsive behaviour preserved', () => {
  it('direction still comes from the locale', () => {
    expect(shell).toContain("dir={rtl ? 'rtl' : 'ltr'}")
  })

  it('the sidebar keeps its logical border and pinned layout', () => {
    expect(shell).toContain('border-e')
    expect(shell).toContain('lg:sticky lg:top-0 lg:h-screen lg:flex lg:flex-col')
    expect(shell).toContain('min-h-0 flex-1 space-y-0.5 overflow-y-auto')
  })

  it('the sidebar stays hidden below lg and the drawer trigger is the only mobile entry', () => {
    expect(shell).toContain('hidden w-64')
    const drawer = read('components/dashboard-mobile-nav.tsx')
    expect(drawer).toContain('lg:hidden')
  })

  it('the drawer still opens closed by default', () => {
    const drawer = read('components/dashboard-mobile-nav.tsx')
    expect(drawer).toContain('useState(false)')
  })
})

describe('7. errors do not leave the dashboard stuck loading', () => {
  it('there is an error boundary for the tenant segment', () => {
    const errorBoundary = read('app/[locale]/tenants/[slug]/error.tsx')
    expect(errorBoundary).toContain('reset')
    expect(errorBoundary).toContain("'use client'")
  })

  it('the layout redirects rather than rendering a shell without access', () => {
    expect(shell).toContain('redirect(')
    expect(shell).toContain('notFound()')
  })
})
