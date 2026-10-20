import Link from 'next/link'
import { ArrowRight, CalendarDays, Clock3, Mail, MapPin, Phone, Sparkles } from 'lucide-react'
import type { Locale } from '@/lib/i18n'
import { resolveOrderedSectionTypes, resolveSiteBackground, type WebsiteConfig } from '@/lib/website-config'
import { focalPointToCss, resolveFocalPoint, type FocalPoint } from '@/lib/image-focal-point'
import { cropToLayerStyle, resolveCrop } from '@/lib/image-crop'
import { LogoIcon } from '@/components/logo'
import {
  isHttpUrl,
  resolveCtaTarget,
  resolveCtaLabel,
  resolveVisibleSocialLinks,
  toTelHref,
  toMailto,
  FALLBACK_CTA_LABEL,
} from '@/lib/contact-social'
import { ContactSection } from '@/components/contact-section'
import { MobileStickyCta } from '@/components/mobile-sticky-cta'
import { SocialLinks, WhatsAppLink } from '@/components/social-links'

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
  image?: string | null
  /** Legacy focal point for the service image crop; absent/null means centre. */
  imageFocalPoint?: FocalPoint | null
  /** Pre-computed style for the crop layer. Null/absent => show the whole image. */
  cropLayer?: React.CSSProperties | null
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

  // -------------------------------------------------------------------------
  // Contact & Social settings.
  //
  // `config` is the DRAFT config on the preview route and the PUBLISHED config
  // on the public route, so every value below is already correctly scoped.
  // -------------------------------------------------------------------------
  const contactConfig = config?.contact ?? null
  const socialConfig = config?.social ?? null
  const ctaConfig = config?.cta ?? null
  const stickyEnabled = config?.mobileStickyCta?.isEnabled ?? false

  // The Main CTA destination. `booking` always resolves; `call`/`whatsapp`
  // resolve only with a visible, valid destination — never a fallback action.
  const ctaTarget = resolveCtaTarget(ctaConfig, contactConfig ?? {
    phone: { value: '', isVisible: false },
    whatsapp: { value: '', isVisible: false },
    email: { value: '', isVisible: false },
    address: { value: '', isVisible: false },
    googleMapsUrl: { value: '', isVisible: false },
  })
  // The Main CTA is INDEPENDENT of the hero. Its label is resolved from the CTA
  // configuration alone — the hero's legacy `ctaLabel` is deliberately NOT
  // passed as a fallback, so editing one can never change the other.
  const primaryCtaLabel = resolveCtaLabel(locale, ctaConfig, null)
  const showPrimaryCta = ctaTarget.kind !== 'none'
  const primaryCtaHref =
    ctaTarget.kind === 'href'
      ? ctaTarget.href
      : `/${locale}/tenants/${slug}/book`
  const primaryCtaIsExternal = ctaTarget.kind === 'href' && isHttpUrl(ctaTarget.href)
  const stickyVisible = stickyEnabled && showPrimaryCta

  // -------------------------------------------------------------------------
  // The HERO's own booking button.
  //
  // It ALWAYS points at the tenant's booking route and NEVER consults the Main
  // CTA configuration. Before this split the hero reused `primaryCtaHref` /
  // `primaryCtaLabel`, so choosing "Call" or "WhatsApp" in Website Builder
  // silently repointed — or, with an invalid destination, removed — the hero's
  // booking action. Its label is the hero section's own `ctaLabel` content
  // field (so existing tenants keep their text) falling back to the standard
  // booking label; no new configuration field is introduced.
  // -------------------------------------------------------------------------
  const heroBookingHref = `/${locale}/tenants/${slug}/book`
  const heroBookingLabel =
    (rtl ? heroAr.ctaLabel : heroEn.ctaLabel)?.trim() || FALLBACK_CTA_LABEL[locale]

  const socialLinks = resolveVisibleSocialLinks(socialConfig)
  // The resolved list drives the footer's "has any social link" decision. The
  // SocialLinks component re-resolves internally for rendering, so this only
  // guards layout.
  const hasSocialLinks = socialLinks.length > 0

  // Optional Hero background image (base64 data URL). When present, the hero
  // section renders it as a background image with the existing text overlaid
  // on top — text, buttons, layout, and colors are all preserved unchanged.
  const heroImage = themeOverride?.heroImage || ''

  // Where the hero image stays visible when the hero band crops it, and how
  // opaque the image layer is. Both default to the pre-feature behaviour
  // (centre crop, fully opaque) when absent from a stored configuration.
  //
  // `heroFocalCss` is used ONLY for legacy configs that predate the cropper and
  // stored a focal point instead of a crop rectangle.
  const heroFocalCss = focalPointToCss(themeOverride?.heroImageFocalPoint)
  const heroImageOpacity =
    typeof themeOverride?.heroImageOpacity === 'number' ? themeOverride.heroImageOpacity : 1
  // The crop framed in the cropper. Null => show the whole image.
  const heroCrop = resolveCrop(themeOverride?.heroImageCrop)
  const heroCropLayer = cropToLayerStyle(themeOverride?.heroImageCrop)

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
  // Footer contact layer.
  //
  // Visibility rules mirror the Contact section, with ONE extra subtlety for
  // the address: when the current configuration does not define an address, the
  // legacy translation address is shown (the pre-existing behaviour). But an
  // address explicitly HIDDEN in the configuration is never revealed.
  // -------------------------------------------------------------------------
  const configuredAddress = contactConfig?.address ?? null
  const addressVisible = !!configuredAddress?.isVisible && configuredAddress.value.trim() !== ''
  const addressConfigured = !!configuredAddress && configuredAddress.value.trim() !== ''
  // Shown when: explicitly visible+non-empty, OR not configured at all (legacy
  // fallback). Never when configured but hidden.
  const footerAddress = addressVisible
    ? configuredAddress!.value.trim()
    : !addressConfigured
      ? businessAddress
      : null

  const footerPhoneValue = contactConfig?.phone.isVisible ? contactConfig.phone.value.trim() : ''
  const footerEmailValue = contactConfig?.email.isVisible ? contactConfig.email.value.trim() : ''
  const footerPhoneHref = contactConfig?.phone.isVisible ? toTelHref(contactConfig.phone.value) : null
  const footerEmailHref = contactConfig?.email.isVisible ? toMailto(contactConfig.email.value) : null
  // The address opens the configured Google Maps URL when one is valid;
  // otherwise it stays plain text. Never constructed from the address itself.
  const footerMapsHref =
    contactConfig?.googleMapsUrl.isVisible && isHttpUrl(contactConfig.googleMapsUrl.value)
      ? contactConfig.googleMapsUrl.value.trim()
      : null

  const footerContactItems = [
    footerAddress
      ? {
          key: 'address',
          icon: MapPin,
          label: rtl ? 'العنوان' : 'Address',
          value: footerAddress,
          href: footerMapsHref,
          external: !!footerMapsHref,
        }
      : null,
    footerPhoneValue ? { key: 'phone', icon: Phone, label: rtl ? 'الهاتف' : 'Phone', value: footerPhoneValue, href: footerPhoneHref, external: false } : null,
    footerEmailValue ? { key: 'email', icon: Mail, label: rtl ? 'البريد الإلكتروني' : 'Email', value: footerEmailValue, href: footerEmailHref, external: false } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null)

  const footerYear = new Date().getFullYear()

  // -------------------------------------------------------------------------
  // Section renderers
  // -------------------------------------------------------------------------
  const renderHero = () => (
    <section
      key="hero"
      // FULL-BLEED: the section itself spans the viewport edge to edge. The
      // readable content is constrained by the inner `max-w-7xl` wrapper below,
      // so text/CTA stay aligned with the rest of the site while the image
      // reaches both edges.
      //
      // `relative` + `overflow-hidden` are applied ONLY when an image is
      // present; with no image the class list stays the historical text-only
      // hero so existing sites cannot regress.
      //
      // A responsive MINIMUM height (never a fixed height) gives the hero
      // deliberate proportions while still growing naturally when the localized
      // heading/description/CTA need more room. It is applied ONLY when a
      // background image exists, so a text-only hero never becomes a large
      // empty band.
      className={`${heroImage ? 'relative w-full overflow-hidden' : 'w-full'} flex flex-col ${
        heroImage ? 'min-h-[56vh] sm:min-h-[60vh] lg:min-h-[55vh]' : ''
      }`}
    >
      {heroImage && (
        // Opacity is applied to this IMAGE WRAPPER ONLY (it contains nothing but
        // the image), so the overlay, text and buttons below/above are never
        // made translucent.
        <div className="absolute inset-0" aria-hidden="true" style={{ opacity: heroImageOpacity }}>
          {heroCropLayer ? (
            // A crop is stored: reproduce it exactly by scaling an oversized
            // inner layer and clipping it. The stored image is never re-encoded.
            <div style={heroCropLayer}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroImage}
                alt=""
                // This is the primary above-the-fold image, so it is loaded with
                // high priority instead of being deferred. The service-card
                // images below keep `loading="lazy"`.
                //
                // The hero source is a base64 `data:` URL, which the browser
                // already has inline — there is no network request to prioritise,
                // and `fetchPriority` is a no-op here rather than a regression.
                // It is set so the markup stays correct if a remote hero source
                // is ever introduced.
                fetchPriority="high"
                decoding="async"
                className="h-full w-full object-cover"
                style={{ maxWidth: 'none' }}
              />
            </div>
          ) : (
            // No crop: the historical rendering — `cover` + centre, or the
            // legacy focal point when an older config stored one.
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url("${heroImage}")`,
                backgroundSize: 'cover',
                backgroundPosition: heroFocalCss,
                backgroundRepeat: 'no-repeat',
              }}
            />
          )}
        </div>
      )}

      {/* Improved readability overlay — a stronger multi-stop gradient that
          ensures legible text across all image types. The bottom gets maximum
          darkening while the top retains the image's character. Separate from
          the image layer so the image opacity never affects text contrast. */}
      {heroImage && (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.38) 45%, rgba(0,0,0,0.10) 100%)',
          }}
        />
      )}

      {/* Content container — matches the site's normal readable width.
          `flex-1` + `justify-center` vertically centre the content inside the
          hero's minimum height while still allowing the section to grow when the
          localized text needs more room. */}
      <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-4 py-10 sm:px-6 sm:py-16 lg:py-20">
        <div className="max-w-2xl">
          <p
            className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold break-words"
            style={
              heroImage
                ? { color: '#fff', borderColor: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(0,0,0,0.32)' }
                : { color: 'var(--site-primary)', borderColor: 'var(--site-primary)' }
            }
          >
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
            {businessTagline}
          </p>
          <h1
            className="mt-4 text-[2.25rem] font-bold tracking-tight break-words sm:text-[3.25rem] lg:text-[4rem] leading-[1.15]"
            style={heroImage ? { color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,0.25)' } : undefined}
          >
            {businessName}
          </h1>
          <p
            className="mt-4 max-w-xl text-base leading-7 break-words sm:text-lg sm:leading-8"
            style={{ color: heroImage ? 'rgba(255,255,255,0.9)' : '#6f7b90' }}
          >
            {businessDescription}
          </p>
          <div
            className="mt-5 flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-2"
            style={{ color: heroImage ? 'rgba(255,255,255,0.85)' : '#748096' }}
          >
            {businessAddress && (
              <span className="flex items-center gap-2 break-words">
                <MapPin className="h-4 w-4 shrink-0" style={{ color: heroImage ? 'rgba(255,255,255,0.9)' : 'var(--site-primary)' }} aria-hidden="true" />
                {businessAddress}
              </span>
            )}
            <span className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 shrink-0" style={{ color: heroImage ? 'rgba(255,255,255,0.9)' : 'var(--site-primary)' }} aria-hidden="true" />
              {hoursLabel}
            </span>
            {businessPhone && (
              <span className="flex items-center gap-2 break-words">
                <Phone className="h-4 w-4 shrink-0" style={{ color: heroImage ? 'rgba(255,255,255,0.9)' : 'var(--site-primary)' }} aria-hidden="true" />
                <span dir="ltr">{businessPhone}</span>
              </span>
            )}
          </div>
          {/* Hero's OWN booking button. Always the booking route, never the
              configurable Main CTA. Compact and rounded, not full-width, so it
              stays aligned with the hero's left-aligned content on desktop. */}
          <Link
            href={heroBookingHref}
            data-testid="hero-booking-cta"
            className="mt-7 inline-flex max-w-full items-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold text-white shadow-md transition-all duration-200 hover:opacity-90 hover:shadow-lg hover:-translate-y-px active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-primary)] cursor-pointer"
            style={{ backgroundColor: 'var(--site-primary)' }}
          >
            <span className="break-words">{heroBookingLabel}</span>
            <ArrowRight className="h-5 w-5 shrink-0 rtl:rotate-180" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )

  const renderServices = () => (
    <section
      key="services"
      id="services"
      className="border-t border-[#eef0f4]"
    >
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
        {serviceRows.length > 0 ? (
          <>
            <div className="mb-10 text-center">
              <h2 className="text-2xl font-bold tracking-tight break-words sm:text-3xl lg:text-4xl">
                {servicesHeading}
              </h2>
              <p className="mt-3 text-base text-[#6f7b90] break-words max-w-lg mx-auto">
                {servicesDescription}
              </p>
            </div>
            {/* Mobile: horizontal cards (thumbnail beside the text).
                `sm` and above: vertical cards (image spans the card width).
                ONE card tree — the layout is driven purely by responsive CSS. */}
            <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {serviceRows.map((item) => (
                <div
                  key={item.id}
                  className="group flex min-w-0 flex-row rounded-2xl border border-[#e6eaf1] bg-paper shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 sm:flex-col"
                >
                  {/* The ONE image area per card. On mobile it is a fixed square
                      thumbnail (96×96); from `sm` up it becomes the card's
                      full-width 16:10 band, matching CROP_ASPECTS.service — the
                      ratio the cropper frames. */}
                  <div className="relative w-[110px] shrink-0 self-stretch overflow-hidden rounded-s-2xl bg-[#f0f2f5] sm:aspect-[16/10] sm:w-full sm:self-auto sm:rounded-t-2xl sm:rounded-s-none">
                    {item.image ? (
                      item.cropLayer ? (
                        // A crop is stored: reproduce it exactly.
                        <div style={item.cropLayer}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.image}
                            alt=""
                            className="h-full w-full object-cover"
                            style={{ maxWidth: 'none' }}
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <img
                          src={item.image}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                          style={{ objectPosition: focalPointToCss(item.imageFocalPoint) }}
                          loading="lazy"
                        />
                      )
                    ) : (
                      // Deliberate neutral placeholder — a restrained
                      // service-related mark on the site's own surface tint,
                      // never borrowed imagery.
                      <div
                        className="flex h-full w-full items-center justify-center"
                        aria-hidden="true"
                      >
                        <Sparkles className="h-7 w-7 text-[#c3ccd9]" />
                      </div>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-5">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold break-words leading-snug sm:text-base sm:font-semibold sm:leading-normal">{item.name ?? (rtl ? 'خدمة' : 'Service')}</h3>
                      {item.description && <p className="mt-1 text-xs leading-[1.45rem] text-[#6f7b90] break-words line-clamp-2 sm:mt-2 sm:text-sm sm:leading-6 sm:line-clamp-none">{item.description}</p>}
                    </div>

                    {/* Mobile: metadata + book button on the SAME row (price left, button right in LTR / right–left in RTL).
                        Desktop (sm+): metadata row above, then full-width button below. */}
                    <div className="mt-auto pt-3 sm:pt-4">
                      {/* Mobile: single flex row with duration+price on start, button on end.
                          Desktop: column — duration+price row, then full-width button. */}
                      <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-stretch sm:gap-3">
                        {/* Duration + price */}
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="flex items-center gap-1 text-[#929bad]">
                            <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="text-xs sm:text-sm">{durationLabel(item.durationMin)}</span>
                          </span>
                          <span className="flex items-baseline gap-1">
                            <span className="text-base font-bold sm:text-xl" style={{ color: 'var(--site-primary)' }}>{item.priceAmount}</span>
                            <span className="text-xs text-[#929bad] sm:text-sm">{tenant.currency}</span>
                          </span>
                        </div>
                        {/* Book button — compact & inline on mobile, full-width on desktop */}
                        <Link
                          href={`/${locale}/tenants/${slug}/book?service=${item.id}`}
                          className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-all duration-200 hover:opacity-90 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-primary)] cursor-pointer min-h-[36px] sm:w-full sm:justify-center sm:px-4 sm:py-2.5 sm:text-sm sm:min-h-[44px] sm:rounded-lg"
                          style={{ backgroundColor: 'var(--site-primary)' }}
                        >
                          <span>{rtl ? 'احجز الآن' : 'Book Now'}</span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 rtl:rotate-180" aria-hidden="true" />
                        </Link>
                      </div>
                    </div>

                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <CalendarDays className="mx-auto h-10 w-10 text-[#cbd5e1]" aria-hidden="true" />
            <p className="mt-4 text-sm text-[#929bad]">
              {rtl ? 'لا توجد خدمات متاحة حالياً' : 'No services available yet'}
            </p>
          </div>
        )}
      </div>
    </section>
  )

  const renderContact = () => {
    const contactSection = configuredSections?.find((s) => s.type === 'contact')
    const contactAr = contactSection?.content?.ar ?? {}
    const contactEn = contactSection?.content?.en ?? {}
    const heading =
      (rtl ? (contactAr.heading || contactEn.heading) : (contactEn.heading || contactAr.heading)) || ''
    const description =
      (rtl
        ? (contactAr.description || contactEn.description)
        : (contactEn.description || contactAr.description)) || ''

    return (
      <ContactSection
        key="contact"
        locale={locale}
        contact={contactConfig}
        social={socialConfig}
        heading={heading}
        description={description}
        cta={
          showPrimaryCta
            ? {
                href: primaryCtaHref,
                label: primaryCtaLabel,
                external: primaryCtaIsExternal,
                action: ctaConfig?.action ?? 'booking',
              }
            : null
        }
      />
    )
  }

  const SECTION_RENDERERS: Record<string, () => React.ReactNode> = {
    hero: renderHero,
    services: renderServices,
    contact: renderContact,
  }

  return (
    <main
      className={`tenant-site min-h-screen text-[#172033]${stickyVisible ? ' tenant-site--has-sticky-cta' : ''}`}
      dir={rtl ? 'rtl' : 'ltr'}
      style={{
        ...siteThemeVars,
        backgroundColor: backgroundColor,
        // Bottom space for the fixed mobile floating action button is applied as
        // a mobile-only CSS rule in globals.css (`.tenant-site--has-sticky-cta`),
        // NOT inline: the button is `md:hidden`, so an unconditional inline
        // padding would leave a blank band below the footer on desktop.
      }}
    >
      {/* Sticky region: optional preview banner + header stick together as one
          unit, so the header never overlaps or gaps regardless of banner height. */}
      <div className="sticky top-0 z-40">
        {previewBanner}
        <header className="border-b border-[#e8ebf1] bg-paper/95 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4">
            <Link
              href={`/${locale}/tenants/${slug}`}
              className="flex min-w-0 items-center gap-2 text-base font-semibold cursor-pointer"
            >
              {logo ? (
                <img src={logo} alt="" className="h-8 w-auto max-w-full shrink-0 object-contain sm:h-9" />
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
                className="min-w-18 line-clamp-2 leading-tight text-sm font-semibold sm:text-base sm:line-clamp-1"
                title={businessName}
              >
                {businessName}
              </span>
            </Link>
            <nav className="flex min-w-0 items-center gap-1.5 sm:gap-3">
              {showServices && serviceRows.length > 0 && (
                <a
                  href="#services"
                  className="hidden text-sm font-medium text-[#647087] transition-colors duration-150 hover:text-[var(--site-primary)] sm:inline-block cursor-pointer"
                >
                  {rtl ? 'الخدمات' : 'Services'}
                </a>
              )}
              {/* Social links: desktop only. The header is already dense on
                  mobile (brand + locale switch + CTA), so these are hidden below
                  `sm` rather than competing for space. WhatsApp is a contact
                  field, so it renders via <WhatsAppLink>. */}
              <div className="hidden items-center gap-1 sm:flex">
                <SocialLinks
                  locale={locale}
                  social={socialConfig}
                  className="flex items-center gap-1"
                  size={18}
                />
                <WhatsAppLink locale={locale} contact={contactConfig} size={18} />
              </div>
              {localeSwitch}
              {/* Primary CTA. Rendered only when the configured action resolves
                  to a destination. When the mobile sticky CTA is actually shown,
                  this is hidden on mobile so exactly one primary action is
                  visible — the condition is `stickyVisible`, not merely
                  "sticky enabled", so a non-rendering sticky can never leave the
                  mobile header without a CTA. */}
              {showPrimaryCta && (
                <Link
                  href={primaryCtaHref}
                  {...(primaryCtaIsExternal ? { target: '_blank', rel: 'noreferrer' } : {})}
                  className={`${stickyVisible ? 'hidden md:flex' : 'flex'} min-w-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 cursor-pointer sm:px-3.5 sm:py-2.5`}
                  style={{ backgroundColor: 'var(--site-primary)' }}
                >
                  <span className="truncate">{primaryCtaLabel}</span>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
              )}
            </nav>
          </div>
        </header>
      </div>

      {/* Sections in configured order */}
      {orderedTypes.map((type) => SECTION_RENDERERS[type]?.())}

      {/* Footer — three layers:
            A. contact information (address / phone / email), each shown only
               when the Contact & Social configuration makes it visible;
            B. the primary CTA, reusing the already-resolved CTA values so there
               is no second CTA-resolution mechanism;
            C. copyright + social links + the Idarty attribution.
          Every value passes the same render guards as the Contact section. */}
      <footer className="border-t border-border bg-paper">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
          {/* Layer A — contact information */}
          {footerContactItems.length > 0 && (
            <div
              className={`grid gap-6 sm:gap-8 ${
                footerContactItems.length === 3
                  ? 'sm:grid-cols-3'
                  : footerContactItems.length === 2
                    ? 'sm:grid-cols-2'
                    : 'sm:grid-cols-1'
              }`}
              data-testid="footer-contact"
            >
              {footerContactItems.map((item) => {
                const Icon = item.icon
                const body = (
                  <>
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--site-primary)]/10 text-[var(--site-primary)]"
                      aria-hidden="true"
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#929bad]">
                      {item.label}
                    </span>
                    <span className="min-w-0 break-words text-sm font-medium text-[#172033]" dir={item.key === 'address' ? undefined : 'ltr'}>
                      {item.value}
                    </span>
                  </>
                )
                return (
                  <div key={item.key} className="flex flex-col items-center gap-2 text-center">
                    {item.href ? (
                      <a
                        href={item.href}
                        {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                        className="flex flex-col items-center gap-2 rounded-xl outline-none transition-colors duration-150 hover:text-[var(--site-primary)] focus-visible:ring-2 focus-visible:ring-[var(--site-primary)] focus-visible:ring-offset-2 cursor-pointer"
                      >
                        {body}
                      </a>
                    ) : (
                      body
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Layer B — primary CTA. Rendered only when the existing CTA
              configuration resolves to a valid, permitted destination, so
              publish validation is never bypassed and call/WhatsApp never falls
              back to booking. */}
          {showPrimaryCta && (
            <div className={footerContactItems.length > 0 ? 'mt-8' : ''}>
              <Link
                href={primaryCtaHref}
                {...(primaryCtaIsExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                data-testid="footer-cta"
                className="flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-all duration-200 hover:opacity-90 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-primary)] cursor-pointer"
                style={{ backgroundColor: 'var(--site-primary)' }}
              >
                <span className="min-w-0 break-words">{primaryCtaLabel}</span>
                <ArrowRight className="h-5 w-5 shrink-0 rtl:rotate-180" aria-hidden="true" />
              </Link>
            </div>
          )}

          {/* Layer C — copyright, social links, attribution */}
          <div
            className={`flex flex-col items-center gap-4 border-t border-border pt-6 text-center sm:flex-row sm:justify-between sm:gap-6 sm:text-start ${
              footerContactItems.length > 0 || showPrimaryCta ? 'mt-8' : ''
            }`}
          >
            <p className="text-sm text-[#929bad] break-words">
              {rtl
                ? `© ${footerYear} ${businessName}. جميع الحقوق محفوظة.`
                : `© ${footerYear} ${businessName}. All rights reserved.`}
            </p>

            {/* Icons sit in ONE horizontal row below `sm` too, so the social
                platforms and WhatsApp line up side by side on mobile instead of
                stacking. `flex-wrap` is intentionally absent here: the row is
                short enough to fit 360px, and nowrap guarantees no wrapped
                second line or horizontal overflow. */}
            <div className="flex flex-row flex-wrap items-center justify-center gap-3 sm:gap-5">
              <div className="flex items-center gap-2">
                {hasSocialLinks && <SocialLinks locale={locale} social={socialConfig} size={18} />}
                <WhatsAppLink locale={locale} contact={contactConfig} size={18} />
              </div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs text-[#a0a8b6]">{rtl ? 'مدعوم بواسطة' : 'Powered by'}</span>
                <Link
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-semibold text-brand-teal cursor-pointer"
                  aria-label="Idarty"
                >
                  <LogoIcon height={14} />
                  <span>{rtl ? 'إدارتي' : 'Idarty'}</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Mobile sticky CTA — rendered only when enabled AND the primary CTA
          resolves to a destination. The header CTA above is hidden on mobile in
          exactly the same condition, so the two can never compete. */}
      {stickyVisible && (
        <MobileStickyCta
          href={primaryCtaHref}
          label={primaryCtaLabel}
          external={primaryCtaIsExternal}
          action={ctaConfig?.action ?? 'booking'}
        />
      )}
    </main>
  )
}
