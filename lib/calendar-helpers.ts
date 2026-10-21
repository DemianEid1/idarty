import type { Locale } from '@/lib/i18n'

/**
 * Validates whether a string is a valid YYYY-MM-DD date representation.
 * Prevents invalid dates (e.g. 2026-02-31) and timezone-shifting string parses.
 */
export function isValidDateString(val?: string | null): boolean {
  if (!val || typeof val !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(val.trim())
  if (!match) return false
  const y = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  const d = parseInt(match[3], 10)
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return false
  const date = new Date(y, m - 1, d, 0, 0, 0, 0)
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  )
}

/**
 * Parses a YYYY-MM-DD string into a local-midnight Date.
 * If the input is invalid or missing, safely falls back to referenceDate at midnight.
 */
export function parseStartDate(startParam?: string | null, referenceDate = new Date()): Date {
  if (isValidDateString(startParam)) {
    const [y, m, d] = startParam!.trim().split('-').map((n) => parseInt(n, 10))
    return new Date(y, m - 1, d, 0, 0, 0, 0)
  }
  const fallback = new Date(referenceDate)
  fallback.setHours(0, 0, 0, 0)
  return fallback
}

/**
 * Formats a Date into a YYYY-MM-DD parameter string using local date parts.
 */
export function formatDateParam(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Generates an array of 7 consecutive dates representing the calendar week,
 * starting from startDate at midnight.
 */
export function getWeekDays(startDate: Date): Date[] {
  const base = new Date(startDate)
  base.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    return d
  })
}

/**
 * Returns the start (inclusive) and end (exclusive) date boundaries for the 7-day query window.
 */
export function getWeekRange(startDate: Date): { start: Date; end: Date } {
  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { start, end }
}

/**
 * Computes previous week, next week, today parameters, and whether the week contains today.
 */
export function getWeekNavParams(
  startDate: Date,
  referenceDate = new Date()
): {
  prevStart: string
  nextStart: string
  todayStart: string
  isCurrentWeek: boolean
} {
  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)

  const prev = new Date(start)
  prev.setDate(prev.getDate() - 7)

  const next = new Date(start)
  next.setDate(next.getDate() + 7)

  const today = new Date(referenceDate)
  today.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  const isCurrentWeek = today.getTime() >= start.getTime() && today.getTime() < end.getTime()

  return {
    prevStart: formatDateParam(prev),
    nextStart: formatDateParam(next),
    todayStart: formatDateParam(today),
    isCurrentWeek,
  }
}

/**
 * Checks whether two Dates fall on the exact same local calendar day.
 */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * Buckets an array of items by their `startsAt` date matching each day in `days`.
 */
export function bucketBookingsByDay<T extends { startsAt: Date }>(
  days: Date[],
  items: T[]
): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const day of days) {
    map.set(formatDateParam(day), [])
  }
  for (const item of items) {
    const key = formatDateParam(item.startsAt)
    const list = map.get(key)
    if (list) {
      list.push(item)
    }
  }
  return map
}

/**
 * Validates a staff filter ID. Returns the UUID if valid, or null otherwise.
 */
export function isValidStaffId(staffParam?: string | null): string | null {
  if (!staffParam || typeof staffParam !== 'string') return null
  const trimmed = staffParam.trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null
}

/**
 * Formats a localized week range summary (e.g. "18 Oct – 24 Oct 2026").
 */
export function formatWeekRangeLabel(startDate: Date, locale: Locale): string {
  const days = getWeekDays(startDate)
  const first = days[0]
  const last = days[6]
  const intlLocale = locale === 'ar' ? 'ar-EG' : 'en-US'
  const dayMonthFormatter = new Intl.DateTimeFormat(intlLocale, {
    day: 'numeric',
    month: 'short',
  })
  const yearFormatter = new Intl.DateTimeFormat(intlLocale, { year: 'numeric' })

  const firstStr = dayMonthFormatter.format(first)
  const lastStr = dayMonthFormatter.format(last)
  const yearStr = yearFormatter.format(last)

  return `${firstStr} – ${lastStr} (${yearStr})`
}
