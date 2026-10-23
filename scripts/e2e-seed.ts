import 'dotenv/config'
import { Client } from 'pg'
import { getE2EDatabaseUrl } from '../lib/database-test-guard'

const { url, host } = getE2EDatabaseUrl()
console.log(`E2E database host: ${host}`)

const ids = {
  tenant: '00000000-0000-4000-8000-000000000001',
  serviceOne: '00000000-0000-4000-8000-000000000002',
  serviceTwo: '00000000-0000-4000-8000-000000000003',
  staff: '00000000-0000-4000-8000-000000000004',
}

async function main() {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await client.query('BEGIN')
    const user = await client.query(`INSERT INTO "user" (id, name, email, "emailVerified", "preferredLocale") VALUES ('seed-owner-idarty', 'Idarty E2E Owner', 'owner@idarty.com', true, 'ar') ON CONFLICT (email) DO UPDATE SET "emailVerified" = true RETURNING id`)
    const userId = user.rows[0].id
    await client.query(`INSERT INTO tenants (id, slug, business_type, default_locale, timezone, currency, phone_e164, email) VALUES ($1, 'e2e-nile-wellness', 'clinic', 'ar', 'Africa/Cairo', 'EGP', '+201000000000', 'hello@e2e-nile-wellness.idarty.com') ON CONFLICT (slug) DO UPDATE SET status = 'active'`, [ids.tenant])
    await client.query(`INSERT INTO tenant_translations (tenant_id, locale, name) VALUES ($1, 'ar', 'مركز E2E الصحي'), ($1, 'en', 'E2E Nile Wellness') ON CONFLICT (tenant_id, locale) DO UPDATE SET name = EXCLUDED.name`, [ids.tenant])
    await client.query(`INSERT INTO memberships (tenant_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active') ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'owner', status = 'active'`, [ids.tenant, userId])
    await client.query(`INSERT INTO services (id, tenant_id, duration_min, price_amount, sort_order) VALUES ($1, $3, 60, 450, 1), ($2, $3, 45, 300, 2) ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, is_active = true`, [ids.serviceOne, ids.serviceTwo, ids.tenant])
    await client.query(`INSERT INTO staff (id, tenant_id, email, is_active) VALUES ($1, $2, 'doctor@e2e-nile-wellness.idarty.com', true) ON CONFLICT (id) DO UPDATE SET is_active = true`, [ids.staff, ids.tenant])
    for (let weekday = 0; weekday < 6; weekday++) await client.query(`INSERT INTO working_hours (tenant_id, staff_id, weekday, start_time, end_time) VALUES ($1, $2, $3, '09:00', '17:00') ON CONFLICT DO NOTHING`, [ids.tenant, ids.staff, weekday])
    await client.query('COMMIT')
    console.log('Seeded idempotent E2E fixtures')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1 })
