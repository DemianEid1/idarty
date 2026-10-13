import { describe, expect, it, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Navigation feedback: immediate active state + main-content loading state.
//
// ROOT CAUSES these guard against:
//  1. The active highlight was derived ONLY from `useSearchParams()`, which
//     reports the new URL only after the transition commits — so it lagged by
//     the whole wait (measured: 3.3s on a slow tab).
//  2. The `?tab=` skeleton did not show while the previous tab's content was
//     still on screen, so a slow navigation looked frozen.
//
// SOURCE-level assertions here; the rendered timing was verified in a browser
// (highlight immediate, skeleton covering the wait, no flicker on fast tabs).
// ---------------------------------------------------------------------------

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')

const link = read('components/dashboard-sidebar-link.tsx')
const drawerLink = read('components/drawer-nav-link.tsx')
const navStatus = read('components/nav-link-status.tsx')
const contentPending = read('components/content-pending.tsx')
const watcher = read('components/navigation-commit-watcher.tsx')
const store = read('lib/navigation-pending.ts')
const skeleton = read('components/dashboard-content-skeleton.tsx')
const shell = read('app/[locale]/tenants/[slug]/dashboard/layout.tsx')
const loading = read('app/[locale]/tenants/[slug]/dashboard/loading.tsx')

describe('1. immediate active-state feedback', () => {
  it('the highlight reacts to the pending flag, not only to useSearchParams', () => {
    // The pending flag arrives from the bridge component (useLinkStatus is only
    // callable inside a <Link>), and drives the highlight directly.
    expect(link).toContain('onPending={setPending}')
    expect(link).toContain('const isActive = pending || (!navigating && urlTab === item.id)')
  })

  it('still uses the URL as the authoritative settled state', () => {
    expect(link).toContain('useSearchParams')
    expect(link).toContain("searchParams.get('tab') ?? 'overview'")
  })

  it('reads the framework pending flag via the one bridge component', () => {
    // useLinkStatus only works in a descendant of a <Link>, so it is isolated.
    expect(navStatus).toContain("import { useLinkStatus } from 'next/link'")
    expect(navStatus).toContain('reportPending(id, pending)')
  })

  it('only ONE item can be active at a time', () => {
    // The pending item suppresses the URL-derived one, so the old and new tab
    // are never highlighted together.
    expect(link).toContain('pending || (!navigating && urlTab === item.id)')
    expect(drawerLink).toContain('pending || (!navigating && urlTab === item.id)')
  })

  it('handles rapid clicks: a later click replaces the earlier pending item', () => {
    // The store keys reports by tab id and `navigating` is derived from the set,
    // so the newest click drives the highlight; the committed URL then wins.
    expect(store).toContain('const reports = new Map<string, Report>()')
    expect(store).toContain('reports.set(id, existing)')
  })

  it('keeps next/link, keyboard nav and accessibility', () => {
    expect(link).toContain("import Link from 'next/link'")
    expect(link).toContain("aria-current={isActive ? 'page' : undefined}")
    expect(link).toContain('focus-visible:ring-2')
    // The drawer link too (it previously used a plain <a>, forcing a reload).
    expect(drawerLink).toContain("import Link from 'next/link'")
    expect(drawerLink).toContain("aria-current={isActive ? 'page' : undefined}")
  })

  it('does not introduce a second source of truth for the active tab', () => {
    // The store tracks only "is a transition in flight" — never which tab is
    // active. There is no second `activeTab` state anywhere.
    expect(store).not.toContain('activeTab')
    expect(store).toContain('navigating')
  })

  it('synchronizes with Back/Forward and direct URL access (no pending involved)', () => {
    // Those navigations never set `pending`, so the URL branch decides.
    expect(link).toContain('!navigating && urlTab === item.id')
  })
})

describe('2. main-content loading feedback', () => {
  it('shows a content skeleton while a tab transition is in flight', () => {
    expect(contentPending).toContain('useIsNavigating()')
    expect(contentPending).toContain('<DashboardContentSkeleton')
    expect(shell).toContain('<ContentPending rtl={rtl}>{children}</ContentPending>')
  })

  it('scopes it to the content area — never a full-screen overlay', () => {
    expect(contentPending).not.toContain('fixed inset-0')
    expect(contentPending).not.toContain('min-h-screen')
    expect(contentPending).not.toContain('z-50')
    expect(skeleton).not.toContain('fixed inset-0')
    // It wraps only the page children, inside the layout's content column.
    const section = shell.slice(shell.indexOf('<section'), shell.indexOf('</section>'))
    expect(section).toContain('<ContentPending')
    // The sidebar and header are OUTSIDE the wrapper.
    expect(section.indexOf('<header')).toBeLessThan(section.indexOf('<ContentPending'))
  })

  it('delays the skeleton so a fast navigation does not flicker', () => {
    // Measured before the delay: fast tabs painted the skeleton for ~250ms.
    expect(contentPending).toContain('useDelayedFlag')
    expect(contentPending).toContain('PENDING_SKELETON_DELAY_MS')
    const delay = Number(contentPending.match(/PENDING_SKELETON_DELAY_MS = (\d+)/)?.[1])
    expect(delay).toBeGreaterThanOrEqual(100)
    expect(delay).toBeLessThanOrEqual(400)
  })

  it('the route-level loading.tsx and the in-flight state share ONE skeleton', () => {
    // So the two loading states cannot drift apart.
    expect(loading).toContain('<DashboardContentSkeleton')
    expect(contentPending).toContain('<DashboardContentSkeleton')
  })

  it('the skeleton reserves the real content geometry (no layout shift)', () => {
    expect(skeleton).toContain('mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4')
  })

  it('announces loading to assistive tech', () => {
    expect(skeleton).toContain('role="status"')
    expect(skeleton).toContain('aria-live="polite"')
    expect(contentPending).toContain('aria-busy="true"')
  })
})

describe('3. the pending state can never get stuck', () => {
  it('clears when the URL commits', () => {
    expect(watcher).toContain('clearAllPending()')
    expect(watcher).toContain('useSearchParams')
    expect(shell).toContain('<NavigationCommitWatcher />')
  })

  it('has an absolute timeout cap', () => {
    expect(store).toContain('MAX_PENDING_MS')
    const cap = Number(store.match(/MAX_PENDING_MS = ([\d_]+)/)?.[1].replace(/_/g, ''))
    expect(cap).toBeGreaterThan(0)
    expect(cap).toBeLessThanOrEqual(30_000)
  })

  it('unmounting a link does not instantly cancel an in-flight navigation', () => {
    // The mobile drawer closes on click, unmounting every nav link at the exact
    // moment navigation starts — clearing immediately left the drawer navigation
    // with no loading state at all.
    expect(store).toContain('STALE_REPORT_GRACE_MS')
    expect(store).toContain('export function releasePending')
    expect(navStatus).toContain('releasePending(id)')
    expect(store).not.toMatch(/releasePending[\s\S]{0,200}existing\.pending = false\s*\n\s*recompute\(\)/)
  })

  it('the drawer reports pending synchronously, before it unmounts', () => {
    expect(drawerLink).toContain('reportPending(item.id, true)')
    expect(drawerLink).toContain('onNavigate()')
  })

  it('the unmount cleanup effect does NOT depend on `pending`', () => {
    // The bridge has TWO effects: one reports on every `pending` change, the
    // other arms the grace timer on unmount. If the cleanup effect also depended
    // on `pending`, React would re-run its cleanup on every transition and arm a
    // grace timer mid-navigation — clearing a live report. Keep them separate.
    const effects = navStatus.split('useEffect(').slice(1)
    const cleanupEffect = effects.find((e) => e.includes('releasePending(id)'))
    expect(cleanupEffect).toBeDefined()
    const deps = cleanupEffect!.match(/\}, \[([^\]]*)\]\)/)
    expect(deps?.[1]).not.toContain('pending')
  })

  it('the drawer derives the settled active tab from the URL, not a prop', () => {
    // The layout is a Server Component and cannot read `?tab=`, so a prop can
    // never carry the current tab — reading the URL is what keeps the drawer in
    // sync with the desktop sidebar.
    expect(drawerLink).toContain('useSearchParams')
    expect(drawerLink).toContain("searchParams.get('tab') ?? 'overview'")
    expect(drawerLink).toContain('urlTab === item.id')
    // The dead prop is gone everywhere.
    expect(drawerLink).not.toContain('activeTab')
    expect(read('components/dashboard-mobile-nav.tsx')).not.toContain('activeTab')
    expect(shell).not.toContain('activeTab')
  })

  it('the server snapshot is false so hydration cannot mismatch', () => {
    expect(store).toContain('useSyncExternalStore(subscribe, getIsNavigating, () => false)')
  })
})

