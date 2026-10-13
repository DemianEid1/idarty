'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { archiveService } from '@/app/[locale]/tenants/[slug]/dashboard/actions'
import type { Locale } from '@/lib/i18n'
import { useToast } from '@/components/toast'

/**
 * Delete a service.
 *
 * The label and icon are Delete/trash (the old "أرشفة / Archive" wording was
 * misleading), but the underlying behaviour is a SOFT delete — see
 * `archiveService` in dashboard/actions.ts for why a hard DELETE is not safe:
 * `booking_items.service_id` has no ON DELETE CASCADE, so removing the row would
 * break booking history.
 *
 * A confirmation dialog states that consequence plainly, so the tenant is not
 * surprised by an "archived" service reappearing in their booking history.
 */
export function ServiceDeleteButton({
  slug,
  locale,
  serviceId,
  serviceName,
  bookingCount,
}: {
  slug: string
  locale: Locale
  serviceId: string
  serviceName: string
  /** How many bookings reference this service. 0 = never booked. */
  bookingCount: number
}) {
  const rtl = locale === 'ar'
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function handleDelete() {
    const formData = new FormData()
    formData.set('slug', slug)
    formData.set('locale', locale)
    formData.set('serviceId', serviceId)
    startTransition(async () => {
      try {
        await archiveService(formData)
        setConfirming(false)
        toast('success', rtl ? 'تم حذف الخدمة.' : 'Service deleted.')
      } catch {
        setConfirming(false)
        toast('error', rtl ? 'تعذر حذف الخدمة.' : 'Could not delete service.')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={rtl ? `حذف الخدمة ${serviceName}` : `Delete service ${serviceName}`}
        title={rtl ? 'حذف' : 'Delete'}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#e1e5ed] bg-paper px-2.5 py-1.5 text-xs font-semibold text-red-600 outline-none transition hover:border-red-300 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"
      >
        <Trash2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        {rtl ? 'حذف' : 'Delete'}
      </button>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={rtl ? 'تأكيد الحذف' : 'Confirm delete'}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" dir={rtl ? 'rtl' : 'ltr'}>
            <h3 className="text-lg font-semibold">{rtl ? 'تأكيد الحذف' : 'Confirm delete'}</h3>
            <p className="mt-2 text-sm text-ink-muted">
              {rtl
                ? `سيتم حذف «${serviceName}» من قائمة الخدمات ومن موقعك العام.`
                : `"${serviceName}" will be removed from your services and your public website.`}
            </p>
            {/* State the real consequence of a soft delete, so the tenant knows
                their history survives. */}
            <p className="mt-2 text-sm text-ink-muted">
              {bookingCount > 0
                ? rtl
                  ? `لدى هذه الخدمة ${bookingCount} حجز سابق. ستبقى سجلات الحجز والمواعيد محفوظة كما هي.`
                  : `This service has ${bookingCount} existing booking${bookingCount === 1 ? '' : 's'}. The booking history is kept intact.`
                : rtl
                  ? 'لا توجد حجوزات مرتبطة بهذه الخدمة.'
                  : 'No bookings are linked to this service.'}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-ink-muted hover:bg-surface disabled:opacity-50"
              >
                {rtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4 shrink-0" />
                {pending ? (rtl ? 'جارٍ الحذف...' : 'Deleting...') : (rtl ? 'حذف' : 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
