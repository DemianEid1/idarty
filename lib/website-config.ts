import { z } from 'zod'
import { isValidHeroImageDataUrl } from '@/lib/image-validation'
import {
  contactSchemaRead,
  contactSchemaWrite,
  socialSchemaRead,
  socialSchemaWrite,
  ctaSchemaRead,
  ctaSchemaWrite,
  mobileStickyCtaSchemaRead,
  mobileStickyCtaSchemaWrite,
  createDefaultContact,
  createDefaultSocial,
  createDefaultCta,
  createDefaultMobileStickyCta,
  hasVisibleContactData,
  collectContactSocialIssues,
  type ValidationIssue,
  type ContactConfig,
  type SocialConfig,
  type CtaConfig,
  type MobileStickyCtaConfig,
} from '@/lib/contact-social'

// ---------------------------------------------------------------------------
// Website Configuration Validation
// Validates the draft/published JSON stored in website_config.
// ---------------------------------------------------------------------------

const localeSchema = z.enum(['ar', 'en'])

/**
 * A focal point: percentages on each axis, bounded to 0–100.
 * Absent on every existing stored configuration, in which case the renderer
 * resolves the centre — the crop position that was already in use.
 */
export const focalPointSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
})

/** Hero image opacity as a 0–1 fraction. Default 1 (fully opaque). */
export const HERO_IMAGE_OPACITY_DEFAULT = 1
export const heroImageOpacitySchema = z.number().min(0).max(1)

/**
 * A crop rectangle in source-image space (all values 0..1).
 *
 * `width`/`height` are bounded away from 0 so a degenerate rectangle can never
 * be persisted; `x`/`y` are bounded to 0..1 and are additionally clamped to
 * `1 - width` / `1 - height` by `resolveCrop` at render time, so a stored rect
 * can never fall outside the image.
 */
export const imageCropSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.05).max(1),
  height: z.number().min(0.05).max(1),
})

export const websiteSectionType = z.enum([
  'hero',
  'services',
  'team',
  'about',
  'contact',
])

/**
 * Section types that `TenantWebsite` actually knows how to render.
 *
 * `websiteSectionType` is the *schema* enum (kept broad for backward
 * compatibility with persisted configurations), but only these types have a
 * renderer. Anything outside this list is dropped at render time so an
 * unsupported section can never silently produce an incomplete website.
 */
export const RENDERABLE_SECTION_TYPES = ['hero', 'services', 'contact'] as const
export type RenderableSectionType = (typeof RENDERABLE_SECTION_TYPES)[number]

export function isRenderableSectionType(type: string): type is RenderableSectionType {
  return (RENDERABLE_SECTION_TYPES as readonly string[]).includes(type)
}

export const websiteSectionDataSource = z
  .object({
    type: z.enum(['services', 'staff']),
    filter: z.record(z.string(), z.unknown()).optional(),
    sort: z.enum(['sortOrder', 'name', 'price']).optional(),
  })
  .optional()

/**
 * Server-side bounds for editable section content. The UI also sets per-field
 * `maxLength`, but the server must never trust the client — these limits are
 * enforced by the Zod schema so an oversized payload is rejected outright.
 * Generous enough to be backward compatible with every value the editor has
 * ever produced.
 */
export const SECTION_CONTENT_MAX_VALUE_LENGTH = 500
export const SECTION_CONTENT_MAX_KEYS = 24

const localizedContent = z
  .record(z.string().min(1).max(64), z.string().max(SECTION_CONTENT_MAX_VALUE_LENGTH))
  .refine((record) => Object.keys(record).length <= SECTION_CONTENT_MAX_KEYS, {
    message: `A section may define at most ${SECTION_CONTENT_MAX_KEYS} content fields per locale`,
  })
  .optional()

export const websiteSectionContent = z
  .object({
    ar: localizedContent,
    en: localizedContent,
  })
  .passthrough()

/**
 * Editable content fields per renderable section type.
 *
 * Single source of truth shared by the Website Editor (which renders a control
 * per field) and the tests. A section type with no entry here has no editable
 * content. Keep this in sync with the renderer in components/tenant-website.tsx.
 */
export interface SectionContentField {
  key: string
  maxLength: number
  multiline: boolean
}

