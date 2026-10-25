import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    // `e2e/**` and `e2e-responsive/**` hold Playwright specs (they import
    // @playwright/test, not vitest) and are run by Playwright, not vitest.
    exclude: ['node_modules/**', 'e2e/**', 'e2e-responsive/**'],
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
  },
})
