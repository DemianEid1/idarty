import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Website Builder accordion — typography, arrow and preview regressions.
 *
 * Source-level guards for the four issues fixed in this round. They pin the
 * CAUSE (the global button font-weight rule) and the contract, not incidental
 * markup, so a later edit cannot silently reintroduce any of them.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')

/** Source with comments stripped, so prose cannot satisfy a code assertion. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const accordion = read('components/accordion-section.tsx')
const accordionCode = stripComments(accordion)
const globals = read('app/globals.css')
const editor = read('components/website-editor.tsx')
const editorCode = stripComments(editor)

// ---------------------------------------------------------------------------
// 1. Bold-text regression
// ---------------------------------------------------------------------------

describe('section description keeps body weight inside the button header', () => {
  it('the global button rule that causes the inheritance is still in place', () => {
    // This is the ROOT CAUSE. If it is ever removed, the font-normal guards
    // below become redundant — but the assertion documents why they exist.
    expect(globals).toMatch(/button,\s*\[role="button"\]\s*\{[^}]*font-weight:\s*600/)
  })

  it('the description opts out of the inherited button weight', () => {
    // Without `font-normal` the description inherits the button's 600 and the
    // section subtitles render bold.
    const descLine = accordion
      .split('\n')
      .find((l) => l.includes('text-sm') && l.includes('text-ink-muted'))
    expect(descLine).toBeDefined()
    expect(descLine).toContain('font-normal')
  })

  it('the preview row also opts out of the inherited weight', () => {
    // The preview container carries `font-normal`; it sits inside the header
    // button, so without it the summary would inherit the 600 button weight.
    const previewEl = accordionCode.slice(accordionCode.indexOf('{!open && preview && ('))
    expect(previewEl.slice(0, 300)).toContain('font-normal')
  })

  it('does not weaken the heading itself', () => {
    // The fix is scoped: the section TITLE stays semibold.
    expect(accordion).toContain('text-lg font-semibold')
  })

  it('does not apply a global font-normal override', () => {
    // A global override would flatten every heading and label in the app.
    expect(globals).not.toMatch(/^\s*\*\s*\{[^}]*font-weight:\s*400/m)
    expect(accordion).not.toContain('* { font-weight')
  })
})

// ---------------------------------------------------------------------------
// 2. Arrow direction
// ---------------------------------------------------------------------------

describe('accordion arrow reflects the expanded state', () => {
  it('selects the chevron glyph instead of rotating one', () => {
    expect(accordion).toContain("import { ChevronDown, ChevronUp } from 'lucide-react'")
    expect(accordion).toMatch(/const Chevron = open \? ChevronUp : ChevronDown/)
  })

  it('has no CSS rotation that would need an RTL counter-rotation', () => {
    // The old implementation used `rotate-180` + `rtl:rotate-180` +
    // `rtl:rotate-0`, which left the arrow looking stuck in RTL. Assert on the
    // CODE (comments legitimately describe the removed approach).
    expect(accordionCode).not.toContain('rotate-180')
    expect(accordionCode).not.toContain('rtl:rotate')
  })

  it('keeps aria-expanded synchronized with the rendered state', () => {
    expect(accordion).toContain('aria-expanded={open}')
  })
})

// ---------------------------------------------------------------------------
// 3. Transition
// ---------------------------------------------------------------------------

describe('collapse transition', () => {
  it('animates the grid row intrinsically (no fixed max-height)', () => {
    expect(accordion).toContain('grid-rows-[1fr]')
    expect(accordion).toContain('grid-rows-[0fr]')
    expect(accordion).not.toContain('max-h-')
  })

  it('uses a restrained duration and easing', () => {
    expect(accordion).toContain('duration-200')
    expect(accordion).toContain('ease-out')
  })

  it('respects prefers-reduced-motion', () => {
    expect(accordion).toContain('motion-reduce:transition-none')
  })

  it('takes the collapsed panel out of the tab order and a11y tree', () => {
    // `inert` keeps children mounted (state preserved) while removing them from
    // keyboard navigation and screen-reader traversal.
    expect(accordion).toContain('inert={!open}')
    expect(accordion).toContain('aria-hidden={!open}')
  })

  it('never triggers a save/publish/discard/preview on toggle', () => {
    for (const fn of ['saveDraft', 'publishChanges', 'discardDraft', 'handlePreview']) {
      expect(accordion).not.toContain(fn)
    }
  })
})

// ---------------------------------------------------------------------------
// 4. Persistent previews
// ---------------------------------------------------------------------------

describe('collapsed-section previews', () => {
  it('renders the preview only while collapsed', () => {
    expect(accordion).toContain('{!open && preview && (')
  })

  it('wires a preview into every previewable section', () => {
    for (const key of ['identity', 'contact', 'social', 'cta', 'content', 'sections']) {
      expect(editor).toContain(`accordion('${key}'`)
    }
    // Every accordion call passes a preview as its 5th argument — the closing
    // `), (` that separates the body from the preview in each call.
    const previewArgs = editorCode.match(/^\s*\), \($/gm) ?? []
    expect(previewArgs.length).toBeGreaterThanOrEqual(6)
  })

  it('derives the identity preview from live state, not hardcoded text', () => {
    expect(editor).toContain('const previewPrimaryColor = config.theme.primaryColor')
    expect(editor).toContain('const previewBusinessName = (tenant.name ?? \'\').trim()')
    expect(editor).toContain('previewHeroImage = config.theme.heroImage')
  })

  it('never exposes hidden contact fields in the contact preview', () => {
    // The filter is the same visibility rule the public renderer uses: only
    // fields that are visible AND non-empty reach the preview.
    const block = editorCode.slice(
      editorCode.indexOf('const previewContactFields'),
      editorCode.indexOf('// Social: the platforms')
    )
    expect(block).toContain('field.isVisible && field.value.trim() !== \'\'')
    // Hidden fields are dropped, never rendered as an empty label.
    expect(block).not.toContain('field.isVisible ||')
  })

  it('shows an empty-state hint when nothing is configured', () => {
    expect(editor).toContain("'No visible contact details'")
    expect(editor).toContain("'No platforms enabled'")
  })

  it('does not persist preview state', () => {
    for (const fn of ['saveDraft', 'publishChanges', 'updateTheme(', 'updateCta(']) {
      const previewBlock = editor.slice(
        editor.indexOf('Collapsed-section previews'),
        editor.indexOf('// Check if all renderable sections are hidden')
      )
      expect(previewBlock).not.toContain(fn)
    }
  })
})
