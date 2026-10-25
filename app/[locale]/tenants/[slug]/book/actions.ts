'use server'

import { headers } from 'next/headers'
import { aliasedTable, and, eq, gt, gte, inArray, isNull, lte, lt, not, or } from 'drizzle-orm'
import { z } from 'zod'
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'
import { checkRateLimit } from '@/lib/rate-limit'
import { bookings, bookingItems, customers, dateOverrides, services, serviceTranslations, tenants, workingHours } from '@/lib/db/schema'
import { logAudit } from '@/lib/audit'
import { assertTenantBookingCapacity, calculatePeakConcurrency } from '@/lib/booking-capacity'

const bookingSchema = z.object({
  slug: z.string().min(2).max(80),
  locale: z.enum(['ar', 'en']),
  serviceId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).transform((v) => {
    const cleaned = v.replace(/[\s-]/g, '')
    if (/^01[0125]\d{8}$/.test(cleaned)) return '+2' + cleaned
    return cleaned
  }),
  email: z.string().email().optional().or(z.literal('')),
  startsAt: z.string().datetime({ offset: true }),
})

export async function createPublicBooking(input: z.infer<typeof bookingSchema>) {
  const data = bookingSchema.parse(input)

  // Rate-limit: max 5 booking attempts per phone per 10 minutes
  const rl = await checkRateLimit(`book:phone:${data.phone}`, 5, 10 * 60_000)
  if (!rl.allowed) {
    return {
      ok: false as const,
      message: data.locale === 'ar'
        ? 'لقد تجاوزت الحد المسموح به من المحاولات. يرجى الانتظار بضع دقائق والمحاولة مجدداً.'
        : 'Too many booking attempts. Please wait a few minutes and try again.',
    }
  }

  let tenant: any
  try {
    tenant = await db.query.tenants.findFirst({ where: eq(tenants.slug, data.slug) })
  } catch (err: any) {
    if (err?.code === '42703') {
      const rows = await db
        .select({
          id: tenants.id,
          slug: tenants.slug,
          status: tenants.status,
          timezone: tenants.timezone,
        })
        .from(tenants)
        .where(eq(tenants.slug, data.slug))
        .limit(1)
      tenant = rows[0]
    } else {
      throw err
    }
  }
  if (!tenant) return { ok: false as const, message: data.locale === 'ar' ? 'المساحة غير موجودة.' : 'Workspace not found.' }

  const service = await db.query.services.findFirst({ where: and(eq(services.id, data.serviceId), eq(services.tenantId, tenant.id), eq(services.isActive, true)) })
  if (!service) return { ok: false as const, message: data.locale === 'ar' ? 'الخدمة غير موجودة.' : 'Service not found.' }

  const start = new Date(data.startsAt)
  if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) {
    return { ok: false as const, message: data.locale === 'ar' ? 'اختر وقتاً مستقبلياً.' : 'Choose a future time.' }
  }
  const end = new Date(start.getTime() + service.durationMin * 60_000)
  const requestedDate = start.toISOString().slice(0, 10)
  const availableSlots = await getAvailableSlots(data.slug, requestedDate, data.serviceId)
  if (!availableSlots.includes(start.toISOString())) {
    const suggestions = availableSlots.filter(s => new Date(s) > start).slice(0, 3)
    return { ok: false as const, message: data.locale === 'ar' ? 'هذا الوقت لم يعد متاحاً. اختر وقتاً آخر.' : 'That time is no longer available. Choose another time.', suggestions }
  }
  const idempotencyKey = `public-${tenant.id}-${data.phone}-${start.toISOString()}`

  let result
  try {
    result = await db.transaction(async (tx) => {
      const existing = await tx.query.bookings.findFirst({ where: eq(bookings.idempotencyKey, idempotencyKey) })
      if (existing) return existing
      
      let customerId: string
      const existingCustomer = await tx.query.customers.findFirst({ where: and(eq(customers.tenantId, tenant.id), eq(customers.phoneE164, data.phone), isNull(customers.deletedAt)) })
      if (existingCustomer) {
        const updated = await tx.update(customers).set({ fullName: data.fullName, nameNormalized: data.fullName.toLowerCase(), email: data.email || null, preferredLocale: data.locale, updatedAt: new Date() }).where(eq(customers.id, existingCustomer.id)).returning({ id: customers.id })
        customerId = updated[0].id
      } else {
        const inserted = await tx.insert(customers).values({ tenantId: tenant.id, fullName: data.fullName, nameNormalized: data.fullName.toLowerCase(), phoneE164: data.phone, email: data.email || null, preferredLocale: data.locale }).returning({ id: customers.id })
        customerId = inserted[0].id
      }

      const blockStart = new Date(start.getTime() - service.bufferBeforeMin * 60_000)
      const blockEnd = new Date(end.getTime() + service.bufferAfterMin * 60_000)

      const capacityCheck = await assertTenantBookingCapacity(tx, tenant.id, blockStart, blockEnd)
      if (!capacityCheck.allowed) {
        const err = new Error('TENANT_CAPACITY_EXCEEDED')
        ;(err as any).code = '23P01'
        throw err
      }

      const booking = await tx.insert(bookings).values({ tenantId: tenant.id, customerId, source: 'online', locale: data.locale, idempotencyKey, startsAt: start, endsAt: end }).returning({ id: bookings.id })
      await tx.insert(bookingItems).values({ tenantId: tenant.id, bookingId: booking[0].id, serviceId: service.id, staffId: null, startsAt: start, endsAt: end, blockStartsAt: blockStart, blockEndsAt: blockEnd, priceAmount: service.priceAmount })
      return booking[0]
    })
  } catch (error: any) {
    if (error.code === '23P01' || error.message === 'TENANT_CAPACITY_EXCEEDED') {
      const suggestions = availableSlots.filter(s => new Date(s) > start).slice(0, 3)
      return { ok: false as const, message: data.locale === 'ar' ? 'هذا الوقت لم يعد متاحاً. اختر وقتاً آخر.' : 'That time is no longer available. Choose another time.', suggestions }
    }
    throw error
  }

  await logAudit({
    action: 'booking.created',
    entityType: 'booking',
    entityId: result.id,
    tenantId: tenant.id,
    metadata: { serviceId: service.id, startsAt: start.toISOString(), source: 'online' },
  }, await headers())
  if (data.email) {
    const { queueBookingReminder } = await import('@/lib/notifications')
    await queueBookingReminder({ tenantId: tenant.id, bookingId: result.id, recipient: data.email, locale: data.locale, startsAt: start })
    const { sendTransactionalEmail } = await import('@/lib/email/send')
    const { createBookingManageToken } = await import('@/lib/booking-manage')
    await sendTransactionalEmail({
      to: data.email,
      template: 'booking',
      locale: data.locale,
      url: `${process.env.BETTER_AUTH_URL ?? ''}/${data.locale}/manage-booking?token=${createBookingManageToken(result.id)}`,
      startsAt: start.toISOString(),
      idempotencyKey: `booking-confirmation/${result.id}`,
    }).catch((error) => console.error('[idarty] booking confirmation failed', error))
  }
  return { ok: true as const, bookingId: result.id }
}

