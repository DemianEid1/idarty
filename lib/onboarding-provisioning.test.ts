import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Workspace onboarding contract.
//
// `createTenant` needs a database and the form needs a browser, so neither can
// run here. These assertions pin the parts that would otherwise regress
// silently: a new workspace MUST get a primary branch, the sample service MUST be
// available at it, working hours MUST be optional and MUST be written in the
// shape the booking engine reads, and the Getting Started checklist MUST reflect
// real setup rather than placeholders.
// ---------------------------------------------------------------------------

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8').replace(/\r\n/g, '\n')

const action = read('../app/[locale]/onboarding/actions.ts')
const provision = read('../lib/provision-workspace.ts')
const form = read('../components/onboarding-form.tsx')
const dashboard = read('../app/[locale]/tenants/[slug]/dashboard/page.tsx')

describe('provisioning creates a usable workspace', () => {
  it('creates the primary branch inside the same transaction', () => {
    expect(provision).toContain('insert(branches)')
    expect(provision).toContain('isDefault: true')
    expect(provision).toContain('isActive: true')
  })

  it('localises the branch name for both locales', () => {
    expect(provision).toContain('insert(branchTranslations)')
    expect(provision).toMatch(/\(\[.ar., .en.\] as const\)\.map\(\(locale\) => \(\{\s*tenantId: createdTenant\.id,\s*branchId: primaryBranch\.id/)
  })

  it('makes the sample service available at the primary branch', () => {
    expect(provision).toContain('insert(branchServices)')
    expect(provision).toMatch(/serviceId: defaultService\.id,\s*isAvailable: true/)
  })

  it('assigns the owner to the primary branch without per-person hours', () => {
    expect(provision).toContain('insert(staffBranches)')
    expect(provision).toContain('isPrimary: true')
  })

  it('keeps the address on the tenant translation the public site reads', () => {
    expect(provision).toMatch(/address: input\.branchAddress,/)
    expect(provision).toContain('tagline: input.tagline,')
  })

  it('never invents a tagline from the business type', () => {
    expect(provision).not.toContain('businessTypeLabel(')
    expect(action).not.toContain('businessTypeLabel(')
  })

  it('replays an existing submission as the same workspace', () => {
    expect(provision).toContain('if (existing.length) return { ...existing[0], branchId: null }')
  })
})

describe('working hours are optional and correctly shaped', () => {
  it('writes hours only when the user configured them', () => {
    expect(action).toContain("if (input.hoursConfigured === 'true')")
    expect(provision).toContain('if (input.schedule)')
    expect(provision).toMatch(/insert\(workingHours\)/)
  })

  it('stores business hours as branch-scoped, tenant-level rows', () => {
    // getAvailableSlots reads `staff_id IS NULL`; attaching hours to the sample
    // staff row is exactly the bug that produced zero bookable slots.
    const insert = provision.slice(provision.indexOf('insert(workingHours)'))
    expect(insert).toContain('staffId: null')
    expect(insert).toContain('branchId: primaryBranch.id')
    expect(insert).toContain('isSample: false')
  })

  it('rejects an invalid or fully closed schedule instead of silently skipping', () => {
    expect(action).toContain("return failure('INVALID_HOURS')")
    expect(action).toContain('countOpenDays(schedule) === 0')
  })
})

describe('logo upload is validated', () => {
  it('checks the payload server-side against the advertised limit', () => {
    expect(action).toContain('validateImageBase64(input.logoBase64, MAX_LOGO_IMAGE_SIZE)')
    expect(action).toContain("return failure('INVALID_LOGO')")
  })

  it('rejects oversized or unsupported files before reading them on the client', () => {
    expect(form).toContain('SUPPORTED_IMAGE_MIME_TYPES as readonly string[]')
    expect(form).toContain('file.size > MAX_LOGO_IMAGE_SIZE')
  })

  it('no longer accepts SVG', () => {
    expect(form).not.toContain('image/svg+xml')
  })
})

describe('onboarding form structure', () => {
  it('is four steps and offers no sixth navigation slot', () => {
    expect(form).toContain('Math.min(4, current + 1)')
    expect(form).toContain('{[1, 2, 3, 4].map(')
  })

  it('offers an explicit skip for working hours', () => {
    expect(form).toContain('function skipHours()')
    expect(form).toContain("name=\"hoursConfigured\"")
  })

  it('submits the schedule and regional settings with the form', () => {
    expect(form).toContain('name="hours"')
    expect(form).toContain('name="country"')
    expect(form).toContain('name="timezone"')
    expect(form).toContain('name="branchName"')
    expect(form).toContain('name="branchAddress"')
    expect(form).toContain('name="branchPhone"')
    expect(form).toContain('name="tagline"')
  })

  it('warns that the workspace URL is permanent', () => {
    expect(form).toContain('This URL cannot be changed after the workspace is created.')
  })
})

describe('Getting Started checklist reflects real data', () => {
  it('never hardcodes a completed step', () => {
    expect(dashboard).not.toContain('done: true,')
  })

  it('ignores sample records created by onboarding', () => {
    expect(dashboard).toContain('serviceRows.filter((service) => !service.isSample)')
    expect(dashboard).toContain('staffRows.filter((member) => !member.isSample)')
    expect(dashboard).toContain('isSample: services.isSample')
    expect(dashboard).toContain('isSample: staff.isSample')
  })

  it('links each step at the tab that owns it', () => {
    expect(dashboard).toContain('href: \'?tab=services\'')
    expect(dashboard).toContain('href: \'?tab=team\'')
    expect(dashboard).toContain('href: \'?tab=schedule\'')
    expect(dashboard).toContain('href: \'?tab=branches\'')
  })

  it('derives the location step from a stored branch address', () => {
    expect(dashboard).toContain('const hasBranchAddress = (branchAddressCount[0]?.value ?? 0) > 0')
    expect(dashboard).toContain('branchTranslations.address')
  })
})
