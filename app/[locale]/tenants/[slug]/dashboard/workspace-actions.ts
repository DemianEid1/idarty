'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { requireTenantAccess } from '@/lib/authz'
import { db } from '@/lib/db'
import { tenants, tenantTranslations } from '@/lib/db/schema'
import { businessTypes } from '@/lib/business-types'

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  businessType: z.enum(businessTypes),
  bookingCapacity: z.coerce.number().int().min(1).default(1),
})

export async function updateWorkspaceSettings(slug: string, locale: 'ar' | 'en', formData: FormData) {
  const access = await requireTenantAccess(await headers(), slug, 'manager')
  
  const parsed = schema.safeParse({
    name: formData.get('name'),
    businessType: formData.get('businessType'),
    bookingCapacity: formData.get('bookingCapacity'),
  })
  if (!parsed.success) return { error: 'Invalid data' }
  
  await db.transaction(async (tx) => {
    await tx.update(tenants).set({
      businessType: parsed.data.businessType,
      bookingCapacity: parsed.data.bookingCapacity,
    }).where(eq(tenants.id, access.tenant.id))
    
    const existing = await tx.select({ id: tenantTranslations.tenantId }).from(tenantTranslations).where(and(eq(tenantTranslations.tenantId, access.tenant.id), eq(tenantTranslations.locale, locale)))
    
    if (existing.length > 0) {
      await tx.update(tenantTranslations).set({ name: parsed.data.name }).where(and(eq(tenantTranslations.tenantId, access.tenant.id), eq(tenantTranslations.locale, locale)))
    } else {
      await tx.insert(tenantTranslations).values({ tenantId: access.tenant.id, locale, name: parsed.data.name })
    }
  })
  
  revalidatePath(`/${locale}/tenants/${slug}/dashboard`)
  return { success: true }
}
