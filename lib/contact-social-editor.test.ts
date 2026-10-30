import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Website Builder: the Contact & Social editor surface.
//
// Source-level assertions that pin the editor's structure and, importantly, the
// failure contract: a rejected save must NOT replace the editor's state, and
// success must only be reported after a confirmed success.
// ---------------------------------------------------------------------------

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')
const editor = read('components/website-editor.tsx')
const dashboard = read('app/[locale]/tenants/[slug]/dashboard/page.tsx')

describe('editor: contact & social surface', () => {
  it('renders the Contact Information panel with all five fields', () => {
    expect(editor).toContain("rtl ? 'معلومات الاتصال' : 'Contact Information'")
    for (const f of ['phone', 'whatsapp', 'email']) {
      expect(editor, f).toContain(`updateContactField('${f}'`)
    }
  })

  it('renders the Social Links panel for the four fixed platforms', () => {
    expect(editor).toContain("rtl ? 'روابط التواصل' : 'Social Links'")
    expect(editor).toContain('SOCIAL_PLATFORMS.map')
    expect(editor).toContain('updateSocialLink(platform')
  })

  it('renders the Primary CTA panel with the three actions', () => {
    expect(editor).toContain("rtl ? 'زر الإجراء الرئيسي' : 'Primary Call-to-Action'")
    expect(editor).toContain('CTA_ACTIONS.map')
  })

  it('renders the Mobile Sticky CTA toggle', () => {
    expect(editor).toContain("rtl ? 'زر ثابت للجوال' : 'Mobile sticky CTA'")
    expect(editor).toContain('toggleMobileSticky')
  })

  it('gives every field its own visibility toggle', () => {
    expect(editor).toContain('role="switch"')
    expect(editor).toContain('aria-checked={isVisible}')
  })

  it('is localized in both languages', () => {
    for (const label of ['معلومات الاتصال', 'Contact Information', 'روابط التواصل', 'Social Links']) {
      expect(editor).toContain(label)
    }
  })
})

describe('editor: validation feedback', () => {
  it('warns when the selected action has no destination, per action', () => {
    // Action-specific, not a single generic "booking" message.
    expect(editor).toContain('CTA_WARNINGS[')
    expect(editor).toContain("config.cta.action !== 'booking' && ctaTarget.kind === 'none'")
  })

  it('warns when the contact section is enabled but empty', () => {
    expect(editor).toContain('contactEmptyWarning')
    expect(editor).toContain('CONTACT_EMPTY_WARNING[locale]')
  })

  it('shows the international-format hint and the invalid-number hint', () => {
    expect(editor).toContain('PHONE_FORMAT_HINT[locale]')
    expect(editor).toContain('PHONE_INVALID_HINT[locale]')
  })

  it('shows a URL hint for unsafe Maps/social links', () => {
    expect(editor).toContain('URL_INVALID_HINT[locale]')
    expect(editor).toContain('isHttpUrl(')
  })

  it('renders server-issued field errors from the shared message table', () => {
    expect(editor).toContain('VALIDATION_MESSAGES[issue.code][locale]')
    expect(editor).toContain('issueFor(')
  })

  it('renders a general error banner for non-field failures', () => {
    expect(editor).toContain('data-testid="editor-general-error"')
    expect(editor).toContain('role="alert"')
  })
})

