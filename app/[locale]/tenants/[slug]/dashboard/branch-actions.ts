"use server"

import { headers } from 'next/headers'
import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { and, count, eq, isNull, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookings, branches, branchServices, branchTranslations, services, staff, staffBranches, tenantTranslations } from '@/lib/db/schema'
import { requireTenantAccess } from '@/lib/authz'
import { requirePermission } from '@/lib/permissions'
import { logAudit } from '@/lib/audit'
import { e164Phone as e164 } from '@/lib/phone'
import { slugifyName as slugify } from '@/lib/slug'

const createBranchSchema = z.object({
  slug: z.string().min(1),
  locale: z.enum(['ar', 'en']),
  name: z.string().trim().min(2).max(100),
  branchSlug: z.string().trim().max(60).optional(),
  address: z.string().trim().max(300).optional().or(z.literal('')),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  phone: e164.optional(),
  email: z.string().email().optional().or(z.literal('')),
  googleMapsUrl: z.string().trim().max(1000).optional().or(z.literal('')),
  bookingCapacity: z.coerce.number().int().min(1).default(1),
  isDefault: z.coerce.boolean().default(false),
})

export async function createBranch(formData: FormData) {
  const reqHeaders = await headers()
  const input = createBranchSchema.parse({
    slug: formData.get('slug'),
    locale: formData.get('locale'),
    name: formData.get('name'),
    branchSlug: formData.get('branchSlug') || '',
    address: formData.get('address') || '',
    description: formData.get('description') || '',
    phone: formData.get('phone') || '',
    email: formData.get('email') || '',
    googleMapsUrl: formData.get('googleMapsUrl') || '',
    bookingCapacity: formData.get('bookingCapacity') || 1,
    isDefault: formData.get('isDefault') === 'true' || formData.get('isDefault') === 'on',
  })

  const access = await requirePermission(reqHeaders, input.slug, 'branches:manage')
  const finalSlug = input.branchSlug ? slugify(input.branchSlug) : slugify(input.name)

  const created = await db.transaction(async (tx) => {
    // If setting as default, clear existing default flag
    if (input.isDefault) {
      await tx
        .update(branches)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(eq(branches.tenantId, access.tenant.id), eq(branches.isDefault, true)))
    } else {
      // Check if this is the first branch; if so, make it default automatically
      const existingCount = await tx
        .select({ value: count() })
        .from(branches)
        .where(and(eq(branches.tenantId, access.tenant.id), isNull(branches.archivedAt)))
      if ((existingCount[0]?.value ?? 0) === 0) {
        input.isDefault = true
      }
    }

    const [branch] = await tx
      .insert(branches)
      .values({
        tenantId: access.tenant.id,
        slug: finalSlug,
        phoneE164: input.phone || null,
        email: input.email || null,
        googleMapsUrl: input.googleMapsUrl ? input.googleMapsUrl.trim() : null,
        bookingCapacity: input.bookingCapacity,
        isDefault: input.isDefault,
        isActive: true,
      })
      .returning({ id: branches.id })

    // Insert localized translations for both ar & en
    await tx.insert(branchTranslations).values(
      (['ar', 'en'] as const).map((loc) => ({
        tenantId: access.tenant.id,
        branchId: branch.id,
        locale: loc,
        name: input.name,
        address: input.address || null,
        description: input.description || null,
      }))
    )

    // A new branch starts with every globally active service available, so it
    // behaves like the pre-existing branches until configured otherwise.
    const tenantServices = await tx
      .select({ id: services.id })
      .from(services)
      .where(and(eq(services.tenantId, access.tenant.id), eq(services.isActive, true)))
    if (tenantServices.length > 0) {
      await tx
        .insert(branchServices)
        .values(
          tenantServices.map((s) => ({
            tenantId: access.tenant.id,
            branchId: branch.id,
            serviceId: s.id,
            isAvailable: true,
          }))
        )
        .onConflictDoNothing()
    }

    return branch
  })

  await logAudit(
    {
      actorUserId: access.session.user.id,
      action: 'branch.created',
      entityType: 'branch',
      entityId: created.id,
      tenantId: access.tenant.id,
      metadata: { name: input.name, slug: finalSlug, capacity: input.bookingCapacity },
    },
    reqHeaders
  )

  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  revalidatePath(`/${input.locale === 'ar' ? 'en' : 'ar'}/tenants/${input.slug}/dashboard`)
  return { ok: true as const, branchId: created.id }
}

const updateBranchSchema = z.object({
  slug: z.string().min(1),
  locale: z.enum(['ar', 'en']),
  branchId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  address: z.string().trim().max(300).optional().or(z.literal('')),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  phone: e164.optional(),
  email: z.string().email().optional().or(z.literal('')),
  googleMapsUrl: z.string().trim().max(1000).optional().or(z.literal('')),
  bookingCapacity: z.coerce.number().int().min(1).default(1),
  isActive: z.coerce.boolean().default(true),
  isDefault: z.coerce.boolean().default(false),
})

