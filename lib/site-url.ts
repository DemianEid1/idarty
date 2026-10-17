// ---------------------------------------------------------------------------
// Public origin resolution.
//
// Pure and side-effect free, so it is safe to import from a public Server
// Component. It deliberately does NOT import `lib/auth.ts`: that module
// instantiates `betterAuth()` at load time and throws in production when no URL
// is configured, which must never happen on a public tenant page.
//
// The environment precedence MIRRORS the project's existing trusted-origin
// convention in `lib/auth.ts#getBaseURL` (BETTER_AUTH_URL ->
// VERCEL_PROJECT_PRODUCTION_URL -> VERCEL_URL -> V0_RUNTIME_URL), with
// `NEXT_PUBLIC_APP_URL` first because that is the variable
// `lib/routes.ts#publicTenantUrl` already treats as the app's public origin.
//
// A request `Host` header is NEVER consulted: it is attacker-controlled.
// ---------------------------------------------------------------------------

/** Trusted env vars, in precedence order. */
export const TRUSTED_ORIGIN_ENV_VARS = [
  'NEXT_PUBLIC_APP_URL',
  'BETTER_AUTH_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_URL',
  'V0_RUNTIME_URL',
] as const

/**
 * Resolve the absolute public origin (e.g. `https://example.com`), or null when
 * no trusted origin is configured.
 *
 * Returns null rather than guessing, so callers can omit canonical/Open Graph
 * URLs entirely instead of emitting a wrong or relative one.
 */
export function resolvePublicOrigin(
  env: Record<string, string | undefined> = process.env
): string | null {
  for (const key of TRUSTED_ORIGIN_ENV_VARS) {
    const raw = env[key]
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim().replace(/\/+$/, '')
    if (!trimmed) continue
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    try {
      // Reject anything that is not a bare http(s) origin.
      const parsed = new URL(withProtocol)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue
      return parsed.origin
    } catch {
      continue
    }
  }
  return null
}

/**
 * Build an absolute URL for a locale-aware path.
 * Returns null when no trusted origin is configured, so no relative URL is ever
 * emitted into metadata (which requires absolute values).
 */
export function absoluteUrl(
  path: string,
  origin: string | null = resolvePublicOrigin()
): string | null {
  if (!origin) return null
  const normalized = path.startsWith('/') ? path : `/${path}`
  try {
    return new URL(normalized, origin).toString()
  } catch {
    return null
  }
}

/**
 * A URL that is safe to hand to a social crawler: an absolute http(s) URL only.
 *
 * Stored images in this project are base64 `data:` URLs (hero image, logo,
 * service images), which crawlers cannot fetch — those must be omitted rather
 * than emitted.
 */
export function resolvePublicImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^https?:\/\//i.test(trimmed)) return null
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : null
  } catch {
    return null
  }
}

/** Metadata description bound. Stored tenant configuration is never mutated. */
export const METADATA_DESCRIPTION_MAX = 160

/**
 * Trim a description for metadata output. Operates on a copy; the stored tenant
 * configuration is untouched. Prefers cutting on a word boundary.
 */
export function truncateForMetadata(text: string, max = METADATA_DESCRIPTION_MAX): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const slice = clean.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice
  return `${cut.trimEnd()}…`
}
