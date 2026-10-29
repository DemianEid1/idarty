import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCHEDULE,
  cloneDefaultSchedule,
  countOpenDays,
  isValidSchedule,
  isValidTime,
  parseSchedule,
  scheduleSummary,
  weekdayLabel,
} from '@/lib/onboarding-hours'

describe('onboarding schedule defaults', () => {
  it('opens six days and closes Friday by default', () => {
    expect(DEFAULT_SCHEDULE).toHaveLength(7)
    expect(countOpenDays(DEFAULT_SCHEDULE)).toBe(6)
    expect(DEFAULT_SCHEDULE.find((day) => day.weekday === 5)?.closed).toBe(true)
  })

  it('covers every weekday exactly once, Sunday first', () => {
    expect(DEFAULT_SCHEDULE.map((day) => day.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('hands out copies so editing a prefill cannot mutate the default', () => {
    const copy = cloneDefaultSchedule()
    copy[0].startTime = '08:00'
    expect(DEFAULT_SCHEDULE[0].startTime).toBe('09:00')
    expect(copy[0]).not.toBe(DEFAULT_SCHEDULE[0])
  })
})

describe('time validation', () => {
  it('accepts 24h times', () => {
    expect(isValidTime('00:00')).toBe(true)
    expect(isValidTime('09:30')).toBe(true)
    expect(isValidTime('23:59')).toBe(true)
  })

  it('rejects empty, malformed and out-of-range values', () => {
    expect(isValidTime('')).toBe(false)
    expect(isValidTime('24:00')).toBe(false)
    expect(isValidTime('9:00')).toBe(false)
    expect(isValidTime('09:60')).toBe(false)
    expect(isValidTime(undefined)).toBe(false)
  })
})

describe('isValidSchedule', () => {
  it('accepts a full valid week', () => {
    expect(isValidSchedule(DEFAULT_SCHEDULE)).toBe(true)
  })

  it('accepts a closed day with no times', () => {
    const days = cloneDefaultSchedule().map((day) =>
      day.weekday === 1 ? { ...day, closed: true, startTime: '', endTime: '' } : day
    )
    expect(isValidSchedule(days)).toBe(true)
  })

  it('rejects an open day whose end is not after its start', () => {
    const days = cloneDefaultSchedule().map((day) =>
      day.weekday === 2 ? { ...day, startTime: '17:00', endTime: '09:00' } : day
    )
    expect(isValidSchedule(days)).toBe(false)
  })

  it('rejects an open day with a malformed time', () => {
    const days = cloneDefaultSchedule().map((day) =>
      day.weekday === 3 ? { ...day, startTime: '9:00' } : day
    )
    expect(isValidSchedule(days)).toBe(false)
  })

  it('rejects duplicate or out-of-range weekdays', () => {
    expect(isValidSchedule([{ weekday: 0, startTime: '09:00', endTime: '17:00', closed: false }])).toBe(true)
    expect(
      isValidSchedule([
        { weekday: 0, startTime: '09:00', endTime: '17:00', closed: false },
        { weekday: 0, startTime: '09:00', endTime: '17:00', closed: false },
      ])
    ).toBe(false)
    expect(isValidSchedule([{ weekday: 7, startTime: '09:00', endTime: '17:00', closed: false }])).toBe(false)
  })

  it('rejects non-arrays, empty arrays and non-object entries', () => {
    expect(isValidSchedule(null)).toBe(false)
    expect(isValidSchedule([])).toBe(false)
    expect(isValidSchedule('nope')).toBe(false)
    expect(isValidSchedule([null])).toBe(false)
  })
})

describe('parseSchedule', () => {
  it('returns null when hours were skipped', () => {
    expect(parseSchedule('')).toBeNull()
    expect(parseSchedule(undefined)).toBeNull()
    expect(parseSchedule(null)).toBeNull()
  })

  it('returns null for invalid JSON instead of throwing', () => {
    expect(parseSchedule('{not json')).toBeNull()
  })

  it('sorts parsed days by weekday', () => {
    const raw = JSON.stringify([
      { weekday: 6, startTime: '10:00', endTime: '14:00', closed: false },
      { weekday: 2, startTime: '09:00', endTime: '17:00', closed: false },
    ])
    const parsed = parseSchedule(raw)
    expect(parsed?.map((day) => day.weekday)).toEqual([2, 6])
  })
})

describe('scheduleSummary', () => {
  it('summarises a uniform week', () => {
    expect(scheduleSummary(DEFAULT_SCHEDULE, 'en')).toBe('6/7 · 09:00–17:00')
  })

  it('flags varying hours', () => {
    const days = cloneDefaultSchedule().map((day) =>
      day.weekday === 0 ? { ...day, startTime: '10:00' } : day
    )
    expect(scheduleSummary(days, 'en')).toBe('6/7 · Varying hours')
  })

  it('handles a fully closed week', () => {
    const days = DEFAULT_SCHEDULE.map((day) => ({ ...day, closed: true }))
    expect(scheduleSummary(days, 'en')).toBe('All days closed')
    expect(scheduleSummary(days, 'ar')).toBe('كل الأيام مغلقة')
  })
})

describe('weekdayLabel', () => {
  it('localises both directions', () => {
    expect(weekdayLabel(5, 'en')).toBe('Friday')
    expect(weekdayLabel(5, 'ar')).toBe('الجمعة')
  })
})
