import type { WebsiteConfig, WebsiteThemeOverride } from '@/lib/website-config'
import { DEFAULT_SITE_BACKGROUND } from '@/lib/website-config'

// ---------------------------------------------------------------------------
// Booking page theme resolution
//
// The public booking page visually follows the tenant's published Website
// Builder theme. This module resolves the two user-controlled colors (primary
// and background) from the PUBLISHED configuration only — draft-only changes
// never affect public visitors.
//
// When published theme data is missing, old, incomplete, or contains
// malformed optional color values, this falls back to the existing safe
// default theme. The resolution mirrors tenant-website.tsx exactly so the two
// surfaces can never diverge.
// ---------------------------------------------------------------------------

/** The booking page's default primary color. Matches the Website Builder default. */
export const DEFAULT_BOOKING_PRIMARY = '#0F766E'

/** The booking page's default background. Matches DEFAULT_SITE_BACKGROUND. */
export const DEFAULT_BOOKING_BACKGROUND = DEFAULT_SITE_BACKGROUND

/** The booking page's default surface (card) color. */
export const DEFAULT_BOOKING_SURFACE = '#FFFFFF'

/** The booking page's default text color. */
export const DEFAULT_BOOKING_TEXT = '#172033'

/** The booking page's default muted text color. */
export const DEFAULT_BOOKING_TEXT_MUTED = '#647087'

/** The booking page's default border color. */
export const DEFAULT_BOOKING_BORDER = '#e1e5ed'

/** The booking page's default focus ring color. */
export const DEFAULT_BOOKING_FOCUS = '#0F766E'

/** The booking page's default error color. */
export const DEFAULT_BOOKING_ERROR = '#b91c1c'

/** The booking page's default error background. */
export const DEFAULT_BOOKING_ERROR_BG = '#fef2f2'

/** The booking page's default error border. */
export const DEFAULT_BOOKING_ERROR_BORDER = '#fecaca'

export interface BookingTheme {
  primary: string
  background: string
  surface: string
  text: string
  textMuted: string
  border: string
  focus: string
  error: string
  errorBg: string
  errorBorder: string
}

/**
 * Resolve the booking page theme from a published website configuration.
 *
 * Reads only `config.theme` — never the tenant-level theme or draft config.
 * When the config is null, has no theme, or the theme values are malformed,
 * returns the safe default theme. The resolution logic matches
 * `tenant-website.tsx` exactly: `primaryColor` for the primary, and
 * `resolveSiteBackground` for the background.
 */
export function resolveBookingTheme(config: WebsiteConfig | null): BookingTheme {
  const theme = config?.theme
  const primary = isValidHex(theme?.primaryColor)
    ? theme!.primaryColor!
    : DEFAULT_BOOKING_PRIMARY
  const background = resolveSiteBackgroundForBooking(theme)
  return {
    primary,
    background,
    surface: DEFAULT_BOOKING_SURFACE,
    text: DEFAULT_BOOKING_TEXT,
    textMuted: DEFAULT_BOOKING_TEXT_MUTED,
    border: DEFAULT_BOOKING_BORDER,
    focus: primary,
    error: DEFAULT_BOOKING_ERROR,
    errorBg: DEFAULT_BOOKING_ERROR_BG,
    errorBorder: DEFAULT_BOOKING_ERROR_BORDER,
  }
}

/** Convert a BookingTheme to CSS custom properties for inline style. */
export function bookingThemeVars(theme: BookingTheme): React.CSSProperties {
  return {
    '--booking-primary': theme.primary,
    '--booking-bg': theme.background,
    '--booking-surface': theme.surface,
    '--booking-text': theme.text,
    '--booking-text-muted': theme.textMuted,
    '--booking-border': theme.border,
    '--booking-focus': theme.focus,
    '--booking-error': theme.error,
    '--booking-error-bg': theme.errorBg,
    '--booking-error-border': theme.errorBorder,
  } as React.CSSProperties
}

function isValidHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
}

function resolveSiteBackgroundForBooking(
  theme: WebsiteThemeOverride | null | undefined
): string {
  const bg = theme?.backgroundColor ?? theme?.accentColor
  return isValidHex(bg) ? bg : DEFAULT_BOOKING_BACKGROUND
}