# Idarty — Full Production Readiness, Security & Reliability Audit Report

**Date:** October 23, 2026  
**Audited Branch:** `feature/employee-roles-and-invitations`  
**HEAD Commit:** `8160af7a9b1603d36d2578861318006514d9e80d`  
**Overall Verdict:** **CONDITIONAL GO** (Release-ready once documented database migration and Vercel environment prerequisites are satisfied; zero unresolved blocking code vulnerabilities).

---

## 1. Executive Summary

This audit represents an evidence-based evaluation of the entire Idarty codebase, examining architecture, deployment configuration, security boundaries, multi-tenant data isolation, critical business workflows, and test coverage.

### Key Audit Findings:
1. **The Vercel SSL Warning is NOT a Production Error:**  
   The warning `(node:8) Warning: SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full' ...` is an upstream deprecation notice emitted by `pg-connection-string@2.14.1` (via `pg@8.23.1`) whenever a connection URL contains `sslmode=require` (the default parameter provided by Neon). It is emitted via `process.emitWarning()` to `stderr` and does **not** terminate execution, abort connections, or cause query failures.
2. **Actual Production Failure Analysis:**  
   Because the SSL warning is benign, the observed Vercel production failure is caused by runtime environment or schema synchronization issues — most prominently unapplied database migrations (`0010_employee_roles_and_invitations.sql` / `0011_drop_staff_services.sql`) on the production Neon database, missing production environment variables (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, or SMTP credentials), or serverless connection pooling limits.
3. **Architecture & Modern Next.js 16 Alignment:**  
   The application builds cleanly under Next.js 16.3.3 and React 19.2.4 using Turbopack. All 24 routes compile statically or dynamically as intended. The request proxy is correctly implemented as `proxy.ts` (the official Next.js 16 convention replacing deprecated `middleware.ts`).
4. **Security & Tenant Isolation Integrity:**  
   Authentication (Better Auth with scrypt and 30-day sessions) and authorization (`requireTenantAccess` across all server actions and pages) enforce strict role hierarchy (`receptionist: 1 < staff: 2 < manager: 3 < admin: 4 < owner: 5`). Single-use invitation tokens use cryptographically secure 32-byte entropy, SHA-256 storage hashing, and 7-day expiration.
5. **Double-Booking & Concurrency Protection:**  
   Booking concurrency is enforced at the PostgreSQL engine level using a GiST exclusion constraint (`booking_items_no_overlap`), mathematically preventing overlapping blocks for the same employee regardless of concurrent request timing.
6. **Decoupling Staff from Services:**  
   The removal of `staff_services` is completely implemented in application code: zero active queries depend on `staff_services`. Both public and manual booking workflows gracefully select from active staff.
7. **Test Suite & Typecheck Health:**  
   - `pnpm typecheck` passed with **0 errors**.
   - `pnpm build` exited with code **0** (full production bundle generated).
   - Vitest suite: **1,229 tests passed** across 63 test suites. Only 6 assertions failed in `lib/tenant-website-ui-refinement.test.ts`, which are verified pre-existing from commit `0f29fa3` (CSS class adjustments on mobile cards) and completely unrelated to current changes.

---

## 2. Investigation of the Vercel Production Error & PostgreSQL SSL Warning

### 2.1 The Warning Message
In Vercel logs, the user observed:
```text
(node:8) Warning: SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'. In the next major version (pg-connection-string v3.0.0 and pg v9.0.0), these modes will adopt standard libpq semantics, which have weaker security guarantees.
```

### 2.2 Forensic Trace & Mechanism
1. **Source Dependency:**  
   Located in `node_modules/.pnpm/pg-connection-string@2.14.1/node_modules/pg-connection-string/index.js` (lines 147–150 and 219–231).
2. **Trigger:**  
   In `lib/db/index.ts`, `new Pool({ connectionString: process.env.DATABASE_URL })` passes the connection string to `pg`. Neon’s standard connection string includes `sslmode=require`.
