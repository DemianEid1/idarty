'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { bookingItems, bookings, customers } from '@/lib/db/schema'
import { requireTenantAccess } from '@/lib/authz'
import { logAudit } from '@/lib/audit'
import { assertTenantBookingCapacity } from '@/lib/booking-capacity'

const inputSchema = z.object({ slug: z.string().min(2), bookingId: z.string().uuid(), startsAt: z.string().datetime() })

export async function rescheduleBooking(input: z.infer<typeof inputSchema>) {
  const data = inputSchema.parse(input)
  const access = await requireTenantAccess(await headers(), data.slug, 'manager')
  const item = await db.query.bookingItems.findFirst({ where: and(eq(bookingItems.bookingId, data.bookingId), eq(bookingItems.tenantId, access.tenant.id)) })
  const booking = await db.select({ locale: bookings.locale, email: customers.email }).from(bookings).innerJoin(customers, eq(customers.id, bookings.customerId)).where(and(eq(bookings.id, data.bookingId), eq(bookings.tenantId, access.tenant.id))).limit(1)
  if (!item || !booking[0]) return { ok: false as const, message: 'Booking not found' }
  const start = new Date(data.startsAt)
  if (start <= new Date()) return { ok: false as const, message: 'Choose a future time' }
  const end = new Date(start.getTime() + (item.endsAt.getTime() - item.startsAt.getTime()))
  const bufferBeforeMs = item.startsAt.getTime() - item.blockStartsAt.getTime()
  const bufferAfterMs = item.blockEndsAt.getTime() - item.endsAt.getTime()
  const blockStart = new Date(start.getTime() - bufferBeforeMs)
  const blockEnd = new Date(end.getTime() + bufferAfterMs)
  try {
    await db.transaction(async (tx) => {
      const capacityCheck = await assertTenantBookingCapacity(
        tx,
        access.tenant.id,
        blockStart,
        blockEnd,
        data.bookingId
      )
      if (!capacityCheck.allowed) {
        const err = new Error('TENANT_CAPACITY_EXCEEDED')
        ;(err as any).code = '23P01'
        throw err
      }

      // A zero-row match means the booking is no longer 'confirmed' (cancelled,
      // no-show, completed) or no longer belongs to this tenant. Treat it as a
      // state conflict, not a success: the audit event and confirmation email
      // below must never fire for a reschedule that changed nothing.
      const [updatedBooking] = await tx.update(bookings).set({ startsAt: start, endsAt: end, updatedAt: new Date() }).where(and(eq(bookings.id, data.bookingId), eq(bookings.tenantId, access.tenant.id), eq(bookings.status, 'confirmed'))).returning({ id: bookings.id })
      if (!updatedBooking) {
        const err = new Error('BOOKING_NOT_ACTIVE')
        ;(err as any).code = '23P01'
        throw err
      }
      await tx.update(bookingItems).set({ startsAt: start, endsAt: end, blockStartsAt: blockStart, blockEndsAt: blockEnd }).where(and(eq(bookingItems.bookingId, data.bookingId), eq(bookingItems.tenantId, access.tenant.id)))
    })
  } catch (error: any) {
    if (error.code === '23P01' || error.message === 'TENANT_CAPACITY_EXCEEDED' || error.message === 'BOOKING_NOT_ACTIVE') return { ok: false as const, message: 'Booking is no longer active' }
    throw error
  }
  await logAudit({
    actorUserId: access.session.user.id,
    action: 'booking.rescheduled',
    entityType: 'booking',
    entityId: data.bookingId,
    tenantId: access.tenant.id,
    metadata: { newStartsAt: start.toISOString() },
  }, await headers())
  if (booking[0].email) {
    const [{ sendTransactionalEmail }, { createBookingManageToken }] = await Promise.all([import('@/lib/email/send'), import('@/lib/booking-manage')])
    await sendTransactionalEmail({
      to: booking[0].email,
      template: 'booking',
      locale: booking[0].locale,
      url: `${process.env.BETTER_AUTH_URL ?? ''}/${booking[0].locale}/manage-booking?token=${createBookingManageToken(data.bookingId)}`,
      startsAt: start.toISOString(),
      idempotencyKey: `booking-reschedule/${data.bookingId}/${start.toISOString()}`,
    }).catch((error) => console.error('[idarty] booking reschedule failed', error))
  }
  revalidatePath('/[locale]/tenants/[slug]/dashboard', 'page')
  revalidatePath('/[locale]/tenants/[slug]/calendar', 'page')
  return { ok: true as const }
}
