import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Structural guarantees for the public tenant route's metadata.
//
// These pin the properties that a pure unit test of the builder cannot: that the
// ROUTE wires metadata to published data only, reuses the cached loader, and
// emits nothing for unavailable tenants.
// ---------------------------------------------------------------------------

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')
const page = read('app/[locale]/tenants/[slug]/page.tsx')

describe('public tenant route metadata wiring', () => {
  it('exports generateMetadata', () => {
    expect(page).toContain('export async function generateMetadata')
  })

  it('reuses the same cached loader as the page body (no extra query path)', () => {
    const meta = page.slice(
      page.indexOf('export async function generateMetadata'),
      page.indexOf('export default async function TenantPage')
    )
    expect(meta).toContain('createTenantPublicCache(slug, locale)')
    // It must not reach for the database directly.
    expect(meta).not.toContain('db.query')
    expect(meta).not.toContain('db.select')
  })

  it('reads the PUBLISHED config, never the draft column', () => {
    const meta = page.slice(
      page.indexOf('export async function generateMetadata'),
      page.indexOf('export default async function TenantPage')
    )
    expect(meta).toContain('publishedConfig')
    expect(meta).not.toContain('.draft')
  })

  it('returns no metadata for an unknown tenant (notFound behaviour preserved)', () => {
    const meta = page.slice(
      page.indexOf('export async function generateMetadata'),
      page.indexOf('export default async function TenantPage')
    )
    expect(meta).toContain('if (!data) return {}')
  })

  it('returns no metadata for a suspended tenant (visibility rule preserved)', () => {
    const meta = page.slice(
      page.indexOf('export async function generateMetadata'),
      page.indexOf('export default async function TenantPage')
    )
    expect(meta).toContain("if (tenant.status === 'suspended') return {}")
  })

  it('still calls notFound() in the page body for an unknown tenant', () => {
    expect(page).toContain('if (!data) notFound()')
  })

  it('does not build any URL from a request Host header', () => {
    expect(page).not.toContain('headers()')
    expect(page).not.toContain('host')
  })

  it('introduces no new metadata dependency', () => {
    expect(page).not.toContain("from 'next-seo'")
    expect(page).not.toContain('react-helmet')
  })
})

describe('site-url helper is side-effect free', () => {
  const helper = read('lib/site-url.ts')

  it('does not import the auth module (which throws without a prod URL)', () => {
    // Assert on the import graph, not on prose: the file's comments legitimately
    // explain why lib/auth.ts is avoided.
    const imports = helper.match(/^import .*$/gm) ?? []
    expect(imports.join('\n')).not.toContain("@/lib/auth")
    expect(helper).not.toContain("from 'better-auth'")
    expect(helper).not.toContain('drizzleAdapter')
  })

  it('does not import the database', () => {
    const imports = helper.match(/^import .*$/gm) ?? []
    expect(imports.join('\n')).not.toContain("@/lib/db")
  })

  it('never reads a Host header', () => {
    expect(helper).not.toContain('headers()')
  })
})
