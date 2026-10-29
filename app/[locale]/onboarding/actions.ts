'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { memberships, tenants } from '@/lib/db/schema'
import { businessTypes } from '@/lib/business-types'
import { isCountryCode, regionForCountry, supportedTimezones, type CountryCode } from '@/lib/regions'
import { countOpenDays, parseSchedule, type ScheduleDay } from '@/lib/onboarding-hours'
import { e164Phone } from '@/lib/phone'
import { MAX_LOGO_IMAGE_SIZE, MAX_LOGO_IMAGE_DATA_URL_LENGTH, validateImageBase64 } from '@/lib/image-validation'
import { provisionWorkspace } from '@/lib/provision-workspace'
import { logAudit } from '@/lib/audit'

type OnboardingErrorCode =
  | 'UNAUTHENTICATED'
  | 'UNVERIFIED'
  | 'INVALID_SLUG'
  | 'SLUG_RESERVED'
  | 'SLUG_TAKEN'
  | 'INVALID_INPUT'
  | 'INVALID_LOGO'
  | 'INVALID_HOURS'
  | 'UNKNOWN'
export type OnboardingResult = { code: OnboardingErrorCode; message: { ar: string; en: string } } | null

const messages: Record<OnboardingErrorCode, { ar: string; en: string }> = {
  UNAUTHENTICATED: { ar: 'انتهت الجلسة. سجّل الدخول مرة أخرى.', en: 'Your session expired. Please sign in again.' },
  UNVERIFIED: { ar: 'يرجى تأكيد بريدك الإلكتروني أولاً.', en: 'Please verify your email address first.' },
  INVALID_SLUG: { ar: 'استخدم رابطاً قصيراً صالحاً بحروف إنجليزية وأرقام وشرطات.', en: 'Use a valid URL with lowercase letters, numbers, and hyphens.' },
  SLUG_RESERVED: { ar: 'هذا الرابط محجوز. اختر رابطاً آخر.', en: 'That URL is reserved. Choose another one.' },
  SLUG_TAKEN: { ar: 'هذا الرابط مستخدم بالفعل. اختر رابطاً آخر.', en: 'That URL is already taken. Choose another one.' },
  INVALID_INPUT: { ar: 'تحقق من الحقول المطلوبة وحاول مرة أخرى.', en: 'Check the required fields and try again.' },
  INVALID_LOGO: {
    ar: 'الشعار غير مدعوم. استخدم صورة PNG أو JPEG أو WebP بحجم 1 ميجابايت أو أقل.',
    en: 'Logo is not supported. Use a PNG, JPEG, or WebP image up to 1MB.',
  },
  INVALID_HOURS: {
    ar: 'ساعات العمل غير صالحة. تحقق من أوقات البدء والانتهاء.',
    en: 'Working hours are invalid. Check the opening and closing times.',
  },
  UNKNOWN: { ar: 'تعذر إنشاء مساحة العمل. حاول مرة أخرى.', en: 'Could not create the workspace. Please try again.' },
}

function failure(code: OnboardingErrorCode): OnboardingResult {
  return { code, message: messages[code] }
}

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(48),
  locale: z.enum(['ar', 'en']),
  businessType: z.enum(businessTypes),
  tagline: z.string().trim().max(160).optional(),
  country: z.string().trim().max(2).refine((value) => isCountryCode(value.toUpperCase()), { message: 'Invalid country' }),
  timezone: z.string().trim().refine((value) => supportedTimezones.includes(value), { message: 'Invalid timezone' }),
  branchName: z.string().trim().min(2).max(100),
  branchAddress: z.string().trim().max(300).optional(),
  branchPhone: e164Phone.optional(),
  hoursConfigured: z.enum(['true', 'false']),
  hours: z.string().max(4000).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  logoBase64: z.string().max(MAX_LOGO_IMAGE_DATA_URL_LENGTH).optional(),
})

const reservedSlugs = new Set([
  'app',
  'api',
  'admin',
  'dashboard',
  'login',
  'signup',
  'onboarding',
  'settings',
  'book',
  'manage-booking',
  'tenants',
])

/**
 * Create a workspace.
 *
 * This action owns authentication, input validation and the redirect; the rows
 * themselves are created by `provisionWorkspace` in one transaction (tenant,
 * translations, membership, primary branch, sample service/staff, and — only
 * when configured — branch-level working hours).
 */