export async function getAvailableSlots(slug: string, date: string, serviceId?: string) {
  // Rate-limit: max 60 slot-lookup requests per IP per minute
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rl = await checkRateLimit(`slots:ip:${ip}`, 60, 60_000)
  if (!rl.allowed) return []

  let tenant: any
  try {
    tenant = await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) })
  } catch (err: any) {
    if (err?.code === '42703') {
      const rows = await db
        .select({
          id: tenants.id,
          slug: tenants.slug,
          status: tenants.status,
          timezone: tenants.timezone,
        })
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .limit(1)
      tenant = rows[0]
    } else {
      throw err
    }
  }
  if (!tenant || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) return []
  if (tenant.status !== 'active') return []
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  
  const service = serviceId 
    ? await db.query.services.findFirst({ where: and(eq(services.id, serviceId), eq(services.tenantId, tenant.id), eq(services.isActive, true)) })
    : await db.query.services.findFirst({ where: and(eq(services.tenantId, tenant.id), eq(services.isActive, true), eq(services.isSample, false)) })
  
  if (!service) return []

  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tenant.timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  const startUtc = new Date(`${date}T00:00:00Z`).getTime() - 14 * 3600000
  const endUtc = new Date(`${date}T23:59:59Z`).getTime() + 14 * 3600000

  const minNoticeMs = 2 * 3600_000 // 2 hours
  const maxNoticeMs = 60 * 24 * 3600_000 // 60 days
  const nowMs = Date.now()

  const availableSlotSet = new Set<string>()

  // Always use workspace-level working hours (staffId IS NULL) regardless of staff assignments.
  // This ensures all services show slots based on the general workspace schedule.
  const hours = await db.query.workingHours.findMany({
    where: and(
      eq(workingHours.tenantId, tenant.id),
      eq(workingHours.weekday, day),
      isNull(workingHours.staffId)
    ),
  })

  if (hours.length === 0) return []

  const overrides = await db.query.dateOverrides.findMany({
    where: and(
      eq(dateOverrides.tenantId, tenant.id),
      isNull(dateOverrides.staffId),
      lte(dateOverrides.startDate, date),
      gte(dateOverrides.endDate, date)
    ),
  })

  if (overrides.some((override) => override.kind === 'closed')) return []

  const effectiveHours = overrides.some((override) => override.kind === 'custom_hours')
    ? overrides.filter((override) => override.kind === 'custom_hours').map((override) => ({ startTime: override.startTime!, endTime: override.endTime! }))
    : hours

  // Query active bookings for this tenant on the day to evaluate capacity
  const dayStart = new Date(startUtc)
  const dayEnd = new Date(endUtc)
  const tenantCapacity = Math.max(1, tenant.bookingCapacity ?? 1)

  const activeBookingItems = await db
    .select({
      bookingId: bookingItems.bookingId,
      blockStartsAt: bookingItems.blockStartsAt,
      blockEndsAt: bookingItems.blockEndsAt,
    })
    .from(bookingItems)
    .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
    .where(
      and(
        eq(bookingItems.tenantId, tenant.id),
        inArray(bookings.status, ['pending', 'confirmed']),
        lt(bookingItems.blockStartsAt, dayEnd),
        gt(bookingItems.blockEndsAt, dayStart)
      )
    )

  for (let time = startUtc; time <= endUtc; time += 30 * 60000) {
    if (time < nowMs + minNoticeMs || time > nowMs + maxNoticeMs) continue
    const d = new Date(time)
    const parts = formatter.formatToParts(d)
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]))
    const localDateStr = `${p.year}-${p.month}-${p.day}`
    if (localDateStr === date) {
      const minutes = parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10)
      for (const range of effectiveHours) {
        const [sh, sm] = range.startTime.split(':').map(Number)
        const [eh, em] = range.endTime.split(':').map(Number)
        if (
          minutes - service.bufferBeforeMin >= sh * 60 + sm &&
          minutes + service.durationMin + service.bufferAfterMin <= eh * 60 + em
        ) {
          const slotBlockStart = new Date(time - service.bufferBeforeMin * 60_000)
          const slotBlockEnd = new Date(time + (service.durationMin + service.bufferAfterMin) * 60_000)

          const peakConcurrency = calculatePeakConcurrency(
            activeBookingItems,
            slotBlockStart,
            slotBlockEnd
          )

          if (peakConcurrency < tenantCapacity) {
            availableSlotSet.add(d.toISOString())
          }
          break
        }
      }
    }
  }

  return Array.from(availableSlotSet).sort()
}

