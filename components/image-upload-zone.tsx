'use client'

import { useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import type { Locale } from '@/lib/i18n'

// ---------------------------------------------------------------------------
// Image upload zone — a wide horizontal drop target.
//
// A modern dashboard-style upload area that still uses the native file input
// underneath, so it stays keyboard-operable and accessible. The native input is
// visually hidden but remains the single source of truth for the picked file.
//
// LAYOUT
// ------
// Horizontal on every breakpoint: [icon/preview] [title + hint] [action]. It
// uses logical `flex-row` so RTL mirrors it automatically — no `flex-row-reverse`
// and no direction-specific margins.
//
// Behaviour preserved from the previous implementation:
//   * only the explicitly supported MIME types are accepted;
//   * the size ceiling is shown in the label (the server bound is authoritative);
//   * an invalid or cancelled pick leaves the existing image untouched;
//   * the input is reset after every pick so the same file can be re-selected.
//
// The picker button calls `stopPropagation` so a click cannot also reach the
// drop-zone's own handler and open the picker twice.
// ---------------------------------------------------------------------------

export function ImageUploadZone({
  locale,
  onFile,
  accept,
  maxSizeLabel,
  title,
  hint,
  preview,
  previewFit = 'contain',
  previewStyle,
}: {
  locale: Locale
  onFile: (file: File) => void
  accept: string
  maxSizeLabel: string
  title: string
  hint?: string
  /** Current image URL, when one exists. Rendered as a thumbnail on the left. */
  preview?: string
  /**
   * How the preview fills its thumbnail. Defaults to `contain`, so a logo is
   * NEVER cropped by its own preview. The hero passes `cover` to keep showing
   * the framed crop.
   */
  previewFit?: 'contain' | 'cover'
  /** Extra inline style for the preview image (e.g. the hero focal point). */
  previewStyle?: React.CSSProperties
  /** Retained for call-site compatibility; the zone is always full-width now. */
  compact?: boolean
}) {
  const rtl = locale === 'ar'
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    onFile(file)
  }

  function openPicker() {
    inputRef.current?.click()
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        handleFiles(e.dataTransfer.files)
      }}
      className={`flex min-h-[76px] w-full flex-row items-center gap-3 rounded-2xl border border-dashed px-4 py-3 transition-colors ${
        dragOver
          ? 'border-brand-teal bg-[#f0faf9]'
          : 'border-[#d9dfe9] bg-surface hover:border-brand-teal/60'
      }`}
    >
      {/* Leading visual: the current image if there is one, else the upload glyph. */}
      {preview ? (
        <span className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#e1e5ed] bg-paper">
          <img
            src={preview}
            alt=""
            className={`h-full w-full ${previewFit === 'cover' ? 'object-cover' : 'object-contain'}`}
            style={previewStyle}
            aria-hidden="true"
          />
        </span>
      ) : (
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f0faf9] text-brand-teal"
          aria-hidden="true"
        >
          <ImagePlus className="h-5 w-5" />
        </span>
      )}

      {/* Text block: grows to fill the space between the visual and the action. */}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold text-[#374151]">{title}</span>
        {hint && <span className="mt-0.5 text-[11px] text-ink-lighter">{hint}</span>}
        <span className="mt-0.5 text-[11px] text-ink-lighter" dir="ltr">
          {maxSizeLabel}
        </span>
      </span>

      {/* Action. `stopPropagation` prevents the drop-zone click from also firing. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          openPicker()
        }}
        className="shrink-0 rounded-lg border border-[#e1e5ed] bg-paper px-3.5 py-2 text-xs font-semibold text-[#516078] outline-none transition hover:bg-surface focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
      >
        {rtl ? 'اختر صورة' : 'Choose image'}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        aria-label={title}
        tabIndex={-1}
        onChange={(e) => {
          handleFiles(e.target.files)
          // Reset so the same file can be selected again.
          e.target.value = ''
        }}
      />
    </div>
  )
}
