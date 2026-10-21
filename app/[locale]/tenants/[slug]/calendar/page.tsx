import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { aliasedTable, and, eq, gte, inArray, isNull, lt, not } from 'drizzle-orm'
import { requireTenantAccess } from '@/lib/authz'
import { db } from '@/lib/db'
import {
  bookingItems,
  bookings,
  customers,
  services,
  serviceTranslations,
  staff,
  staffServices,
  staffTranslations,
} from '@/lib/db/schema'
import type { Locale } from '@/lib/i18n'
import { ALL_BOOKING_STATUSES } from '@/lib/booking-status'
import {
  bucketBookingsByDay,
  formatDateParam,
  getWeekDays,
  getWeekRange,
  isValidStaffId,
  parseStartDate,
} from '@/lib/calendar-helpers'
import { CalendarView, type CalendarBooking, type CalendarBookingItem } from '@/components/calendar-view'
import { CalendarDays, ClipboardList } from 'lucide-react'

export default async function CalendarPage(props: {
  params: Promise<{ locale: Locale; slug: string }>
  searchParams: Promise<{ start?: string; staff?: string; status?: string }>
}) {
  const { locale, slug } = await props.params
  const searchParams = await props.searchParams

  let access
  try {
    access = await requireTenantAccess(await headers(), slug, 'receptionist')
  } catch {
    redirect(`/${locale}/login`)
  }

  const rtl = locale === 'ar'
  const fallbackLocale = locale === 'ar' ? 'en' : 'ar'
  const fallbackServiceTranslations = aliasedTable(
    serviceTranslations,
    'fallback_cal_service_translations'
  )
  const fallbackStaffTranslations = aliasedTable(
    staffTranslations,
    'fallback_cal_staff_translations'
  )

  // Parse and validate start date parameter
  const startDate = parseStartDate(searchParams.start)
  const startDateParam = formatDateParam(startDate)
  const weekRange = getWeekRange(startDate)
  const days = getWeekDays(startDate)

  // Fetch services and staff for dropdown filters and manual booking modal
  const [serviceRows, staffRows, assignmentRows] = await Promise.all([
    db
      .select({
        id: services.id,
        durationMin: services.durationMin,
        priceAmount: services.priceAmount,
        name: serviceTranslations.name,
        fallbackName: fallbackServiceTranslations.name,
      })
      .from(services)
      .leftJoin(
        serviceTranslations,
        and(
          eq(serviceTranslations.serviceId, services.id),
          eq(serviceTranslations.locale, locale)
        )
      )
      .leftJoin(
        fallbackServiceTranslations,
        and(
          eq(fallbackServiceTranslations.serviceId, services.id),
          eq(fallbackServiceTranslations.locale, fallbackLocale)
        )
      )
      .where(
        and(
          eq(services.tenantId, access.tenant.id),
          eq(services.isActive, true)
        )
      )
      .orderBy(services.sortOrder),

    db
      .select({
        id: staff.id,
        name: staffTranslations.name,
        fallbackName: fallbackStaffTranslations.name,
      })
      .from(staff)
      .leftJoin(
        staffTranslations,
        and(
          eq(staffTranslations.staffId, staff.id),
          eq(staffTranslations.locale, locale)
        )
      )
      .leftJoin(
        fallbackStaffTranslations,
        and(
          eq(fallbackStaffTranslations.staffId, staff.id),
          eq(fallbackStaffTranslations.locale, fallbackLocale)
        )
      )
      .where(
        and(
          eq(staff.tenantId, access.tenant.id),
          eq(staff.isActive, true),
          isNull(staff.deletedAt)
        )
      )
      .orderBy(staff.sortOrder),

    db
      .select({
        staffId: staffServices.staffId,
        serviceId: staffServices.serviceId,
      })
      .from(staffServices)
      .where(eq(staffServices.tenantId, access.tenant.id)),
  ])

  // Validate staff filter against tenant staff members
  const rawStaffId = isValidStaffId(searchParams.staff)
  const validStaffId =
    rawStaffId && staffRows.some((s) => s.id === rawStaffId) ? rawStaffId : ''

  // Build query conditions for bookings
  const bookingConditions = [
    eq(bookings.tenantId, access.tenant.id),
    gte(bookings.startsAt, weekRange.start),
    lt(bookings.startsAt, weekRange.end),
    isNull(bookings.deletedAt),
  ]

  // Status filtering: 'active' (default) shows non-cancelled bookings; 'all' shows all; specific status matches
  const statusParam = searchParams.status || 'active'
  if (statusParam === 'all') {
    // No status filter applied — all statuses included
  } else if (ALL_BOOKING_STATUSES.includes(statusParam as any)) {
    bookingConditions.push(eq(bookings.status, statusParam as any))
  } else {
    // Default 'active': exclude cancelled bookings
    bookingConditions.push(not(eq(bookings.status, 'cancelled')))
  }

  // Staff filtering via bookingItems
  if (validStaffId) {
    const staffBookingIds = await db
      .selectDistinct({ bookingId: bookingItems.bookingId })
      .from(bookingItems)
      .where(
        and(
          eq(bookingItems.tenantId, access.tenant.id),
          eq(bookingItems.staffId, validStaffId)
        )
      )
    const ids = staffBookingIds.map((r) => r.bookingId)
    if (ids.length === 0) {
      bookingConditions.push(
        inArray(bookings.id, ['00000000-0000-0000-0000-000000000000'])
      )
    } else {
      bookingConditions.push(inArray(bookings.id, ids))
    }
  }

  // Fetch bookings in the week range
  const bookingRows = await db
    .select({
      id: bookings.id,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      status: bookings.status,
      source: bookings.source,
      customerNote: bookings.customerNote,
      internalNote: bookings.internalNote,
      cancelReason: bookings.cancelReason,
      createdAt: bookings.createdAt,
      customerName: customers.fullName,
      customerPhone: customers.phoneE164,
      customerEmail: customers.email,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(and(...bookingConditions))
    .orderBy(bookings.startsAt)

  // Bounded query for booking items
  const itemsByBooking = new Map<string, CalendarBookingItem[]>()
  if (bookingRows.length > 0) {
    const bIds = bookingRows.map((b) => b.id)
    const rawItems = await db
      .select({
        id: bookingItems.id,
        bookingId: bookingItems.bookingId,
        startsAt: bookingItems.startsAt,
        endsAt: bookingItems.endsAt,
        priceAmount: bookingItems.priceAmount,
        serviceName: serviceTranslations.name,
        fallbackServiceName: fallbackServiceTranslations.name,
        durationMin: services.durationMin,
        staffName: staffTranslations.name,
        fallbackStaffName: fallbackStaffTranslations.name,
      })
      .from(bookingItems)
      .leftJoin(services, eq(services.id, bookingItems.serviceId))
      .leftJoin(
        serviceTranslations,
        and(
          eq(serviceTranslations.serviceId, services.id),
          eq(serviceTranslations.locale, locale)
        )
      )
      .leftJoin(
        fallbackServiceTranslations,
        and(
          eq(fallbackServiceTranslations.serviceId, services.id),
          eq(fallbackServiceTranslations.locale, fallbackLocale)
        )
      )
      .leftJoin(staff, eq(staff.id, bookingItems.staffId))
      .leftJoin(
        staffTranslations,
        and(
          eq(staffTranslations.staffId, staff.id),
          eq(staffTranslations.locale, locale)
        )
      )
      .leftJoin(
        fallbackStaffTranslations,
        and(
          eq(fallbackStaffTranslations.staffId, staff.id),
          eq(fallbackStaffTranslations.locale, fallbackLocale)
        )
      )
      .where(
        and(
          eq(bookingItems.tenantId, access.tenant.id),
          inArray(bookingItems.bookingId, bIds)
        )
      )
      .orderBy(bookingItems.sortOrder, bookingItems.startsAt)

    for (const it of rawItems) {
      const list = itemsByBooking.get(it.bookingId) ?? []
      list.push({
        id: it.id,
        serviceName:
          it.serviceName ||
          it.fallbackServiceName ||
          (rtl ? 'خدمة بدون اسم' : 'Unnamed service'),
        staffName:
          it.staffName ||
          it.fallbackStaffName ||
          (rtl ? 'عضو فريق' : 'Staff member'),
        durationMin: it.durationMin ?? 0,
        priceAmount: String(it.priceAmount ?? '0'),
        startsAt: it.startsAt,
        endsAt: it.endsAt,
      })
      itemsByBooking.set(it.bookingId, list)
    }
  }

  // Assemble single calendar bookings with multi-service items and total price snapshot
  const aggregatedBookings: CalendarBooking[] = bookingRows.map((b) => {
    const items = itemsByBooking.get(b.id) ?? []
    const totalPrice = items.reduce(
      (sum, item) => sum + (parseFloat(item.priceAmount) || 0),
      0
    )
    return {
      id: b.id,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      status: b.status,
      source: b.source,
      customerName: b.customerName,
      customerPhone: b.customerPhone,
      customerEmail: b.customerEmail,
      customerNote: b.customerNote,
      internalNote: b.internalNote,
      cancelReason: b.cancelReason,
      createdAt: b.createdAt,
      items,
      totalPrice,
    }
  })

  // Bucket bookings by day
  const bucketMap = bucketBookingsByDay(days, aggregatedBookings)
  const bookingsByDayRecord: Record<string, CalendarBooking[]> = {}
  for (const day of days) {
    const p = formatDateParam(day)
    bookingsByDayRecord[p] = bucketMap.get(p) ?? []
  }

  const localizedServices = serviceRows.map((s) => ({
    id: s.id,
    name:
      s.name || s.fallbackName || (rtl ? 'خدمة بدون اسم' : 'Unnamed service'),
    durationMin: s.durationMin,
    priceAmount: s.priceAmount,
  }))

  const localizedStaff = staffRows.map((st) => ({
    id: st.id,
    name:
      st.name || st.fallbackName || (rtl ? 'عضو فريق' : 'Staff member'),
  }))

  return (
    <main
      dir={rtl ? 'rtl' : 'ltr'}
      className="min-h-screen bg-[#f7f8fb] px-4 py-8 text-[#172033] sm:px-8"
    >
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <a
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-teal hover:underline"
              href={`/${locale}/tenants/${slug}/dashboard`}
            >
              <span>{rtl ? '← العودة لمساحة العمل' : '← Back to workspace'}</span>
            </a>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              {rtl ? 'التقويم والمواعيد' : 'Appointments Calendar'}
            </h1>
            <p className="mt-1 text-xs text-ink-muted sm:text-sm">
              {rtl
                ? 'إدارة المواعيد وتفاصيل الخدمات المحجوزة لكل موظف على مدار الأسبوع.'
                : 'Weekly schedule and multi-service appointment details for your team.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-paper px-3.5 py-1.5 text-xs font-semibold shadow-xs border border-border">
              {aggregatedBookings.length}{' '}
              {rtl
                ? aggregatedBookings.length > 2
                  ? 'مواعيد هذا الأسبوع'
                  : 'موعد هذا الأسبوع'
                : 'bookings this week'}
            </span>

            {/* Reciprocal View Switcher: List vs Calendar */}
            <div
              role="group"
              aria-label={rtl ? 'طريقة عرض الحجوزات' : 'Bookings view'}
              className="inline-flex items-center rounded-xl border border-border bg-[#f0f2f5] p-1 text-xs font-semibold"
            >
              <a
                href={`/${locale}/tenants/${slug}/dashboard?tab=bookings${statusParam !== 'active' && statusParam !== 'all' ? `&status=${statusParam}` : ''}`}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-ink-muted transition hover:text-[#172033]"
              >
                <ClipboardList aria-hidden="true" className="h-3.5 w-3.5" />
                <span>{rtl ? 'قائمة' : 'List'}</span>
              </a>
              <span
                aria-current="page"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[#172033] shadow-xs"
              >
                <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 text-brand-teal" />
                <span>{rtl ? 'تقويم' : 'Calendar'}</span>
              </span>
            </div>
          </div>
        </header>

        {/* Interactive Calendar view with filters, week grid, and appointment detail modal */}
        <CalendarView
          slug={slug}
          locale={locale}
          currency={access.tenant.currency}
          startDate={startDateParam}
          days={days.map((d) => ({ date: d, dateParam: formatDateParam(d) }))}
          bookingsByDay={bookingsByDayRecord}
          totalBookingsCount={aggregatedBookings.length}
          currentStaffFilter={validStaffId}
          currentStatusFilter={statusParam}
          staffList={localizedStaff}
          servicesList={localizedServices}
          assignmentsList={assignmentRows}
          canViewInternalNotes={true}
        />
      </div>
    </main>
  )
}
