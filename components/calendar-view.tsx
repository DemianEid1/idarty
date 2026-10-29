'use client'

import { useState, useTransition, useId } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  Lock,
  Mail,
  Phone,
  RotateCcw,
  User,
  X,
} from 'lucide-react'
import type { Locale } from '@/lib/i18n'
import { ALL_BOOKING_STATUSES, getStatusColor, getStatusLabel } from '@/lib/booking-status'
import { BookingStatusActions } from '@/components/booking-status-actions'
import { ManualBookingModal } from '@/components/manual-booking-modal'
import {
  formatDateParam,
  getWeekNavParams,
  isSameDay,
} from '@/lib/calendar-helpers'

export interface CalendarBookingItem {
  id: string
  serviceName: string
  durationMin: number
  priceAmount: string
  startsAt: Date
  endsAt: Date
}

export interface CalendarBooking {
  id: string
  startsAt: Date
  endsAt: Date
  status: string
  source: string
  customerName: string
  customerPhone: string
  customerEmail: string | null
  customerNote: string | null
  internalNote: string | null
  cancelReason: string | null
  createdAt: Date
  items: CalendarBookingItem[]
  totalPrice: number
  createdByUserId?: string | null
  createdByName?: string | null
  branchId?: string | null
  branchName?: string | null
}

export interface CalendarViewProps {
  slug: string
  locale: Locale
  currency: string
  startDate: string // YYYY-MM-DD
  days: Array<{ date: Date; dateParam: string }>
  bookingsByDay: Record<string, CalendarBooking[]>
  totalBookingsCount: number
  currentStatusFilter: string
  servicesList: Array<{
    id: string
    name: string
    durationMin: number
    priceAmount: string
  }>
  canViewInternalNotes?: boolean
  hideNewBookingButton?: boolean
}

