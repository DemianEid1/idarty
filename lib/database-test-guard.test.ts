import { describe, expect, it } from 'vitest'
import { getDatabaseTestUrl, getE2EDatabaseUrl, getMigrationDatabaseUrl } from './database-test-guard'

const good = 'postgres://user:secret@ep-test.eu-central-1.aws.neon.tech/db'

describe('database test guards', () => {
  it('requires only the dedicated migration URL and prints a credential-free host', () => {
    expect(getDatabaseTestUrl({ MIGRATION_TEST_DATABASE_URL: good, DATABASE_URL: 'postgres://main@ep-main.eu-central-1.aws.neon.tech/db' })).toMatchObject({ url: good, host: 'ep-test.eu-central-1.aws.neon.tech', endpointId: 'ep-test' })
    expect(() => getDatabaseTestUrl({ DATABASE_URL: good })).toThrow('MIGRATION_TEST_DATABASE_URL is required')
    expect(() => getDatabaseTestUrl({ MIGRATION_TEST_DATABASE_URL: good, DATABASE_URL: good })).toThrow('Refusing')
    expect(() => getDatabaseTestUrl({ MIGRATION_TEST_DATABASE_URL: 'postgres://u:p@ep-test.us-east-1.aws.neon.tech/db' })).toThrow('eu-central-1')
  })

  it('rejects matching Neon endpoint IDs even when URLs differ', () => {
    expect(() => getDatabaseTestUrl({ MIGRATION_TEST_DATABASE_URL: 'postgres://test:pw@ep-copper.eu-central-1.aws.neon.tech/db', DATABASE_URL: 'postgres://main:pw@ep-copper-pooler.eu-central-1.aws.neon.tech/db' })).toThrow('endpoint matches')
  })

  it('applies the same strict guard to E2E', () => {
    expect(getE2EDatabaseUrl({ E2E_DATABASE_URL: good, DATABASE_URL_UNPOOLED: 'postgres://main@ep-main.eu-central-1.aws.neon.tech/db' }).host).toBe('ep-test.eu-central-1.aws.neon.tech')
    expect(() => getE2EDatabaseUrl({})).toThrow('E2E_DATABASE_URL is required')
    expect(() => getE2EDatabaseUrl({ E2E_DATABASE_URL: good, DATABASE_URL: good })).toThrow('Refusing')
    expect(() => getE2EDatabaseUrl({ E2E_DATABASE_URL: 'postgres://test:pw@ep-test.eu-central-1.aws.neon.tech/db', DATABASE_URL_UNPOOLED: 'postgres://main@ep-test-pooler.eu-central-1.aws.neon.tech/db' })).toThrow('endpoint matches')
    expect(() => getE2EDatabaseUrl({ E2E_DATABASE_URL: 'postgres://u:p@ep-test.ap-southeast-1.aws.neon.tech/db' })).toThrow('eu-central-1')
  })
})

