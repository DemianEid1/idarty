import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ALL_BOOKING_STATUSES, getStatusColor, getStatusLabel } from './booking-status'

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8').replace(/\r\n/g, '\n')
const calendarPage = read('../app/[locale]/tenants/[slug]/calendar/page.tsx')
const calendarView = read('../components/calendar-view.tsx')
const bookingActions = read('../app/[locale]/tenants/[slug]/dashboard/booking-actions.ts')
const rescheduleActions = read('../app/[locale]/tenants/[slug]/dashboard/reschedule-actions.ts')

describe('calendar page: authorization and tenant scoping contracts', () => {
  it('enforces tenant access requiring at least receptionist role', () => {
    expect(calendarPage).toContain("requireTenantAccess(await headers(), slug, 'receptionist')")
    expect(calendarPage).toContain('redirect(`/${locale}/login`)')
  })

  it('scopes booking queries strictly to active tenant', () => {
    expect(calendarPage).toContain('eq(bookings.tenantId, access.tenant.id)')
    expect(calendarPage).toContain('isNull(bookings.deletedAt)')
  })

  it('scopes booking-item queries strictly to active tenant', () => {
    expect(calendarPage).toContain('eq(bookingItems.tenantId, access.tenant.id)')
    expect(calendarPage).toContain('inArray(bookingItems.bookingId, bIds)')
  })

  it('scopes service and staff queries strictly to active tenant', () => {
    expect(calendarPage).toContain('eq(services.tenantId, access.tenant.id)')
    expect(calendarPage).toContain('eq(services.isActive, true)')
    // The creator-provenance join still resolves the staff member who created the
    // booking; that is unrelated to booking-item staff assignment.
    expect(calendarPage).toContain('eq(calCreatorStaff.tenantId, access.tenant.id)')
  })
})

describe('calendar page: multi-service aggregation and single-event invariant', () => {
  it('aggregates booking items into a single booking event with total price', () => {
    expect(calendarPage).toContain('itemsByBooking.get(b.id)')
    expect(calendarPage).toContain('totalPrice')
    expect(calendarPage).toContain('aggregatedBookings')
  })

  it('joins service translations with fallback locale', () => {
    expect(calendarPage).toContain('fallbackServiceTranslations')
  })

  it('buckets bookings into the 7-day week map without duplication', () => {
    expect(calendarPage).toContain('bucketBookingsByDay(days, aggregatedBookings)')
    expect(calendarPage).toContain('bookingsByDayRecord')
  })
})

describe('calendar page: date, staff, and status filtering', () => {
  it('reads searchParams for start date and status', () => {
    expect(calendarPage).toContain('parseStartDate(searchParams.start)')
    expect(calendarPage).toContain("searchParams.status || 'active'")
  })

  it('no longer filters bookings by assigned staff member', () => {
    // Bookings are tenant-scoped. The staff filter, its validation helper and the
    // bookingItems.staffId predicate are removed from the calendar page.
    expect(calendarPage).not.toContain('isValidStaffId(searchParams.staff)')
    expect(calendarPage).not.toContain('eq(bookingItems.staffId, validStaffId)')
    expect(calendarPage).not.toContain('staffRows.some((s) => s.id === rawStaffId)')
  })

  it('excludes cancelled bookings by default while supporting all and specific statuses', () => {
    expect(calendarPage).toContain("statusParam === 'all'")
    expect(calendarPage).toContain("ALL_BOOKING_STATUSES.includes(statusParam as any)")
    expect(calendarPage).toContain("not(eq(bookings.status, 'cancelled'))")
  })
})

describe('calendar page: component and cache integration', () => {
  it('embeds ManualBookingModal in the calendar workflow', () => {
    expect(calendarPage).toContain("import { CalendarView")
    expect(calendarView).toContain("import { ManualBookingModal } from '@/components/manual-booking-modal'")
    expect(calendarView).toContain('<ManualBookingModal')
  })

  it('embeds BookingStatusActions in the appointment detail modal', () => {
    expect(calendarView).toContain("import { BookingStatusActions } from '@/components/booking-status-actions'")
    expect(calendarView).toContain('<BookingStatusActions')
  })

  it('revalidates calendar and dashboard paths using canonical route patterns and locale paths', () => {
    expect(bookingActions).toMatch(/revalidatePath\(['"`]\/\[locale\]\/tenants\/\[slug\]\/calendar['"`],\s*['"`]page['"`]\)/)
    expect(bookingActions).toMatch(/revalidatePath\(['"`]\/\[locale\]\/tenants\/\[slug\]\/dashboard['"`],\s*['"`]page['"`]\)/)
    expect(bookingActions).toContain("revalidatePath(`/${data.locale}/tenants/${data.slug}/calendar`)")
    expect(bookingActions).toContain("revalidatePath(`/${data.locale}/tenants/${data.slug}/dashboard`)")
    expect(rescheduleActions).toMatch(/revalidatePath\(['"`]\/\[locale\]\/tenants\/\[slug\]\/calendar['"`],\s*['"`]page['"`]\)/)
    expect(rescheduleActions).toMatch(/revalidatePath\(['"`]\/\[locale\]\/tenants\/\[slug\]\/dashboard['"`],\s*['"`]page['"`]\)/)
  })
})

describe('calendar view: UI accessibility and interaction contracts', () => {
  it('provides accessible week navigation controls with localized titles', () => {
    expect(calendarView).toContain("nav.prevStart")
    expect(calendarView).toContain("nav.nextStart")
    expect(calendarView).toContain("nav.todayStart")
    expect(calendarView).toContain("rtl ? 'الأسبوع السابق' : 'Previous week'")
    expect(calendarView).toContain("rtl ? 'الأسبوع القادم' : 'Next week'")
  })

  it('renders responsive 7-day column grid with today highlighted', () => {
    expect(calendarView).toContain('grid gap-4 md:grid-cols-2 xl:grid-cols-7')
    expect(calendarView).toContain("rtl ? 'اليوم' : 'Today'")
  })

  it('renders accessible detail dialog with escape and backdrop dismissal', () => {
    expect(calendarView).toContain('role="dialog"')
    expect(calendarView).toContain('aria-modal="true"')
    expect(calendarView).toContain("e.key === 'Escape'")
    expect(calendarView).toContain("e.target === e.currentTarget")
  })

  it('displays customer contact, notes, and multi-service breakdown in detail modal', () => {
    expect(calendarView).toContain('customerPhone')
    expect(calendarView).toContain('customerEmail')
    expect(calendarView).toContain('customerNote')
    expect(calendarView).toContain('internalNote')
    expect(calendarView).toContain('cancelReason')
  })

  it('applies centralized booking status colors and labels to cards and modal', () => {
    for (const st of ALL_BOOKING_STATUSES) {
      expect(getStatusColor(st)).toBeTruthy()
      expect(getStatusLabel(st, 'ar')).toBeTruthy()
      expect(getStatusLabel(st, 'en')).toBeTruthy()
    }
  })

  it('renders reciprocal view switcher linking back to dashboard bookings list', () => {
    expect(calendarPage).toContain('aria-label={rtl ? \'طريقة عرض الحجوزات\' : \'Bookings view\'}')
    expect(calendarPage).toContain('href={`/${locale}/tenants/${slug}/dashboard?tab=bookings')
    expect(calendarPage).toContain('ClipboardList')
    expect(calendarPage).toContain('CalendarDays')
  })
})
