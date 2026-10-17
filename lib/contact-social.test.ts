import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  CONTACT_TEXT_PAYLOAD_MAX,
  CONTACT_PRACTICAL_LIMITS,
  E164_PATTERN,
  EMAIL_PATTERN,
  SOCIAL_PLATFORMS,
  createDefaultContact,
  createDefaultSocial,
  createDefaultCta,
  createDefaultMobileStickyCta,
  contactSchemaRead,
  socialSchemaRead,
  hasVisibleContactData,
  isHttpUrl,
  toTelHref,
  toWhatsAppHref,
  toMailto,
  resolveCtaTarget,
  resolveCtaLabel,
  resolveVisibleSocialLinks,
  collectContactSocialIssues,
  collectPublishIssues,
  type ContactConfig,
  type SocialConfig,
  type CtaConfig,
} from './contact-social'
import {
  parseWebsiteConfig,
  safeParseWebsiteConfig,
  createDefaultWebsiteConfig,
  resolveOrderedSectionTypes,
  validateWebsiteConfigForWrite,
} from './website-config'

// ---------------------------------------------------------------------------
// Contact & Social: validation, render guards, and read/write separation.
// ---------------------------------------------------------------------------

const field = (value: string, isVisible = true) => ({ value, isVisible })
const emptyField = () => ({ value: '', isVisible: false })

function contactWith(patch: Partial<ContactConfig>): ContactConfig {
  return { ...createDefaultContact(), ...patch }
}

// ===========================================================================
// 1. Empty-string handling
// ===========================================================================
describe('empty-string handling', () => {
  it('treats "", whitespace, null and missing as an empty value', () => {
    const parsed = contactSchemaRead.parse({
      phone: { value: '', isVisible: false },
      whatsapp: { value: '   ', isVisible: false },
      email: { value: null, isVisible: false },
      address: { isVisible: false },
      googleMapsUrl: { value: '', isVisible: false },
    })
    expect(parsed.phone.value).toBe('')
    expect(parsed.whatsapp.value).toBe('')
    expect(parsed.email.value).toBe('')
    expect(parsed.address.value).toBe('')
    expect(parsed.googleMapsUrl.value).toBe('')
  })

  it('accepts an empty string for an optional email without rejecting it', () => {
    // The trap this guards: z.string().email().optional().default('') THROWS on
    // an explicit ''. Blank input must be tolerated, not rejected.
    const parsed = contactSchemaRead.parse({ email: { value: '', isVisible: false } })
    expect(parsed.email.value).toBe('')
  })

  it('retains a bounded value verbatim on read', () => {
    const long = 'x'.repeat(3000)
    const parsed = contactSchemaRead.parse({ address: { value: long, isVisible: true } })
    expect(parsed.address.value).toHaveLength(3000)
  })
})

// ===========================================================================
// 2. Leaf-level catch granularity (sibling preservation)
// ===========================================================================
describe('leaf-level recovery preserves siblings', () => {
  it('an invalid maps value does NOT erase a valid phone or email', () => {
    const parsed = contactSchemaRead.parse({
      phone: { value: '+201000000000', isVisible: true },
      email: { value: 'a@b.com', isVisible: true },
      googleMapsUrl: { value: 42, isVisible: true }, // wrong type
    })
    expect(parsed.phone.value).toBe('+201000000000')
    expect(parsed.email.value).toBe('a@b.com')
    expect(parsed.googleMapsUrl.value).toBe('')
  })

  it('a null leaf does NOT erase valid siblings', () => {
    const parsed = contactSchemaRead.parse({
      phone: { value: '+201000000000', isVisible: true },
      email: null,
    })
    expect(parsed.phone.value).toBe('+201000000000')
    expect(parsed.email.value).toBe('')
  })

  it('an invalid Instagram URL does NOT erase a valid Facebook URL', () => {
    const parsed = socialSchemaRead.parse({
      instagram: { url: 42, isEnabled: true },
      facebook: { url: 'https://fb.com/x', isEnabled: true },
    })
    expect(parsed.instagram.url).toBe('')
    expect(parsed.facebook.url).toBe('https://fb.com/x')
    expect(parsed.facebook.isEnabled).toBe(true)
  })

  it('a null platform does NOT erase valid siblings', () => {
    const parsed = socialSchemaRead.parse({
      instagram: null,
      facebook: { url: 'https://fb.com/x', isEnabled: true },
    })
    expect(parsed.facebook.url).toBe('https://fb.com/x')
  })
})

