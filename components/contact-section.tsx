import Link from 'next/link'
import { ArrowRight, CalendarDays, Mail, MapPin, Phone } from 'lucide-react'
import type { Locale } from '@/lib/i18n'
import {
  toTelHref,
  toWhatsAppHref,
  toMailto,
  isHttpUrl,
  type ContactConfig,
  type SocialConfig,
  type CtaAction,
} from '@/lib/contact-social'
import { SocialLinks, WhatsAppIcon } from '@/components/social-links'

// ---------------------------------------------------------------------------
// Public Contact section.
//
// Rendering rules, applied per field:
//
//   * hidden or empty            -> nothing is rendered for that field
//   * valid destination          -> rendered as an ACTION (tel:, wa.me, mailto:,
//                                   or an external Maps link)
//   * invalid but non-empty      -> rendered as PLAIN TEXT, never as a link
//
// The last rule is what keeps a mistyped number or a non-http(s) URL from ever
// producing a broken or unsafe `href`, while still showing the tenant's own
// content. `resolveOrderedSectionTypes` additionally drops the whole section
// when no field is visible and non-empty, so this component is never reached
// with nothing to show.
// ---------------------------------------------------------------------------

function ActionButton({
  href,
  label,
  external,
  children,
}: {
  href: string
  label: string
  external?: boolean
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className="inline-flex max-w-full items-center gap-2.5 rounded-xl border border-[#e6eaf1] bg-paper px-4 py-3 text-sm font-semibold text-[#172033] outline-none transition hover:border-[var(--site-primary)] hover:text-[var(--site-primary)] focus-visible:ring-2 focus-visible:ring-[var(--site-primary)] focus-visible:ring-offset-2"
    >
      <span className="shrink-0 text-[var(--site-primary)]" aria-hidden="true">
        {children}
      </span>
      <span className="min-w-0 break-words">{label}</span>
    </a>
  )
}

/**
 * The leading icon for the Main CTA, matching its configured action so the pill
 * communicates what it does: booking / call / WhatsApp.
 */
function CtaIcon({ action }: { action: CtaAction }) {
  if (action === 'call') return <Phone className="h-5 w-5 shrink-0" aria-hidden="true" />
  if (action === 'whatsapp') return <WhatsAppIcon size={20} />
  return <CalendarDays className="h-5 w-5 shrink-0" aria-hidden="true" />
}

function PlainDetail({
  icon,
  text,
}: {
  icon: React.ReactNode
  text: string
}) {
  return (
    <div className="flex max-w-full items-center gap-2.5 text-sm text-[#6f7b90]">
      <span className="shrink-0 text-[var(--site-primary)]" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 break-words">{text}</span>
    </div>
  )
}

