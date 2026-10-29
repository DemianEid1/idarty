"use server"

import { revalidatePath, revalidateTag } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tenantTranslations, tenants } from '@/lib/db/schema'
import { requireTenantAccess } from '@/lib/authz'

// Timezone is any zone the runtime understands (so regional values saved during
// onboarding stay editable), and currency is any ISO-4217-shaped code.
const isValidTimezone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

const schema = z.object({ slug: z.string().min(1), locale: z.enum(['ar', 'en']), name: z.string().trim().min(2).max(100), tagline: z.string().trim().max(160), description: z.string().trim().max(500), address: z.string().trim().max(200), phone: z.string().trim().max(30), email: z.string().trim().email().or(z.literal('')), defaultLocale: z.enum(['ar', 'en']), supportedLocales: z.string(), timezone: z.string().trim().min(1).max(80).refine(isValidTimezone, { message: 'Invalid timezone' }), currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/) })

export async function updateTenantWebsite(formData: FormData) {
  const input = schema.parse(Object.fromEntries(formData))
  const access = await requireTenantAccess(await headers(), input.slug, 'manager')
  await db.transaction(async (tx) => {
    const supportedLocales = input.supportedLocales.split(',').filter((value): value is 'ar' | 'en' => value === 'ar' || value === 'en')
    await tx.update(tenants).set({ phoneE164: input.phone || null, email: input.email || null, defaultLocale: input.defaultLocale, supportedLocales: supportedLocales.length ? supportedLocales : ['ar', 'en'], timezone: input.timezone, currency: input.currency, updatedAt: new Date() }).where(eq(tenants.id, access.tenant.id))
    await tx.insert(tenantTranslations).values({ tenantId: access.tenant.id, locale: input.locale, name: input.name, tagline: input.tagline || null, description: input.description || null, address: input.address || null }).onConflictDoUpdate({ target: [tenantTranslations.tenantId, tenantTranslations.locale], set: { name: input.name, tagline: input.tagline || null, description: input.description || null, address: input.address || null } })
  })
  revalidatePath(`/${input.locale}/tenants/${input.slug}`)
  revalidatePath(`/${input.locale}/tenants/${input.slug}/settings`)
  revalidateTag(`tenant-public-${input.slug}-${input.locale}`, 'max')
  revalidateTag(`tenant-services-${input.slug}-${input.locale}`, 'max')
  return { ok: true as const }
}
