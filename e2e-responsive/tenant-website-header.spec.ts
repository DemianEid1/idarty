import { test, expect, type Page } from '@playwright/test'

/**
 * Browser-level regression test: maximum-length CTA label in the PUBLIC tenant
 * website header.
 *
 * Regression this guards: the header <nav> previously carried `shrink-0`, so it
 * could not be constrained. A long-but-valid CTA label (the editor bounds
 * `ctaLabel` at 50 chars) then pushed the header wider than the viewport and the
 * `truncate` class never engaged. Source-level class-name assertions cannot
 * catch that, which is why this is a real layout assertion.
 *
 * No tenant data is created or modified: the long label is injected into the DOM
 * in the browser only, via page.evaluate. Read-only against the app.
 */

/**
 * The schema's max ctaLabel length (lib/website-config.ts: ctaLabel maxLength 50).
 *
 * Portability: defaults to `nile-wellness` (created idempotently by
 * `pnpm run db:seed`), overridable with RESPONSIVE_TENANT_SLUG. No tenant name
 * is asserted — only geometry — so this passes against any seeded tenant.
 */
const MAX_CTA_EN = 'Book your appointment online right now please' // 44 chars, realistic
const MAX_CTA_AR = 'احجز موعدك الآن عبر الإنترنت من فضلك اضغط هنا' // ~44 chars

const SLUG = process.env.RESPONSIVE_TENANT_SLUG ?? 'nile-wellness'
const WIDTHS = [320, 390]

/** Inject a max-length CTA label into the header CTA and measure the layout. */
async function measureWithLongCta(page: Page, label: string) {
  return page.evaluate((text) => {
    const headerCta = document.querySelector('header nav a[href*="/book"]') as HTMLAnchorElement | null
    if (!headerCta) throw new Error('header booking CTA not found')

    const span = headerCta.querySelector('span')
    if (span) span.textContent = text
    else headerCta.textContent = text

    const de = document.documentElement
    const vw = window.innerWidth
    const header = document.querySelector('header') as HTMLElement
    const nav = header.querySelector('nav') as HTMLElement
    const brand = header.querySelector('a') as HTMLElement
    const ctaRect = headerCta.getBoundingClientRect()
    const navRect = nav.getBoundingClientRect()
    const brandRect = brand.getBoundingClientRect()
    const labelEl = headerCta.querySelector('span') ?? headerCta

    const overflowing: string[] = []
    for (const el of document.querySelectorAll('main *')) {
      const r = el.getBoundingClientRect()
      if (r.width > vw + 1 || r.right > vw + 1 || r.left < -1) {
        overflowing.push(el.tagName.toLowerCase() + '.' + String(el.className).slice(0, 40))
      }
    }

    return {
      vw,
      scrollWidth: de.scrollWidth,
      lang: de.lang,
      dir: de.dir,
      navFlexShrink: getComputedStyle(nav).flexShrink,
      ctaLeft: Math.round(ctaRect.left),
      ctaRight: Math.round(ctaRect.right),
      ctaWidth: Math.round(ctaRect.width),
      ctaHeight: Math.round(ctaRect.height),
      labelClientWidth: labelEl.clientWidth,
      labelScrollWidth: labelEl.scrollWidth,
      labelTruncated: labelEl.scrollWidth > labelEl.clientWidth + 1,
      navRight: Math.round(navRect.right),
      brandLeft: Math.round(brandRect.left),
      brandRight: Math.round(brandRect.right),
      headerHeight: Math.round(header.getBoundingClientRect().height),
      bookingHref: headerCta.getAttribute('href'),
      overflowCount: overflowing.length,
      overflowing: overflowing.slice(0, 6),
    }
  }, label)
}

test.describe('public tenant website — long CTA label', () => {
  for (const width of WIDTHS) {
    test(`AR @${width}: max-length CTA does not overflow the viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/ar/tenants/${SLUG}`, { waitUntil: 'networkidle' })
      await page.waitForSelector('main h1')

      const r = await measureWithLongCta(page, MAX_CTA_AR)

      // 1. No horizontal page overflow (the actual defect).
      expect(r.scrollWidth, 'documentElement.scrollWidth must not exceed the viewport').toBeLessThanOrEqual(r.vw)
      expect(r.overflowCount, `overflowing elements: ${r.overflowing.join(', ')}`).toBe(0)

      // 2. The CTA stays inside the viewport.
      expect(r.ctaRight).toBeLessThanOrEqual(r.vw)
      expect(r.ctaLeft).toBeGreaterThanOrEqual(0)

      // 3. The label is constrained (and truncates only because it must).
      expect(r.labelTruncated).toBe(true)
      expect(r.labelClientWidth).toBeLessThan(r.labelScrollWidth)

      // 4. The CTA remains visible and tappable.
      expect(r.ctaWidth).toBeGreaterThan(0)
      expect(r.ctaHeight).toBeGreaterThanOrEqual(32)

      // 5. Header elements do not overlap. In RTL the brand sits to the RIGHT of
      //    the nav, so the non-overlap check is direction-aware.
      expect(r.brandLeft).toBeGreaterThanOrEqual(r.ctaRight - 1)

      // 6. Direction is correct for Arabic.
      expect(r.lang).toBe('ar')
      expect(r.dir).toBe('rtl')

      // 7. The booking destination is unchanged.
      expect(r.bookingHref).toBe(`/ar/tenants/${SLUG}/book`)
    })

    test(`EN @${width}: max-length CTA does not overflow the viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/en/tenants/${SLUG}`, { waitUntil: 'networkidle' })
      await page.waitForSelector('main h1')

      const r = await measureWithLongCta(page, MAX_CTA_EN)

      expect(r.scrollWidth, 'documentElement.scrollWidth must not exceed the viewport').toBeLessThanOrEqual(r.vw)
      expect(r.overflowCount, `overflowing elements: ${r.overflowing.join(', ')}`).toBe(0)

      expect(r.ctaRight).toBeLessThanOrEqual(r.vw)
      expect(r.ctaLeft).toBeGreaterThanOrEqual(0)

      expect(r.labelTruncated).toBe(true)
      expect(r.labelClientWidth).toBeLessThan(r.labelScrollWidth)

      expect(r.ctaWidth).toBeGreaterThan(0)
      expect(r.ctaHeight).toBeGreaterThanOrEqual(32)

      // 5. Header elements do not overlap. In LTR the brand sits to the LEFT of
      //    the nav, so the non-overlap check is direction-aware.
      expect(r.brandRight).toBeLessThanOrEqual(r.ctaLeft + 1)

      expect(r.lang).toBe('en')
      expect(r.dir).toBe('ltr')

      expect(r.bookingHref).toBe(`/en/tenants/${SLUG}/book`)
    })
  }

  test('nav is shrinkable (guards the removed shrink-0)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await page.goto(`/en/tenants/${SLUG}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('main h1')
    const r = await measureWithLongCta(page, MAX_CTA_EN)
    // flex-shrink must not be 0 on the nav, or the CTA can never be constrained.
    expect(Number(r.navFlexShrink)).toBeGreaterThan(0)
  })

  test('the CTA is clickable and navigates to the booking page', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await page.goto(`/ar/tenants/${SLUG}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('main h1')

    const cta = page.locator('header nav a[href*="/book"]')
    await expect(cta).toBeVisible()
    await cta.click()
    await expect(page).toHaveURL(new RegExp(`/ar/tenants/${SLUG}/book`))
  })
})