// ===========================================================================
// 3. Unsafe-but-well-formed strings are stored, never linked
// ===========================================================================
describe('unsafe-but-bounded strings are retained but never rendered', () => {
  it('stores a javascript: URL verbatim (persistence is not the boundary)', () => {
    const parsed = contactSchemaRead.parse({
      googleMapsUrl: { value: 'javascript:alert(1)', isVisible: true },
    })
    expect(parsed.googleMapsUrl.value).toBe('javascript:alert(1)')
  })

  it('never returns that value as a usable Maps destination', () => {
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
  })

  it('drops it from the resolved social links', () => {
    const social = {
      ...createDefaultSocial(),
      instagram: { url: 'javascript:alert(1)', isEnabled: true },
      facebook: { url: 'https://fb.com/x', isEnabled: true },
    }
    const links = resolveVisibleSocialLinks(social)
    expect(links.map((l) => l.platform)).toEqual(['facebook'])
  })

  it('stores a local phone number verbatim', () => {
    const parsed = contactSchemaRead.parse({ phone: { value: '01012345678', isVisible: true } })
    expect(parsed.phone.value).toBe('01012345678')
  })
})

// ===========================================================================
// 4. URL protocol allowlist
// ===========================================================================
describe('isHttpUrl protocol allowlist', () => {
  it('accepts http and https', () => {
    expect(isHttpUrl('https://maps.app.goo.gl/x')).toBe(true)
    expect(isHttpUrl('http://example.com')).toBe(true)
  })

  it('rejects unsafe and non-web protocols', () => {
    // z.string().url() alone ACCEPTS all of these — the guard is required.
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x.com', 'tel:+201000000000']) {
      expect(isHttpUrl(bad), bad).toBe(false)
    }
  })

  it('rejects empty, whitespace and non-strings', () => {
    expect(isHttpUrl('')).toBe(false)
    expect(isHttpUrl('   ')).toBe(false)
    expect(isHttpUrl(null)).toBe(false)
    expect(isHttpUrl(42)).toBe(false)
  })

  it('confirms .url() alone would NOT have been sufficient', () => {
    const naive = z.string().url()
    expect(naive.safeParse('javascript:alert(1)').success).toBe(true)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
  })
})

// ===========================================================================
// 5. Phone / WhatsApp normalization (country code never inferred)
// ===========================================================================
describe('phone and WhatsApp normalization', () => {
  it('E164_PATTERN matches the database constraint', () => {
    // Source must stay identical to db/migrations/0001_init.sql.
    expect(E164_PATTERN.source).toBe('^\\+[1-9][0-9]{6,14}$')
  })

  it('accepts international numbers and strips only separators', () => {
    expect(toTelHref('+20 100 123 4567')).toBe('tel:+201001234567')
    expect(toTelHref('+1 202 555 0142')).toBe('tel:+12025550142')
    expect(toTelHref('+20-100-123-4567')).toBe('tel:+201001234567')
  })

  it('rejects Egyptian local numbers rather than guessing a country code', () => {
    expect(toTelHref('01012345678')).toBeNull()
    expect(toTelHref('0100 123 4567')).toBeNull()
  })

  it('rejects malformed, missing and non-string values', () => {
    for (const bad of ['201001234567', '++201001234567', '+0201001234567', '+201', '', 'abc']) {
      expect(toTelHref(bad), bad).toBeNull()
    }
    expect(toTelHref(null)).toBeNull()
  })

  it('applies the same rule to WhatsApp, producing a wa.me destination', () => {
    expect(toWhatsAppHref('+20 100 123 4567')).toBe('https://wa.me/201001234567')
    expect(toWhatsAppHref('01012345678')).toBeNull()
    expect(toWhatsAppHref('')).toBeNull()
  })
})