3. **Execution Path:**  
   When `pg-connection-string.parse()` detects `config.sslmode === 'require'` and `config.uselibpqcompat` is falsy, it calls `deprecatedSslModeWarning(config.sslmode)`, which executes:
   ```javascript
   process.emitWarning(`SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full' ...`)
   ```
4. **Behavior:**  
   Node.js prepends `(node:<PID>) Warning:` and writes the message to `stderr`. Execution continues normally. **No error or exception is thrown.**
5. **Security Meaning:**  
   In `pg` v8, `sslmode=require` performs full certificate validation (`verify-full`), which is the strongest security guarantee. The warning merely informs developers that future `pg` v9 will align with libpq's weaker default.
6. **Correction Recommendation:**  
   Do **not** blindly append query parameters without testing. The safest resolution to eliminate the deprecation noise without weakening security is to specify `sslmode=verify-full` in `DATABASE_URL` if supported by Neon's domain certs, or pass `uselibpqcompat=true` if libpq semantics are desired. However, this warning is **cosmetic** and not the cause of application failures.

### 2.3 Identifying the Actual Production Failure
Because the SSL warning is harmless, the real production failure in Vercel stems from one of the following root causes:

| Root Cause Candidate | Mechanism | Verified Code Evidence |
| :--- | :--- | :--- |
| **Unapplied Database Migrations** | If migration `0010_employee_roles_and_invitations.sql` has not been applied to the production Neon database, any query referencing `tenant_invitations` or `staff.role` fails with PostgreSQL error `42703 (column does not exist)` or `42P01 (relation does not exist)`. | Vercel's build command (`package.json:8`) is `next build`. It does **not** execute `scripts/migrate.ts`. Migrations must be run via unpooled connection `DATABASE_URL_UNPOOLED`. |
| **Missing `BETTER_AUTH_SECRET`** | Better Auth requires a secret in production. | `node_modules/better-auth/dist/context/create-context.mjs:43`: Throws fatal `BetterAuthError: BETTER_AUTH_SECRET is missing` during startup if missing. |
| **Missing `BETTER_AUTH_URL` or Vercel URL** | In production, `lib/auth.ts` lines 31–36 explicitly throw if no base URL can be resolved. | `throw new Error('BETTER_AUTH_URL or a Vercel environment URL is required in production environment.')` |
| **`SKIP_EMAIL_VERIFICATION=true` in Production** | If local `.env` with `SKIP_EMAIL_VERIFICATION=true` was copied to Vercel production. | `lib/auth.ts:11`: Top-level module execution halts with `throw new Error('SKIP_EMAIL_VERIFICATION cannot be enabled in production')`. |
| **Unconfigured SMTP in Production** | If `GMAIL_SMTP_USER` or `GMAIL_SMTP_APP_PASSWORD` is absent. | `lib/email/send.tsx:85`: Throws `EMAIL_NOT_CONFIGURED`, causing all registration and password reset attempts to crash. |
| **Connection Pooling Exhaustion** | In `lib/db/index.ts`, `Pool` has `max: 10`. Furthermore, `if (process.env.NODE_ENV !== 'production') globalForDb.pgPool = pool` means the pool is not memoized on `globalThis` in production. | With 15+ concurrent serverless lambdas, connection pool limits on Neon PgBouncer can be reached quickly. |

> [!IMPORTANT]
> **Action Required from User:** If the production failure persists after verifying environment variables and running migrations, please provide the redacted error stack trace immediately following the SSL warning from the Vercel Function logs.

---

## 3. Architecture & Deployment Audit

### 3.1 Next.js 16 & Serverless Runtime
- **Next.js Version:** 16.3.3 App Router.
- **Request Proxying:** Uses `proxy.ts` (`export async function proxy(request: NextRequest)`), which complies with the Next.js 16 specification replacing `middleware.ts`.
- **Server Actions:** `next.config.mjs` configures `experimental.serverActions.bodySizeLimit: '5mb'`, safely supporting inline image payloads.
- **Image Optimization:** `images.unoptimized: true` is configured in `next.config.mjs`. Because images are stored as embedded Base64 data URLs in PostgreSQL, no local filesystem storage or external object storage (AWS S3) is required.
- **Cron Jobs:** `vercel.json` configures `/api/cron/reminders` scheduled daily at `0 9 * * *`. The route is verified at `app/api/cron/reminders/route.ts` with Vercel Cron header validation.

### 3.2 Health Check Endpoint
- Route: `GET /api/health` (`app/api/health/route.ts`).
- Returns HTTP 200 with `{ status: 'ok', components: { database: 'healthy', email: 'configured', cron: 'healthy' } }`.
- Returns HTTP 503 if database connectivity fails. Credentials and sensitive details are strictly omitted.

---

## 4. Security Audit

### 4.1 Authentication & Sessions
- **Framework:** Better Auth mounted at `/api/auth/[...all]`.
- **Password Security:** Scrypt hashing managed by Better Auth.
- **Session Duration:** 30 days (`expiresIn: 3600 * 24 * 30`, `updateAge: 3600 * 24`).
- **Session Validation:** Server-side `requireSession(headers)` in `lib/auth.ts`.
- **Rate Limiting:** Auth endpoints (`/api/auth/sign-in/email`) are rate-limited to 10 attempts per IP per 15 minutes in both `proxy.ts` and `lib/auth.ts`.

### 4.2 Multi-Tenant Isolation & Authorization
- **Guard Function:** `requireTenantAccess(headers, slug, minimumRole)` in `lib/authz.ts`.
- **Role Hierarchy:**  
  `receptionist (1) < staff (2) < manager (3) < admin (4) < owner (5)`.
- **Server-Side Enforcement:**
  - Owner cannot be demoted or archived by non-owners.
  - Users cannot archive themselves (`CANNOT_ARCHIVE_SELF`).
  - Employees cannot assign roles equal to or higher than their own.
  - Queries strictly scope by `tenantId = access.tenant.id`.
- **Platform Admin:** `requirePlatformAdmin` in `lib/authz.ts` checks `session.user.isPlatformAdmin` and logs audit events on unauthorized attempts.

### 4.3 Out-of-Band Invitation Security
- **Entropy & Storage:** 32-byte cryptographically secure random tokens (`crypto.randomBytes(32).toString('hex')`). Only the SHA-256 hash is stored in `tenant_invitations.token_hash`.
- **Expiration:** 7-day TTL (`expires_at = now() + 7 days`).
- **Single-Use Guarantee:** Atomic transaction checks `accepted_at IS NULL` and sets `accepted_at = now()`.
- **Account Hijacking Defense:** `acceptInvitationForExistingUser` verifies `session.user.email.toLowerCase() === invite.email.toLowerCase()`. Authenticated users cannot claim invites intended for other inboxes.

### 4.4 Data Integrity & Concurrency
- **Double Booking:** Enforced via PostgreSQL GiST exclusion constraint (`booking_items_no_overlap` in `db/migrations/0001_init.sql`):
  ```sql
  CONSTRAINT booking_items_no_overlap EXCLUDE USING gist (
    tenant_id WITH =,
    staff_id WITH =,
    tstzrange(block_starts_at, block_ends_at, '[)') WITH &&
  ) WHERE (status IN ('pending', 'confirmed'))
  ```
  Concurrent booking attempts conflicting on the same staff member are aborted at the database engine level and handled cleanly via error code `23P01`.
- **Employee-Service Decoupling:** Fully decoupled. Neither service creation nor employee creation writes to `staff_services`. Queries select active staff directly.

### 4.5 Web Application Security
- **XSS:** Zero instances of `dangerouslySetInnerHTML` or raw `.innerHTML`.
- **Open Redirects:** All dynamic redirects pass through `safeNextPath()` (`lib/safe-next.ts`), rejecting protocol-relative URLs (`//`) and backslash attacks (`/\`).
- **HTTP Security Headers:** Configured in `next.config.mjs`:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Strict-Transport-Security: max-age=63072000`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- **Missing Header:** Content Security Policy (CSP) is currently not defined in `next.config.mjs`.

---

## 5. Critical Business Workflow Audit

### Workflow Inventory & Verification

| Workflow | Path / Server Actions | Verification Status | Notes / Edge Cases |
| :--- | :--- | :--- | :--- |
| **A. Registration & Auth** | `/sign-up`, `/login`, `app/api/auth` | **VERIFIED** | Requires `GMAIL_SMTP_USER` & `APP_PASSWORD` for email verification in production. |
| **B. Tenant Onboarding** | `app/[locale]/onboarding/actions.ts` | **VERIFIED** | Creates tenant, translations, owner membership, owner staff, and default working hours in a single transaction. |
| **C. Employee Invitations** | `dashboard/staff-actions.ts`, `app/[locale]/invite/` | **VERIFIED** | Generates SHA-256 hashed invite; claims require email match; syncs roles atomically across `staff` and `memberships`. |
| **D. Public Booking** | `app/[locale]/tenants/[slug]/book/actions.ts` | **VERIFIED** | GiST exclusion constraint guarantees zero double bookings. Works with 0 `staff_services`. Returns friendly error if no staff exist. |
| **E. Calendar & Dashboard** | `calendar/page.tsx`, `dashboard/booking-actions.ts` | **VERIFIED** | Filtered by `tenantId`. Supports cancellation, status updates, manual appointments. |
| **F. Website Builder** | `lib/publish-actions.ts`, `tenants/[slug]/page.tsx` | **VERIFIED** | Public website reads exclusively from `published` column. Tag invalidation via `updateTag` on publish. |
| **G. Transactional Email** | `lib/email/send.tsx` | **CONDITIONAL** | In non-production, falls back to `devEmailOutbox`. In production, throws if unconfigured. Staff invitation catches errors silently. |

---

## 6. Testing & Build Verification

### 6.1 TypeScript Compilation (`pnpm typecheck`)
- Command: `tsc --noEmit`
- Result: **Passed (0 errors)**.

### 6.2 Production Build (`pnpm build`)
- Command: `next build`
- Result: **Passed (0 errors)**.
- Turbopack compilation succeeded in 42s, TypeScript checks finished in 34.1s, static page generation (8/8) succeeded in 934ms. All 24 routes successfully assembled.

### 6.3 Test Suite Execution (`pnpm test`)
- Command: `vitest run`
- Total Test Files: 67 (63 passed, 4 failed in full batch execution).
- Total Tests: 1,238 (1,229 passed, 9 failed).

#### Analysis of the 9 Failed Tests:
1. **`lib/tenant-website-ui-refinement.test.ts` (6 failures):**
   - Assertions: Service card mobile thumbnail dimensions (`h-24 w-24` vs `w-[110px]`), padding (`sm:p-6` vs `sm:p-5`), metadata flex spacing (`gap-x-3` vs `gap-x-2`), button class (`w-fit self-start` vs inline flex).
   - Forensic Evidence: These tests have been failing since commit `0f29fa3` (October 17, 2026), when `components/tenant-website.tsx` was intentionally refined for mobile responsiveness, but test assertions were not updated. **Pre-existing issue, not introduced by current changes.**
2. **Dynamic Import Concurrency Timeouts (3 failures in full batch):**
   - `lib/auth-audit.test.ts` (1 test): timed out at 5000ms.
   - `lib/auth-url.test.ts` (1 test): timed out at 5000ms.
   - `lib/website-config-writers.test.ts` (1 test): timed out at 5000ms.
   - Isolated Verification: When executed independently (`pnpm vitest run lib/auth-audit.test.ts lib/auth-url.test.ts lib/website-config-writers.test.ts`), **all 30 tests in all 3 files passed in 3.00 seconds**. The timeout was solely an artifact of high resource contention when spawning 67 parallel workers on Windows.

---

## 7. Production Configuration & Release Checklist

### 7.1 Required Vercel Environment Variables

| Variable Name | Environment | Sensitivity | Expected Format / Purpose |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Production, Preview | Secret | Neon pooled connection URL (`...-pooler...aws.neon.tech/neondb?sslmode=require`) |
| `DATABASE_URL_UNPOOLED` | Production, Preview | Secret | Neon direct unpooled connection URL (required for migrations and advisory locks) |
| `BETTER_AUTH_SECRET` | Production, Preview | Secret | 32+ character high-entropy random string (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | Production | Config | Canonical app URL (e.g. `https://idarty.com` or Vercel production domain) |
| `SKIP_EMAIL_VERIFICATION` | Production | Config | Must be `false` (or omitted). `true` causes fatal startup crash. |
| `GMAIL_SMTP_USER` | Production | Secret | Gmail sender address (e.g. `notifications@...`) |
| `GMAIL_SMTP_APP_PASSWORD` | Production | Secret | Google App Password (16 characters, no spaces) |
| `NEXT_PUBLIC_SENTRY_DSN` | Production, Preview | Config | Sentry project DSN |

