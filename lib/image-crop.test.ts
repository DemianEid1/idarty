import { describe, expect, it } from 'vitest'
import {
  CROP_ASPECTS,
  FULL_CROP,
  clampOffset,
  computeCropFromView,
  cropAspect,
  cropCenterToPosition,
  cropToLayerStyle,
  hasCrop,
  isFullCrop,
  resolveCrop,
  zoomToPercent,
} from './image-crop'

/**
 * Crop geometry — the pure math behind the cropper and the renderer.
 *
 * `computeCropFromView` is the inverse of what `cropToLayerStyle` renders, so
 * these also prove the round trip: what the user frames is what gets stored and
 * what the page reproduces.
 */

describe('resolveCrop', () => {
  it('returns null for absent or non-object input (no crop => whole image)', () => {
    for (const v of [undefined, null, 0, 'x', [], {}]) {
      expect(resolveCrop(v)).toBeNull()
    }
  })

  it('returns null when any component is missing or non-numeric', () => {
    expect(resolveCrop({ x: 0, y: 0, width: 1 })).toBeNull()
    expect(resolveCrop({ x: 0, y: 0, width: 1, height: 'x' })).toBeNull()
    expect(resolveCrop({ x: NaN, y: 0, width: 1, height: 1 })).toBeNull()
  })

  it('accepts a valid rectangle unchanged', () => {
    expect(resolveCrop({ x: 0.1, y: 0.2, width: 0.5, height: 0.6 })).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.5,
      height: 0.6,
    })
  })

  it('rejects a degenerate (too small) side', () => {
    expect(resolveCrop({ x: 0, y: 0, width: 0.01, height: 1 })).toBeNull()
    expect(resolveCrop({ x: 0, y: 0, width: 1, height: 0 })).toBeNull()
  })

  it('keeps the rectangle inside the image by shifting the origin', () => {
    // x + width > 1 would fall outside; the origin is pulled back rather than
    // resizing, so the crop stays usable.
    const c = resolveCrop({ x: 0.9, y: 0.9, width: 0.5, height: 0.5 })!
    expect(c.x).toBeCloseTo(0.5, 6)
    expect(c.y).toBeCloseTo(0.5, 6)
    expect(c.x + c.width).toBeLessThanOrEqual(1)
    expect(c.y + c.height).toBeLessThanOrEqual(1)
  })

  it('clamps out-of-range values rather than emitting invalid CSS', () => {
    const c = resolveCrop({ x: -5, y: 5, width: 2, height: 2 })!
    expect(c.width).toBe(1)
    expect(c.height).toBe(1)
    expect(c.x).toBe(0)
    expect(c.y).toBe(0)
  })
})

describe('hasCrop / isFullCrop', () => {
  it('reports whether a usable crop is stored', () => {
    expect(hasCrop(undefined)).toBe(false)
    expect(hasCrop({ x: 0, y: 0, width: 1, height: 1 })).toBe(true)
  })

  it('treats the full image as "no crop"', () => {
    expect(isFullCrop(undefined)).toBe(true)
    expect(isFullCrop({ x: 0, y: 0, width: 1, height: 1 })).toBe(true)
    // A rect that overhangs on both axes resolves back to the whole image, so it
    // is also a no-op crop.
    expect(isFullCrop({ x: 0.1, y: 0, width: 1, height: 1 })).toBe(true)
    // A genuinely partial crop is not.
    expect(isFullCrop({ x: 0, y: 0, width: 0.5, height: 1 })).toBe(false)
    expect(isFullCrop({ x: 0, y: 0, width: 1, height: 0.5 })).toBe(false)
  })
})

