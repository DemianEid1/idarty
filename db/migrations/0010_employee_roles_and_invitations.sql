-- Add role to staff table, default to 'staff'
ALTER TABLE staff ADD COLUMN IF NOT EXISTS role member_role NOT NULL DEFAULT 'staff';

-- Backfill role for owner staff and existing memberships
UPDATE staff
SET role = 'owner'
WHERE membership_id IN (
  SELECT id FROM memberships WHERE role = 'owner'
);

UPDATE staff s
SET role = m.role
FROM memberships m
WHERE s.membership_id = m.id;

-- Tenant invitations table for secure out-of-band staff invitations
CREATE TABLE IF NOT EXISTS tenant_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  email text NOT NULL,
  role member_role NOT NULL,
  token_hash text NOT NULL,
  invited_by_user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_invitations_tenant_email_idx
  ON tenant_invitations (tenant_id, lower(email))
  WHERE accepted_at IS NULL;

CREATE INDEX IF NOT EXISTS tenant_invitations_token_hash_idx
  ON tenant_invitations (token_hash);
