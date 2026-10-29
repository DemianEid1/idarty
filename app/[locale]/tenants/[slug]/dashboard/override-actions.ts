"use server"

import { headers } from 'next/headers'
import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { dateOverrides } from '@/lib/db/schema'
import { requireTenantAccess } from '@/lib/authz'

const timeSchema = z.string().optional().transform(v => v || undefined).refine(v => !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), 'Invalid time format')

const schema = z.object({ slug: z.string().min(1), locale: z.enum(['ar', 'en']), startDate: z.string().date(), endDate: z.string().date(), kind: z.enum(['closed', 'custom_hours']), startTime: timeSchema, endTime: timeSchema, label: z.string().trim().max(120).optional(), branchId: z.string().uuid().optional().or(z.literal('')).transform(v => v || null) })

export async function createDateOverride(formData: FormData) {
  const input = schema.parse(Object.fromEntries(formData))
  if (input.endDate < input.startDate) throw new Error('End date must be on or after start date')
  if (input.kind === 'custom_hours' && (!input.startTime || !input.endTime || input.startTime >= input.endTime)) throw new Error('Custom hours must have a valid range')
  const access = await requireTenantAccess(await headers(), input.slug, 'manager')
  await db.insert(dateOverrides).values({ tenantId: access.tenant.id, branchId: input.branchId, staffId: null, startDate: input.startDate, endDate: input.endDate, kind: input.kind, startTime: input.kind === 'custom_hours' ? input.startTime : null, endTime: input.kind === 'custom_hours' ? input.endTime : null, label: input.label || null })
  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  revalidatePath(`/${input.locale}/tenants/${input.slug}/book`)
  revalidateTag(`tenant-public-${input.slug}-${input.locale}`, 'max')
  return { ok: true as const }
}

const deleteSchema = z.object({ slug: z.string().min(1), locale: z.enum(['ar', 'en']), overrideId: z.string().uuid() })

export async function deleteDateOverride(formData: FormData) {
  const input = deleteSchema.parse({ slug: formData.get('slug'), locale: formData.get('locale'), overrideId: formData.get('overrideId') })
  const access = await requireTenantAccess(await headers(), input.slug, 'manager')
  await db.delete(dateOverrides).where(and(eq(dateOverrides.id, input.overrideId), eq(dateOverrides.tenantId, access.tenant.id)))
  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  revalidatePath(`/${input.locale}/tenants/${input.slug}/book`)
  revalidateTag(`tenant-public-${input.slug}-${input.locale}`, 'max')
  return { ok: true as const }
}
