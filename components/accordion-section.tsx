'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Locale } from '@/lib/i18n'

// ---------------------------------------------------------------------------
// Accessible collapsible section for the Website Builder.
//
// State is LOCAL: collapsing never discards form values, never triggers a
// Save/Publish/Discard/Preview mutation, and never resets inputs. The panel's
// children stay MOUNTED while collapsed, so uploaded images, focal-point
// selections and unsaved edits survive a toggle.
//
// Typography note: `app/globals.css` applies `button, [role="button"] {
// font-weight: 600 }` globally. The header IS a <button>, so any text inside it
// that must keep the body weight (400) has to opt out explicitly with
// `font-normal` — otherwise it inherits the button weight and reads as bold.
// ---------------------------------------------------------------------------

export function AccordionSection({
  locale,
  title,
  description,
  open,
  onToggle,
  children,
  preview,
  icon: Icon,
  testId,
}: {
  locale: Locale
  title: string
  description?: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
  /** Compact, presentational summary of current values, shown while collapsed. */
  preview?: React.ReactNode
  /** Section glyph. Rendered in a teal chip so all sections read consistently. */
  icon?: LucideIcon
  testId?: string
}) {
  const key = testId ?? title.replace(/\s+/g, '-').toLowerCase()
  const panelId = `accordion-${key}-panel`
  const buttonId = `accordion-${key}-button`

  // Explicit icon swap rather than a CSS rotation. A rotation has to be undone
  // for RTL (`rtl:rotate-180`), which is what made the arrow appear stuck in the
  // same direction; selecting the glyph outright is direction-independent.
  const Chevron = open ? ChevronUp : ChevronDown

  return (
    <div className="rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6">
      <button
        type="button"
        id={buttonId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 rounded-xl px-1 py-1 text-start outline-none transition focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
        data-testid={testId ? `${testId}-header` : undefined}
      >
        <span className="flex min-w-0 flex-1 items-start gap-3">
          {Icon && (
            <span
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f0faf9] text-brand-teal"
              aria-hidden="true"
              data-testid={testId ? `${testId}-icon` : undefined}
            >
              <Icon className="h-[18px] w-[18px]" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-semibold">{title}</span>
            {description && (
              // `font-normal` restores the body weight: without it this inherits
              // the button's 600 and the section descriptions read as bold.
              <span className="mt-0.5 block text-sm font-normal text-ink-muted">{description}</span>
            )}
            {!open && preview && (
              <span
                className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-normal text-[#647087]"
                data-testid={testId ? `${testId}-preview` : undefined}
              >
                {preview}
              </span>
            )}
          </span>
        </span>
        <Chevron className="mt-0.5 h-5 w-5 shrink-0 text-[#647087]" aria-hidden="true" />
      </button>

      {/*
        Intrinsic-height animation: a 0fr → 1fr grid row animates to the
        content's real height without a fixed max-height, so long forms are
        never clipped. `inert` + `aria-hidden` take the collapsed panel out of
        the tab order and the accessibility tree while keeping it mounted.
        `motion-reduce:transition-none` honours prefers-reduced-motion.
      */}
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        aria-hidden={!open}
        inert={!open}
        data-state={open ? 'open' : 'closed'}
        data-testid={testId ? `${testId}-panel` : undefined}
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
