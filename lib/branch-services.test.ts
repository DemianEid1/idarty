import { beforeEach, describe, expect, it, vi } from 'vitest'

const TENANT = '11111111-1111-4111-8111-111111111111'
const BRANCH = '22222222-2222-4222-8222-222222222222'
const SERVICE = '33333333-3333-4333-8333-333333333333'

let branchRow: { id: string } | undefined
let availabilityRow: { isAvailable: boolean } | undefined

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      branches: {
        findFirst: vi.fn(async () => branchRow),
      },
      branchServices: {
        findFirst: vi.fn(async () => availabilityRow),
      },
    },
  },
}))

describe('isServiceAvailableAtBranch', () => {
  beforeEach(() => {
    branchRow = { id: BRANCH }
    availabilityRow = undefined
  })

  it('rejects a branch that does not belong to the tenant or is inactive/archived', async () => {
    const { isServiceAvailableAtBranch } = await import('./branch-services')
    branchRow = undefined
    await expect(isServiceAvailableAtBranch(TENANT, BRANCH, SERVICE)).resolves.toBe(false)
  })

  it('treats a missing row as available (backward-compatible default)', async () => {
    const { isServiceAvailableAtBranch } = await import('./branch-services')
    await expect(isServiceAvailableAtBranch(TENANT, BRANCH, SERVICE)).resolves.toBe(true)
  })

  it('returns the stored decision', async () => {
    const { isServiceAvailableAtBranch } = await import('./branch-services')
    availabilityRow = { isAvailable: false }
    await expect(isServiceAvailableAtBranch(TENANT, BRANCH, SERVICE)).resolves.toBe(false)

    availabilityRow = { isAvailable: true }
    await expect(isServiceAvailableAtBranch(TENANT, BRANCH, SERVICE)).resolves.toBe(true)
  })
})
