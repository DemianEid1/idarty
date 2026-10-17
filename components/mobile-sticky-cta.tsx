import Link from 'next/link'
import { CalendarDays, Phone } from 'lucide-react'
import { WhatsAppIcon } from '@/components/social-links'

// ---------------------------------------------------------------------------
// Mobile sticky CTA — ONE compact, circular, icon-only floating action button.
//
// Visibility contract (unchanged):
//
//   * rendered only below `md` (the project's existing mobile/tablet boundary)
//   * rendered only when the tenant enabled it AND the configured primary CTA
//     has a usable destination — the caller passes `href`, so an invalid
//     destination can never reach this component
//   * when it IS rendered, the header CTA is hidden on mobile (the caller owns
//     that decision), so exactly one primary action is visible at any width
//
// The action is derived from the EXISTING Main CTA configuration — no new
// fields. `action` maps to the same icon set used elsewhere on the site:
// booking -> calendar, call -> phone, whatsapp -> the WhatsApp brand mark.
//
// The button is icon-only, so the label is exposed as its accessible name
// (`aria-label` + `title`) rather than rendered as visible text.
//
// `env(safe-area-inset-bottom)` plus 1rem of padding keeps it clear of the iOS
// home indicator, and `end-0` is the LOGICAL inline edge, so it sits in the
// bottom-right for LTR and the bottom-left for RTL automatically.
// ---------------------------------------------------------------------------

export function MobileStickyCta({
  href,
  label,
  external,
  action,
}: {
  href: string
  label: string
  external: boolean
  action: 'booking' | 'call' | 'whatsapp'
}) {
  // One icon per supported action. `WhatsAppIcon` is the same brand mark the
  // header, footer and Contact section already use.
  const icon =
    action === 'whatsapp' ? (
      <WhatsAppIcon size={22} />
    ) : action === 'call' ? (
      <Phone className="h-5 w-5 shrink-0" aria-hidden="true" />
    ) : (
      <CalendarDays className="h-5 w-5 shrink-0" aria-hidden="true" />
    )

  // 48px circle — at the recommended minimum touch-target size.
  const buttonClass =
    'flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg outline-none transition-all duration-200 hover:opacity-90 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--site-primary)] cursor-pointer'

  return (
    <div
      className="fixed bottom-0 end-0 z-40 p-4 md:hidden"
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      data-testid="mobile-sticky-cta"
    >
      {external ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={label}
          title={label}
          className={buttonClass}
          style={{ backgroundColor: 'var(--site-primary)' }}
        >
          {icon}
        </a>
      ) : (
        <Link
          href={href}
          aria-label={label}
          title={label}
          className={buttonClass}
          style={{ backgroundColor: 'var(--site-primary)' }}
        >
          {icon}
        </Link>
      )}
    </div>
  )
}
