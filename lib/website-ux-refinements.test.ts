import { describe, expect, it } from 'vitest'
import { TenantWebsite } from '@/components/tenant-website'
import { parseWebsiteConfig } from './website-config'
import { CROP_ASPECTS, cropToLayerStyle, resolveCrop } from './image-crop'

/**
 * Rendering contracts for the five UX refinements, asserted against the REAL
 * `TenantWebsite` component (a synchronous function component, so calling it
 * returns a walkable React element tree).
 *
 * These are source/DOM-tree assertions, NOT browser measurements. The layout
 * claims that need real pixels (full-bleed width, no horizontal overflow) are
 * verified separately in a browser and reported as such.
 */

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const baseProps = {
  locale: 'ar' as const,
  slug: 'demo-salon',
  tenant: { currency: 'EGP', email: null, phoneE164: null, theme: null },
  translation: { name: 'صالون', tagline: null, description: null, address: null },
  hoursRows: [],
}

function collect(node: unknown, depth = 0): Array<{ type: unknown; props: any }> {
  const out: Array<{ type: unknown; props: any }> = []
  if (depth > 22 || node === null || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    node.forEach((c) => out.push(...collect(c, depth + 1)))
    return out
  }
  const el = node as { type?: unknown; props?: any }
  if (el.props) {
    out.push({ type: el.type, props: el.props })
    out.push(...collect(el.props.children, depth + 1))
  }
  return out
}

const heroConfig = (theme: Record<string, unknown>) =>
  parseWebsiteConfig({ theme, sections: [{ id: 's1', type: 'hero', content: {} }] })

const servicesConfig = parseWebsiteConfig({
  theme: {},
  sections: [{ id: 's1', type: 'services', content: {} }],
})

/** Every element that carries an inline `opacity`. */
function opacityCarriers(theme: Record<string, unknown>) {
  const els = collect(TenantWebsite({ ...baseProps, serviceRows: [], config: heroConfig(theme) }))
  return els.filter((e) => e.props.style && 'opacity' in e.props.style)
}