describe('cropToLayerStyle', () => {
  it('returns undefined for no crop so the renderer can fall back', () => {
    expect(cropToLayerStyle(undefined)).toBeUndefined()
    expect(cropToLayerStyle({ x: 1 })).toBeUndefined()
  })

  it('scales the layer so it always covers its container', () => {
    const style = cropToLayerStyle({ x: 0.25, y: 0.5, width: 0.5, height: 0.25 })!
    expect(style.width).toBe('200%')
    expect(style.height).toBe('400%')
    expect(style.left).toBe('-50%')
    expect(style.top).toBe('-200%')
    expect(style.position).toBe('absolute')
  })

  it('never produces a layer smaller than the container', () => {
    for (const c of [
      FULL_CROP,
      { x: 0, y: 0, width: 0.1, height: 0.1 },
      { x: 0.45, y: 0.9, width: 0.55, height: 0.1 },
      { x: 0, y: 0, width: 0.05, height: 1 },
    ]) {
      const s = cropToLayerStyle(c)!
      expect(parseFloat(String(s.width))).toBeGreaterThanOrEqual(100)
      expect(parseFloat(String(s.height))).toBeGreaterThanOrEqual(100)
    }
  })

  it('offsets are always zero or negative (the layer only ever overhangs)', () => {
    for (const c of [
      { x: 0, y: 0, width: 0.5, height: 0.5 },
      { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
      { x: 0, y: 0, width: 1, height: 1 },
    ]) {
      const s = cropToLayerStyle(c)!
      expect(parseFloat(String(s.left))).toBeLessThanOrEqual(0)
      expect(parseFloat(String(s.top))).toBeLessThanOrEqual(0)
    }
  })
})

describe('computeCropFromView — the pan/zoom model', () => {
  const base = { frameWidth: 400, frameHeight: 150, imageWidth: 1600, imageHeight: 1200, zoom: 1, offsetX: 0, offsetY: 0 }

  it('returns a full-width crop at zoom 1 for a wide frame', () => {
    const c = computeCropFromView(base)
    // cover scale = max(400/1600, 150/1200) = 0.25 => image drawn 400x300.
    // The frame therefore shows the full width and half the height.
    expect(c.width).toBeCloseTo(1, 6)
    expect(c.height).toBeCloseTo(0.5, 6)
    expect(c.x).toBeCloseTo(0, 6)
    expect(c.y).toBeCloseTo(0.25, 6)
  })

  it('zooming in shrinks the captured region', () => {
    const wide = computeCropFromView(base)
    const zoomed = computeCropFromView({ ...base, zoom: 2 })
    expect(zoomed.width).toBeLessThan(wide.width)
    expect(zoomed.height).toBeLessThan(wide.height)
  })

  it('panning moves the captured region in the opposite direction', () => {
    const centred = computeCropFromView({ ...base, zoom: 2 })
    // Dragging the image right shows a region further LEFT in the source.
    const panned = computeCropFromView({ ...base, zoom: 2, offsetX: 50 })
    expect(panned.x).toBeLessThan(centred.x)
  })

  it('never returns a region outside the image', () => {
    for (const offsetX of [-10000, -100, 0, 100, 10000]) {
      for (const offsetY of [-10000, -100, 0, 100, 10000]) {
        const c = computeCropFromView({ ...base, zoom: 3, offsetX, offsetY })
        expect(c.x).toBeGreaterThanOrEqual(0)
        expect(c.y).toBeGreaterThanOrEqual(0)
        expect(c.x + c.width).toBeLessThanOrEqual(1.000001)
        expect(c.y + c.height).toBeLessThanOrEqual(1.000001)
      }
    }
  })

  it('degrades safely on zero-size input', () => {
    expect(computeCropFromView({ ...base, frameWidth: 0 })).toEqual(FULL_CROP)
    expect(computeCropFromView({ ...base, imageWidth: 0 })).toEqual(FULL_CROP)
  })

  it('round-trips through cropToLayerStyle (what you frame is what renders)', () => {
    const crop = computeCropFromView({ ...base, zoom: 1.5, offsetX: 20, offsetY: -10 })
    const style = cropToLayerStyle(crop)!
    // Re-deriving the crop from the style must return the same rectangle.
    const width = 100 / parseFloat(String(style.width))
    const height = 100 / parseFloat(String(style.height))
    expect(width).toBeCloseTo(crop.width, 6)
    expect(height).toBeCloseTo(crop.height, 6)
  })
})

describe('clampOffset', () => {
  const base = { frameWidth: 400, frameHeight: 150, imageWidth: 1600, imageHeight: 1200, zoom: 1 }

  it('allows no movement when the image exactly covers the frame', () => {
    // At zoom 1 the image is 400x300 for a 400x150 frame: no horizontal slack.
    const c = clampOffset({ ...base, offsetX: 999, offsetY: 999 })
    expect(c.offsetX).toBe(0)
    // Vertically there is slack: (300 - 150) / 2 = 75.
    expect(c.offsetY).toBe(75)
  })

  it('grows the allowed range as zoom increases', () => {
    const at1 = clampOffset({ ...base, zoom: 1, offsetX: 9999, offsetY: 0 })
    const at2 = clampOffset({ ...base, zoom: 2, offsetX: 9999, offsetY: 0 })
    expect(at2.offsetX).toBeGreaterThan(at1.offsetX)
  })

  it('is symmetric', () => {
    const right = clampOffset({ ...base, zoom: 2, offsetX: 9999, offsetY: 0 })
    const left = clampOffset({ ...base, zoom: 2, offsetX: -9999, offsetY: 0 })
    expect(right.offsetX).toBe(-left.offsetX)
  })
})

describe('cropAspect / cropCenterToPosition / zoomToPercent', () => {
  it('computes the aspect ratio of a crop', () => {
    expect(cropAspect({ x: 0, y: 0, width: 0.8, height: 0.5 })).toBeCloseTo(1.6, 6)
    expect(cropAspect(undefined)).toBeNull()
  })

  it('renders the crop centre as a CSS position (legacy focal point)', () => {
    expect(cropCenterToPosition({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 })).toBe('50% 50%')
    expect(cropCenterToPosition({ x: 0, y: 0, width: 1, height: 1 })).toBe('50% 50%')
    expect(cropCenterToPosition(undefined)).toBe('50% 50%')
  })

  it('renders zoom as a percentage', () => {
    expect(zoomToPercent(1)).toBe(100)
    expect(zoomToPercent(1.5)).toBe(150)
    expect(zoomToPercent(0)).toBe(100) // invalid => treated as 1
  })
})

describe('CROP_ASPECTS', () => {
  it('exposes a hero and a service ratio, both landscape', () => {
    expect(CROP_ASPECTS.hero).toBeGreaterThan(1)
    expect(CROP_ASPECTS.service).toBeGreaterThan(1)
    // The service ratio must match the card's reserved area (`aspect-[16/10]`).
    expect(CROP_ASPECTS.service).toBeCloseTo(16 / 10, 6)
  })
})
