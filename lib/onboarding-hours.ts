// Weekly opening hours collected during onboarding.
//
// These rows are the SAME shape the booking engine reads: tenant-level working
// hours (`staff_id IS NULL`), optionally scoped to a branch. See
// `getAvailableSlots` in app/[locale]/tenants/[slug]/book/actions.ts — it looks
// up `working_hours` for the branch first, then falls back to branch-less rows.
//
// Weekday numbering matches `Date#getUTCDay()` and the existing Schedule editor:
// 0 = Sunday … 6 = Saturday. The module is framework-free so the onboarding form
// (client) and `createTenant` (server) validate the exact same structure.

import type { Locale } from '@/lib/i18n'

export type ScheduleDay = {
  weekday: number
  startTime: string
  endTime: string
  closed: boolean
}

export const WEEKDAYS: { ar: string; en: string }[] = [
  { ar: 'الأحد', en: 'Sunday' },
  { ar: 'الإثنين', en: 'Monday' },
  { ar: 'الثلاثاء', en: 'Tuesday' },
  { ar: 'الأربعاء', en: 'Wednesday' },
  { ar: 'الخميس', en: 'Thursday' },
  { ar: 'الجمعة', en: 'Friday' },
  { ar: 'السبت', en: 'Saturday' },
]

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value)
}

/**
 * Sensible starting schedule: Saturday–Thursday 09:00–17:00, Friday closed.
 * It is only a prefill — nothing is persisted unless the user keeps it.
 */
export const DEFAULT_SCHEDULE: ScheduleDay[] = WEEKDAYS.map((_, weekday) => ({
  weekday,
  startTime: '09:00',
  endTime: '17:00',
  closed: weekday === 5,
}))

export function cloneDefaultSchedule(): ScheduleDay[] {
  return DEFAULT_SCHEDULE.map((day) => ({ ...day }))
}

/** True when every day is well formed (unique weekday, valid and ordered times). */
export function isValidSchedule(days: unknown): days is ScheduleDay[] {
  if (!Array.isArray(days) || days.length === 0 || days.length > 7) return false
  const seen = new Set<number>()
  for (const day of days) {
    if (!day || typeof day !== 'object') return false
    const candidate = day as Partial<ScheduleDay>
    if (typeof candidate.weekday !== 'number' || !Number.isInteger(candidate.weekday)) return false
    if (candidate.weekday < 0 || candidate.weekday > 6) return false
    if (seen.has(candidate.weekday)) return false
    seen.add(candidate.weekday)
    if (typeof candidate.closed !== 'boolean') return false
    if (candidate.closed) continue
    if (!isValidTime(candidate.startTime) || !isValidTime(candidate.endTime)) return false
    if (candidate.startTime >= candidate.endTime) return false
  }
  return true
}

/** Parse the hidden form field. Returns null when missing or invalid. */
export function parseSchedule(raw: string | null | undefined): ScheduleDay[] | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isValidSchedule(parsed)) return null
  return parsed
    .map((day) => ({
      weekday: day.weekday,
      startTime: day.startTime,
      endTime: day.endTime,
      closed: day.closed,
    }))
    .sort((a, b) => a.weekday - b.weekday)
}

export function countOpenDays(days: ScheduleDay[]): number {
  return days.filter((day) => !day.closed).length
}

/** Short human summary for the review step, e.g. "6/7 · 09:00–17:00". */
export function scheduleSummary(days: ScheduleDay[], locale: Locale): string {
  const open = days.filter((day) => !day.closed)
  if (open.length === 0) return locale === 'ar' ? 'كل الأيام مغلقة' : 'All days closed'
  const ranges = new Set(open.map((day) => `${day.startTime}–${day.endTime}`))
  const range =
    ranges.size === 1
      ? Array.from(ranges)[0]
      : locale === 'ar'
        ? 'أوقات مختلفة'
        : 'Varying hours'
  return `${open.length}/${days.length} · ${range}`
}

/** The weekday label used in validation messages. */
export function weekdayLabel(weekday: number, locale: Locale): string {
  return WEEKDAYS[weekday]?.[locale] ?? String(weekday)
}