export const SECTION_CONTENT_FIELDS: Record<RenderableSectionType, SectionContentField[]> = {
  hero: [
    { key: 'headline', maxLength: 100, multiline: false },
    { key: 'tagline', maxLength: 60, multiline: false },
    { key: 'subtitle', maxLength: 300, multiline: true },
    { key: 'ctaLabel', maxLength: 50, multiline: false },
  ],
  services: [
    { key: 'heading', maxLength: 100, multiline: false },
    { key: 'description', maxLength: 300, multiline: true },
  ],
  contact: [
    { key: 'heading', maxLength: 100, multiline: false },
    { key: 'description', maxLength: 300, multiline: true },
  ],
}

export const websiteSection = z.object({
  id: z.string().min(1).max(64),
  type: websiteSectionType,
  variant: z.string().min(1).max(64).default('default'),
  isVisible: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  content: websiteSectionContent.default({}),
  dataSource: websiteSectionDataSource,
})

export const websiteThemeOverride = z
  .object({
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    // Optional page/section surfaces. When unset the renderer falls back to the
    // current hardcoded values, so existing sites look unchanged.
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    // LEGACY / INERT: retained only so older stored configurations still parse.
    // The renderer no longer emits or consumes a surface variable — every major
    // section uses the single global background. Do not re-introduce a third
    // user-controlled website color.
    surfaceColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    logo: z.string().optional(),
    // Optional Hero background image (base64 data URL). When present, the hero
    // section renders it as a background image with text overlaid on top.
    // When absent or empty, the hero renders its default text-only layout.
    // Draft-only until Publish copies the full config to the published column.
    //
    // Bounded server-side: the value must be a JPEG/PNG/WebP data URL whose
    // decoded size is within MAX_HERO_IMAGE_SIZE. Enforced here (not only in the
    // upload UI) so an oversized or mislabelled payload submitted directly to
    // saveDraft/publishChanges is rejected outright.
    heroImage: z
      .string()
      .refine(isValidHeroImageDataUrl, {
        message: 'Hero image must be a JPEG, PNG, or WebP data URL within the 2MB limit.',
      })
      .optional(),
    // Where the hero image stays visible when it is cropped to fill the hero
    // band (CSS `background-position`). Absent => centre, the previous
    // hardcoded behaviour, so existing configurations are unaffected.
    heroImageFocalPoint: focalPointSchema.optional(),
    // The crop the tenant framed in the cropper, in source-image space.
    // Absent => the whole image is shown (`object-fit: cover`), which is exactly
    // how every image uploaded before this feature already renders.
    heroImageCrop: imageCropSchema.optional(),
    // Opacity of the hero image LAYER only (0–1). The text, buttons and
    // overlay rendered above it are never affected. Absent => 1 (fully opaque).
    heroImageOpacity: heroImageOpacitySchema.optional(),
    fontPreset: z.enum(['modern', 'classic', 'bold', 'elegant']).optional(),
    buttonStyle: z.enum(['rounded', 'sharp', 'pill']).optional(),
    borderRadius: z.enum(['none', 'sm', 'md', 'lg', 'full']).optional(),
  })
  .passthrough()

/**
 * Coerce a non-object container to `undefined` so the schema's `.default()`
 * engages. This is deliberately NOT a `.catch()`: a container-level catch would
 * discard every sibling field when only one leaf is malformed. Here, a *valid*
 * object parses normally and the leaf-level `.catch()` in lib/contact-social.ts
 * recovers individual failures.
 */
const asPlainObject = (v: unknown) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v : undefined

export const websiteConfigSchema = z.object({
  theme: websiteThemeOverride.default({}),
  sections: z.array(websiteSection).max(20).default([]),
  // New settings are optional: a legacy configuration that lacks them parses
  // with defaults, keeping its theme, logo, hero image and sections intact.
  contact: z.preprocess(asPlainObject, contactSchemaRead.default(() => createDefaultContact())),
  social: z.preprocess(asPlainObject, socialSchemaRead.default(() => createDefaultSocial())),
  cta: z.preprocess(asPlainObject, ctaSchemaRead.default(() => createDefaultCta())),
  mobileStickyCta: z.preprocess(
    asPlainObject,
    mobileStickyCtaSchemaRead.default(() => createDefaultMobileStickyCta())
  ),
})

export type WebsiteConfig = z.infer<typeof websiteConfigSchema>
export type WebsiteSection = z.infer<typeof websiteSection>
export type WebsiteThemeOverride = z.infer<typeof websiteThemeOverride>
export type { ContactConfig, SocialConfig, CtaConfig, MobileStickyCtaConfig }

/**
 * The STRICT write schema. Identical to `websiteConfigSchema` for the core
 * (`theme`, `sections`), but the contact/social containers use the strict leaf
 * schemas so an over-ceiling value is REPORTED rather than recovered.
 *
 * This is the single validation entry point for every writer of the website
 * configuration, so no route can persist a value the write rules reject.
 */