// ---------------------------------------------------------------------------
// Pooled-connection rejection.
//
// scripts/migrate.ts takes a SESSION-scoped advisory lock (pg_advisory_lock) and
// holds it across several BEGIN/COMMIT blocks. Under PgBouncer transaction
// pooling, successive statements can be routed to different backends, so the
// lock is not reliably held and the matching pg_advisory_unlock may never reach
// the backend that owns it. endpointId() deliberately strips the `-pooler`
// segment (so the endpoint-identity checks still work), which means the pooled
// form must be rejected by inspecting the hostname directly.
//
// All hostnames here are fake; no real credentials appear in this file.
// ---------------------------------------------------------------------------
describe('pooled (PgBouncer) endpoints are rejected', () => {
  const prodDirect = 'postgres://main:***@ep-main.eu-central-1.aws.neon.tech/db'

  it('rejects a pooled migration test URL', () => {
    expect(() =>
      getDatabaseTestUrl({
        MIGRATION_TEST_DATABASE_URL: 'postgres://u:***@ep-test-pooler.eu-central-1.aws.neon.tech/db',
        DATABASE_URL: prodDirect,
      })
    ).toThrow(/-pooler/)
  })

  it('rejects a pooled E2E URL', () => {
    expect(() =>
      getE2EDatabaseUrl({
        E2E_DATABASE_URL: 'postgres://u:***@ep-test-pooler.eu-central-1.aws.neon.tech/db',
        DATABASE_URL: prodDirect,
      })
    ).toThrow(/-pooler/)
  })

  it('still accepts the DIRECT form of the same endpoint', () => {
    // The endpoint ID is identical; only the pooled form is rejected.
    expect(
      getDatabaseTestUrl({
        MIGRATION_TEST_DATABASE_URL: 'postgres://u:***@ep-test.eu-central-1.aws.neon.tech/db',
        DATABASE_URL: prodDirect,
      }).endpointId
    ).toBe('ep-test')
  })

  it('does not reject a hostname that merely contains "pool" elsewhere', () => {
    // Guards against an over-broad rule: only the exact `-pooler.` segment is
    // the Neon pooler marker.
    expect(
      getDatabaseTestUrl({
        MIGRATION_TEST_DATABASE_URL: 'postgres://u:***@ep-pool-test.eu-central-1.aws.neon.tech/db',
        DATABASE_URL: prodDirect,
      }).endpointId
    ).toBe('ep-pool-test')
  })
})

