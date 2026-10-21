import { describe, expect, it } from 'vitest'
import {
  bucketBookingsByDay,
  formatDateParam,
  formatWeekRangeLabel,
  getWeekDays,
  getWeekNavParams,
  getWeekRange,
  isSameDay,
  isValidDateString,
  isValidStaffId,
  parseStartDate,
} from './calendar-helpers'

describe('calendar-helpers: date validation and parsing', () => {
  it('validates proper YYYY-MM-DD dates', () => {
    expect(isValidDateString('2026-10-21')).toBe(true)
    expect(isValidDateString('2024-02-29')).toBe(true) // leap year
    expect(isValidDateString('2025-02-28')).toBe(true)
  })

  it('rejects invalid format strings', () => {
    expect(isValidDateString(null)).toBe(false)
    expect(isValidDateString(undefined)).toBe(false)
    expect(isValidDateString('')).toBe(false)
    expect(isValidDateString('not-a-date')).toBe(false)
    expect(isValidDateString('2026/10/21')).toBe(false)
    expect(isValidDateString('21-10-2026')).toBe(false)
  })

  it('rejects nonexistent dates that JavaScript Date overflows', () => {
    expect(isValidDateString('2026-02-29')).toBe(false) // 2026 is not a leap year
    expect(isValidDateString('2026-02-31')).toBe(false)
    expect(isValidDateString('2026-04-31')).toBe(false)
    expect(isValidDateString('2026-13-01')).toBe(false)
    expect(isValidDateString('2026-00-10')).toBe(false)
  })

  it('parses valid start param without shifting local calendar day', () => {
    const parsed = parseStartDate('2026-10-21')
    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(9) // 0-indexed October
    expect(parsed.getDate()).toBe(21)
    expect(parsed.getHours()).toBe(0)
    expect(parsed.getMinutes()).toBe(0)
    expect(parsed.getSeconds()).toBe(0)
  })

  it('falls back to referenceDate midnight when param is invalid or missing', () => {
    const ref = new Date(2026, 4, 15, 14, 30, 0)
    const parsedNull = parseStartDate(null, ref)
    expect(formatDateParam(parsedNull)).toBe('2026-05-15')
    expect(parsedNull.getHours()).toBe(0)

    const parsedInvalid = parseStartDate('invalid-date', ref)
    expect(formatDateParam(parsedInvalid)).toBe('2026-05-15')
  })
})

describe('calendar-helpers: week calculation and navigation', () => {
  it('generates 7 consecutive days starting from startDate', () => {
    const start = new Date(2026, 9, 21, 0, 0, 0)
    const days = getWeekDays(start)

    expect(days).toHaveLength(7)
    expect(formatDateParam(days[0])).toBe('2026-10-21')
    expect(formatDateParam(days[1])).toBe('2026-10-22')
    expect(formatDateParam(days[2])).toBe('2026-10-23')
    expect(formatDateParam(days[3])).toBe('2026-10-24')
    expect(formatDateParam(days[4])).toBe('2026-10-25')
    expect(formatDateParam(days[5])).toBe('2026-10-26')
    expect(formatDateParam(days[6])).toBe('2026-10-27')
  })

  it('provides an exclusive end boundary 7 days ahead', () => {
    const start = new Date(2026, 9, 21, 0, 0, 0)
    const { start: rangeStart, end: rangeEnd } = getWeekRange(start)

    expect(formatDateParam(rangeStart)).toBe('2026-10-21')
    expect(formatDateParam(rangeEnd)).toBe('2026-10-28')
    const diffDays = Math.round(
      (rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)
    )
    expect(diffDays).toBe(7)
  })

  it('computes prev/next week parameters and current week status', () => {
    const start = new Date(2026, 9, 21, 0, 0, 0)
    const today = new Date(2026, 9, 23, 10, 0, 0) // inside this week

    const nav = getWeekNavParams(start, today)
    expect(nav.prevStart).toBe('2026-10-14')
    expect(nav.nextStart).toBe('2026-10-28')
    expect(nav.todayStart).toBe('2026-10-23')
    expect(nav.isCurrentWeek).toBe(true)

    const pastWeekStart = new Date(2026, 8, 1, 0, 0, 0)
    const pastNav = getWeekNavParams(pastWeekStart, today)
    expect(pastNav.isCurrentWeek).toBe(false)
  })

  it('identifies same calendar days regardless of hours/minutes', () => {
    const d1 = new Date(2026, 9, 21, 8, 0, 0)
    const d2 = new Date(2026, 9, 21, 23, 59, 59)
    const d3 = new Date(2026, 9, 22, 0, 0, 0)

    expect(isSameDay(d1, d2)).toBe(true)
    expect(isSameDay(d1, d3)).toBe(false)
  })
})

describe('calendar-helpers: bucketing and filters', () => {
  it('buckets bookings into their corresponding day slots', () => {
    const start = new Date(2026, 9, 21, 0, 0, 0)
    const days = getWeekDays(start)

    const b1 = { id: '1', startsAt: new Date(2026, 9, 21, 10, 0, 0) }
    const b2 = { id: '2', startsAt: new Date(2026, 9, 21, 14, 30, 0) }
    const b3 = { id: '3', startsAt: new Date(2026, 9, 25, 9, 15, 0) }
    const bOutside = { id: 'out', startsAt: new Date(2026, 9, 30, 12, 0, 0) }

    const bucketed = bucketBookingsByDay(days, [b1, b2, b3, bOutside])

    expect(bucketed.get('2026-10-21')).toEqual([b1, b2])
    expect(bucketed.get('2026-10-22')).toEqual([])
    expect(bucketed.get('2026-10-25')).toEqual([b3])
    expect(bucketed.get('2026-10-30')).toBeUndefined()
  })

  it('validates UUID staff IDs and rejects invalid ones', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000'
    expect(isValidStaffId(validUuid)).toBe(validUuid)
    expect(isValidStaffId(null)).toBeNull()
    expect(isValidStaffId('undefined')).toBeNull()
    expect(isValidStaffId('12345')).toBeNull()
    expect(isValidStaffId("'; DROP TABLE bookings; --")).toBeNull()
  })

  it('formats week range label for Arabic and English', () => {
    const start = new Date(2026, 9, 21, 0, 0, 0)
    const arLabel = formatWeekRangeLabel(start, 'ar')
    const enLabel = formatWeekRangeLabel(start, 'en')

    expect(arLabel).toBeTruthy()
    expect(enLabel).toContain('2026')
    expect(enLabel).toContain('Oct')
  })
})