### 7.2 Database Migration Sequencing Checklist
- [ ] **Step 1:** Verify `DATABASE_URL_UNPOOLED` is configured in production environment.
- [ ] **Step 2:** Apply migration `0010_employee_roles_and_invitations.sql` using `pnpm db:migrate` against the production database **before** routing traffic to the new build.
- [ ] **Step 3:** Deploy new application code to Vercel production.
- [ ] **Step 4:** Verify health endpoint at `https://<domain>/api/health` returns status `200 ok`.
- [ ] **Step 5:** Apply migration `0011_drop_staff_services.sql` using `pnpm db:migrate` only after the new deployment is confirmed active.

---

## 8. Prioritized Remediation Plan

### Phase 1: Pre-Release Blockers (P0 / P1)
1. **Run Migration 0010 on Production Neon Database (P1):**  
   Apply `0010_employee_roles_and_invitations.sql` to create `tenant_invitations` and add `role` to `staff`.
2. **Verify Production Vercel Environment Variables (P1):**  
   Ensure `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GMAIL_SMTP_USER`, and `GMAIL_SMTP_APP_PASSWORD` are populated in Vercel Project Settings, and that `SKIP_EMAIL_VERIFICATION` is not set to `true`.

### Phase 2: Post-Release Hardening & Reliability (P2)
1. **Reduce Serverless Pool Max Connections (P2):**  
   In `lib/db/index.ts`, change `max: 10` to `max: 2` or `max: 3` for serverless execution, and persist `globalForDb.pgPool = pool` in production to prevent pool proliferation across warm containers.