export async function updateBranch(formData: FormData) {
  const reqHeaders = await headers()
  const input = updateBranchSchema.parse({
    slug: formData.get('slug'),
    locale: formData.get('locale'),
    branchId: formData.get('branchId'),
    name: formData.get('name'),
    address: formData.get('address') || '',
    description: formData.get('description') || '',
    phone: formData.get('phone') || '',
    email: formData.get('email') || '',
    googleMapsUrl: formData.get('googleMapsUrl') || '',
    bookingCapacity: formData.get('bookingCapacity') || 1,
    isActive: formData.get('isActive') !== 'false',
    isDefault: formData.get('isDefault') === 'true' || formData.get('isDefault') === 'on',
  })

  const access = await requirePermission(reqHeaders, input.slug, 'branches:manage')

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(branches)
      .where(
        and(
          eq(branches.id, input.branchId),
          eq(branches.tenantId, access.tenant.id),
          isNull(branches.archivedAt)
        )
      )
    if (!existing) throw new Error('BRANCH_NOT_FOUND')

    if (input.isDefault && !existing.isDefault) {
      await tx
        .update(branches)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(eq(branches.tenantId, access.tenant.id), eq(branches.isDefault, true)))
    }

    await tx
      .update(branches)
      .set({
        phoneE164: input.phone || null,
        email: input.email || null,
        googleMapsUrl: input.googleMapsUrl ? input.googleMapsUrl.trim() : null,
        bookingCapacity: input.bookingCapacity,
        isActive: input.isActive,
        isDefault: input.isDefault || existing.isDefault, // preserve default if was default
        updatedAt: new Date(),
      })
      .where(eq(branches.id, input.branchId))

    await tx
      .insert(branchTranslations)
      .values({
        tenantId: access.tenant.id,
        branchId: input.branchId,
        locale: input.locale,
        name: input.name,
        address: input.address || null,
        description: input.description || null,
      })
      .onConflictDoUpdate({
        target: [branchTranslations.branchId, branchTranslations.locale],
        set: {
          name: input.name,
          address: input.address || null,
          description: input.description || null,
        },
      })

    // If fallback locale translation is missing or still holds the generic tenant name, synchronize it
    const fallbackLocale = input.locale === 'ar' ? 'en' : 'ar'
    const [fallbackRow] = await tx
      .select({ name: branchTranslations.name })
      .from(branchTranslations)
      .where(and(eq(branchTranslations.branchId, input.branchId), eq(branchTranslations.locale, fallbackLocale)))

    const tenantTrans = await tx
      .select({ name: tenantTranslations.name })
      .from(tenantTranslations)
      .where(eq(tenantTranslations.tenantId, access.tenant.id))
    const tenantNames = new Set(tenantTrans.map((t) => t.name.toLowerCase().trim()))

    if (!fallbackRow || tenantNames.has(fallbackRow.name.toLowerCase().trim())) {
      await tx
        .insert(branchTranslations)
        .values({
          tenantId: access.tenant.id,
          branchId: input.branchId,
          locale: fallbackLocale,
          name: input.name,
          address: input.address || null,
          description: input.description || null,
        })
        .onConflictDoUpdate({
          target: [branchTranslations.branchId, branchTranslations.locale],
          set: {
            name: input.name,
            address: input.address || null,
            description: input.description || null,
          },
        })
    }
  })

  await logAudit(
    {
      actorUserId: access.session.user.id,
      action: 'branch.updated',
      entityType: 'branch',
      entityId: input.branchId,
      tenantId: access.tenant.id,
      metadata: { name: input.name, capacity: input.bookingCapacity },
    },
    reqHeaders
  )

  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  revalidatePath(`/${input.locale === 'ar' ? 'en' : 'ar'}/tenants/${input.slug}/dashboard`)
  return { ok: true as const }
}

const idSchema = z.object({
  slug: z.string().min(1),
  locale: z.enum(['ar', 'en']),
  branchId: z.string().uuid(),
})

