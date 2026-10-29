-- Migration 0014: Branch-specific service availability
--
-- Services stay tenant-global: name, description, translations, duration,
-- price, images and sort order are NOT duplicated per branch. This migration
-- only adds an availability layer so a branch can enable/disable a service
-- without touching the service itself or any other branch.
--
-- Missing row means "available". That is what keeps every existing branch and
-- service working exactly as before even before the backfill below runs, and it
-- also means a service created by an older code path is never silently hidden.
-- Explicit rows are written whenever a tenant saves a branch's configuration
-- (or creates a branch/service through the current code paths).
--
-- Reversible: `DROP TABLE branch_services;` removes the layer and restores the
-- previous, tenant-wide behaviour. No service, booking or translation row is
-- modified by this migration.

CREATE TABLE IF NOT EXISTS branch_services (
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_services_pkey PRIMARY KEY (branch_id, service_id)
);

CREATE INDEX IF NOT EXISTS branch_services_tenant_idx ON branch_services (tenant_id);
CREATE INDEX IF NOT EXISTS branch_services_service_idx ON branch_services (service_id);

-- Backfill an explicit "available" row for every current active branch and
-- every non-deleted service. Idempotent: re-running only inserts missing pairs.
INSERT INTO branch_services (tenant_id, branch_id, service_id, is_available)
SELECT b.tenant_id, b.id, s.id, true
FROM branches b
JOIN services s
  ON s.tenant_id = b.tenant_id
 AND s.deleted_at IS NULL
WHERE b.archived_at IS NULL
ON CONFLICT (branch_id, service_id) DO NOTHING;
