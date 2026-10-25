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

  it('scopes the service lookup strictly to access.tenant.id', () => {
    expect(actionsCode).toContain('eq(services.tenantId, access.tenant.id)')
  })

  it('carries no staff assignment in its input contract', () => {
    // Bookings are tenant-scoped, not staff-scoped. The INPUT contract carries
    // no staff dependency: the modal never sends a staffId, the zod schema never
    // parses one, and the handler never reads one from the payload.
    // (The booking_items WRITE does state `staffId: null` explicitly — that is
    // asserted separately below.)
    expect(actionsCode).not.toContain('assignedStaffId')
    expect(actionsCode).not.toContain('STAFF_BUSY')
    expect(actionsCode).not.toContain('eq(staff.tenantId, access.tenant.id)')
    // The zod input schema accepts no staff id.
    const schemaStart = actionsCode.indexOf('const manualBookingSchema = z.object(')
    const schemaEnd = actionsCode.indexOf('})', schemaStart)
    expect(schemaStart).toBeGreaterThan(-1)
    expect(actionsCode.slice(schemaStart, schemaEnd)).not.toContain('staffId')
    // ...and the request payload is never read for one.
    expect(actionsCode).not.toMatch(/data\.staffId/)
  })

  it('explicitly writes staffId: null, matching the public booking path', () => {
    // Unassigned staff is stated EXPLICITLY rather than omitted, so both write
    // paths represent "no staff assigned" the same way and the contract is
    // assertable. Under migration 0012 the column is nullable.
    const itemWrite = actionsCode.slice(actionsCode.indexOf('tx.insert(bookingItems)'))
    expect(itemWrite).toContain('staffId: null')
    // The ONLY staffId occurrence in the whole file is that explicit null.
    expect(actionsCode.match(/staffId/g) ?? []).toHaveLength(1)
  })

  it('enforces tenant-level capacity instead of a staff overlap check', () => {
    expect(actionsCode).toContain('assertTenantBookingCapacity(')
    expect(actionsCode).not.toContain('eq(bookingItems.staffId,')
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

  it('enforces tenant booking capacity inside database transaction', () => {
    expect(actionsCode).toContain('assertTenantBookingCapacity(')
    expect(actionsCode).toContain('TENANT_CAPACITY_EXCEEDED')
  })

  it('does not auto-provision dummy staff or run active staff availability loop', () => {
    expect(actionsCode).not.toContain('for (const candidate of activeStaff)')
    expect(actionsCode).not.toContain('const [newStaff] = await db')
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
