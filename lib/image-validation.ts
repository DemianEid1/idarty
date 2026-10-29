// ---------------------------------------------------------------------------
// Image upload validation (framework-free, no Node-only globals).
//
// This module is imported by BOTH server code (server actions, the website
// configuration Zod schema) and client components (the Website Editor), so it
// must not depend on `Buffer` or any other Node-only global. Base64 payloads are
// decoded with `atob`, which exists in browsers and in Node 16.5+.
//
// It is deliberately NOT inside a `'use server'` module: Next.js requires every
// export of a `'use server'` file to be an async function, so a synchronous pure
// validator cannot live there.
// ---------------------------------------------------------------------------

/** Maximum decoded size for a hero background image. */
export const MAX_HERO_IMAGE_SIZE = 2 * 1024 * 1024 // 2MB

/** Maximum decoded size for a service card image. */
export const MAX_SERVICE_IMAGE_SIZE = 500 * 1024 // 500KB

/**
 * Maximum decoded size for the workspace logo collected during onboarding.
 * This is the limit the onboarding UI advertises, so it is enforced server-side
 * as well — the logo is stored inline in the tenant `theme` JSON.
 */
export const MAX_LOGO_IMAGE_SIZE = 1024 * 1024 // 1MB

/** Raw data-URL string bound for the workspace logo (base64 inflation + prefix). */
export const MAX_LOGO_IMAGE_DATA_URL_LENGTH = Math.ceil(MAX_LOGO_IMAGE_SIZE * (4 / 3)) + 64

/**
 * Upper bound on the raw data-URL STRING length.
 *
 * Base64 inflates a payload by 4/3, plus the `data:image/…;base64,` prefix. The
 * bound is applied in the website-config Zod schema so an oversized payload is
 * rejected before any decoding work happens.
 */
export const MAX_HERO_IMAGE_DATA_URL_LENGTH = Math.ceil(MAX_HERO_IMAGE_SIZE * (4 / 3)) + 64

/** Raster formats explicitly supported for uploads. */
export const SUPPORTED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type ImageValidationResult = { ok: true } | { ok: false; error: string }

/** Decode a base64 string to a byte array, or null when it is not valid base64. */
function decodeBase64ToBytes(base64: string): Uint8Array | null {
  // Reject anything outside the base64 alphabet up front — `atob` is lenient in
  // some engines and would otherwise silently drop invalid characters.
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return null
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

/**
 * Validate a base64 data URL image.
 *
 * The client-supplied MIME type and filename extension are never trusted on
 * their own: the base64 payload is decoded and its leading magic bytes are
 * checked against the type declared in the data URL, so a renamed file (e.g. a
 * GIF labelled `image/png`) is rejected.
 */
export function validateImageBase64(dataUrl: string, maxBytes: number): ImageValidationResult {
  // Only explicitly supported raster types, and only as an embedded data URL —
  // an arbitrary external URL is never accepted as a substitute for an upload.
  const match = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]*={0,2})$/)
  if (!match) {
    return {
      ok: false,
      error: 'Invalid image format. Must be a data URL with image/jpeg, image/png, or image/webp.',
    }
  }

  const [, mimeType, base64Data] = match

  const decoded = decodeBase64ToBytes(base64Data)
  if (!decoded || decoded.length === 0) {
    return { ok: false, error: 'Invalid or empty image payload.' }
  }

  // Check size before inspecting content so an oversized payload is rejected cheaply.
  if (decoded.length > maxBytes) {
    return { ok: false, error: `Image size exceeds ${Math.round(maxBytes / 1024)}KB limit.` }
  }

  // Verify magic bytes against the declared type.
  if (mimeType === 'jpeg') {
    if (decoded.length < 3 || decoded[0] !== 0xff || decoded[1] !== 0xd8 || decoded[2] !== 0xff) {
      return { ok: false, error: 'Invalid JPEG image.' }
    }
  } else if (mimeType === 'png') {
    if (
      decoded.length < 8 ||
      decoded[0] !== 0x89 ||
      decoded[1] !== 0x50 ||
      decoded[2] !== 0x4e ||
      decoded[3] !== 0x47 ||
      decoded[4] !== 0x0d ||
      decoded[5] !== 0x0a ||
      decoded[6] !== 0x1a ||
      decoded[7] !== 0x0a
    ) {
      return { ok: false, error: 'Invalid PNG image.' }
    }
  } else if (mimeType === 'webp') {
    if (
      decoded.length < 12 ||
      decoded[0] !== 0x52 ||
      decoded[1] !== 0x49 ||
      decoded[2] !== 0x46 ||
      decoded[3] !== 0x46
    ) {
      return { ok: false, error: 'Invalid WebP image.' }
    }
    // Check the WEBP marker at bytes 8-11.
    if (
      decoded[8] !== 0x57 ||
      decoded[9] !== 0x45 ||
      decoded[10] !== 0x42 ||
      decoded[11] !== 0x50
    ) {
      return { ok: false, error: 'Invalid WebP image.' }
    }
  }

  return { ok: true }
}

/**
 * Whether a string is a structurally valid hero image data URL within the
 * documented size bound. Used by the website-config Zod schema so the server
 * enforces the same rules the upload UI does.
 */
export function isValidHeroImageDataUrl(value: string): boolean {
  if (value.length > MAX_HERO_IMAGE_DATA_URL_LENGTH) return false
  return validateImageBase64(value, MAX_HERO_IMAGE_SIZE).ok
}
