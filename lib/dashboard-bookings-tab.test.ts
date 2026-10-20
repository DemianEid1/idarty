import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildDashboardNav, dashboardCopy } from './dashboard-nav'
import { ALL_BOOKING_STATUSES, statusColors, statusText, getStatusColor, getStatusLabel } from './booking-status'

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8').replace(/\r\n/g, '\n')
const dashboardPage = read('../app/[locale]/tenants/[slug]/dashboard/page.tsx')
const dashboardNav = read('../lib/dashboard-nav.tsx')

describe('dashboard bookings tab - nav and copy', () => {
  it('provides localized copy for bookings tab and empty state', () => {
    expect(dashboardCopy.ar.bookings).toBe('الحجوزات')
    expect(dashboardCopy.en.bookings).toBe('Bookings')
    expect(dashboardCopy.ar.emptyBookings).toBeDefined()
    expect(dashboardCopy.en.emptyBookings).toBeDefined()
  })

  it('buildDashboardNav includes bookings nav item positioned between overview and customers', () => {
    const navAr = buildDashboardNav('ar')
    const navEn = buildDashboardNav('en')

    expect(navAr.map((n) => n.id)).toEqual([
      'overview',
      'bookings',
      'customers',
      'services',
      'team',
      'website',
      'settings',
    ])

    const bookingsAr = navAr.find((n) => n.id === 'bookings')
    expect(bookingsAr?.label).toBe('الحجوزات')

    const bookingsEn = navEn.find((n) => n.id === 'bookings')
    expect(bookingsEn?.label).toBe('Bookings')
  })
})

describe('dashboard bookings tab - status handling', () => {
  it('supports all 5 booking status types', () => {
    expect(ALL_BOOKING_STATUSES).toEqual([
      'pending',
      'confirmed',
      'completed',
      'cancelled',
      'no_show',
    ])
  })

  it('has non-empty colors and labels for every status in both locales', () => {
    for (const st of ALL_BOOKING_STATUSES) {
      expect(statusColors[st]).toBeTruthy()
      expect(statusText[st].ar).toBeTruthy()
      expect(statusText[st].en).toBeTruthy()
      expect(getStatusColor(st)).toBe(statusColors[st])
      expect(getStatusLabel(st, 'ar')).toBe(statusText[st].ar)
      expect(getStatusLabel(st, 'en')).toBe(statusText[st].en)
    }
  })
})

describe('dashboard bookings tab - security and query isolation', () => {
  it('scopes bookings query strictly to access.tenant.id', () => {
    expect(dashboardPage).toContain('eq(bookings.tenantId, access.tenant.id)')
  })

  it('scopes bookingItems query strictly to access.tenant.id', () => {
    expect(dashboardPage).toContain('eq(bookingItems.tenantId, access.tenant.id)')
  })

  it('filters out soft-deleted bookings', () => {
    expect(dashboardPage).toContain('isNull(bookings.deletedAt)')
  })

  it('joins services and staff translations with fallback locales', () => {
    expect(dashboardPage).toContain('fallbackServiceTranslations')
    expect(dashboardPage).toContain('fallbackStaffTranslations')
  })

  it('includes customer contact, notes, cancel reason, and multi-service breakdown in the detail view', () => {
    expect(dashboardPage).toContain('customerNote')
    expect(dashboardPage).toContain('internalNote')
    expect(dashboardPage).toContain('cancelReason')
    expect(dashboardPage).toContain('customerPhone')
    expect(dashboardPage).toContain('customerEmail')
    expect(dashboardPage).toContain('BookingStatusActions')
  })

  it('supports status filtering via searchParams', () => {
    expect(dashboardPage).toContain("searchParams.status || 'all'")
    expect(dashboardPage).toContain("statusFilter !== 'all'")
    expect(dashboardPage).toContain('eq(bookings.status, statusFilter as any)')
  })
})
