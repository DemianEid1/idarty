-- Migration 0013: Multi-Branch Management
--
-- 1. Create branches table (physical locations per tenant).
-- 2. Create branch_translations table (localized names, addresses, descriptions).
-- 3. Create staff_branches junction table (assign staff members to locations).
-- 4. Add nullable branch_id to bookings, booking_items, working_hours, and date_overrides.
-- 5. Auto-provision default 'main' branch for existing tenants to guarantee backward compatibility.

-- 1. Branches table
CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  phone_e164 text,
  email text,
  booking_capacity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT branches_booking_capacity_positive CHECK (booking_capacity >= 1),
  CONSTRAINT branches_tenant_slug_unique UNIQUE (tenant_id, slug)
);

-- Exactly one active default branch per tenant
CREATE UNIQUE INDEX IF NOT EXISTS branches_one_default_per_tenant_idx
  ON branches (tenant_id)
  WHERE is_default = true AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS branches_tenant_active_idx
  ON branches (tenant_id, sort_order)
  WHERE archived_at IS NULL;

-- 2. Branch Translations (ar / en)
CREATE TABLE IF NOT EXISTS branch_translations (
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  locale app_locale NOT NULL,
  name text NOT NULL,
  address text,
  description text,
  PRIMARY KEY (branch_id, locale)
);

CREATE INDEX IF NOT EXISTS branch_translations_tenant_locale_idx
  ON branch_translations (tenant_id, locale);

-- 3. Staff to Branch assignments
CREATE TABLE IF NOT EXISTS staff_branches (
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, branch_id)
);

CREATE INDEX IF NOT EXISTS staff_branches_tenant_idx ON staff_branches (tenant_id);
CREATE INDEX IF NOT EXISTS staff_branches_branch_idx ON staff_branches (branch_id);

-- 4. Add nullable branch_id columns to operational tables
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS bookings_branch_id_idx ON bookings (branch_id) WHERE branch_id IS NOT NULL;

ALTER TABLE booking_items
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS booking_items_branch_id_idx ON booking_items (branch_id) WHERE branch_id IS NOT NULL;

ALTER TABLE working_hours
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS working_hours_branch_id_idx ON working_hours (branch_id) WHERE branch_id IS NOT NULL;

ALTER TABLE date_overrides
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS date_overrides_branch_id_idx ON date_overrides (branch_id) WHERE branch_id IS NOT NULL;

-- 5. Auto-provision default 'main' branch for existing tenants
INSERT INTO branches (tenant_id, slug, is_default, booking_capacity, phone_e164, email)
SELECT t.id, 'main', true, COALESCE(t.booking_capacity, 1), t.phone_e164, t.email
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM branches b WHERE b.tenant_id = t.id AND b.archived_at IS NULL
)
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- Populate default branch translations from existing tenant translations
INSERT INTO branch_translations (tenant_id, branch_id, locale, name, address)
SELECT b.tenant_id, b.id, tt.locale, tt.name, tt.address
FROM branches b
JOIN tenant_translations tt ON tt.tenant_id = b.tenant_id
WHERE b.slug = 'main' AND b.is_default = true
ON CONFLICT (branch_id, locale) DO NOTHING;

