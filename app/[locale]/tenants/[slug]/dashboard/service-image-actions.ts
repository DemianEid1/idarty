'use server'

import { headers } from 'next/headers'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { revalidatePath, revalidateTag } from 'next/cache'
import { db } from '@/lib/db'
import { services } from '@/lib/db/schema'
import { requireTenantAccess } from '@/lib/authz'
import { logAudit } from '@/lib/audit'
import { MAX_SERVICE_IMAGE_SIZE, validateImageBase64 } from '@/lib/image-validation'
import { DEFAULT_FOCAL_POINT } from '@/lib/image-focal-point'
import { resolveCrop, type ImageCrop } from '@/lib/image-crop'
import type { Locale } from '@/lib/i18n'

const focalPointSchema = z.object({
  x: z.number().int().min(0).max(100),
  y: z.number().int().min(0).max(100),
})

/**
 * A crop rectangle. Bounds mirror the website-config schema so the same rules
 * hold for service images and hero images.
 */
const cropSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.05).max(1),
  height: z.number().min(0.05).max(1),
})

const schema = z.object({
  slug: z.string().min(2),
  locale: z.enum(['ar', 'en']),
  serviceId: z.string().uuid(),
  imageBase64: z.string(),
  // The crop the user framed in the cropper, applied as part of the save.
  crop: cropSchema.optional(),
  // LEGACY: the pre-cropper focal point. Still accepted so nothing that used to
  // work breaks; the UI no longer sends it.
  focalPoint: focalPointSchema.optional(),
})

const removeSchema = z.object({
  slug: z.string().min(2),
  locale: z.enum(['ar', 'en']),
  serviceId: z.string().uuid(),
})

const cropOnlySchema = z.object({
  slug: z.string().min(2),
  locale: z.enum(['ar', 'en']),
  serviceId: z.string().uuid(),
  crop: cropSchema,
})

/** Persist a crop rectangle, and mirror its centre into the legacy columns. */
function cropColumns(crop: ImageCrop) {
  const resolved = resolveCrop(crop)
  if (!resolved) return {}
  const cx = Math.round((resolved.x + resolved.width / 2) * 100)
  const cy = Math.round((resolved.y + resolved.height / 2) * 100)
  return {
    imageCropX: resolved.x.toFixed(4),
    imageCropY: resolved.y.toFixed(4),
    imageCropWidth: resolved.width.toFixed(4),
    imageCropHeight: resolved.height.toFixed(4),
    // Keep the legacy focal point in step so any reader of the old columns
    // still lands on the same part of the image.
    imageFocalX: Math.min(100, Math.max(0, cx)),
    imageFocalY: Math.min(100, Math.max(0, cy)),
  }
}

export async function saveServiceImage(input: z.infer<typeof schema>) {
  const data = schema.parse(input)
  const access = await requireTenantAccess(await headers(), data.slug, 'manager')

  // Validate image
  const validation = validateImageBase64(data.imageBase64, MAX_SERVICE_IMAGE_SIZE)
  if (!validation.ok) {
    return { ok: false as const, error: validation.error }
  }

  // Check service exists and belongs to tenant
  const service = await db.query.services.findFirst({
    where: and(eq(services.id, data.serviceId), eq(services.tenantId, access.tenant.id)),
  })

  if (!service) {
    return { ok: false as const, error: 'Service not found.' }
  }

  // The image being saved and the crop are validated together: a rejected crop
  // aborts the whole save, so the row can never end up with a new image and a
  // mismatched crop.
  await db
    .update(services)
    .set({
      image: data.imageBase64,
      ...(data.crop
        ? cropColumns(data.crop)
        : data.focalPoint
          ? { imageFocalX: data.focalPoint.x, imageFocalY: data.focalPoint.y }
          : service.image === null
            // A brand-new image with no crop supplied: no crop metadata, which
            // renders the whole image — the same as every pre-crop image.
            ? { imageFocalX: DEFAULT_FOCAL_POINT.x, imageFocalY: DEFAULT_FOCAL_POINT.y }
            : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(services.id, data.serviceId), eq(services.tenantId, access.tenant.id)))

  await logAudit({
    actorUserId: access.session.user.id,
    action: 'service.image.saved',
    entityType: 'service',
    entityId: data.serviceId,
    tenantId: access.tenant.id,
    metadata: { slug: data.slug, cropped: Boolean(data.crop) },
  })

  revalidatePath(`/${data.locale}/tenants/${data.slug}/dashboard`)
  revalidateTag(`tenant-public-${data.slug}-${data.locale}`, 'max')

  return { ok: true as const }
}

/**
 * Set the crop for a service image WITHOUT re-uploading it.
 *
 * The stored image is never re-encoded or re-cropped — only the crop metadata
 * changes, which is what makes re-opening the cropper lossless. Passing the full
 * image (1×1) clears the crop.
 */
export async function saveServiceImageCrop(input: z.infer<typeof cropOnlySchema>) {
  const data = cropOnlySchema.parse(input)
  const access = await requireTenantAccess(await headers(), data.slug, 'manager')

  // Tenant-scoped lookup: another tenant's service is indistinguishable from a
  // missing one, so a cross-tenant write is impossible here.
  const service = await db.query.services.findFirst({
    where: and(eq(services.id, data.serviceId), eq(services.tenantId, access.tenant.id)),
  })

  if (!service) {
    return { ok: false as const, error: 'Service not found.' }
  }

  if (!service.image) {
    return { ok: false as const, error: 'This service has no image to crop.' }
  }

  const resolved = resolveCrop(data.crop)
  if (!resolved) {
    return { ok: false as const, error: 'Invalid crop area.' }
  }

  await db
    .update(services)
    .set({ ...cropColumns(resolved), updatedAt: new Date() })
    .where(and(eq(services.id, data.serviceId), eq(services.tenantId, access.tenant.id)))

  await logAudit({
    actorUserId: access.session.user.id,
    action: 'service.image.crop.saved',
    entityType: 'service',
    entityId: data.serviceId,
    tenantId: access.tenant.id,
    metadata: { slug: data.slug, crop: resolved },
  })

  revalidatePath(`/${data.locale}/tenants/${data.slug}/dashboard`)
  revalidateTag(`tenant-public-${data.slug}-${data.locale}`, 'max')

  return { ok: true as const }
}

export async function removeServiceImage(input: z.infer<typeof removeSchema>) {
  const data = removeSchema.parse(input)
  const access = await requireTenantAccess(await headers(), data.slug, 'manager')

  // Check service exists and belongs to tenant
  const service = await db.query.services.findFirst({
    where: and(eq(services.id, data.serviceId), eq(services.tenantId, access.tenant.id)),
  })

  if (!service) {
    return { ok: false as const, error: 'Service not found.' }
  }

  // Remove the service image AND all its crop metadata, so no stale crop can be
  // applied to a future, different image.
  await db
    .update(services)
    .set({
      image: null,
      imageFocalX: null,
      imageFocalY: null,
      imageCropX: null,
      imageCropY: null,
      imageCropWidth: null,
      imageCropHeight: null,
      updatedAt: new Date(),
    })
    .where(and(eq(services.id, data.serviceId), eq(services.tenantId, access.tenant.id)))

  await logAudit({
    actorUserId: access.session.user.id,
    action: 'service.image.removed',
    entityType: 'service',
    entityId: data.serviceId,
    tenantId: access.tenant.id,
    metadata: { slug: data.slug },
  })

  revalidatePath(`/${data.locale}/tenants/${data.slug}/dashboard`)
  revalidateTag(`tenant-public-${data.slug}-${data.locale}`, 'max')

  return { ok: true as const }
}