// ===========================================================================
// 6. Email helper
// ===========================================================================
describe('toMailto', () => {
  it('accepts a valid address', () => {
    expect(toMailto('a@b.com')).toBe('mailto:a@b.com')
  })

  it('rejects invalid addresses so they can never become a mailto link', () => {
    for (const bad of ['nope', 'x@y', 'a b@c.com', '', '   ', '@b.com', 'a@']) {
      expect(toMailto(bad), bad).toBeNull()
    }
    expect(toMailto(null)).toBeNull()
  })

  it('rejects an address beyond the practical length limit', () => {
    const long = `${'a'.repeat(CONTACT_PRACTICAL_LIMITS.email)}@b.com`
    expect(EMAIL_PATTERN.test(long)).toBe(true)
    expect(toMailto(long)).toBeNull()
  })
})

// ===========================================================================
// 7. CTA resolution — no silent fallback
// ===========================================================================
describe('CTA resolution', () => {
  const cta = (action: CtaConfig['action']): CtaConfig => ({ ...createDefaultCta(), action })

  it('booking always resolves, regardless of contact data', () => {
    expect(resolveCtaTarget(cta('booking'), createDefaultContact()).kind).toBe('booking')
  })

  it('call resolves only with a visible, valid phone', () => {
    const valid = contactWith({ phone: field('+201000000000') })
    expect(resolveCtaTarget(cta('call'), valid)).toEqual({ kind: 'href', href: 'tel:+201000000000' })

    const hidden = contactWith({ phone: { value: '+201000000000', isVisible: false } })
    expect(resolveCtaTarget(cta('call'), hidden).kind).toBe('none')

    const invalid = contactWith({ phone: field('01012345678') })
    expect(resolveCtaTarget(cta('call'), invalid).kind).toBe('none')
  })

  it('whatsapp resolves only with a visible, valid number', () => {
    const valid = contactWith({ whatsapp: field('+201000000000') })
    expect(resolveCtaTarget(cta('whatsapp'), valid)).toEqual({
      kind: 'href',
      href: 'https://wa.me/201000000000',
    })
    expect(resolveCtaTarget(cta('whatsapp'), createDefaultContact()).kind).toBe('none')
  })

  it('never falls back to booking when call/whatsapp is invalid', () => {
    const target = resolveCtaTarget(cta('call'), createDefaultContact())
    expect(target.kind).toBe('none')
    expect(target.kind).not.toBe('booking')
  })
})

// ===========================================================================
// 8. CTA label precedence (legacy hero label preserved)
// ===========================================================================
describe('CTA label precedence', () => {
  it('prefers an explicit CTA label', () => {
    const cta: CtaConfig = { action: 'booking', label: { ar: 'كلمنا', en: 'Call us' } }
    expect(resolveCtaLabel('ar', cta, 'احجز الآن')).toBe('كلمنا')
    expect(resolveCtaLabel('en', cta, 'Book now')).toBe('Call us')
  })

  it('falls back to the legacy hero label when the CTA label is empty', () => {
    // This is what keeps "booking + sticky off" identical to today's behaviour.
    const cta = createDefaultCta()
    expect(cta.label.ar).toBe('')
    expect(resolveCtaLabel('ar', cta, 'احجز الآن')).toBe('احجز الآن')
    expect(resolveCtaLabel('en', cta, 'Book now')).toBe('Book now')
  })

  it('falls back to the historical default when neither is set', () => {
    expect(resolveCtaLabel('ar', createDefaultCta(), '')).toBe('احجز موعداً')
    expect(resolveCtaLabel('en', createDefaultCta(), null)).toBe('Book an appointment')
  })
})

