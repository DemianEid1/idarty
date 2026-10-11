import Link from 'next/link'
import { ArrowRight, CalendarDays, Clock3, MapPin, Phone, Sparkles } from 'lucide-react'
import type { Locale } from '@/lib/i18n'
import { resolveOrderedSectionTypes, resolveSiteBackground, type WebsiteConfig } from '@/lib/website-config'
import { LogoIcon } from '@/components/logo'

// ---------------------------------------------------------------------------
// Shared tenant website renderer.
//
// This is the SINGLE source of truth for the public tenant website design.
// It is used by BOTH:
//   - the live public website  (config = published configuration)
//   - the Website Builder draft preview (config = draft configuration)
//
// The only intended difference between the two modes is the configuration
// supplied and any preview-only chrome rendered around this component.
// ---------------------------------------------------------------------------

const WEEKDAY_LABELS: Record<string, { ar: string; en: string }> = {
  '0': { ar: 'الأحد', en: 'Sun' },
  '1': { ar: 'الإثنين', en: 'Mon' },
  '2': { ar: 'الثلاثاء', en: 'Tue' },
  '3': { ar: 'الأربعاء', en: 'Wed' },
  '4': { ar: 'الخميس', en: 'Thu' },
  '5': { ar: 'الجمعة', en: 'Fri' },
  '6': { ar: 'السبت', en: 'Sat' },
}

export interface TenantWebsiteService {
  id: string
  name: string | null
  description: string | null
  durationMin: number
  priceAmount: string
}

export interface TenantWebsiteHours {
  weekday: number
  startTime: string
  endTime: string
}

export interface TenantWebsiteProps {
  locale: Locale
  slug: string
  tenant: {
    currency: string
    email: string | null
    phoneE164: string | null
    theme: Record<string, string> | null
  }
  translation: {
    name: string
    tagline: string | null
    description: string | null
    address: string | null
  } | null
  serviceRows: TenantWebsiteService[]
  hoursRows: TenantWebsiteHours[]
  config: WebsiteConfig | null
  /**
   * Optional banner rendered above the header inside the SAME sticky region.
   * The draft preview passes its "not public" indicator here so the header and
   * banner stick together as one unit — no fragile magic-number offset, and it
   * stays correct even if the banner text wraps on narrow screens.
   */
  previewBanner?: React.ReactNode
  /**
   * Optional public language toggle, rendered in the header navigation. The
   * caller supplies it so this renderer stays presentational and never depends
   * on editor/dashboard behaviour.
   */
  localeSwitch?: React.ReactNode
}