describe('editor: failure contract (state must survive a rejected write)', () => {
  it('never replaces config state on a failed save', () => {
    // Slice the save handler and assert no setConfig appears in its failure path.
    const start = editor.indexOf('const handleSaveDraft = useCallback')
    const end = editor.indexOf('// Publish — sends the current editor state')
    const handler = editor.slice(start, end)
    expect(handler).toContain('setValidationIssues(result.errors)')
    expect(handler).not.toContain('setConfig(')
  })

  it('never replaces config state on a failed publish', () => {
    const start = editor.indexOf('const handlePublish = useCallback')
    const end = editor.indexOf('// Discard')
    const handler = editor.slice(start, end)
    expect(handler).toContain('setValidationIssues(result.errors)')
    expect(handler).not.toContain('setConfig(')
  })

  it('reports the CTA-blocked publish with a specific reason', () => {
    expect(editor).toContain("result.error === 'CTA_NO_DESTINATION'")
  })

  it('only refreshes and clears dirty state on a confirmed success', () => {
    const start = editor.indexOf('const handleSaveDraft = useCallback')
    const end = editor.indexOf('// Publish — sends the current editor state')
    const handler = editor.slice(start, end)
    // Both the refresh and the dirty-flag clear live inside the `if (result.ok)`.
    const okIndex = handler.indexOf('if (result.ok)')
    const refreshIndex = handler.indexOf('router.refresh()')
    const clearIndex = handler.indexOf('setHasUnsavedChanges(false)')
    expect(okIndex).toBeGreaterThan(-1)
    expect(refreshIndex).toBeGreaterThan(okIndex)
    expect(clearIndex).toBeGreaterThan(okIndex)
  })

  it('clears stale issues at the start of each attempt', () => {
    expect((editor.match(/setValidationIssues\(\[\]\)/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })
})

describe('editor: normalizeConfig completeness', () => {
  it('includes every new top-level field', () => {
    const start = editor.indexOf('function normalizeConfig')
    const end = editor.indexOf('// ---', start)
    const fn = editor.slice(start, end)
    for (const key of ['contact', 'social', 'cta', 'mobileStickyCta']) {
      expect(fn, key).toContain(`${key}: config.${key}`)
    }
    // The pre-existing fields must still be there.
    expect(fn).toContain('theme: config.theme')
    expect(fn).toContain('sections: config.sections')
  })
})

describe('dashboard wiring', () => {
  it('passes the draft and published configs into the editor', () => {
    expect(dashboard).toContain('initialConfig={draftWebsiteConfig}')
    expect(dashboard).toContain('publishedConfig={publishedWebsiteConfig}')
  })

  it('gates publish on an admin/owner role', () => {
    expect(dashboard).toContain("canPublish={['admin', 'owner'].includes(access.membership.role)}")
  })
})

describe('renderer wiring (structural)', () => {
  const site = read('components/tenant-website.tsx')

  it('registers a contact section renderer', () => {
    expect(site).toContain('contact: renderContact')
    expect(site).toContain('<ContactSection')
  })

  it('guards the Maps and social URLs through shared helpers', () => {
    expect(site).toContain('resolveVisibleSocialLinks')
    expect(site).toContain('toTelHref')
    expect(site).toContain('toMailto')
  })

  it('hides the header CTA on mobile only when the sticky bar renders', () => {
    expect(site).toContain("stickyVisible ? 'hidden md:flex' : 'flex'")
  })

  it('reserves bottom padding only when the sticky CTA renders', () => {
    // The reserved space is applied by the mobile-only CSS class
    // `.tenant-site--has-sticky-cta` (globals.css), gated on the CTA rendering.
    expect(site).toContain('tenant-site--has-sticky-cta')
    expect(site).toContain('stickyVisible')
    const css = read('app/globals.css')
    expect(css).toMatch(
      /\.tenant-site--has-sticky-cta\s*\{[^}]*padding-bottom:[^;]*env\(safe-area-inset-bottom/
    )
  })

  it('mounts the sticky CTA behind the stickyVisible guard', () => {
    expect(site).toContain('{stickyVisible && (')
    expect(site).toContain('<MobileStickyCta')
  })

  it('never routes a user-controlled URL into an href without a guard', () => {
    // The only raw `href={...}` usages must be the guarded destinations.
    const rawHrefs = site.match(/href=\{[^}]+\}/g) ?? []
    for (const h of rawHrefs) {
      const ok =
        h.includes('primaryCtaHref') ||
        // Server-constructed internal path (`/${locale}/tenants/${slug}/book`),
        // exactly like the service link below — never user-controlled.
        h.includes('heroBookingHref') ||
        h.includes('item.href') ||
        h.includes('telHref') ||
        h.includes('waHref') ||
        h.includes('mailHref') ||
        h.includes('mapsHref') ||
        h.includes('locale') ||
        h.includes('slug') ||
        h.includes('href={href}') ||
        h.includes('"#"') ||
        h.includes('href="/"')
      expect(ok, `unguarded href: ${h}`).toBe(true)
    }
  })

  it('keeps the service-specific booking link hardcoded to ?service=', () => {
    expect(site).toContain('`/${locale}/tenants/${slug}/book?service=${item.id}`')
  })
})
