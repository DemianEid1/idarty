import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { aliasedTable, and, count, desc, eq, gte, inArray, isNotNull, isNull, lt, not } from 'drizzle-orm'
import { Activity, CalendarDays, CheckCircle2, ClipboardList, Pencil, Plus, Settings2, ShieldCheck, Users } from 'lucide-react'
import { requireTenantAccess } from '@/lib/authz'
import { dashboardCopy } from '@/lib/dashboard-nav'
import { db } from '@/lib/db'
import { auditLogs, bookingItems, bookings, customers, services } from '@/lib/db/schema'
import type { Locale } from '@/lib/i18n'
import { serviceTranslations, websiteConfig } from '@/lib/db/schema'
import { safeParseWebsiteConfig } from '@/lib/website-config'
import { WebsiteEditor } from '@/components/website-editor'
import { ServiceForm } from '@/components/service-form'
import { ServiceDeleteButton } from '@/components/service-delete-button'
import { ServiceEditForm } from '@/components/service-edit-form'
import { WorkingHoursForm } from '@/components/working-hours-form'
import { BookingStatusActions } from '@/components/booking-status-actions'
import { StaffForm } from '@/components/staff-form'
import { StaffEditForm } from '@/components/staff-edit-form'
import { StaffArchiveButton } from '@/components/staff-archive-button'
import { TeamRolesMatrix } from '@/components/team-roles-matrix'
import { TeamActivityFeed } from '@/components/team-activity-feed'
import { UserProfileSettings } from '@/components/user-profile-settings'
import { StaffDetailsDrawer } from '@/components/staff-details-drawer'
import { StaffDetailsButton } from '@/components/staff-details-button'
import { hasPermission } from '@/lib/permissions-client'
import type { MemberRole } from '@/lib/authz'
import { DateOverrideForm, DateOverrideDeleteButton } from '@/components/date-override-form'
import { SignOutButton } from '@/components/sign-out-button'
import { PublicWebsiteLink } from '@/components/public-website-link'
import { publicTenantUrl } from '@/lib/routes'
import { OnboardingSuccess } from '@/components/onboarding-success'
import { dateOverrides, memberships, staff, staffTranslations, tenantInvitations, tenantTranslations, user, workingHours } from '@/lib/db/schema'
import { WorkspaceSettingsForm } from '@/components/workspace-settings-form'
import { ServiceImageForm } from '@/components/service-image-form'
import { serviceFocalPoint, numericCrop } from '@/lib/image-focal-point'
import { isBusinessType } from '@/lib/business-types'
import { ALL_BOOKING_STATUSES, getStatusColor, getStatusLabel, statusColors, statusText } from '@/lib/booking-status'
import { ManualBookingModal } from '@/components/manual-booking-modal'
import { CalendarView, type CalendarBooking, type CalendarBookingItem } from '@/components/calendar-view'
import {
  bucketBookingsByDay,
  formatDateParam,
  getWeekDays,
  getWeekRange,
  parseStartDate,
} from '@/lib/calendar-helpers'


