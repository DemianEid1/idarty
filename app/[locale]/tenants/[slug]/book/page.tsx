import Link from 'next/link'
import { ArrowLeft, CalendarDays } from 'lucide-react'
import { BookingForm } from '@/components/booking-form'
import { getAvailableSlots, getPublicBranches, getPublicServices } from './actions'
import type { Locale } from '@/lib/i18n'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tenants, websiteConfig } from '@/lib/db/schema'
import { safeParseWebsiteConfig } from '@/lib/website-config'
import { bookingThemeVars, resolveBookingTheme } from '@/lib/booking-theme'

export default async function BookingPage({ params, searchParams }: { params: Promise<{ locale: Locale; slug: string }>; searchParams: Promise<{ service?: string; branch?: string }> }) {
  const { locale, slug } = await params
  const { service, branch } = await searchParams
  const rtl = locale === 'ar'
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() + index)
    return date.toISOString().slice(0, 10)
  })
  const [services, branches] = await Promise.all([
    getPublicServices(slug, locale),
    getPublicBranches(slug, locale),
  ])
  const defaultServiceId = service ?? services[0]?.id
  const defaultBranchId = branch ?? branches.find((b) => b.isDefault)?.id ?? branches[0]?.id
  const slots = (await Promise.all(dates.map((date) => getAvailableSlots(slug, date, defaultServiceId, defaultBranchId)))).flat()

  // Resolve the tenant's published theme for the booking page.
  // Reads ONLY the published configuration — draft changes never leak.
  const tenantRow = await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) })
  const publishedConfigRow = tenantRow
    ? await db.query.websiteConfig.findFirst({ where: eq(websiteConfig.tenantId, tenantRow.id) })
    : null
  const publishedConfig = publishedConfigRow?.published
    ? safeParseWebsiteConfig(publishedConfigRow.published)
    : null
  const theme = resolveBookingTheme(publishedConfig)

  return <main dir={rtl ? 'rtl' : 'ltr'} style={bookingThemeVars(theme)} className="min-h-screen px-6 py-10 sm:py-16">
    <div className="mx-auto max-w-xl">
      <Link href={`/${locale}/tenants/${slug}`} className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--booking-text-muted)' }}><ArrowLeft className="h-4 w-4" />{rtl ? 'العودة للمساحة' : 'Back to workspace'}</Link>
      <section className="mt-8 rounded-[2rem] p-6 shadow-[0_20px_60px_rgba(30,45,80,.07)] sm:p-9" style={{ borderColor: 'var(--booking-border)', backgroundColor: 'var(--booking-surface)' }}>
        <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: 'color-mix(in srgb, var(--booking-primary) 10%, transparent)', color: 'var(--booking-primary)' }}><CalendarDays className="h-5 w-5" /></span><div><p className="text-sm font-semibold" style={{ color: 'var(--booking-text)' }}>{rtl ? 'حجز موعد' : 'Book an appointment'}</p><p className="mt-1 text-xs" style={{ color: 'var(--booking-text-muted)' }}>{rtl ? 'أدخل بياناتك والوقت المفضل' : 'Enter your details and preferred time'}</p></div></div>
        <div className="mt-8"><BookingForm locale={locale} slug={slug} slots={slots} services={services} branches={branches} defaultServiceId={defaultServiceId} defaultBranchId={defaultBranchId} theme={theme} /></div>
      </section>
    </div>
  </main>
}
