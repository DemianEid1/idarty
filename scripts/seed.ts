import { config } from 'dotenv'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'

config({ path: ['.env.local', '.env.development.local', '.env'], quiet: true })
const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
if (!connectionString) throw new Error('A Neon database connection string is required')
const client = new Client({ connectionString })
const userId = 'seed-owner-idarty'
const tenantId = randomUUID()
const serviceOne = randomUUID()
const serviceTwo = randomUUID()

async function main() {
await client.connect()
try {
  await client.query('BEGIN')
  await client.query(`
    INSERT INTO "user" (id, name, email, "emailVerified", "preferredLocale")
    VALUES ($1, $2, $3, true, 'ar')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, "emailVerified" = true
  `, [userId, 'Idarty Demo Owner', 'owner@idarty.com'])

  const existing = await client.query('SELECT id FROM tenants WHERE slug = $1', ['nile-wellness'])
  const currentTenantId = existing.rows[0]?.id ?? tenantId
  if (!existing.rows[0]) {
    await client.query(`INSERT INTO tenants (id, slug, business_type, default_locale, timezone, currency, phone_e164, email) VALUES ($1, 'nile-wellness', 'clinic', 'ar', 'Africa/Cairo', 'EGP', '+201000000000', 'hello@nile-wellness.idarty.com')`, [currentTenantId])
  }
  await client.query(`INSERT INTO tenant_translations (tenant_id, locale, name, tagline, description, address) VALUES ($1, 'ar', 'مركز النيل الصحي', 'رعاية هادئة، قريبة، ومنظمة', 'عيادة مجتمعية للحجز السهل والخدمات اليومية.', 'المعادي، القاهرة') ON CONFLICT (tenant_id, locale) DO UPDATE SET name = EXCLUDED.name, tagline = EXCLUDED.tagline, description = EXCLUDED.description, address = EXCLUDED.address`, [currentTenantId])
  await client.query(`INSERT INTO tenant_translations (tenant_id, locale, name, tagline, description, address) VALUES ($1, 'en', 'Nile Wellness Center', 'Care that feels close and organized', 'A community clinic with simple booking and thoughtful care.', 'Maadi, Cairo') ON CONFLICT (tenant_id, locale) DO UPDATE SET name = EXCLUDED.name, tagline = EXCLUDED.tagline, description = EXCLUDED.description, address = EXCLUDED.address`, [currentTenantId])
  await client.query(`INSERT INTO memberships (tenant_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active') ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'owner', status = 'active'`, [currentTenantId, userId])
  await client.query(`INSERT INTO services (id, tenant_id, duration_min, price_amount, sort_order) VALUES ($1, $3, 60, 450, 1), ($2, $3, 45, 300, 2) ON CONFLICT (id) DO NOTHING`, [serviceOne, serviceTwo, currentTenantId])
  await client.query(`INSERT INTO service_translations (tenant_id, service_id, locale, name, description) VALUES ($1, $2, 'ar', 'استشارة أولية', 'جلسة تعريفية مع الفريق المختص.'), ($1, $3, 'ar', 'جلسة متابعة', 'متابعة عملية وهادئة لخطة الرعاية.'), ($1, $2, 'en', 'Initial consultation', 'A calm first session with our care team.'), ($1, $3, 'en', 'Follow-up session', 'A focused follow-up for your care plan.') ON CONFLICT (service_id, locale) DO NOTHING`, [currentTenantId, serviceOne, serviceTwo])
  const staffId = randomUUID()
  const defaultBranchId = randomUUID()
  await client.query(`INSERT INTO staff (id, tenant_id, email, is_active) VALUES ($1, $2, 'doctor@nile-wellness.idarty.com', true) ON CONFLICT (id) DO NOTHING`, [staffId, currentTenantId])
  const existingBranch = await client.query('SELECT id FROM branches WHERE tenant_id = $1 AND slug = $2', [currentTenantId, 'main'])
  const branchId = existingBranch.rows[0]?.id ?? defaultBranchId
  if (!existingBranch.rows[0]) {
    await client.query(`INSERT INTO branches (id, tenant_id, slug, is_default, booking_capacity, phone_e164, email) VALUES ($1, $2, 'main', true, 1, '+201000000000', 'hello@nile-wellness.idarty.com') ON CONFLICT (tenant_id, slug) DO NOTHING`, [branchId, currentTenantId])
    await client.query(`INSERT INTO branch_translations (tenant_id, branch_id, locale, name, address) VALUES ($1, $2, 'ar', 'الفرع الرئيسي - المعادي', 'المعادي، القاهرة'), ($1, $2, 'en', 'Main Branch - Maadi', 'Maadi, Cairo') ON CONFLICT (branch_id, locale) DO NOTHING`, [currentTenantId, branchId])
    await client.query(`INSERT INTO staff_branches (staff_id, branch_id, tenant_id, is_primary) VALUES ($1, $2, $3, true) ON CONFLICT DO NOTHING`, [staffId, branchId, currentTenantId])
  }
  for (let weekday = 0; weekday < 6; weekday++) {
    await client.query(`INSERT INTO working_hours (tenant_id, staff_id, weekday, start_time, end_time) SELECT $1, $2, $3, '09:00', '17:00' WHERE NOT EXISTS (SELECT 1 FROM working_hours WHERE tenant_id = $1 AND staff_id = $2 AND weekday = $3)`, [currentTenantId, staffId, weekday])
  }
  await client.query('COMMIT')
  console.log('Seeded Nile Wellness demo tenant.')
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  await client.end()
}
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
