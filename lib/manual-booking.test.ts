import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8').replace(/\r\n/g, '\n')
const actionsCode = read('../app/[locale]/tenants/[slug]/dashboard/booking-actions.ts')
const modalCode = read('../components/manual-booking-modal.tsx')
const dashboardPage = read('../app/[locale]/tenants/[slug]/dashboard/page.tsx')

describe('manual booking action security and validation contract', () => {
  it('declares createManualBooking as a server action with tenant access enforcement', () => {
    expect(actionsCode).toContain('export async function createManualBooking')
    expect(actionsCode).toContain("requireTenantAccess(await headers(), data.slug, 'receptionist')")
  })

  it('scopes service and staff lookup strictly to access.tenant.id', () => {
    expect(actionsCode).toContain('eq(services.tenantId, access.tenant.id)')
    expect(actionsCode).toContain('eq(staff.tenantId, access.tenant.id)')
  })

  it('checks for staff schedule overlap conflicts before inserting', () => {
    expect(actionsCode).toContain('eq(bookingItems.staffId, assignedStaffId)')
    expect(actionsCode).toContain("not(eq(bookings.status, 'cancelled'))")
    expect(actionsCode).toContain('lt(bookingItems.blockStartsAt, blockEnd)')
    expect(actionsCode).toContain('gt(bookingItems.blockEndsAt, blockStart)')
  })

  it('normalizes Egyptian local phone numbers to E164 (+2)', () => {
    expect(actionsCode).toContain('/^01[0125]\\d{8}$/.test(cleanPhone)')
  })

  it('sets source as dashboard and records createdByUserId', () => {
    expect(actionsCode).toContain("source: 'dashboard'")
    expect(actionsCode).toContain('createdByUserId: access.session.user.id')
  })

  it('creates an audit log entry with booking.created_manually', () => {
    expect(actionsCode).toContain("action: 'booking.created_manually'")
    expect(actionsCode).toContain('entityType: \'booking\'')
    expect(actionsCode).toContain('tenantId: access.tenant.id')
  })
})

describe('manual booking modal UI contract', () => {
  it('renders with accessible modal dialog attributes and escape handling', () => {
    expect(modalCode).toContain('role="dialog"')
    expect(modalCode).toContain('aria-modal="true"')
    expect(modalCode).toContain("e.key === 'Escape'")
  })

  it('provides localized labels for Arabic and English', () => {
    expect(modalCode).toContain("rtl ? 'حجز يدوي جديد' : 'New Booking'")
    expect(modalCode).toContain("rtl ? 'تسجيل حجز يدوي' : 'New Manual Booking'")
    expect(modalCode).toContain("rtl ? 'بيانات العميل' : 'Customer Details'")
    expect(modalCode).toContain("rtl ? 'الخدمة والموعد' : 'Service & Time'")
  })

  it('does not expose employee assignment selector in manual booking', () => {
    expect(modalCode).not.toContain("rtl ? 'الموظف المسند إليه' : 'Assigned Staff'")
  })

  it('is integrated in dashboard page bookings tab', () => {
    expect(dashboardPage).toContain("import { ManualBookingModal } from '@/components/manual-booking-modal'")
    expect(dashboardPage).toContain('<ManualBookingModal')
  })
})
