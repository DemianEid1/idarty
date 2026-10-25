/**
 * booking-creator-display.test.ts
 *
 * Verifies the "Responsible Employee / الموظف المسؤول" feature:
 * - Manual (dashboard-sourced) bookings show the authenticated creator name.
 * - The creator lookup is scoped to the current tenant.
 * - The fallback chain is clean and correct (no duplicate entries).
 * - The assigned service employee (bookingItems.staffId) is distinct from the creator.
 * - Public/online bookings do NOT show the creator field in the UI.
 * - Calendar and dashboard pages produce consistent results.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8').replace(/\r\n/g, '\n')

const dashboardPage  = read('../app/[locale]/tenants/[slug]/dashboard/page.tsx')
const calendarPage   = read('../app/[locale]/tenants/[slug]/calendar/page.tsx')
const calendarView   = read('../components/calendar-view.tsx')
const bookingActions = read('../app/[locale]/tenants/[slug]/dashboard/booking-actions.ts')

// ---------------------------------------------------------------------------
// 1.1 — createdByUserId is persisted from the authenticated user
// ---------------------------------------------------------------------------
describe('booking-creator: server action persistence', () => {
  it('createManualBooking sets source=dashboard and createdByUserId=access.session.user.id', () => {
    expect(bookingActions).toContain("source: 'dashboard'")
    expect(bookingActions).toContain('createdByUserId: access.session.user.id')
  })

  it('createManualBooking enforces tenant access at receptionist level before writing', () => {
    expect(bookingActions).toContain("requireTenantAccess(await headers(), data.slug, 'receptionist')")
  })

  it('every write of createdByUserId comes from the authenticated session, not user input', () => {
    const lines = bookingActions.split('\n').filter((l) => l.includes('createdByUserId'))
    for (const line of lines) {
      expect(line).toContain('access.session.user.id')
    }
  })
})

// ---------------------------------------------------------------------------
// 1.2 — Creator lookup is scoped to the current tenant
// ---------------------------------------------------------------------------
describe('booking-creator: tenant isolation in dashboard page', () => {
  it('list view: creator membership join is pinned to access.tenant.id', () => {
    expect(dashboardPage).toContain('eq(creatorMembership.tenantId, access.tenant.id)')
  })

  it('list view: creator staff join is pinned to access.tenant.id', () => {
    expect(dashboardPage).toContain('eq(creatorStaff.tenantId, access.tenant.id)')
  })

  it('calendar embed: creator membership join is pinned to access.tenant.id', () => {
    expect(dashboardPage).toContain('eq(calCreatorMembership.tenantId, access.tenant.id)')
  })

  it('calendar embed: creator staff join is pinned to access.tenant.id', () => {
    expect(dashboardPage).toContain('eq(calCreatorStaff.tenantId, access.tenant.id)')
  })
})

describe('booking-creator: tenant isolation in standalone calendar page', () => {
  it('creator membership join is pinned to access.tenant.id', () => {
    expect(calendarPage).toContain('eq(calCreatorMembership.tenantId, access.tenant.id)')
  })

  it('creator staff join is pinned to access.tenant.id', () => {
    expect(calendarPage).toContain('eq(calCreatorStaff.tenantId, access.tenant.id)')
  })
})

// ---------------------------------------------------------------------------
// 1.3 — Multiple memberships: join chain goes through membershipId
// ---------------------------------------------------------------------------
describe('booking-creator: multi-tenant membership resolution chain', () => {
  it('dashboard list: chains user->membership->staff (not userId directly to staff)', () => {
    expect(dashboardPage).toContain('eq(creatorUser.id, bookings.createdByUserId)')
    expect(dashboardPage).toContain('eq(creatorMembership.userId, creatorUser.id)')
    expect(dashboardPage).toContain('eq(creatorStaff.membershipId, creatorMembership.id)')
  })

  it('calendar page: same chain user->membership->staff', () => {
    expect(calendarPage).toContain('eq(calCreatorUser.id, bookings.createdByUserId)')
    expect(calendarPage).toContain('eq(calCreatorMembership.userId, calCreatorUser.id)')
    expect(calendarPage).toContain('eq(calCreatorStaff.membershipId, calCreatorMembership.id)')
  })
})

// ---------------------------------------------------------------------------
// 1.4 — Locale-aware staff translation fallback
// ---------------------------------------------------------------------------
describe('booking-creator: locale fallback for creator staff translation', () => {
  it('dashboard list: joins primary locale and fallback locale for creator staff translations', () => {
    expect(dashboardPage).toContain('eq(creatorStaffTranslations.locale, locale)')
    expect(dashboardPage).toContain('eq(fallbackCreatorStaffTranslations.locale, fallbackLocale)')
  })

  it('calendar page: same locale + fallback for creator staff translations', () => {
    expect(calendarPage).toContain('eq(calCreatorStaffTranslations.locale, locale)')
    expect(calendarPage).toContain('eq(calFallbackCreatorStaffTranslations.locale, fallbackLocale)')
  })
})

// ---------------------------------------------------------------------------
// 1.5 — Fallback chain correctness (no duplicates, email-guard present)
// ---------------------------------------------------------------------------
describe('booking-creator: createdByName fallback chain correctness', () => {
  it('dashboard list chain: creatorStaffName appears before fallback staff name (priority order)', () => {
    const staffIdx     = dashboardPage.indexOf('r.creatorStaffName ||')
    const fallbackIdx  = dashboardPage.indexOf('r.fallbackCreatorStaffName ||')
    const userNameIdx  = dashboardPage.indexOf("r.creatorUserName && !r.creatorUserName.includes('@')")
    const emailIdx     = dashboardPage.indexOf('r.creatorUserEmail ||')
    expect(staffIdx).toBeGreaterThan(-1)
    expect(fallbackIdx).toBeGreaterThan(staffIdx)
    expect(userNameIdx).toBeGreaterThan(fallbackIdx)
    expect(emailIdx).toBeGreaterThan(userNameIdx)
  })

  it('dashboard list chain: creatorStaffName does not appear as a dead duplicate', () => {
    // Count how many times it appears in the mapping block (after all select projections)
    // In a clean chain it should appear exactly once in the || chain
    const mapBlock = dashboardPage.slice(dashboardPage.indexOf('bookingListRows = bRows.map'))
    const count = (mapBlock.match(/r\.creatorStaffName/g) ?? []).length
    expect(count).toBe(1)
  })

  it('calendar page chain: creatorStaffName does not appear as a dead duplicate', () => {
    const mapBlock = calendarPage.slice(calendarPage.indexOf('aggregatedBookings: CalendarBooking[] = bookingRows.map'))
    const count = (mapBlock.match(/b\.creatorStaffName/g) ?? []).length
    expect(count).toBe(1)
  })

  it('email-check guard prevents plain email addresses surfacing as creator name', () => {
    expect(dashboardPage).toContain("!r.creatorUserName.includes('@')")
    expect(calendarPage).toContain("!b.creatorUserName.includes('@')")
  })
})

// ---------------------------------------------------------------------------
// 1.6 — Creator is distinct from the assigned service staff
// ---------------------------------------------------------------------------
describe('booking-creator: creator vs assigned service staff distinction', () => {
  it('bookingItems stores no assigned service staff; bookings stores createdByUserId (creator)', () => {
    // Item-level staff assignment was removed: bookings are tenant-scoped.
    expect(bookingActions).not.toContain('staffId: assignedStaffId')
    expect(bookingActions).toContain('createdByUserId: access.session.user.id')
  })

  it('dashboard list uses aliased tables for creator path to avoid cross-join with item staff', () => {
    expect(dashboardPage).toContain("aliasedTable(user, 'dash_b_creator_user')")
    expect(dashboardPage).toContain("aliasedTable(memberships, 'dash_b_creator_membership')")
    expect(dashboardPage).toContain("aliasedTable(staff, 'dash_b_creator_staff')")
  })

  it('calendar page uses aliased tables for creator path to avoid cross-join with item staff', () => {
    expect(calendarPage).toContain("aliasedTable(user, 'cal_page_creator_user')")
    expect(calendarPage).toContain("aliasedTable(memberships, 'cal_page_creator_membership')")
    expect(calendarPage).toContain("aliasedTable(staff, 'cal_page_creator_staff')")
  })

  it('CalendarBooking interface has createdByName and no item staffName', () => {
    // Item-level staff assignment was removed; the booking item shape no longer
    // carries staffName. The creator name is still a separate top-level field.
    expect(calendarView).toContain('createdByName?: string | null')
    expect(calendarView).not.toContain('staffName: string')
  })
})

// ---------------------------------------------------------------------------
// 1.7 — Public bookings do NOT show the creator field
// ---------------------------------------------------------------------------
describe('booking-creator: public bookings do not show creator field', () => {
  it("modal gates creator display behind source === 'dashboard'", () => {
    expect(calendarView).toContain("selectedBooking.source === 'dashboard'")
  })

  it('modal also requires createdByName to be truthy before rendering', () => {
    expect(calendarView).toContain(
      "selectedBooking.source === 'dashboard' && selectedBooking.createdByName"
    )
  })

  it("createdByName render block appears after the source === 'dashboard' guard", () => {
    const sourceIdx = calendarView.indexOf("selectedBooking.source === 'dashboard'")
    const nameIdx   = calendarView.indexOf('selectedBooking.createdByName', sourceIdx)
    expect(nameIdx).toBeGreaterThan(sourceIdx)
  })
})

// ---------------------------------------------------------------------------
// 1.8 — Dashboard and calendar produce consistent field shapes
// ---------------------------------------------------------------------------
describe('booking-creator: dashboard <-> calendar consistency', () => {
  it('both pages select createdByUserId from bookings', () => {
    expect(dashboardPage).toContain('createdByUserId: bookings.createdByUserId')
    expect(calendarPage).toContain('createdByUserId: bookings.createdByUserId')
  })

  it('both pages forward createdByUserId and createdByName into the CalendarBooking shape', () => {
    expect(dashboardPage).toContain('createdByUserId: b.createdByUserId')
    expect(dashboardPage).toContain('createdByName,')
    expect(calendarPage).toContain('createdByUserId: b.createdByUserId')
    expect(calendarPage).toContain('createdByName,')
  })

  it('CalendarBooking interface accepts both fields as optional nullable', () => {
    expect(calendarView).toContain('createdByUserId?: string | null')
    expect(calendarView).toContain('createdByName?: string | null')
  })

  it('responsible staff label is localized: Arabic and English', () => {
    expect(calendarView).toContain("rtl ? '\u0627\u0644\u0645\u0648\u0638\u0641 \u0627\u0644\u0645\u0633\u0624\u0648\u0644:' : 'Responsible staff:'")
  })
})

// ---------------------------------------------------------------------------
// 1.9 — All creator joins are LEFT JOINs (null-safe if creator data is missing)
// ---------------------------------------------------------------------------
describe('booking-creator: graceful null handling via LEFT JOINs', () => {
  it('dashboard list: all four creator joins are leftJoin', () => {
    expect(dashboardPage).toContain('.leftJoin(creatorUser, eq(creatorUser.id, bookings.createdByUserId))')
    expect(dashboardPage).toContain('.leftJoin(\n            creatorMembership,')
    expect(dashboardPage).toContain('.leftJoin(\n            creatorStaff,')
    expect(dashboardPage).toContain('.leftJoin(\n            creatorStaffTranslations,')
    expect(dashboardPage).toContain('.leftJoin(\n            fallbackCreatorStaffTranslations,')
  })

  it('calendar page: all four creator joins are leftJoin', () => {
    expect(calendarPage).toContain('.leftJoin(calCreatorUser, eq(calCreatorUser.id, bookings.createdByUserId))')
    expect(calendarPage).toContain('.leftJoin(\n      calCreatorMembership,')
    expect(calendarPage).toContain('.leftJoin(\n      calCreatorStaff,')
    expect(calendarPage).toContain('.leftJoin(\n      calCreatorStaffTranslations,')
    expect(calendarPage).toContain('.leftJoin(\n      calFallbackCreatorStaffTranslations,')
  })
})

// ---------------------------------------------------------------------------
// 1.10 — Obsolete service performer labels are fully removed from booking UI
// ---------------------------------------------------------------------------
describe('booking-creator: service performer decoupling UI contract', () => {
  it('dashboard booking items list does NOT contain obsolete مقدم الخدمة label', () => {
    expect(dashboardPage).not.toContain('مقدم الخدمة')
  })

  it('calendar booking details modal does NOT contain obsolete المسند إليه label', () => {
    expect(calendarView).not.toContain('المسند إليه')
  })

  it('dashboard booking items list renders duration and start/end times cleanly', () => {
    expect(dashboardPage).toContain("{item.durationMin} {rtl ? 'دقيقة' : 'min'}")
  })

  it('manual booking creator is rendered under Additional Details section', () => {
    expect(dashboardPage).toContain("b.source === 'dashboard' && b.createdByName")
    expect(dashboardPage).toContain("rtl ? 'الموظف المسؤول: ' : 'Responsible staff: '")
  })
})

