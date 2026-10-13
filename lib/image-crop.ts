// ---------------------------------------------------------------------------
// Image crop geometry (framework-free, no dependencies).
//
// A crop is a normalized rectangle in SOURCE-IMAGE space: every value is a
// fraction of the original image, so it is resolution-independent and needs no
// image dimensions at render time.
//
//   { x, y, width, height }   — x/y are the top-left corner, all in 0..1
//
// HOW IT RENDERS WITHOUT RE-ENCODING
// ----------------------------------
// The crop is applied with pure CSS using an oversized inner layer:
//
//   layer: position absolute;
//          width:  (100 / width)%;
//          height: (100 / height)%;
//          left:   -(x / width) * 100%;
//          top:    -(y / height) * 100%;
//
// Because `width` and `height` are <= 1, the layer is always >= 100% on BOTH
// axes, so it always covers its container — no gaps, and no horizontal
// overflow as long as the container clips (`overflow: hidden`).
//
// The <img> inside that layer is `width:100%; height:100%; object-fit:cover`,
// so it scales and centres within the layer. The stored image is NEVER
// re-encoded, re-cropped or overwritten — only this metadata changes, which is
// what makes re-opening the cropper lossless.
//
// When the container's aspect ratio equals the crop's aspect ratio (the service
// card case, where the card fixes the image area) the crop is reproduced
// exactly. When the container's aspect differs (the hero band, whose height
// follows its content and therefore varies by viewport) the layer still covers
// the band and `object-fit: cover` trims a little more from the longer axis —
// uniformly, centred, and never distorting the image.
// ---------------------------------------------------------------------------

/** A crop rectangle, normalized to the source image (all values 0..1). */
export interface ImageCrop {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Target aspect ratios (width / height) for the two croppable image slots.
 *
 * - `hero`    — the wide, short hero band on desktop.
 * - `service` — the fixed image area reserved on every service card.
 *
 * These are the ratios the cropper frames, so what the user frames is what the
 * page shows.
 */
export const CROP_ASPECTS = {
  hero: 16 / 6,
  service: 16 / 10,
} as const

export type CropSlot = keyof typeof CROP_ASPECTS

/** The whole image, uncropped. */
export const FULL_CROP: ImageCrop = { x: 0, y: 0, width: 1, height: 1 }

/** Smallest allowed crop side, as a fraction — guards against a degenerate rect. */
const MIN_SIDE = 0.05

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/**
 * Resolve stored metadata to a valid crop, or null when there is nothing usable.
 *
 * Returns null for absent/malformed input so callers can fall back to the
 * pre-crop rendering (plain `object-cover`), which is exactly how every image
 * uploaded before this feature behaves.
 */
export function resolveCrop(value: unknown): ImageCrop | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<Record<keyof ImageCrop, unknown>>
  const nums = [raw.x, raw.y, raw.width, raw.height]
  if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return null

  const width = clamp01(raw.width as number)
  const height = clamp01(raw.height as number)
  if (width < MIN_SIDE || height < MIN_SIDE) return null

  // Keep the rect inside the image: shift the origin back rather than resizing,
  // so a slightly out-of-range stored value still yields a usable crop.
  const x = clamp01(Math.min(raw.x as number, 1 - width))
  const y = clamp01(Math.min(raw.y as number, 1 - height))
  return { x, y, width, height }
}

/** Whether a usable crop is stored. False means "render the whole image". */
export function hasCrop(value: unknown): boolean {
  return resolveCrop(value) !== null
}

/** True when the crop covers the entire image (equivalent to no crop). */
export function isFullCrop(value: unknown): boolean {
  const crop = resolveCrop(value)
  if (!crop) return true
  return crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1
}

/**
 * Inline style for the oversized inner layer that realises the crop.
 * Pair with an `overflow: hidden` container.
 */
