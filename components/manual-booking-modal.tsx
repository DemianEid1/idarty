'use client'

import { useState, useTransition, useMemo } from 'react'
import { CalendarPlus, Plus, X } from 'lucide-react'
import type { Locale } from '@/lib/i18n'
import { useToast } from '@/components/toast'
import { createManualBooking } from '@/app/[locale]/tenants/[slug]/dashboard/booking-actions'

export interface ManualBookingModalProps {
  slug: string
  locale: Locale
  currency: string
  services: Array<{
    id: string
    name: string
    durationMin: number
    priceAmount: string
  }>
}

function getDefaultDateTime(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() + 30)
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ManualBookingModal({
  slug,
  locale,
  currency,
  services,
}: ManualBookingModalProps) {
  const rtl = locale === 'ar'
  const { toast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [selectedServiceId, setSelectedServiceId] = useState(services[0]?.id || '')
  const [startsAt, setStartsAt] = useState(getDefaultDateTime)
  const [customerNote, setCustomerNote] = useState('')
  const [internalNote, setInternalNote] = useState('')

  function resetForm() {
    setCustomerName('')
    setCustomerPhone('')
    setCustomerEmail('')
    setSelectedServiceId(services[0]?.id || '')
    setStartsAt(getDefaultDateTime())
    setCustomerNote('')
    setInternalNote('')
    setErrorMessage(null)
  }

  function handleOpen() {
    resetForm()
    setIsOpen(true)
  }

  function handleClose() {
    if (pending) return
    setIsOpen(false)
    setErrorMessage(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage(null)

    if (!customerName.trim()) {
      setErrorMessage(rtl ? 'يرجى إدخال اسم العميل.' : 'Please enter customer name.')
      return
    }
    if (!customerPhone.trim()) {
      setErrorMessage(rtl ? 'يرجى إدخال رقم هاتف العميل.' : 'Please enter customer phone.')
      return
    }
    if (!selectedServiceId) {
      setErrorMessage(rtl ? 'يرجى اختيار الخدمة.' : 'Please select a service.')
      return
    }

    const startDate = new Date(startsAt)
    if (Number.isNaN(startDate.getTime())) {
      setErrorMessage(rtl ? 'يرجى تحديد وقت وتاريخ صالحين.' : 'Please select a valid date and time.')
      return
    }

    startTransition(async () => {
      try {
        const res = await createManualBooking({
          slug,
          locale,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim() || undefined,
          serviceId: selectedServiceId,
          startsAt: startDate.toISOString(),
          customerNote: customerNote.trim() || undefined,
          internalNote: internalNote.trim() || undefined,
        })

        if (res.ok) {
          toast('success', rtl ? 'تم إنشاء الحجز بنجاح' : 'Booking created successfully')
          setIsOpen(false)
          resetForm()
        } else {
          setErrorMessage(res.message || (rtl ? 'تعذر إنشاء الحجز.' : 'Could not create booking.'))
          toast('error', res.message || (rtl ? 'حدث خطأ' : 'Error'))
        }
      } catch (err: any) {
        const msg = rtl ? 'حدث خطأ غير متوقع.' : 'An unexpected error occurred.'
        setErrorMessage(msg)
        toast('error', msg)
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-2 rounded-xl bg-brand-teal px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0d6560] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal cursor-pointer"
      >
        <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{rtl ? 'حجز يدوي جديد' : 'New Booking'}</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="manual-booking-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
          dir={rtl ? 'rtl' : 'ltr'}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') handleClose()
          }}
        >
          <div className="relative w-full max-w-lg rounded-3xl border border-border bg-paper p-6 shadow-2xl max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f0faf9] text-brand-teal">
                  <CalendarPlus className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 id="manual-booking-title" className="text-base font-semibold text-[#172033]">
                    {rtl ? 'تسجيل حجز يدوي' : 'New Manual Booking'}
                  </h3>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {rtl
                      ? 'إنشاء حجز لعميل مباشر في المتجر أو عبر الهاتف.'
                      : 'Record a booking for a walk-in or phone customer.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={pending}
                className="rounded-lg p-1 text-ink-muted hover:bg-surface hover:text-[#172033] transition"
                aria-label={rtl ? 'إغلاق' : 'Close'}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Error notice */}
            {errorMessage && (
              <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700 border border-red-200">
                {errorMessage}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
              {/* Customer Info */}
              <div className="space-y-3 rounded-2xl bg-surface p-4 border border-border">
                <h4 className="font-semibold text-[#172033]">
                  {rtl ? 'بيانات العميل' : 'Customer Details'}
                </h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="font-medium text-[#374151]">
                      {rtl ? 'الاسم بالكامل *' : 'Full Name *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder={rtl ? 'محمد أحمد' : 'Alex Smith'}
                      className="w-full rounded-xl border border-border bg-paper px-3 py-2 text-xs outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-medium text-[#374151]">
                      {rtl ? 'رقم الهاتف *' : 'Phone Number *'}
                    </label>
                    <input
                      type="tel"
                      required
                      dir="ltr"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder={rtl ? '01001234567' : '+1234567890'}
                      className="w-full rounded-xl border border-border bg-paper px-3 py-2 text-xs outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal text-left"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <label className="font-medium text-[#374151]">
                      {rtl ? 'البريد الإلكتروني (اختياري)' : 'Email (Optional)'}
                    </label>
                    <input
                      type="email"
                      dir="ltr"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="customer@example.com"
                      className="w-full rounded-xl border border-border bg-paper px-3 py-2 text-xs outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal text-left"
                    />
                  </div>
                </div>
              </div>

              {/* Service & Time */}
              <div className="space-y-3 rounded-2xl bg-surface p-4 border border-border">
                <h4 className="font-semibold text-[#172033]">
                  {rtl ? 'الخدمة والموعد' : 'Service & Time'}
                </h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="font-medium text-[#374151]">
                      {rtl ? 'الخدمة *' : 'Service *'}
                    </label>
                    <select
                      value={selectedServiceId}
                      onChange={(e) => setSelectedServiceId(e.target.value)}
                      className="w-full rounded-xl border border-border bg-paper px-3 py-2 text-xs outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal"
                    >
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.durationMin} {rtl ? 'دقيقة' : 'min'} · {s.priceAmount} {currency})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <label className="font-medium text-[#374151]">
                      {rtl ? 'موعد الحجز *' : 'Appointment Time *'}
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                      className="w-full rounded-xl border border-border bg-paper px-3 py-2 text-xs outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal"
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-3 rounded-2xl bg-surface p-4 border border-border">
                <h4 className="font-semibold text-[#172033]">
                  {rtl ? 'ملاحظات إضافية' : 'Notes'}
                </h4>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="font-medium text-[#374151]">
                      {rtl ? 'ملاحظة العميل' : 'Customer Note'}
                    </label>
                    <input
                      type="text"
                      value={customerNote}
                      onChange={(e) => setCustomerNote(e.target.value)}
                      placeholder={rtl ? 'طلبات العميل الخاصة' : 'Customer special requests'}
                      className="w-full rounded-xl border border-border bg-paper px-3 py-2 text-xs outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-medium text-[#374151]">
                      {rtl ? 'ملاحظة داخلية (للفريق فقط)' : 'Internal Note (Team only)'}
                    </label>
                    <input
                      type="text"
                      value={internalNote}
                      onChange={(e) => setInternalNote(e.target.value)}
                      placeholder={rtl ? 'ملاحظة مرئية للفريق فقط' : 'Private note visible only to staff'}
                      className="w-full rounded-xl border border-border bg-paper px-3 py-2 text-xs outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal"
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleClose}
                  className="rounded-xl border border-border bg-paper px-4 py-2 text-xs font-semibold text-ink-muted hover:bg-surface transition disabled:opacity-50"
                >
                  {rtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-xl bg-brand-teal px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0d6560] disabled:opacity-50 cursor-pointer"
                >
                  {pending
                    ? rtl
                      ? 'جارٍ التسجيل...'
                      : 'Saving...'
                    : rtl
                    ? 'تسجيل الحجز'
                    : 'Create Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