export function TenantWebsite({
  locale,
  slug,
  tenant,
  translation,
  serviceRows,
  hoursRows,
  config,
  previewBanner,
  localeSwitch,
}: TenantWebsiteProps) {
  const rtl = locale === 'ar'

  // -------------------------------------------------------------------------
  // Section visibility + ordering from configuration.
  // When no configuration exists, render every supported section (legacy
  // behavior for tenants that have never saved/published a website config).
  // -------------------------------------------------------------------------
  const configuredSections = config?.sections ?? null
  const orderedTypes = resolveOrderedSectionTypes(config)

  const isVisible = (type: string) => orderedTypes.includes(type)

  // -------------------------------------------------------------------------
  // Theme resolution: config override > tenants.theme > defaults
  // -------------------------------------------------------------------------
  const baseTheme = tenant.theme ?? {}
  const themeOverride = config?.theme
  const primaryColor = themeOverride?.primaryColor ?? baseTheme.primaryColor ?? '#0F766E'
  const logo = themeOverride?.logo ?? baseTheme.logo ?? ''

  // The website's page background is controlled by the Builder's secondary color.
  // See resolveSiteBackground() for the full precedence and backward-compat rules.
  const backgroundColor = resolveSiteBackground(themeOverride, baseTheme)

  // Website-scoped CSS variables. Deliberately namespaced (`--site-*`) so they
  // cannot collide with the application tokens (`--primary`, `--accent`, …).
  //
  // Only TWO user-controlled colors exist: the primary (buttons/links/icons) and
  // the global background. There is no separate section-background variable —
  // `--site-bg` is the single source of truth, so no stale preset color can leak
  // into a major section.
  const siteThemeVars = {
    '--site-primary': primaryColor,
    '--site-bg': backgroundColor,
  } as React.CSSProperties

  // -------------------------------------------------------------------------
  // Hero content: config override > tenant translation > defaults
  // -------------------------------------------------------------------------
  const heroSection = configuredSections?.find((s) => s.type === 'hero')
  const heroAr = heroSection?.content?.ar ?? {}
  const heroEn = heroSection?.content?.en ?? {}

  const businessName = (heroAr.headline || heroEn.headline) || (translation?.name ?? slug)
  const businessTagline =
    (rtl ? (heroAr.tagline || heroEn.tagline) : (heroEn.tagline || heroAr.tagline)) ||
    translation?.tagline ||
    (rtl ? 'مساحة عمل موثوقة' : 'A trusted workspace')
  const businessDescription =
    (rtl ? (heroAr.subtitle || heroEn.subtitle) : (heroEn.subtitle || heroAr.subtitle)) ||
    (translation?.description ?? (rtl ? 'اختر الخدمة والوقت المناسبين لك.' : 'Choose a service and a time that works for you.'))
  const businessAddress = translation?.address ?? null
  const businessPhone = tenant.phoneE164 ?? null
  const ctaLabel = rtl ? (heroAr.ctaLabel || 'احجز موعداً') : (heroEn.ctaLabel || 'Book an appointment')

  // -------------------------------------------------------------------------
  // Services section content: config override > localized defaults
  // -------------------------------------------------------------------------
  const servicesSection = configuredSections?.find((s) => s.type === 'services')
  const servicesAr = servicesSection?.content?.ar ?? {}
  const servicesEn = servicesSection?.content?.en ?? {}
  const servicesHeading =
    (rtl ? (servicesAr.heading || servicesEn.heading) : (servicesEn.heading || servicesAr.heading)) ||
    (rtl ? 'الخدمات المتاحة' : 'Available Services')
  const servicesDescription =
    (rtl ? (servicesAr.description || servicesEn.description) : (servicesEn.description || servicesAr.description)) ||
    (rtl ? 'اختر الخدمة المناسبة لك واحجز موعدك' : 'Choose the service that suits you and book your appointment')

  // -------------------------------------------------------------------------
  // Working hours summary e.g. "Sun–Thu: 09:00–17:00"
  // -------------------------------------------------------------------------
  let hoursLabel: string
  if (hoursRows.length === 0) {
    hoursLabel = rtl ? 'حسب المواعيد المتاحة' : 'By available times'
  } else {
    const first = hoursRows[0]
    const last = hoursRows[hoursRows.length - 1]
    const firstDay = WEEKDAY_LABELS[String(first.weekday)]?.[locale] ?? ''
    const lastDay = hoursRows.length > 1 ? (WEEKDAY_LABELS[String(last.weekday)]?.[locale] ?? '') : ''
    const dayRange = lastDay && lastDay !== firstDay ? `${firstDay}–${lastDay}` : firstDay
    hoursLabel = `${dayRange}: ${first.startTime.slice(0, 5)}–${first.endTime.slice(0, 5)}`
  }

  const durationLabel = (min: number) => {
    if (rtl) return `${min} دقيقة`
    return min >= 60 ? `${min / 60}h` : `${min} min`
  }

  const showServices = isVisible('services')

  // -------------------------------------------------------------------------
  // Section renderers
  // -------------------------------------------------------------------------
  const renderHero = () => (
    <section key="hero" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
      <div className="max-w-2xl">
        <p
          className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold break-words"
          style={{ color: 'var(--site-primary)', borderColor: 'var(--site-primary)' }}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          {businessTagline}
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight break-words sm:text-5xl lg:text-6xl">{businessName}</h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-[#6f7b90] break-words sm:text-lg sm:leading-8">{businessDescription}</p>
        <div className="mt-7 flex flex-wrap gap-4 text-sm text-[#748096]">
          {businessAddress && (
            <span className="flex items-center gap-2 break-words">
              <MapPin className="h-4 w-4 shrink-0" style={{ color: 'var(--site-primary)' }} />
              {businessAddress}
            </span>
          )}
          <span className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 shrink-0" style={{ color: 'var(--site-primary)' }} />
            {hoursLabel}
          </span>
          {businessPhone && (
            <span className="flex items-center gap-2 break-words">
              <Phone className="h-4 w-4 shrink-0" style={{ color: 'var(--site-primary)' }} />
              {businessPhone}
            </span>
          )}
        </div>
        <Link
          href={`/${locale}/tenants/${slug}/book`}
          className="mt-8 inline-flex max-w-full items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-primary)]"
          style={{ backgroundColor: 'var(--site-primary)' }}
        >
          <span className="break-words">{ctaLabel}</span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </Link>
      </div>
    </section>
  )

  const renderServices = () => (
    <section
      key="services"
      id="services"
      className="border-t border-[#eef0f4]"
    >
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        {serviceRows.length > 0 ? (
          <>
            <div className="mb-10 text-center">
              <h2 className="text-2xl font-bold tracking-tight break-words sm:text-3xl">
                {servicesHeading}
              </h2>
              <p className="mt-2 text-sm text-[#6f7b90] break-words">
                {servicesDescription}
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {serviceRows.map((item) => (
                <div
                  key={item.id}
                  className="group flex min-w-0 flex-col rounded-2xl border border-[#e6eaf1] bg-paper p-6 shadow-sm transition hover:shadow-md"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold break-words">{item.name ?? (rtl ? 'خدمة' : 'Service')}</h3>
                    {item.description && <p className="mt-2 text-sm leading-6 text-[#6f7b90] break-words">{item.description}</p>}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#eef0f4] pt-4">
                    <div className="min-w-0">
                      <span className="text-lg font-bold" style={{ color: 'var(--site-primary)' }}>{item.priceAmount}</span>
                      <span className="text-sm text-[#929bad]"> {tenant.currency}</span>
                      <p className="mt-0.5 text-xs text-[#929bad]">{durationLabel(item.durationMin)}</p>
                    </div>
                    <Link
                      href={`/${locale}/tenants/${slug}/book?service=${item.id}`}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-primary)]"
                      style={{ backgroundColor: 'var(--site-primary)' }}
                    >
                      {rtl ? 'احجز' : 'Book'}
                      <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center">
            <CalendarDays className="mx-auto h-10 w-10 text-[#cbd5e1]" />
            <p className="mt-4 text-sm text-[#929bad]">
              {rtl ? 'لا توجد خدمات متاحة حالياً' : 'No services available yet'}
            </p>
          </div>
        )}
      </div>
    </section>
  )

  const SECTION_RENDERERS: Record<string, () => React.ReactNode> = {
    hero: renderHero,
    services: renderServices,
  }

  return (
    <main
      className="tenant-site min-h-screen text-[#172033]"
      dir={rtl ? 'rtl' : 'ltr'}
      style={{ ...siteThemeVars, backgroundColor: backgroundColor }}
    >
      {/* Sticky region: optional preview banner + header stick together as one
          unit, so the header never overlaps or gaps regardless of banner height. */}
      <div className="sticky top-0 z-40">
        {previewBanner}
        <header className="border-b border-[#e8ebf1] bg-paper/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
            <Link
              href={`/${locale}`}
              className="flex min-w-0 items-center gap-2 text-sm font-semibold"
            >
              {logo ? (
                <img src={logo} alt="" className="h-8 w-auto max-w-full shrink-0 object-contain" />
              ) : (
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                  style={{ backgroundColor: 'var(--site-primary)' }}
                  aria-hidden="true"
                >
                  {businessName.charAt(0).toUpperCase()}
                </span>
              )}
              {/* The business name is ALWAYS rendered. It is a shrinkable flex
                  child (`min-w-0`) so a long name can never push the nav or the
                  booking CTA out of the viewport; `min-w-18` (4.5rem) keeps the
                  brand readable instead of letting flex sacrifice it first.
                  On narrow screens it wraps to at most two lines and only then
                  ellipsizes; from `sm` up it stays on one line. `title` exposes
                  the full name when the text is clipped. Deliberately NOT
                  `hidden`: hiding the brand name on mobile removed the tenant's
                  identity from the public site.
                  `data-testid` gives the layout tests a stable, unambiguous hook
                  — the element's position among its siblings is not a contract. */}
              <span
                data-testid="tenant-brand-name"
                className="min-w-18 line-clamp-2 leading-tight sm:line-clamp-1"
                title={businessName}
              >
                {businessName}
              </span>
            </Link>
            <nav className="flex min-w-0 items-center gap-2 sm:gap-3">
              {showServices && serviceRows.length > 0 && (
                <a
                  href="#services"
                  className="hidden text-sm font-medium text-[#647087] transition hover:text-[var(--site-primary)] sm:inline-block"
                >
                  {rtl ? 'الخدمات' : 'Services'}
                </a>
              )}
              {localeSwitch}
              <Link
                href={`/${locale}/tenants/${slug}/book`}
                className="flex min-w-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ backgroundColor: 'var(--site-primary)' }}
              >
                <span className="truncate">{ctaLabel}</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </Link>
            </nav>
          </div>
        </header>
      </div>

      {/* Sections in configured order */}
      {orderedTypes.map((type) => SECTION_RENDERERS[type]?.())}

      {/* Footer */}
      <footer className="border-t border-border bg-paper py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-1 sm:px-6">
          <span className="text-xs text-[#a0a8b6]">{rtl ? 'مدعوم بواسطة' : 'Powered by'}</span>
          <Link href="/" className="flex items-center gap-1 text-xs font-semibold text-brand-teal" aria-label="Idarty">
            <LogoIcon height={14} />
            <span>{rtl ? 'إدارتي' : 'Idarty'}</span>
          </Link>
        </div>
      </footer>
    </main>
  )
}