// ---------------------------------------------------------------------------
// Migration-runner connection resolution (getMigrationDatabaseUrl).
//
// Applying migrations needs DDL rights the restricted application role does not
// have, so a second, elevated URL may be supplied for the SAME isolated branch.
// These tests pin the contract: the elevated URL inherits EVERY existing check,
// is pinned to the restricted URL's endpoint, and changes nothing when unset.
//
// All hostnames/credentials here are fake placeholders.
// ---------------------------------------------------------------------------
describe('migration-runner connection resolution', () => {
  const prodPooled = 'postgres://main:***@ep-main-pooler.eu-central-1.aws.neon.tech/db'
  const prodDirect = 'postgres://main:***@ep-main.eu-central-1.aws.neon.tech/db'
  // The restricted application role on the isolated test branch.
  const appTest = 'postgres://app:***@ep-test.eu-central-1.aws.neon.tech/db'
  // The elevated migration-only role on the SAME endpoint.
  const migratorSameBranch = 'postgres://migrator:***@ep-test.eu-central-1.aws.neon.tech/db'
  const base = { DATABASE_URL: prodPooled, DATABASE_URL_UNPOOLED: prodDirect }

  it('accepts a migrator URL on the same isolated endpoint', () => {
    const r = getMigrationDatabaseUrl({
      ...base,
      MIGRATION_TEST_DATABASE_URL: appTest,
      MIGRATION_TEST_MIGRATOR_URL: migratorSameBranch,
    })
    expect(r.endpointId).toBe('ep-test')
    expect(r.host).toBe('ep-test.eu-central-1.aws.neon.tech')
    // `host` is the credential-free field callers log; it must not carry the
    // password. (`url` is the raw connection string by design, as with the
    // existing resolvers, so it is not asserted on here.)
    expect(r.host).not.toContain('migrator')
    expect(r.host).not.toContain('***')
  })

  it('rejects a migrator URL on a DIFFERENT endpoint', () => {
    expect(() =>
      getMigrationDatabaseUrl({
        ...base,
        MIGRATION_TEST_DATABASE_URL: appTest,
        MIGRATION_TEST_MIGRATOR_URL: 'postgres://migrator:***@ep-other.eu-central-1.aws.neon.tech/db',
      })
    ).toThrow('must target the same Neon endpoint')
  })

  it('rejects a migrator URL pointing at PRODUCTION (pooled or direct)', () => {
    expect(() =>
      getMigrationDatabaseUrl({
        ...base,
        MIGRATION_TEST_DATABASE_URL: appTest,
        MIGRATION_TEST_MIGRATOR_URL: prodDirect,
      })
    ).toThrow('Refusing')
    expect(() =>
      getMigrationDatabaseUrl({
        ...base,
        MIGRATION_TEST_DATABASE_URL: appTest,
        MIGRATION_TEST_MIGRATOR_URL: prodPooled,
      })
    ).toThrow('Refusing')
    // Even an unpooled URL on the production endpoint is caught by the
    // endpoint-identity check, not just the exact-string check.
    expect(() =>
      getMigrationDatabaseUrl({
        DATABASE_URL: prodDirect,
        MIGRATION_TEST_DATABASE_URL: appTest,
        MIGRATION_TEST_MIGRATOR_URL: 'postgres://migrator:***@ep-main.eu-central-1.aws.neon.tech/db',
      })
    ).toThrow('endpoint matches the main database endpoint')
  })

  it('rejects a POOLED migrator URL', () => {
    // The migrator holds a session-scoped advisory lock across transactions.
    expect(() =>
      getMigrationDatabaseUrl({
        ...base,
        MIGRATION_TEST_DATABASE_URL: appTest,
        MIGRATION_TEST_MIGRATOR_URL: 'postgres://migrator:***@ep-test-pooler.eu-central-1.aws.neon.tech/db',
      })
    ).toThrow(/-pooler/)
  })

  it('falls back to the restricted test URL when the migrator URL is unset', () => {
    const r = getMigrationDatabaseUrl({ ...base, MIGRATION_TEST_DATABASE_URL: appTest })
    expect(r.endpointId).toBe('ep-test')
    expect(r.url).toBe(appTest)
  })

  it('falls back when the migrator URL is an empty string', () => {
    const r = getMigrationDatabaseUrl({
      ...base,
      MIGRATION_TEST_DATABASE_URL: appTest,
      MIGRATION_TEST_MIGRATOR_URL: '',
    })
    expect(r.url).toBe(appTest)
  })

  it('still fails closed when NEITHER test URL is configured', () => {
    expect(() => getMigrationDatabaseUrl({ ...base })).toThrow(
      'MIGRATION_TEST_DATABASE_URL is required'
    )
  })

  it('inherits every existing guard check for the migrator URL', () => {
    // Wrong region.
    expect(() =>
      getMigrationDatabaseUrl({
        ...base,
        MIGRATION_TEST_DATABASE_URL: appTest,
        MIGRATION_TEST_MIGRATOR_URL: 'postgres://m:***@ep-test.us-east-1.aws.neon.tech/db',
      })
    ).toThrow('eu-central-1')
    // No Neon endpoint ID at all.
    expect(() =>
      getMigrationDatabaseUrl({
        ...base,
        MIGRATION_TEST_DATABASE_URL: appTest,
        MIGRATION_TEST_MIGRATOR_URL: 'postgres://m:***@db.example.com/db',
      })
    ).toThrow('must contain a Neon endpoint ID')
    // Structurally invalid.
    expect(() =>
      getMigrationDatabaseUrl({
        ...base,
        MIGRATION_TEST_DATABASE_URL: appTest,
        MIGRATION_TEST_MIGRATOR_URL: 'not-a-url',
      })
    ).toThrow()
  })

  it('requires the restricted URL as the isolation reference', () => {
    // Without the reference the pin cannot be evaluated, so it must fail rather
    // than silently skip the same-endpoint check. (The message names the
    // migrator variable because that is the one the operator set.)
    expect(() =>
      getMigrationDatabaseUrl({
        ...base,
        MIGRATION_TEST_MIGRATOR_URL: migratorSameBranch,
      })
    ).toThrow('requires MIGRATION_TEST_DATABASE_URL to be set as the isolation reference')
  })

  it('does not weaken the restricted test URL resolver', () => {
    // getDatabaseTestUrl keeps ignoring the migrator variable entirely.
    expect(() =>
      getDatabaseTestUrl({
        ...base,
        MIGRATION_TEST_DATABASE_URL: 'postgres://app:***@ep-other.eu-central-1.aws.neon.tech/db',
        MIGRATION_TEST_MIGRATOR_URL: migratorSameBranch,
      })
    ).not.toThrow()
    // ...and it still rejects production.
    expect(() =>
      getDatabaseTestUrl({ ...base, MIGRATION_TEST_DATABASE_URL: prodDirect })
    ).toThrow('Refusing')
  })
})
