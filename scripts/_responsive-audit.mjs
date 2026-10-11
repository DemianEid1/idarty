/**
 * Standalone responsive audit for the PUBLIC tenant website.
 *
 * Run:  node scripts/_responsive-audit.mjs [baseURL]
 *
 * Deliberately does NOT use playwright.config.ts (which requires E2E_DATABASE_URL)
 * and does NOT start a webServer — point it at an already-running dev server.
 * Read-only: it only navigates and measures.
 */
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:3000'
// Defaults to the tenant `pnpm run db:seed` creates idempotently, so the audit
// works in a clean checkout. Override: node scripts/_responsive-audit.mjs <base> <slug>
const SLUG = process.argv[3] ?? 'nile-wellness'
const OUT = process.argv[4] ?? null

const WIDTHS = [320, 360, 390, 430, 768, 1024, 1440]
const LOCALES = ['ar', 'en']

const measure = () => {
  const de = document.documentElement
  const vw = window.innerWidth
  const overflowing = []
  for (const el of document.querySelectorAll('main *')) {
    const r = el.getBoundingClientRect()
    if (r.width > vw + 1 || r.right > vw + 1 || r.left < -1) {
      overflowing.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').slice(0, 60),
        w: Math.round(r.width),
        left: Math.round(r.left),
        right: Math.round(r.right),
        text: (el.textContent || '').trim().slice(0, 30),
      })
    }
  }
  const q = (s) => document.querySelector(s)
  const rect = (s) => {
    const el = q(s)
    return el ? el.getBoundingClientRect() : null
  }
  const header = rect('header')
  const cta = rect('header nav a[href*="/book"]')
  const h1 = rect('main h1')
  const h1cs = q('main h1') ? getComputedStyle(q('main h1')) : null
  const row = rect('header > div')
  const brand = rect('header a')
  const cards = [...document.querySelectorAll('#services .grid > div')].map((c) => {
    const r = c.getBoundingClientRect()
    return { w: Math.round(r.width), right: Math.round(r.right) }
  })
  const grid = q('#services .grid')
  const gridcs = grid ? getComputedStyle(grid).gridTemplateColumns : null

  return {
    vw,
    scrollWidth: de.scrollWidth,
    overflowX: de.scrollWidth - vw,
    lang: de.lang,
    dir: de.dir,
    mainDir: q('main') ? q('main').getAttribute('dir') : null,
    headerH: header ? Math.round(header.height) : null,
    rowW: row ? Math.round(row.width) : null,
    rowRight: row ? Math.round(row.right) : null,
    brandW: brand ? Math.round(brand.width) : null,
    brandRight: brand ? Math.round(brand.right) : null,
    ctaVisible: cta ? cta.width > 0 && cta.height > 0 && cta.right <= vw + 1 && cta.left >= -1 : false,
    ctaW: cta ? Math.round(cta.width) : null,
    ctaH: cta ? Math.round(cta.height) : null,
    ctaRight: cta ? Math.round(cta.right) : null,
    h1W: h1 ? Math.round(h1.width) : null,
    h1Right: h1 ? Math.round(h1.right) : null,
    h1H: h1 ? Math.round(h1.height) : null,
    h1Font: h1cs ? h1cs.fontSize : null,
    h1OverflowWrap: h1cs ? h1cs.overflowWrap : null,
    gridCols: gridcs,
    cardCount: cards.length,
    cardMaxRight: cards.length ? Math.max(...cards.map((c) => c.right)) : null,
    cardMinW: cards.length ? Math.min(...cards.map((c) => c.w)) : null,
    langSwitchHref: (() => {
      const a = [...document.querySelectorAll('header a')].find((x) => /\/(en|ar)\/tenants\//.test(x.getAttribute('href') || ''))
      return a ? a.getAttribute('href') : null
    })(),
    overflowCount: overflowing.length,
    overflowing: overflowing.slice(0, 8),
  }
}

const run = async () => {
  const browser = await chromium.launch()
  const results = {}
  for (const locale of LOCALES) {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } })
      const page = await ctx.newPage()
      const url = `${BASE}/${locale}/tenants/${SLUG}`
      await page.goto(url, { waitUntil: 'networkidle' })
      await page.waitForSelector('main h1', { timeout: 15000 })
      const r = await page.evaluate(measure)
      results[`${locale}-${width}`] = r
      await ctx.close()
    }
  }
  await browser.close()

  const rows = Object.entries(results)
  console.log(
    ['case', 'vw', 'scrollW', 'ovX', 'lang', 'ctaOK', 'ctaWxH', 'ctaRight', 'h1W', 'grid', 'ovCnt'].join('\t')
  )
  for (const [k, r] of rows) {
    console.log(
      [
        k,
        r.vw,
        r.scrollWidth,
        r.overflowX,
        r.lang,
        r.ctaVisible,
        `${r.ctaW}x${r.ctaH}`,
        r.ctaRight,
        r.h1W,
        (r.gridCols || '').split(' ').length,
        r.overflowCount,
      ].join('\t')
    )
  }

  console.log('\n=== OVERFLOW DETAIL ===')
  let any = false
  for (const [k, r] of rows) {
    if (r.overflowCount) {
      any = true
      console.log(`\n${k} (${r.overflowCount}):`)
      for (const o of r.overflowing) {
        console.log(`  <${o.tag}> w=${o.w} L=${o.left} R=${o.right} | ${o.cls} | ${o.text}`)
      }
    }
  }
  if (!any) console.log('(none)')

  console.log('\n=== HEADER / CTA ===')
  for (const [k, r] of rows) {
    console.log(
      `${k}\theaderH=${r.headerH}\trowW=${r.rowW}\trowRight=${r.rowRight}\tbrandRight=${r.brandRight}\tctaRight=${r.ctaRight}\tctaOK=${r.ctaVisible}\tswitch=${r.langSwitchHref}`
    )
  }

  console.log('\n=== CARDS / GRID ===')
  for (const [k, r] of rows) {
    console.log(
      `${k}\tcols=${r.gridCols}\tcards=${r.cardCount}\tcardMinW=${r.cardMinW}\tcardMaxRight=${r.cardMaxRight}`
    )
  }

  if (OUT) {
    writeFileSync(OUT, JSON.stringify(results, null, 1))
    console.log(`\nsaved ${OUT}`)
  }
}

run().catch((e) => {
  console.error('AUDIT FAILED:', e)
  process.exit(1)
})
