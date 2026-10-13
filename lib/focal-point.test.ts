import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  DEFAULT_FOCAL_POINT,
  LOGO_USES_CONTAIN,
  FOCAL_POINT_PRESETS,
  focalPointToCss,
  isDefaultFocalPoint,
  resolveFocalPoint,
  serviceFocalPoint,
  validateServiceFocalPoint,
} from './image-focal-point'
import { parseWebsiteConfig, safeParseWebsiteConfig } from './website-config'

/**
 * Requirement 1 — focal point.
 *
 * Covers persistence (schema validation), the CSS each renderer technique
 * produces, and backward compatibility for images stored before the feature
 * existed (no focal point at all).
 */

describe('focal point helpers', () => {
  it('defaults to the centre for missing, partial and malformed input', () => {
    // These are the exact shapes an existing stored config can have.
    for (const value of [undefined, null, {}, 0, 'center', [], { x: 10 }, { y: 10 }]) {
      const p = resolveFocalPoint(value)
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      // A partial value keeps the supplied axis and centres the other.
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const v = value as { x?: number; y?: number }
        if (v.x !== undefined) expect(p.x).toBe(v.x)
        else expect(p.x).toBe(DEFAULT_FOCAL_POINT.x)
        if (v.y !== undefined) expect(p.y).toBe(v.y)
        else expect(p.y).toBe(DEFAULT_FOCAL_POINT.y)
      } else {
        expect(p).toEqual(DEFAULT_FOCAL_POINT)
      }
    }
  })

  it('clamps out-of-range coordinates instead of emitting invalid CSS', () => {
    expect(resolveFocalPoint({ x: -50, y: 400 })).toEqual({ x: 0, y: 100 })
    expect(resolveFocalPoint({ x: 1000, y: -1000 })).toEqual({ x: 100, y: 0 })
  })

  it('rounds fractional percentages to whole numbers', () => {
    expect(resolveFocalPoint({ x: 33.7, y: 66.2 })).toEqual({ x: 34, y: 66 })
  })

  it('renders a CSS position string', () => {
    expect(focalPointToCss({ x: 50, y: 50 })).toBe('50% 50%')
    expect(focalPointToCss({ x: 0, y: 100 })).toBe('0% 100%')
    expect(focalPointToCss(undefined)).toBe('50% 50%')
  })

  it('identifies the default (uncropped) position', () => {
    expect(isDefaultFocalPoint(undefined)).toBe(true)
    expect(isDefaultFocalPoint({ x: 50, y: 50 })).toBe(true)
    expect(isDefaultFocalPoint({ x: 50, y: 0 })).toBe(false)
  })

  it('offers nine distinct presets including the centre', () => {
    expect(FOCAL_POINT_PRESETS).toHaveLength(9)
    const keys = FOCAL_POINT_PRESETS.map((p) => p.key)
    expect(new Set(keys).size).toBe(9)
    expect(keys).toContain('center')
    const coords = FOCAL_POINT_PRESETS.map((p) => `${p.x},${p.y}`)
    expect(new Set(coords).size).toBe(9)
  })

  it('documents that the logo is not cropped', () => {
    // The logo renders with object-contain, so a focal point would be wrong.
    expect(LOGO_USES_CONTAIN).toBe(true)
  })
})

describe('service focal point from nullable columns', () => {
  it('returns null when both columns are unset (existing rows)', () => {
    expect(serviceFocalPoint(null, null)).toBeNull()
    expect(serviceFocalPoint(undefined, undefined)).toBeNull()
  })

  it('resolves when either column is set', () => {
    expect(serviceFocalPoint(0, 100)).toEqual({ x: 0, y: 100 })
    expect(serviceFocalPoint(25, null)).toEqual({ x: 25, y: 50 })
  })

  it('validates integers within range', () => {
    expect(validateServiceFocalPoint(0, 0)).toBeNull()
    expect(validateServiceFocalPoint(100, 100)).toBeNull()
    expect(validateServiceFocalPoint(-1, 50)).not.toBeNull()
    expect(validateServiceFocalPoint(101, 50)).not.toBeNull()
    expect(validateServiceFocalPoint(50.5, 50)).not.toBeNull()
    expect(validateServiceFocalPoint('50', 50)).not.toBeNull()
  })
})

describe('hero focal point persistence (schema)', () => {
  const withHero = (theme: Record<string, unknown>) => ({
    theme,
    sections: [{ id: 's1', type: 'hero', content: {} }],
  })

  it('is absent on a legacy config (backward compatible)', () => {
    const parsed = parseWebsiteConfig(withHero({}))
    expect(parsed.theme.heroImageFocalPoint).toBeUndefined()
    // The renderer must still produce the historical centre position.
    expect(focalPointToCss(parsed.theme.heroImageFocalPoint)).toBe('50% 50%')
  })

  it('round-trips a stored focal point', () => {
    const parsed = parseWebsiteConfig(withHero({ heroImageFocalPoint: { x: 0, y: 100 } }))
    expect(parsed.theme.heroImageFocalPoint).toEqual({ x: 0, y: 100 })
    const reparsed = parseWebsiteConfig(JSON.parse(JSON.stringify(parsed)))
    expect(reparsed.theme.heroImageFocalPoint).toEqual({ x: 0, y: 100 })
  })

  it('rejects out-of-range coordinates server-side', () => {
    expect(() => parseWebsiteConfig(withHero({ heroImageFocalPoint: { x: -1, y: 50 } }))).toThrow()
    expect(() => parseWebsiteConfig(withHero({ heroImageFocalPoint: { x: 50, y: 101 } }))).toThrow()
  })

  it('rejects a non-numeric focal point', () => {
    expect(() => parseWebsiteConfig(withHero({ heroImageFocalPoint: { x: 'left', y: 50 } }))).toThrow()
  })

  it('safeParse returns null for an invalid focal point', () => {
    expect(safeParseWebsiteConfig(withHero({ heroImageFocalPoint: { x: 500, y: 50 } }))).toBeNull()
  })
})