export async function createTenant(_previous: OnboardingResult, formData: FormData): Promise<OnboardingResult> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return failure('UNAUTHENTICATED')
  if (session.user.emailVerified !== true) return failure('UNVERIFIED')

  const parsed = schema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    locale: formData.get('locale') ?? 'ar',
    businessType: formData.get('businessType') ?? 'other',
    tagline: formData.get('tagline') || undefined,
    country: formData.get('country') ?? '',
    timezone: formData.get('timezone') ?? '',
    branchName: formData.get('branchName') ?? '',
    branchAddress: formData.get('branchAddress') || undefined,
    branchPhone: formData.get('branchPhone') || undefined,
    hoursConfigured: formData.get('hoursConfigured') ?? 'false',
    hours: formData.get('hours') || undefined,
    primaryColor: formData.get('primaryColor') || undefined,
    accentColor: formData.get('accentColor') || undefined,
    logoBase64: formData.get('logoBase64') || undefined,
  })
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => String(issue.path[0] ?? ''))
    if (fields.includes('slug')) return failure('INVALID_SLUG')
    if (fields.includes('logoBase64')) return failure('INVALID_LOGO')
    return failure('INVALID_INPUT')
  }
  const input = parsed.data

  if (reservedSlugs.has(input.slug)) return failure('SLUG_RESERVED')

  // Logo is optional; when supplied it must be a real raster image within the
  // advertised 1MB limit. The theme JSON never stores an unchecked blob.
  if (input.logoBase64) {
    const logoCheck = validateImageBase64(input.logoBase64, MAX_LOGO_IMAGE_SIZE)
    if (!logoCheck.ok) return failure('INVALID_LOGO')
  }

  // Hours are optional. An invalid payload is a user error, not a silent skip.
  let schedule: ScheduleDay[] | null = null
  if (input.hoursConfigured === 'true') {
    schedule = parseSchedule(input.hours)
    if (!schedule || countOpenDays(schedule) === 0) return failure('INVALID_HOURS')
  }

  const country = input.country.toUpperCase() as CountryCode
  const region = regionForCountry(country)
  const branchAddress = input.branchAddress?.trim() || null
  const branchPhone = input.branchPhone?.trim() || null

  const theme: Record<string, string> = {
    primaryColor: input.primaryColor ?? '#0F766E',
    accentColor: input.accentColor ?? '#f0faf9',
    ...(input.logoBase64 ? { logo: input.logoBase64 } : {}),
  }

  try {
    const tenant = await db.transaction((tx) =>
      provisionWorkspace(
        tx,
        {
          userId: session.user.id,
          email: session.user.email,
          name: session.user.name ?? null,
        },
        {
          slug: input.slug,
          name: input.name,
          tagline: input.tagline?.trim() || null,
          businessType: input.businessType,
          locale: input.locale,
          countryCode: country,
          currency: region.currency,
          timezone: input.timezone,
          branchName: input.branchName,
          branchAddress,
          branchPhone,
          theme,
          schedule,
        }
      )
    )

    await logAudit(
      {
        actorUserId: session.user.id,
        action: 'tenant.created',
        entityType: 'tenant',
        entityId: tenant.id,
        tenantId: tenant.id,
        metadata: {
          slug: tenant.slug,
          businessType: input.businessType,
          branchId: tenant.branchId,
          country,
          currency: region.currency,
          timezone: input.timezone,
          hoursConfigured: Boolean(schedule),
        },
      },
      await headers()
    )
    redirect(`/${input.locale}/tenants/${tenant.slug}/dashboard`)
  } catch (error) {
    if (error instanceof Error && 'digest' in error && String(error.digest).includes('NEXT_REDIRECT')) throw error
    if (error instanceof Error && 'code' in error && error.code === '23505') return failure('SLUG_TAKEN')
    return failure('UNKNOWN')
  }
}

export async function hasTenantSlug(slug: string) {
  const rows = await db.select({ id: tenants.id }).from(tenants).where(and(eq(tenants.slug, slug), eq(tenants.status, 'active'))).limit(1)
  return rows.length > 0
}

export async function validateSlug(slug: string): Promise<OnboardingErrorCode | null> {
  const parsed = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(48).safeParse(slug)
  if (!parsed.success) return 'INVALID_SLUG'

  if (reservedSlugs.has(parsed.data)) return 'SLUG_RESERVED'

  const taken = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, parsed.data)).limit(1)
  if (taken.length) return 'SLUG_TAKEN'

  return null
}