// ===========================================================================
// 9. Contact visibility predicates
// ===========================================================================
describe('hasVisibleContactData', () => {
  it('is false when every field is hidden or empty', () => {
    expect(hasVisibleContactData(createDefaultContact())).toBe(false)
  })

  it('is false when a field is populated but hidden', () => {
    const c = contactWith({ phone: { value: '+201000000000', isVisible: false } })
    expect(hasVisibleContactData(c)).toBe(false)
  })

  it('is false when a field is visible but empty', () => {
    const c = contactWith({ phone: { value: '', isVisible: true } })
    expect(hasVisibleContactData(c)).toBe(false)
  })

  it('is true when at least one field is visible and non-empty', () => {
    expect(hasVisibleContactData(contactWith({ address: field('Cairo') }))).toBe(true)
  })
})

// ===========================================================================
// 10. Social link resolution
// ===========================================================================
describe('resolveVisibleSocialLinks', () => {
  it('returns nothing when every platform is disabled', () => {
    expect(resolveVisibleSocialLinks(createDefaultSocial())).toEqual([])
  })

  it('excludes disabled platforms and unsafe URLs', () => {
    const social: SocialConfig = {
      instagram: { url: 'https://ig.com/x', isEnabled: false },
      facebook: { url: 'https://fb.com/x', isEnabled: true },
      tiktok: { url: 'javascript:alert(1)', isEnabled: true },
      youtube: { url: '', isEnabled: true },
    }
    const links = resolveVisibleSocialLinks(social)
    expect(links).toEqual([{ platform: 'facebook', url: 'https://fb.com/x' }])
  })

  it('supports exactly the four fixed platforms', () => {
    expect([...SOCIAL_PLATFORMS]).toEqual(['instagram', 'facebook', 'tiktok', 'youtube'])
  })
})

// ===========================================================================
// 11. Write-side issues
// ===========================================================================
describe('write-side validation issues', () => {
  it('reports an over-ceiling contact value with its exact field', () => {
    const contact = contactWith({ address: field('x'.repeat(CONTACT_TEXT_PAYLOAD_MAX + 1)) })
    const issues = collectContactSocialIssues(contact, createDefaultSocial())
    expect(issues).toEqual([
      { field: 'contact.address.value', code: 'TOO_LONG', max: CONTACT_TEXT_PAYLOAD_MAX, actual: CONTACT_TEXT_PAYLOAD_MAX + 1 },
    ])
  })

  it('reports an over-ceiling social URL with its exact field', () => {
    const social = {
      ...createDefaultSocial(),
      tiktok: { url: 'x'.repeat(CONTACT_TEXT_PAYLOAD_MAX + 1), isEnabled: true },
    }
    const issues = collectContactSocialIssues(createDefaultContact(), social)
    expect(issues.map((i) => i.field)).toEqual(['social.tiktok.url'])
  })

  it('reports nothing for valid input', () => {
    expect(collectContactSocialIssues(createDefaultContact(), createDefaultSocial())).toEqual([])
  })

  it('does NOT flag a value at exactly the ceiling', () => {
    const contact = contactWith({ address: field('x'.repeat(CONTACT_TEXT_PAYLOAD_MAX)) })
    expect(collectContactSocialIssues(contact, createDefaultSocial())).toEqual([])
  })
})

