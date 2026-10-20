import { describe, expect, it } from 'vitest'
import {
  ALL_BOOKING_STATUSES,
  statusColors,
  statusText,
  getStatusColor,
  getStatusLabel,
  type BookingStatus,
} from './booking-status'

describe('booking-status mapping completeness', () => {
  const expectedStatuses: BookingStatus[] = [
    'pending',
    'confirmed',
    'completed',
    'cancelled',
    'no_show',
  ]

  it('lists all 5 booking status enum values', () => {
    expect(ALL_BOOKING_STATUSES.sort()).toEqual(expectedStatuses.sort())
  })

  it('provides a color class for every status without missing keys', () => {
    for (const status of ALL_BOOKING_STATUSES) {
      expect(statusColors[status]).toBeDefined()
      expect(statusColors[status].trim().length).toBeGreaterThan(0)
      expect(getStatusColor(status)).toBe(statusColors[status])
    }
  })

  it('provides non-empty Arabic and English labels for every status', () => {
    for (const status of ALL_BOOKING_STATUSES) {
      const labels = statusText[status]
      expect(labels).toBeDefined()
      expect(labels.ar).toBeDefined()
      expect(labels.ar.trim().length).toBeGreaterThan(0)
      expect(labels.en).toBeDefined()
      expect(labels.en.trim().length).toBeGreaterThan(0)

      expect(getStatusLabel(status, 'ar')).toBe(labels.ar)
      expect(getStatusLabel(status, 'en')).toBe(labels.en)
    }
  })

  it('returns fallback gracefully for unknown status', () => {
    expect(getStatusColor('unknown_status' as any)).toBe(statusColors.confirmed)
    expect(getStatusLabel('unknown_status' as any, 'ar')).toBe('unknown_status')
    expect(getStatusLabel('unknown_status' as any, 'en')).toBe('unknown_status')
  })
})
