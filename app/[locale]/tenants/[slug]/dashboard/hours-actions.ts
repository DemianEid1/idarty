"use server"

import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { headers } from 'next/headers'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { workingHours } from '@/lib/db/schema'
import { requireTenantAccess } from '@/lib/authz'

const schema = z.object({
  slug: z.string().min(1),
  locale: z.enum(['ar', 'en']),
  branchId: z.string().uuid().optional().nullable(),
  weekday: z.coerce.number().int().min(0).max(6),
  startTime: z.string().trim().optional().default('09:00'),
  endTime: z.string().trim().optional().default('17:00'),
  closed: z.coerce.boolean().default(false),
})

export async function saveWorkingHours(formData: FormData) {
  const input = schema.parse({
    slug: formData.get('slug'),
    locale: formData.get('locale'),
    branchId: formData.get('branchId') || null,
    weekday: formData.get('weekday'),
    startTime: formData.get('startTime') || '',
    endTime: formData.get('endTime') || '',
    closed: formData.get('closed') ?? false,
  })

  if (!input.closed) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime)) throw new Error('Invalid start time')
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.endTime)) throw new Error('Invalid end time')
    if (input.startTime >= input.endTime) throw new Error('End time must be after start time')
  }
  const access = await requireTenantAccess(await headers(), input.slug, 'manager')
  const branchCondition = input.branchId
    ? eq(workingHours.branchId, input.branchId)
    : isNull(workingHours.branchId)
  await db.transaction(async (tx) => {
    await tx.delete(workingHours).where(and(eq(workingHours.tenantId, access.tenant.id), eq(workingHours.weekday, input.weekday), isNull(workingHours.staffId), branchCondition))
    if (!input.closed) await tx.insert(workingHours).values({ tenantId: access.tenant.id, branchId: input.branchId || null, staffId: null, weekday: input.weekday, startTime: input.startTime, endTime: input.endTime })
  })
  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  revalidateTag(`tenant-public-${input.slug}-${input.locale}`, 'max')
  return { ok: true as const }
}
const bulkSchema = z.object({
  branchId: z.string().uuid().optional().nullable(),
  slug: z.string().min(1),
  locale: z.enum(['ar', 'en']),
  days: z.array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      startTime: z.string().trim().optional().default('09:00'),
      endTime: z.string().trim().optional().default('17:00'),
      closed: z.boolean(),
    })
  ),
})

export async function saveAllWorkingHours(input: {
  slug: string
  locale: 'ar' | 'en'
  branchId?: string | null
  days: Array<{
    weekday: number
    startTime: string
    endTime: string
    closed: boolean
  }>
}) {
  const parsed = bulkSchema.parse(input)
  // Normalize: for open days, replace empty/invalid times with safe defaults.
  // Browser <input type="time"> can return "" for an untouched field.
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
  const normalizedDays = parsed.days.map((d) => ({
    ...d,
    startTime: d.closed || TIME_RE.test(d.startTime ?? '') ? d.startTime : '09:00',
    endTime:   d.closed || TIME_RE.test(d.endTime   ?? '') ? d.endTime   : '17:00',
  }))
  for (const d of normalizedDays) {
    if (!d.closed) {
      if (!TIME_RE.test(d.startTime)) throw new Error('Invalid start time')
      if (!TIME_RE.test(d.endTime))   throw new Error('Invalid end time')
      if (d.startTime >= d.endTime)   throw new Error('End time must be after start time')
    }
  }
  const access = await requireTenantAccess(await headers(), parsed.slug, 'manager')
  const branchCondition = input.branchId
    ? eq(workingHours.branchId, input.branchId)
    : isNull(workingHours.branchId)
  await db.transaction(async (tx) => {
    await tx.delete(workingHours).where(and(eq(workingHours.tenantId, access.tenant.id), isNull(workingHours.staffId), branchCondition))
    const toInsert = normalizedDays
      .filter((d) => !d.closed)
      .map((d) => ({
        tenantId: access.tenant.id,
        branchId: parsed.branchId || null,
        staffId: null,
        weekday: d.weekday,
        startTime: d.startTime,
        endTime: d.endTime,
      }))
    if (toInsert.length > 0) {
      await tx.insert(workingHours).values(toInsert)
    }
  })
  revalidatePath(`/${parsed.locale}/tenants/${parsed.slug}/dashboard`)
  revalidateTag(`tenant-public-${parsed.slug}-${parsed.locale}`, 'max')
  return { ok: true as const }
}