// ===========================================================================
// 12. Publish gate
// ===========================================================================
describe('collectPublishIssues (publish gate)', () => {
  it('passes for booking', () => {
    expect(collectPublishIssues({ ...createDefaultCta(), action: 'booking' }, createDefaultContact())).toEqual([])
  })

  it('blocks call without a valid visible phone', () => {
    const issues = collectPublishIssues({ ...createDefaultCta(), action: 'call' }, createDefaultContact())
    expect(issues).toHaveLength(1)
    expect(issues[0].code).toBe('CTA_NO_DESTINATION')
  })

  it('blocks whatsapp without a valid visible number', () => {
    const issues = collectPublishIssues({ ...createDefaultCta(), action: 'whatsapp' }, createDefaultContact())
    expect(issues[0].code).toBe('CTA_NO_DESTINATION')
  })

  it('allows call with a valid visible phone', () => {
    const contact = contactWith({ phone: field('+201000000000') })
    expect(collectPublishIssues({ ...createDefaultCta(), action: 'call' }, contact)).toEqual([])
  })
})

// ===========================================================================
// 13. Round-trip: tolerant read / strict write
// ===========================================================================
describe('tolerant read / strict write round trip', () => {
  const oversizedConfig = () => ({
    theme: { logo: 'data:image/png;base64,AA', primaryColor: '#111111' },
    sections: [{ id: 'sec_hero', type: 'hero', content: { ar: {}, en: {} } }],
    contact: {
      ...createDefaultContact(),
      phone: field('+201000000000'),
      email: field('a@b.com'),
      address: field('x'.repeat(CONTACT_TEXT_PAYLOAD_MAX + 1000)),
    },
    social: createDefaultSocial(),
    cta: createDefaultCta(),
    mobileStickyCta: createDefaultMobileStickyCta(),
  })

  it('READ retains an oversized value instead of blanking it', () => {
    const parsed = safeParseWebsiteConfig(oversizedConfig())
    expect(parsed).not.toBeNull()
    // The critical property: opening the editor must not destroy the value.
    expect(parsed!.contact.address.value).toHaveLength(CONTACT_TEXT_PAYLOAD_MAX + 1000)
    expect(parsed!.contact.phone.value).toBe('+201000000000')
    expect(parsed!.contact.email.value).toBe('a@b.com')
  })

  it('READ preserves theme, logo and sections alongside the oversized value', () => {
    const parsed = safeParseWebsiteConfig(oversizedConfig())!
    expect(parsed.theme.logo).toBe('data:image/png;base64,AA')
    expect(parsed.theme.primaryColor).toBe('#111111')
    expect(parsed.sections).toHaveLength(1)
  })

  it('WRITE reports the oversized field precisely', () => {
    const parsed = safeParseWebsiteConfig(oversizedConfig())!
    const result = validateWebsiteConfigForWrite(parsed)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toEqual([
        {
          field: 'contact.address.value',
          code: 'TOO_LONG',
          max: CONTACT_TEXT_PAYLOAD_MAX,
          actual: CONTACT_TEXT_PAYLOAD_MAX + 1000,
        },
      ])
    }
  })

  it('WRITE accepts the config once the value is corrected (retry after fix)', () => {
    const config = oversizedConfig()
    config.contact.address = field('Cairo')
    const result = validateWebsiteConfigForWrite(config)
    expect(result.ok).toBe(true)
  })

  it('an under-ceiling legacy length still saves', () => {
    const config = oversizedConfig()
    config.contact.address = field('x'.repeat(600)) // over the advisory 500, under the ceiling
    const result = validateWebsiteConfigForWrite(config)
    expect(result.ok).toBe(true)
  })
})

