import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { aliasedTable, and, count, desc, eq, gte, isNull, lt, not } from 'drizzle-orm'
import { CalendarDays, CheckCircle2, ClipboardList, Pencil, Plus, Settings2, Users } from 'lucide-react'
import { requireTenantAccess } from '@/lib/authz'
import { dashboardCopy } from '@/lib/dashboard-nav'
import { db } from '@/lib/db'
import { bookingItems, bookings, customers, services } from '@/lib/db/schema'
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
import { StaffServicesForm } from '@/components/staff-services-form'
import { DateOverrideForm, DateOverrideDeleteButton } from '@/components/date-override-form'
import { SignOutButton } from '@/components/sign-out-button'
import { PublicWebsiteLink } from '@/components/public-website-link'
import { publicTenantUrl } from '@/lib/routes'
import { OnboardingSuccess } from '@/components/onboarding-success'
import { dateOverrides, staff, staffServices, staffTranslations, tenantTranslations, workingHours } from '@/lib/db/schema'
import { WorkspaceSettingsForm } from '@/components/workspace-settings-form'
import { ServiceImageForm } from '@/components/service-image-form'
import { serviceFocalPoint, numericCrop } from '@/lib/image-focal-point'
import { isBusinessType } from '@/lib/business-types'


export default async function TenantDashboard(props: { params: Promise<{ locale: Locale; slug: string }>; searchParams: Promise<{ tab?: string; page?: string }> }) {
  const { locale, slug } = await props.params
  const searchParams = await props.searchParams
  const tab = searchParams.tab || 'overview'
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1)
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

  const statusColors: Record<string, string> = {
    confirmed: 'bg-[#eaf8f1] text-[#24865b]',
    cancelled: 'bg-[#fdf2f2] text-[#b42318]',
    no_show: 'bg-[#f1f5f9] text-[#475569]'
  }

  const statusText: Record<string, { ar: string; en: string }> = {
    confirmed: { ar: 'مؤكد', en: 'Confirmed' },
    cancelled: { ar: 'ملغى', en: 'Cancelled' },
    no_show: { ar: 'لم يحضر', en: 'No-show' }
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

  const [appointmentCount, customerCount, serviceCount, completedThisMonthCount, customerRows, todayBookings, upcomingBookings, serviceRows, hoursRows, staffRows, assignmentRows, overrideRows, tenantTranslation, serviceBookingCounts] = await Promise.all([
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
    })
      .from(staff)
      .leftJoin(staffTranslations, and(eq(staffTranslations.staffId, staff.id), eq(staffTranslations.locale, locale)))
      .leftJoin(fallbackStaffTranslations, and(eq(fallbackStaffTranslations.staffId, staff.id), eq(fallbackStaffTranslations.locale, fallbackLocale)))
      .where(and(eq(staff.tenantId, access.tenant.id), eq(staff.isActive, true), isNull(staff.deletedAt)))
      .orderBy(staff.sortOrder),
    db.select({ staffId: staffServices.staffId, serviceId: staffServices.serviceId }).from(staffServices).where(eq(staffServices.tenantId, access.tenant.id)),
    db.select({ id: dateOverrides.id, startDate: dateOverrides.startDate, endDate: dateOverrides.endDate, kind: dateOverrides.kind, label: dateOverrides.label, startTime: dateOverrides.startTime, endTime: dateOverrides.endTime }).from(dateOverrides).where(and(eq(dateOverrides.tenantId, access.tenant.id), isNull(dateOverrides.staffId))).orderBy(dateOverrides.startDate),
    db.query.tenantTranslations.findFirst({ where: and(eq(tenantTranslations.tenantId, access.tenant.id), eq(tenantTranslations.locale, locale)) }),
    // Booking counts per service, so the delete confirmation can state the real
    // consequence before the tenant commits. Derived from data the page already
    // has access to — one grouped query, no per-row round trip.
    db.select({ serviceId: bookingItems.serviceId, value: count() }).from(bookingItems).where(eq(bookingItems.tenantId, access.tenant.id)).groupBy(bookingItems.serviceId),
  ])

  const bookingsByService = new Map(serviceBookingCounts.map((r) => [r.serviceId, r.value]))

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
                duplicated and the row stays compact. */}
            <div className="mt-6">
              <PublicWebsiteLink url={publicUrl} locale={locale} siteName={tenantDisplayName} />
            </div>

            {/* Quick actions: the common owner tasks, kept to one compact row. */}
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

            {onboardingComplete ? (
              // All steps done: collapse the checklist into a dismissible
              // success line so it stops dominating the Overview.
              <div className="mt-6">
                <OnboardingSuccess locale={locale} storageKey={`idarty:onboarding-success:${access.tenant.id}`} />
              </div>
            ) : (
            <div className="mt-6 rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-8">
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
            <div className="mt-9 rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{locale === 'ar' ? 'الفريق' : 'Team'}</h2><p className="mt-1 text-sm text-ink-muted">{locale === 'ar' ? 'أضف أعضاء الفريق الذين يقدمون الخدمات.' : 'Add the people who provide your services.'}</p></div><span className="shrink-0 rounded-full bg-[#f0faf9] px-3 py-1 text-xs font-semibold text-brand-teal">{staffRows.length}</span></div><div className="mt-5 space-y-3">{staffRows.map((person) => { const staffName = person.name || person.fallbackName; return <div key={person.id} className="rounded-2xl bg-surface px-4 py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="font-semibold wrap-anywhere">{staffName ?? (locale === 'ar' ? 'عضو فريق' : 'Team member')}</p><p className="mt-1 text-xs text-ink-muted wrap-anywhere">{person.email ?? person.phone ?? ''}</p></div><div className="flex shrink-0 items-center gap-3"><StaffEditForm slug={slug} locale={locale} staff={{ id: person.id, name: staffName ?? '', email: person.email ?? '', phone: person.phone ?? '' }} /><StaffArchiveButton slug={slug} locale={locale} staffId={person.id} /></div></div><StaffServicesForm slug={slug} locale={locale} staffId={person.id} services={serviceRows.map((service) => ({ id: service.id, name: service.name || service.fallbackName || (rtl ? 'خدمة' : 'Service') }))} selected={assignmentRows.filter((assignment) => assignment.staffId === person.id).map((assignment) => assignment.serviceId)} /></div> })}</div><StaffForm locale={locale} slug={slug} /></div>
            <div className="mt-6 rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6"><h2 className="text-lg font-semibold">{locale === 'ar' ? 'ساعات العمل' : 'Working hours'}</h2><p className="mt-1 text-sm text-ink-muted">{locale === 'ar' ? 'حدد الأوقات العامة المتاحة للحجز.' : 'Set the general hours available for bookings.'}</p><WorkingHoursForm locale={locale} slug={slug} hours={hoursRows} /></div>
            <div className="mt-6 rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6"><h2 className="text-lg font-semibold">{locale === 'ar' ? 'استثناءات المواعيد' : 'Date overrides'}</h2><p className="mt-1 text-sm text-ink-muted">{locale === 'ar' ? 'أضف العطلات أو ساعات العمل الخاصة.' : 'Add holidays or custom hours.'}</p><div className="mt-5 space-y-2">{overrideRows.map((override) => <div key={override.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3"><div className="min-w-0 flex-1"><p className="font-semibold wrap-anywhere">{override.label ?? (override.kind === 'closed' ? (locale === 'ar' ? 'مغلق' : 'Closed') : (locale === 'ar' ? 'ساعات مخصصة' : 'Custom hours'))}</p><p className="mt-1 text-xs text-ink-muted wrap-anywhere">{override.startDate} → {override.endDate}{override.startTime ? ` · ${override.startTime}–${override.endTime}` : ''}</p></div><DateOverrideDeleteButton locale={locale} slug={slug} overrideId={override.id} /></div>)}</div><DateOverrideForm locale={locale} slug={slug} /></div>
          </div>
        )}

        {tab === 'settings' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6 mt-9">
            <div className="rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6">
              <h2 className="text-lg font-semibold">{locale === 'ar' ? 'المعلومات الأساسية' : 'Basic information'}</h2>
              <p className="mt-1 text-sm text-ink-muted">{locale === 'ar' ? 'قم بتحديث اسم مساحة عملك ونوع نشاطك.' : 'Update your workspace name and business type.'}</p>
              <WorkspaceSettingsForm locale={locale} slug={slug} currentName={tenantTranslation?.name ?? access.tenant.slug} currentType={isBusinessType(access.tenant.businessType) ? access.tenant.businessType : 'other'} />
            </div>
          </div>
        )}
    </>
  )
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return <div className="rounded-2xl border border-border bg-paper p-5 shadow-float"><div className="flex items-center justify-between"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f0faf9] text-brand-teal">{icon}</span><span className="text-2xl font-semibold">{value}</span></div><p className="mt-4 text-sm font-semibold text-[#172033]">{label}</p><p className="mt-1 text-xs text-ink-muted wrap-anywhere">{hint}</p></div>
}
