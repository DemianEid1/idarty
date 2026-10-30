import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Dashboard page branch-parity probe.
//
// Pin the branch logic that the GitHub diff said was touched, plus the helper
// that consumes it, so the parity notice on GitHub does not silently drift.
// ---------------------------------------------------------------------------

const read = (p: string) => {
  const base = process.env.VITEST_WORKSPACE_ROOT ?? process.cwd()
  const resolved = resolve(base, p)
  return readFileSync(resolved, 'utf8').replace(/\r\n/g, '\n')
}

const dashboard = read(
  'app/[locale]/tenants/[slug]/dashboard/page.tsx',
)
const branchLocations = read('lib/branch-locations.ts')

describe('dashboard branch probe', () => {
  it('resolves branch locations with a locale-aware helper', () => {
    expect(branchLocations).toContain('resolveBranchLocations(')
    expect(branchLocations).toContain('preferredFirst')
    expect(branchLocations).toContain('values[locale]')
    expect(branchLocations).toContain('values[locale === \'ar\' ? \'en\' : \'ar\']')
  })

  it('keeps the active branches query ordered so the default branch is first', () => {
    expect(dashboard).toContain('.orderBy(desc(branches.isDefault), asc(branches.sortOrder)')
    expect(dashboard).toContain('b.name || b.fallbackName || (rtl ? \'فرع\' : \'Branch\')')
    expect(dashboard).toContain('isDefault: b.isDefault')
  })
})
