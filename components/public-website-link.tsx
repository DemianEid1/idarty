'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, Globe } from 'lucide-react'

// ---------------------------------------------------------------------------
// Public website link card.
//
// A standalone card that spans the dashboard content width, placed above the
// Quick Actions row. It groups the site's identity (name + public url) on the
// start side and the two actions (copy, open) on the end side.
//
// `url` comes from the project's single public-URL source — `publicTenantUrl()`
// in lib/routes.ts, the same helper the onboarding and workspace-settings
// screens use. That helper returns an ABSOLUTE url when NEXT_PUBLIC_APP_URL is
// configured, and a root-relative path otherwise. The open action lets the
// browser resolve the relative case, and the copy action resolves it against
// the browser's own origin — so no domain is ever hardcoded and env-configured
// / custom-domain deployments keep working unchanged.
//
// The visible url is truncated on narrow screens; the full value is always in
// the title tooltip and is exactly what the copy button writes.
// ---------------------------------------------------------------------------

export function PublicWebsiteLink({
  url,
  locale,
  siteName,
}: {
  url: string
  locale: 'ar' | 'en'
  siteName: string
}) {
  const rtl = locale === 'ar'
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear a pending reset timer on unmount.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const copy = useCallback(async () => {
    // The exact absolute url: configured base when present, otherwise the
    // browser origin. Never a hardcoded domain.
    const absolute = /^https?:\/\//i.test(url) ? url : `${window.location.origin}${url}`

    let ok = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(absolute)
        ok = true
      } else {
        // Fallback for non-secure contexts, where the async Clipboard API is
        // unavailable. Kept so copying still works on plain http:// hosts.
        const area = document.createElement('textarea')
        area.value = absolute
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.top = '0'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        ok = document.execCommand('copy')
        document.body.removeChild(area)
      }
    } catch {
      ok = false
    }

    setStatus(ok ? 'copied' : 'error')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setStatus('idle'), ok ? 2000 : 3000)
  }, [url])

  const feedback =
    status === 'copied'
      ? rtl ? 'تم نسخ الرابط' : 'Link copied'
      : status === 'error'
        ? rtl ? 'تعذر نسخ الرابط' : 'Could not copy'
        : ''

  return (
    <section className="w-full rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6">
      {/* Muted section label, at the start edge (right in RTL, left in LTR). */}
      <p className="text-xs font-semibold text-ink-lighter">
        {rtl ? 'رابط الموقع العام' : 'Public Website Link'}
      </p>

      {/* Identity at the start edge, actions at the end edge, with the free
          space between the two groups. `min-w-0` on the identity lets the url
          truncate instead of forcing the row wider than the card; the row wraps
          at narrow widths so the two groups never overflow. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f0faf9] text-brand-teal">
            <Globe aria-hidden="true" className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#172033]">
              {rtl ? `موقع ${siteName}` : `${siteName} Website`}
            </p>
            {/* `dir=ltr` keeps the url readable when the dashboard is Arabic. */}
            <p dir="ltr" title={url} className="mt-0.5 truncate font-mono text-xs text-ink-muted">
              {url}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Secondary: copy the full url. */}
          <button
            type="button"
            onClick={copy}
            aria-label={rtl ? 'نسخ رابط الموقع' : 'Copy website link'}
            title={rtl ? 'نسخ الرابط' : 'Copy link'}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-paper text-[#516078] outline-none transition hover:border-brand-teal hover:text-brand-teal focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
          >
            {status === 'copied' ? (
              <Check aria-hidden="true" className="h-4 w-4 text-[#24865b]" />
            ) : (
              <Copy aria-hidden="true" className="h-4 w-4" />
            )}
          </button>

          {/* Primary: open the public site in a new tab. */}
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label={rtl ? 'فتح الموقع في تبويب جديد' : 'Open website in a new tab'}
            title={rtl ? 'فتح الموقع' : 'Open website'}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-teal text-white outline-none transition hover:bg-[#0d6560] focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
          >
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Localized copy feedback, announced politely. */}
      <span
        role="status"
        aria-live="polite"
        className={`mt-2 block text-xs font-semibold ${status === 'error' ? 'text-[#b42318]' : 'text-[#24865b]'}`}
      >
        {feedback}
      </span>
    </section>
  )
}
