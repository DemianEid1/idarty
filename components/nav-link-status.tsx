'use client'

import { useLinkStatus } from 'next/link'
import { useEffect } from 'react'
import { reportPending, releasePending } from '@/lib/navigation-pending'

/**
 * The bridge between a `<Link>`'s pending state and the rest of the dashboard.
 *
 * MUST be rendered inside a `<Link>` — `useLinkStatus()` only works in a
 * descendant, so this is the one place that reads the framework's signal.
 *
 * It does two things:
 *  1. Reports the pending state into `lib/navigation-pending`, which the content
 *     area subscribes to (so the pending skeleton shows while the transition is
 *     in flight).
 *  2. Renders a fixed-size inline hint that fades in ONLY if the transition
 *     actually takes time (see the `delay-150`), so a fast/prefetched
 *     navigation produces no flicker. The element is always rendered at a fixed
 *     size, so it never shifts layout.
 */
export function NavLinkStatus({
  id,
  onPending,
  hint = true,
}: {
  /** The nav item's tab id, used to key the shared pending registry. */
  id: string
  /** Optional callback so a parent <Link> can style itself optimistically. */
  onPending?: (pending: boolean) => void
  hint?: boolean
}) {
  const { pending } = useLinkStatus()

  useEffect(() => {
    reportPending(id, pending)
    onPending?.(pending)
  }, [id, pending, onPending])

  // If this link unmounts mid-transition, hand it to the grace timer rather than
  // clearing outright — the mobile drawer unmounts every nav link the moment it
  // closes on click, which is exactly when navigation starts.
  useEffect(() => {
    return () => {
      releasePending(id)
      onPending?.(false)
    }
  }, [id, onPending])

  if (!hint) return null

  return (
    <span
      aria-hidden="true"
      data-nav-hint={pending ? 'pending' : 'idle'}
      className={`ms-auto h-1.5 w-1.5 shrink-0 rounded-full bg-current transition-opacity duration-200 delay-150 ${
        pending ? 'animate-pulse opacity-70' : 'opacity-0'
      }`}
    />
  )
}
