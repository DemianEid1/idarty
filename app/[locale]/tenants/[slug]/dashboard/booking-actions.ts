'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { bookingItems, bookings, customers, services } from '@/lib/db/schema'
import { requireTenantAccess } from '@/lib/authz'
import { logAudit } from '@/lib/audit'
import { acquireTenantBookingLock, assertTenantBookingCapacity } from '@/lib/booking-capacity'

const inputSchema = z.object({ slug: z.string().min(2), bookingId: z.string().uuid() })

export async function cancelBooking(input: z.infer<typeof inputSchema>) {
  const data = inputSchema.parse(input)
  const access = await requireTenantAccess(await headers(), data.slug, 'manager')
  const booking = await db.select({ id: bookings.id, startsAt: bookings.startsAt, locale: bookings.locale, email: customers.email }).from(bookings).innerJoin(customers, eq(customers.id, bookings.customerId)).where(and(eq(bookings.id, data.bookingId), eq(bookings.tenantId, access.tenant.id), eq(bookings.status, 'confirmed'))).limit(1)
  // Status changes release capacity, so they must follow the same protocol as
  // the capacity consumers (public booking, manual booking, reschedule): take the
  // tenant advisory lock FIRST, inside the transaction, before touching the row.
  // Without it a cancellation committing mid-transaction leaves a creation reading
  // a stale-higher count and rejecting a slot that is actually free. The lock is
  // taken on the AUTHORIZED tenant id, never a request-supplied value.
  const result = await db.transaction(async (tx) => {
    await acquireTenantBookingLock(tx, access.tenant.id)
    return tx.update(bookings).set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() }).where(and(eq(bookings.id, data.bookingId), eq(bookings.tenantId, access.tenant.id), eq(bookings.status, 'confirmed'))).returning({ id: bookings.id })
  })
  if (result.length) {
    await logAudit({
      actorUserId: access.session.user.id,
      action: 'booking.cancelled',
      entityType: 'booking',
      entityId: data.bookingId,
      tenantId: access.tenant.id,
    }, await headers())
  }
  if (result.length && booking[0]?.email) {
    const [{ sendTransactionalEmail }, { createBookingManageToken }] = await Promise.all([import('@/lib/email/send'), import('@/lib/booking-manage')])
    await sendTransactionalEmail({
      to: booking[0].email,
      template: 'cancellation',
      locale: booking[0].locale,
      url: `${process.env.BETTER_AUTH_URL ?? ''}/${booking[0].locale}/manage-booking?token=${createBookingManageToken(booking[0].id)}`,
      startsAt: booking[0].startsAt.toISOString(),
      idempotencyKey: `booking-cancellation/${booking[0].id}/${new Date().toISOString()}`,
    }).catch((error) => console.error('[idarty] booking cancellation failed', error))
  }
  if (result.length) {
    revalidatePath('/[locale]/tenants/[slug]/dashboard', 'page')
    revalidatePath('/[locale]/tenants/[slug]/calendar', 'page')
  }
  return result.length ? { ok: true as const } : { ok: false as const, message: 'Booking is no longer active' }
}

export async function markNoShow(input: z.infer<typeof inputSchema>) {
  const data = inputSchema.parse(input)
  const access = await requireTenantAccess(await headers(), data.slug, 'manager')
  // Same protocol as cancelBooking: the lock must be acquired before the status
  // change so this capacity-releasing write cannot interleave with a creation
  // transaction mid-read. Authorized tenant id only.
  const result = await db.transaction(async (tx) => {
    await acquireTenantBookingLock(tx, access.tenant.id)
    return tx.update(bookings).set({ status: 'no_show', updatedAt: new Date() }).where(and(eq(bookings.id, data.bookingId), eq(bookings.tenantId, access.tenant.id), eq(bookings.status, 'confirmed'))).returning({ id: bookings.id })
  })
  if (result.length) {
    await logAudit({
      actorUserId: access.session.user.id,
      action: 'booking.no_show',
      entityType: 'booking',
      entityId: data.bookingId,
      tenantId: access.tenant.id,
    }, await headers())
  }
  if (result.length) {
    revalidatePath('/[locale]/tenants/[slug]/dashboard', 'page')
    revalidatePath('/[locale]/tenants/[slug]/calendar', 'page')
  }
  return result.length ? { ok: true as const } : { ok: false as const, message: 'Booking is no longer active' }
}

const manualBookingSchema = z.object({
  slug: z.string().min(2),
  locale: z.enum(['ar', 'en']),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().min(6).max(30),
  customerEmail: z.string().email().optional().or(z.literal('')),
  serviceId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  customerNote: z.string().max(500).optional().or(z.literal('')),
  internalNote: z.string().max(500).optional().or(z.literal('')),
})