export function cropToLayerStyle(value: unknown): React.CSSProperties | undefined {
  const crop = resolveCrop(value)
  if (!crop) return undefined
  return {
    position: 'absolute',
    width: `${100 / crop.width}%`,
    height: `${100 / crop.height}%`,
    left: `${-(crop.x / crop.width) * 100}%`,
    top: `${-(crop.y / crop.height) * 100}%`,
  }
}

/**
 * The crop's centre as a CSS background position, e.g. `"50% 25%"`.
 *
 * Used only for the LEGACY focal-point columns, which predate this crop model
 * and store a single point rather than a rectangle. New crops use
 * `cropToLayerStyle`.
 */
export function cropCenterToPosition(value: unknown): string {
  const crop = resolveCrop(value)
  if (!crop) return '50% 50%'
  const cx = Math.round((crop.x + crop.width / 2) * 100)
  const cy = Math.round((crop.y + crop.height / 2) * 100)
  return `${cx}% ${cy}%`
}

/** Aspect ratio of a crop, or null when there is no usable crop. */
export function cropAspect(value: unknown): number | null {
  const crop = resolveCrop(value)
  if (!crop) return null
  return crop.width / crop.height
}

/**
 * Derive the normalized crop rectangle from the cropper's live view.
 *
 * The view model is deliberately small and easy to reason about:
 *   - `zoom`    1 = the image exactly covers the frame; > 1 zooms in.
 *   - `offsetX` / `offsetY`  the image's centre offset from the frame centre,
 *                            in frame pixels.
 *
 * This is the single place the pan/zoom state is converted into persisted
 * geometry, so it can be unit-tested without a browser.
 */
export function computeCropFromView(view: {
  frameWidth: number
  frameHeight: number
  imageWidth: number
  imageHeight: number
  zoom: number
  offsetX: number
  offsetY: number
}): ImageCrop {
  const { frameWidth, frameHeight, imageWidth, imageHeight } = view
  if (frameWidth <= 0 || frameHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return { ...FULL_CROP }
  }

  const zoom = Number.isFinite(view.zoom) && view.zoom > 0 ? view.zoom : 1
  // Scale that makes the image exactly cover the frame, then apply the zoom.
  const coverScale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight)
  const scale = coverScale * zoom

  // Image top-left in frame coordinates.
  const left = frameWidth / 2 + view.offsetX - (imageWidth * scale) / 2
  const top = frameHeight / 2 + view.offsetY - (imageHeight * scale) / 2

  // The frame, expressed in source-image pixels, then normalized.
  const width = clamp01(frameWidth / scale / imageWidth)
  const height = clamp01(frameHeight / scale / imageHeight)
  const x = clamp01(-left / scale / imageWidth)
  const y = clamp01(-top / scale / imageHeight)

  return {
    x: Math.min(x, 1 - width),
    y: Math.min(y, 1 - height),
    width,
    height,
  }
}

/**
 * Clamp a pan offset so the image can never be dragged far enough to expose the
 * area behind it. Called on every pointer move and on zoom.
 */
export function clampOffset(view: {
  frameWidth: number
  frameHeight: number
  imageWidth: number
  imageHeight: number
  zoom: number
  offsetX: number
  offsetY: number
}): { offsetX: number; offsetY: number } {
  const { frameWidth, frameHeight, imageWidth, imageHeight } = view
  const zoom = Number.isFinite(view.zoom) && view.zoom > 0 ? view.zoom : 1
  const coverScale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight)
  const scale = coverScale * zoom
  const dw = imageWidth * scale
  const dh = imageHeight * scale
  const maxX = Math.max(0, (dw - frameWidth) / 2)
  const maxY = Math.max(0, (dh - frameHeight) / 2)
  return {
    offsetX: Math.min(maxX, Math.max(-maxX, view.offsetX)),
    offsetY: Math.min(maxY, Math.max(-maxY, view.offsetY)),
  }
}

/** Human-readable zoom as a percentage, for the cropper's readout. */
export function zoomToPercent(zoom: number): number {
  return Math.round((Number.isFinite(zoom) && zoom > 0 ? zoom : 1) * 100)
}