export async function archiveBranch(formData: FormData) {
  const reqHeaders = await headers()
  const input = idSchema.parse({
    slug: formData.get('slug'),
    locale: formData.get('locale'),
    branchId: formData.get('branchId'),
  })

  const access = await requirePermission(reqHeaders, input.slug, 'branches:archive')

  const [branch] = await db
    .select()
    .from(branches)
    .where(
      and(
        eq(branches.id, input.branchId),
        eq(branches.tenantId, access.tenant.id),
        isNull(branches.archivedAt)
      )
    )

  if (!branch) {
    return { ok: false as const, message: input.locale === 'ar' ? 'الفرع غير موجود.' : 'Branch not found.' }
  }

  // Prevent archiving default branch if other active branches exist
  if (branch.isDefault) {
    const otherBranches = await db
      .select({ id: branches.id })
      .from(branches)
      .where(
        and(
          eq(branches.tenantId, access.tenant.id),
          ne(branches.id, input.branchId),
          isNull(branches.archivedAt)
        )
      )
      .limit(1)

    if (otherBranches.length > 0) {
      return {
        ok: false as const,
        message:
          input.locale === 'ar'
            ? 'لا يمكن أرشفة الفرع الافتراضي. يرجى تعيين فرع آخر كفرع افتراضي أولاً.'
            : 'Cannot archive the default branch. Please set another branch as default first.',
      }
    }
  }

  // Check for future active bookings
  const now = new Date()
  const activeBookings = await db
    .select({ value: count() })
    .from(bookings)
    .where(
      and(
        eq(bookings.tenantId, access.tenant.id),
        eq(bookings.branchId, input.branchId),
        sql`${bookings.status} IN ('pending', 'confirmed')`,
        sql`${bookings.startsAt} >= ${now}`
      )
    )

  const futureCount = activeBookings[0]?.value ?? 0
  if (futureCount > 0) {
    return {
      ok: false as const,
      message:
        input.locale === 'ar'
          ? `لا يمكن أرشفة الفرع لوجود ${futureCount} موعد قادم مسجل. يرجى إلغاء المواعيد أو نقلها أولاً.`
          : `Cannot archive branch: there are ${futureCount} active upcoming bookings. Please cancel or reschedule them first.`,
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(branches)
      .set({
        isActive: false,
        isDefault: false,
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(branches.id, input.branchId))

    // Remove staff assignments to archived branch
    await tx.delete(staffBranches).where(eq(staffBranches.branchId, input.branchId))
  })

  await logAudit(
    {
      actorUserId: access.session.user.id,
      action: 'branch.archived',
      entityType: 'branch',
      entityId: input.branchId,
      tenantId: access.tenant.id,
    },
    reqHeaders
  )

  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  revalidatePath(`/${input.locale === 'ar' ? 'en' : 'ar'}/tenants/${input.slug}/dashboard`)
  return { ok: true as const }
}

const branchServicesSchema = z.object({
  slug: z.string().min(1),
  locale: z.enum(['ar', 'en']),
  branchId: z.string().uuid(),
  serviceIds: z.array(z.string().uuid()),
})

/**
 * Replace one branch's service availability configuration.
 *
 * Every active tenant service gets an explicit row for this branch, so a
 * service the tenant unchecked is stored as `is_available = false` rather than
 * deleted (deleting would fall back to the "missing = available" default).
 * Services and their translations/prices are never modified, and no row for
 * another branch is touched.
 */
export async function updateBranchServices(formData: FormData) {
  const reqHeaders = await headers()
  const input = branchServicesSchema.parse({
    slug: formData.get('slug'),
    locale: formData.get('locale'),
    branchId: formData.get('branchId'),
    serviceIds: formData.getAll('serviceIds').map(String),
  })

  const access = await requirePermission(reqHeaders, input.slug, 'branches:manage')

  const [branch] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(
      and(
        eq(branches.id, input.branchId),
        eq(branches.tenantId, access.tenant.id),
        isNull(branches.archivedAt)
      )
    )
  if (!branch) return { ok: false as const, message: input.locale === 'ar' ? 'الفرع غير موجود.' : 'Branch not found.' }

  const activeServices = await db
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.tenantId, access.tenant.id), eq(services.isActive, true)))

  // Only tenant-owned service ids are accepted; anything else is ignored rather
  // than allowing a cross-tenant reference.
  const ownedIds = new Set(activeServices.map((s) => s.id))
  const selectedIds = new Set(input.serviceIds.filter((id) => ownedIds.has(id)))

  if (activeServices.length > 0) {
    await db
      .insert(branchServices)
      .values(
        activeServices.map((s) => ({
          tenantId: access.tenant.id,
          branchId: input.branchId,
          serviceId: s.id,
          isAvailable: selectedIds.has(s.id),
          updatedAt: new Date(),
        }))
      )
      .onConflictDoUpdate({
        target: [branchServices.branchId, branchServices.serviceId],
        set: { isAvailable: sql`excluded.is_available`, updatedAt: new Date() },
      })
  }

  await logAudit(
    {
      actorUserId: access.session.user.id,
      action: 'branch.services_updated',
      entityType: 'branch',
      entityId: input.branchId,
      tenantId: access.tenant.id,
      metadata: { availableServiceIds: Array.from(selectedIds) },
    },
    reqHeaders
  )

  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  revalidatePath(`/${input.locale === 'ar' ? 'en' : 'ar'}/tenants/${input.slug}/dashboard`)
  revalidateTag(`tenant-public-${input.slug}-ar`, 'max')
  revalidateTag(`tenant-public-${input.slug}-en`, 'max')
  revalidateTag(`tenant-services-${input.slug}-ar`, 'max')
  revalidateTag(`tenant-services-${input.slug}-en`, 'max')
  return { ok: true as const }
}

