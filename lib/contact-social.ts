import { z } from 'zod'

// ---------------------------------------------------------------------------
// Contact & Social settings — types, validation, and render-time helpers.
//
// Two deliberate policies live here:
//
//   1. TOLERANT READ / STRICT WRITE.
//      The read schemas recover *shape* errors only (a field that is not an
//      object, or whose value is not a string) and never constrain length, so
//      a stored value can never be silently blanked just by opening the editor.
//      The write schemas are strict and report structured field errors instead
//      of discarding input.
//
//   2. PERSISTENCE IS NOT A SECURITY BOUNDARY.
//      A bounded string such as `javascript:alert(1)` is a valid string and is
//      stored as typed so the tenant can correct it. Every render site calls
//      `isHttpUrl` (or a destination helper) before building an `href`, so such
//      a value can never reach the DOM as a link.
// ---------------------------------------------------------------------------

/** Abuse ceiling for contact/social text. NOT a UX limit — see the advisory map. */
export const CONTACT_TEXT_PAYLOAD_MAX = 4096

/**
 * Advisory editor limits. These drive `maxLength` attributes and inline
 * warnings ONLY; they never reject a write, so a legacy tenant with a longer
 * address keeps working.
 */
export const CONTACT_PRACTICAL_LIMITS = {
  phone: 20,
  whatsapp: 20,
  email: 254,
  address: 500,
  googleMapsUrl: 2048,
  socialUrl: 2048,
  ctaLabel: 50,
} as const

/**
 * E.164. The regex source is IDENTICAL to the CHECK constraints already in
 * db/migrations/0001_init.sql (tenants.phone_e164, staff.phone_e164,
 * customers.phone_e164) so the platform has one phone contract, not two.
 */
export const E164_PATTERN = /^\+[1-9][0-9]{6,14}$/

/** Conservative single-address email. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Fixed platform set — arbitrary custom platforms are deliberately not supported. */
export const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'youtube'] as const
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]

export const CTA_ACTIONS = ['booking', 'call', 'whatsapp'] as const
export type CtaAction = (typeof CTA_ACTIONS)[number]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContactField {
  value: string
  isVisible: boolean
}

export interface SocialLink {
  url: string
  isEnabled: boolean
}

export interface ContactConfig {
  phone: ContactField
  whatsapp: ContactField
  email: ContactField
  address: ContactField
  googleMapsUrl: ContactField
}

export type SocialConfig = Record<SocialPlatform, SocialLink>

export interface CtaConfig {
  action: CtaAction
  label: { ar: string; en: string }
}

export interface MobileStickyCtaConfig {
  isEnabled: boolean
}

// ---------------------------------------------------------------------------
// Defaults — factory functions so no two configs ever share an object.
// ---------------------------------------------------------------------------

const emptyField = (): ContactField => ({ value: '', isVisible: false })
const emptyLink = (): SocialLink => ({ url: '', isEnabled: false })

export function createDefaultContact(): ContactConfig {
  return {
    phone: emptyField(),
    whatsapp: emptyField(),
    email: emptyField(),
    address: emptyField(),
    googleMapsUrl: emptyField(),
  }
}

export function createDefaultSocial(): SocialConfig {
  return {
    instagram: emptyLink(),
    facebook: emptyLink(),
    tiktok: emptyLink(),
    youtube: emptyLink(),
  }
}

/**
 * The label is EMPTY by default on purpose. The renderer resolves
 * `cta.label[locale] -> hero section ctaLabel -> hardcoded default`, so an
 * empty default lets a legacy tenant's existing hero CTA label keep winning.
 * A non-empty default here would silently replace it.
 */
export function createDefaultCta(): CtaConfig {
  return { action: 'booking', label: { ar: '', en: '' } }
}

export function createDefaultMobileStickyCta(): MobileStickyCtaConfig {
  return { isEnabled: false }
}

/** The historical label, used only when neither the CTA nor the hero defines one. */
export const FALLBACK_CTA_LABEL: Record<'ar' | 'en', string> = {
  ar: 'احجز موعداً',
  en: 'Book an appointment',
}

// ---------------------------------------------------------------------------
// Render-time helpers — the single choke point for every user-controlled value.
// ---------------------------------------------------------------------------

const blankToUndefined = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v

/**
 * Strip only separators a human may type. The leading `+` is NEVER stripped and
 * a country code is NEVER inferred — a local number such as the Egyptian
 * `01012345678` is rejected rather than guessed into an invalid destination.
 */
