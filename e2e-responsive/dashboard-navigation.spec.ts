import { test, expect } from '@playwright/test'

/**
 * Browser-level checks for the tenant dashboard's responsive navigation.
 *
 * These require an AUTHENTICATED dashboard session, which the public-page suite
 * does not have. The spec therefore skips itself unless a signed-in storage
 * state is provided via DASHBOARD_STORAGE_STATE, so it never creates or mutates
 * tenant data and never fails the suite for an environment limitation.
 *
 * SKIPPED BY DEFAULT — see the prerequisite note in the README/report. There is
 * no supported credential-free way to mint a session in this repo: every
 * `account` row is a real personal account with a hashed password, and
 * `pnpm run e2e:seed` (scripts/e2e-seed.ts) creates the tenant + membership but
 * no `account` row, so the seeded owner cannot be signed in with a password.
 * Generating a storage state therefore needs EITHER a local password for a
 * member of the target tenant, OR an E2E_DATABASE_URL pointing at an isolated
 * test database (lib/database-test-guard.ts refuses to reuse the main one).
 *
 * To run it locally:
 *   1. Sign in once and save the browser state:
 *        pnpm exec playwright open   # or a manual login + "Save storage state"
 *   2. DASHBOARD_STORAGE_STATE=path/to/state.json \
 *      DASHBOARD_TENANT_SLUG=<slug-the-signed-in-user-owns> \
 *      pnpm exec playwright test --config=playwright.responsive.config.ts dashboard-navigation
 */

const STORAGE = process.env.DASHBOARD_STORAGE_STATE
// Defaults to the seeded tenant. It MUST be a tenant the signed-in user is a
// member of, otherwise requireTenantAccess() redirects and every test fails.
const SLUG = process.env.DASHBOARD_TENANT_SLUG ?? 'nile-wellness'

test.describe('tenant dashboard responsive navigation', () => {
  test.skip(!STORAGE, 'Requires DASHBOARD_STORAGE_STATE (authenticated session)')

  test.use({ storageState: STORAGE })

  test('mobile: menu button opens a drawer with the nav items, and closes', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto(`/en/tenants/${SLUG}/dashboard`, { waitUntil: 'networkidle' })

    // The desktop sidebar is hidden at this width.
    await expect(page.locator('aside')).toBeHidden()

    const trigger = page.getByRole('button', { name: 'Open navigation menu' })
    await expect(trigger).toBeVisible()
    await trigger.click()

    const drawer = page.getByRole('dialog', { name: 'Navigation menu' })
    await expect(drawer).toBeVisible()

    // Nav items are present in the drawer.
    await expect(drawer.getByRole('link', { name: 'Overview' })).toBeVisible()
    await expect(drawer.getByRole('link', { name: 'Website' })).toBeVisible()

    // Escape closes it.
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
  })

  test('mobile: backdrop click closes the drawer', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto(`/en/tenants/${SLUG}/dashboard`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Open navigation menu' }).click()
    const drawer = page.getByRole('dialog', { name: 'Navigation menu' })
    await expect(drawer).toBeVisible()
    // Click the backdrop (outside the panel).
    await page.mouse.click(370, 400)
    await expect(drawer).toBeHidden()
  })

  test('mobile: no horizontal overflow at 320px with the drawer closed', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto(`/en/tenants/${SLUG}/dashboard`, { waitUntil: 'networkidle' })
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth)
  })

  test('desktop: the sidebar is visible and the menu button is hidden', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto(`/en/tenants/${SLUG}/dashboard`, { waitUntil: 'networkidle' })
    await expect(page.locator('aside')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open navigation menu' })).toBeHidden()
  })

  test('the heading shows the tenant display name, not the generic label', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto(`/en/tenants/${SLUG}/dashboard`, { waitUntil: 'networkidle' })
    const heading = page.locator('h1').first()
    await expect(heading).toBeVisible()
    await expect(heading).not.toHaveText(/^Workspace$/)
  })

  test('nav order matches the required sequence', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto(`/en/tenants/${SLUG}/dashboard`, { waitUntil: 'networkidle' })
    const labels = await page.locator('aside nav a').allTextContents()
    const order = labels.map((l) => l.trim())
    expect(order).toEqual(['Overview', 'Customers', 'Services', 'Team & Schedule', 'Website', 'Settings'])
  })
})
