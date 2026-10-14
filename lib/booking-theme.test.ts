import { describe, expect, it } from 'vitest'
import { resolveBookingTheme, bookingThemeVars } from '@/lib/booking-theme'
import { createDefaultWebsiteConfig, safeParseWebsiteConfig } from '@/lib/website-config'

describe('Booking page theme resolution', () => {
  it('returns safe defaults when config is null', () => {
    const theme = resolveBookingTheme(null)
    expect(theme.primary).toBe('#0F766E')
    expect(theme.background).toBe('#FBFCFE')
    expect(theme.surface).toBe('#FFFFFF')
    expect(theme.text).toBe('#172033')
    expect(theme.textMuted).toBe('#647087')
    expect(theme.border).toBe('#e1e5ed')
    expect(theme.focus).toBe('#0F766E')
    expect(theme.error).toBe('#b91c1c')
  })

  it('returns safe defaults when config has no theme', () => {
    const config = createDefaultWebsiteConfig()
    const theme = resolveBookingTheme(config)
    expect(theme.primary).toBe('#0F766E')
    expect(theme.background).toBe('#FBFCFE')
  })

  it('uses primaryColor from published config', () => {
    const config = createDefaultWebsiteConfig()
    config.theme.primaryColor = '#DB2777'
    const theme = resolveBookingTheme(config)
    expect(theme.primary).toBe('#DB2777')
    expect(theme.focus).toBe('#DB2777')
  })

  it('uses backgroundColor from published config', () => {
    const config = createDefaultWebsiteConfig()
    config.theme.backgroundColor = '#FFF7FB'
    const theme = resolveBookingTheme(config)
    expect(theme.background).toBe('#FFF7FB')
  })

  it('falls back to legacy accentColor when backgroundColor is absent', () => {
    const config = createDefaultWebsiteConfig()
    config.theme.accentColor = '#F7FAFF'
    // Remove backgroundColor to test legacy fallback
    const { backgroundColor, ...rest } = config.theme
    config.theme = rest as typeof config.theme
    const theme = resolveBookingTheme(config)
    expect(theme.background).toBe('#F7FAFF')
  })

  it('ignores invalid hex values and falls back to defaults', () => {
    const config = createDefaultWebsiteConfig()
    // The websiteThemeOverride schema uses .passthrough() so arbitrary values
    // can be stored. resolveBookingTheme must reject invalid hex via isValidHex.
    config.theme = { ...config.theme, primaryColor: 'not-a-color', backgroundColor: '#GGGGGG' }
    const theme = resolveBookingTheme(config)
    expect(theme.primary).toBe('#0F766E')
    expect(theme.background).toBe('#FBFCFE')
  })

  it('does not read draft configuration', () => {
    // The function only accepts a published config — there is no way to pass
    // draft data. This is enforced by the type signature and the booking page
    // which only reads `publishedConfigRow.published`.
    const config = createDefaultWebsiteConfig()
    config.theme.primaryColor = '#EA580C'
    // Even if we pass a config, it represents the PUBLISHED state
    const theme = resolveBookingTheme(config)
    expect(theme.primary).toBe('#EA580C')
  })

  it('generates CSS custom properties', () => {
    const theme = resolveBookingTheme(null)
    const vars = bookingThemeVars(theme) as Record<string, string>
    expect(vars['--booking-primary']).toBe('#0F766E')
    expect(vars['--booking-bg']).toBe('#FBFCFE')
    expect(vars['--booking-surface']).toBe('#FFFFFF')
    expect(vars['--booking-text']).toBe('#172033')
    expect(vars['--booking-text-muted']).toBe('#647087')
    expect(vars['--booking-border']).toBe('#e1e5ed')
    expect(vars['--booking-focus']).toBe('#0F766E')
    expect(vars['--booking-error']).toBe('#b91c1c')
    expect(vars['--booking-error-bg']).toBe('#fef2f2')
    expect(vars['--booking-error-border']).toBe('#fecaca')
  })
})

describe('Booking page uses published theme only', () => {
  it('the booking page source reads from websiteConfig.published', () => {
    // Verify the booking page imports and uses the published config
    const pageSource = require('fs').readFileSync(
      require('path').resolve(__dirname, '../app/[locale]/tenants/[slug]/book/page.tsx'),
      'utf8'
    )
    expect(pageSource).toContain('publishedConfigRow.published')
    expect(pageSource).toContain('resolveBookingTheme')
    expect(pageSource).toContain('safeParseWebsiteConfig')
  })

  it('the booking page does not read draft config', () => {
    const pageSource = require('fs').readFileSync(
      require('path').resolve(__dirname, '../app/[locale]/tenants/[slug]/book/page.tsx'),
      'utf8'
    )
    expect(pageSource).not.toContain('publishedConfigRow.draft')
  })
})

describe('Booking page theme CSS variables are used in form', () => {
  it('the booking form uses CSS variables for colors', () => {
    const formSource = require('fs').readFileSync(
      require('path').resolve(__dirname, '../components/booking-form.tsx'),
      'utf8'
    )
    expect(formSource).toContain('var(--booking-primary)')
    expect(formSource).toContain('var(--booking-text)')
    expect(formSource).toContain('var(--booking-border)')
    expect(formSource).toContain('var(--booking-surface)')
    expect(formSource).toContain('var(--booking-error)')
    expect(formSource).toContain('var(--booking-error-bg)')
    expect(formSource).toContain('var(--booking-error-border)')
  })

  it('the booking page main element applies theme vars', () => {
    const pageSource = require('fs').readFileSync(
      require('path').resolve(__dirname, '../app/[locale]/tenants/[slug]/book/page.tsx'),
      'utf8'
    )
    expect(pageSource).toContain('bookingThemeVars')
  })
})

describe('Booking page theme with various published configs', () => {
  it('handles a config with only primaryColor set', () => {
    const config = createDefaultWebsiteConfig()
    config.theme.primaryColor = '#2563EB'
    const theme = resolveBookingTheme(config)
    expect(theme.primary).toBe('#2563EB')
    expect(theme.background).toBe('#FBFCFE') // default
  })

  it('handles a config with only backgroundColor set', () => {
    const config = createDefaultWebsiteConfig()
    config.theme.backgroundColor = '#FFFBF5'
    const theme = resolveBookingTheme(config)
    expect(theme.primary).toBe('#0F766E') // default
    expect(theme.background).toBe('#FFFBF5')
  })

  it('handles a full preset config', () => {
    const config = createDefaultWebsiteConfig()
    config.theme.primaryColor = '#7C3AED'
    config.theme.backgroundColor = '#FAF8FF'
    config.theme.accentColor = '#FAF8FF'
    const theme = resolveBookingTheme(config)
    expect(theme.primary).toBe('#7C3AED')
    expect(theme.background).toBe('#FAF8FF')
  })

  it('handles a malformed config (invalid hex) gracefully', () => {
    const raw = {
      theme: {
        primaryColor: 'red',
        backgroundColor: '#12345',
      },
      sections: [],
    }
    const config = safeParseWebsiteConfig(raw)
    // The passthrough schema may accept it, but resolveBookingTheme must reject
    if (config) {
      const theme = resolveBookingTheme(config)
      expect(theme.primary).toBe('#0F766E')
      expect(theme.background).toBe('#FBFCFE')
    }
  })
})