export async function setDefaultBranch(formData: FormData) {
  const reqHeaders = await headers()
  const input = idSchema.parse({
    slug: formData.get('slug'),
    locale: formData.get('locale'),
    branchId: formData.get('branchId'),
  })

  const access = await requirePermission(reqHeaders, input.slug, 'branches:manage')

  await db.transaction(async (tx) => {
    await tx
      .update(branches)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(branches.tenantId, access.tenant.id), eq(branches.isDefault, true)))

    await tx
      .update(branches)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(and(eq(branches.id, input.branchId), eq(branches.tenantId, access.tenant.id)))
  })

  await logAudit(
    {
      actorUserId: access.session.user.id,
      action: 'branch.set_default',
      entityType: 'branch',
      entityId: input.branchId,
      tenantId: access.tenant.id,
    },
    reqHeaders
  )

  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  revalidatePath(`/${input.locale === 'ar' ? 'en' : 'ar'}/tenants/${input.slug}/dashboard`)
  return { ok: true as const }
}

const staffAssignmentSchema = z.object({
  slug: z.string().min(1),
  locale: z.enum(['ar', 'en']),
  staffId: z.string().uuid(),
  branchId: z.string().uuid(),
  isPrimary: z.coerce.boolean().default(false),
})

export async function assignStaffToBranch(formData: FormData) {
  const reqHeaders = await headers()
  const input = staffAssignmentSchema.parse({
    slug: formData.get('slug'),
    locale: formData.get('locale'),
    staffId: formData.get('staffId'),
    branchId: formData.get('branchId'),
    isPrimary: formData.get('isPrimary') === 'true' || formData.get('isPrimary') === 'on',
  })

  const access = await requirePermission(reqHeaders, input.slug, 'branches:manage')

  // Verify staff belongs to tenant
  const [member] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.id, input.staffId), eq(staff.tenantId, access.tenant.id), eq(staff.isActive, true)))
  if (!member) throw new Error('STAFF_NOT_FOUND')

  // Verify branch belongs to tenant
  const [branch] = await db
    .select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.id, input.branchId), eq(branches.tenantId, access.tenant.id), isNull(branches.archivedAt)))
  if (!branch) throw new Error('BRANCH_NOT_FOUND')

  await db.transaction(async (tx) => {
    if (input.isPrimary) {
      await tx
        .update(staffBranches)
        .set({ isPrimary: false })
        .where(and(eq(staffBranches.staffId, input.staffId), eq(staffBranches.tenantId, access.tenant.id)))
    }

    await tx
      .insert(staffBranches)
      .values({
        staffId: input.staffId,
        branchId: input.branchId,
        tenantId: access.tenant.id,
        isPrimary: input.isPrimary,
      })
      .onConflictDoUpdate({
        target: [staffBranches.staffId, staffBranches.branchId],
        set: { isPrimary: input.isPrimary },
      })
  })

  await logAudit(
    {
      actorUserId: access.session.user.id,
      action: 'branch.staff_assigned',
      entityType: 'branch',
      entityId: input.branchId,
      tenantId: access.tenant.id,
      metadata: { staffId: input.staffId, isPrimary: input.isPrimary },
    },
    reqHeaders
  )

  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  revalidatePath(`/${input.locale === 'ar' ? 'en' : 'ar'}/tenants/${input.slug}/dashboard`)
  return { ok: true as const }
}

export async function removeStaffFromBranch(formData: FormData) {
  const reqHeaders = await headers()
  const input = staffAssignmentSchema.pick({ slug: true, locale: true, staffId: true, branchId: true }).parse({
    slug: formData.get('slug'),
    locale: formData.get('locale'),
    staffId: formData.get('staffId'),
    branchId: formData.get('branchId'),
  })

  const access = await requirePermission(reqHeaders, input.slug, 'branches:manage')

  await db
    .delete(staffBranches)
    .where(
      and(
        eq(staffBranches.staffId, input.staffId),
        eq(staffBranches.branchId, input.branchId),
        eq(staffBranches.tenantId, access.tenant.id)
      )
    )

  await logAudit(
    {
      actorUserId: access.session.user.id,
      action: 'branch.staff_removed',
      entityType: 'branch',
      entityId: input.branchId,
      tenantId: access.tenant.id,
      metadata: { staffId: input.staffId },
    },
    reqHeaders
  )

  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  revalidatePath(`/${input.locale === 'ar' ? 'en' : 'ar'}/tenants/${input.slug}/dashboard`)
  return { ok: true as const }
}
