// ---------------------------------------------------------------------------
// Image focal-point helpers (framework-free).
//
// LEGACY: the visible focal-point UI has been replaced by a conventional
// cropper (see lib/image-crop.ts). These helpers are retained because
//   (a) stored configurations may still carry `heroImageFocalPoint`, and
//   (b) the `services.image_focal_x/_y` columns are already applied and shared,
// and both must keep rendering correctly.
// They are no longer exposed as user-facing controls.
//
// A focal point is where the "important" part of an image sits, expressed as a
// percentage pair on each axis. It is what the browser keeps visible when an
// image is cropped to fill its container:
//
//   - Hero background image  -> CSS `background-position`
//   - Service card image     -> CSS `object-position`
//   - Logo                   -> NOT cropped (it renders with `object-contain`),
//                               so no focal point applies. See
//                               `LOGO_USES_CONTAIN` below.
//
// The default `{ x: 50, y: 50 }` is the centre. That is exactly what the
// renderers used before this feature existed (`backgroundPosition: 'center'`
// and the implicit `object-position: 50% 50%`), so every existing image keeps
// its current appearance with no migration.
//
// Kept in a plain module with no directive so it can be imported by server
// code (the Zod schema, the renderer) AND client components (the editor).
// ---------------------------------------------------------------------------

import { cropToLayerStyle, resolveCrop, type ImageCrop } from '@/lib/image-crop'

/** A focal point as percentages: 0 = start edge, 100 = end edge. */
export interface FocalPoint {
  x: number
  y: number
}

/** The centre — matches the pre-existing crop behaviour. */
export const DEFAULT_FOCAL_POINT: FocalPoint = { x: 50, y: 50 }

/**
 * The logo is rendered with `object-contain`, so the whole mark is always
 * visible and cropping it would be wrong. It therefore has no focal point;
 * this flag documents that decision for the editor UI and the tests.
 */
export const LOGO_USES_CONTAIN = true

/** Clamp a possibly-missing/invalid coordinate into the 0–100 range. */
function clampPercent(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(100, Math.max(0, Math.round(n)))
}

/**
 * Resolve a stored focal point to a valid one, falling back to the centre for
 * missing, partial or malformed input. Never throws — this runs on the render
 * path for persisted data.
 */
export function resolveFocalPoint(value: unknown): FocalPoint {
  if (!value || typeof value !== 'object') return { ...DEFAULT_FOCAL_POINT }
  const raw = value as { x?: unknown; y?: unknown }
  return {
    x: clampPercent(raw.x, DEFAULT_FOCAL_POINT.x),
    y: clampPercent(raw.y, DEFAULT_FOCAL_POINT.y),
  }
}

/** True when the focal point is the centre (i.e. no custom cropping). */
export function isDefaultFocalPoint(value: unknown): boolean {
  const p = resolveFocalPoint(value)
  return p.x === DEFAULT_FOCAL_POINT.x && p.y === DEFAULT_FOCAL_POINT.y
}

/** Render a focal point as a CSS position value, e.g. `"50% 25%"`. */
export function focalPointToCss(value: unknown): string {
  const p = resolveFocalPoint(value)
  return `${p.x}% ${p.y}%`
}

/**
 * The nine preset positions offered by the visual control, in reading order.
 * `key` is a stable identifier for i18n labels and tests.
 */
export const FOCAL_POINT_PRESETS: readonly { key: string; x: number; y: number }[] = [
  { key: 'top-start', x: 0, y: 0 },
  { key: 'top', x: 50, y: 0 },
  { key: 'top-end', x: 100, y: 0 },
  { key: 'start', x: 0, y: 50 },
  { key: 'center', x: 50, y: 50 },
  { key: 'end', x: 100, y: 50 },
  { key: 'bottom-start', x: 0, y: 100 },
  { key: 'bottom', x: 50, y: 100 },
  { key: 'bottom-end', x: 100, y: 100 },
] as const

/**
 * Build a focal point from the two nullable integer columns on `services`.
 * Returns null when neither is set, so "no custom focal point" stays
 * distinguishable from an explicitly chosen centre.
 *
 * A column that is set while its partner is NULL keeps the stored axis and
 * centres the other — it must NOT be coerced to 0, which would silently pin the
 * image to an edge the tenant never chose.
 */
export function serviceFocalPoint(x: number | null | undefined, y: number | null | undefined): FocalPoint | null {
  const hasX = x !== null && x !== undefined
  const hasY = y !== null && y !== undefined
  if (!hasX && !hasY) return null
  return {
    x: hasX ? clampPercent(x, DEFAULT_FOCAL_POINT.x) : DEFAULT_FOCAL_POINT.x,
    y: hasY ? clampPercent(y, DEFAULT_FOCAL_POINT.y) : DEFAULT_FOCAL_POINT.y,
  }
}

/**
 * Validate a focal point for a service image: both axes must be integers in
 * 0–100. Returns null when valid, or an error message when not.
 */
export function validateServiceFocalPoint(x: unknown, y: unknown): string | null {
  for (const [axis, value] of [['x', x], ['y', y]] as const) {
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 100) {
      return `Focal point ${axis} must be a whole number between 0 and 100.`
    }
  }
  return null
}

/**
 * Assemble the service-image props the shared renderer consumes.
 *
 * Kept in ONE place because three call sites (public page, preview page,
 * dashboard) build the same shape, and a divergence between them is exactly how
 * a preview stops matching the published site.
 *
 * `cropLayer` is null when no crop is stored, which makes the renderer fall back
 * to the whole image — the behaviour every pre-crop image already has.
 */
export function toServiceImageProps(row: {
  image?: string | null
  imageFocalX?: number | null
  imageFocalY?: number | null
  imageCropX?: string | number | null
  imageCropY?: string | number | null
  imageCropWidth?: string | number | null
  imageCropHeight?: string | number | null
}): { image: string | null; imageFocalPoint: FocalPoint | null; cropLayer: React.CSSProperties | null } {
  const crop = numericCrop(row)
  return {
    image: row.image ?? null,
    imageFocalPoint: serviceFocalPoint(row.imageFocalX, row.imageFocalY),
    cropLayer: crop ? cropToLayerStyle(crop) ?? null : null,
  }
}

/**
 * Rebuild a crop object from the four `numeric` columns.
 *
 * Postgres `numeric` comes back from `pg` as a STRING to avoid precision loss,
 * so each value must be parsed before use — passing the raw string into the crop
 * helpers would silently fail their `typeof n === 'number'` guard and the crop
 * would be ignored.
 */
export function numericCrop(row: {
  imageCropX?: string | number | null
  imageCropY?: string | number | null
  imageCropWidth?: string | number | null
  imageCropHeight?: string | number | null
}): ImageCrop | null {
  const parse = (v: string | number | null | undefined): number | null => {
    if (v === null || v === undefined) return null
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : null
  }
  const x = parse(row.imageCropX)
  const y = parse(row.imageCropY)
  const width = parse(row.imageCropWidth)
  const height = parse(row.imageCropHeight)
  if (x === null || y === null || width === null || height === null) return null
  return resolveCrop({ x, y, width, height })
}

