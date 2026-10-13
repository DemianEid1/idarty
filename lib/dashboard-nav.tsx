import { CalendarDays, Layers, LayoutDashboard, Settings2, Store, Users } from 'lucide-react'
import type { Locale } from '@/lib/i18n'

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
    customers: 'العملاء',
    services: 'الخدمات',
    settings: 'الإعدادات',
    empty: 'لا توجد مواعيد اليوم بعد.',
  },
  en: {
    title: 'Workspace',
    subtitle: 'A calm view of your day and your team.',
    appointments: "Today's appointments",
    customers: 'Customers',
    services: 'Services',
    settings: 'Settings',
    empty: 'No appointments scheduled today.',
  },
} as const

export type DashboardNavItem = {
  id: string
  label: string
  icon: React.ReactNode
}

export function buildDashboardNav(locale: Locale): DashboardNavItem[] {
  const t = dashboardCopy[locale]
  return [
    { id: 'overview', icon: <LayoutDashboard aria-hidden="true" className="h-4 w-4" />, label: locale === 'ar' ? 'نظرة عامة' : 'Overview' },
    { id: 'customers', icon: <Users aria-hidden="true" className="h-4 w-4" />, label: t.customers },
    { id: 'services', icon: <Layers aria-hidden="true" className="h-4 w-4" />, label: t.services },
    { id: 'team', icon: <CalendarDays aria-hidden="true" className="h-4 w-4" />, label: locale === 'ar' ? 'الفريق والجدول' : 'Team & Schedule' },
    { id: 'website', icon: <Store aria-hidden="true" className="h-4 w-4" />, label: locale === 'ar' ? 'الموقع' : 'Website' },
    { id: 'settings', icon: <Settings2 aria-hidden="true" className="h-4 w-4" />, label: t.settings },
  ]
}
