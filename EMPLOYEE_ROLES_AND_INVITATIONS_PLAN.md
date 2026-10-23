# Idarty — Employee Roles & Permissions + Decouple Staff from Services
## Implementation Plan: Employee Accounts, Secure Invitations & Service Decoupling

---

## 1. Architectural Foundations & Verified Codebase Reality

1. **Authentication:**
   - Powered by **Better Auth** (`lib/auth.ts`), mounted at `app/api/auth/[...all]/route.ts`.
   - Better Auth manages core authentication in tables: `"user"`, `session`, `account`, and `verification` (`lib/db/schema.ts`).
   - Better Auth handles password hashing (`scrypt`), credentials verification, and session tokens. Multi-tenancy is managed independently by Idarty via PostgreSQL tables: `tenants`, `memberships`, and `staff`.
2. **Authorization:**
   - `lib/authz.ts` (`requireTenantAccess`) is invoked on every page navigation and server action.
   - It queries `memberships` joined with `tenants` on `memberships.userId = session.user.id`, `tenants.slug = slug`, and `memberships.status = 'active'`.
   - **`memberships.role` is the sole source of truth for all authorization decisions in the system.**
3. **Email Delivery:**
   - `lib/email/send.tsx` delivers email via Gmail SMTP (`GMAIL_SMTP_USER`, `GMAIL_SMTP_APP_PASSWORD`).
   - In development/test environments when SMTP is unconfigured, write to `devEmailOutbox` and log the activation link to the console to enable 100% offline development and automated testing without external dependencies.

---

## 2. Mandatory Security Invariants

### A. Single-Use Expiring Tokens & Email Verification Integrity
- **Cryptographic Entropy:**
  - When an authorized Owner or Admin invites an employee with an email address:
    - Generate a 32-byte cryptographically secure random token (`crypto.randomBytes(32).toString('hex')`).
    - Calculate its SHA-256 hash: `tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')`.
    - Store **only the hash** in `tenant_invitations.token_hash`. The raw token is sent strictly in the invitation URL to the invited employee's email address.
- **Expiration Policy:**
  - Token lifetime is strictly bounded: `expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)` (7 days).
  - Any claim attempt where `now() > expires_at` is rejected.
- **Single-Use Invariant:**
  - Each invitation record includes `accepted_at: timestamptz`.
  - Acceptance checks `accepted_at IS NULL` and marks `accepted_at = now()` atomically within a row-locked transaction (`FOR UPDATE`). A token cannot be replayed or reused.
- **Preservation of Production Email Verification Policy:**
  - General registration (`AuthForm` at `/sign-up/email`) remains strictly guarded by `requireEmailVerification: !skipEmailVerification`. No global verification bypass is created.
  - The invitation link sent to `invitation.email` is an out-of-band message proving ownership of that specific inbox. Only through this trusted invitation flow is the invited email marked verified.

### B. Server-Side Role Enforcement & Cross-Tenant Isolation
- **Role Hierarchy & Allowed Assignments:**
  The system defines 5 roles in `member_role` with ranks in `lib/authz.ts`:
  `{ receptionist: 1, staff: 2, manager: 3, admin: 4, owner: 5 }`.

  | Actor Role | Can Invite / Create Staff? | Allowed Target Roles | Forbidden Target Roles |
  | :--- | :---: | :--- | :--- |
  | **Owner** (5) | Yes | `admin`, `manager`, `staff`, `receptionist` | **`owner`** (Only 1 Owner per tenant, set at onboarding) |
  | **Admin** (4) | Yes | `manager`, `staff`, `receptionist` (strictly `< admin`) | **`admin`**, **`owner`** |
  | **Manager** (3) | No (Read-only on Team) | None | All |
  | **Staff** (2) | No | None | All |
  | **Receptionist** (1) | No | None | All |

- **Server-Side Enforcement Invariants:**
  - `owner` role can **never** be assigned via employee actions.
  - Caller cannot assign equal or higher role than themselves (unless Owner).
  - All database queries filter strictly by `tenantId = access.tenant.id`.

### C. `memberships.role` as Sole Source of Truth & Transactional Synchronization
- **Sole Source of Truth for Effective Permissions:** `memberships.role`.
- **Roster & Pending Invites:** `staff.role` stores the designated operational role for roster display and unactivated staff records.
- **Transactional Synchronization (`updateStaff`):**
  When an Owner updates an employee's role, the changes across `staff`, `memberships`, and `tenant_invitations` must be executed within a single atomic PostgreSQL transaction. If any update fails, the entire transaction rolls back.

