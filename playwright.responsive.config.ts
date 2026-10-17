import { defineConfig, devices } from '@playwright/test'

/**
 * Isolated Playwright config for PUBLIC tenant website layout tests.
 *
 * Why a separate config:
 *  - `playwright.config.ts` requires E2E_DATABASE_URL (asserted by
 *    lib/database-test-guard) and boots its own server with that DB. These
 *    public-page layout tests need no database writes and no auth, so coupling
 *    them to the E2E DB would be unnecessary and destructive-adjacent.
 *  - `testDir` is `./e2e-responsive`, so the main `pnpm run e2e` (testDir
 *    `./e2e`) does NOT pick these up and cannot be broken by them.
 *
 * The server is started and torn down by Playwright's webServer on an isolated
 * port, so no process is left behind and no pre-existing listener is touched.
 *
 * Two constraints shape this config:
 *  1. `next dev` reads its port from the PORT env var. Passing it as an argument
 *     (`pnpm run dev -- -p N`) does NOT work — pnpm forwards `-- -p N` and Next
 *     treats `-p` as a project directory.
 *  2. Next.js allows only ONE dev server per project directory (a lockfile
 *     guard), regardless of port. So if a dev server is already running,
 *     Playwright must reuse it rather than try to start a second one.
 *
 * Hence `reuseExistingServer: true` (Playwright's standard local behaviour):
 * the suite attaches to a running server when there is one, and starts its own
 * otherwise. These specs are read-only (navigate + measure), so attaching to an
 * already-running dev server is safe.
 *
 * Run:  pnpm exec playwright test --config=playwright.responsive.config.ts
 * Override the port with RESPONSIVE_PORT=<n>.
 * Override the tenant with RESPONSIVE_TENANT_SLUG=<slug>.
 *
 * Portability: the specs default to `nile-wellness`, which `pnpm run db:seed`
 * creates idempotently, so the suite works in a clean checkout without the
 * manually-created tenants that only exist in one local database.
 */
const PORT = Number(process.env.RESPONSIVE_PORT ?? 3000)

export default defineConfig({
  testDir: './e2e-responsive',
  // Generated artifacts (traces, error contexts) go to a dedicated gitignored
  // directory. Playwright WIPES its outputDir at the start of every run, so
  // pointing it at `test-results/` would destroy pre-existing files there.
  outputDir: '.playwright-output',
  fullyParallel: false,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium-ar', use: { ...devices['Desktop Chrome'], locale: 'ar' } },
    { name: 'chromium-en', use: { ...devices['Desktop Chrome'], locale: 'en-US' } },
  ],
  webServer: {
    // `next dev` reads the port from the PORT env var. Passing it as an
    // argument (`pnpm run dev -- -p N`) does NOT work: pnpm forwards it as
    // `next dev -- -p N`, and Next treats `-p` as a project directory and fails
    // with "Invalid project directory provided, no such directory: .../-p".
    command: `pnpm run dev`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
    },
  },
})
