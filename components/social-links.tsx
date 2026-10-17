import type { Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  resolveVisibleSocialLinks,
  toWhatsAppHref,
  type ContactConfig,
  type SocialConfig,
  type SocialPlatform,
} from '@/lib/contact-social'

// ---------------------------------------------------------------------------
// Social links.
//
// The ONLY source of platform URLs on the public website. Every URL is filtered
// through `resolveVisibleSocialLinks`, which requires `isEnabled` AND
// `isHttpUrl`, so a disabled platform or an unsafe protocol (javascript:, data:)
// can never reach an `href`.
// ---------------------------------------------------------------------------

const PLATFORM_LABELS: Record<SocialPlatform, { ar: string; en: string }> = {
  instagram: { ar: 'إنستغرام', en: 'Instagram' },
  facebook: { ar: 'فيسبوك', en: 'Facebook' },
  tiktok: { ar: 'تيك توك', en: 'TikTok' },
  youtube: { ar: 'يوتيوب', en: 'YouTube' },
}

/**
 * Inline SVG paths for the four supported platforms.
 * Inline marks are used deliberately: the project has no brand-icon dependency,
 * and adding one for four fixed platforms is not justified.
 */
const PLATFORM_PATHS: Record<SocialPlatform, string> & { whatsapp: string } = {
  instagram:
    'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 1.8c-3.14 0-3.5.01-4.74.07-1.14.05-1.76.24-2.17.4-.55.21-.94.47-1.35.88-.41.41-.67.8-.88 1.35-.16.41-.35 1.03-.4 2.17-.06 1.24-.07 1.6-.07 4.74s.01 3.5.07 4.74c.05 1.14.24 1.76.4 2.17.21.55.47.94.88 1.35.41.41.8.67 1.35.88.41.16 1.03.35 2.17.4 1.24.06 1.6.07 4.74.07s3.5-.01 4.74-.07c1.14-.05 1.76-.24 2.17-.4.55-.21.94-.47 1.35-.88.41-.41.67-.8.88-1.35.16-.41.35-1.03.4-2.17.06-1.24.07-1.6.07-4.74s-.01-3.5-.07-4.74c-.05-1.14-.24-1.76-.4-2.17a3.6 3.6 0 0 0-.88-1.35 3.6 3.6 0 0 0-1.35-.88c-.41-.16-1.03-.35-2.17-.4-1.24-.06-1.6-.07-4.74-.07Zm0 3.06a4.98 4.98 0 1 1 0 9.96 4.98 4.98 0 0 1 0-9.96Zm0 1.8a3.18 3.18 0 1 0 0 6.36 3.18 3.18 0 0 0 0-6.36Zm5.2-.68a1.16 1.16 0 1 1 0 2.32 1.16 1.16 0 0 1 0-2.32Z',
  facebook:
    'M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06C2 17.08 5.66 21.24 10.44 22v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.91h-2.33V22C18.34 21.24 22 17.08 22 12.06Z',
  tiktok:
    'M16.6 5.82A4.28 4.28 0 0 0 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 1 1 .77-5.06V9.66a5.7 5.7 0 0 0-.77-.05A5.69 5.69 0 1 0 15.55 15.3V9.01a7.35 7.35 0 0 0 4.29 1.38V7.3a4.28 4.28 0 0 1-3.24-1.48Z',
  youtube:
    'M21.58 7.19a2.5 2.5 0 0 0-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42a2.5 2.5 0 0 0-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81a2.5 2.5 0 0 0 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42a2.5 2.5 0 0 0 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81ZM10 15.5v-7l6 3.5-6 3.5Z',
  // WhatsApp glyph: solid speech bubble badge with telephone handset cutout,
  // matching the solid Facebook and YouTube badge style.
  whatsapp:
    'M12.05 0C5.5 0 .16 5.34.16 11.9c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.9 0-3.18-1.24-6.16-3.48-8.41A11.82 11.82 0 0 0 12.05 0ZM17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5 0 1.47 1.07 2.89 1.22 3.09.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.22 1.36.19 1.87.11.57-.08 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35Z',
}

export function SocialLinks({
  locale,
  social,
  className,
  iconClassName,
  size = 20,
}: {
  locale: Locale
  social: SocialConfig | null | undefined
  className?: string
  iconClassName?: string
  size?: number
}) {
  const rtl = locale === 'ar'
  // Single gate: disabled platforms and unsafe protocols are dropped here.
  const links = resolveVisibleSocialLinks(social)
  if (links.length === 0) return null

  return (
    <ul className={className ?? 'flex items-center gap-2'} data-testid="social-links">
      {links.map(({ platform, url }) => (
        <li key={platform}>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label={PLATFORM_LABELS[platform][locale]}
            title={PLATFORM_LABELS[platform][locale]}
            className={
              iconClassName ??
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#647087] outline-none transition hover:text-[var(--site-primary)] focus-visible:ring-2 focus-visible:ring-[var(--site-primary)] focus-visible:ring-offset-2'
            }
            data-social-platform={platform}
          >
            <svg
              width={size}
              height={size}
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className="shrink-0"
            >
              <path fillRule="evenodd" clipRule="evenodd" d={PLATFORM_PATHS[platform]} />
            </svg>
          </a>
        </li>
      ))}
    </ul>
  )
}

export { PLATFORM_LABELS }

// ---------------------------------------------------------------------------
// WhatsApp brand mark, as a standalone icon.
//
// Exported so every WhatsApp surface (header, footer, Contact section action)
// uses the SAME glyph.
// ---------------------------------------------------------------------------

/**
 * Standard WhatsApp brand mark in a 20-unit viewBox scaled uniformly from 24 units.
 */
export function WhatsAppIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={className ?? 'shrink-0'}
    >
      <g transform="scale(0.833333)">
        <path fillRule="evenodd" clipRule="evenodd" d={PLATFORM_PATHS.whatsapp} />
      </g>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// WhatsApp link.
//
// WhatsApp is a CONTACT field (contact.whatsapp), not one of the four social
// platforms, so it is NOT rendered by <SocialLinks>. This component renders it
// using the same visibility + destination rules: the field must be visible AND
// hold a valid E.164 number. An invalid or hidden value renders nothing.
// ---------------------------------------------------------------------------

export function WhatsAppLink({
  locale,
  contact,
  className,
  iconClassName,
  size = 20,
}: {
  locale: Locale
  contact: ContactConfig | null | undefined
  className?: string
  iconClassName?: string
  size?: number
}) {
  if (!contact) return null
  const field = contact.whatsapp
  if (!field.isVisible || field.value.trim() === '') return null
  const href = toWhatsAppHref(field.value)
  if (!href) return null

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={locale === 'ar' ? 'واتساب' : 'WhatsApp'}
      title={locale === 'ar' ? 'واتساب' : 'WhatsApp'}
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#647087] outline-none transition hover:text-[var(--site-primary)] focus-visible:ring-2 focus-visible:ring-[var(--site-primary)] focus-visible:ring-offset-2',
        className,
        iconClassName
      )}
      data-social-platform="whatsapp"
    >
      <WhatsAppIcon size={size} />
    </a>
  )
}
