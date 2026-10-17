import { describe, expect, it } from 'vitest'
import { TenantWebsite } from '@/components/tenant-website'
import { createDefaultWebsiteConfig, parseWebsiteConfig } from './website-config'
import { THEME_PRESETS, applyPreset } from './theme-presets'

/**
 * End-to-end theme verification against the REAL shared renderer.
 *
 * `TenantWebsite` is a synchronous function component, so calling it directly
 * returns a React element tree we can inspect — this exercises the actual
 * component code (not a re-implementation), proving that a preset's colors
 * reach the rendered `style` properties.
 */

const baseProps = {
  locale: 'ar' as const,
  slug: 'demo-salon',
  tenant: { currency: 'EGP', email: null, phoneE164: null, theme: null },
  translation: { name: 'صالون', tagline: null, description: null, address: null },
  serviceRows: [],
  hoursRows: [],
}

/** Pull the inline style object off the root <main> element. */
function mainStyle(config: Parameters<typeof TenantWebsite>[0]['config']) {
  const el = TenantWebsite({ ...baseProps, config }) as React.ReactElement<{
    style: Record<string, string>
  }>
  return el.props.style
}

describe('TenantWebsite theme rendering (real component)', () => {
  it('applies every preset color to the rendered CSS variables', () => {
    for (const preset of THEME_PRESETS) {
      const style = mainStyle(applyPreset(createDefaultWebsiteConfig(), preset.id))
      expect(style['--site-primary']).toBe(preset.theme.primaryColor)
      expect(style['--site-bg']).toBe(preset.theme.backgroundColor)
      expect(style).not.toHaveProperty('--site-surface')
      expect(style.backgroundColor).toBe(preset.theme.backgroundColor)
    }
  })

  it('uses the historical defaults when no theme is configured (backward compatible)', () => {
    const style = mainStyle(null)
    expect(style['--site-primary']).toBe('#0F766E')
    expect(style['--site-bg']).toBe('#FBFCFE')
    expect(style).not.toHaveProperty('--site-surface')
    expect(style.backgroundColor).toBe('#FBFCFE')
  })

  it('prefers the config theme over the tenant theme', () => {
    const el = TenantWebsite({
      ...baseProps,
      tenant: { ...baseProps.tenant, theme: { primaryColor: '#000000' } },
      config: applyPreset(createDefaultWebsiteConfig(), 'gym'),
    }) as React.ReactElement<{ style: Record<string, string> }>
    expect(el.props.style['--site-primary']).toBe('#EA580C')
  })

  it('falls back to the tenant theme when the config has no theme', () => {
    const el = TenantWebsite({
      ...baseProps,
      tenant: { ...baseProps.tenant, theme: { primaryColor: '#123456' } },
      config: parseWebsiteConfig({ theme: {}, sections: [] }),
    }) as React.ReactElement<{ style: Record<string, string> }>
    expect(el.props.style['--site-primary']).toBe('#123456')
  })

  it('renders the tagline chip without the removed accent token', () => {
    const el = TenantWebsite({
      ...baseProps,
      config: applyPreset(createDefaultWebsiteConfig(), 'clinic'),
    })
    // Walk the element tree and collect every inline style object.
    const styles: Record<string, unknown>[] = []
    const walk = (node: unknown, depth = 0) => {
      if (depth > 12 || node === null || typeof node !== 'object') return
      if (Array.isArray(node)) {
        node.forEach((child) => walk(child, depth + 1))
        return
      }
      const props = (node as { props?: { style?: unknown; children?: unknown } }).props
      if (props && typeof props.style === 'object' && props.style !== null) {
        styles.push(props.style as Record<string, unknown>)
      }
      if (props) walk(props.children, depth + 1)
    }
    walk(el)
    // The chip now uses the primary color; no element consumes --site-accent.
    expect(styles.some((s) => Object.values(s).includes('var(--site-accent)'))).toBe(false)
    expect(styles.some((s) => s.borderColor === 'var(--site-primary)')).toBe(true)
  })

  it('leaves the legacy --primary/--accent tokens untouched', () => {
    // The website renderer must not clobber the application-level tokens.
    const style = mainStyle(applyPreset(createDefaultWebsiteConfig(), 'salon'))
    expect(style).not.toHaveProperty('--primary')
    expect(style).not.toHaveProperty('--accent')
  })
})
