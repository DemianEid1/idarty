"use server"

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { services, staff, staffServices, staffTranslations } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { requireTenantAccess } from '@/lib/authz'
import { staffAssignmentPatch, staffEditPatch } from '@/lib/phase-b-policy'

// Auto-format Egyptian local numbers to E.164.
// Empty string or omitted value is treated as null.
const e164 = z
  .string()
  .trim()
  .max(30)
  .transform((v) => {
    if (!v) return v
    const cleaned = v.replace(/[\s-]/g, '') // Remove spaces and dashes
    if (/^01[0125]\d{8}$/.test(cleaned)) {
      return '+2' + cleaned // Prepend Egypt code
    }
    return cleaned
  })
  .refine((v) => v === '' || /^\+[1-9]\d{6,14}$/.test(v), {
    message: 'Phone must be a valid local number (e.g. 010...) or international format (+...)',
  })
  .transform((v) => v || undefined)

const schema = z.object({ slug: z.string().min(1), locale: z.enum(['ar', 'en']), name: z.string().trim().min(2).max(80), email: z.string().email().optional().or(z.literal('')), phone: e164.optional() })

const idSchema = z.object({ slug: z.string().min(1), locale: z.enum(['ar', 'en']), staffId: z.string().uuid() })

export async function updateStaffServices(formData: FormData) {
  const input = z.object({ slug: z.string().min(1), locale: z.enum(['ar', 'en']), staffId: z.string().uuid(), serviceIds: z.array(z.string().uuid()).max(50) }).parse({ slug: formData.get('slug'), locale: formData.get('locale'), staffId: formData.get('staffId'), serviceIds: formData.getAll('serviceIds') })
  const access = await requireTenantAccess(await headers(), input.slug, 'manager')
  await db.transaction(async (tx) => {
    await tx.update(staff).set({ ...staffAssignmentPatch(), updatedAt: new Date() }).where(and(eq(staff.id, input.staffId), eq(staff.tenantId, access.tenant.id), eq(staff.isActive, true)))
    await tx.delete(staffServices).where(and(eq(staffServices.staffId, input.staffId), eq(staffServices.tenantId, access.tenant.id)))
    const activeServices = input.serviceIds.length ? await tx.select({ id: services.id }).from(services).where(and(eq(services.tenantId, access.tenant.id), eq(services.isActive, true))) : []
    const allowed = new Set(activeServices.map((service) => service.id))
    const rows = input.serviceIds.filter((id) => allowed.has(id)).map((serviceId) => ({ tenantId: access.tenant.id, staffId: input.staffId, serviceId }))
    if (rows.length) await tx.insert(staffServices).values(rows)
  })
  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  return { ok: true as const }
}

export async function updateStaff(formData: FormData) {
  const input = schema.extend({ staffId: z.string().uuid() }).parse({ slug: formData.get('slug'), locale: formData.get('locale'), name: formData.get('name'), email: formData.get('email') ?? '', phone: formData.get('phone') ?? '', staffId: formData.get('staffId') })
  const access = await requireTenantAccess(await headers(), input.slug, 'manager')
  await db.transaction(async (tx) => {
    await tx.update(staff).set({ ...staffEditPatch(input.email || null, input.phone || null), updatedAt: new Date() }).where(and(eq(staff.id, input.staffId), eq(staff.tenantId, access.tenant.id), eq(staff.isActive, true)))
    await tx
      .insert(staffTranslations)
      .values({
        tenantId: access.tenant.id,
        staffId: input.staffId,
        locale: input.locale,
        name: input.name,
      })
      .onConflictDoUpdate({
        target: [staffTranslations.staffId, staffTranslations.locale],
        set: { name: input.name },
      })
  })
  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  revalidatePath(`/${input.locale === 'ar' ? 'en' : 'ar'}/tenants/${input.slug}/dashboard`)
  return { ok: true as const }
}

export async function archiveStaff(formData: FormData) {
  const input = idSchema.parse({ slug: formData.get('slug'), locale: formData.get('locale'), staffId: formData.get('staffId') })
  const access = await requireTenantAccess(await headers(), input.slug, 'manager')
  await db.update(staff).set({ isActive: false, deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(staff.id, input.staffId), eq(staff.tenantId, access.tenant.id), eq(staff.isActive, true)))
  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  revalidatePath(`/${input.locale === 'ar' ? 'en' : 'ar'}/tenants/${input.slug}/dashboard`)
  return { ok: true as const }
}

export async function createStaff(formData: FormData) {
  const input = schema.parse({ slug: formData.get('slug'), locale: formData.get('locale'), name: formData.get('name'), email: formData.get('email') ?? '', phone: formData.get('phone') ?? '' })
  const access = await requireTenantAccess(await headers(), input.slug, 'manager')
  const created = await db.transaction(async (tx) => {
    const [person] = await tx.insert(staff).values({ tenantId: access.tenant.id, email: input.email || null, phoneE164: input.phone || null }).returning({ id: staff.id })
    await tx.insert(staffTranslations).values(
      (['ar', 'en'] as const).map((loc) => ({
        tenantId: access.tenant.id,
        staffId: person.id,
        locale: loc,
        name: input.name,
      }))
    )
    const activeServices = await tx
      .select({ id: services.id })
      .from(services)
      .where(and(eq(services.tenantId, access.tenant.id), eq(services.isActive, true)))
    if (activeServices.length > 0) {
      await tx.insert(staffServices).values(
        activeServices.map((srv) => ({
          tenantId: access.tenant.id,
          staffId: person.id,
          serviceId: srv.id,
        }))
      )
    }
    return person
  })
  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  revalidatePath(`/${input.locale === 'ar' ? 'en' : 'ar'}/tenants/${input.slug}/dashboard`)
  return { ok: true as const, id: created.id }
}
