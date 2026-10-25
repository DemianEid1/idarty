-- Migration 0012: Tenant Booking Capacity & Staff Decoupling
--
-- 1. Add tenant-level booking capacity with a positive check constraint (default 1).
-- 2. Backfill existing tenants to default capacity 1.
-- 3. Make booking_items.staff_id nullable so bookings do not require staff assignment.
-- 4. Update GiST exclusion constraint to apply when staff_id is present.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS booking_capacity integer NOT NULL DEFAULT 1;

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_booking_capacity_positive;
ALTER TABLE tenants ADD CONSTRAINT tenants_booking_capacity_positive CHECK (booking_capacity >= 1);

UPDATE tenants SET booking_capacity = 1 WHERE booking_capacity IS NULL;

ALTER TABLE booking_items ALTER COLUMN staff_id DROP NOT NULL;

ALTER TABLE booking_items DROP CONSTRAINT IF EXISTS booking_items_no_overlap;

ALTER TABLE booking_items ADD CONSTRAINT booking_items_no_overlap EXCLUDE USING gist (
  tenant_id WITH =,
  staff_id WITH =,
  tstzrange(block_starts_at, block_ends_at, '[)') WITH &&
) WHERE (status IN ('pending', 'confirmed') AND staff_id IS NOT NULL);