export const websiteConfigWriteSchema = z.object({
  theme: websiteThemeOverride.default({}),
  sections: z.array(websiteSection).max(20).default([]),
  contact: z.preprocess(asPlainObject, contactSchemaWrite.default(() => createDefaultContact())),
  social: z.preprocess(asPlainObject, socialSchemaWrite.default(() => createDefaultSocial())),
  cta: z.preprocess(asPlainObject, ctaSchemaWrite.default(() => createDefaultCta())),
  mobileStickyCta: z.preprocess(
    asPlainObject,
    mobileStickyCtaSchemaWrite.default(() => createDefaultMobileStickyCta())
  ),
})

export type WriteValidation =
  | { ok: true; config: WebsiteConfig }
  | { ok: false; errors: ValidationIssue[] }

/**
 * Validate a configuration for PERSISTENCE.
 *
 * Used by every writer (saveDraft, publishChanges, and the branding action) so
 * the payload ceiling and the core schema are enforced in one place. Returns
 * structured issues instead of throwing, so callers can report a field-level
 * error and leave the client's state untouched.
 */
export function validateWebsiteConfigForWrite(input: unknown): WriteValidation {
  try {
    const config = websiteConfigWriteSchema.parse(input)
    const issues = collectContactSocialIssues(config.contact, config.social)
    if (issues.length > 0) return { ok: false, errors: issues }
    return { ok: true, config }
  } catch {
    // A structural failure (malformed theme/sections) has no single field to
    // attribute, so it is reported as a general validation failure.
    return { ok: false, errors: [{ field: 'config', code: 'INVALID_TYPE' }] }
  }
}

/**
 * The website's default page background. Matches the historical hardcoded value
 * so tenants that never chose a background render exactly as before.
 */
export const DEFAULT_SITE_BACKGROUND = '#FBFCFE'

/**
 * Resolve the website's page background color.
 *
 * The Website Builder's "secondary color" IS the website background:
 *
 *   1. `backgroundColor` — the field the background picker writes.
 *   2. `accentColor`     — the legacy field name for the same control. Older
 *                          saved configurations only have this, so it is honoured
 *                          as the background to stay backward compatible. No
 *                          migration and no field rename is required.
 *   3. `DEFAULT_SITE_BACKGROUND` — safe fallback for configurations with neither.
 *
 * `accentColor` is deliberately NOT taken from the tenant-level theme: that value
 * comes from the separate branding form and could be a strong color that would
 * flood the page. Only the website configuration's own value is used.
 */
export function resolveSiteBackground(
  theme: WebsiteThemeOverride | null | undefined,
  baseTheme?: Record<string, string> | null
): string {
  return (
    theme?.backgroundColor ??
    theme?.accentColor ??
    baseTheme?.backgroundColor ??
    DEFAULT_SITE_BACKGROUND
  )
}

/**
 * Parse and validate a website configuration.
 * Returns the validated config or throws a ZodError.
 */
export function parseWebsiteConfig(input: unknown): WebsiteConfig {
  return websiteConfigSchema.parse(input)
}

/**
 * Safely parse a website configuration.
 * Returns the validated config or null if invalid.
 */
export function safeParseWebsiteConfig(input: unknown): WebsiteConfig | null {
  const result = websiteConfigSchema.safeParse(input)
  return result.success ? result.data : null
}

/**
 * Create a default website configuration from existing tenant data.
 * Used during backfill and for new tenants.
 */
export function createDefaultWebsiteConfig(): WebsiteConfig {
  return {
    theme: {},
    sections: [
      {
        id: 'sec_hero',
        type: 'hero',
        variant: 'default',
        isVisible: true,
        sortOrder: 0,
        content: { ar: {}, en: {} },
      },
      {
        id: 'sec_services',
        type: 'services',
        variant: 'list',
        isVisible: true,
        sortOrder: 1,
        content: { ar: {}, en: {} },
        dataSource: { type: 'services', sort: 'sortOrder' },
      },
      // Contact sits after Services and before the Footer, as specified.
      {
        id: 'sec_contact',
        type: 'contact',
        variant: 'default',
        isVisible: true,
        sortOrder: 2,
        content: { ar: {}, en: {} },
      },
    ],
    contact: createDefaultContact(),
    social: createDefaultSocial(),
    cta: createDefaultCta(),
    mobileStickyCta: createDefaultMobileStickyCta(),
  }
}

