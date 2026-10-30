import { describe, expect, it } from 'vitest'
import { TenantWebsite } from '@/components/tenant-website'
import { createDefaultWebsiteConfig } from './website-config'
import { resolveBranchLocations } from './branch-locations'

const rows = [
  {
    branchId: 'b1',
    isDefault: true,
    locale: 'ar',
    name: 'الفرع الرئيسي',
    address: 'شارع ١',
    googleMapsUrl: 'https://maps.app.goo.gl/abc',
  },
  {
    branchId: 'b1',
    isDefault: true,
    locale: 'en',
    name: 'Main branch',
    address: '1 Main St',
    googleMapsUrl: 'https://maps.app.goo.gl/abc',
  },
  { branchId: 'b2', isDefault: false, locale: 'ar', name: null, address: 'شارع ٢', googleMapsUrl: null },
  { branchId: 'b3', isDefault: false, locale: 'ar', name: 'بدون عنوان', address: '   ', googleMapsUrl: null },
]

describe('resolveBranchLocations', () => {
  it('collapses locales into one entry per branch, preferring the requested one', () => {
    const ar = resolveBranchLocations(rows, 'ar')
    expect(ar.map((b) => b.id)).toEqual(['b1', 'b2'])
    expect(ar[0]).toMatchObject({
      name: 'الفرع الرئيسي',
      address: 'شارع ١',
      isDefault: true,
      googleMapsUrl: 'https://maps.app.goo.gl/abc',
    })
    expect(ar[1]).toMatchObject({ name: null, address: 'شارع ٢' })
  })

  it('falls back to the other locale and drops branches with no address', () => {
    const en = resolveBranchLocations(rows, 'en')
    expect(en.map((b) => b.id)).toEqual(['b1', 'b2'])
    // b2 has no English row at all, so its Arabic address is used.
    expect(en[1]).toMatchObject({ name: null, address: 'شارع ٢' })
    expect(en.every((b) => b.address.trim() !== '')).toBe(true)
  })
})

const baseProps = {
  locale: 'ar' as const,
  slug: 'demo-salon',
  tenant: { currency: 'EGP', email: null, phoneE164: null, theme: null },
  translation: { name: 'صالون', tagline: null, description: null, address: null },
  serviceRows: [],
  hoursRows: [],
}

function collect(node: unknown, out: Array<{ props: any }> = [], depth = 0) {
  if (depth > 24 || node === null || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    node.forEach((child) => collect(child, out, depth + 1))
    return out
  }
  const el = node as { props?: any }
  if (el.props) {
    out.push({ props: el.props })
    collect(el.props.children, out, depth + 1)
  }
  return out
}

const branches = [
  {
    id: 'b1',
    name: 'الفرع الرئيسي',
    address: 'شارع ١',
    googleMapsUrl: 'https://maps.app.goo.gl/abc',
    isDefault: true,
  },
  { id: 'b2', name: 'فرع سموحة', address: 'شارع ٢', googleMapsUrl: null, isDefault: false },
]

describe('branch addresses section', () => {
  it('is hidden unless the website config enables it', () => {
    const els = collect(
      TenantWebsite({
        ...baseProps,
        branches,
        config: createDefaultWebsiteConfig(),
      })
    )
    expect(els.some((e) => e.props['data-testid'] === 'branch-locations')).toBe(false)
  })

  it('renders every branch address when enabled', () => {
    const config = createDefaultWebsiteConfig()
    const els = collect(
      TenantWebsite({
        ...baseProps,
        branches,
        config: { ...config, locations: { isEnabled: true } },
      })
    )
    expect(els.filter((e) => e.props['data-testid'] === 'branch-location-card')).toHaveLength(2)
    // Only the branch with a safe Maps URL gets a clickable map action.
    expect(els.filter((e) => e.props.href === 'https://maps.app.goo.gl/abc')).toHaveLength(1)
    // The decorative index numbers are gone.
    expect(els.some((e) => e.props.children === '01')).toBe(false)
  })
})
