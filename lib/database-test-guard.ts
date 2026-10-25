function endpointId(url: string | undefined) {
  if (!url) return null
  const host = new URL(url).hostname
  const match = host.match(/(ep-[a-z0-9-]+?)(?:-pooler)?(?:\.|$)/i)
  return match?.[1]?.replace(/-pooler$/, '') ?? null
}

function assertSafeTestUrl(url: string | undefined, env: Record<string, string | undefined>, variable: string) {
  if (!url) throw new Error(`${variable} is required`)
  if (url === env.DATABASE_URL || url === env.DATABASE_URL_UNPOOLED) throw new Error(`Refusing to use DATABASE_URL or DATABASE_URL_UNPOOLED for ${variable}`)
  const testId = endpointId(url)
  if (!testId) throw new Error(`${variable} must contain a Neon endpoint ID`)
  if (testId === endpointId(env.DATABASE_URL) || testId === endpointId(env.DATABASE_URL_UNPOOLED)) throw new Error(`${variable} endpoint matches the main database endpoint`)
  const parsed = new URL(url)
  if (!parsed.hostname.includes('eu-central-1')) throw new Error(`${variable} host must include eu-central-1`)
  // A pooled (PgBouncer) endpoint is NOT safe for the migration runner: it takes
  // a SESSION-scoped advisory lock (pg_advisory_lock) and holds it across several
  // BEGIN/COMMIT blocks (see scripts/migrate.ts). In transaction pooling mode
  // successive statements can be routed to different backends, so the lock is
  // not reliably held for the run and the matching pg_advisory_unlock may never
  // reach the backend that owns it. endpointId() strips the `-pooler` segment,
  // so the checks above cannot distinguish the two forms — the hostname must be
  // tested directly.
  if (/-pooler\./i.test(parsed.hostname)) {
    throw new Error(`${variable} must be a direct (unpooled) connection: host contains the Neon "-pooler" segment`)
  }
  return { url, host: parsed.hostname, endpointId: testId }
}

export function getDatabaseTestUrl(env: Record<string, string | undefined> = process.env) {
  return assertSafeTestUrl(env.MIGRATION_TEST_DATABASE_URL, env, 'MIGRATION_TEST_DATABASE_URL')
}

export function getE2EDatabaseUrl(env: Record<string, string | undefined> = process.env) {
  return assertSafeTestUrl(env.E2E_DATABASE_URL, env, 'E2E_DATABASE_URL')
}

/**
 * Resolves the connection the MIGRATION RUNNER should use when
 * `MIGRATION_TEST_MODE=true`.
 *
 * Why a second variable exists
 * ----------------------------
 * Applying schema migrations needs DDL rights (CREATE on `public`, and ownership
 * of the tables being altered), while running the integration suite does not and
 * should not have them. `MIGRATION_TEST_DATABASE_URL` is deliberately the
 * RESTRICTED application role, so it cannot migrate. `MIGRATION_TEST_MIGRATOR_URL`
 * carries a separate, elevated, migration-only role on the SAME isolated branch.
 *
 * Safety
 * ------
 * The elevated URL is put through the SAME `assertSafeTestUrl` checks as every
 * other test URL (non-empty, not a production URL, real Neon endpoint ID, not
 * the production endpoint, `eu-central-1`, direct/unpooled) — nothing is relaxed.
 * On top of that it must resolve to the SAME Neon endpoint ID as
 * `MIGRATION_TEST_DATABASE_URL`, which pins the elevated credential to the
 * already-verified isolated branch. That reference is required: without it the
 * pin cannot be evaluated, so we fail rather than skip the check.
 *
 * When `MIGRATION_TEST_MIGRATOR_URL` is unset the behaviour is exactly as before
 * (fall back to the restricted test URL), so this is backward compatible.
 */
export function getMigrationDatabaseUrl(env: Record<string, string | undefined> = process.env) {
  // Backward compatible: no elevated URL configured -> migrate exactly as before.
  if (!env.MIGRATION_TEST_MIGRATOR_URL) return getDatabaseTestUrl(env)

  const resolved = assertSafeTestUrl(
    env.MIGRATION_TEST_MIGRATOR_URL,
    env,
    'MIGRATION_TEST_MIGRATOR_URL'
  )

  // Pin the elevated credential to the branch the restricted URL already proved
  // isolated. A missing reference cannot be compared, so it is an error, not a
  // silent pass.
  const appTestEndpoint = endpointId(env.MIGRATION_TEST_DATABASE_URL)
  if (!appTestEndpoint) {
    throw new Error(
      'MIGRATION_TEST_MIGRATOR_URL requires MIGRATION_TEST_DATABASE_URL to be set as the isolation reference'
    )
  }
  if (resolved.endpointId !== appTestEndpoint) {
    throw new Error(
      'MIGRATION_TEST_MIGRATOR_URL must target the same Neon endpoint as MIGRATION_TEST_DATABASE_URL'
    )
  }

  return resolved
}