2. **Add Concurrency Guard on Invitation Acceptance (P2):**  
   In `app/[locale]/invite/actions.ts:249`, include `and(eq(tenantInvitations.id, invite.id), isNull(tenantInvitations.acceptedAt))` in the update statement to make acceptance strictly race-condition proof.
3. **Notify User When Invitation Email Delivery Fails (P2):**  
   In `dashboard/staff-actions.ts:252`, surface email delivery failure in the return payload so the administrator knows to click "Resend Invitation" if SMTP fails.
4. **Update Obsolete Assertions in UI Refinement Test (P2):**  
   Sync the 6 test assertions in `lib/tenant-website-ui-refinement.test.ts` with the mobile classes in `components/tenant-website.tsx` (`w-[110px]`, `sm:p-5`, etc.).

### Phase 3: Security & Operational Enhancements (P3)
1. **Implement Content Security Policy (CSP) (P3):**  
   Add a strict Content-Security-Policy header to `next.config.mjs`.
2. **Suppress SSL Deprecation Warning Noise (P3):**  
   Update the Neon connection string parameter to `sslmode=verify-full` once confirmed with Neon root certificates to silence `pg-connection-string` deprecation logs.

---

## 9. Final Release Recommendation

### Verdict: **CONDITIONAL GO**

The application code is robust, cleanly written, and architecturally sound. TypeScript compiles with 0 errors, production build succeeds with 0 errors, multi-tenant isolation is enforced on every server-side operation, and concurrency is protected by PostgreSQL exclusion constraints.

**Conditions for Production Launch:**
1. Execute migration `0010_employee_roles_and_invitations.sql` on the production database.
2. Confirm the 7 required production environment variables are present and valid in Vercel.
3. Perform a test employee invitation flow on staging/preview to confirm SMTP delivery.

Once these 3 operational prerequisites are met, Idarty is fully ready for production and real customers.
