import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { and, asc, desc, eq, isNull, or, sql, aliasedTable } from 'drizzle-orm'
import { Settings2 } from 'lucide-react'
import Link from 'next/link'
import { requireTenantAccess } from '@/lib/authz'
import { db } from '@/lib/db'
import { branches, branchTranslations, staff, staffTranslations, tenantTranslations } from '@/lib/db/schema'
import { Logo } from '@/components/logo'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { DashboardMobileNav } from '@/components/dashboard-mobile-nav'
import { DashboardSidebarLink } from '@/components/dashboard-sidebar-link'
import { DashboardUserMenu } from '@/components/dashboard-user-menu'
import { ContentPending } from '@/components/content-pending'
import { NavigationCommitWatcher } from '@/components/navigation-commit-watcher'
import { dashboardCopy, buildDashboardNav } from '@/lib/dashboard-nav'
import { resolveTenantDisplayName } from '@/lib/tenant-display-name'
import { DashboardBranchSwitcher } from '@/components/dashboard-branch-switcher'
import type { Locale } from '@/lib/i18n'

/**
 * The PERSISTENT dashboard shell.
 *
 * WHY THIS LIVES IN THE LAYOUT
 * ----------------------------
 * Previously the sidebar and header were rendered by `page.tsx`. That file is an
 * async Server Component, so navigating between tabs (?tab=...) re-rendered the
 * whole page — sidebar included — and `dashboard/loading.tsx` (which sits inside
 * this layout, wrapping the page in a Suspense boundary) replaced ALL of it with
 * a full-screen centred spinner. The sidebar vanished on every navigation.
 *
 * Layouts are NOT wrapped by the sibling `loading.tsx` — only the page and
 * anything below it is. So by moving the sidebar and header here, they stay
 * mounted and interactive while the page's content streams in. The loading state
 * is scoped to the content area by construction, with no Suspense plumbing and
 * no duplicated layout.
 *
 * AUTHENTICATION IS UNCHANGED
 * ---------------------------
 * This keeps the same `requireTenantAccess` guard the page used to run first, so
 * nothing renders — not even the sidebar — before authorization resolves. The
 * navigation items are built only after the membership role is resolved, so no
 * nav destination is exposed before permissions are known. The page re-runs the
 * same guard for its own data queries, so no security check was weakened.
 *
 * The tab comes from `?tab=` (the same query-param navigation the app already
 * used). The active item is resolved in a small client component so it updates
 * on navigation without re-rendering this layout on the server.
 */
