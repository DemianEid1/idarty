'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { clearAllPending } from '@/lib/navigation-pending'

/**
 * Ends the pending state when a navigation actually commits.
 *
 * The URL is the authoritative signal that the transition is over — more
 * reliable than waiting for the clicked `<Link>` to report `pending: false`,
 * because that link may already have unmounted (the mobile drawer closes on
 * click, unmounting every nav link at the exact moment navigation starts).
 *
 * Renders nothing; it exists purely to observe the query string. Mounted in the
 * dashboard layout, outside the content area, so it is never part of a loading
 * swap.
 */
export function NavigationCommitWatcher() {
  const searchParams = useSearchParams()
  const committed = searchParams.toString()
  const previous = useRef(committed)

  useEffect(() => {
    if (previous.current === committed) return
    previous.current = committed
    clearAllPending()
  }, [committed])

  return null
}
