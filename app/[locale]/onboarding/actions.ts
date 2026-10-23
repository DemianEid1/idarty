'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { memberships, serviceTranslations, services, staff, staffTranslations, tenantTranslations, tenants, workingHours } from '@/lib/db/schema'
import { businessTypes, defaultServiceName, defaultServicePreset, businessTypeLabel } from '@/lib/business-types'
import { logAudit } from '@/lib/audit'

type OnboardingErrorCode = 'UNAUTHENTICATED' | 'UNVERIFIED' | 'INVALID_SLUG' | 'SLUG_RESERVED' | 'SLUG_TAKEN' | 'UNKNOWN'
export type OnboardingResult = { code: OnboardingErrorCode; message: { ar: string; en: string } } | null

const messages: Record<OnboardingErrorCode, { ar: string; en: string }> = {
  UNAUTHENTICATED: { ar: 'انتهت الجلسة. سجّل الدخول مرة أخرى.', en: 'Your session expired. Please sign in again.' },
  UNVERIFIED: { ar: 'يرجى تأكيد بريدك الإلكتروني أولاً.', en: 'Please verify your email address first.' },
  INVALID_SLUG: { ar: 'استخدم رابطاً قصيراً صالحاً بحروف إنجليزية وأرقام وشرطات.', en: 'Use a valid URL with lowercase letters, numbers, and hyphens.' },
  SLUG_RESERVED: { ar: 'هذا الرابط محجوز. اختر رابطاً آخر.', en: 'That URL is reserved. Choose another one.' },
  SLUG_TAKEN: { ar: 'هذا الرابط مستخدم بالفعل. اختر رابطاً آخر.', en: 'That URL is already taken. Choose another one.' },
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
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  logoBase64: z.string().optional(),
})

export async function createTenant(_previous: OnboardingResult, formData: FormData): Promise<OnboardingResult> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return failure('UNAUTHENTICATED')
  if (session.user.emailVerified !== true) return failure('UNVERIFIED')

  const parsed = schema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    locale: formData.get('locale') ?? 'ar',
    businessType: formData.get('businessType') ?? 'other',
    primaryColor: formData.get('primaryColor') || undefined,
    accentColor: formData.get('accentColor') || undefined,
    logoBase64: formData.get('logoBase64') || undefined,
  })
  if (!parsed.success) return failure('INVALID_SLUG')
  const input = parsed.data

  const reservedSlugs = new Set(['app', 'api', 'admin', 'dashboard', 'login', 'signup', 'onboarding', 'settings', 'book', 'manage-booking', 'tenants'])
  if (reservedSlugs.has(input.slug)) return failure('SLUG_RESERVED')
  const preset = defaultServicePreset(input.businessType)

  const theme = {
    primaryColor: input.primaryColor ?? '#0F766E',
    accentColor: input.accentColor ?? '#f0faf9',
    ...(input.logoBase64 ? { logo: input.logoBase64 } : {})
  }

  try {
    const tenant = await db.transaction(async (tx) => {
      const existing = await tx.select({ id: tenants.id, slug: tenants.slug }).from(tenants).innerJoin(memberships, eq(memberships.tenantId, tenants.id)).where(and(eq(tenants.slug, input.slug), eq(memberships.userId, session.user.id))).limit(1)
      if (existing.length) return existing[0]
      const taken = await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, input.slug)).limit(1)
      if (taken.length) throw Object.assign(new Error('SLUG_TAKEN'), { code: '23505' })
      const [createdTenant] = await tx.insert(tenants).values({ slug: input.slug, businessType: input.businessType, defaultLocale: input.locale, supportedLocales: ['ar', 'en'], theme }).returning({ id: tenants.id, slug: tenants.slug })
      await tx.insert(tenantTranslations).values(['ar', 'en'].map((locale) => ({ tenantId: createdTenant.id, locale: locale as 'ar' | 'en', name: input.name, tagline: businessTypeLabel(input.businessType, locale as 'ar' | 'en') })))
      const [ownerMembership] = await tx.insert(memberships).values({ tenantId: createdTenant.id, userId: session.user.id, role: 'owner', status: 'active' }).returning({ id: memberships.id })
      const [defaultService] = await tx.insert(services).values({ tenantId: createdTenant.id, durationMin: preset.durationMin, priceAmount: preset.priceAmount, sortOrder: 0, isSample: true }).returning({ id: services.id })
      await tx.insert(serviceTranslations).values(['ar', 'en'].map((locale) => ({ tenantId: createdTenant.id, serviceId: defaultService.id, locale: locale as 'ar' | 'en', name: defaultServiceName(input.businessType, locale as 'ar' | 'en') })))
      const [defaultStaff] = await tx.insert(staff).values({ tenantId: createdTenant.id, membershipId: ownerMembership.id, email: session.user.email, sortOrder: 0, isSample: true }).returning({ id: staff.id })
      const ownerStaffName = session.user.name?.trim() || (input.locale === 'ar' ? 'المالك' : 'Owner')
      await tx.insert(staffTranslations).values(['ar', 'en'].map((locale) => ({ tenantId: createdTenant.id, staffId: defaultStaff.id, locale: locale as 'ar' | 'en', name: ownerStaffName })))
      await tx.insert(workingHours).values([0, 1, 2, 3, 4, 5].map((weekday) => ({ tenantId: createdTenant.id, staffId: defaultStaff.id, weekday, startTime: '09:00', endTime: '17:00', isSample: true })))
      return createdTenant
    })
    await logAudit({
      actorUserId: session.user.id,
      action: 'tenant.created',
      entityType: 'tenant',
      entityId: tenant.id,
      tenantId: tenant.id,
      metadata: { slug: tenant.slug, businessType: input.businessType },
    }, await headers())
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
  
  const reservedSlugs = new Set(['app', 'api', 'admin', 'dashboard', 'login', 'signup', 'onboarding', 'settings', 'book', 'manage-booking', 'tenants'])
  if (reservedSlugs.has(parsed.data)) return 'SLUG_RESERVED'
  
  const taken = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, parsed.data)).limit(1)
  if (taken.length) return 'SLUG_TAKEN'
  
  return null
}
