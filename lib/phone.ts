import { z } from 'zod'

// Shared phone rule for tenant/branch contact numbers.
//
// Accepts either a local Egyptian mobile number (01xxxxxxxxx) or an
// international number in +E.164 form. The empty string is normalised to
// `undefined` so callers can store NULL for "not provided".
export const e164Phone = z
  .string()
  .trim()
  .max(30)
  .transform((value) => {
    if (!value) return value
    const cleaned = value.replace(/[\s-]/g, '')
    if (/^01[0125]\d{8}$/.test(cleaned)) {
      return '+2' + cleaned
    }
    return cleaned
  })
  .refine((value) => value === '' || /^\+[1-9]\d{6,14}$/.test(value), {
    message: 'Phone must be a valid local number or international format (+...)',
  })
  .transform((value) => value || undefined)
