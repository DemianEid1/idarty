'use server'

import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { revalidatePath, updateTag } from 'next/cache'
import { db } from '@/lib/db'
import { tenants, websiteConfig } from '@/lib/db/schema'
import { requireTenantAccess } from '@/lib/authz'
import { safeParseWebsiteConfig, validateWebsiteConfigForWrite } from '@/lib/website-config'
import type { Locale } from '@/lib/i18n'

const schema = z.object({
  slug: z.string().min(2),
  locale: z.enum(['ar', 'en']),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  logoBase64: z.string().optional(),
})

export async function saveBrandingColors(input: z.infer<typeof schema>) {
  const data = schema.parse(input)
  const access = await requireTenantAccess(await headers(), data.slug, 'admin')

  const current = await db.query.tenants.findFirst({ where: eq(tenants.slug, data.slug) })
  const currentTheme = (current?.theme ?? {}) as Record<string, string>

  // Update tenants.theme as the fallback/default theme
  await db.update(tenants).set({
    theme: { ...currentTheme, primaryColor: data.primaryColor, accentColor: data.accentColor, logo: data.logoBase64 ?? currentTheme.logo },
    updatedAt: new Date(),
  }).where(eq(tenants.id, access.tenant.id))

  // Also update the draft theme override in website_config
  const configRow = await db.query.websiteConfig.findFirst({
    where: eq(websiteConfig.tenantId, access.tenant.id),
  })

  if (configRow) {
    // Tolerant READ: recovers only shape errors and never constrains length, so
    // an existing value (including a long one) is never blanked by this route.
    const draftConfig = safeParseWebsiteConfig(configRow.draft)
    if (draftConfig) {
      const updatedDraft = {
        ...draftConfig,
        theme: {
          ...draftConfig.theme,
          primaryColor: data.primaryColor,
          accentColor: data.accentColor,
          logo: data.logoBase64 ?? draftConfig.theme.logo,
        },
      }

      // STRICT WRITE: the same shared validator saveDraft/publishChanges use, so
      // this route cannot persist a configuration the write rules reject. If the
      // existing draft carries an over-ceiling value the branding change is
      // reported rather than silently normalized away.
      const validated = validateWebsiteConfigForWrite(updatedDraft)
      if (!validated.ok) {
        return { ok: false as const, error: 'VALIDATION_FAILED', errors: validated.errors }
      }

      await db
        .update(websiteConfig)
        .set({
          // Draft column only — this route never writes the published columns.
          draft: validated.config as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(websiteConfig.tenantId, access.tenant.id))
    }
  }

  revalidatePath(`/${data.locale}/tenants/${data.slug}/dashboard`)
  revalidatePath(`/${data.locale}/tenants/${data.slug}`)
  // The website configuration is SHARED across locales (one `website_config`
  // row per tenant), so BOTH locale caches must be invalidated — otherwise the
  // other language keeps serving the previous branding. `updateTag` expires the
  // entry immediately (read-your-own-writes) instead of serving one stale
  // response the way `revalidateTag(tag, 'max')` does.
  updateTag(`tenant-public-${data.slug}-ar`)
  updateTag(`tenant-public-${data.slug}-en`)

  return { ok: true as const }
}