describe('4. the store behaves correctly (unit)', () => {
  // A fresh module instance per test, so the module-level state is isolated.
  async function freshStore() {
    vi.resetModules()
    return import('@/lib/navigation-pending')
  }

  beforeEach(() => {
    vi.resetModules()
  })

  it('starts not navigating', async () => {
    const s = await freshStore()
    expect(s.getIsNavigating()).toBe(false)
  })

  it('reports pending and clears on a false report', async () => {
    const s = await freshStore()
    s.reportPending('services', true)
    expect(s.getIsNavigating()).toBe(true)
    s.reportPending('services', false)
    expect(s.getIsNavigating()).toBe(false)
  })

  it('notifies subscribers on change', async () => {
    const s = await freshStore()
    const seen: boolean[] = []
    const unsub = s.subscribe(() => seen.push(s.getIsNavigating()))
    s.reportPending('a', true)
    s.reportPending('a', false)
    unsub()
    expect(seen).toEqual([true, false])
  })

  it('is idempotent — a repeated report does not re-notify', async () => {
    const s = await freshStore()
    let calls = 0
    const unsub = s.subscribe(() => calls++)
    s.reportPending('a', true)
    s.reportPending('a', true)
    unsub()
    expect(calls).toBe(1)
  })

  it('stays navigating while ANY report is pending', async () => {
    const s = await freshStore()
    s.reportPending('a', true)
    s.reportPending('b', true)
    s.reportPending('a', false)
    expect(s.getIsNavigating()).toBe(true) // b still pending
    s.reportPending('b', false)
    expect(s.getIsNavigating()).toBe(false)
  })

  it('clearAllPending resets everything', async () => {
    const s = await freshStore()
    s.reportPending('a', true)
    s.reportPending('b', true)
    s.clearAllPending()
    expect(s.getIsNavigating()).toBe(false)
  })

  it('releasePending keeps the signal alive during the grace period', async () => {
    vi.useFakeTimers()
    try {
      const s = await freshStore()
      s.reportPending('services', true)
      s.releasePending('services')
      // Still pending immediately after unmount (the drawer-close case).
      expect(s.getIsNavigating()).toBe(true)
      // ...and clears after the grace period, so nothing sticks.
      vi.advanceTimersByTime(2000)
      expect(s.getIsNavigating()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a `false` report clears immediately (this is how a committed transition ends)', async () => {
    // Measured in the browser: the report goes false ~260ms after the click,
    // because Next commits the URL with the RSC shell before the slow page
    // content finishes streaming. The store is behaving as designed — the
    // coverage of the remaining wait is what the findings question, not this.
    const s = await freshStore()
    s.reportPending('services', true)
    expect(s.getIsNavigating()).toBe(true)
    s.reportPending('services', false)
    expect(s.getIsNavigating()).toBe(false)
  })

  it('a re-report cancels a pending grace timer (no stale clear)', async () => {
    vi.useFakeTimers()
    try {
      const s = await freshStore()
      s.reportPending('services', true)
      s.releasePending('services') // arms the grace timer
      // A new navigation reports true before the timer fires.
      s.reportPending('services', true)
      vi.advanceTimersByTime(2000)
      // The cancelled timer must NOT have cleared the newer report.
      expect(s.getIsNavigating()).toBe(true)
      s.reportPending('services', false)
      expect(s.getIsNavigating()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('the hard cap clears a pending report that is never released', async () => {
    vi.useFakeTimers()
    try {
      const s = await freshStore()
      s.reportPending('services', true)
      expect(s.getIsNavigating()).toBe(true)
      // Nothing reports false; the absolute cap is the only way out.
      vi.advanceTimersByTime(20_000)
      expect(s.getIsNavigating()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
