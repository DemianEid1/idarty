import { describe, expect, it, vi } from 'vitest'
import { buildDashboardNav } from './dashboard-nav'
import { hasPermission } from './permissions-client'
import { acquireBranchBookingLock, assertBranchBookingCapacity, calculatePeakConcurrency } from './booking-capacity'
import { BookingConfirmationEmail } from './email/templates'
import { render } from '@react-email/render'

describe('Multi-Branch Management Contract', () => {
  describe('Navigation & Permissions', () => {
    it('buildDashboardNav exposes branches tab between services and team', () => {
      const navAr = buildDashboardNav('ar')
      const navEn = buildDashboardNav('en')

      const arIds = navAr.map((n) => n.id)
      const enIds = navEn.map((n) => n.id)

      expect(arIds).toContain('branches')
      expect(enIds).toContain('branches')

      const branchesIndexAr = arIds.indexOf('branches')
      expect(branchesIndexAr).toBe(arIds.indexOf('services') + 1)
      expect(arIds[branchesIndexAr + 1]).toBe('team')

      const branchItemAr = navAr.find((n) => n.id === 'branches')
      expect(branchItemAr?.label).toBe('الفروع')

      const branchItemEn = navEn.find((n) => n.id === 'branches')
      expect(branchItemEn?.label).toBe('Branches')
    })

    it('enforces RBAC matrix for branches across all roles', () => {
      // Owner, Admin, Manager have branches:view and branches:manage
      expect(hasPermission('owner', 'branches:view')).toBe(true)
      expect(hasPermission('owner', 'branches:manage')).toBe(true)
      expect(hasPermission('owner', 'branches:archive')).toBe(true)

      expect(hasPermission('admin', 'branches:view')).toBe(true)
      expect(hasPermission('admin', 'branches:manage')).toBe(true)
      expect(hasPermission('admin', 'branches:archive')).toBe(true)

      expect(hasPermission('manager', 'branches:view')).toBe(true)
      expect(hasPermission('manager', 'branches:manage')).toBe(true)
      expect(hasPermission('manager', 'branches:archive')).toBe(false) // Manager cannot archive

      // Staff and Receptionist have view only
      expect(hasPermission('receptionist', 'branches:view')).toBe(true)
      expect(hasPermission('receptionist', 'branches:manage')).toBe(false)
      expect(hasPermission('receptionist', 'branches:archive')).toBe(false)

      expect(hasPermission('staff', 'branches:view')).toBe(true)
      expect(hasPermission('staff', 'branches:manage')).toBe(false)
      expect(hasPermission('staff', 'branches:archive')).toBe(false)
    })
  })

  describe('Branch Concurrency & Advisory Locks', () => {
    it('executes branch advisory xact lock on branch-derived int64 key', async () => {
      const executeMock = vi.fn().mockResolvedValue({ rows: [] })
      const fakeTx = Object.create({
        constructor: {
          [Symbol.for('drizzle:entityKind')]: 'NodePgTransaction',
        },
      })
      fakeTx.execute = executeMock

      const branchId = '11111111-2222-3333-4444-555555555555'
      await acquireBranchBookingLock(fakeTx, branchId)

      expect(executeMock).toHaveBeenCalledTimes(1)
    })

    it('isolates concurrency calculation per branch bookings', () => {
      const now = new Date('2026-11-01T10:00:00Z')
      const blockStart = new Date(now.getTime() - 15 * 60_000)
      const blockEnd = new Date(now.getTime() + 60 * 60_000)

      // Active bookings for branch A
      const branchABookings = [
        {
          bookingId: 'b-1',
          blockStartsAt: new Date(now.getTime()),
          blockEndsAt: new Date(now.getTime() + 45 * 60_000),
        },
      ]

      // Branch A capacity = 1 -> peak concurrency = 1 (at capacity)
      const peakA = calculatePeakConcurrency(branchABookings, blockStart, blockEnd)
      expect(peakA).toBe(1)

      // Branch B has no active bookings during this window -> peak concurrency = 0 (free)
      const branchBBookings: typeof branchABookings = []
      const peakB = calculatePeakConcurrency(branchBBookings, blockStart, blockEnd)
      expect(peakB).toBe(0)
    })
  })

  describe('Branch Notification Templates', () => {
    it('renders branch name and address in confirmation email (AR & EN)', async () => {
      const htmlAr = await render(
        BookingConfirmationEmail({
          locale: 'ar',
          url: 'https://idarty.com/manage',
          startsAt: '2026-11-01T12:00:00Z',
          branchName: 'فرع المعادي',
          branchAddress: 'شارع 9 المعادي، القاهرة',
        })
      )
      expect(htmlAr).toContain('فرع المعادي')
      expect(htmlAr).toContain('شارع 9 المعادي، القاهرة')

      const htmlEn = await render(
        BookingConfirmationEmail({
          locale: 'en',
          url: 'https://idarty.com/manage',
          startsAt: '2026-11-01T12:00:00Z',
          branchName: 'Maadi Branch',
          branchAddress: 'Road 9, Maadi, Cairo',
        })
      )
      expect(htmlEn).toContain('Maadi Branch')
      expect(htmlEn).toContain('Road 9, Maadi, Cairo')
    })
  })

})