// ===========================================================================
// 14. Backward compatibility
// ===========================================================================
describe('backward compatibility', () => {
  // A real 1x1 PNG data URL — the schema validates hero image payloads, so a
  // placeholder string would be rejected for the wrong reason.
  const PNG_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

  const legacy = (extra: Record<string, unknown> = {}) => ({
    theme: { logo: 'data:image/png;base64,AA', heroImage: PNG_DATA_URL },
    sections: [
      { id: 'sec_hero', type: 'hero', content: { ar: { headline: 'ع' }, en: { headline: 'H' } } },
      { id: 'sec_services', type: 'services', content: { ar: {}, en: {} } },
    ],
    ...extra,
  })

  it('fills defaults when every new field is absent, preserving the rest', () => {
    const parsed = safeParseWebsiteConfig(legacy())!
    expect(parsed.theme.logo).toBe('data:image/png;base64,AA')
    expect(parsed.theme.heroImage).toBe(PNG_DATA_URL)
    expect(parsed.sections).toHaveLength(2)
    expect(parsed.sections[0].content.en?.headline).toBe('H')
    expect(parsed.contact).toEqual(createDefaultContact())
    expect(parsed.social).toEqual(createDefaultSocial())
    expect(parsed.cta).toEqual(createDefaultCta())
    expect(parsed.mobileStickyCta).toEqual(createDefaultMobileStickyCta())
  })

  it('fills defaults when a container is null, non-object or an array', () => {
    for (const bad of [null, 5, 'x', []]) {
      const parsed = safeParseWebsiteConfig(legacy({ contact: bad, social: bad, cta: bad, mobileStickyCta: bad }))
      expect(parsed, String(bad)).not.toBeNull()
      expect(parsed!.contact).toEqual(createDefaultContact())
      expect(parsed!.theme.logo).toBe('data:image/png;base64,AA')
    }
  })

  it('keeps a valid sibling when one new leaf is malformed', () => {
    const parsed = safeParseWebsiteConfig(
      legacy({
        contact: { ...createDefaultContact(), phone: field('+201000000000'), email: { value: 42 } },
      })
    )!
    expect(parsed.contact.phone.value).toBe('+201000000000')
    expect(parsed.contact.email.value).toBe('')
    expect(parsed.theme.logo).toBe('data:image/png;base64,AA')
  })

  it('still rejects a malformed legacy theme (strict core preserved)', () => {
    expect(safeParseWebsiteConfig({ theme: 'garbage', sections: [] })).toBeNull()
    expect(() => parseWebsiteConfig({ theme: 'garbage', sections: [] })).toThrow()
  })

  it('still rejects malformed sections (strict core preserved)', () => {
    expect(safeParseWebsiteConfig({ theme: {}, sections: 'nope' })).toBeNull()
  })
})

// ===========================================================================
// 15. Contact section ordering + empty guard
// ===========================================================================
describe('contact section ordering and empty guard', () => {
  const withContact = (contactPatch: Partial<ContactConfig>, isVisible = true) =>
    parseWebsiteConfig({
      theme: {},
      sections: [
        { id: 'sec_hero', type: 'hero', sortOrder: 0, isVisible: true, content: {} },
        { id: 'sec_services', type: 'services', sortOrder: 1, isVisible: true, content: {} },
        { id: 'sec_contact', type: 'contact', sortOrder: 2, isVisible, content: {} },
      ],
      contact: { ...createDefaultContact(), ...contactPatch },
    })

  it('places contact after services by default', () => {
    const config = createDefaultWebsiteConfig()
    const contact = config.sections.find((s) => s.type === 'contact')!
    const services = config.sections.find((s) => s.type === 'services')!
    expect(contact.sortOrder).toBeGreaterThan(services.sortOrder)
  })

  it('renders contact when it is visible and has data', () => {
    expect(resolveOrderedSectionTypes(withContact({ phone: field('+201000000000') }))).toEqual([
      'hero',
      'services',
      'contact',
    ])
  })

  it('omits contact when every field is hidden or empty (no empty section)', () => {
    expect(resolveOrderedSectionTypes(withContact({}))).toEqual(['hero', 'services'])
  })

  it('omits contact when it is explicitly hidden even with data', () => {
    expect(resolveOrderedSectionTypes(withContact({ phone: field('+201000000000') }, false))).toEqual([
      'hero',
      'services',
    ])
  })

  it('omits contact when the only populated field is hidden', () => {
    const config = withContact({ phone: { value: '+201000000000', isVisible: false } })
    expect(resolveOrderedSectionTypes(config)).toEqual(['hero', 'services'])
  })
})