export default async function TenantDashboard(props: {
  params: Promise<{ locale: Locale; slug: string }>
  searchParams: Promise<{
    tab?: string
    page?: string
    status?: string
    view?: string
    start?: string
    sub?: string
    actor?: string
    staffId?: string
  }>
}) {
  const { locale, slug } = await props.params
  const searchParams = await props.searchParams
  const tab = searchParams.tab || 'overview'
  const sub = searchParams.sub || 'members'
  const staffId = searchParams.staffId
  const actorFilter = searchParams.actor || 'all'
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1)
  const statusFilter = searchParams.status || 'all'
  const view = searchParams.view === 'calendar' ? 'calendar' : 'list'
  const pageSize = 12
  const rtl = locale === 'ar'
  const t = dashboardCopy[locale]
  let access
  try {
    access = await requireTenantAccess(await headers(), slug)
  } catch {
    redirect(`/${locale}/login`)
  }

  if (access.tenant.status === 'suspended') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-6 text-center text-[#172033]" dir={rtl ? 'rtl' : 'ltr'}>
        <div className="max-w-md space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
            <Settings2 className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">{rtl ? 'حسابك معلق' : 'Account Suspended'}</h1>
          <p className="text-ink-muted">
            {rtl
              ? 'تم تعليق مساحة العمل هذه. يرجى التواصل مع الدعم الفني لاستعادة الوصول.'
              : 'This workspace has been suspended. Please contact support to restore access.'}
          </p>
          <div className="pt-4">
            <SignOutButton label={rtl ? 'تسجيل الخروج' : 'Sign out'} locale={locale} />
          </div>
        </div>
      </div>
    )
  }

  const role = access.membership.role

  // Layer 2 — URL / route protection: redirect restricted roles away from tabs
  // they cannot access even if they craft the URL manually.
  const RESTRICTED_TABS_RECEPTIONIST = new Set(['team', 'website', 'settings'])
  const RESTRICTED_TABS_STAFF        = new Set(['customers', 'team', 'website', 'settings'])

  if (
    (role === 'receptionist' && RESTRICTED_TABS_RECEPTIONIST.has(tab)) ||
    (role === 'staff'        && RESTRICTED_TABS_STAFF.has(tab))
  ) {
    redirect(`/${locale}/tenants/${slug}/dashboard?tab=overview`)
  }

  // Allow receptionist / staff to reach their own profile inside settings.
  // ?tab=settings&sub=profile or ?tab=settings&sub=security are the only
  // permitted sub-paths — everything else redirects above.
  if (
    tab === 'settings' &&
    (role === 'receptionist' || role === 'staff') &&
    sub !== 'profile' && sub !== 'security'
  ) {
    redirect(`/${locale}/tenants/${slug}/dashboard?tab=settings&sub=profile`)
  }

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(startOfDay)
  endOfDay.setDate(endOfDay.getDate() + 1)
  const endOfWeek = new Date(startOfDay)
  endOfWeek.setDate(endOfWeek.getDate() + 7)
  // Calendar month boundary, for the "completed this month" stat. Both dates
  // are local-time midnights so the comparison matches how the dashboard already
  // buckets "today".
  const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1)
  const startOfNextMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth() + 1, 1)

  const fallbackLocale = locale === 'ar' ? 'en' : 'ar'
  const fallbackServiceTranslations = aliasedTable(serviceTranslations, 'fallback_dash_service_translations')
  const fallbackStaffTranslations = aliasedTable(staffTranslations, 'fallback_dash_staff_translations')

  const [appointmentCount, customerCount, serviceCount, completedThisMonthCount, customerRows, todayBookings, upcomingBookings, serviceRows, hoursRows, staffRows, overrideRows, tenantTranslation, serviceBookingCounts, pendingInviteRows] = await Promise.all([
    db.select({ value: count() }).from(bookings).where(and(eq(bookings.tenantId, access.tenant.id), gte(bookings.startsAt, startOfDay), lt(bookings.startsAt, endOfDay), not(eq(bookings.status, 'cancelled')))),
    db.select({ value: count() }).from(customers).where(eq(customers.tenantId, access.tenant.id)),
    db.select({ value: count() }).from(services).where(and(eq(services.tenantId, access.tenant.id), eq(services.isActive, true))),
    db.select({ value: count() }).from(bookings).where(and(eq(bookings.tenantId, access.tenant.id), eq(bookings.status, 'completed'), gte(bookings.startsAt, startOfMonth), lt(bookings.startsAt, startOfNextMonth))),
    db.select({ id: customers.id, name: customers.fullName, phone: customers.phoneE164, email: customers.email, createdAt: customers.createdAt }).from(customers).where(and(eq(customers.tenantId, access.tenant.id), isNull(customers.deletedAt))).orderBy(desc(customers.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ id: bookings.id, startsAt: bookings.startsAt, status: bookings.status, name: customers.fullName }).from(bookings).innerJoin(customers, eq(customers.id, bookings.customerId)).where(and(eq(bookings.tenantId, access.tenant.id), gte(bookings.startsAt, startOfDay), lt(bookings.startsAt, endOfDay), not(eq(bookings.status, 'cancelled')))).orderBy(bookings.startsAt),
    db.select({ id: bookings.id, startsAt: bookings.startsAt, status: bookings.status, name: customers.fullName }).from(bookings).innerJoin(customers, eq(customers.id, bookings.customerId)).where(and(eq(bookings.tenantId, access.tenant.id), gte(bookings.startsAt, endOfDay), lt(bookings.startsAt, endOfWeek), not(eq(bookings.status, 'cancelled')))).orderBy(bookings.startsAt).limit(10),
    db.select({
      id: services.id,
      durationMin: services.durationMin,
      priceAmount: services.priceAmount,
      name: serviceTranslations.name,
      fallbackName: fallbackServiceTranslations.name,
      image: services.image,
      imageFocalX: services.imageFocalX,
      imageFocalY: services.imageFocalY,
      imageCropX: services.imageCropX,
      imageCropY: services.imageCropY,
      imageCropWidth: services.imageCropWidth,
      imageCropHeight: services.imageCropHeight,
    })
      .from(services)
      .leftJoin(serviceTranslations, and(eq(serviceTranslations.serviceId, services.id), eq(serviceTranslations.locale, locale)))
      .leftJoin(fallbackServiceTranslations, and(eq(fallbackServiceTranslations.serviceId, services.id), eq(fallbackServiceTranslations.locale, fallbackLocale)))
      .where(and(eq(services.tenantId, access.tenant.id), eq(services.isActive, true)))
      .orderBy(services.sortOrder),
    db.select({ weekday: workingHours.weekday, startTime: workingHours.startTime, endTime: workingHours.endTime }).from(workingHours).where(and(eq(workingHours.tenantId, access.tenant.id), isNull(workingHours.staffId))),
    db.select({
      id: staff.id,
      name: staffTranslations.name,
      fallbackName: fallbackStaffTranslations.name,
      email: staff.email,
      phone: staff.phoneE164,
      role: staff.role,
      membershipId: staff.membershipId,
      userId: memberships.userId,
      ownerUserName: user.name,
    })
      .from(staff)
      .leftJoin(staffTranslations, and(eq(staffTranslations.staffId, staff.id), eq(staffTranslations.locale, locale)))
      .leftJoin(fallbackStaffTranslations, and(eq(fallbackStaffTranslations.staffId, staff.id), eq(fallbackStaffTranslations.locale, fallbackLocale)))
      .leftJoin(memberships, eq(memberships.id, staff.membershipId))
      .leftJoin(user, eq(user.id, memberships.userId))
      .where(and(eq(staff.tenantId, access.tenant.id), eq(staff.isActive, true), isNull(staff.deletedAt)))
      .orderBy(staff.sortOrder),
    db.select({ id: dateOverrides.id, startDate: dateOverrides.startDate, endDate: dateOverrides.endDate, kind: dateOverrides.kind, label: dateOverrides.label, startTime: dateOverrides.startTime, endTime: dateOverrides.endTime }).from(dateOverrides).where(and(eq(dateOverrides.tenantId, access.tenant.id), isNull(dateOverrides.staffId))).orderBy(dateOverrides.startDate),
    db.query.tenantTranslations.findFirst({ where: and(eq(tenantTranslations.tenantId, access.tenant.id), eq(tenantTranslations.locale, locale)) }),
    // Booking counts per service, so the delete confirmation can state the real
    // consequence before the tenant commits. Derived from data the page already
    // has access to — one grouped query, no per-row round trip.
    db.select({ serviceId: bookingItems.serviceId, value: count() }).from(bookingItems).where(eq(bookingItems.tenantId, access.tenant.id)).groupBy(bookingItems.serviceId),
    db.select({ staffId: tenantInvitations.staffId }).from(tenantInvitations).where(and(eq(tenantInvitations.tenantId, access.tenant.id), isNull(tenantInvitations.acceptedAt))),
  ])

  const pendingInviteStaffIds = new Set(pendingInviteRows.map((r) => r.staffId))

  const bookingsByService = new Map(serviceBookingCounts.map((r) => [r.serviceId, r.value]))

  let bookingListRows: Array<{
    id: string
    startsAt: Date
    endsAt: Date
    status: string
    source: string
    customerNote: string | null
    internalNote: string | null
    cancelReason: string | null
    createdAt: Date
    customerName: string
    customerPhone: string
    customerEmail: string | null
    createdByUserId?: string | null
    createdByName?: string | null
  }> = []
  let totalBookingsCount = 0
  const itemsByBooking = new Map<
    string,
    Array<{
      id: string
      serviceName: string
      durationMin: number
      priceAmount: string
      startsAt: Date
      endsAt: Date
    }>
  >()

  let calData: {
    startDateParam: string
    days: Date[]
    bookingsByDayRecord: Record<string, CalendarBooking[]>
    totalBookingsCount: number
    statusParam: string
  } | null = null

  let workspaceAuditLogs: Array<{
    id: number
    action: string
    entityType: string
    entityId: string | null
    metadata: Record<string, unknown>
    actorUserId: string | null
    actorName?: string | null
    actorRole?: MemberRole | null
    createdAt: Date
  }> = []

  if (tab === 'team' && sub === 'activity') {
    const rawLogs = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        actorUserId: auditLogs.actorUserId,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, access.tenant.id),
          actorFilter !== 'all' ? eq(auditLogs.actorUserId, actorFilter) : undefined
        )
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(60)

    const staffUserMap = new Map<string, { name: string; role: MemberRole }>()
    for (const p of staffRows) {
      const sName =
        p.role === 'owner' && p.ownerUserName?.trim()
          ? p.ownerUserName.trim()
          : p.name || p.fallbackName
      if (p.userId) {
        staffUserMap.set(p.userId, {
          name: sName || (locale === 'ar' ? 'عضو فريق' : 'Staff'),
          role: p.role as MemberRole,
        })
      }
    }

    workspaceAuditLogs = rawLogs.map((log) => ({
      ...log,
      actorName: log.actorUserId ? staffUserMap.get(log.actorUserId)?.name ?? null : null,
      actorRole: log.actorUserId ? staffUserMap.get(log.actorUserId)?.role ?? null : null,
    }))
  }

  const canAccessEmployeePanel = access.membership.role === 'owner' || access.membership.role === 'admin'

  const staffStatsMap: Record<string, { bookingsCount: number; confirmedCount: number; noShowCount: number }> = {}

  if (tab === 'team') {
    const staffBookingCounts = await db
      .select({
        userId: bookings.createdByUserId,
        status: bookings.status,
        value: count(),
      })
      .from(bookings)
      .where(and(eq(bookings.tenantId, access.tenant.id), isNotNull(bookings.createdByUserId)))
      .groupBy(bookings.createdByUserId, bookings.status)

    for (const c of staffBookingCounts) {
      if (!c.userId) continue
      if (!staffStatsMap[c.userId]) {
        staffStatsMap[c.userId] = { bookingsCount: 0, confirmedCount: 0, noShowCount: 0 }
      }
      staffStatsMap[c.userId].bookingsCount += c.value
      if (c.status === 'confirmed') staffStatsMap[c.userId].confirmedCount += c.value
      if (c.status === 'no_show') staffStatsMap[c.userId].noShowCount += c.value
    }
  }

  const selectedStaff = staffId && canAccessEmployeePanel ? staffRows.find((p) => p.id === staffId) ?? null : null


  const selectedStaffStats = {
    bookingsCount: 0,
    confirmedCount: 0,
    noShowCount: 0,
  }

  if (tab === 'team' && selectedStaff?.userId) {
    const staffBookingCounts = await db
      .select({ status: bookings.status, value: count() })
      .from(bookings)
      .where(
        and(
          eq(bookings.tenantId, access.tenant.id),
          eq(bookings.createdByUserId, selectedStaff.userId)
        )
      )
      .groupBy(bookings.status)

    for (const c of staffBookingCounts) {
      selectedStaffStats.bookingsCount += c.value
      if (c.status === 'confirmed') selectedStaffStats.confirmedCount += c.value
      if (c.status === 'no_show') selectedStaffStats.noShowCount += c.value
    }
  }

  if (tab === 'bookings') {
    if (view === 'calendar') {
      const calStartDate = parseStartDate(searchParams.start)
      const calStartDateParam = formatDateParam(calStartDate)
      const calWeekRange = getWeekRange(calStartDate)
      const calDays = getWeekDays(calStartDate)

      const calStatusParam = searchParams.status || 'active'
      const calBookingConditions = [
        eq(bookings.tenantId, access.tenant.id),
        gte(bookings.startsAt, calWeekRange.start),
        lt(bookings.startsAt, calWeekRange.end),
        isNull(bookings.deletedAt),
      ]

      if (calStatusParam === 'all') {
        // all statuses included
      } else if (ALL_BOOKING_STATUSES.includes(calStatusParam as any)) {
        calBookingConditions.push(eq(bookings.status, calStatusParam as any))
      } else {
        calBookingConditions.push(not(eq(bookings.status, 'cancelled')))
      }

      const calCreatorUser = aliasedTable(user, 'dash_cal_creator_user')
      const calCreatorMembership = aliasedTable(memberships, 'dash_cal_creator_membership')
      const calCreatorStaff = aliasedTable(staff, 'dash_cal_creator_staff')
      const calCreatorStaffTranslations = aliasedTable(staffTranslations, 'dash_cal_creator_staff_trans')
      const calFallbackCreatorStaffTranslations = aliasedTable(staffTranslations, 'dash_cal_fb_creator_staff_trans')

      const calBookingRows = await db
        .select({
          id: bookings.id,
          startsAt: bookings.startsAt,
          endsAt: bookings.endsAt,
          status: bookings.status,
          source: bookings.source,
          customerNote: bookings.customerNote,
          internalNote: bookings.internalNote,
          cancelReason: bookings.cancelReason,
          createdAt: bookings.createdAt,
          createdByUserId: bookings.createdByUserId,
          creatorStaffName: calCreatorStaffTranslations.name,
          fallbackCreatorStaffName: calFallbackCreatorStaffTranslations.name,
          creatorUserName: calCreatorUser.name,
          creatorUserEmail: calCreatorUser.email,
          customerName: customers.fullName,
          customerPhone: customers.phoneE164,
          customerEmail: customers.email,
        })
        .from(bookings)
        .innerJoin(customers, eq(customers.id, bookings.customerId))
        .leftJoin(calCreatorUser, eq(calCreatorUser.id, bookings.createdByUserId))
        .leftJoin(
          calCreatorMembership,
          and(
            eq(calCreatorMembership.userId, calCreatorUser.id),
            eq(calCreatorMembership.tenantId, access.tenant.id)
          )
        )
        .leftJoin(
          calCreatorStaff,
          and(
            eq(calCreatorStaff.membershipId, calCreatorMembership.id),
            eq(calCreatorStaff.tenantId, access.tenant.id)
          )
        )
        .leftJoin(
          calCreatorStaffTranslations,
          and(
            eq(calCreatorStaffTranslations.staffId, calCreatorStaff.id),
            eq(calCreatorStaffTranslations.locale, locale)
          )
        )
        .leftJoin(
          calFallbackCreatorStaffTranslations,
          and(
            eq(calFallbackCreatorStaffTranslations.staffId, calCreatorStaff.id),
            eq(calFallbackCreatorStaffTranslations.locale, fallbackLocale)
          )
        )
        .where(and(...calBookingConditions))
        .orderBy(bookings.startsAt)

      const calItemsByBooking = new Map<string, CalendarBookingItem[]>()
      if (calBookingRows.length > 0) {
        const bIds = calBookingRows.map((b) => b.id)
        const rawItems = await db
          .select({
            id: bookingItems.id,
            bookingId: bookingItems.bookingId,
            startsAt: bookingItems.startsAt,
            endsAt: bookingItems.endsAt,
            priceAmount: bookingItems.priceAmount,
            serviceName: serviceTranslations.name,
            fallbackServiceName: fallbackServiceTranslations.name,
            durationMin: services.durationMin,
          })
          .from(bookingItems)
          .leftJoin(services, eq(services.id, bookingItems.serviceId))
          .leftJoin(
            serviceTranslations,
            and(
              eq(serviceTranslations.serviceId, services.id),
              eq(serviceTranslations.locale, locale)
            )
          )
          .leftJoin(
            fallbackServiceTranslations,
            and(
              eq(fallbackServiceTranslations.serviceId, services.id),
              eq(fallbackServiceTranslations.locale, fallbackLocale)
            )
          )
          .where(
            and(
              eq(bookingItems.tenantId, access.tenant.id),
              inArray(bookingItems.bookingId, bIds)
            )
          )
          .orderBy(bookingItems.sortOrder, bookingItems.startsAt)

        for (const item of rawItems) {
          const list = calItemsByBooking.get(item.bookingId) ?? []
          list.push({
            id: item.id,
            serviceName:
              item.serviceName ||
              item.fallbackServiceName ||
              (rtl ? 'خدمة بدون اسم' : 'Unnamed service'),
            durationMin: item.durationMin ?? 0,
            priceAmount: String(item.priceAmount ?? '0'),
            startsAt: item.startsAt,
            endsAt: item.endsAt,
          })
          calItemsByBooking.set(item.bookingId, list)
        }
      }

      const calAggregatedBookings: CalendarBooking[] = calBookingRows.map((b) => {
        const items = calItemsByBooking.get(b.id) ?? []
        const totalPrice = items.reduce(
          (sum, it) => sum + (parseFloat(it.priceAmount) || 0),
          0
        )
        const createdByName =
          b.creatorStaffName ||
          b.fallbackCreatorStaffName ||
          (b.creatorUserName && !b.creatorUserName.includes('@') ? b.creatorUserName : null) ||
          b.creatorUserEmail ||
          null

        return {
          id: b.id,
          startsAt: b.startsAt,
          endsAt: b.endsAt,
          status: b.status,
          source: b.source,
          customerName: b.customerName,
          customerPhone: b.customerPhone,
          customerEmail: b.customerEmail,
          customerNote: b.customerNote,
          internalNote: b.internalNote,
          cancelReason: b.cancelReason,
          createdAt: b.createdAt,
          items,
          totalPrice,
          createdByUserId: b.createdByUserId,
          createdByName,
        }
      })

      const bucketMap = bucketBookingsByDay(calDays, calAggregatedBookings)
      const calBookingsByDayRecord: Record<string, CalendarBooking[]> = {}
      for (const day of calDays) {
        const p = formatDateParam(day)
        calBookingsByDayRecord[p] = bucketMap.get(p) ?? []
      }

      calData = {
        startDateParam: calStartDateParam,
        days: calDays,
        bookingsByDayRecord: calBookingsByDayRecord,
        totalBookingsCount: calAggregatedBookings.length,
        statusParam: calStatusParam,
      }
    } else {
      const bookingConditions = [
        eq(bookings.tenantId, access.tenant.id),
        isNull(bookings.deletedAt),
      ]
      if (statusFilter && statusFilter !== 'all') {
        bookingConditions.push(eq(bookings.status, statusFilter as any))
      }

      const creatorUser = aliasedTable(user, 'dash_b_creator_user')
      const creatorMembership = aliasedTable(memberships, 'dash_b_creator_membership')
      const creatorStaff = aliasedTable(staff, 'dash_b_creator_staff')
      const creatorStaffTranslations = aliasedTable(staffTranslations, 'dash_b_creator_staff_trans')
      const fallbackCreatorStaffTranslations = aliasedTable(staffTranslations, 'dash_b_fb_creator_staff_trans')

      const [countResult, bRows] = await Promise.all([
        db.select({ value: count() }).from(bookings).where(and(...bookingConditions)),
        db
          .select({
            id: bookings.id,
            startsAt: bookings.startsAt,
            endsAt: bookings.endsAt,
            status: bookings.status,
            source: bookings.source,
            customerNote: bookings.customerNote,
            internalNote: bookings.internalNote,
            cancelReason: bookings.cancelReason,
            createdAt: bookings.createdAt,
            createdByUserId: bookings.createdByUserId,
            creatorStaffName: creatorStaffTranslations.name,
            fallbackCreatorStaffName: fallbackCreatorStaffTranslations.name,
            creatorUserName: creatorUser.name,
            creatorUserEmail: creatorUser.email,
            customerName: customers.fullName,
            customerPhone: customers.phoneE164,
            customerEmail: customers.email,
          })
          .from(bookings)
          .innerJoin(customers, eq(customers.id, bookings.customerId))
          .leftJoin(creatorUser, eq(creatorUser.id, bookings.createdByUserId))
          .leftJoin(
            creatorMembership,
            and(
              eq(creatorMembership.userId, creatorUser.id),
              eq(creatorMembership.tenantId, access.tenant.id)
            )
          )
          .leftJoin(
            creatorStaff,
            and(
              eq(creatorStaff.membershipId, creatorMembership.id),
              eq(creatorStaff.tenantId, access.tenant.id)
            )
          )
          .leftJoin(
            creatorStaffTranslations,
            and(
              eq(creatorStaffTranslations.staffId, creatorStaff.id),
              eq(creatorStaffTranslations.locale, locale)
            )
          )
          .leftJoin(
            fallbackCreatorStaffTranslations,
            and(
              eq(fallbackCreatorStaffTranslations.staffId, creatorStaff.id),
              eq(fallbackCreatorStaffTranslations.locale, fallbackLocale)
            )
          )
          .where(and(...bookingConditions))
          .orderBy(desc(bookings.startsAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
      ])

      totalBookingsCount = countResult[0]?.value ?? 0
      bookingListRows = bRows.map((r) => ({
        ...r,
        createdByName:
          r.creatorStaffName ||
          r.fallbackCreatorStaffName ||
          (r.creatorUserName && !r.creatorUserName.includes('@') ? r.creatorUserName : null) ||
          r.creatorUserEmail ||
          null,
      }))

      if (bRows.length > 0) {
        const bIds = bRows.map((b) => b.id)
        const rawItems = await db
          .select({
            id: bookingItems.id,
            bookingId: bookingItems.bookingId,
            startsAt: bookingItems.startsAt,
            endsAt: bookingItems.endsAt,
            priceAmount: bookingItems.priceAmount,
            serviceName: serviceTranslations.name,
            fallbackServiceName: fallbackServiceTranslations.name,
            durationMin: services.durationMin,
          })
          .from(bookingItems)
          .leftJoin(services, eq(services.id, bookingItems.serviceId))
          .leftJoin(serviceTranslations, and(eq(serviceTranslations.serviceId, services.id), eq(serviceTranslations.locale, locale)))
          .leftJoin(fallbackServiceTranslations, and(eq(fallbackServiceTranslations.serviceId, services.id), eq(fallbackServiceTranslations.locale, fallbackLocale)))
          .where(and(eq(bookingItems.tenantId, access.tenant.id), inArray(bookingItems.bookingId, bIds)))
          .orderBy(bookingItems.sortOrder, bookingItems.startsAt)

        for (const item of rawItems) {
          const list = itemsByBooking.get(item.bookingId) ?? []
          list.push({
            id: item.id,
            serviceName: item.serviceName || item.fallbackServiceName || (rtl ? 'خدمة بدون اسم' : 'Unnamed service'),
            durationMin: item.durationMin ?? 0,
            priceAmount: String(item.priceAmount ?? '0'),
            startsAt: item.startsAt,
            endsAt: item.endsAt,
          })
          itemsByBooking.set(item.bookingId, list)
        }
      }
    }
  }

  const tenantTheme = (access.tenant as any).theme as Record<string, string> | null ?? {}
  const websiteConfigRow = await db.query.websiteConfig.findFirst({ where: eq(websiteConfig.tenantId, access.tenant.id) })
  const draftWebsiteConfig = websiteConfigRow ? safeParseWebsiteConfig(websiteConfigRow.draft) : null
  const publishedWebsiteConfig = websiteConfigRow?.published ? safeParseWebsiteConfig(websiteConfigRow.published) : null

  const checklist = [
    { done: serviceCount[0]?.value > 0, label: rtl ? 'أضف خدمتك الأولى' : 'Add your first service', href: '?tab=services' },
    { done: staffRows.length > 0, label: rtl ? 'أضف عضو فريق' : 'Add a team member', href: '?tab=team' },
    { done: hoursRows.length > 0, label: rtl ? 'حدد ساعات العمل' : 'Set working hours', href: '?tab=team' },
    { done: true, label: rtl ? 'شارك رابط الحجز العام' : 'Share your public booking link', href: `/${locale}/tenants/${slug}` },
  ]


  // ---------------------------------------------------------------------------
  // Derived Overview data. Everything below comes from the queries above — no
  // extra round-trips and no invented metrics.
  // ---------------------------------------------------------------------------
  const completedThisMonth = completedThisMonthCount[0]?.value ?? 0
  // The tenant's public website URL, from the project's single source of
  // truth (lib/routes.ts) — the same helper the settings screens use.
  const publicUrl = publicTenantUrl(locale, slug)
  const todayCount = appointmentCount[0]?.value ?? 0

  // The four getting-started steps. "Add your first service" is implied by
  // having an active service; because booking requires a staff member assigned
  // to that service, services and team move together in practice.
  const onboardingDone = checklist.filter((item) => item.done).length
  const onboardingComplete = onboardingDone === checklist.length

  // The workspace's real display name: its localized translation, falling back
  // to the slug when a translation row is missing. Used for the page heading so
  // the dashboard is not headed by the generic "Workspace" label.
  const tenantDisplayName = tenantTranslation?.name?.trim() || access.tenant.slug

  return (
    <>

        {tab === 'overview' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat icon={<CalendarDays className="h-5 w-5" />} label={t.appointments} value={String(todayCount)} hint={rtl ? 'مواعيد اليوم' : 'Scheduled for today'} />
              <Stat icon={<Users className="h-5 w-5" />} label={t.customers} value={String(customerCount[0]?.value ?? 0)} hint={rtl ? 'إجمالي العملاء المسجّلين' : 'Total customers on record'} />
              <Stat icon={<ClipboardList className="h-5 w-5" />} label={t.services} value={String(serviceCount[0]?.value ?? 0)} hint={rtl ? 'خدمات متاحة للحجز' : 'Services available to book'} />
              <Stat icon={<CheckCircle2 className="h-5 w-5" />} label={rtl ? 'مكتملة هذا الشهر' : 'Completed this month'} value={String(completedThisMonth)} hint={rtl ? 'من بداية الشهر الحالي' : 'Since the start of this month'} />
            </div>

            {/* Standalone public website link card: identity + copy/open actions.
                Kept out of the Quick Actions row so the website actions are not
                duplicated and the row stays compact. Grouped with quick actions. */}
            <div className="mt-6">
              <PublicWebsiteLink url={publicUrl} locale={locale} siteName={tenantDisplayName} />

              {/* Quick actions: common management tasks, one compact row.
                  Hidden entirely for receptionist — they cannot access services
                  (edit), team, or website tabs. */}
              {role !== 'receptionist' && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href="?tab=services" className="inline-flex items-center gap-2 rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-semibold text-white outline-none transition hover:bg-[#0d6560] focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2">
                    <Plus aria-hidden="true" className="h-4 w-4 shrink-0" />
                    {rtl ? 'إضافة خدمة' : 'Add service'}
                  </a>
                  <a href="?tab=team" className="inline-flex items-center gap-2 rounded-xl border border-border bg-paper px-4 py-2.5 text-sm font-semibold text-[#374151] outline-none transition hover:border-brand-teal hover:text-brand-teal focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2">
                    <Users aria-hidden="true" className="h-4 w-4 shrink-0" />
                    {rtl ? 'إضافة عضو فريق' : 'Add team member'}
                  </a>
                  <a href="?tab=website" className="inline-flex items-center gap-2 rounded-xl border border-border bg-paper px-4 py-2.5 text-sm font-semibold text-[#374151] outline-none transition hover:border-brand-teal hover:text-brand-teal focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2">
                    <Pencil aria-hidden="true" className="h-4 w-4 shrink-0" />
                    {rtl ? 'تعديل الموقع' : 'Edit website'}
                  </a>
                </div>
              )}
            </div>

            {onboardingComplete ? (
              // All steps done: collapse the checklist into a dismissible
              // success line so it stops dominating the Overview.
              <div className="mt-6">
                <OnboardingSuccess locale={locale} storageKey={`idarty:onboarding-success:${access.tenant.id}`} />
              </div>
            ) : (
            <div className="mt-6 rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">{rtl ? 'خطوات البدء' : 'Getting started'}</h2>
                  <p className="mt-1 text-sm text-ink-muted">{rtl ? 'أكمل هذه الخطوات لتجهيز مساحة العمل.' : 'Complete these steps to prepare your workspace.'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-brand-teal">{onboardingDone} / {checklist.length}</span>
                </div>
              </div>

              <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-[#f0f2f5]">
                <div className="h-full bg-brand-teal transition-all duration-500" style={{ width: `${(onboardingDone / checklist.length) * 100}%` }} />
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {checklist.map((item) => (
                  <a key={item.label} href={item.href} className="group flex items-center justify-between rounded-2xl border border-border bg-surface p-4 text-sm font-semibold outline-none transition hover:border-brand-teal hover:bg-paper hover:shadow-sm focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2">
                    <span className="text-[#172033]">{item.label}</span>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs transition ${item.done ? 'bg-[#dff5e9] text-[#24865b]' : 'border border-[#cbd5ee] text-transparent group-hover:border-brand-teal'}`}>
                      {item.done ? '✓' : ''}
                    </span>
                  </a>
                ))}
              </div>
            </div>
            )}

            <div className="mt-6 rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6"><h2 className="text-lg font-semibold">{t.appointments}</h2><div className="mt-6 space-y-3">{todayBookings.length === 0 ? <div className="rounded-2xl border border-dashed border-[#dfe4ee] px-5 py-12 text-center text-sm text-ink-muted">{t.empty}</div> : todayBookings.map((booking) => <div key={booking.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-4"><div className="min-w-0 flex-1"><p className="font-semibold wrap-anywhere">{booking.name}</p><p className="mt-1 text-xs text-ink-muted">{new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit' }).format(booking.startsAt)}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColors[booking.status] ?? statusColors.confirmed}`}>{statusText[booking.status]?.[locale] ?? booking.status}</span>{booking.status === 'confirmed' && <BookingStatusActions slug={slug} bookingId={booking.id} locale={locale} />}</div></div>)}</div></div>
            <div className="mt-6 rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{locale === 'ar' ? 'المواعيد القادمة' : 'Upcoming bookings'}</h2><p className="mt-1 text-sm text-ink-muted">{locale === 'ar' ? 'نظرة على الأيام السبعة القادمة.' : 'A view of the next seven days.'}</p></div><span className="shrink-0 rounded-full bg-[#fff5e8] px-3 py-1 text-xs font-semibold text-[#b86a12]">{upcomingBookings.length}</span></div><div className="mt-5 space-y-2">{upcomingBookings.length === 0 ? <div className="rounded-2xl border border-dashed border-[#dfe4ee] px-5 py-10 text-center text-sm text-ink-muted">{locale === 'ar' ? 'لا توجد مواعيد قادمة.' : 'No upcoming bookings.'}</div> : upcomingBookings.map((booking) => <div key={booking.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3"><div className="min-w-0 flex-1"><p className="font-semibold wrap-anywhere">{booking.name}</p><p className="mt-1 text-xs text-ink-muted">{new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(booking.startsAt)}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColors[booking.status] ?? statusColors.confirmed}`}>{statusText[booking.status]?.[locale] ?? booking.status}</span>{booking.status === 'confirmed' && <BookingStatusActions slug={slug} bookingId={booking.id} locale={locale} />}</div></div>)}</div></div>
          </div>
        )}

        {tab === 'bookings' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="mt-9 rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6">
              {/* Header & Total Count */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{t.bookings}</h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    {rtl
                      ? 'عرض وتفاصيل جميع الحجوزات والخدمات المرتبطة بها.'
                      : 'View and manage all bookings and their associated services.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="shrink-0 rounded-full bg-[#f0faf9] px-3 py-1 text-xs font-semibold text-brand-teal">
                    {view === 'calendar' ? (calData?.totalBookingsCount ?? 0) : totalBookingsCount} {rtl ? 'حجز' : 'bookings'}
                  </span>
                  {/* Option 1: Segmented View Switcher (List vs Calendar) */}
                  <div
                    role="group"
                    aria-label={rtl ? 'طريقة عرض الحجوزات' : 'Bookings view'}
                    className="inline-flex items-center rounded-xl border border-border bg-[#f0f2f5] p-1 text-xs font-semibold"
                  >
                    {view === 'list' ? (
                      <span
                        aria-current="page"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[#172033] shadow-xs cursor-default"
                      >
                        <ClipboardList aria-hidden="true" className="h-3.5 w-3.5 text-brand-teal" />
                        <span>{rtl ? 'قائمة' : 'List'}</span>
                      </span>
                    ) : (
                      <a
                        href={`?tab=bookings${statusFilter && statusFilter !== 'all' ? `&status=${statusFilter}` : ''}`}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-ink-muted transition hover:text-[#172033]"
                      >
                        <ClipboardList aria-hidden="true" className="h-3.5 w-3.5" />
                        <span>{rtl ? 'قائمة' : 'List'}</span>
                      </a>
                    )}

                    {view === 'calendar' ? (
                      <span
                        aria-current="page"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[#172033] shadow-xs cursor-default"
                      >
                        <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 text-brand-teal" />
                        <span>{rtl ? 'تقويم' : 'Calendar'}</span>
                      </span>
                    ) : (
                      <a
                        href={`?tab=bookings&view=calendar${statusFilter && statusFilter !== 'all' ? `&status=${statusFilter}` : ''}`}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-ink-muted transition hover:text-[#172033]"
                      >
                        <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
                        <span>{rtl ? 'تقويم' : 'Calendar'}</span>
                      </a>
                    )}
                  </div>
                  <ManualBookingModal
                    slug={slug}
                    locale={locale}
                    currency={access.tenant.currency}
                    services={serviceRows.map((s) => ({
                      id: s.id,
                      name: s.name || s.fallbackName || (rtl ? 'خدمة' : 'Service'),
                      durationMin: s.durationMin,
                      priceAmount: String(s.priceAmount),
                    }))}
                  />
                </div>
              </div>

              {view === 'calendar' && calData ? (
                <div className="mt-6">
                  <CalendarView
                    slug={slug}
                    locale={locale}
                    currency={access.tenant.currency}
                    startDate={calData.startDateParam}
                    days={calData.days.map((d) => ({ date: d, dateParam: formatDateParam(d) }))}
                    bookingsByDay={calData.bookingsByDayRecord}
                    totalBookingsCount={calData.totalBookingsCount}
                    currentStatusFilter={calData.statusParam}
                    servicesList={serviceRows.map((s) => ({
                      id: s.id,
                      name: s.name || s.fallbackName || (rtl ? 'خدمة بدون اسم' : 'Unnamed service'),
                      durationMin: s.durationMin,
                      priceAmount: String(s.priceAmount),
                    }))}
                    canViewInternalNotes={true}
                    hideNewBookingButton={true}
                  />
                </div>
              ) : (
                <>
                  {/* Status Filter Tabs / Chips */}
              <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-border pb-4">
                <a
                  href="?tab=bookings"
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    statusFilter === 'all'
                      ? 'bg-brand-teal text-white shadow-sm'
                      : 'border border-border bg-surface text-ink-muted hover:border-brand-teal hover:text-brand-teal'
                  }`}
                >
                  {rtl ? 'الكل' : 'All'}
                </a>
                {ALL_BOOKING_STATUSES.map((st) => (
                  <a
                    key={st}
                    href={`?tab=bookings&status=${st}`}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                      statusFilter === st
                        ? 'bg-brand-teal text-white shadow-sm'
                        : 'border border-border bg-surface text-ink-muted hover:border-brand-teal hover:text-brand-teal'
                    }`}
                  >
                    {getStatusLabel(st, locale)}
                  </a>
                ))}
              </div>

              {/* Bookings List */}
              <div className="mt-5 space-y-4">
                {bookingListRows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#dfe4ee] px-5 py-12 text-center text-sm text-ink-muted">
                    {t.emptyBookings}
                  </div>
                ) : (
                  bookingListRows.map((b) => {
                    const items = itemsByBooking.get(b.id) ?? []
                    const totalPrice = items.reduce(
                      (acc, item) => acc + (parseFloat(item.priceAmount) || 0),
                      0
                    )
                    const totalDuration = items.reduce((acc, item) => acc + item.durationMin, 0)
                    const servicesSummary = items.map((i) => i.serviceName).join(' + ')

                    return (
                      <div
                        key={b.id}
                        className="rounded-2xl border border-border bg-surface p-4 transition hover:border-[#ccd5e4]"
                      >
                        {/* Top row: Customer, Date/Time, Status Badge */}
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-[#172033] wrap-anywhere">
                                {b.customerName}
                              </h3>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${getStatusColor(
                                  b.status
                                )}`}
                              >
                                {getStatusLabel(b.status, locale)}
                              </span>
                              {b.source === 'online' ? (
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                                  {rtl ? 'أونلاين' : 'Online'}
                                </span>
                              ) : (
                                <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700">
                                  {rtl ? 'لوحة التحكم' : 'Dashboard'}
                                </span>
                              )}
                            </div>

                            {/* Date & Time */}
                            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                              <span>
                                {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                }).format(b.startsAt)}
                              </span>
                              {totalDuration > 0 && (
                                <span>
                                  · {totalDuration} {rtl ? 'دقيقة' : 'min'}
                                </span>
                              )}
                            </p>

                            {/* Services preview line */}
                            {servicesSummary && (
                              <p className="mt-2 text-xs font-medium text-[#374151] wrap-anywhere">
                                <span className="text-ink-muted">{rtl ? 'الخدمات: ' : 'Services: '}</span>
                                {servicesSummary}
                              </p>
                            )}
                          </div>

                          {/* Price & Items Count */}
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-base font-bold text-[#172033]">
                              {totalPrice.toFixed(2)} {access.tenant.currency}
                            </span>
                            <span className="text-xs text-ink-muted">
                              {items.length} {rtl ? 'خدمات' : 'items'}
                            </span>
                          </div>
                        </div>

                        {/* Collapsible Details */}
                        <details className="group mt-3 border-t border-[#e2e8f0] pt-3">
                          <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-brand-teal transition hover:underline focus:outline-none">
                            <span>{rtl ? 'عرض تفاصيل الحجز والخدمات' : 'View booking & service details'}</span>
                            <span className="transition-transform duration-200 group-open:rotate-180">
                              ▼
                            </span>
                          </summary>

                          <div className="mt-3 space-y-4 pt-2 text-xs">
                            {/* Service Items Breakdown */}
                            <div>
                              <h4 className="font-semibold text-[#172033] mb-2">
                                {rtl ? 'الخدمات المحجوزة:' : 'Booked Services:'}
                              </h4>
                              <div className="space-y-2">
                                {items.map((item, idx) => (
                                  <div
                                    key={item.id || idx}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2.5 border border-border"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="font-medium text-[#172033]">{item.serviceName}</p>
                                      <p className="mt-0.5 text-[11px] text-ink-muted">
                                        {item.durationMin} {rtl ? 'دقيقة' : 'min'}
                                        {' · '}
                                        {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
                                          hour: 'numeric',
                                          minute: '2-digit',
                                        }).format(item.startsAt)}
                                        {' – '}
                                        {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
                                          hour: 'numeric',
                                          minute: '2-digit',
                                        }).format(item.endsAt)}
                                      </p>
                                    </div>
                                    <span className="font-semibold text-[#172033]">
                                      {item.priceAmount} {access.tenant.currency}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Customer Contact & Booking Metadata */}
                            <div className="grid gap-3 sm:grid-cols-2 rounded-xl bg-paper p-3 border border-border">
                              <div>
                                <p className="font-semibold text-[#172033] mb-1">
                                  {rtl ? 'بيانات العميل:' : 'Customer Information:'}
                                </p>
                                <p className="text-ink-muted">
                                  {rtl ? 'الاسم: ' : 'Name: '}
                                  <span className="text-[#172033] font-medium">{b.customerName}</span>
                                </p>
                                <p className="text-ink-muted mt-0.5" dir="ltr">
                                  <span className="text-ink-muted">{rtl ? 'الهاتف: ' : 'Phone: '}</span>
                                  <span className="text-[#172033] font-medium">{b.customerPhone}</span>
                                </p>
                                {b.customerEmail && (
                                  <p className="text-ink-muted mt-0.5">
                                    {rtl ? 'البريد: ' : 'Email: '}
                                    <span className="text-[#172033] font-medium">{b.customerEmail}</span>
                                  </p>
                                )}
                              </div>

                              <div>
                                <p className="font-semibold text-[#172033] mb-1">
                                  {rtl ? 'تفاصيل إضافية:' : 'Additional Details:'}
                                </p>
                                {b.customerNote && (
                                  <p className="text-ink-muted">
                                    {rtl ? 'ملاحظة العميل: ' : 'Customer note: '}
                                    <span className="text-[#172033] italic">"{b.customerNote}"</span>
                                  </p>
                                )}
                                {b.internalNote && (
                                  <p className="text-ink-muted mt-0.5">
                                    {rtl ? 'ملاحظة داخلية: ' : 'Internal note: '}
                                    <span className="text-[#172033] italic">"{b.internalNote}"</span>
                                  </p>
                                )}
                                {b.cancelReason && (
                                  <p className="text-red-600 mt-0.5">
                                    {rtl ? 'سبب الإلغاء: ' : 'Cancel reason: '}
                                    <span className="font-medium">{b.cancelReason}</span>
                                  </p>
                                )}
                                {b.source === 'dashboard' && b.createdByName && (
                                  <p className="text-ink-muted mt-0.5">
                                    {rtl ? 'الموظف المسؤول: ' : 'Responsible staff: '}
                                    <span className="text-[#172033] font-medium">{b.createdByName}</span>
                                  </p>
                                )}
                                <p className="text-ink-muted mt-1 text-[11px]">
                                  {rtl ? 'تاريخ الإنشاء: ' : 'Created at: '}
                                  {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                  }).format(b.createdAt)}
                                </p>
                              </div>
                            </div>

                            {/* Booking Status Actions (Cancel / No-show / Reschedule) */}
                            {b.status === 'confirmed' && (
                              <div className="pt-1">
                                <BookingStatusActions slug={slug} bookingId={b.id} locale={locale} />
                              </div>
                            )}
                          </div>
                        </details>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Pagination */}
              {totalBookingsCount > pageSize && (
                <div className="mt-6 flex items-center justify-center gap-3">
                  {page > 1 && (
                    <a
                      href={`?tab=bookings${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}&page=${page - 1}`}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-ink-muted transition hover:border-brand-teal hover:text-brand-teal"
                    >
                      {rtl ? '→' : '←'} {rtl ? 'السابق' : 'Previous'}
                    </a>
                  )}
                  <span className="text-sm text-ink-muted">
                    {page} / {Math.ceil(totalBookingsCount / pageSize)}
                  </span>
                  {page * pageSize < totalBookingsCount && (
                    <a
                      href={`?tab=bookings${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}&page=${page + 1}`}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-ink-muted transition hover:border-brand-teal hover:text-brand-teal"
                    >
                      {rtl ? 'التالي' : 'Next'} {rtl ? '←' : '→'}
                    </a>
                  )}
                </div>
              )}
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'customers' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="mt-9 rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{t.customers}</h2><p className="mt-1 text-sm text-ink-muted">{locale === 'ar' ? 'آخر العملاء الذين حجزوا معك.' : 'The latest customers who booked with you.'}</p></div><span className="shrink-0 rounded-full bg-[#f0faf9] px-3 py-1 text-xs font-semibold text-brand-teal">{customerCount[0]?.value ?? 0}</span></div><div className="mt-5 divide-y divide-border">{customerRows.length === 0 ? <div className="rounded-2xl border border-dashed border-[#dfe4ee] px-5 py-10 text-center text-sm text-ink-muted">{locale === 'ar' ? 'لا يوجد عملاء بعد.' : 'No customers yet.'}</div> : customerRows.map((customer) => <div key={customer.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"><div className="min-w-0 flex-1"><p className="font-semibold wrap-anywhere">{customer.name}</p><p className="mt-1 text-xs text-ink-muted wrap-anywhere">{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</p></div><p className="shrink-0 text-xs text-ink-muted">{new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(customer.createdAt)}</p></div>)}</div>
              {customerCount[0]?.value > pageSize && (
                <div className="mt-5 flex items-center justify-center gap-3">
                  {page > 1 && <a href={`?tab=customers&page=${page - 1}`} className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-ink-muted transition hover:border-brand-teal hover:text-brand-teal">{rtl ? '→' : '←'} {rtl ? 'السابق' : 'Previous'}</a>}
                  <span className="text-sm text-ink-muted">{page} / {Math.ceil((customerCount[0]?.value ?? 0) / pageSize)}</span>
                  {page * pageSize < (customerCount[0]?.value ?? 0) && <a href={`?tab=customers&page=${page + 1}`} className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-ink-muted transition hover:border-brand-teal hover:text-brand-teal">{rtl ? 'التالي' : 'Next'} {rtl ? '←' : '→'}</a>}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'website' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="mt-9 mb-6">
              <h2 className="text-xl font-semibold tracking-tight">
                {locale === 'ar' ? 'محرر الموقع' : 'Website Builder'}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                {locale === 'ar'
                  ? 'تخصيص موقعك العام وتحديد المحتوى والأقسام الظاهرة.'
                  : 'Customize your public website and manage visible content and sections.'}
              </p>
            </div>
            <WebsiteEditor
              // Keyed by locale so switching language REMOUNTS the editor and
              // re-initialises its draft state from that locale's server props.
              // Without this, React preserved the existing instance across the
              // locale navigation and `useState` never re-ran, so the editor kept
              // showing the previous language's configuration (the reported
              // Arabic/English inconsistency).
              key={locale}
              locale={locale}
              slug={slug}
              initialConfig={draftWebsiteConfig}
              publishedConfig={publishedWebsiteConfig}
              tenant={{
                name: tenantTranslation?.name ?? access.tenant.slug,
                tagline: tenantTranslation?.tagline ?? '',
                description: tenantTranslation?.description ?? '',
                address: tenantTranslation?.address ?? '',
                phoneE164: access.tenant.phoneE164 ?? '',
                email: access.tenant.email ?? '',
                currency: access.tenant.currency,
                theme: tenantTheme,
              }}
              services={serviceRows.map((s) => ({
                id: s.id,
                name: s.name || s.fallbackName,
                durationMin: s.durationMin,
                priceAmount: String(s.priceAmount),
                image: s.image ?? null,
                imageCrop: numericCrop(s),
              }))}
              canPublish={['admin', 'owner'].includes(access.membership.role)}
            />
          </div>
        )}
        {tab === 'services' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="mt-9 rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{t.services}</h2><p className="mt-1 text-sm text-ink-muted">{locale === 'ar' ? 'أدر الخدمات التي يمكن حجزها من موقعك.' : 'Manage services customers can book.'}</p></div><span className="rounded-full bg-[#f0faf9] px-3 py-1 text-xs font-semibold text-brand-teal">{serviceRows.length}</span></div><div className="mt-5 space-y-2">{serviceRows.map((service) => { const serviceName = service.name || service.fallbackName; return <div key={service.id} className="rounded-2xl bg-surface px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0 flex-1"><p className="font-semibold wrap-anywhere">{serviceName ?? (locale === 'ar' ? 'خدمة بدون ترجمة' : 'Untitled service')}</p><p className="mt-1 text-xs text-ink-muted">{service.durationMin} {locale === 'ar' ? 'دقيقة' : 'min'} · {service.priceAmount} {access.tenant.currency}</p></div><div className="flex min-w-0 flex-wrap items-center gap-3"><ServiceEditForm slug={slug} locale={locale} service={{ id: service.id, name: serviceName ?? '', durationMin: service.durationMin, priceAmount: String(service.priceAmount) }} /><ServiceDeleteButton slug={slug} locale={locale} serviceId={service.id} serviceName={serviceName ?? (locale === 'ar' ? 'خدمة بدون ترجمة' : 'Untitled service')} bookingCount={bookingsByService.get(service.id) ?? 0} /></div></div></div> })}</div><ServiceForm locale={locale} slug={slug} /></div>
          </div>
        )}

        {tab === 'team' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Header with Sub-tabs */}
            <div className="mt-9 rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{locale === 'ar' ? 'الفريق' : 'Team'}</h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    {locale === 'ar'
                      ? 'إدارة أعضاء فريق العمل، متابعة سجل العمليات الإدارية، واستعراض مصفوفة الصلاحيات.'
                      : 'Manage team members, monitor operational activity, and inspect roles & permissions.'}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[#f0faf9] px-3 py-1 text-xs font-semibold text-brand-teal">
                  {staffRows.length} {locale === 'ar' ? 'أعضاء' : 'members'}
                </span>
              </div>

              {/* Segmented Sub-navigation Tabs */}
              <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-border pb-4">
                <a
                  href="?tab=team"
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                    sub === 'members'
                      ? 'bg-brand-teal text-white shadow-xs'
                      : 'border border-border bg-surface text-ink-muted hover:border-brand-teal hover:text-brand-teal'
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>{locale === 'ar' ? 'أعضاء الفريق' : 'Team Members'}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                      sub === 'members' ? 'bg-white/20 text-white' : 'bg-paper text-ink-muted'
                    }`}
                  >
                    {staffRows.length}
                  </span>
                </a>

                {hasPermission(access.membership.role, 'team:activity:view') && (
                  <a
                    href="?tab=team&sub=activity"
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                      sub === 'activity'
                        ? 'bg-brand-teal text-white shadow-xs'
                        : 'border border-border bg-surface text-ink-muted hover:border-brand-teal hover:text-brand-teal'
                    }`}
                  >
                    <Activity className="h-3.5 w-3.5" />
                    <span>{locale === 'ar' ? 'سجل العمليات' : 'Activity Log'}</span>
                  </a>
                )}

                <a
                  href="?tab=team&sub=permissions"
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                    sub === 'permissions'
                      ? 'bg-brand-teal text-white shadow-xs'
                      : 'border border-border bg-surface text-ink-muted hover:border-brand-teal hover:text-brand-teal'
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{locale === 'ar' ? 'الأدوار والصلاحيات' : 'Roles & Permissions'}</span>
                </a>
              </div>

              {/* Sub-tab 1: Team Members */}
              {sub === 'members' && (
                <div className="mt-5">
                  <div className="space-y-3">
                    {staffRows.map((person) => {
                      const staffName =
                        person.role === 'owner' && person.ownerUserName?.trim()
                          ? person.ownerUserName.trim()
                          : person.name || person.fallbackName
                      const isInvited = pendingInviteStaffIds.has(person.id)
                      const roleBadgeClasses =
                        {
                          owner: 'bg-purple-50 text-purple-700',
                          admin: 'bg-amber-50 text-amber-700',
                          manager: 'bg-blue-50 text-blue-700',
                          staff: 'bg-[#f0faf9] text-brand-teal',
                          receptionist: 'bg-slate-100 text-slate-700',
                        }[person.role || 'staff'] ?? 'bg-surface text-ink-muted'
                      const roleBadgeLabels =
                        {
                          ar: {
                            owner: 'مالك',
                            admin: 'مشرف',
                            manager: 'مدير',
                            staff: 'عضو فريق',
                            receptionist: 'موظف استقبال',
                          },
                          en: {
                            owner: 'Owner',
                            admin: 'Admin',
                            manager: 'Manager',
                            staff: 'Staff',
                            receptionist: 'Receptionist',
                          },
                        }[locale][(person.role || 'staff') as 'owner' | 'admin' | 'manager' | 'staff' | 'receptionist'] ??
                        person.role
                      return (
                        <div key={person.id} className="rounded-2xl bg-surface px-4 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold wrap-anywhere">
                                  {staffName ?? (locale === 'ar' ? 'عضو فريق' : 'Team member')}
                                </p>
                                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleBadgeClasses}`}>
                                  {roleBadgeLabels}
                                </span>
                                {person.membershipId ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                    ● {rtl ? 'مفعّل' : 'Active'}
                                  </span>
                                ) : isInvited ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                    ● {rtl ? 'دعوة معلقة' : 'Invited'}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                                    ○ {rtl ? 'ملف محلي' : 'Local'}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-ink-muted wrap-anywhere">
                                {person.email ?? person.phone ?? ''}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              {canAccessEmployeePanel && (
                                <StaffDetailsButton
                                  locale={locale}
                                  slug={slug}
                                  callerRole={access.membership.role}
                                  staffMember={{
                                    id: person.id,
                                    name:
                                      person.role === 'owner' && person.ownerUserName?.trim()
                                        ? person.ownerUserName.trim()
                                        : staffName ?? (locale === 'ar' ? 'عضو فريق' : 'Team member'),
                                    email: person.email,
                                    phone: person.phone,
                                    role: person.role as MemberRole,
                                    isInvited,
                                    userId: person.userId,
                                  }}
                                  stats={
                                    person.userId
                                      ? staffStatsMap[person.userId] ?? { bookingsCount: 0, confirmedCount: 0, noShowCount: 0 }
                                      : { bookingsCount: 0, confirmedCount: 0, noShowCount: 0 }
                                  }
                                />
                              )}
                              <StaffEditForm
                                slug={slug}
                                locale={locale}
                                callerRole={access.membership.role}
                                staff={{
                                  id: person.id,
                                  name: staffName ?? '',
                                  email: person.email ?? '',
                                  phone: person.phone ?? '',
                                  role: person.role,
                                  isInvited,
                                }}
                              />
                              {person.role !== 'owner' && (
                                <StaffArchiveButton slug={slug} locale={locale} staffId={person.id} />
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <StaffForm locale={locale} slug={slug} callerRole={access.membership.role} />
                  {canAccessEmployeePanel && selectedStaff && (
                    <StaffDetailsDrawer
                      isOpen={Boolean(selectedStaff)}
                      closeHref={`?tab=team&sub=members`}
                      locale={locale}
                      slug={slug}
                      callerRole={access.membership.role}
                      staffMember={{
                        id: selectedStaff.id,
                        name:
                          selectedStaff.role === 'owner' && selectedStaff.ownerUserName?.trim()
                            ? selectedStaff.ownerUserName.trim()
                            : selectedStaff.name || selectedStaff.fallbackName || (locale === 'ar' ? 'عضو فريق' : 'Team member'),
                        email: selectedStaff.email,
                        phone: selectedStaff.phone,
                        role: selectedStaff.role as MemberRole,
                        isInvited: pendingInviteStaffIds.has(selectedStaff.id),
                        userId: selectedStaff.userId,
                      }}
                      stats={selectedStaffStats}
                    />
                  )}
                </div>
              )}

              {/* Sub-tab 2: Activity Log Feed */}
              {sub === 'activity' && (
                <div className="mt-5">
                  <TeamActivityFeed
                    slug={slug}
                    locale={locale}
                    staffOptions={staffRows.map((p) => ({
                      id: p.id,
                      name:
                        (p.role === 'owner' && p.ownerUserName?.trim())
                          ? p.ownerUserName.trim()
                          : (p.name || p.fallbackName || (locale === 'ar' ? 'عضو فريق' : 'Staff')),
                      role: p.role as MemberRole,
                      userId: p.userId,
                    }))}
                    initialLogs={workspaceAuditLogs}
                    currentActorFilter={actorFilter}
                  />
                </div>
              )}

              {/* Sub-tab 3: Roles & Permissions Matrix */}
              {sub === 'permissions' && (
                <div className="mt-5">
                  <TeamRolesMatrix
                    locale={locale}
                    currentCallerRole={access.membership.role}
                    members={staffRows.map((p) => ({
                      id: p.id,
                      name:
                        p.role === 'owner' && p.ownerUserName?.trim()
                          ? p.ownerUserName.trim()
                          : p.name || p.fallbackName || (locale === 'ar' ? 'عضو' : 'Member'),
                      role: p.role as MemberRole,
                      userId: p.userId,
                      email: p.email,
                    }))}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'schedule' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="mt-9 rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6"><h2 className="text-lg font-semibold">{locale === 'ar' ? 'ساعات العمل' : 'Working hours'}</h2><p className="mt-1 text-sm text-ink-muted">{locale === 'ar' ? 'حدد الأوقات العامة المتاحة للحجز.' : 'Set the general hours available for bookings.'}</p><WorkingHoursForm locale={locale} slug={slug} hours={hoursRows} /></div>
            <div className="mt-6 rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6"><h2 className="text-lg font-semibold">{locale === 'ar' ? 'استثناءات المواعيد' : 'Date overrides'}</h2><p className="mt-1 text-sm text-ink-muted">{locale === 'ar' ? 'أضف العطلات أو ساعات العمل الخاصة.' : 'Add holidays or custom hours.'}</p><div className="mt-5 space-y-2">{overrideRows.map((override) => <div key={override.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3"><div className="min-w-0 flex-1"><p className="font-semibold wrap-anywhere">{override.label ?? (override.kind === 'closed' ? (locale === 'ar' ? 'مغلق' : 'Closed') : (locale === 'ar' ? 'ساعات مخصصة' : 'Custom hours'))}</p><p className="mt-1 text-xs text-ink-muted wrap-anywhere">{override.startDate} → {override.endDate}{override.startTime ? ` · ${override.startTime}–${override.endTime}` : ''}</p></div><DateOverrideDeleteButton locale={locale} slug={slug} overrideId={override.id} /></div>)}</div><DateOverrideForm locale={locale} slug={slug} /></div>
          </div>
        )}

        {tab === 'profile' && (
          // Redirect legacy ?tab=profile to ?tab=settings&sub=profile
          <script
            dangerouslySetInnerHTML={{
              __html: `window.location.replace(window.location.pathname + '?tab=settings&sub=profile')`
            }}
          />
        )}

        {tab === 'settings' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6 mt-9">
            {/* Settings sub-navigation */}
            <div className="flex flex-wrap items-center gap-2">
              {role !== 'receptionist' && role !== 'staff' && (
                <a
                  href="?tab=settings"
                  className={sub === 'profile' || sub === 'security'
                    ? 'inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-ink-muted hover:border-brand-teal hover:text-brand-teal transition'
                    : 'inline-flex items-center gap-2 rounded-xl bg-brand-teal px-3.5 py-2 text-xs font-semibold text-white shadow-xs'}
                >
                  <span>{locale === 'ar' ? 'إعدادات مساحة العمل' : 'Workspace Settings'}</span>
                </a>
              )}
              <a
                href="?tab=settings&sub=profile"
                className={sub === 'profile' || sub === 'security'
                  ? 'inline-flex items-center gap-2 rounded-xl bg-brand-teal px-3.5 py-2 text-xs font-semibold text-white shadow-xs'
                  : 'inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-ink-muted hover:border-brand-teal hover:text-brand-teal transition'}
              >
                <span>{locale === 'ar' ? 'الملف الشخصي والحساب' : 'My Profile & Account'}</span>
              </a>
            </div>

            {(sub === 'profile' || sub === 'security') ? (
              <UserProfileSettings
                locale={locale}
                slug={slug}
                initialSubTab={sub === 'security' ? 'security' : 'general'}
                user={{
                  id: access.session.user.id,
                  name:
                    staffRows.find((p) => p.userId === access.session.user.id || p.membershipId === access.membership.id)?.name ||
                    staffRows.find((p) => p.userId === access.session.user.id || p.membershipId === access.membership.id)?.fallbackName ||
                    access.session.user.name,
                  email: access.session.user.email,
                  phone: staffRows.find((p) => p.userId === access.session.user.id || p.membershipId === access.membership.id)?.phone,
                  preferredLocale: (access.session.user as any).preferredLocale || locale,
                  emailVerified: (access.session.user as any).emailVerified,
                  image: access.session.user.image,
                }}
                currentSession={{
                  id: access.session.session.id,
                  ipAddress: access.session.session.ipAddress,
                  userAgent: access.session.session.userAgent,
                  createdAt: access.session.session.createdAt,
                }}
              />
            ) : (
              <div className="rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6">
                <h2 className="text-lg font-semibold">{locale === 'ar' ? 'المعلومات الأساسية' : 'Basic information'}</h2>
                <p className="mt-1 text-sm text-ink-muted">{locale === 'ar' ? 'قم بتحديث اسم مساحة عملك ونوع نشاطك.' : 'Update your workspace name and business type.'}</p>
                <WorkspaceSettingsForm
                  locale={locale}
                  slug={slug}
                  currentName={tenantTranslation?.name ?? access.tenant.slug}
                  currentType={isBusinessType(access.tenant.businessType) ? access.tenant.businessType : 'other'}
                  currentCapacity={access.tenant.bookingCapacity ?? 1}
                />
              </div>
            )}
          </div>
        )}
    </>
  )
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return <div className="rounded-2xl border border-border bg-paper p-5 shadow-float"><div className="flex items-center justify-between"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f0faf9] text-brand-teal">{icon}</span><span className="text-2xl font-semibold">{value}</span></div><p className="mt-4 text-sm font-semibold text-[#172033]">{label}</p><p className="mt-1 text-xs text-ink-muted wrap-anywhere">{hint}</p></div>
}
