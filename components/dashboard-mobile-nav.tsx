'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react'

// ---------------------------------------------------------------------------
// Dashboard mobile navigation.
//
// The desktop sidebar is `hidden lg:block`; below `lg` there was no navigation
// at all. This provides a menu button in the dashboard header that opens a side
// drawer with the SAME nav items (passed in, so there is one source of truth).
//
// Accessibility: the drawer is a labelled modal dialog — Escape closes it, the
// backdrop closes it, focus moves in on open and returns to the trigger on
// close, Tab is trapped inside, and background scrolling is locked.
//
// Direction: the panel is anchored with the logical `start-0`, so it opens from
// the left in English (LTR) and from the right in Arabic (RTL).
// ---------------------------------------------------------------------------

export interface DashboardNavItem {
  id: string
  label: string
  icon: React.ReactNode
}

export function DashboardMobileNav({
  locale,
  items,
  activeTab,
  adminHref,
  adminLabel,
}: {
  locale: 'ar' | 'en'
  items: DashboardNavItem[]
  activeTab: string
  adminHref?: string
  adminLabel?: string
}) {
  const rtl = locale === 'ar'
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    // Return focus to the trigger so keyboard users are not stranded.
    requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  // Close on Escape; trap Tab focus inside the panel while open.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])'
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  // Lock background scrolling while the drawer is open.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  // Move focus into the drawer when it opens.
  useEffect(() => {
    if (open) closeButtonRef.current?.focus()
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={rtl ? 'فتح قائمة التنقل' : 'Open navigation menu'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-paper text-[#516078] outline-none transition hover:bg-surface focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 lg:hidden"
      >
        <Menu aria-hidden="true" className="h-5 w-5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={rtl ? 'قائمة التنقل' : 'Navigation menu'}
        >
          {/* Backdrop — clicking it closes the drawer. */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={close}
            aria-hidden="true"
          />

          {/* Panel — logical `start-0`: left in LTR, right in RTL. */}
          <div
            ref={panelRef}
            className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-paper shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <span className="text-sm font-semibold text-[#172033]">
                {rtl ? 'القائمة' : 'Menu'}
              </span>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={close}
                aria-label={rtl ? 'إغلاق القائمة' : 'Close menu'}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-[#516078] outline-none transition hover:bg-surface focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-3 text-sm">
              {items.map((item) => {
                const isActive = activeTab === item.id
                return (
                  <a
                    key={item.id}
                    href={`?tab=${item.id}`}
                    onClick={close}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 outline-none transition focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 ${
                      isActive
                        ? 'bg-brand-teal font-semibold text-white shadow-sm'
                        : 'text-[#647087] hover:bg-surface'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </a>
                )
              })}

              {adminHref && adminLabel && (
                <div className="mt-4 border-t border-border pt-4">
                  <a
                    href={adminHref}
                    onClick={close}
                    className="flex items-center gap-3 rounded-xl bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-700 outline-none transition hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-amber-500"
                  >
                    {adminLabel}
                  </a>
                </div>
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
