import { test, expect, type Page } from '@playwright/test'

/**
 * Browser-level regression test: the PUBLIC tenant website header must keep the
 * business name visible at every width, in both directions, without overflowing.
 *
 * Regression this guards: the brand-name span carried
 * `hidden truncate sm:inline-block`, so `display:none` removed the tenant's name
 * from every viewport below 768px — the public site was unbranded on mobile.
 * Source-level class assertions cannot catch that (the class is only a symptom),
 * so this measures real geometry in a browser.
 *
 * Portability: the default tenant is `nile-wellness`, which `pnpm run db:seed`
 * creates idempotently. It has NO logo, so it also exercises the letter-mark
 * fallback branch. No assertion below hardcodes a tenant name — the suite is
 * name-agnostic and passes against any tenant with a name and a booking CTA.
 * Override with RESPONSIVE_TENANT_SLUG=<slug>.
 *
 * No tenant data is created or modified: the long-name case injects text into
 * the DOM in the browser only, via page.evaluate. Read-only against the app.
 */

const SLUG = process.env.RESPONSIVE_TENANT_SLUG ?? 'nile-wellness'
/** Optional exact-name assertion. Unset by default so the suite stays portable. */
const EXPECTED_NAME = process.env.RESPONSIVE_TENANT_NAME
const WIDTHS = [320, 360, 375, 390, 430, 768, 1024, 1440]

/** Max realistic business name (tenantTranslations.name is not length-capped low). */
const LONG_NAME_AR = 'صالون بسمة للتجميل والعناية المتكاملة'
const LONG_NAME_EN = 'Bella Beauty Salon and Wellness Centre Downtown'

type HeaderMetrics = {
  vw: number
  scrollWidth: number
  dir: string
  lang: string
  nameVisible: boolean
  nameWidth: number
  nameClamped: boolean
  nameTitle: string | null
  brandLeft: number
  brandRight: number
  navLeft: number
  navRight: number
  ctaLeft: number
  ctaRight: number
  ctaHeight: number
  ctaHref: string | null
  overlap: boolean
  overflowCount: number
  overflowing: string[]
}

/** Measure the header, optionally replacing the brand name first. */
async function measureHeader(page: Page, injectName?: string): Promise<HeaderMetrics> {
  return page.evaluate((name) => {
    const header = document.querySelector('header') as HTMLElement | null
    if (!header) throw new Error('header not found')

    const brand = header.querySelector('a') as HTMLAnchorElement | null
    if (!brand) throw new Error('brand link not found in the tenant header')

    // Stable, unambiguous hook on the business-name span. Do NOT fall back to
    // "the last span in the brand link": the letter-mark placeholder is also a
    // span, so a positional pick silently measures the wrong element if the
    // markup order ever changes.
    const nameEl = brand.querySelector('[data-testid="tenant-brand-name"]') as HTMLElement | null
    if (!nameEl) {
      throw new Error(
        'business-name element [data-testid="tenant-brand-name"] not found in the header brand link'
      )
    }
    if (nameEl.tagName !== 'SPAN') {
      throw new Error(`business-name element must be a <span>, got <${nameEl.tagName.toLowerCase()}>`)
    }

    const nav = header.querySelector('nav') as HTMLElement
    const cta = header.querySelector('nav a[href*="/book"]') as HTMLAnchorElement

    if (name) {
      nameEl.textContent = name
      nameEl.setAttribute('title', name)
    }

    const vw = window.innerWidth
    const de = document.documentElement
    const rect = (el: Element) => el.getBoundingClientRect()

    const overflowing: string[] = []
    for (const el of document.querySelectorAll('main *')) {
      const r = rect(el)
      if (r.width > vw + 1 || r.right > vw + 1 || r.left < -1) {
        overflowing.push(el.tagName.toLowerCase() + '.' + String(el.className).slice(0, 34))
      }
    }

    const nr = rect(nameEl)
    const brR = rect(brand)
    const navR = rect(nav)
    const ctaR = rect(cta)

    return {
      vw,
      scrollWidth: de.scrollWidth,
      dir: de.dir,
      lang: de.lang,
      nameVisible:
        nr.width > 0 && nr.height > 0 && getComputedStyle(nameEl).display !== 'none',
      nameWidth: Math.round(nr.width),
      nameClamped: nameEl.scrollHeight > nameEl.clientHeight + 1,
      nameTitle: nameEl.getAttribute('title'),
      brandLeft: Math.round(brR.left),
      brandRight: Math.round(brR.right),
      navLeft: Math.round(navR.left),
      navRight: Math.round(navR.right),
      ctaLeft: Math.round(ctaR.left),
      ctaRight: Math.round(ctaR.right),
      ctaHeight: Math.round(ctaR.height),
      ctaHref: cta.getAttribute('href'),
      // Brand and nav are siblings in a `justify-between` row: they must not
      // occupy the same horizontal band.
      overlap: brR.left < navR.right - 1 && navR.left < brR.right - 1,
      overflowCount: overflowing.length,
      overflowing: overflowing.slice(0, 5),
    }
  }, injectName)
}

