import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Dashboard sidebar scrolling contract.
//
// SOURCE-level assertions pinning the structural decisions that make the
// desktop sidebar stationary, independently scrollable, and non-overlapping.
// The rendered geometry (sidebar stationary across a long scroll, nav scrolls
// alone, brand + admin link reachable at short viewport heights, no document
// overflow, RTL/LTR side) was verified in a real browser; see the report. These
// assertions exist so a later edit cannot silently drop `min-h-0`, un-pin the
// sidebar, or introduce a manual offset that would double up with the flex
// sibling layout.
// ---------------------------------------------------------------------------

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8').replace(/\r\n/g, '\n')

// The shell (sidebar + header) now lives in the persistent layout, so these
// assertions read it there. The page renders only the active tab's content.
const shell = read('../app/[locale]/tenants/[slug]/dashboard/layout.tsx')
const mobileNav = read('../components/dashboard-mobile-nav.tsx')

const aside = shell.slice(shell.indexOf('<aside'), shell.indexOf('</aside>'))

describe('1. the desktop sidebar is stationary while content scrolls', () => {
  it('is pinned to the viewport with sticky + h-screen at lg', () => {
    expect(aside).toContain('lg:sticky')
    expect(aside).toContain('lg:top-0')
    expect(aside).toContain('lg:h-screen')
  })

  it('is a flex column so one child can absorb overflow', () => {
    expect(aside).toContain('lg:flex')
    expect(aside).toContain('lg:flex-col')
  })

  it('is never `fixed`, which would remove it from flow and need a manual offset', () => {
    expect(aside).not.toContain('fixed')
  })
})

describe('2. the nav scrolls independently; branding and bottom item stay put', () => {
  it('the nav is the ONLY scrolling region', () => {
    const scrolling = aside.match(/overflow-y-auto/g) ?? []
    expect(scrolling.length).toBe(1)
    expect(aside).toContain('overflow-y-auto')
  })

  it('the nav carries min-h-0 so overflow-y-auto can actually engage', () => {
    // Without `min-h-0` a flex child defaults to `min-height: auto` and refuses
    // to shrink below its content, so the list would overflow the sidebar
    // instead of scrolling inside it.
    const navTag = aside.slice(aside.indexOf('<nav'), aside.indexOf('>', aside.indexOf('<nav')) + 1)
    expect(navTag).toContain('min-h-0')
    expect(navTag).toContain('flex-1')
    expect(navTag).toContain('overflow-y-auto')
  })

  it('the brand block is shrink-0 and outside the scrolling nav', () => {
    expect(aside).toContain('<div className="shrink-0 p-5">')
    // The logo lives in that fixed block, not inside <nav>.
    const nav = aside.slice(aside.indexOf('<nav'), aside.indexOf('</nav>'))
    expect(nav).not.toContain('<Logo')
    expect(aside.indexOf('<Logo')).toBeLessThan(aside.indexOf('<nav'))
  })

  it('the admin/bottom item is shrink-0 so it is never scrolled away', () => {
    expect(aside).toContain('className="shrink-0 border-t border-border p-5"')
    // It sits after the nav, as the bottom item.
    expect(aside.indexOf('</nav>')).toBeLessThan(aside.indexOf('border-t border-border p-5'))
  })

  it('does not hide the branding or bottom item to make room', () => {
    expect(aside).not.toContain('hidden lg:hidden')
    // The nav is not clipped with a fixed max-height hack.
    expect(aside).not.toMatch(/max-h-\[\d+px\]/)
  })
})

describe('3. content is offset correctly, with no overlap or double scroll', () => {
  it('relies on the flex sibling layout rather than a manual offset', () => {
    // The sidebar and content are siblings in a flex row, so the content is
    // offset by the sidebar's width automatically.
    expect(shell).toContain('flex min-h-screen w-full')
    // No manual padding that would double up with the flex offset.
    expect(shell).not.toContain('lg:pl-64')
    expect(shell).not.toContain('lg:pr-64')
    expect(shell).not.toContain('lg:ml-64')
    expect(shell).not.toContain('lg:mr-64')
  })

  it('the sidebar width is fixed at lg only and cannot be squashed', () => {
    expect(aside).toContain('w-64')
    expect(aside).toContain('shrink-0')
  })

  it('the content column can shrink and never causes horizontal overflow', () => {
    expect(shell).toContain('min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-6')
  })

  it('does not introduce a second scroll container on the content column', () => {
    const section = shell.slice(
      shell.indexOf('<section className="min-w-0 flex-1'),
      shell.indexOf('</section>')
    )
    expect(section).not.toContain('overflow-y-scroll')
    expect(section).not.toContain('h-screen')
  })
})

describe('4. RTL / LTR placement is preserved', () => {
  it('uses a logical border side so the divider follows the writing direction', () => {
    // `border-e` is the inline-end edge: right edge in LTR, left edge in RTL.
    expect(aside).toContain('border-e')
    expect(aside).not.toContain('border-r ')
    expect(aside).not.toContain('border-l ')
  })

  it('is the first flex child, so it lands at the start of the row', () => {
    // In a flex row inside a dir=rtl container the first child is on the right.
    const main = shell.slice(shell.indexOf('<main dir='), shell.indexOf('</main>'))
    expect(main.indexOf('<aside')).toBeLessThan(main.indexOf('<section'))
  })

  it('the root sets dir from the locale', () => {
    expect(shell).toContain("dir={rtl ? 'rtl' : 'ltr'}")
  })

  it('does not use physical left/right positioning utilities on the sidebar', () => {
    expect(aside).not.toMatch(/\bleft-\d/)
    expect(aside).not.toMatch(/\bright-\d/)
  })
})

describe('5. the mobile drawer is untouched', () => {
  it('the sidebar stays hidden below lg', () => {
    expect(aside).toContain('hidden')
    expect(aside).toContain('lg:sticky')
    // The `hidden` is only lifted at lg.
    expect(aside).not.toMatch(/(?<![-\\w])block\b/)
  })

  it('the drawer still opens from the logical start edge in both directions', () => {
    expect(mobileNav).toContain('start-0')
    expect(mobileNav).toContain('lg:hidden')
  })

  it('the drawer keeps its modal behaviour', () => {
    expect(mobileNav).toContain('aria-modal="true"')
    expect(mobileNav).toContain('role="dialog"')
    expect(mobileNav).toContain("document.body.style.overflow = 'hidden'")
    expect(mobileNav).toContain("event.key === 'Escape'")
  })

  it('the drawer nav has its own scroll region', () => {
    expect(mobileNav).toContain('flex-1 space-y-1 overflow-y-auto')
  })
})

describe('6. no regression to the nav items themselves', () => {
  it('still renders every nav item from the shared array', () => {
    expect(shell).toContain('{nav.map((item) => (')
    // The icon+label markup moved into the sidebar link component.
    expect(read('../components/dashboard-sidebar-link.tsx')).toContain('{item.icon}')
  })

  it('keeps the active-item treatment and the admin link', () => {
    expect(read('../components/dashboard-sidebar-link.tsx')).toContain("isActive ? 'bg-brand-teal font-semibold text-white shadow-sm'")
    expect(aside).toContain('{isAdmin && (')
    expect(aside).toContain('{adminLabel}')
  })

  it('keeps the logo and its accessible label', () => {
    expect(aside).toContain('<Logo locale={typedLocale} height={26} />')
    expect(aside).toContain("aria-label={rtl ? 'إدارتي' : 'Idarty'}")
  })
})
