'use client'

import { useEffect, useState } from 'react'
import { useIsNavigating } from '@/lib/navigation-pending'
import { DashboardContentSkeleton } from '@/components/dashboard-content-skeleton'

/**
 * Shows `true` only after `active` has been true continuously for `delayMs`,
 * and flips back to `false` immediately.
 *
 * This is the standard "delay the spinner" rule: a fast navigation finishes
 * inside the delay and never shows a loading state at all, so no flicker; a slow
 * one shows it shortly after the click, which still reads as immediate.
 */
function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!active) {
      setShown(false)
      return
    }
    const timer = setTimeout(() => setShown(true), delayMs)
    return () => clearTimeout(timer)
  }, [active, delayMs])

  return shown
}

/** Long enough to swallow a fast/prefetched navigation, short enough to feel instant. */
const PENDING_SKELETON_DELAY_MS = 180

/**
 * Scopes the in-flight loading state to the main content area.
 *
 * WHY THIS IS NEEDED ON TOP OF `loading.tsx`
 * ------------------------------------------
 * `dashboard/loading.tsx` wraps the page in a Suspense boundary, but React does
 * not re-show an ALREADY-REVEALED boundary. `?tab=` navigation changes only the
 * query string on the same route segment, so the boundary stays revealed and the
 * fallback never re-renders — measured: the skeleton did not appear at all
 * during a 3.3s tab transition, leaving the previous tab's content frozen.
 *
 * So the content area listens to the framework's own pending signal (via
 * `lib/navigation-pending`) and swaps in the SAME skeleton the route-level
 * fallback uses.
 *
 * FLICKER
 * -------
 * The skeleton is delayed by `PENDING_SKELETON_DELAY_MS`, so an already-available
 * destination (prefetched or fast) completes without ever painting a loading
 * state. Measured before the delay: fast tabs painted the skeleton for ~250ms.
 *
 * `children` is the server-rendered page, passed through untouched — the shell
 * and the page stay Server Components. Only this thin wrapper is a Client
 * Component.
 *
 * No full-screen overlay: the skeleton occupies the content column only, and the
 * sidebar/header (rendered by the layout, outside this wrapper) stay mounted.
 */
export function ContentPending({
  children,
  rtl,
}: {
  children: React.ReactNode
  rtl: boolean
}) {
  const navigating = useIsNavigating()
  const showSkeleton = useDelayedFlag(navigating, PENDING_SKELETON_DELAY_MS)

  if (showSkeleton) {
    return (
      <div data-pending-wrap aria-busy="true">
        <DashboardContentSkeleton rtl={rtl} />
      </div>
    )
  }

  return children
}