function createPublicServicesCache(slug: string, locale: 'ar' | 'en') {
  return unstable_cache(
    async () => {
      const tenant = await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) })
      if (!tenant) return []
      const fallbackLocale = locale === 'ar' ? 'en' : 'ar'
      const fallbackTranslations = aliasedTable(serviceTranslations, 'fallback_book_service_translations')
      const rows = await db
        .select({
          id: services.id,
          name: serviceTranslations.name,
          fallbackName: fallbackTranslations.name,
          durationMin: services.durationMin,
          priceAmount: services.priceAmount,
        })
        .from(services)
        .leftJoin(
          serviceTranslations,
          and(eq(serviceTranslations.serviceId, services.id), eq(serviceTranslations.locale, locale))
        )
        .leftJoin(
          fallbackTranslations,
          and(eq(fallbackTranslations.serviceId, services.id), eq(fallbackTranslations.locale, fallbackLocale))
        )
        .where(
          and(
            eq(services.tenantId, tenant.id),
            eq(services.isActive, true),
            eq(services.isSample, false),
            isNull(services.deletedAt)
          )
        )
        .orderBy(services.sortOrder)
        .limit(20)

      return rows.map((r) => ({
        id: r.id,
        name: r.name || r.fallbackName || (locale === 'ar' ? 'خدمة' : 'Service'),
        durationMin: r.durationMin,
        priceAmount: r.priceAmount,
      }))
    },
    ['public-services', slug, locale],
    { revalidate: 60, tags: [`tenant-services-${slug}-${locale}`] }
  )
}

export async function getPublicServices(slug: string, locale: 'ar' | 'en') {
  const getCachedPublicServices = createPublicServicesCache(slug, locale)
  return getCachedPublicServices()
} 