export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params

  let access
  try {
    access = await requireTenantAccess(await headers(), slug)
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      redirect(`/${locale}/login?next=/${locale}/tenants/${slug}/dashboard`)
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      notFound()
    }
    throw error
  }

  const typedLocale = locale as Locale
  const fallbackLocale = typedLocale === 'ar' ? 'en' : 'ar'
  const rtl = typedLocale === 'ar'
  const t = dashboardCopy[typedLocale]
  const nav = buildDashboardNav(typedLocale, access.membership.role)
  const isAdmin = (access.session.user as { isPlatformAdmin?: boolean }).isPlatformAdmin === true
  const cookieStore = await cookies()
  const cookieBranch = cookieStore.get(`idarty_branch_${slug}`)?.value
  const adminLabel = rtl ? 'لوحة الإدارة' : 'Admin Panel'

  const fallbackStaffTranslations = aliasedTable(staffTranslations, 'layout_fb_staff_trans')
  const fallbackBranchTranslations = aliasedTable(branchTranslations, 'layout_fb_branch_trans')

  // The workspace name for the header. Only the translation row is fetched here;
  // the page keeps its own copy of this query for the data it renders.
  const [tenantTranslation, userStaff, activeBranches] = await Promise.all([
    db.query.tenantTranslations.findFirst({
      where: and(eq(tenantTranslations.tenantId, access.tenant.id), eq(tenantTranslations.locale, typedLocale)),
    }),
    db
      .select({
        name: staffTranslations.name,
        fallbackName: fallbackStaffTranslations.name,
      })
      .from(staff)
      .leftJoin(
        staffTranslations,
        and(eq(staffTranslations.staffId, staff.id), eq(staffTranslations.locale, typedLocale))
      )
      .leftJoin(
        fallbackStaffTranslations,
        and(eq(fallbackStaffTranslations.staffId, staff.id), eq(fallbackStaffTranslations.locale, fallbackLocale))
      )
      .where(
        and(
          eq(staff.tenantId, access.tenant.id),
          or(
            eq(staff.membershipId, access.membership.id),
            access.session.user.email ? eq(staff.email, access.session.user.email) : sql`false`
          )
        )
      )
      // Without an explicit ORDER BY, PostgreSQL can return an email-matched
      // orphan (membership_id IS NULL) before the record that is actually
      // linked to this authenticated membership. The CASE expression puts the
      // membership-ID match first so LIMIT 1 is always deterministic.
      .orderBy(sql`CASE WHEN ${staff.membershipId} = ${access.membership.id} THEN 0 ELSE 1 END`)
      .limit(1),
    db
      .select({
        id: branches.id,
        name: branchTranslations.name,
        fallbackName: fallbackBranchTranslations.name,
        isDefault: branches.isDefault,
      })
      .from(branches)
      .leftJoin(
        branchTranslations,
        and(eq(branchTranslations.branchId, branches.id), eq(branchTranslations.locale, typedLocale))
      )
      .leftJoin(
        fallbackBranchTranslations,
        and(eq(fallbackBranchTranslations.branchId, branches.id), eq(fallbackBranchTranslations.locale, fallbackLocale))
      )
      .where(and(eq(branches.tenantId, access.tenant.id), isNull(branches.archivedAt)))
      .orderBy(desc(branches.isDefault), asc(branches.sortOrder), asc(branches.createdAt)),
  ])

  const staffName = userStaff[0]?.name || userStaff[0]?.fallbackName
  const rawUserName = access.session.user.name
  const isEmailLike = (val?: string | null) => !val || val.includes('@')

  const userDisplayName =
    staffName?.trim() ||
    (!isEmailLike(rawUserName) ? rawUserName?.trim() : undefined) ||
    (rawUserName?.includes('@') ? rawUserName.split('@')[0] : undefined) ||
    access.session.user.email?.split('@')[0] ||
    access.session.user.email ||
    'User'

  const tenantDisplayName = resolveTenantDisplayName(tenantTranslation, access.tenant.slug)

  const formattedBranches = activeBranches.map((b) => ({
    id: b.id,
    name: b.name || b.fallbackName || (rtl ? 'فرع' : 'Branch'),
    isDefault: b.isDefault,
  }))

  return (
    <main dir={rtl ? 'rtl' : 'ltr'} className="min-h-screen bg-[#f7f8fb] text-[#172033]">
      {/* Ends the pending state when the URL commits. Renders nothing; it sits
          outside the content area so it is never part of a loading swap. */}
      <NavigationCommitWatcher />
      <div className="flex min-h-screen w-full">
        {/* Desktop sidebar — pinned, independently scrollable, and now part of
            the persistent layout so it never remounts on tab navigation. */}
        <aside className="hidden w-64 shrink-0 border-e border-border bg-paper lg:sticky lg:top-0 lg:h-screen lg:flex lg:flex-col">
          <div className="shrink-0 p-5">
            <Link href={`/${locale}/tenants/${slug}/dashboard`} className="flex items-center" aria-label={rtl ? 'إدارتي' : 'Idarty'}>
              <Logo locale={typedLocale} height={26} />
            </Link>
          </div>
          <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-5 pb-5 text-sm">
            {nav.map((item) => (
              <DashboardSidebarLink key={item.id} item={item} />
            ))}
          </nav>
          <div className="shrink-0 border-t border-border p-5">
            <div className="space-y-3">
              {isAdmin && (
                <a href={`/${typedLocale}/admin`} className="flex items-center gap-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 outline-none transition hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-amber-500">
                  <Settings2 aria-hidden="true" className="h-4 w-4" />
                  {adminLabel}
                </a>
              )}
              <DashboardUserMenu
                user={{
                  name: userDisplayName,
                  email: access.session.user.email,
                  image: access.session.user.image,
                }}
                role={access.membership.role}
                locale={typedLocale}
                slug={slug}
              />
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-6">
          <div className="max-w-7xl">
            {/* The header is part of the persistent shell too: the user's name and
                role are already resolved, so it never re-mounts or flickers. */}
            <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <DashboardMobileNav
                  locale={typedLocale}
                  items={nav}
                  adminHref={isAdmin ? `/${typedLocale}/admin` : undefined}
                  adminLabel={adminLabel}
                  user={{
                    name: userDisplayName,
                    email: access.session.user.email,
                    image: access.session.user.image,
                  }}
                  role={access.membership.role}
                  slug={slug}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-muted">{userDisplayName}</p>
                  <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight sm:text-3xl">{tenantDisplayName}</h1>
                  <p className="mt-1.5 text-sm text-ink-muted">{t.subtitle}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:gap-3">
                <DashboardBranchSwitcher branches={formattedBranches} locale={typedLocale} slug={slug} initialBranchId={cookieBranch} />
                {isAdmin && <a href={`/${typedLocale}/admin`} className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-700 outline-none transition hover:bg-amber-200 focus-visible:ring-2 focus-visible:ring-amber-500">{rtl ? 'الإدارة' : 'Admin'}</a>}
                <div className="sr-only" aria-hidden="true">
                  <LocaleSwitcher currentLocale={typedLocale} />
                </div>
              </div>
            </header>

            {/* Only the active tab's content is replaced by the loading state.
                `ContentPending` shows the same skeleton as `loading.tsx` while a
                `?tab=` transition is in flight — the route-level fallback cannot
                cover that case, because React does not re-show an already-revealed
                Suspense boundary. The sidebar and header live outside this wrapper
                and stay mounted. */}
            <ContentPending rtl={rtl}>{children}</ContentPending>
          </div>
        </section>
      </div>
    </main>
  )
}

