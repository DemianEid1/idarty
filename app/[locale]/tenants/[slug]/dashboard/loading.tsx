import { cookies } from 'next/headers'
import { DashboardContentSkeleton } from '@/components/dashboard-content-skeleton'

/**
 * Route-level dashboard loading UI.
 *
 * SCOPE: this file sits in `dashboard/`, so it wraps only `page.tsx` — never
 * `dashboard/layout.tsx`. The sidebar, header, user name and workspace name are
 * rendered by the layout and therefore stay mounted and stationary while this
 * skeleton is shown. There is no full-screen spinner and no page-level overlay.
 *
 * WHEN THIS ACTUALLY RUNS
 * -----------------------
 * Only when the boundary first mounts — i.e. a hard load of a dashboard URL, or
 * a client navigation from OUTSIDE the dashboard segment. It does NOT run for
 * `?tab=` navigation: that only changes the query string on the same segment, so
 * React keeps the already-revealed boundary and never re-shows this fallback.
 * The in-flight case is covered by `<ContentPending>` in the layout, which
 * renders the SAME `DashboardContentSkeleton` so the two cannot drift apart.
 *
 * WHY THE COOKIE
 * --------------
 * `loading.tsx` receives no params (Next.js docs: "Loading UI components do not
 * accept any parameters"), so the locale is read from the NEXT_LOCALE cookie this
 * app already sets (see lib/locale-path). This only chooses between two hardcoded
 * direction attributes for the skeleton's own text — it is presentational, not a
 * security decision; the authoritative locale still comes from the route params
 * in the layout and page.
 */
export default async function Loading() {
  const cookieStore = await cookies()
  const rtl = cookieStore.get('NEXT_LOCALE')?.value === 'ar'

  return <DashboardContentSkeleton rtl={rtl} />
}
