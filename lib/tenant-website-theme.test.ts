import { describe, expect, it } from 'vitest'
import {
  createDefaultWebsiteConfig,
  safeParseWebsiteConfig,
  resolveSiteBackground,
  parseWebsiteConfig,
  type WebsiteConfig,
} from './website-config'
import { THEME_PRESETS, applyPreset } from './theme-presets'

/**
 * The renderer (components/tenant-website.tsx) resolves the website theme from
 * `config.theme` with the tenant theme as a fallback. It is a React Server
 * Component, so it cannot be rendered in this node-environment suite (no jsdom).
 *
 * These tests pin the exact resolution rules the renderer uses, so a regression
 * in the theme pipeline is caught here. They intentionally mirror the small
 * block of logic in the renderer rather than duplicating its markup.
 */

type TenantTheme = Record<string, string> | null

/** Mirrors the renderer's theme resolution + site CSS variable construction. */
function resolveSiteThemeVars(config: WebsiteConfig | null, tenantTheme: TenantTheme) {
  const baseTheme = tenantTheme ?? {}
  const override = config?.theme
  const primaryColor = override?.primaryColor ?? baseTheme.primaryColor ?? '#0F766E'
  const backgroundColor = resolveSiteBackground(override, baseTheme)
  return {
    '--site-primary': primaryColor,
    '--site-bg': backgroundColor,
    backgroundColor,
  }
}

describe('theme preset rendering', () => {
  it('a preset changes the rendered site CSS variables', () => {
    const preset = THEME_PRESETS.find((p) => p.id === 'salon')!
    const vars = resolveSiteThemeVars(applyPreset(createDefaultWebsiteConfig(), 'salon'), null)

    expect(vars['--site-primary']).toBe(preset.theme.primaryColor)
    expect(vars['--site-bg']).toBe(preset.theme.backgroundColor)
  })

  it('every preset produces distinct rendered variables', () => {
    const rendered = THEME_PRESETS.map((p) =>
      resolveSiteThemeVars(applyPreset(createDefaultWebsiteConfig(), p.id), null)['--site-primary']
    )
    expect(new Set(rendered).size).toBe(rendered.length)
  })

  it('falls back to the historical defaults when no theme is configured', () => {
    // Tenants that never saved a config must render exactly as before.
    const vars = resolveSiteThemeVars(null, null)
    expect(vars['--site-primary']).toBe('#0F766E')
    expect(vars['--site-bg']).toBe('#FBFCFE')
    expect(vars).not.toHaveProperty('--site-surface')
    expect(vars.backgroundColor).toBe('#FBFCFE')
  })

  it('config theme overrides the tenant theme', () => {
    const vars = resolveSiteThemeVars(
      applyPreset(createDefaultWebsiteConfig(), 'gym'),
      { primaryColor: '#000000' }
    )
    expect(vars['--site-primary']).toBe('#EA580C')
  })

  it('tenant theme is used when the config has no theme override', () => {
    const vars = resolveSiteThemeVars(
      parseWebsiteConfig({ theme: {}, sections: [] }),
      { primaryColor: '#123456' }
    )
    expect(vars['--site-primary']).toBe('#123456')
  })

  it('the website background is applied to the main canvas', () => {
    // Regression guard: the background is now the main page canvas, not a small
    // decorative element.
    const vars = resolveSiteThemeVars(applyPreset(createDefaultWebsiteConfig(), 'clinic'), null)
    expect(vars['--site-bg']).toBe('#F7FAFF')
    expect(vars.backgroundColor).toBe('#F7FAFF')
  })

  it('a saved preset survives a round trip through the schema', () => {
    const themed = applyPreset(createDefaultWebsiteConfig(), 'studio')
    const reparsed = safeParseWebsiteConfig(JSON.parse(JSON.stringify(themed)))
    expect(reparsed).not.toBeNull()
    expect(reparsed!.theme.primaryColor).toBe('#7C3AED')
    expect(reparsed!.theme.backgroundColor).toBe('#FAF8FF')
  })

  it('older configurations without surface colors remain readable', () => {
    const legacy = safeParseWebsiteConfig({
      theme: { primaryColor: '#0F766E', logo: 'data:image/png;base64,AA' },
      sections: [{ id: 's1', type: 'hero', content: { ar: {}, en: {} } }],
    })
    expect(legacy).not.toBeNull()
    const vars = resolveSiteThemeVars(legacy, null)
    expect(vars['--site-primary']).toBe('#0F766E')
    expect(vars['--site-bg']).toBe('#FBFCFE')
    expect(vars.backgroundColor).toBe('#FBFCFE')
  })
})
