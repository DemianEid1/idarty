import { ShieldCheck } from 'lucide-react'
import type { Metadata } from 'next'
import type { Locale } from '@/lib/i18n'
import { notFound } from 'next/navigation'
import { aliasedTable, and, eq, isNull } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'
import { serviceTranslations, services, tenantTranslations, tenants, workingHours, websiteConfig } from '@/lib/db/schema'
import { shouldShowPublicWorkingHour } from '@/lib/public-hours-policy'
import { safeParseWebsiteConfig } from '@/lib/website-config'
import { toServiceImageProps } from '@/lib/image-focal-point'
import { TenantWebsite } from '@/components/tenant-website'
import { LocaleSwitchLink } from '@/components/locale-switcher'
import { buildTenantLocalePath } from '@/lib/locale-path'
import { buildTenantMetadata } from '@/lib/tenant-metadata'

function createTenantPublicCache(slug: string, locale: Locale) {
  return unstable_cache(
    async () => {
      const tenant = await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) })
      if (!tenant) return null

      const fallbackLocale = locale === 'ar' ? 'en' : 'ar'
      const fallbackServiceTranslations = aliasedTable(serviceTranslations, 'fallback_public_service_translations')

      const [translation, fallbackTranslation, serviceRows, rawHoursRows, publishedConfigRow] = await Promise.all([
        db.query.tenantTranslations.findFirst({ where: and(eq(tenantTranslations.tenantId, tenant.id), eq(tenantTranslations.locale, locale)) }),
        db.query.tenantTranslations.findFirst({ where: and(eq(tenantTranslations.tenantId, tenant.id), eq(tenantTranslations.locale, fallbackLocale)) }),
        db.select({
          id: services.id,
          name: serviceTranslations.name,
          fallbackName: fallbackServiceTranslations.name,
          description: serviceTranslations.description,
          fallbackDescription: fallbackServiceTranslations.description,
          durationMin: services.durationMin,
          priceAmount: services.priceAmount,
          image: services.image,
          imageFocalX: services.imageFocalX,
          imageFocalY: services.imageFocalY,
          imageCropX: services.imageCropX,
          imageCropY: services.imageCropY,
          imageCropWidth: services.imageCropWidth,
          imageCropHeight: services.imageCropHeight,
        }).from(services)
          .leftJoin(serviceTranslations, and(eq(serviceTranslations.serviceId, services.id), eq(serviceTranslations.locale, locale)))
          .leftJoin(fallbackServiceTranslations, and(eq(fallbackServiceTranslations.serviceId, services.id), eq(fallbackServiceTranslations.locale, fallbackLocale)))
          .where(and(eq(services.tenantId, tenant.id), eq(services.isActive, true), eq(services.isSample, false), isNull(services.deletedAt)))
          .orderBy(services.sortOrder),
        db.select({ weekday: workingHours.weekday, startTime: workingHours.startTime, endTime: workingHours.endTime, isSample: workingHours.isSample }).from(workingHours).where(and(eq(workingHours.tenantId, tenant.id), isNull(workingHours.staffId))).orderBy(workingHours.weekday),
        db.query.websiteConfig.findFirst({ where: eq(websiteConfig.tenantId, tenant.id) }),
      ])
      const hoursRows = rawHoursRows.filter((hour) => shouldShowPublicWorkingHour(hour.isSample))
      const publishedConfig = publishedConfigRow?.published
        ? safeParseWebsiteConfig(publishedConfigRow.published)
        : null

      return { tenant, translation, fallbackTranslation, serviceRows, hoursRows, publishedConfig }
    },
    ['tenant-public', slug, locale],
    { revalidate: 60, tags: [`tenant-public-${slug}-${locale}`] }
  )
}

/**
 * Localized metadata for the public tenant page.
 *
 * Reuses the SAME `unstable_cache`d loader the page body uses, so metadata adds
 * no extra database round-trips and cannot diverge from what the page renders.
 *
 * Only published public data is read: the tenant's translation and its PUBLISHED
 * website configuration. Draft configuration is never consulted, and no internal
 * identifier is emitted. Unknown/unavailable tenants yield no tenant-specific
 * metadata, so `notFound()` behaviour is unchanged.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>
}): Promise<Metadata> {
  const { locale, slug } = await params
  const getTenantData = createTenantPublicCache(slug, locale)
  const data = await getTenantData()

  if (!data) return {}

  const { tenant, translation, fallbackTranslation, publishedConfig } = data

  // Same visibility rule the page body applies: a suspended workspace is not
  // public, so it gets no indexable metadata.
  if (tenant.status === 'suspended') return {}

  const effective = translation || fallbackTranslation

  return buildTenantMetadata({
    locale,
    slug,
    translation: effective
      ? {
          name: translation?.name || fallbackTranslation?.name || '',
          tagline: translation?.tagline || fallbackTranslation?.tagline || null,
          description: translation?.description || fallbackTranslation?.description || null,
        }
      : null,
    publishedConfig,
  })
}

export default async function TenantPage({ params }: { params: Promise<{ locale: Locale; slug: string }> }) {
  const { locale, slug } = await params
  const rtl = locale === 'ar'
  const getTenantData = createTenantPublicCache(slug, locale)
  const data = await getTenantData()
  if (!data) notFound()
  const { tenant, translation, fallbackTranslation, serviceRows, hoursRows, publishedConfig } = data

  if (tenant.status === 'suspended') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-6 text-center text-[#172033]" dir={rtl ? 'rtl' : 'ltr'}>
        <div className="max-w-md space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">{rtl ? 'الصفحة غير متاحة' : 'Page Unavailable'}</h1>
          <p className="text-ink-muted">
            {rtl
              ? 'مساحة العمل هذه غير متاحة حالياً لتلقي الحجوزات.'
              : 'This workspace is currently unavailable for bookings.'}
          </p>
        </div>
      </div>
    )
  }

  const effectiveTranslation = translation || fallbackTranslation

  return (
    <TenantWebsite
      locale={locale}
      slug={slug}
      localeSwitch={
        <LocaleSwitchLink
          currentLocale={locale}
          href={buildTenantLocalePath(locale, locale === 'ar' ? 'en' : 'ar', slug)}
        />
      }
      tenant={{
        currency: tenant.currency,
        email: tenant.email,
        phoneE164: tenant.phoneE164,
        theme: tenant.theme as Record<string, string> | null,
      }}
      translation={effectiveTranslation ? {
        name: translation?.name || fallbackTranslation?.name || '',
        tagline: translation?.tagline || fallbackTranslation?.tagline || null,
        description: translation?.description || fallbackTranslation?.description || null,
        address: translation?.address || fallbackTranslation?.address || null,
      } : null}
      serviceRows={serviceRows.map((s) => ({
        id: s.id,
        name: s.name || s.fallbackName,
        description: s.description || s.fallbackDescription,
        durationMin: s.durationMin,
        priceAmount: String(s.priceAmount),
        ...toServiceImageProps(s),
      }))}
      hoursRows={hoursRows.map((h) => ({
        weekday: h.weekday,
        startTime: h.startTime,
        endTime: h.endTime,
      }))}
      config={publishedConfig}
    />
  )
}
