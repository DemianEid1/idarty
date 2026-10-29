import { Building2, CalendarCheck, Clock, ContactRound, Layers, LayoutDashboard, Settings2, Store, Users } from 'lucide-react'
import type { Locale } from '@/lib/i18n'
import type { MemberRole } from '@/lib/authz'

/**
 * The dashboard's navigation and copy — ONE source of truth.
 *
 * These live outside the dashboard page because the persistent shell (sidebar +
 * header) is rendered by `dashboard/layout.tsx`, while the page renders only the
 * active tab's content. Both the desktop sidebar and the mobile drawer render
 * from this same array, so the two can never drift apart.
 *
 * The icons are React ELEMENTS rather than component references: the array is
 * built in a Server Component and passed to client components (the sidebar and
 * the drawer), and only elements — not functions — survive that boundary.
 */

export const dashboardCopy = {
  ar: {
    title: 'مساحة العمل',
    subtitle: 'نظرة هادئة على يومك وإدارة فريقك.',
    appointments: 'مواعيد اليوم',
    bookings: 'الحجوزات',
    customers: 'العملاء',
    services: 'الخدمات',
    branches: 'الفروع',
    team: 'الفريق',
    schedule: 'ساعات العمل',
    settings: 'الإعدادات',
    empty: 'لا توجد مواعيد اليوم بعد.',
    emptyBookings: 'لا توجد حجوزات مسجلة بعد.',
  },
  en: {
    title: 'Workspace',
    subtitle: 'A calm view of your day and your team.',
    appointments: "Today's appointments",
    bookings: 'Bookings',
    customers: 'Customers',
    services: 'Services',
    branches: 'Branches',
    team: 'Team',
    schedule: 'Working Hours',
    settings: 'Settings',
    empty: 'No appointments scheduled today.',
    emptyBookings: 'No bookings recorded yet.',
  },
} as const

export type DashboardNavItem = {
  id: string
  label: string
  icon: React.ReactNode
}

/**
 * Items hidden per role (per the RBAC plan):
 *  - receptionist : team, website, settings
 *  - staff        : customers, team, website, settings
 *  - all others   : full nav (8 items)
 */
const HIDDEN_NAV_ITEMS: Partial<Record<MemberRole, Set<string>>> = {
  receptionist: new Set(['branches', 'team', 'website', 'settings']),
  staff: new Set(['customers', 'branches', 'team', 'website', 'settings']),
}

export function buildDashboardNav(locale: Locale, role?: MemberRole): DashboardNavItem[] {
  const t = dashboardCopy[locale]
  const hidden = role ? (HIDDEN_NAV_ITEMS[role] ?? new Set<string>()) : new Set<string>()

  const allItems: DashboardNavItem[] = [
    { id: 'overview',  icon: <LayoutDashboard aria-hidden="true" className="h-4 w-4" />, label: locale === 'ar' ? 'نظرة عامة' : 'Overview' },
    { id: 'bookings',  icon: <CalendarCheck   aria-hidden="true" className="h-4 w-4" />, label: t.bookings },
    { id: 'customers', icon: <Users           aria-hidden="true" className="h-4 w-4" />, label: t.customers },
    { id: 'services',  icon: <Layers          aria-hidden="true" className="h-4 w-4" />, label: t.services },
    { id: 'branches',  icon: <Building2       aria-hidden="true" className="h-4 w-4" />, label: t.branches },
    { id: 'team',      icon: <ContactRound   aria-hidden="true" className="h-4 w-4" />, label: t.team },
    { id: 'schedule',  icon: <Clock           aria-hidden="true" className="h-4 w-4" />, label: t.schedule },
    { id: 'website',   icon: <Store           aria-hidden="true" className="h-4 w-4" />, label: locale === 'ar' ? 'الموقع' : 'Website' },
    { id: 'settings',  icon: <Settings2       aria-hidden="true" className="h-4 w-4" />, label: t.settings },
  ]

  return hidden.size > 0 ? allItems.filter((item) => !hidden.has(item.id)) : allItems
}