export async function createManualBooking(input: z.infer<typeof manualBookingSchema>) {
  const data = manualBookingSchema.parse(input)
  const access = await requireTenantAccess(await headers(), data.slug, 'receptionist')

  const service = await db.query.services.findFirst({
    where: and(
      eq(services.id, data.serviceId),
      eq(services.tenantId, access.tenant.id),
      eq(services.isActive, true)
    ),
  })
  if (!service) {
    return {
      ok: false as const,
      message: data.locale === 'ar' ? 'الخدمة المختارة غير متوفرة.' : 'Selected service is not available.',
    }
  }

  const start = new Date(data.startsAt)
  if (Number.isNaN(start.getTime())) {
    return {
      ok: false as const,
      message: data.locale === 'ar' ? 'تاريخ ووقت غير صالح.' : 'Invalid date and time.',
    }
  }
  const end = new Date(start.getTime() + service.durationMin * 60_000)
  const blockStart = new Date(start.getTime() - service.bufferBeforeMin * 60_000)
  const blockEnd = new Date(end.getTime() + service.bufferAfterMin * 60_000)

  try {
    const result = await db.transaction(async (tx) => {
      const capacityCheck = await assertTenantBookingCapacity(
        tx,
        access.tenant.id,
        blockStart,
        blockEnd
      )
      if (!capacityCheck.allowed) {
        const err = new Error('TENANT_CAPACITY_EXCEEDED')
        ;(err as any).code = '23P01'
        throw err
      }

      const cleanPhone = data.customerPhone.replace(/[\s-]/g, '')
      const phoneE164 = /^01[0125]\d{8}$/.test(cleanPhone) ? '+2' + cleanPhone : cleanPhone

      let customerId: string
      const existingCustomer = await tx.query.customers.findFirst({
        where: and(
          eq(customers.tenantId, access.tenant.id),
          eq(customers.phoneE164, phoneE164),
          isNull(customers.deletedAt)
        ),
      })

      if (existingCustomer) {
        await tx
          .update(customers)
          .set({
            fullName: data.customerName,
            nameNormalized: data.customerName.toLowerCase(),
            email: data.customerEmail || existingCustomer.email,
            updatedAt: new Date(),
          })
          .where(eq(customers.id, existingCustomer.id))
        customerId = existingCustomer.id
      } else {
        const [inserted] = await tx
          .insert(customers)
          .values({
            tenantId: access.tenant.id,
            fullName: data.customerName,
            nameNormalized: data.customerName.toLowerCase(),
            phoneE164,
            email: data.customerEmail || null,
            preferredLocale: data.locale,
          })
          .returning({ id: customers.id })
        customerId = inserted.id
      }

      const idempotencyKey = `dash-${access.tenant.id}-${phoneE164}-${start.toISOString()}-${Date.now()}`

      const [booking] = await tx
        .insert(bookings)
        .values({
          tenantId: access.tenant.id,
          customerId,
          source: 'dashboard',
          status: 'confirmed',
          locale: data.locale,
          idempotencyKey,
          startsAt: start,
          endsAt: end,
          customerNote: data.customerNote || null,
          internalNote: data.internalNote || null,
          createdByUserId: access.session.user.id,
        })
        .returning({ id: bookings.id })

      await tx.insert(bookingItems).values({
        tenantId: access.tenant.id,
        bookingId: booking.id,
        serviceId: service.id,
        // Unassigned staff is represented EXPLICITLY as null, matching the
        // public booking path (book/actions.ts). The column is nullable under
        // migration 0012; stating null rather than omitting the key keeps both
        // write paths saying the same thing and makes the contract assertable.
        staffId: null,
        startsAt: start,
        endsAt: end,
        blockStartsAt: blockStart,
        blockEndsAt: blockEnd,
        priceAmount: service.priceAmount,
      })

      return booking
    })

    await logAudit(
      {
        actorUserId: access.session.user.id,
        action: 'booking.created_manually',
        entityType: 'booking',
        entityId: result.id,
        tenantId: access.tenant.id,
        metadata: {
          source: 'dashboard',
          serviceId: service.id,
          startsAt: start.toISOString(),
        },
      },
      await headers()
    )

    revalidatePath(`/${data.locale}/tenants/${data.slug}/dashboard`)
    revalidatePath(`/${data.locale}/tenants/${data.slug}/calendar`)
    revalidatePath('/[locale]/tenants/[slug]/dashboard', 'page')
    revalidatePath('/[locale]/tenants/[slug]/calendar', 'page')
    return { ok: true as const, bookingId: result.id }
  } catch (error: any) {
    if (error.code === '23P01' || error.message === 'TENANT_CAPACITY_EXCEEDED') {
      return {
        ok: false as const,
        message: data.locale === 'ar'
          ? 'هذا التوقيت تم حجزه للتو أو اكتملت السعة المتاحة. يرجى اختيار موعد آخر.'
          : 'This time slot was just booked or workspace capacity is full. Please choose another time.',
      }
    }
    console.error('[idarty] manual booking creation error:', error)
    return {
      ok: false as const,
      message: data.locale === 'ar'
        ? 'حدث خطأ أثناء إنشاء الحجز. يرجى المحاولة مرة أخرى.'
        : 'An error occurred while creating the booking. Please try again.',
    }
  }
}