test.describe('public tenant website — header keeps the business name', () => {
  test('the testid hook resolves to the real business name (not the letter mark)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto(`/en/tenants/${SLUG}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('main h1')

    const probe = await page.evaluate(() => {
      const brand = document.querySelector('header a') as HTMLElement
      const el = brand.querySelector('[data-testid="tenant-brand-name"]') as HTMLElement
      const hero = document.querySelector('main h1') as HTMLElement
      const spans = [...brand.querySelectorAll('span')]
      // The letter-mark placeholder is the OTHER span (or, with a logo image, a
      // single letter rendered inside an aria-hidden span). Capture both so we
      // can prove the hook is not the placeholder.
      const letterMark = spans.find((s) => s !== el) ?? null
      return {
        found: !!el,
        tag: el ? el.tagName : null,
        text: el ? el.textContent!.trim() : null,
        title: el ? el.getAttribute('title') : null,
        heroText: hero ? hero.textContent!.trim() : null,
        letterMarkText: letterMark ? letterMark.textContent!.trim() : null,
        // The hook must be the brand's own element, distinct from the mark.
        isLetterMark: letterMark ? letterMark === el : null,
        isSingleChar: el ? el.textContent!.trim().length === 1 : null,
        spanCount: spans.length,
      }
    })

    expect(probe.found, 'testid hook must resolve').toBe(true)
    expect(probe.tag).toBe('SPAN')
    expect(probe.text, 'must carry the business name text').toBeTruthy()
    expect(probe.title, 'title must expose the full name').toBe(probe.text)
    expect(probe.isSingleChar, 'must not be the letter-mark placeholder').toBe(false)
    // Both header and hero derive from the same `businessName`, so this guards
    // against the header being wired to a different source (e.g. the slug).
    expect(probe.heroText).toBe(probe.text)
    expect(probe.spanCount).toBeGreaterThan(0)

    // Opt-in exact-name assertion for environments that pin a fixture.
    if (EXPECTED_NAME) {
      expect(probe.text).toBe(EXPECTED_NAME)
      expect(probe.title).toBe(EXPECTED_NAME)
    }
  })

  test('the slug routes the tenant while the name comes from the name field', async ({ page }) => {
    // Requirement: the slug identifies/routes the tenant and is NOT the display
    // name. `nile-wellness` (slug) renders `Nile Wellness Center` (name) — the
    // two are deliberately different strings, so this proves the header does not
    // fall back to the slug.
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto(`/en/tenants/${SLUG}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('main h1')

    const shown = await page.evaluate(() =>
      (document.querySelector('[data-testid="tenant-brand-name"]') as HTMLElement).textContent!.trim()
    )
    expect(shown, 'header must render the name, never the raw slug').not.toBe(SLUG)
    // The booking CTA is still routed by the slug.
    await expect(page.locator('header nav a[href*="/book"]')).toHaveAttribute(
      'href',
      `/en/tenants/${SLUG}/book`
    )
  })

  test('the letter-mark fallback branch renders the name (tenant without a logo)', async ({ page }) => {
    // `nile-wellness` has no logo, so the header uses the letter-mark branch.
    // Asserting the rendered shape keeps both branches covered.
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto(`/en/tenants/${SLUG}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('main h1')

    const shape = await page.evaluate(() => {
      const brand = document.querySelector('header a') as HTMLElement
      const el = brand.querySelector('[data-testid="tenant-brand-name"]') as HTMLElement
      const mark = brand.querySelector('span[aria-hidden="true"]') as HTMLElement | null
      const img = brand.querySelector('img')
      return {
        hasLogoImage: !!img,
        hasLetterMark: !!mark,
        letterMarkText: mark ? mark.textContent!.trim() : null,
        nameText: el ? el.textContent!.trim() : null,
      }
    })

    expect(shape.nameText).toBeTruthy()
    if (shape.hasLogoImage) {
      expect(shape.hasLetterMark, 'a logo image replaces the letter mark').toBe(false)
    } else {
      expect(shape.hasLetterMark, 'no logo means the letter-mark fallback is used').toBe(true)
      expect(shape.letterMarkText).toBe(shape.nameText![0].toUpperCase())
      expect(shape.letterMarkText, 'the mark is a single letter, not the name').toHaveLength(1)
    }
  })

  test('the helper fails loudly when the name hook is absent', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto(`/en/tenants/${SLUG}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('main h1')

    // Remove the hook in the browser only, then assert the helper throws a
    // message that names the selector instead of silently measuring <html>.
    await page.evaluate(() => {
      document.querySelector('[data-testid="tenant-brand-name"]')?.removeAttribute('data-testid')
    })

    await expect(measureHeader(page)).rejects.toThrow(/data-testid="tenant-brand-name"/)
  })

  for (const width of WIDTHS) {
    test(`EN @${width}: business name is visible and the header fits`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/en/tenants/${SLUG}`, { waitUntil: 'networkidle' })
      await page.waitForSelector('main h1')

      const r = await measureHeader(page)

      expect(r.nameVisible, 'business name must be rendered at every width').toBe(true)
      expect(r.nameWidth).toBeGreaterThan(0)
      expect(r.nameTitle, 'full name must be available when clipped').toBeTruthy()
      expect(r.scrollWidth, 'no horizontal overflow').toBeLessThanOrEqual(r.vw)
      expect(r.overflowCount, `overflowing: ${r.overflowing.join(', ')}`).toBe(0)
      expect(r.overlap, 'brand and nav must not overlap').toBe(false)
      expect(r.ctaRight).toBeLessThanOrEqual(r.vw)
      expect(r.ctaLeft).toBeGreaterThanOrEqual(0)
      expect(r.ctaHeight).toBeGreaterThanOrEqual(32)
      expect(r.ctaHref).toBe(`/en/tenants/${SLUG}/book`)
      expect(r.dir).toBe('ltr')
      expect(r.lang).toBe('en')
    })

    test(`AR @${width}: business name is visible and the header fits`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/ar/tenants/${SLUG}`, { waitUntil: 'networkidle' })
      await page.waitForSelector('main h1')

      const r = await measureHeader(page)

      expect(r.nameVisible, 'business name must be rendered at every width').toBe(true)
      expect(r.nameWidth).toBeGreaterThan(0)
      expect(r.nameTitle, 'full name must be available when clipped').toBeTruthy()
      expect(r.scrollWidth, 'no horizontal overflow').toBeLessThanOrEqual(r.vw)
      expect(r.overflowCount, `overflowing: ${r.overflowing.join(', ')}`).toBe(0)
      expect(r.overlap, 'brand and nav must not overlap').toBe(false)
      expect(r.ctaRight).toBeLessThanOrEqual(r.vw)
      expect(r.ctaLeft).toBeGreaterThanOrEqual(0)
      expect(r.ctaHeight).toBeGreaterThanOrEqual(32)
      expect(r.ctaHref).toBe(`/ar/tenants/${SLUG}/book`)
      // RTL: the brand sits at the RIGHT edge and the nav to its LEFT.
      expect(r.dir).toBe('rtl')
      expect(r.lang).toBe('ar')
      expect(r.brandLeft).toBeGreaterThan(r.navRight)
    })
  }

  for (const width of [320, 360, 390]) {
    test(`long business name does not break the header @${width} (EN)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/en/tenants/${SLUG}`, { waitUntil: 'networkidle' })
      await page.waitForSelector('main h1')

      const r = await measureHeader(page, LONG_NAME_EN)

      expect(r.nameVisible).toBe(true)
      expect(r.scrollWidth, 'long name must not overflow the page').toBeLessThanOrEqual(r.vw)
      expect(r.overflowCount, `overflowing: ${r.overflowing.join(', ')}`).toBe(0)
      expect(r.overlap).toBe(false)
      expect(r.ctaRight).toBeLessThanOrEqual(r.vw)
      expect(r.ctaHeight).toBeGreaterThanOrEqual(32)
      // The name is allowed to wrap/clamp, but must keep a readable width.
      expect(r.nameWidth).toBeGreaterThanOrEqual(60)
    })

    test(`long business name does not break the header @${width} (AR)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/ar/tenants/${SLUG}`, { waitUntil: 'networkidle' })
      await page.waitForSelector('main h1')

      const r = await measureHeader(page, LONG_NAME_AR)

      expect(r.nameVisible).toBe(true)
      expect(r.scrollWidth, 'long name must not overflow the page').toBeLessThanOrEqual(r.vw)
      expect(r.overflowCount, `overflowing: ${r.overflowing.join(', ')}`).toBe(0)
      expect(r.overlap).toBe(false)
      expect(r.ctaRight).toBeLessThanOrEqual(r.vw)
      expect(r.ctaHeight).toBeGreaterThanOrEqual(32)
      expect(r.nameWidth).toBeGreaterThanOrEqual(60)
    })
  }

  test('desktop appearance is intact: name is on one line', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/en/tenants/${SLUG}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('main h1')
    const r = await measureHeader(page)
    // From `sm` up the name must not be clamped to multiple lines.
    expect(r.nameClamped).toBe(false)
    expect(r.ctaRight).toBeLessThanOrEqual(r.vw)
  })

  test('the CTA still navigates to the booking page', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await page.goto(`/en/tenants/${SLUG}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('main h1')
    const cta = page.locator('header nav a[href*="/book"]')
    await expect(cta).toBeVisible()
    await cta.click()
    // `next dev` compiles the /book route on first hit, which can exceed the
    // default 5s assertion timeout (the equivalent pre-existing test also runs
    // ~6-8s locally). Generous timeout keeps this about navigation, not warmup.
    await expect(page).toHaveURL(new RegExp(`/en/tenants/${SLUG}/book`), { timeout: 30_000 })
  })
})
