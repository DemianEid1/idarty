/**
 * Client-side "a dashboard navigation is in flight" signal.
 *
 * WHY THIS EXISTS
 * ---------------
 * `?tab=` navigation is a query-string-only change on the SAME route segment, so
 * anything derived from `useSearchParams()` only updates AFTER the transition
 * commits — the active highlight lagged by the whole wait (measured: 3.3s).
 *
 * `useLinkStatus()` (Next.js 15.3+) is the framework's own per-<Link> pending
 * flag and fires on click. The nav links report it here so the link itself
 * (optimistic highlight) and the content area (pending skeleton) react to the
 * SAME signal instead of each guessing.
 *
 * This is deliberately NOT a second source of truth for the active tab: the URL
 * remains authoritative (`useSearchParams`). This only tracks whether a
 * transition is in flight — transient UI state the URL cannot express.
 *
 * A module-level store (rather than React context) lets the sidebar links and the
 * content area share it without wrapping the layout in a provider, so the shell
 * stays server-rendered.
 *
 * WHY REPORTS EXPIRE
 * ------------------
 * A link that unmounts mid-transition must not leave the signal stuck on (that
 * would pin the skeleton forever). But it also must not clear it instantly: the
 * mobile drawer closes on click, which unmounts every nav link at the exact
 * moment navigation starts. So a report is kept alive by a short grace period —
 * long enough for the committing navigation to re-report `false` (or for a new
 * report to arrive), short enough that a genuinely abandoned navigation clears
 * itself well before a user would notice a stuck skeleton.
 */

import { useSyncExternalStore } from 'react'

/**
 * Grace period after a link unmounts. The real safety net for a stuck skeleton is
 * the timeout below; this only avoids clearing a report during the hand-off
 * between the unmounting link and the committing navigation.
 */
const STALE_REPORT_GRACE_MS = 1500

/** Absolute cap: no skeleton may outlive this, however the transition ended. */
const MAX_PENDING_MS = 15_000

type Report = { pending: boolean; timer: ReturnType<typeof setTimeout> | null }

const reports = new Map<string, Report>()
const listeners = new Set<() => void>()
let navigating = false
let maxTimer: ReturnType<typeof setTimeout> | null = null

function recompute(): void {
  const next = [...reports.values()].some((r) => r.pending)
  if (next !== navigating) {
    navigating = next
    for (const listener of listeners) listener()
  }
  if (navigating && maxTimer === null) {
    // Safety net: never let the skeleton get stuck on.
    maxTimer = setTimeout(() => {
      maxTimer = null
      clearAll()
    }, MAX_PENDING_MS)
  } else if (!navigating && maxTimer !== null) {
    clearTimeout(maxTimer)
    maxTimer = null
  }
}

function clearAll(): void {
  for (const report of reports.values()) {
    if (report.timer) clearTimeout(report.timer)
    report.pending = false
    report.timer = null
  }
  recompute()
}

/** Report a single link's pending state. Idempotent. */
export function reportPending(id: string, pending: boolean): void {
  const existing = reports.get(id) ?? { pending: false, timer: null }

  if (existing.timer) {
    clearTimeout(existing.timer)
    existing.timer = null
  }

  if (pending) {
    existing.pending = true
  } else {
    // A `false` report means the transition committed or was abandoned.
    existing.pending = false
  }

  reports.set(id, existing)
  recompute()
}

/**
 * Called when a link unmounts. Does NOT clear immediately — it starts a grace
 * timer, so a navigation that is still committing (e.g. the mobile drawer
 * closing on click) is not cancelled by its own unmount.
 */
export function releasePending(id: string): void {
  const existing = reports.get(id)
  if (!existing || !existing.pending) return
  if (existing.timer) clearTimeout(existing.timer)
  existing.timer = setTimeout(() => {
    existing.pending = false
    existing.timer = null
    recompute()
  }, STALE_REPORT_GRACE_MS)
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Clear every pending report.
 *
 * Called when the URL actually commits (see `NavigationCommitWatcher`), which is
 * the authoritative end of a navigation — more reliable than waiting for a link
 * to report `false`, because the reporting link may already have unmounted (the
 * mobile drawer closes on click).
 */
export function clearAllPending(): void {
  clearAll()
}

export function getIsNavigating(): boolean {
  return navigating
}

/**
 * True while any nav link's transition is in flight.
 *
 * The server snapshot is always `false` so the server-rendered markup and the
 * first client render agree (no hydration mismatch); the real value arrives on
 * the first client update.
 */
export function useIsNavigating(): boolean {
  return useSyncExternalStore(subscribe, getIsNavigating, () => false)
}