### D. Atomic Invitation Acceptance & Account Linking
- Acceptance runs inside a single locked transaction (`FOR UPDATE` on `tenant_invitations`).
- Validates token hash, expiry, and `accepted_at IS NULL`.
- Verifies target email strictly matches the invitation email.
- Prevents duplicate memberships (`UNIQUE (tenant_id, user_id)`).
- Links `staff.membership_id = membership.id` and synchronizes `staff.role = invite.role`.
- Marks `tenant_invitations.accepted_at = now()`.
- **Account Enumeration Defense:** Creating/inviting an employee returns a uniform `"Invitation sent"` message without exposing whether the email already exists in Idarty.
- **Account Takeover Defense:** The Owner never sets or views the employee's password. Existing users must authenticate with their existing credentials before claiming an invite.

### E. Better Auth Supported Creation & Session Establishment
- When a new employee activates their account, use Better Auth's official server-side user creation method (`auth.api.signUpEmail`).
- Better Auth creates the `"user"` and `"account"` with secure password hashing.
- Mark `emailVerified = true` exclusively within the validated invitation transaction.
- Use `auth.api.signInEmail` to establish the official Better Auth session cookie.

---

## 3. Employee-Service Decoupling Specification

1. **`createStaff` in `staff-actions.ts`:**
   - Remove automatic query of all services and batch insertion into `staff_services`.
   - Creating an employee creates only the employee record (and invitation if email is present).
2. **`createService` in `dashboard/actions.ts`:**
   - Remove automatic query of all staff and batch insertion into `staff_services`.
   - Creating a service creates only the service record.
3. **Preservation of Booking Fallback:**
   - `book/actions.ts` lines 46-58 already selects from all active tenant staff when `staff_services` has 0 rows for that service.
   - `manual-booking-modal.tsx` lines 61-68 already falls back to all active staff when 0 staff are explicitly assigned.
   - Retaining `staff_services` as an optional constraint guarantees 100% backward compatibility for existing appointments and schedules.

---

## 4. Step-by-Step Phased Implementation Plan

### Phase 1: Database Migration & Schema Update
- Add migration `db/migrations/0010_employee_roles_and_invitations.sql`:
  - `ALTER TABLE staff ADD COLUMN IF NOT EXISTS role member_role NOT NULL DEFAULT 'staff';`
  - Backfill existing staff roles from linked memberships.
  - Create `tenant_invitations` table with foreign keys, checks, and indexes.
- Update `lib/db/schema.ts` to include `staff.role` and `tenantInvitations`.
- Run `pnpm db:migrate:test`.

### Phase 2: Decouple Service & Staff Server Actions
- In `app/[locale]/tenants/[slug]/dashboard/staff-actions.ts` (`createStaff`):
  - Remove auto-assignment to `staffServices`.
- In `app/[locale]/tenants/[slug]/dashboard/actions.ts` (`createService`):
  - Remove auto-assignment to `staffServices`.

### Phase 3: Email Template & Dev Mode Fallback
- In `lib/email/templates.tsx`:
  - Add `EmployeeInvitationEmail` (RTL Arabic and LTR English).
- In `lib/email/send.tsx`:
  - Add support for `'invite'` template.
  - In non-production environments without SMTP credentials, write to `devEmailOutbox` and log to console instead of failing.

### Phase 4: Server-Side Role Enforcement & Invitation Generation
- In `staff-actions.ts`:
  - Enforce `minimumRole: 'admin'` on employee management.
  - Reject `role === 'owner'` and enforce hierarchy checks.
  - Generate 32-byte cryptographic token, store SHA-256 hash in `tenant_invitations`, and send invitation email.
  - Update `updateStaff` with atomic transactional synchronization.
  - Update `archiveStaff` to suspend linked membership (`status = 'suspended'`) and prevent self-archiving.
  - Implement `resendStaffInvitation`.

### Phase 5: Atomic Invitation Acceptance & Account Linking
- Create `app/[locale]/invite/actions.ts`:
  - `getInvitationDetails(token)`
  - `activateEmployeeAccount({ token, name, password })`
  - `acceptInvitationForExistingUser({ token })`
- Create `app/[locale]/invite/claim/page.tsx` and `components/invite-claim-card.tsx` with full RTL/LTR support.

### Phase 6: Dashboard UI Updates
- In `components/staff-form.tsx`: Add localized Role selector (`manager`, `staff`, `receptionist`) and invitation notice.
- In `components/staff-edit-form.tsx`: Add Role selector and "Resend Invitation" button.
- In `app/[locale]/tenants/[slug]/dashboard/page.tsx`: Display role badges and invitation status (Active vs Invited).

### Phase 7: Automated Testing & Verification
- Unit and integration tests in `lib/staff-invitations.test.ts`:
  - Token hashing & expiration.
  - Escalation prevention (no Owner creation, no Admin creation by Admin).
  - Atomic acceptance transaction & duplicate prevention.
  - Immediate access cutoff on staff archival (`status = 'suspended'`).
  - Decoupling verification: 0 `staff_services` on staff/service creation.
- Run complete test suite (`pnpm test`).
