'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { NavLinkStatus } from '@/components/nav-link-status'
import { useIsNavigating, reportPending } from '@/lib/navigation-pending'
import type { DashboardNavItem } from '@/lib/dashboard-nav'

/**
 * One mobile-drawer navigation item.
 *
 * Extracted so the drawer and the desktop sidebar share ONE active-state rule
 * instead of two that can drift:
 *   - while a transition is in flight, the pending item is the only active one;
 *   - once it settles, the tab read from the URL takes over.
 *
 * THE TAB COMES FROM THE URL, NOT A PROP
 * --------------------------------------
 * It used to take the current tab as a prop. But this component is rendered by
 * `dashboard/layout.tsx`, a Server Component, and a layout does NOT re-render
 * when only the query string changes — so the server could never supply the
 * current tab and the prop was hardcoded to `""`. The settled highlight was
 * therefore never drawn, while the desktop sidebar (which reads the URL itself)
 * highlighted correctly. Reading `useSearchParams` here keeps the two in sync,
 * exactly as `dashboard-sidebar-link.tsx` does.
 *
 * It uses `next/link` (the drawer previously used a plain `<a>`, which forced a
 * full document reload) so the shell is preserved.
 *
 * WHY THE CLICK HANDLER REPORTS PENDING DIRECTLY
 * ----------------------------------------------
 * The drawer closes on click, which unmounts this link — and with it the
 * `useLinkStatus` bridge. Relying on the bridge's effect to publish the pending
 * state loses the race against that unmount, so the drawer navigation showed no
 * loading state at all. Reporting synchronously in the click handler publishes it
 * before the unmount; `NavigationCommitWatcher` then clears it when the URL
 * commits.
 *
 * `onNavigate` closes the drawer.
 *
 * BRANCH PRESERVATION
 * -------------------
 * The `?branch=` param is carried forward on every tab navigation so the
 * selected branch never resets when the user switches drawer items.
 */
export function DrawerNavLink({
  item,
  onNavigate,
}: {
  item: DashboardNavItem
  onNavigate: () => void
}) {
  const searchParams = useSearchParams()
  const urlTab = searchParams.get('tab') ?? 'overview'
  const [pending, setPending] = useState(false)
  const navigating = useIsNavigating()

  const branch = searchParams.get('branch')
  const isActive = pending || (!navigating && urlTab === item.id)
  const href = `?tab=${item.id}${branch ? `&branch=${branch}` : ''}`

  return (
    <Link
      href={href}
      onClick={() => {
        // Publish before the drawer unmounts this link.
        reportPending(item.id, true)
        setPending(true)
        onNavigate()
      }}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-3 outline-none transition focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 ${
        isActive ? 'bg-brand-teal font-semibold text-white shadow-sm' : 'text-[#647087] hover:bg-surface'
      }`}
    >
      {item.icon}
      {item.label}
      <NavLinkStatus id={item.id} onPending={setPending} />
    </Link>
  )
}