function normalizeE164(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().replace(/[\s\-().]/g, '')
  return E164_PATTERN.test(s) ? s : null
}

/** `tel:` destination, or null when the value is not a valid E.164 number. */
export function toTelHref(raw: unknown): string | null {
  const n = normalizeE164(raw)
  return n ? `tel:${n}` : null
}

/** `wa.me` destination (E.164 digits, no `+`), or null when invalid. */
export function toWhatsAppHref(raw: unknown): string | null {
  const n = normalizeE164(raw)
  return n ? `https://wa.me/${n.slice(1)}` : null
}

/** `mailto:` destination, or null when the value is not a valid email address. */
export function toMailto(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  return s.length <= CONTACT_PRACTICAL_LIMITS.email && EMAIL_PATTERN.test(s)
    ? `mailto:${s}`
    : null
}

const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * True only for an absolute http(s) URL.
 *
 * `z.string().url()` alone is NOT sufficient — it accepts `javascript:`,
 * `data:`, `ftp:` and `tel:`. Every Maps/social href MUST pass through this.
 */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false
  try {
    return SAFE_URL_PROTOCOLS.has(new URL(value.trim()).protocol)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// CTA resolution
// ---------------------------------------------------------------------------

export type CtaTarget =
  | { kind: 'booking' }
  | { kind: 'href'; href: string }
  | { kind: 'none' }

/**
 * Resolve the primary CTA's destination.
 *
 * `booking` always resolves (the booking route always exists). `call` and
 * `whatsapp` resolve ONLY when the corresponding field is visible AND holds a
 * valid destination — there is deliberately no fallback to another action.
 */
export function resolveCtaTarget(cta: CtaConfig | null | undefined, contact: ContactConfig): CtaTarget {
  if (!cta) return { kind: 'booking' }
  switch (cta.action) {
    case 'booking':
      return { kind: 'booking' }
    case 'call': {
      const href = contact.phone.isVisible ? toTelHref(contact.phone.value) : null
      return href ? { kind: 'href', href } : { kind: 'none' }
    }
    case 'whatsapp': {
      const href = contact.whatsapp.isVisible ? toWhatsAppHref(contact.whatsapp.value) : null
      return href ? { kind: 'href', href } : { kind: 'none' }
    }
    default:
      return { kind: 'none' }
  }
}

/** True when the configured primary CTA has a usable destination. */
export function ctaRenders(cta: CtaConfig | null | undefined, contact: ContactConfig): boolean {
  return resolveCtaTarget(cta, contact).kind !== 'none'
}

/**
 * Resolve the CTA label: explicit CTA label -> legacy hero `ctaLabel` ->
 * historical default. The middle step is what preserves a legacy tenant's
 * existing label.
 */
export function resolveCtaLabel(
  locale: 'ar' | 'en',
  cta: CtaConfig | null | undefined,
  heroCtaLabel: string | null | undefined
): string {
  const explicit = cta?.label?.[locale]?.trim()
  if (explicit) return explicit
  const hero = typeof heroCtaLabel === 'string' ? heroCtaLabel.trim() : ''
  if (hero) return hero
  return FALLBACK_CTA_LABEL[locale]
}

// ---------------------------------------------------------------------------
// Visibility predicates
// ---------------------------------------------------------------------------

const fieldHasData = (f: ContactField | undefined): boolean =>
  !!f && f.isVisible && f.value.trim() !== ''

/**
 * True when at least one contact field is both visible and non-empty.
 * The Contact section is suppressed entirely when this is false, so an empty
 * section can never appear on the public website.
 */
export function hasVisibleContactData(contact: ContactConfig | null | undefined): boolean {
  if (!contact) return false
  return (
    fieldHasData(contact.phone) ||
    fieldHasData(contact.whatsapp) ||
    fieldHasData(contact.email) ||
    fieldHasData(contact.address) ||
    fieldHasData(contact.googleMapsUrl)
  )
}

/** Enabled social links that also hold a safe http(s) URL. */
export function resolveVisibleSocialLinks(
  social: SocialConfig | null | undefined
): Array<{ platform: SocialPlatform; url: string }> {
  if (!social) return []
  const out: Array<{ platform: SocialPlatform; url: string }> = []
  for (const platform of SOCIAL_PLATFORMS) {
    const link = social[platform]
    if (link?.isEnabled && isHttpUrl(link.url)) {
      out.push({ platform, url: link.url.trim() })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Schemas — READ (tolerant, shape-only recovery, no length constraint)
// ---------------------------------------------------------------------------

const contactFieldRead = () =>
  z
    .object({
      value: z.preprocess(blankToUndefined, z.string().optional().default('')),
      isVisible: z.boolean().default(false),
    })
    // Leaf-level recovery: fires ONLY when this field's own shape is malformed,
    // so a corrupt sibling can never blank a valid one.
    .catch({ value: '', isVisible: false })

const socialLinkRead = () =>
  z
    .object({
      url: z.preprocess(blankToUndefined, z.string().optional().default('')),
      isEnabled: z.boolean().default(false),
    })
    .catch({ url: '', isEnabled: false })

export const contactSchemaRead = z.object({
  phone: contactFieldRead(),
  whatsapp: contactFieldRead(),
  email: contactFieldRead(),
  address: contactFieldRead(),
  googleMapsUrl: contactFieldRead(),
})

export const socialSchemaRead = z.object({
  instagram: socialLinkRead(),
  facebook: socialLinkRead(),
  tiktok: socialLinkRead(),
  youtube: socialLinkRead(),
})

const ctaLabelRead = z.object({
  ar: z.preprocess(blankToUndefined, z.string().max(CONTACT_TEXT_PAYLOAD_MAX).optional().default('')),
  en: z.preprocess(blankToUndefined, z.string().max(CONTACT_TEXT_PAYLOAD_MAX).optional().default('')),
})

export const ctaSchemaRead = z.object({
  action: z.enum(CTA_ACTIONS).default('booking'),
  label: ctaLabelRead.default({ ar: '', en: '' }),
})

export const mobileStickyCtaSchemaRead = z.object({
  isEnabled: z.boolean().default(false),
})

// ---------------------------------------------------------------------------
// Schemas — WRITE (strict; no `.catch()`, so failures become field errors)
//
// These deliberately do NOT constrain length. Length is enforced by
// `collectContactSocialIssues`, which reports the exact field, so an overlong
// value produces a precise error instead of being masked by the schema parse.
// ---------------------------------------------------------------------------

const contactFieldWrite = () =>
  z.object({
    value: z.preprocess(blankToUndefined, z.string().optional().default('')),
    isVisible: z.boolean().default(false),
  })

const socialLinkWrite = () =>
  z.object({
    url: z.preprocess(blankToUndefined, z.string().optional().default('')),
    isEnabled: z.boolean().default(false),
  })

export const contactSchemaWrite = z.object({
  phone: contactFieldWrite(),
  whatsapp: contactFieldWrite(),
  email: contactFieldWrite(),
  address: contactFieldWrite(),
  googleMapsUrl: contactFieldWrite(),
})

export const socialSchemaWrite = z.object({
  instagram: socialLinkWrite(),
  facebook: socialLinkWrite(),
  tiktok: socialLinkWrite(),
  youtube: socialLinkWrite(),
})

export const ctaSchemaWrite = z.object({
  action: z.enum(CTA_ACTIONS).default('booking'),
  label: ctaLabelRead.default({ ar: '', en: '' }),
})

export const mobileStickyCtaSchemaWrite = z.object({
  isEnabled: z.boolean().default(false),
})

// ---------------------------------------------------------------------------
// Structured validation
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  field: string
  code: 'TOO_LONG' | 'INVALID_TYPE' | 'CTA_NO_DESTINATION'
  max?: number
  actual?: number
}

/** Field paths and their payload ceiling, used for the write-side length check. */
const WRITABLE_TEXT_PATHS: Array<{ path: string; read: (c: ContactConfig, s: SocialConfig) => unknown }> = [
  { path: 'contact.phone.value', read: (c) => c.phone.value },
  { path: 'contact.whatsapp.value', read: (c) => c.whatsapp.value },
  { path: 'contact.email.value', read: (c) => c.email.value },
  { path: 'contact.address.value', read: (c) => c.address.value },
  { path: 'contact.googleMapsUrl.value', read: (c) => c.googleMapsUrl.value },
  { path: 'social.instagram.url', read: (_c, s) => s.instagram.url },
  { path: 'social.facebook.url', read: (_c, s) => s.facebook.url },
  { path: 'social.tiktok.url', read: (_c, s) => s.tiktok.url },
  { path: 'social.youtube.url', read: (_c, s) => s.youtube.url },
]

/**
 * Collect structured issues for contact/social text that exceeds the payload
 * ceiling. Returns an empty array for valid input.
 */
export function collectContactSocialIssues(
  contact: ContactConfig,
  social: SocialConfig
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const { path, read } of WRITABLE_TEXT_PATHS) {
    const value = read(contact, social)
    if (typeof value !== 'string') {
      issues.push({ field: path, code: 'INVALID_TYPE' })
      continue
    }
    if (value.length > CONTACT_TEXT_PAYLOAD_MAX) {
      issues.push({
        field: path,
        code: 'TOO_LONG',
        max: CONTACT_TEXT_PAYLOAD_MAX,
        actual: value.length,
      })
    }
  }
  return issues
}

/**
 * Publish gate: the selected CTA action must have a usable destination.
 * `booking` always passes; `call`/`whatsapp` require a visible, valid value.
 * No fallback action is ever substituted.
 */
export function collectPublishIssues(
  cta: CtaConfig | null | undefined,
  contact: ContactConfig
): ValidationIssue[] {
  if (!cta) return []
  if (resolveCtaTarget(cta, contact).kind !== 'none') return []
  return [{ field: `cta.action.${cta.action}`, code: 'CTA_NO_DESTINATION' }]
}

// ---------------------------------------------------------------------------
// Localized messages
// ---------------------------------------------------------------------------

export const VALIDATION_MESSAGES: Record<
  ValidationIssue['code'],
  { ar: string; en: string }
> = {
  TOO_LONG: {
    ar: `الحقل طويل جداً. الحد الأقصى ${CONTACT_TEXT_PAYLOAD_MAX} حرفاً.`,
    en: `This field is too long. Maximum ${CONTACT_TEXT_PAYLOAD_MAX} characters.`,
  },
  INVALID_TYPE: {
    ar: 'قيمة غير صالحة.',
    en: 'Invalid value.',
  },
  CTA_NO_DESTINATION: {
    ar: 'الإجراء المحدد لا يملك وجهة صالحة.',
    en: 'The selected action has no valid destination.',
  },
}

/** Action-specific guidance shown in the editor when a CTA lacks a destination. */
export const CTA_WARNINGS: Record<Exclude<CtaAction, 'booking'>, { ar: string; en: string }> = {
  call: {
    ar: 'الإجراء المحدد هو "اتصال"، لكن لا يوجد رقم هاتف صالح وظاهر. أضف رقماً بالصيغة الدولية وفعّل ظهوره، أو اختر إجراءً آخر.',
    en: 'The selected action is Call, but no valid, visible phone number is set. Add an international-format number and make it visible, or choose another action.',
  },
  whatsapp: {
    ar: 'الإجراء المحدد هو "واتساب"، لكن لا يوجد رقم واتساب صالح وظاهر. أضف رقماً بالصيغة الدولية وفعّل ظهوره، أو اختر إجراءً آخر.',
    en: 'The selected action is WhatsApp, but no valid, visible WhatsApp number is set. Add an international-format number and make it visible, or choose another action.',
  },
}

/** Shown when the tenant enables the Contact section without any visible data. */
export const CONTACT_EMPTY_WARNING = {
  ar: 'لا توجد بيانات اتصال ظاهرة. القسم لن يظهر في الموقع العام حتى تفعيل حقل واحد على الأقل.',
  en: 'No visible contact data. The section will not appear on the public website until at least one field is enabled.',
}

/** Persistent input hint for the phone/WhatsApp fields. */
export const PHONE_FORMAT_HINT = {
  ar: 'أدخل الرقم بالصيغة الدولية مع رمز الدولة، مثال: +20 100 123 4567',
  en: 'Enter the number in international format with the country code, e.g. +20 100 123 4567',
}

/** Shown when a non-empty phone/WhatsApp value is not a valid E.164 number. */
export const PHONE_INVALID_HINT = {
  ar: 'صيغة الرقم غير صحيحة. أضف رمز الدولة (مثال: +20 للأرقام المصرية).',
  en: 'Invalid number. Add the country code (e.g. +20 for Egyptian numbers).',
}

/** Shown when a non-empty Maps/social URL is not a safe http(s) URL. */
export const URL_INVALID_HINT = {
  ar: 'الرابط يجب أن يبدأ بـ https://',
  en: 'The link must start with https://',
}