export function ContactSection({
  locale,
  contact,
  social,
  heading,
  description,
  cta,
}: {
  locale: Locale
  contact: ContactConfig | null | undefined
  social: SocialConfig | null | undefined
  heading?: string
  description?: string
  /**
   * The configurable Main CTA, rendered as a compact pill in this section.
   * Absent when the configured action has no valid destination — in which case
   * nothing is rendered, so call/WhatsApp never fall back to booking.
   */
  cta?: { href: string; label: string; external: boolean; action: CtaAction } | null
}) {
  const rtl = locale === 'ar'
  if (!contact) return null

  const phoneVisible = contact.phone.isVisible && contact.phone.value.trim() !== ''
  const whatsappVisible = contact.whatsapp.isVisible && contact.whatsapp.value.trim() !== ''
  const emailVisible = contact.email.isVisible && contact.email.value.trim() !== ''
  const addressVisible = contact.address.isVisible && contact.address.value.trim() !== ''
  const mapsVisible = contact.googleMapsUrl.isVisible && contact.googleMapsUrl.value.trim() !== ''

  const telHref = phoneVisible ? toTelHref(contact.phone.value) : null
  const waHref = whatsappVisible ? toWhatsAppHref(contact.whatsapp.value) : null
  const mailHref = emailVisible ? toMailto(contact.email.value) : null
  // Independent guard: only a safe http(s) URL becomes a Maps link.
  const mapsHref = mapsVisible && isHttpUrl(contact.googleMapsUrl.value)
    ? contact.googleMapsUrl.value.trim()
    : null

  const hasAny =
    phoneVisible || whatsappVisible || emailVisible || addressVisible || mapsVisible
  // The Main CTA is rendered by this section, so the section must survive even
  // when every contact field is hidden — otherwise configuring a CTA with no
  // contact details would silently drop it from the site entirely.
  if (!hasAny && !cta) return null

  return (
    <section id="contact" className="border-t border-[#eef0f4]" data-testid="contact-section">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight break-words sm:text-4xl">
            {heading || (rtl ? 'تواصل معنا' : 'Contact Us')}
          </h2>
          {description && (
            <p className="mt-2 text-base text-[#6f7b90] break-words">{description}</p>
          )}
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Contact actions — only valid destinations become links. */}
          <div className="flex flex-wrap gap-3">
            {phoneVisible &&
              (telHref ? (
                <ActionButton href={telHref} label={rtl ? 'اتصل بنا' : 'Call us'}>
                  <Phone className="h-5 w-5" />
                </ActionButton>
              ) : (
                <PlainDetail icon={<Phone className="h-5 w-5" />} text={contact.phone.value} />
              ))}

            {whatsappVisible &&
              (waHref ? (
                <ActionButton href={waHref} label={rtl ? 'واتساب' : 'WhatsApp'} external>
                  <WhatsAppIcon size={20} />
                </ActionButton>
              ) : (
                <PlainDetail icon={<WhatsAppIcon size={20} />} text={contact.whatsapp.value} />
              ))}

            {emailVisible &&
              (mailHref ? (
                <ActionButton href={mailHref} label={rtl ? 'راسلنا' : 'Email us'}>
                  <Mail className="h-5 w-5" />
                </ActionButton>
              ) : (
                <PlainDetail icon={<Mail className="h-5 w-5" />} text={contact.email.value} />
              ))}

            {mapsVisible &&
              (mapsHref ? (
                <ActionButton href={mapsHref} label={rtl ? 'الموقع على الخريطة' : 'View on map'} external>
                  <MapPin className="h-5 w-5" />
                </ActionButton>
              ) : null)}
          </div>

          {/* Details + social */}
          <div className="space-y-4">
            {/* Address. When a valid Google Maps URL is configured the address
                becomes a link to it; otherwise it stays plain text. A hidden
                address is never rendered. */}
            {addressVisible &&
              (mapsHref ? (
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex max-w-full items-start gap-2.5 text-base text-[#6f7b90] outline-none transition-colors duration-150 hover:text-[var(--site-primary)] focus-visible:ring-2 focus-visible:ring-[var(--site-primary)] focus-visible:ring-offset-2 cursor-pointer"
                >
                  <span className="mt-0.5 shrink-0 text-[var(--site-primary)]" aria-hidden="true">
                    <MapPin className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 break-words">{contact.address.value}</span>
                </a>
              ) : (
                <div className="flex max-w-full items-start gap-2.5 text-base text-[#6f7b90]">
                  <span className="mt-0.5 shrink-0 text-[var(--site-primary)]" aria-hidden="true">
                    <MapPin className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 break-words">{contact.address.value}</span>
                </div>
              ))}

            <SocialLinks locale={locale} social={social} size={22} />
          </div>
        </div>

        {/* The configurable Main CTA — a compact, content-sized pill. Rendered
            only when the configured action resolves to a valid destination. It
            is fully independent of the hero's booking button. */}
        {cta && (
          <div className="mt-10 flex justify-center">
            <Link
              href={cta.href}
              {...(cta.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              data-testid="contact-cta"
              data-cta-action={cta.action}
              className="inline-flex w-fit max-w-full items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white shadow-sm outline-none transition-all duration-200 hover:opacity-90 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[var(--site-primary)] focus-visible:ring-offset-2 cursor-pointer"
              style={{ backgroundColor: 'var(--site-primary)' }}
            >
              <CtaIcon action={cta.action} />
              <span className="min-w-0 break-words">{cta.label}</span>
              <ArrowRight className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
