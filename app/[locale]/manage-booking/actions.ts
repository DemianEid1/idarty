'use server'

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { bookings, customers } from '@/lib/db/schema'
import { sendTransactionalEmail } from '@/lib/email/send'
import { createBookingManageToken } from '@/lib/booking-manage'
import { verifyBookingManageToken } from '@/lib/booking-manage'
import { logAudit } from '@/lib/audit'
import { acquireTenantBookingLock } from '@/lib/booking-capacity'

const inputSchema = z.object({ token: z.string().min(40), locale: z.enum(['ar', 'en']) })

export async function cancelPublicBooking(input: z.infer<typeof inputSchema>) {
  const data = inputSchema.parse(input)
  const bookingId = verifyBookingManageToken(data.token)
  if (!bookingId) return { ok: false as const, message: data.locale === 'ar' ? 'الرابط غير صالح.' : 'This link is invalid.' }
  const [details] = await db.select({ email: customers.email, startsAt: bookings.startsAt, locale: bookings.locale, tenantId: bookings.tenantId }).from(bookings).innerJoin(customers, eq(customers.id, bookings.customerId)).where(eq(bookings.id, bookingId)).limit(1)
  // The tenant id comes from the booking the verified token resolves to - never
  // from the request. No booking means no tenant to lock, and the existing
  // "cannot be cancelled" response is already the correct outcome for that case.
  if (!details) return { ok: false as const, message: data.locale === 'ar' ? 'لا يمكن إلغاء هذا الموعد.' : 'This appointment cannot be cancelled.' }
  // Cancellation releases tenant capacity, so it must take the same tenant
  // advisory lock the capacity consumers do, first, inside the transaction.
  const [booking] = await db.transaction(async (tx) => {
    await acquireTenantBookingLock(tx, details.tenantId)
    return tx.update(bookings).set({ status: 'cancelled', cancelledAt: new Date(), cancelReason: 'customer_request', updatedAt: new Date() }).where(and(eq(bookings.id, bookingId), eq(bookings.status, 'confirmed'))).returning({ id: bookings.id })
  })
  if (!booking) return { ok: false as const, message: data.locale === 'ar' ? 'لا يمكن إلغاء هذا الموعد.' : 'This appointment cannot be cancelled.' }
  await logAudit({
    action: 'booking.cancelled.customer',
    entityType: 'booking',
    entityId: bookingId,
    tenantId: details?.tenantId,
    metadata: { reason: 'customer_request' },
  })
  if (details?.email) await sendTransactionalEmail({ to: details.email, template: 'cancellation', locale: details.locale, startsAt: details.startsAt.toISOString(), url: `${process.env.BETTER_AUTH_URL ?? ''}/${data.locale}/manage-booking?token=${createBookingManageToken(booking.id)}`, idempotencyKey: `booking-cancellation/${booking.id}` }).catch((error) => console.error('[idarty] cancellation email failed', error))
  return { ok: true as const }
}
