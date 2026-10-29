import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COUNTRY,
  countries,
  countryCodes,
  currencyName,
  currencyOptions,
  findCountry,
  isCountryCode,
  isSupportedTimezone,
  regionForCountry,
  supportedCurrencies,
  supportedTimezones,
} from '@/lib/regions'

describe('countries', () => {
  it('has unique, uppercase ISO codes', () => {
    expect(new Set(countryCodes).size).toBe(countries.length)
    for (const code of countryCodes) expect(code).toMatch(/^[A-Z]{2}$/)
  })

  it('defaults to Egypt', () => {
    expect(isCountryCode(DEFAULT_COUNTRY)).toBe(true)
    expect(findCountry(DEFAULT_COUNTRY)?.currency).toBe('EGP')
  })

  it('rejects unknown or malformed codes', () => {
    expect(isCountryCode('XX')).toBe(false)
    expect(isCountryCode('')).toBe(false)
    expect(isCountryCode(undefined)).toBe(false)
  })
})

describe('regions', () => {
  it('derives currency and timezone from the country', () => {
    expect(regionForCountry('SA')).toEqual({ currency: 'SAR', timezone: 'Asia/Riyadh' })
    expect(regionForCountry('AE')).toEqual({ currency: 'AED', timezone: 'Asia/Dubai' })
    expect(regionForCountry('GB')).toEqual({ currency: 'GBP', timezone: 'Europe/London' })
  })

  it('falls back to the default region for an unknown country', () => {
    expect(regionForCountry('ZZ')).toEqual({ currency: 'EGP', timezone: 'Africa/Cairo' })
    expect(regionForCountry(null)).toEqual({ currency: 'EGP', timezone: 'Africa/Cairo' })
  })
})

describe('currency and timezone lists', () => {
  it('only lists currencies every country uses', () => {
    for (const country of countries) {
      expect(country.currency).toMatch(/^[A-Z]{3}$/)
      expect(supportedCurrencies).toContain(country.currency)
      expect(currencyName(country.currency, 'en')).not.toBe(country.currency)
    }
  })

  it('has a label for every currency in both languages', () => {
    for (const option of currencyOptions) {
      expect(option.name.en.length).toBeGreaterThan(0)
      expect(option.name.ar.length).toBeGreaterThan(0)
    }
  })

  it('accepts every timezone it offers, and rejects nonsense', () => {
    for (const zone of supportedTimezones) {
      expect(isSupportedTimezone(zone)).toBe(true)
      // Every offered zone must be usable by the scheduling engine.
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: zone })).not.toThrow()
    }
    expect(isSupportedTimezone('Africa/Atlantis')).toBe(false)
    expect(isSupportedTimezone('')).toBe(false)
  })

  it('includes a UTC fallback', () => {
    expect(supportedTimezones).toContain('UTC')
  })
})