/**
 * Create a new section of the given type with safe defaults.
 *
 * IDs are derived from the type with a numeric suffix so they are stable and
 * unique, and `sortOrder` is supplied by the caller (typically the current
 * section count) so the new section lands at the end.
 */
export function createSectionDefaults(
  type: RenderableSectionType,
  sortOrder: number,
  existingIds: readonly string[] = []
): WebsiteSection {
  let id = `sec_${type}`
  if (existingIds.includes(id)) {
    let n = 2
    while (existingIds.includes(`sec_${type}_${n}`)) n++
    id = `sec_${type}_${n}`
  }
  return {
    id,
    type,
    variant: type === 'services' ? 'list' : 'default',
    isVisible: true,
    sortOrder,
    content: { ar: {}, en: {} },
    ...(type === 'services' ? { dataSource: { type: 'services' as const, sort: 'sortOrder' as const } } : {}),
  }
}

/** Section types that may be added through the editor, in presentation order. */
export const ADDABLE_SECTION_TYPES = RENDERABLE_SECTION_TYPES

/** True when the config already contains a section of this type. */
export function hasSectionType(config: WebsiteConfig, type: string): boolean {
  return config.sections.some((s) => s.type === type)
}

/**
 * Add a section of the given type, appending it after every existing section.
 * Returns the config unchanged for unsupported types or when a section of that
 * type already exists (the schema does not model duplicate instances).
 */
export function addSection(config: WebsiteConfig, type: string): WebsiteConfig {
  if (!isRenderableSectionType(type)) return config
  if (hasSectionType(config, type)) return config
  const maxOrder = config.sections.reduce((max, s) => Math.max(max, s.sortOrder), -1)
  const section = createSectionDefaults(type, maxOrder + 1, config.sections.map((s) => s.id))
  return { ...config, sections: [...config.sections, section] }
}

/**
 * Remove the section with the given id and renormalize `sortOrder` so the
 * remaining sections keep a dense, gap-free ordering. Never touches operational
 * data — only the website configuration.
 */
export function removeSection(config: WebsiteConfig, sectionId: string): WebsiteConfig {
  const remaining = config.sections.filter((s) => s.id !== sectionId)
  if (remaining.length === config.sections.length) return config
  const renumbered = [...remaining]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s, i) => ({ ...s, sortOrder: i }))
  return { ...config, sections: renumbered }
}

/**
 * Move a section one position earlier or later.
 *
 * Operates on a freshly sorted copy and returns new section objects, so it never
 * mutates the input and is safe to call repeatedly from a functional state
 * update (rapid clicks always apply to the latest state).
 */
export function moveSection(config: WebsiteConfig, sectionId: string, direction: 'up' | 'down'): WebsiteConfig {
  const ordered = [...config.sections].sort((a, b) => a.sortOrder - b.sortOrder)
  const index = ordered.findIndex((s) => s.id === sectionId)
  if (index === -1) return config

  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= ordered.length) return config

  const next = [...ordered]
  const tmp = next[index]
  next[index] = next[targetIndex]
  next[targetIndex] = tmp

  return { ...config, sections: next.map((s, i) => ({ ...s, sortOrder: i })) }
}

/**
 * Resolve the ordered list of visible section types to render.
 *
 * - When a configuration exists: only explicitly visible sections are returned,
 *   ordered by `sortOrder`, and filtered to types that have a renderer. An
 *   all-hidden (or all-unsupported) config returns an empty array (the caller
 *   renders an intentional empty state rather than overriding the user).
 * - When no configuration exists: returns the legacy default order so tenants
 *   that have never saved a website config keep their existing public page.
 *
 * The `contact` section additionally requires at least one visible, non-empty
 * contact field. A tenant may leave the section enabled while every field is
 * hidden or blank; rather than rendering an empty Contact block, the section is
 * dropped — the Website Builder surfaces the problem as a warning instead.
 */
export function resolveOrderedSectionTypes(config: WebsiteConfig | null): string[] {
  if (!config) return [...RENDERABLE_SECTION_TYPES]
  return [...config.sections]
    .filter((s) => s.isVisible && isRenderableSectionType(s.type))
    // The contact section is dropped when it would render nothing at all. The
    // Main CTA it hosts also renders in the header, footer and mobile sticky
    // bar, so dropping an empty contact section never loses the CTA — and no
    // legacy site gains a section it never had.
    .filter((s) => s.type !== 'contact' || hasVisibleContactData(config.contact))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => s.type)
}
