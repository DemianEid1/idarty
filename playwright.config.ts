import dotenv from 'dotenv'
dotenv.config({ path: ['.env.local', '.env.development.local', '.env'] })
import { defineConfig, devices } from '@playwright/test'
import { getE2EDatabaseUrl } from './lib/database-test-guard'

const { url } = getE2EDatabaseUrl()
const PORT = process.env.PORT || 3001

export default defineConfig({
  testDir: './e2e',
  // Generated artifacts (traces, error contexts) go to a dedicated gitignored
  // directory. Playwright WIPES its outputDir at the start of every run, so
  // pointing it at `test-results/` would destroy pre-existing files there.
  outputDir: '.playwright-output',
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium-ar', use: { ...devices['Desktop Chrome'], locale: 'ar' } },
    { name: 'chromium-en', use: { ...devices['Desktop Chrome'], locale: 'en-US' } },
  ],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: url,
      DATABASE_URL_UNPOOLED: url,
    },
  },
})
