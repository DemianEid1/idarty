'use server'

import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { revalidatePath, updateTag } from 'next/cache'
import { db } from '@/lib/db'
import { websiteConfig, tenants } from '@/lib/db/schema'
import { requireTenantAccess } from '@/lib/authz'
import { logAudit } from '@/lib/audit'
import { parseWebsiteConfig, safeParseWebsiteConfig, createDefaultWebsiteConfig, validateWebsiteConfigForWrite } from '@/lib/website-config'
import {
  collectContactSocialIssues,
  collectPublishIssues,
  type ValidationIssue,
} from '@/lib/contact-social'
import type { Locale } from '@/lib/i18n'

// ---------------------------------------------------------------------------
// Result shapes
//
// The actions report failures as structured data rather than throwing, so the
// editor can show a field-level message and keep the tenant's text on screen.
// `errors` is only present when `ok` is false.
// ---------------------------------------------------------------------------

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; errors?: ValidationIssue[] }

/**
 * Validate a configuration for PERSISTENCE.
 *
 * Delegates to the SHARED write validator in lib/website-config.ts, which is
 * also used by the branding action, so every writer enforces the same payload
 * ceiling and core schema. Returns structured issues rather than throwing, so
 * the client's state is never disturbed by an exception.
 */
function validateForWrite(
  input: unknown
): { ok: true; config: ReturnType<typeof parseWebsiteConfig> } | { ok: false; errors: ValidationIssue[] } {
  return validateWebsiteConfigForWrite(input)
}

// ---------------------------------------------------------------------------
// Save Draft
// Updates the tenant's draft configuration with validated input.
// ---------------------------------------------------------------------------

export async function saveDraft(input: { slug: string; locale: Locale; config: unknown }): Promise<ActionResult> {
  const access = await requireTenantAccess(await headers(), input.slug, 'manager')

  const validated = validateForWrite(input.config)
  if (!validated.ok) {
    return { ok: false, error: 'VALIDATION_FAILED', errors: validated.errors }
  }

  await db
    .insert(websiteConfig)
    .values({
      tenantId: access.tenant.id,
      draft: validated.config as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: websiteConfig.tenantId,
      set: {
        draft: validated.config as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      },
    })

  await logAudit({
    actorUserId: access.session.user.id,
    action: 'website.draft.saved',
    entityType: 'website_config',
    entityId: access.tenant.id,
    tenantId: access.tenant.id,
    metadata: { slug: input.slug, sectionsCount: validated.config.sections.length },
  })

  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)

  return { ok: true as const }
}

// ---------------------------------------------------------------------------
// Publish Changes
// If config is provided, validates and publishes it directly (atomic save+draft+publish).
// If config is omitted, reads the persisted draft and publishes that.
// ---------------------------------------------------------------------------

export async function publishChanges(input: { slug: string; locale: Locale; config?: unknown }): Promise<ActionResult> {
  const access = await requireTenantAccess(await headers(), input.slug, 'admin')

  let validated: ReturnType<typeof parseWebsiteConfig>

  if (input.config !== undefined) {
    // Direct publish: validate the submitted config
    const result = validateForWrite(input.config)
    if (!result.ok) {
      return { ok: false, error: 'VALIDATION_FAILED', errors: result.errors }
    }
    validated = result.config
  } else {
    // Publish saved draft: read from database
    const row = await db.query.websiteConfig.findFirst({
      where: eq(websiteConfig.tenantId, access.tenant.id),
    })

    if (!row) {
      return { ok: false as const, error: 'NO_DRAFT' }
    }

    const parsed = safeParseWebsiteConfig(row.draft)
    if (!parsed) {
      return { ok: false as const, error: 'VALIDATION_FAILED' }
    }
    const issues = collectContactSocialIssues(parsed.contact, parsed.social)
    if (issues.length > 0) {
      return { ok: false as const, error: 'VALIDATION_FAILED', errors: issues }
    }
    validated = parsed
  }

  // Publish gate — applies to BOTH branches above, so neither can bypass it.
  // The selected CTA action must have a usable destination; there is
  // deliberately no fallback to a different action.
  const publishIssues = collectPublishIssues(validated.cta, validated.contact)
  if (publishIssues.length > 0) {
    return { ok: false as const, error: 'CTA_NO_DESTINATION', errors: publishIssues }
  }

  // Atomically update both draft and published in a single transaction
  await db.transaction(async (tx) => {
    await tx
      .update(websiteConfig)
      .set({
        draft: validated as unknown as Record<string, unknown>,
        published: validated as unknown as Record<string, unknown>,
        publishedAt: new Date(),
        publishedBy: access.session.user.id,
        updatedAt: new Date(),
      })
      .where(eq(websiteConfig.tenantId, access.tenant.id))
  })

  await logAudit({
    actorUserId: access.session.user.id,
    action: 'website.published',
    entityType: 'website_config',
    entityId: access.tenant.id,
    tenantId: access.tenant.id,
    metadata: { slug: input.slug, sectionsCount: validated.sections.length, directPublish: input.config !== undefined },
  })

  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)
  revalidatePath(`/${input.locale}/tenants/${input.slug}`)
  // The PUBLIC page reads through `unstable_cache` tagged
  // `tenant-public-<slug>-<locale>`. `revalidateTag(tag, 'max')` only marks that
  // entry STALE, so the next request is served the OLD cached page while
  // revalidation runs in the background — a tenant who published and then opened
  // their site still saw the previous version for up to the cache window.
  // `updateTag` expires the entry so the next request waits for fresh data
  // (read-your-own-writes), which is what publishing requires.
  //
  // Both locales are invalidated because the configuration is SHARED across
  // locales (one `website_config` row per tenant) — invalidating only the
  // current locale left the other language serving stale content.
  updateTag(`tenant-public-${input.slug}-ar`)
  updateTag(`tenant-public-${input.slug}-en`)

  return { ok: true as const }
}

// ---------------------------------------------------------------------------
// Discard Draft
// Resets the draft to the last published configuration.
// If no published config exists, resets to a valid default configuration so the
// editor never ends up with an unrecoverable, section-less draft.
// Returns the configuration the draft was reset to, so the client can sync its
// local editor state without relying on a stale server-rendered prop.
// ---------------------------------------------------------------------------

export async function discardDraft(input: { slug: string; locale: Locale }) {
  const access = await requireTenantAccess(await headers(), input.slug, 'admin')

  const row = await db.query.websiteConfig.findFirst({
    where: eq(websiteConfig.tenantId, access.tenant.id),
  })

  // If no row exists, nothing to discard
  if (!row) {
    return { ok: true as const, message: 'NO_CONFIG', config: null }
  }

  // Reset draft to the last published config. When the tenant has never
  // published, fall back to a valid default config (NOT `{}`, which would
  // parse to zero sections and leave the editor with no controls at all).
  const resetValue: Record<string, unknown> =
    (row.published as Record<string, unknown> | null) ??
    (createDefaultWebsiteConfig() as unknown as Record<string, unknown>)

  await db
    .update(websiteConfig)
    .set({
      draft: resetValue,
      updatedAt: new Date(),
    })
    .where(eq(websiteConfig.tenantId, access.tenant.id))

  await logAudit({
    actorUserId: access.session.user.id,
    action: 'website.draft.discarded',
    entityType: 'website_config',
    entityId: access.tenant.id,
    tenantId: access.tenant.id,
    metadata: { slug: input.slug, hadPublished: row.published !== null },
  })

  revalidatePath(`/${input.locale}/tenants/${input.slug}/dashboard`)

  return { ok: true as const, config: safeParseWebsiteConfig(resetValue) }
}
