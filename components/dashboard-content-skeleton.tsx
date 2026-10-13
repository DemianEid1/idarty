/**
 * The dashboard content skeleton.
 *
 * Shared by BOTH loading states so they cannot drift apart:
 *  - `dashboard/loading.tsx` — the route-level fallback (initial mount).
 *  - `ContentPending`        — the in-flight fallback for `?tab=` navigation,
 *    which the route-level boundary cannot cover (React does not re-show an
 *    already-revealed Suspense boundary).
 *
 * No 'use client': this is presentational only, so it works from a Server
 * Component (loading.tsx) and a Client Component (ContentPending) alike.
 *
 * It mirrors the real content's geometry — the header block is NOT here (that
 * belongs to the persistent layout), only the content cards — so swapping it in
 * does not shift the layout.
 */

function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-[#e8ecf3] ${className}`} />
}

export function DashboardContentSkeleton({ rtl }: { rtl: boolean }) {
  return (
    <div dir={rtl ? 'rtl' : 'ltr'} role="status" aria-live="polite" data-dashboard-skeleton>
      <span className="sr-only">{rtl ? 'جارٍ تحميل المحتوى' : 'Loading content'}</span>

      {/* Matches the real content's `mt-9` top offset so nothing jumps. */}
      <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-paper p-5 shadow-float">
            <div className="flex items-center justify-between">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-[#e8ecf3]" />
              <Bar className="h-7 w-14" />
            </div>
            <Bar className="mt-4 h-4 w-24" />
            <Bar className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6">
        <Bar className="h-5 w-40" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-4">
              <div className="min-w-0 flex-1">
                <Bar className="h-4 w-36" />
                <Bar className="mt-2 h-3 w-20" />
              </div>
              <Bar className="h-6 w-20 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6">
        <Bar className="h-5 w-44" />
        <div className="mt-5 space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
              <div className="min-w-0 flex-1">
                <Bar className="h-4 w-32" />
                <Bar className="mt-2 h-3 w-28" />
              </div>
              <Bar className="h-6 w-20 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
