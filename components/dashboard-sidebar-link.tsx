'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { NavLinkStatus } from '@/components/nav-link-status'
import { useIsNavigating } from '@/lib/navigation-pending'
import type { DashboardNavItem } from '@/lib/dashboard-nav'

/**
 * One desktop sidebar navigation item.
 *
 * WHY A CLIENT COMPONENT
 * ----------------------
 * The sidebar lives in `dashboard/layout.tsx`, a Server Component. A layout does
 * NOT re-render when only the query string changes, so the server cannot know the
 * active tab after a `?tab=` navigation. Reading it with `useSearchParams` here
 * keeps the highlight in sync with the URL without forcing the layout to
 * re-render — and without the sidebar ever unmounting.
 *
 * IMMEDIATE FEEDBACK
 * ------------------
 * `useSearchParams` only reflects the new URL AFTER the transition commits, so
 * on its own it made the highlight lag by the whole wait (measured: 3.3s). The
 * `pending` flag from `useLinkStatus` fires on click, so the clicked item
 * highlights straight away and stays highlighted while the content loads.
 *
 * ONLY ONE ITEM IS EVER ACTIVE
 * ----------------------------
 * While a transition is in flight the URL still points at the OLD tab, so
 * deriving the highlight from the URL alone would light up both the old and the
 * new item. So: while navigating, the pending item is the only active one; once
 * the transition commits, the URL takes over again. The URL remains the single
 * source of truth for the settled state — including browser Back/Forward and
 * direct URL access, which never set `pending`.
 */
export function DashboardSidebarLink({ item }: { item: DashboardNavItem }) {
  const searchParams = useSearchParams()
  const urlTab = searchParams.get('tab') ?? 'overview'
  const [pending, setPending] = useState(false)
  const navigating = useIsNavigating()

  const isActive = pending || (!navigating && urlTab === item.id)

  return (
    <Link
      href={`?tab=${item.id}`}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 outline-none transition focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 ${
        isActive ? 'bg-brand-teal font-semibold text-white shadow-sm' : 'text-[#647087] hover:bg-surface'
      }`}
    >
      {item.icon}
      {item.label}
      <NavLinkStatus id={item.id} onPending={setPending} />
    </Link>
  )
}
