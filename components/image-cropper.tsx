'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Locale } from '@/lib/i18n'
import {
  clampOffset,
  computeCropFromView,
  resolveCrop,
  zoomToPercent,
  type ImageCrop,
} from '@/lib/image-crop'

/**
 * A conventional rectangular image cropper.
 *
 * The user drags the image inside a fixed frame and zooms with a slider, then
 * confirms or cancels. The frame's aspect ratio is the target slot's real
 * aspect ratio, so what they frame is what the site shows.
 *
 * The ORIGINAL image is never modified: confirming only produces normalized
 * crop metadata, so the cropper can be reopened later and re-adjusted without
 * any loss of quality.
 *
 * Accessibility: the frame is a focusable control driven by the arrow keys
 * (pan), `+`/`-` (zoom) and `Home` (reset), so it is usable without a pointer.
 * The zoom is also a real range input, and every control has a translated
 * label. Escape cancels, and focus returns to the trigger on close.
 */
export function ImageCropper({
  locale,
  image,
  aspect,
  initialCrop,
  title,
  onCancel,
  onConfirm,
}: {
  locale: Locale
  image: string
  aspect: number
  initialCrop?: ImageCrop | null
  title?: string
  onCancel: () => void
  onConfirm: (crop: ImageCrop) => void
}) {
  const rtl = locale === 'ar'
  const frameRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Natural size of the loaded image, needed for the cover scale.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [frame, setFrame] = useState({ w: 0, h: 0 })
  const drag = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null)

  // Measure the frame (it is responsive) and keep it in sync on resize.
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setFrame({ w: r.width, h: r.height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Seed the view from an existing crop so reopening shows the saved framing.
  useEffect(() => {
    if (!natural || frame.w <= 0 || frame.h <= 0) return
    const existing = resolveCrop(initialCrop)
    if (!existing) return
    // Invert computeCropFromView for the stored rectangle.
    const coverScale = Math.max(frame.w / natural.w, frame.h / natural.h)
    const scale = frame.w / (existing.width * natural.w)
    const nextZoom = scale / coverScale
    const left = -existing.x * scale * natural.w
    const top = -existing.y * scale * natural.h
    const next = clampOffset({
      frameWidth: frame.w,
      frameHeight: frame.h,
      imageWidth: natural.w,
      imageHeight: natural.h,
      zoom: nextZoom,
      offsetX: frame.w / 2 - (natural.w * scale) / 2 - left,
      offsetY: frame.h / 2 - (natural.h * scale) / 2 - top,
    })
    setZoom(nextZoom)
    setOffset({ x: next.offsetX, y: next.offsetY })
    // Only re-seed when the image or frame changes, not on every drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural?.w, natural?.h, frame.w, frame.h])

  // Escape cancels; focus moves into the dialog on open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKey)
    dialogRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const clampFor = useCallback(
    (z: number, ox: number, oy: number) => {
      if (!natural) return { offsetX: ox, offsetY: oy }
      return clampOffset({
        frameWidth: frame.w,
        frameHeight: frame.h,
        imageWidth: natural.w,
        imageHeight: natural.h,
        zoom: z,
        offsetX: ox,
        offsetY: oy,
      })
    },
    [natural, frame.w, frame.h]
  )

  const setZoomClamped = useCallback(
    (z: number) => {
      const next = Math.min(3, Math.max(1, z))
      setZoom(next)
      setOffset((prev) => {
        const c = clampFor(next, prev.x, prev.y)
        return { x: c.offsetX, y: c.offsetY }
      })
    },
    [clampFor]
  )

  const reset = useCallback(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  // ---- Pointer / touch dragging -------------------------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!natural) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const c = clampFor(zoom, d.baseX + (e.clientX - d.startX), d.baseY + (e.clientY - d.startY))
    setOffset({ x: c.offsetX, y: c.offsetY })
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  // ---- Keyboard -----------------------------------------------------------
  const onKeyDownFrame = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = 12
    const nudge = (dx: number, dy: number) => {
      setOffset((p) => {
        const c = clampFor(zoom, p.x + dx, p.y + dy)
        return { x: c.offsetX, y: c.offsetY }
      })
    }
    let handled = true
    switch (e.key) {
      case 'ArrowLeft': nudge(-step, 0); break
      case 'ArrowRight': nudge(step, 0); break
      case 'ArrowUp': nudge(0, -step); break
      case 'ArrowDown': nudge(0, step); break
      case '+':
      case '=': setZoomClamped(zoom + 0.1); break
      case '-':
      case '_': setZoomClamped(zoom - 0.1); break
      case 'Home': reset(); break
      default: handled = false
    }
    if (handled) e.preventDefault()
  }

  const confirm = () => {
    if (!natural) return
    const crop = computeCropFromView({
      frameWidth: frame.w,
      frameHeight: frame.h,
      imageWidth: natural.w,
      imageHeight: natural.h,
      zoom,
      offsetX: offset.x,
      offsetY: offset.y,
    })
    onConfirm(crop)
  }

  // The live image layer uses the same geometry the renderer will use, so the
  // preview is the real thing rather than an approximation.
  const layerStyle: React.CSSProperties = natural
    ? (() => {
        const coverScale = Math.max(frame.w / natural.w, frame.h / natural.h)
        const scale = coverScale * zoom
        const w = natural.w * scale
        const h = natural.h * scale
        return {
          position: 'absolute',
          width: `${w}px`,
          height: `${h}px`,
          left: `${frame.w / 2 + offset.x - w / 2}px`,
          top: `${frame.h / 2 + offset.y - h / 2}px`,
        }
      })()
    : { position: 'absolute', inset: 0 }

  const t = {
    crop: rtl ? 'اقتصاص' : 'Crop',
    cancel: rtl ? 'إلغاء' : 'Cancel',
    zoom: rtl ? 'تكبير' : 'Zoom',
    reset: rtl ? 'إعادة تعيين' : 'Reset',
    hint: rtl
      ? 'اسحب الصورة لتحريكها، واستخدم المنزلق أو مفاتيح الأسهم للتكبير والتحريك.'
      : 'Drag the image to reposition it. Use the slider or arrow keys to zoom and move.',
    title: title ?? (rtl ? 'اقتصاص الصورة' : 'Crop image'),
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      dir={rtl ? 'rtl' : 'ltr'}
      role="dialog"
      aria-modal="true"
      aria-label={t.title}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl outline-none"
      >
        <h3 className="text-lg font-semibold">{t.title}</h3>
        <p className="mt-1 text-xs text-ink-muted">{t.hint}</p>

        {/* Crop frame — its aspect ratio IS the target slot's aspect ratio. */}
        <div
          ref={frameRef}
          role="application"
          tabIndex={0}
          aria-label={rtl ? 'منطقة الاقتصاص' : 'Crop area'}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDownFrame}
          className="relative mt-4 w-full cursor-grab touch-none overflow-hidden rounded-xl bg-[#0f1520] outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
          style={{ aspectRatio: String(aspect) }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt=""
            aria-hidden="true"
            draggable={false}
            onLoad={(e) =>
              setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
            }
            style={{ ...layerStyle, maxWidth: 'none', userSelect: 'none' }}
          />
          {/* Rule-of-thirds guides, purely decorative. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute inset-y-0 start-1/3 w-px bg-white/25" />
            <div className="absolute inset-y-0 start-2/3 w-px bg-white/25" />
            <div className="absolute inset-x-0 top-1/3 h-px bg-white/25" />
            <div className="absolute inset-x-0 top-2/3 h-px bg-white/25" />
          </div>
        </div>

        {/* Zoom */}
        <label className="mt-4 block">
          <span className="flex items-center justify-between text-xs font-semibold text-[#647087]">
            <span>{t.zoom}</span>
            <span className="font-mono">{zoomToPercent(zoom)}%</span>
          </span>
          <input
            type="range"
            min={100}
            max={300}
            step={1}
            value={zoomToPercent(zoom)}
            onChange={(e) => setZoomClamped(Number(e.target.value) / 100)}
            aria-label={t.zoom}
            className="mt-2 h-1.5 w-full cursor-pointer accent-[#0F766E]"
          />
        </label>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-ink-muted transition hover:bg-surface"
          >
            {t.reset}
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-ink-muted transition hover:bg-surface"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!natural}
              className="rounded-xl bg-brand-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0d6560] disabled:opacity-50"
            >
              {t.crop}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
