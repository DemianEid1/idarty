import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Responsive-layout contract for the dashboard and website editor.
//
// These are SOURCE-level assertions. They pin the structural decisions that
// prevent horizontal overflow and clipping on narrow viewports. The actual
// rendered geometry (no document overflow, contained long text, drawer side and
// behaviour) was verified in a real browser at 320–1440px in both locales; see
// the report. Source assertions here exist so a later edit cannot silently
// reintroduce a non-wrapping row or a fixed-width container.
// ---------------------------------------------------------------------------

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8')

const dashboard = read('../app/[locale]/tenants/[slug]/dashboard/page.tsx')
const editor = read('../components/website-editor.tsx')
const staffServices = read('../components/staff-services-form.tsx')

describe('no horizontal overflow: flex rows wrap and shrink', () => {
  it('the dashboard header stacks on mobile and only becomes a row at sm', () => {
    expect(dashboard).toContain('flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between')
  })

  it('the header meta group wraps', () => {
    expect(dashboard).toContain('flex flex-wrap items-center gap-2 sm:justify-end sm:gap-3')
  })

  it('list rows that pair content with actions wrap', () => {
    // team, services, customers, date-overrides, bookings
    const wrappingRows = dashboard.match(/flex flex-wrap items-(start|center) justify-between/g) ?? []
    expect(wrappingRows.length).toBeGreaterThanOrEqual(5)
  })

  it('text columns use min-w-0 so they can shrink below content width', () => {
    const minW0 = dashboard.match(/min-w-0 flex-1/g) ?? []
    expect(minW0.length).toBeGreaterThanOrEqual(4)
  })

  it('action clusters are shrink-0 so buttons never squash', () => {
    expect(dashboard).toContain('flex shrink-0 items-center gap-3')
  })

  it('never uses overflow-x hidden to mask the problem', () => {
    expect(dashboard).not.toContain('overflow-x-hidden')
    expect(editor).not.toContain('overflow-x-hidden')
    // The only overflow-hidden is the rounded progress bar (clips its fill);
    // it is never used to hide overflowing content.
    const ovf = dashboard.match(/overflow-hidden/g) ?? []
    expect(ovf.length).toBe(1)
    expect(dashboard).toContain('overflow-hidden rounded-full bg-[#f0f2f5]')
  })
})

describe('long unbroken text is contained', () => {
  it('user-entered names/emails use wrap-anywhere, not truncation', () => {
    expect(dashboard).toContain('font-semibold wrap-anywhere')
    expect(dashboard).toContain('text-xs text-ink-muted wrap-anywhere')
    // Nothing is hidden with truncate on the data rows.
    expect(dashboard).not.toMatch(/wrap-anywhere[^"]*truncate/)
  })

  it('the staff-services chips wrap their long labels', () => {
    expect(staffServices).toContain('min-w-0 max-w-full items-center')
    expect(staffServices).toContain('<span className="min-w-0 wrap-anywhere">')
    expect(staffServices).toContain('className="shrink-0"')
  })

  it('the editor section-management rows wrap and contain their labels', () => {
    expect(editor).toContain('flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4')
    expect(editor).toContain('text-sm font-semibold wrap-anywhere')
    expect(editor).toContain('flex shrink-0 items-center gap-3')
  })
})

describe('website editor action bar fits on mobile', () => {
  it('uses a 2-column grid on mobile and a wrapping row from sm up', () => {
    expect(editor).toContain('grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end')
  })

  it('keeps every action button', () => {
    for (const label of ['Live website', 'Preview draft', 'Save draft', 'Discard', 'Publish']) {
      expect(editor).toContain(label)
    }
  })

  it('centres button labels in the grid cells', () => {
    const centred = editor.match(/text-center text-sm font-semibold/g) ?? []
    expect(centred.length).toBeGreaterThanOrEqual(5)
  })

  it('does not clip button labels with truncate or a fixed width', () => {
    expect(editor).not.toContain('truncate')
    expect(editor).not.toMatch(/w-\[\d+px\]/)
  })
})

describe('mobile card padding is consistent and fluid', () => {
  it('dashboard cards use p-5 then sm:p-6', () => {
    const cards = dashboard.match(/bg-paper p-5 shadow-float sm:p-6/g) ?? []
    expect(cards.length).toBeGreaterThanOrEqual(7)
  })

  it('editor cards use p-5 then sm:p-6', () => {
    const cards = editor.match(/bg-paper p-5 shadow-float sm:p-6/g) ?? []
    expect(cards.length).toBeGreaterThanOrEqual(3)
  })

  it('the outer section uses fluid padding, not a fixed p-4', () => {
    expect(dashboard).toContain('min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:p-10')
  })
})

describe('no element is hidden to make the layout fit', () => {
  it('the team edit/archive/services controls all remain rendered', () => {
    expect(dashboard).toContain('<StaffEditForm')
    expect(dashboard).toContain('<StaffArchiveButton')
    expect(dashboard).toContain('<StaffServicesForm')
  })

  it('does not use display:none style utilities on data rows', () => {
    // The ONLY standalone `hidden` class is the desktop sidebar (hidden ...
    // lg:block). `aria-hidden` is accessibility metadata and `overflow-hidden`
    // is the rounded progress bar — neither is layout hiding.
    const layoutHidden = (dashboard.match(/(?<![-\w])hidden\b/g) ?? [])
    expect(layoutHidden.length).toBe(1)
    expect(dashboard).toContain('hidden w-64 border-e border-border bg-paper p-5 lg:block')
  })
})