export function CalendarView({
  slug,
  locale,
  currency,
  startDate,
  days,
  bookingsByDay,
  totalBookingsCount,
  currentStatusFilter,
  servicesList,
  canViewInternalNotes = true,
  hideNewBookingButton = false,
}: CalendarViewProps) {
  const rtl = locale === 'ar'
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [selectedBooking, setSelectedBooking] = useState<CalendarBooking | null>(null)

  const activeStartDate = new Date(
    parseInt(startDate.split('-')[0], 10),
    parseInt(startDate.split('-')[1], 10) - 1,
    parseInt(startDate.split('-')[2], 10)
  )
  const nav = getWeekNavParams(activeStartDate)
  const today = new Date()

  const dayHeaderFormatter = new Intl.DateTimeFormat(rtl ? 'ar-EG' : 'en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const timeFormatter = new Intl.DateTimeFormat(rtl ? 'ar-EG' : 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  function updateQuery(updates: {
    start?: string | null
    status?: string | null
  }) {
    const params = new URLSearchParams(searchParams ? searchParams.toString() : '')
    const nextStart = updates.start !== undefined ? updates.start : startDate
    const nextStatus =
      updates.status !== undefined ? updates.status : currentStatusFilter

    if (nextStart) params.set('start', nextStart)
    else params.delete('start')

    if (nextStatus && nextStatus !== 'active') params.set('status', nextStatus)
    else params.delete('status')

    const query = params.toString()
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname)
    })
  }

  return (
    <div className="space-y-6">
      {/* Top action & filter bar */}
      <div className="flex flex-col gap-4 rounded-3xl border border-border bg-paper p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        {/* Week navigation */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-2xl border border-border bg-surface p-1 shadow-xs">
            <button
              type="button"
              onClick={() => updateQuery({ start: nav.prevStart })}
              disabled={isPending}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-ink-muted hover:bg-paper hover:text-[#172033] transition disabled:opacity-40 cursor-pointer"
              aria-label={rtl ? 'الأسبوع السابق' : 'Previous week'}
              title={rtl ? 'الأسبوع السابق' : 'Previous week'}
            >
              {rtl ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => updateQuery({ start: nav.todayStart })}
              disabled={isPending || nav.isCurrentWeek}
              className={`rounded-xl px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                nav.isCurrentWeek
                  ? 'bg-paper text-brand-teal shadow-xs'
                  : 'text-ink-muted hover:bg-paper hover:text-[#172033]'
              }`}
            >
              {rtl ? 'اليوم' : 'Today'}
            </button>
            <button
              type="button"
              onClick={() => updateQuery({ start: nav.nextStart })}
              disabled={isPending}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-ink-muted hover:bg-paper hover:text-[#172033] transition disabled:opacity-40 cursor-pointer"
              aria-label={rtl ? 'الأسبوع القادم' : 'Next week'}
              title={rtl ? 'الأسبوع القادم' : 'Next week'}
            >
              {rtl ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Date range title */}
          <span className="text-xs font-medium text-ink-muted px-2">
            {days[0] && days[6]
              ? `${dayHeaderFormatter.format(days[0].date)} – ${dayHeaderFormatter.format(days[6].date)}`
              : ''}
          </span>
        </div>

        {/* Filters and New Booking Modal */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Filter */}
          <div className="flex items-center gap-1.5 rounded-2xl border border-border bg-surface px-3 py-1.5 text-xs text-ink-muted">
            <Filter className="h-3.5 w-3.5 text-ink-muted shrink-0" aria-hidden="true" />
            <select
              value={currentStatusFilter}
              onChange={(e) => updateQuery({ status: e.target.value })}
              disabled={isPending}
              className="bg-transparent font-medium text-[#172033] outline-none cursor-pointer"
              aria-label={rtl ? 'تصفية حسب الحالة' : 'Filter by booking status'}
            >
              <option value="active">
                {rtl ? 'الحجوزات النشطة (بدون الملغاة)' : 'Active (excl. cancelled)'}
              </option>
              <option value="all">
                {rtl ? 'جميع الحالات (شامل الملغى)' : 'All statuses (inc. cancelled)'}
              </option>
              {ALL_BOOKING_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {getStatusLabel(st, locale)}
                </option>
              ))}
            </select>
          </div>

          {/* Manual Booking Modal trigger */}
          {!hideNewBookingButton && (
            <ManualBookingModal
              slug={slug}
              locale={locale}
              currency={currency}
              services={servicesList}
            />
          )}
        </div>
      </div>

      {/* Week Grid */}
      <section
        aria-label={rtl ? 'جدول المواعيد الأسبوعي' : 'Weekly appointments schedule'}
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-7"
      >
        {days.map((dayObj) => {
          const isTodayColumn = isSameDay(dayObj.date, today)
          const dayBookings = bookingsByDay[dayObj.dateParam] ?? []

          return (
            <article
              key={dayObj.dateParam}
              className={`flex flex-col min-h-72 rounded-3xl border bg-paper p-3.5 shadow-xs transition ${
                isTodayColumn
                  ? 'border-brand-teal/40 ring-1 ring-brand-teal/20 bg-teal-50/15'
                  : 'border-border'
              }`}
            >
              {/* Day column header */}
              <div className="flex items-center justify-between border-b border-border/80 pb-2.5">
                <div>
                  <h2 className="text-xs font-semibold text-[#172033]">
                    {dayHeaderFormatter.format(dayObj.date)}
                  </h2>
                  {isTodayColumn && (
                    <span className="inline-block mt-0.5 text-[10px] font-bold text-brand-teal">
                      {rtl ? 'اليوم' : 'Today'}
                    </span>
                  )}
                </div>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-surface px-1.5 text-[10px] font-semibold text-ink-muted">
                  {dayBookings.length}
                </span>
              </div>

              {/* Day bookings cards list */}
              <div className="mt-3 flex flex-1 flex-col gap-2.5">
                {dayBookings.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded-2xl bg-surface/60 p-4 text-center">
                    <p className="text-xs text-[#9aa3b2]">
                      {rtl ? 'لا توجد مواعيد' : 'No bookings'}
                    </p>
                  </div>
                ) : (
                  dayBookings.map((b) => {
                    const durationMin = Math.round(
                      (new Date(b.endsAt).getTime() - new Date(b.startsAt).getTime()) /
                        60000
                    )
                    const serviceNames = b.items
                      .map((it) => it.serviceName)
                      .filter(Boolean)

                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelectedBooking(b)}
                        className="group relative w-full rounded-2xl border border-border/80 bg-surface/50 p-3 text-start transition hover:border-brand-teal hover:bg-paper hover:shadow-md cursor-pointer"
                        aria-label={`${b.customerName} - ${timeFormatter.format(new Date(b.startsAt))}`}
                      >
                        {/* Time & status badge */}
                        <div className="flex items-start justify-between gap-1.5">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-teal">
                            <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span>{timeFormatter.format(new Date(b.startsAt))}</span>
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getStatusColor(
                              b.status
                            )}`}
                          >
                            {getStatusLabel(b.status, locale)}
                          </span>
                        </div>

                        {/* Customer name */}
                        <p className="mt-1.5 truncate text-xs font-semibold text-[#172033] group-hover:text-brand-teal transition">
                          {b.customerName}
                        </p>
                        {b.branchName && (
                          <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-brand-teal truncate">
                            <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span className="truncate">{b.branchName}</span>
                          </div>
                        )}

                        {/* Multi-service summary */}
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-ink-muted">
                          {serviceNames.length <= 1 ? (
                            <span className="truncate">
                              {serviceNames[0] || (rtl ? 'خدمة' : 'Service')}
                            </span>
                          ) : (
                            <span className="truncate">
                              {serviceNames[0]} +{serviceNames.length - 1}
                            </span>
                          )}
                        </div>

                        {/* Source / Creator & Price row */}
                        <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-1.5 text-[10px] text-ink-muted">
                          <span className="truncate max-w-[110px]">
                            {b.source === 'dashboard'
                              ? (b.createdByName || (rtl ? 'حجز يدوي' : 'Manual'))
                              : (rtl ? 'أونلاين' : 'Online')}
                          </span>
                          <span className="font-semibold text-[#172033]">
                            {b.totalPrice > 0 ? `${b.totalPrice} ${currency}` : `${durationMin} ${rtl ? 'د' : 'm'}`}
                          </span>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </article>
          )
        })}
      </section>

      {/* Appointment Detail Modal */}
      {selectedBooking && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="calendar-booking-detail-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
          dir={rtl ? 'rtl' : 'ltr'}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedBooking(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSelectedBooking(null)
          }}
        >
          <div className="relative w-full max-w-lg rounded-3xl border border-border bg-paper p-6 shadow-2xl max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-brand-teal">
                  <CalendarDays className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3
                    id="calendar-booking-detail-title"
                    className="text-base font-semibold text-[#172033]"
                  >
                    {rtl ? 'تفاصيل الموعد' : 'Appointment Details'}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${getStatusColor(
                        selectedBooking.status
                      )}`}
                    >
                      {getStatusLabel(selectedBooking.status, locale)}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {selectedBooking.source === 'dashboard'
                        ? rtl
                          ? 'تسجيل يدوي (حضوري / هاتف)'
                          : 'Manual (Dashboard / Walk-in)'
                        : rtl
                        ? 'حجز إلكتروني (الموقع)'
                        : 'Online (Website)'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="rounded-lg p-1.5 text-ink-muted hover:bg-surface hover:text-[#172033] transition cursor-pointer"
                aria-label={rtl ? 'إغلاق' : 'Close'}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="mt-5 space-y-4 text-xs">
              {/* Customer Contact */}
              <div className="rounded-2xl border border-border bg-surface p-4 space-y-2.5">
                <h4 className="font-semibold text-[#172033]">
                  {rtl ? 'بيانات العميل' : 'Customer Information'}
                </h4>
                <div className="grid gap-2 sm:grid-cols-2 text-ink-muted">
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 shrink-0 text-brand-teal" />
                    <span className="font-semibold text-[#172033]">
                      {selectedBooking.customerName}
                    </span>
                  </div>
                  {selectedBooking.branchName && (
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-brand-teal" />
                      <span className="text-xs text-[#374151]">
                        <span className="font-semibold text-ink-muted">{rtl ? 'الفرع: ' : 'Branch: '}</span>
                        <span className="font-medium text-[#172033]">{selectedBooking.branchName}</span>
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-brand-teal" />
                    <a
                      href={`tel:${selectedBooking.customerPhone}`}
                      className="font-mono text-brand-teal hover:underline"
                      dir="ltr"
                    >
                      {selectedBooking.customerPhone}
                    </a>
                  </div>
                  {selectedBooking.customerEmail && (
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-brand-teal" />
                      <a
                        href={`mailto:${selectedBooking.customerEmail}`}
                        className="truncate text-brand-teal hover:underline"
                        dir="ltr"
                      >
                        {selectedBooking.customerEmail}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Time & Total */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border bg-surface p-3.5">
                  <span className="text-[11px] text-ink-muted">
                    {rtl ? 'وقت الموعد' : 'Schedule'}
                  </span>
                  <p className="mt-1 font-bold text-[#172033]">
                    {timeFormatter.format(new Date(selectedBooking.startsAt))} –{' '}
                    {timeFormatter.format(new Date(selectedBooking.endsAt))}
                  </p>
                  <p className="mt-0.5 text-[10px] text-ink-muted">
                    {dayHeaderFormatter.format(new Date(selectedBooking.startsAt))}
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-3.5">
                  <span className="text-[11px] text-ink-muted">
                    {rtl ? 'الإجمالي التقديري' : 'Total Price'}
                  </span>
                  <p className="mt-1 font-bold text-brand-teal text-sm">
                    {selectedBooking.totalPrice > 0
                      ? `${selectedBooking.totalPrice} ${currency}`
                      : rtl
                      ? 'مجانًا'
                      : 'Free'}
                  </p>
                  <p className="mt-0.5 text-[10px] text-ink-muted">
                    {selectedBooking.items.length}{' '}
                    {rtl
                      ? selectedBooking.items.length > 1
                        ? 'خدمات'
                        : 'خدمة'
                      : selectedBooking.items.length > 1
                      ? 'services'
                      : 'service'}
                  </p>
                </div>
              </div>

              {selectedBooking.source === 'dashboard' && selectedBooking.createdByName && (
                <div className="flex items-center justify-between rounded-2xl border border-purple-200/70 bg-purple-50/50 px-4 py-2.5 text-xs">
                  <span className="text-ink-muted">
                    {rtl ? 'الموظف المسؤول:' : 'Responsible staff:'}
                  </span>
                  <span className="font-semibold text-purple-900">
                    {selectedBooking.createdByName}
                  </span>
                </div>
              )}

              {/* Multi-service breakdown */}
              <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
                <h4 className="font-semibold text-[#172033]">
                  {rtl ? 'الخدمات المحجوزة' : 'Booked Services'}
                </h4>
                <div className="divide-y divide-border/60">
                  {selectedBooking.items.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
                    >
                      <div>
                        <p className="font-semibold text-[#172033]">
                          {item.serviceName}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-ink-muted mt-0.5">
                          <span>
                            {item.durationMin} {rtl ? 'دقيقة' : 'min'}
                          </span>
                        </div>
                      </div>
                      <span className="font-semibold text-[#172033]">
                        {parseFloat(item.priceAmount) > 0
                          ? `${item.priceAmount} ${currency}`
                          : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              {(selectedBooking.customerNote ||
                (selectedBooking.internalNote && canViewInternalNotes)) && (
                <div className="rounded-2xl border border-border bg-surface p-4 space-y-2.5">
                  <h4 className="font-semibold text-[#172033]">
                    {rtl ? 'ملاحظات الموعد' : 'Booking Notes'}
                  </h4>
                  {selectedBooking.customerNote && (
                    <div className="rounded-xl bg-paper p-2.5 border border-border/80">
                      <span className="text-[10px] font-semibold text-ink-muted block">
                        {rtl ? 'ملاحظة العميل:' : 'Customer note:'}
                      </span>
                      <p className="mt-0.5 text-xs text-[#172033]">
                        {selectedBooking.customerNote}
                      </p>
                    </div>
                  )}
                  {selectedBooking.internalNote && canViewInternalNotes && (
                    <div className="rounded-xl bg-amber-50/70 p-2.5 border border-amber-200/60">
                      <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-800">
                        <Lock className="h-3 w-3" />
                        <span>{rtl ? 'ملاحظة داخلية (خاصة بالفريق):' : 'Internal note (Staff only):'}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-[#172033]">
                        {selectedBooking.internalNote}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Cancellation Reason if cancelled */}
              {selectedBooking.status === 'cancelled' && selectedBooking.cancelReason && (
                <div className="rounded-2xl border border-red-200 bg-red-50/60 p-3.5">
                  <span className="text-[10px] font-semibold text-red-800 block">
                    {rtl ? 'سبب الإلغاء:' : 'Cancellation Reason:'}
                  </span>
                  <p className="mt-0.5 text-xs text-red-900">
                    {selectedBooking.cancelReason}
                  </p>
                </div>
              )}

              {/* Actions for confirmed appointments */}
              {selectedBooking.status === 'confirmed' && (
                <div className="rounded-2xl border border-border bg-surface p-4">
                  <span className="text-[11px] font-semibold text-[#172033] block mb-1">
                    {rtl ? 'إجراءات الموعد' : 'Appointment Actions'}
                  </span>
                  <BookingStatusActions
                    slug={slug}
                    bookingId={selectedBooking.id}
                    locale={locale}
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end pt-4 mt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="rounded-xl border border-border bg-paper px-4 py-2 text-xs font-semibold text-ink-muted hover:bg-surface transition cursor-pointer"
              >
                {rtl ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
