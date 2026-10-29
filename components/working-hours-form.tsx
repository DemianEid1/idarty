'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { saveAllWorkingHours } from '@/app/[locale]/tenants/[slug]/dashboard/hours-actions'
import type { Locale } from '@/lib/i18n'
import { useToast } from '@/components/toast'

const days = [
  { ar: 'الأحد', en: 'Sunday' },
  { ar: 'الإثنين', en: 'Monday' },
  { ar: 'الثلاثاء', en: 'Tuesday' },
  { ar: 'الأربعاء', en: 'Wednesday' },
  { ar: 'الخميس', en: 'Thursday' },
  { ar: 'الجمعة', en: 'Friday' },
  { ar: 'السبت', en: 'Saturday' },
]

type DayState = {
  weekday: number
  startTime: string
  endTime: string
  closed: boolean
}

function getInitialDaysState(
  hours: Array<{ weekday: number; startTime: string; endTime: string }>
): DayState[] {
  return days.map((_, weekday) => {
    const current = hours.find((item) => item.weekday === weekday)
    return {
      weekday,
      startTime: current?.startTime ?? '09:00',
      endTime: current?.endTime ?? '17:00',
      closed: !current,
    }
  })
}

export function WorkingHoursForm({
  locale,
  slug,
  hours,
  branchId,
}: {
  locale: Locale
  slug: string
  hours: Array<{ weekday: number; startTime: string; endTime: string }>
  branchId?: string
}) {
  const rtl = locale === 'ar'
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [daysState, setDaysState] = useState<DayState[]>(() => getInitialDaysState(hours))

  // Sync state if parent props update from server
  useEffect(() => {
    setDaysState(getInitialDaysState(hours))
  }, [hours])

  const hasChanges = useMemo(() => {
    const initial = getInitialDaysState(hours)
    return JSON.stringify(daysState) !== JSON.stringify(initial)
  }, [daysState, hours])

  const handleStatusChange = (weekday: number, closed: boolean) => {
    setDaysState((prev) =>
      prev.map((day) => (day.weekday === weekday ? { ...day, closed } : day))
    )
  }

  const handleTimeChange = (
    weekday: number,
    field: 'startTime' | 'endTime',
    value: string
  ) => {
    setDaysState((prev) =>
      prev.map((day) => (day.weekday === weekday ? { ...day, [field]: value } : day))
    )
  }

  const handleCancel = () => {
    setDaysState(getInitialDaysState(hours))
    toast('info', rtl ? 'تم إلغاء التغييرات واستعادة الساعات السابقة' : 'Changes discarded')
  }

  const handleSave = () => {
    // Validate all open days before dispatching
    for (const d of daysState) {
      if (!d.closed) {
        if (!d.startTime || !d.endTime) {
          toast(
            'error',
            rtl
              ? `يرجى تحديد أوقات البدء والانتهاء ليوم ${days[d.weekday][locale]}`
              : `Please specify start and end time for ${days[d.weekday][locale]}`
          )
          return
        }
        if (d.startTime >= d.endTime) {
          toast(
            'error',
            rtl
              ? `وقت البدء يجب أن يكون قبل وقت الانتهاء ليوم ${days[d.weekday][locale]}`
              : `Start time must be before end time for ${days[d.weekday][locale]}`
          )
          return
        }
      }
    }

    startTransition(async () => {
      try {
        await saveAllWorkingHours({
          slug,
          locale,
          branchId,
          days: daysState,
        })
        toast('success', rtl ? 'تم حفظ ساعات العمل بنجاح' : 'Working hours saved successfully')
      } catch {
        toast('error', rtl ? 'حدث خطأ أثناء حفظ ساعات العمل' : 'Failed to save working hours')
      }
    })
  }

  return (
    <div className="mt-5 space-y-3">
      {/* ── Days Rows ────────────────────────────────────────────────── */}
      {daysState.map((day) => {
        const dayLabel = days[day.weekday][locale]
        const isOpen = !day.closed

        // Accessible, stable Switch toggle component
        const switchElement = (
          <div className="flex items-center gap-2.5">
            <span
              className={`min-w-[42px] select-none text-xs font-semibold ${
                isOpen ? 'text-brand-teal' : 'text-ink-muted'
              }`}
            >
              {isOpen ? (rtl ? 'مفتوح' : 'Open') : (rtl ? 'مغلق' : 'Closed')}
            </span>
            <button
              dir="ltr"
              type="button"
              role="switch"
              aria-checked={isOpen}
              aria-label={`${dayLabel} - ${isOpen ? (rtl ? 'مفتوح' : 'Open') : (rtl ? 'مغلق' : 'Closed')}`}
              onClick={() => handleStatusChange(day.weekday, isOpen)}
              disabled={pending}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-teal focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                isOpen ? 'bg-brand-teal' : 'bg-gray-300'
              }`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out ${
                  isOpen ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        )

        return (
          <div
            key={day.weekday}
            className="rounded-2xl border border-[#f1f3f7] bg-surface p-4 transition"
          >
            {/* Desktop grid: Day Name (right in AR) -> From -> To -> Switch (left in AR) */}
            <div className="grid gap-3 sm:grid-cols-[100px_1fr_1fr_auto] sm:items-center">
              {/* Day Name & mobile top bar */}
              <div className="flex items-center justify-between sm:justify-start">
                <span className="text-sm font-semibold text-[#172033]">{dayLabel}</span>
                {/* On mobile: switch appears on the opposite side of day name */}
                <div className="sm:hidden">{switchElement}</div>
              </div>

              {/* Start Time */}
              <label className="flex items-center gap-2 text-sm">
                <span className="min-w-[20px] text-xs font-medium text-ink-muted">
                  {rtl ? 'من' : 'From'}
                </span>
                <input
                  type="time"
                  value={day.startTime}
                  onChange={(e) => handleTimeChange(day.weekday, 'startTime', e.target.value)}
                  disabled={day.closed || pending}
                  className="h-11 w-full rounded-xl border border-[#e1e5ed] bg-paper px-3 text-sm outline-none transition focus:border-brand-teal disabled:cursor-not-allowed disabled:bg-[#f8f9fb] disabled:opacity-40"
                />
              </label>

              {/* End Time */}
              <label className="flex items-center gap-2 text-sm">
                <span className="min-w-[20px] text-xs font-medium text-ink-muted">
                  {rtl ? 'إلى' : 'To'}
                </span>
                <input
                  type="time"
                  value={day.endTime}
                  onChange={(e) => handleTimeChange(day.weekday, 'endTime', e.target.value)}
                  disabled={day.closed || pending}
                  className="h-11 w-full rounded-xl border border-[#e1e5ed] bg-paper px-3 text-sm outline-none transition focus:border-brand-teal disabled:cursor-not-allowed disabled:bg-[#f8f9fb] disabled:opacity-40"
                />
              </label>

              {/* Desktop Switch (appears on the left in RTL / end of row) */}
              <div className="hidden sm:flex sm:items-center sm:justify-end">
                {switchElement}
              </div>
            </div>
          </div>
        )
      })}

      {/* ── General Action Buttons: Save changes & Cancel ───────────── */}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-3">
        <button
          type="button"
          onClick={handleCancel}
          disabled={pending || !hasChanges}
          className="rounded-xl border border-border bg-paper px-5 py-2.5 text-sm font-semibold text-[#172033] shadow-xs transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
        >
          {rtl ? 'إلغاء' : 'Cancel'}
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="inline-flex min-w-[130px] items-center justify-center rounded-xl bg-brand-teal px-6 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-[#1a856a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span>{rtl ? 'جاري الحفظ...' : 'Saving...'}</span>
            </span>
          ) : (
            rtl ? 'حفظ التغييرات' : 'Save changes'
          )}
        </button>
      </div>
    </div>
  )
}
