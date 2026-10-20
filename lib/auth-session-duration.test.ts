import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Tests for session duration configuration.
 * Verifies that the auth provider is configured with a 30-day session lifetime
 * and 24-hour update age, matching the desired behavior.
 */

vi.mock('better-auth', () => ({
  betterAuth: (config: any) => ({
    api: { getSession: vi.fn() },
    $Infer: { Session: {} },
    hooks: config.hooks,
    _config: config,
  }),
}))

vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: () => ({}),
}))

vi.mock('@/lib/db', () => ({
  db: {},
}))

vi.mock('@/lib/email/send', () => ({
  sendTransactionalEmail: vi.fn(),
}))

vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(async () => {}),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 9, resetAt: new Date() })),
}))

describe('session duration configuration', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  it('configures session expiresIn to 30 days (2592000 seconds)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('BETTER_AUTH_URL', 'https://test.example.com')

    const { auth } = await import('./auth')
    const sessionConfig = (auth as any)._config.session

    expect(sessionConfig).toBeDefined()
    expect(sessionConfig.expiresIn).toBe(3600 * 24 * 30)
  })

  it('configures session updateAge to 24 hours (86400 seconds)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('BETTER_AUTH_URL', 'https://test.example.com')

    const { auth } = await import('./auth')
    const sessionConfig = (auth as any)._config.session

    expect(sessionConfig).toBeDefined()
    expect(sessionConfig.updateAge).toBe(3600 * 24)
  })

  it('uses the same session config in development and production', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('BETTER_AUTH_URL', 'https://test.example.com')

    const { auth: devAuth } = await import('./auth')
    const devConfig = (devAuth as any)._config.session

    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('BETTER_AUTH_URL', 'https://test.example.com')

    const { auth: prodAuth } = await import('./auth')
    const prodConfig = (prodAuth as any)._config.session

    expect(devConfig.expiresIn).toBe(prodConfig.expiresIn)
    expect(devConfig.updateAge).toBe(prodConfig.updateAge)
  })

  it('does not set a custom inactivity timeout or forced sign-out', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('BETTER_AUTH_URL', 'https://test.example.com')

    const { auth } = await import('./auth')
    const sessionConfig = (auth as any)._config.session

    // No inactivity timeout — session lifetime is absolute, not idle-based
    expect(sessionConfig).not.toHaveProperty('inactivityTimeout')
    expect(sessionConfig).not.toHaveProperty('idleTimeout')
    expect(sessionConfig).not.toHaveProperty('forceSignOut')
  })
})
