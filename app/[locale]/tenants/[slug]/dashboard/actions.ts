"use server"

import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { and, count, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookingItems, serviceTranslations, services, staff, staffServices } from '@/lib/db/schema'
import { requireTenantAccess } from '@/lib/authz'
import { headers } from 'next/headers'
import { logAudit } from '@/lib/audit'
import { serviceEditPatch } from '@/lib/phase-b-policy'

const schema = z.object({ slug: z.string().min(1), locale: z.enum(['ar', 'en']), name: z.string().trim().min(2).max(80), description: z.string().trim().max(300).optional(), durationMin: z.coerce.number().int().min(15).max(480), priceAmount: z.coerce.number().min(0).max(1_000_000) })

export async function updateService(formData: FormData) {
  const input = schema.extend({ serviceId: z.string().uuid() }).parse({ slug: formData.get('slug'), locale: formData.get('locale'), name: formData.get('name'), description: formData.get('description') || undefined, durationMin: formData.get('durationMin'), priceAmount: formData.get('priceAmount'), serviceId: formData.get('serviceId') })
  const access = await requireTenantAccess(await headers(), input.slug, 'manager')
  await db.transaction(async (tx) => {
    await tx.update(services).set({ ...serviceEditPatch(input.durationMin, input.priceAmount.toFixed(2)), updatedAt: new Date() }).where(and(eq(services.id, input.serviceId), eq(services.tenantId, access.tenant.id), eq(services.isActive, true)))
    await tx
      .insert(serviceTranslations)
      .values({
        tenantId: access.tenant.id,
        serviceId: input.serviceId,
        locale: input.locale,
        name: input.name,
        description: input.description ?? null,
      })
      .onConflictDoUpdate({
        target: [serviceTranslations.serviceId, serviceTranslations.locale],
        set: {
          name: input.name,
          description: input.description ?? null,
        },
      })
  })
  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  revalidatePath(`/${input.locale === 'ar' ? 'en' : 'ar'}/tenants/${input.slug}/dashboard`)
  revalidateTag(`tenant-public-${input.slug}-ar`, 'max')
  revalidateTag(`tenant-public-${input.slug}-en`, 'max')
  revalidateTag(`tenant-services-${input.slug}-ar`, 'max')
  revalidateTag(`tenant-services-${input.slug}-en`, 'max')
  return { ok: true as const }
}

export async function archiveService(formData: FormData) {
  const input = z.object({ slug: z.string().min(1), locale: z.enum(['ar', 'en']), serviceId: z.string().uuid() }).parse({ slug: formData.get('slug'), locale: formData.get('locale'), serviceId: formData.get('serviceId') })
  const access = await requireTenantAccess(await headers(), input.slug, 'manager')

  // Soft delete. This is the ONLY safe mechanism for a service, because
  // `booking_items.service_id` references `services` WITHOUT `ON DELETE CASCADE`
  // (see 0001_init.sql): a hard DELETE would be rejected by the foreign key for
  // any service that has ever been booked, and forcing it would destroy booking
  // history. Deactivating keeps every historical booking intact and simply
  // removes the service from the booking flow and the public site.
  //
  // The WHERE also requires `isActive = true`, so a repeated click is a no-op
  // rather than a second audit entry.
  const [updated] = await db
    .update(services)
    .set({ isActive: false, deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(services.id, input.serviceId), eq(services.tenantId, access.tenant.id), eq(services.isActive, true)))
    .returning({ id: services.id })

  if (updated) {
    await logAudit({
      actorUserId: access.session.user.id,
      action: 'service.deleted',
      entityType: 'service',
      entityId: input.serviceId,
      tenantId: access.tenant.id,
      metadata: { slug: input.slug, mode: 'soft_delete' },
    })
  }

  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  revalidatePath(`/${input.locale === 'ar' ? 'en' : 'ar'}/tenants/${input.slug}/dashboard`)
  revalidateTag(`tenant-public-${input.slug}-ar`, 'max')
  revalidateTag(`tenant-public-${input.slug}-en`, 'max')
  revalidateTag(`tenant-services-${input.slug}-ar`, 'max')
  revalidateTag(`tenant-services-${input.slug}-en`, 'max')
  return { ok: true as const }
}

/**
 * Count the bookings that reference a service.
 *
 * Used by the UI to tell the tenant what deleting will do BEFORE they confirm,
 * so the consequence is stated rather than discovered.
 */
export async function countServiceBookings(formData: FormData) {
  const input = z.object({ slug: z.string().min(1), locale: z.enum(['ar', 'en']), serviceId: z.string().uuid() }).parse({ slug: formData.get('slug'), locale: formData.get('locale'), serviceId: formData.get('serviceId') })
  const access = await requireTenantAccess(await headers(), input.slug, 'manager')
  const [row] = await db
    .select({ value: count() })
    .from(bookingItems)
    .where(and(eq(bookingItems.tenantId, access.tenant.id), eq(bookingItems.serviceId, input.serviceId)))
  return { ok: true as const, bookings: row?.value ?? 0 }
}

export async function createService(formData: FormData) {
  const input = schema.parse({ slug: formData.get('slug'), locale: formData.get('locale'), name: formData.get('name'), description: formData.get('description') || undefined, durationMin: formData.get('durationMin'), priceAmount: formData.get('priceAmount') })
  const access = await requireTenantAccess(await headers(), input.slug, 'manager')
  const service = await db.transaction(async (tx) => {
    const [created] = await tx.insert(services).values({ tenantId: access.tenant.id, durationMin: input.durationMin, priceAmount: input.priceAmount.toFixed(2), sortOrder: 0 }).returning({ id: services.id })
    await tx.insert(serviceTranslations).values(
      (['ar', 'en'] as const).map((loc) => ({
        tenantId: access.tenant.id,
        serviceId: created.id,
        locale: loc,
        name: input.name,
        description: input.description ?? null,
      }))
    )
    const activeStaff = await tx
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.tenantId, access.tenant.id), eq(staff.isActive, true)))
    if (activeStaff.length > 0) {
      await tx.insert(staffServices).values(
        activeStaff.map((person) => ({
          tenantId: access.tenant.id,
          staffId: person.id,
          serviceId: created.id,
        }))
      )
    }
    return created
  })
  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  revalidatePath(`/${input.locale === 'ar' ? 'en' : 'ar'}/tenants/${input.slug}/dashboard`)
  revalidateTag(`tenant-public-${input.slug}-ar`, 'max')
  revalidateTag(`tenant-public-${input.slug}-en`, 'max')
  revalidateTag(`tenant-services-${input.slug}-ar`, 'max')
  revalidateTag(`tenant-services-${input.slug}-en`, 'max')
  return { ok: true as const, id: service.id }
}
