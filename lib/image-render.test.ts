import { describe, expect, it } from 'vitest'
import { TenantWebsite } from '@/components/tenant-website'
import { parseWebsiteConfig } from './website-config'

/**
 * Phase 3.4 render verification against the REAL shared renderer.
 *
 * `TenantWebsite` is a synchronous function component, so calling it directly
 * returns a React element tree we can walk. These assert the hero background
 * image and service card images actually reach the rendered output, and that
 * the text-only defaults still render when no image is configured.
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

/** Collect every element in the tree with its props. */
function collectElements(node: unknown, depth = 0): Array<{ type: unknown; props: any }> {
  const out: Array<{ type: unknown; props: any }> = []
  if (depth > 20 || node === null || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    node.forEach((child) => out.push(...collectElements(child, depth + 1)))
    return out
  }
  const el = node as { type?: unknown; props?: any }
  if (el.props) {
    out.push({ type: el.type, props: el.props })
    out.push(...collectElements(el.props.children, depth + 1))
  }
  return out
}

describe('TenantWebsite hero image rendering (real component)', () => {
  it('renders the hero image as a background image when configured', () => {
    const config = parseWebsiteConfig({
      theme: { heroImage: PNG_DATA_URL },
      sections: [{ id: 's1', type: 'hero', content: {} }],
    })
    const el = TenantWebsite({ ...baseProps, serviceRows: [], config })
    const els = collectElements(el)
    const withBg = els.find(
      (e) => typeof e.props.style?.backgroundImage === 'string' && e.props.style.backgroundImage.includes(PNG_DATA_URL)
    )
    expect(withBg).toBeDefined()
    expect(withBg!.props.style.backgroundSize).toBe('cover')
  })

  it('does not set a background image when no hero image is configured', () => {
    const config = parseWebsiteConfig({
      theme: {},
      sections: [{ id: 's1', type: 'hero', content: {} }],
    })
    const el = TenantWebsite({ ...baseProps, serviceRows: [], config })
    const els = collectElements(el)
    const withBg = els.find(
      (e) => typeof e.props.style?.backgroundImage === 'string' && e.props.style.backgroundImage.includes('url(')
    )
    expect(withBg).toBeUndefined()
  })

  it('still renders the hero text alongside a hero image', () => {
    const config = parseWebsiteConfig({
      theme: { heroImage: PNG_DATA_URL },
      sections: [{ id: 's1', type: 'hero', content: { ar: { headline: 'عنوان مخصص' } } }],
    })
    const el = TenantWebsite({ ...baseProps, serviceRows: [], config })
    const els = collectElements(el)
    const heading = els.find(
      (e) => typeof e.props.children === 'string' && e.props.children === 'عنوان مخصص'
    )
    expect(heading).toBeDefined()
  })

  it('leaves the site background variable untouched by the hero image', () => {
    const config = parseWebsiteConfig({
      theme: { heroImage: PNG_DATA_URL },
      sections: [{ id: 's1', type: 'hero', content: {} }],
    })
    const el = TenantWebsite({ ...baseProps, serviceRows: [], config }) as React.ReactElement<{
      style: Record<string, string>
    }>
    expect(el.props.style['--site-bg']).toBe('#FBFCFE')
  })

  it('keeps the no-image hero free of image chrome', () => {
    // Regression guard: with no hero image the section must carry no
    // `relative`/`overflow-hidden` and no image layers, so a text-only hero
    // renders exactly as it did before image support existed.
    const config = parseWebsiteConfig({
      theme: {},
      sections: [{ id: 's1', type: 'hero', content: {} }],
    })
    const el = TenantWebsite({ ...baseProps, serviceRows: [], config })
    const els = collectElements(el)
    const heroSection = els.find(
      (e) => e.type === 'section' && typeof e.props.className === 'string' && e.props.className.includes('w-full')
    )
    expect(heroSection).toBeDefined()
    expect(heroSection!.props.className).not.toContain('relative')
    expect(heroSection!.props.className).not.toContain('overflow-hidden')
    // No image layer and no overlay.
    expect(els.some((e) => e.props.style?.backgroundImage)).toBe(false)
    expect(els.some((e) => typeof e.props.className === 'string' && e.props.className.includes('bg-gradient-to-t'))).toBe(false)
  })
})

describe('TenantWebsite service image rendering (real component)', () => {
  const serviceConfig = parseWebsiteConfig({
    theme: {},
    sections: [{ id: 's1', type: 'services', content: {} }],
  })

  it('renders an <img> for a service that has an image', () => {
    const el = TenantWebsite({
      ...baseProps,
      config: serviceConfig,
      serviceRows: [
        { id: 'svc-1', name: 'قص شعر', description: null, durationMin: 30, priceAmount: '100', image: PNG_DATA_URL },
      ],
    })
    const els = collectElements(el)
    const img = els.find((e) => e.type === 'img' && e.props.src === PNG_DATA_URL)
    expect(img).toBeDefined()
    expect(img!.props.className).toContain('object-cover')
  })

  it('renders no <img> for a service without an image (optional)', () => {
    const el = TenantWebsite({
      ...baseProps,
      config: serviceConfig,
      serviceRows: [
        { id: 'svc-1', name: 'قص شعر', description: null, durationMin: 30, priceAmount: '100', image: null },
      ],
    })
    const els = collectElements(el)
    const img = els.find((e) => e.type === 'img' && typeof e.props.src === 'string' && e.props.src.startsWith('data:'))
    expect(img).toBeUndefined()
  })

  it('still renders service name, price, duration and booking action', () => {
    const el = TenantWebsite({
      ...baseProps,
      config: serviceConfig,
      serviceRows: [
        { id: 'svc-1', name: 'قص شعر', description: 'وصف', durationMin: 30, priceAmount: '100', image: PNG_DATA_URL },
      ],
    })
    const els = collectElements(el)
    expect(els.some((e) => typeof e.props.children === 'string' && e.props.children === 'قص شعر')).toBe(true)
    expect(els.some((e) => typeof e.props.children === 'string' && e.props.children === '100')).toBe(true)
    // The booking link for this service is preserved.
    expect(els.some((e) => typeof e.props.href === 'string' && e.props.href.includes('service=svc-1'))).toBe(true)
  })
})
