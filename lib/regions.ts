// Country → regional defaults for workspace onboarding.
//
// Only countries the product can represent are listed: every entry maps to a
// real ISO currency code and to an IANA timezone that the scheduling engine can
// use directly (`Intl.DateTimeFormat`). Adding a country here is enough for both
// onboarding and the workspace settings form to offer it.
//
// Framework-free and client-safe: no Node-only globals, so the onboarding form
// (client) and `createTenant` (server) share the exact same definitions.

export type LocalizedLabel = { ar: string; en: string }

export type CountryCode =
  | 'EG'
  | 'SA'
  | 'AE'
  | 'KW'
  | 'QA'
  | 'BH'
  | 'OM'
  | 'JO'
  | 'US'
  | 'GB'

export type Country = {
  code: CountryCode
  name: LocalizedLabel
  currency: string
  timezone: string
}

export const countries: readonly Country[] = [
  { code: 'EG', name: { ar: 'مصر', en: 'Egypt' }, currency: 'EGP', timezone: 'Africa/Cairo' },
  { code: 'SA', name: { ar: 'السعودية', en: 'Saudi Arabia' }, currency: 'SAR', timezone: 'Asia/Riyadh' },
  { code: 'AE', name: { ar: 'الإمارات', en: 'United Arab Emirates' }, currency: 'AED', timezone: 'Asia/Dubai' },
  { code: 'KW', name: { ar: 'الكويت', en: 'Kuwait' }, currency: 'KWD', timezone: 'Asia/Kuwait' },
  { code: 'QA', name: { ar: 'قطر', en: 'Qatar' }, currency: 'QAR', timezone: 'Asia/Qatar' },
  { code: 'BH', name: { ar: 'البحرين', en: 'Bahrain' }, currency: 'BHD', timezone: 'Asia/Bahrain' },
  { code: 'OM', name: { ar: 'عُمان', en: 'Oman' }, currency: 'OMR', timezone: 'Asia/Muscat' },
  { code: 'JO', name: { ar: 'الأردن', en: 'Jordan' }, currency: 'JOD', timezone: 'Asia/Amman' },
  { code: 'US', name: { ar: 'الولايات المتحدة', en: 'United States' }, currency: 'USD', timezone: 'America/New_York' },
  { code: 'GB', name: { ar: 'المملكة المتحدة', en: 'United Kingdom' }, currency: 'GBP', timezone: 'Europe/London' },
]

export const countryCodes = countries.map((country) => country.code) as readonly CountryCode[]

export const DEFAULT_COUNTRY: CountryCode = 'EG'

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === 'string' && countryCodes.includes(value as CountryCode)
}

export function findCountry(code: unknown) {
  return isCountryCode(code) ? countries.find((country) => country.code === code) ?? null : null
}

/** Currency + timezone implied by a country. Falls back to the default country. */
export function regionForCountry(code: unknown) {
  const country = findCountry(code) ?? (countries.find((c) => c.code === DEFAULT_COUNTRY) as Country)
  return { currency: country.currency, timezone: country.timezone }
}

export const currencyOptions: readonly { code: string; name: LocalizedLabel }[] = [
  { code: 'EGP', name: { ar: 'الجنيه المصري', en: 'Egyptian Pound' } },
  { code: 'SAR', name: { ar: 'الريال السعودي', en: 'Saudi Riyal' } },
  { code: 'AED', name: { ar: 'الدرهم الإماراتي', en: 'UAE Dirham' } },
  { code: 'KWD', name: { ar: 'الدينار الكويتي', en: 'Kuwaiti Dinar' } },
  { code: 'QAR', name: { ar: 'الريال القطري', en: 'Qatari Riyal' } },
  { code: 'BHD', name: { ar: 'الدينار البحريني', en: 'Bahraini Dinar' } },
  { code: 'OMR', name: { ar: 'الريال العُماني', en: 'Omani Rial' } },
  { code: 'JOD', name: { ar: 'الدينار الأردني', en: 'Jordanian Dinar' } },
  { code: 'USD', name: { ar: 'الدولار الأمريكي', en: 'US Dollar' } },
  { code: 'GBP', name: { ar: 'الجنيه الإسترليني', en: 'Pound Sterling' } },
]

export const supportedCurrencies = currencyOptions.map((option) => option.code)

/** Timezones offered for review: every country's zone plus UTC. */
export const supportedTimezones: readonly string[] = Array.from(
  new Set([...countries.map((country) => country.timezone), 'UTC'])
).sort()

export function isSupportedTimezone(value: unknown): value is string {
  return typeof value === 'string' && supportedTimezones.includes(value)
}

/** Currency labels, including any code that is not in the curated list. */
export function currencyName(code: string, locale: 'ar' | 'en') {
  const option = currencyOptions.find((item) => item.code === code)
  return option ? option.name[locale] : code
}