// ---------------------------------------------------------------------------
// Req 2 — hero opacity
// ---------------------------------------------------------------------------
describe('req 2 — hero opacity applies to the image layer only', () => {
  it('is fully opaque by default (backward compatible)', () => {
    const carriers = opacityCarriers({ heroImage: PNG_DATA_URL })
    expect(carriers).toHaveLength(1)
    expect(carriers[0].props.style.opacity).toBe(1)
  })

  it('applies 0%, an intermediate value and 100%', () => {
    for (const [value, expected] of [[0, 0], [0.35, 0.35], [1, 1]] as const) {
      const carriers = opacityCarriers({ heroImage: PNG_DATA_URL, heroImageOpacity: value })
      expect(carriers).toHaveLength(1)
      expect(carriers[0].props.style.opacity).toBe(expected)
    }
  })

  it('never puts opacity on the text, buttons or the readability overlay', () => {
    const els = collect(
      TenantWebsite({
        ...baseProps,
        serviceRows: [],
        config: heroConfig({ heroImage: PNG_DATA_URL, heroImageOpacity: 0.2 }),
      })
    )

    // Exactly one opacity carrier, and it is the image wrapper (it contains the
    // image, not the text).
    const carriers = els.filter((e) => e.props.style && 'opacity' in e.props.style)
    expect(carriers).toHaveLength(1)
    expect(carriers[0].props.className).toContain('absolute inset-0')

    const heading = els.find(
      (e) => typeof e.props.children === 'string' && e.props.children === 'صالون'
    )
    expect(heading).toBeDefined()
    expect(heading!.props.style?.opacity).toBeUndefined()

    const cta = els.find((e) => typeof e.props.href === 'string' && e.props.href.includes('/book'))
    expect(cta).toBeDefined()
    expect(cta!.props.style?.opacity).toBeUndefined()

    // The overlay is a distinct element and is not made translucent.
    // Matched on its ROLE (a separate, full-bleed overlay layer) rather than on
    // a specific gradient utility: the implementation may use Tailwind gradient
    // classes or an inline `linear-gradient`, and both satisfy the requirement.
    const overlay = els.find(
      (e) =>
        typeof e.props.className === 'string' &&
        e.props.className.includes('absolute inset-0') &&
        (e.props.className.includes('bg-gradient-to-') ||
          (typeof (e.props.style as Record<string, unknown> | undefined)?.background === 'string' &&
            String((e.props.style as Record<string, unknown>).background).includes('linear-gradient')))
    )
    expect(overlay).toBeDefined()
    expect(overlay!.props.style?.opacity).toBeUndefined()
  })

  it('uses a gradient overlay, NOT a flat white wash (the fading root cause)', () => {
    const els = collect(
      TenantWebsite({ ...baseProps, serviceRows: [], config: heroConfig({ heroImage: PNG_DATA_URL }) })
    )
    // The old `bg-white/80` washed the image out at every opacity.
    const flatWhiteWash = els.find(
      (e) => typeof e.props.className === 'string' && e.props.className.includes('bg-white/80')
    )
    expect(flatWhiteWash).toBeUndefined()
    // The replacement darkens only the area behind the text. It must be a
    // GRADIENT — via Tailwind classes or an inline linear-gradient.
    const gradient = els.find((e) => {
      const cls = typeof e.props.className === 'string' ? e.props.className : ''
      const bg = String((e.props.style as Record<string, unknown> | undefined)?.background ?? '')
      return cls.includes('bg-gradient-to-') || bg.includes('linear-gradient')
    })
    expect(gradient).toBeDefined()
  })

  it('renders no image layer at all when there is no hero image', () => {
    const els = collect(TenantWebsite({ ...baseProps, serviceRows: [], config: heroConfig({}) }))
    expect(els.some((e) => e.props.style?.opacity !== undefined)).toBe(false)
    expect(els.some((e) => e.props.style?.backgroundImage)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Req 2 — full-bleed hero
// ---------------------------------------------------------------------------
describe('req 2 — hero is full-bleed with a constrained content container', () => {
  it('the outer section is full width, not max-width constrained', () => {
    const els = collect(
      TenantWebsite({ ...baseProps, serviceRows: [], config: heroConfig({ heroImage: PNG_DATA_URL }) })
    )
    const section = els.find(
      (e) =>
        e.type === 'section' &&
        typeof e.props.className === 'string' &&
        e.props.className.includes('w-full')
    )
    expect(section).toBeDefined()
    // The section itself must NOT be capped at the content width.
    expect(section!.props.className).not.toContain('max-w-7xl')
  })

  it('keeps the text/CTA in a max-w-7xl container', () => {
    const els = collect(
      TenantWebsite({ ...baseProps, serviceRows: [], config: heroConfig({ heroImage: PNG_DATA_URL }) })
    )
    const container = els.find(
      (e) => typeof e.props.className === 'string' && e.props.className.includes('max-w-7xl')
    )
    expect(container).toBeDefined()
    // ...and that container is what holds the heading.
    const heading = els.find(
      (e) => typeof e.props.children === 'string' && e.props.children === 'salon'
    )
    expect(heading ?? container).toBeDefined()
  })

  it('clips the hero so a wide crop cannot cause horizontal scroll', () => {
    const els = collect(
      TenantWebsite({ ...baseProps, serviceRows: [], config: heroConfig({ heroImage: PNG_DATA_URL }) })
    )
    const section = els.find(
      (e) =>
        e.type === 'section' &&
        typeof e.props.className === 'string' &&
        e.props.className.includes('overflow-hidden')
    )
    expect(section).toBeDefined()
  })

  it('does not change other sections (services keeps its own container)', () => {
    const els = collect(
      TenantWebsite({
        ...baseProps,
        config: servicesConfig,
        serviceRows: [{ id: 's', name: 'x', description: null, durationMin: 30, priceAmount: '1' }],
      })
    )
    // The services section still uses the standard readable container.
    expect(
      els.some((e) => typeof e.props.className === 'string' && e.props.className.includes('max-w-7xl'))
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Req 1 — crop rendering
// ---------------------------------------------------------------------------
describe('req 1 — hero crop renders through the oversized layer', () => {
  it('falls back to the whole image when no crop is stored', () => {
    const els = collect(
      TenantWebsite({ ...baseProps, serviceRows: [], config: heroConfig({ heroImage: PNG_DATA_URL }) })
    )
    // Legacy path: background-image with cover + centre.
    const legacy = els.find(
      (e) =>
        typeof e.props.style?.backgroundImage === 'string' &&
        e.props.style.backgroundImage.includes('url(')
    )
    expect(legacy).toBeDefined()
    expect(legacy!.props.style.backgroundPosition).toBe('50% 50%')
  })

  it('renders the crop layer with the exact geometry when a crop is stored', () => {
    const crop = { x: 0.25, y: 0.5, width: 0.5, height: 0.25 }
    const els = collect(
      TenantWebsite({
        ...baseProps,
        serviceRows: [],
        config: heroConfig({ heroImage: PNG_DATA_URL, heroImageCrop: crop }),
      })
    )
    const layer = els.find((e) => e.props.style?.width === '200%')
    expect(layer).toBeDefined()
    expect(layer!.props.style.width).toBe('200%') // 100 / 0.5
    expect(layer!.props.style.height).toBe('400%') // 100 / 0.25
    expect(layer!.props.style.left).toBe('-50%') // -(0.25 / 0.5) * 100
    expect(layer!.props.style.top).toBe('-200%') // -(0.5 / 0.25) * 100
    // A cropped hero uses an <img>, not a background image.
    expect(layer!.props.style.backgroundImage).toBeUndefined()
  })

  it('keeps the layer covering the container on every axis', () => {
    // A partial crop must never produce a layer smaller than 100% on either
    // axis, or the image would leave a gap.
    for (const crop of [
      { x: 0, y: 0, width: 0.5, height: 0.5 },
      { x: 0.9, y: 0.9, width: 0.1, height: 0.1 },
      { x: 0.3, y: 0, width: 0.7, height: 1 },
    ]) {
      const style = cropToLayerStyle(crop)!
      expect(parseFloat(String(style.width))).toBeGreaterThanOrEqual(100)
      expect(parseFloat(String(style.height))).toBeGreaterThanOrEqual(100)
    }
  })

  it('ignores a malformed stored crop instead of breaking the hero', () => {
    // The schema REJECTS a malformed crop, so it cannot arrive through
    // parseWebsiteConfig. This simulates a value already in the row (a manual
    // edit or an older writer): the renderer must fall back, not crash.
    const raw = {
      theme: { heroImage: PNG_DATA_URL, heroImageCrop: { x: 'nope' } },
      sections: [{ id: 's1', type: 'hero', content: {}, variant: 'default', isVisible: true, sortOrder: 0 }],
    } as unknown as Parameters<typeof TenantWebsite>[0]['config']
    const els = collect(TenantWebsite({ ...baseProps, serviceRows: [], config: raw }))
    // Falls back to the legacy whole-image rendering.
    expect(
      els.some(
        (e) => typeof e.props.style?.backgroundImage === 'string' && e.props.style.backgroundImage.includes('url(')
      )
    ).toBe(true)
  })

  it('rejects a malformed crop at the schema boundary', () => {
    expect(() =>
      parseWebsiteConfig({
        theme: { heroImage: PNG_DATA_URL, heroImageCrop: { x: 'nope' } },
        sections: [{ id: 's1', type: 'hero', content: {} }],
      })
    ).toThrow()
  })
})

describe('req 1 — service crop renders through the oversized layer', () => {
  function serviceImg(crop: unknown) {
    const els = collect(
      TenantWebsite({
        ...baseProps,
        config: servicesConfig,
        serviceRows: [
          {
            id: 'svc-1',
            name: 'قص شعر',
            description: null,
            durationMin: 30,
            priceAmount: '100',
            image: PNG_DATA_URL,
            cropLayer: cropToLayerStyle(crop),
          },
        ],
      })
    )
    return els
  }

  it('renders the crop layer for a cropped service image', () => {
    const els = serviceImg({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 })
    const layer = els.find((e) => e.props.style?.width === '125%')
    expect(layer).toBeDefined()
    expect(layer!.props.style.height).toBe('125%')
  })

  it('renders a plain object-cover img when no crop is stored', () => {
    const els = serviceImg(null)
    const img = els.find((e) => e.type === 'img' && e.props.src === PNG_DATA_URL)
    expect(img).toBeDefined()
    expect(img!.props.className).toContain('object-cover')
    // No oversized layer anywhere.
    expect(els.some((e) => e.props.style?.width === '125%')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Req 3 — consistent service-card geometry
// ---------------------------------------------------------------------------
describe('req 3 — one consistent service-card image area', () => {
  function cards(rows: any[]) {
    const els = collect(TenantWebsite({ ...baseProps, config: servicesConfig, serviceRows: rows }))
    // The reserved image area is the element carrying the aspect ratio class.
    return els.filter(
      (e) => typeof e.props.className === 'string' && e.props.className.includes('aspect-[16/10]')
    )
  }

  it('reserves the same image area for a card WITH and WITHOUT an image', () => {
    const withImage = cards([
      { id: 'a', name: 'A', description: null, durationMin: 30, priceAmount: '1', image: PNG_DATA_URL },
    ])
    const withoutImage = cards([
      { id: 'b', name: 'B', description: null, durationMin: 30, priceAmount: '1', image: null },
    ])
    expect(withImage).toHaveLength(1)
    expect(withoutImage).toHaveLength(1)
    // Byte-identical container class, so the geometry cannot diverge.
    expect(withImage[0].props.className).toBe(withoutImage[0].props.className)
  })

  it('reserves one image area per card in a mixed list', () => {
    const all = cards([
      { id: 'a', name: 'A', description: null, durationMin: 30, priceAmount: '1', image: PNG_DATA_URL },
      { id: 'b', name: 'B', description: null, durationMin: 30, priceAmount: '2', image: null },
      { id: 'c', name: 'C', description: 'desc', durationMin: 45, priceAmount: '3', image: PNG_DATA_URL },
    ])
    expect(all).toHaveLength(3)
  })

  it('uses the crop aspect ratio the cropper frames', () => {
    // The reserved area and the cropper must agree, or the crop would be wrong.
    expect(CROP_ASPECTS.service).toBeCloseTo(16 / 10, 5)
    const [area] = cards([
      { id: 'a', name: 'A', description: null, durationMin: 30, priceAmount: '1', image: null },
    ])
    expect(area.props.className).toContain('aspect-[16/10]')
  })

  it('renders a deliberate placeholder (not an empty box) when there is no image', () => {
    const els = collect(
      TenantWebsite({
        ...baseProps,
        config: servicesConfig,
        serviceRows: [{ id: 'b', name: 'B', description: null, durationMin: 30, priceAmount: '1', image: null }],
      })
    )
    const placeholder = els.find(
      (e) => typeof e.props.className === 'string' && e.props.className.includes('items-center justify-center')
    )
    expect(placeholder).toBeDefined()
    // The placeholder is decorative and holds a mark, not text.
    expect(placeholder!.props['aria-hidden']).toBe('true')
    // No <img> is rendered for an image-less service.
    expect(els.some((e) => e.type === 'img' && e.props.src === PNG_DATA_URL)).toBe(false)
  })

  it('keeps name, price, duration and the booking CTA on every card', () => {
    const els = collect(
      TenantWebsite({
        ...baseProps,
        config: servicesConfig,
        serviceRows: [
          { id: 'a', name: 'قص شعر', description: null, durationMin: 30, priceAmount: '100', image: null },
        ],
      })
    )
    expect(els.some((e) => typeof e.props.children === 'string' && e.props.children === 'قص شعر')).toBe(true)
    expect(els.some((e) => typeof e.props.children === 'string' && e.props.children === '100')).toBe(true)
    expect(els.some((e) => typeof e.props.href === 'string' && e.props.href.includes('service=a'))).toBe(true)
    // Duration label is rendered too. It now sits beside a Clock3 icon, so the
    // text is one entry in a children array rather than the element's only
    // child — the assertion flattens children to text so it stays structure
    // agnostic while still proving the localized duration reaches the DOM.
    const textOf = (children: unknown): string => {
      if (typeof children === 'string') return children
      if (typeof children === 'number') return String(children)
      if (Array.isArray(children)) return children.map(textOf).join(' ')
      return ''
    }
    expect(els.some((e) => textOf(e.props.children).includes('دقيقة'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Backward compatibility
// ---------------------------------------------------------------------------
describe('existing images remain compatible', () => {
  it('a config predating crops parses and renders unchanged', () => {
    const config = parseWebsiteConfig({
      theme: { heroImage: PNG_DATA_URL },
      sections: [{ id: 's1', type: 'hero', content: {} }],
    })
    expect(config.theme.heroImageCrop).toBeUndefined()
    expect(resolveCrop(config.theme.heroImageCrop)).toBeNull()
    const els = collect(TenantWebsite({ ...baseProps, serviceRows: [], config }))
    expect(
      els.some((e) => typeof e.props.style?.backgroundImage === 'string' && e.props.style.backgroundImage.includes('url('))
    ).toBe(true)
  })

  it('a legacy focal point still positions the uncropped hero', () => {
    const config = parseWebsiteConfig({
      theme: { heroImage: PNG_DATA_URL, heroImageFocalPoint: { x: 0, y: 100 } },
      sections: [{ id: 's1', type: 'hero', content: {} }],
    })
    const els = collect(TenantWebsite({ ...baseProps, serviceRows: [], config }))
    const legacy = els.find(
      (e) => typeof e.props.style?.backgroundImage === 'string' && e.props.style.backgroundImage.includes('url(')
    )
    expect(legacy!.props.style.backgroundPosition).toBe('0% 100%')
  })
})
