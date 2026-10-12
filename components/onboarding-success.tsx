'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'

// ---------------------------------------------------------------------------
// Onboarding-complete banner.
//
// Shown on the Overview tab once every "getting started" step is done, replacing
// the full checklist. Dismissal is remembered in localStorage, which is the
// right scope for a purely cosmetic preference:
//   - per browser/device, so it never hides setup state on another device
//   - no database migration, no new column, no server round-trip
//   - reversible (clearing site data brings it back)
//
// The key is namespaced by tenant so dismissing one workspace does not hide the
// banner for another.
//
// Progressive enhancement: the server renders the banner and the client removes
// it after mount if it was dismissed, so there is no hydration mismatch and no
// flash of the wrong state beyond one frame.
// ---------------------------------------------------------------------------

export function OnboardingSuccess({
  locale,
  storageKey,
}: {
  locale: 'ar' | 'en'
  storageKey: string
}) {
  const rtl = locale === 'ar'
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey) === '1') setDismissed(true)
    } catch {
      // Storage can throw (private mode, blocked cookies). Failing open keeps
      // the banner visible rather than breaking the page.
    }
  }, [storageKey])

  if (dismissed) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      window.localStorage.setItem(storageKey, '1')
    } catch {
      // Ignore: the banner is already hidden for this view.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#d7ece3] bg-[#f2fbf7] px-4 py-3 sm:px-5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#dff5e9] text-[#24865b]">
        <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
      </span>
      <p className="min-w-0 flex-1 text-sm font-semibold text-[#1c6b4a] wrap-anywhere">
        {rtl ? 'تم إعداد مساحة العمل بنجاح' : 'Your workspace is all set!'}
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label={rtl ? 'إخفاء رسالة الإعداد' : 'Dismiss setup message'}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#24865b] outline-none transition hover:bg-[#dff5e9] focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  )
}
