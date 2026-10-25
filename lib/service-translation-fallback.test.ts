import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')

describe('service translation fallback and multi-locale support', () => {
  it('has applied the migration to backfill missing translations', () => {
    expect(existsSync(resolve(process.cwd(), 'db/migrations/0008_service_translation_fallback.sql'))).toBe(true)
    const migration = read('db/migrations/0008_service_translation_fallback.sql')
    expect(migration).toContain('service_translations')
    expect(migration).toContain('staff_translations')
    expect(migration).toContain("WHERE st.locale = 'ar'")
    expect(migration).toContain("WHERE st.locale = 'en'")
  })

  it('queries public tenant website with fallback translations', () => {
    const pageCode = read('app/[locale]/tenants/[slug]/page.tsx')
    expect(pageCode).toContain('fallbackServiceTranslations')
    expect(pageCode).toContain('fallbackName')
    expect(pageCode).toContain('s.name || s.fallbackName')
    expect(pageCode).toContain('s.description || s.fallbackDescription')
  })

  it('queries draft preview website with fallback translations', () => {
    const previewCode = read('app/[locale]/tenants/[slug]/preview/page.tsx')
    expect(previewCode).toContain('fallbackServiceTranslations')
    expect(previewCode).toContain('fallbackName')
    expect(previewCode).toContain('s.name || s.fallbackName')
    expect(previewCode).toContain('s.description || s.fallbackDescription')
  })

  it('queries public booking service cache with fallback translations and leftJoin', () => {
    const bookActions = read('app/[locale]/tenants/[slug]/book/actions.ts')
    expect(bookActions).toContain('fallbackTranslations')
    expect(bookActions).toContain('fallbackName')
    expect(bookActions).toContain('leftJoin')
    expect(bookActions).toContain('r.name || r.fallbackName')
  })

  it('dashboard queries services and staff with fallback translations', () => {
    const dashboardPage = read('app/[locale]/tenants/[slug]/dashboard/page.tsx')
    expect(dashboardPage).toContain('fallbackServiceTranslations')
    expect(dashboardPage).toContain('fallbackStaffTranslations')
    expect(dashboardPage).toContain('s.name || s.fallbackName')
    expect(dashboardPage).toContain('serviceName')
    // fallbackStaffTranslations remains for the team-management section, not for
    // booking items.
    expect(dashboardPage).toContain('name: staffTranslations.name')
  })

  it('creates services with entries for both ar and en and invalidates both locales', () => {
    const actions = read('app/[locale]/tenants/[slug]/dashboard/actions.ts')
    expect(actions).toContain("(['ar', 'en'] as const).map")
    expect(actions).toContain('tenant-public-${input.slug}-ar')
    expect(actions).toContain('tenant-public-${input.slug}-en')
    expect(actions).toContain('tenant-services-${input.slug}-ar')
    expect(actions).toContain('tenant-services-${input.slug}-en')
  })

  it('updates services with onConflictDoUpdate so missing locale rows are inserted', () => {
    const actions = read('app/[locale]/tenants/[slug]/dashboard/actions.ts')
    expect(actions).toContain('onConflictDoUpdate')
    expect(actions).toContain('[serviceTranslations.serviceId, serviceTranslations.locale]')
  })
})
