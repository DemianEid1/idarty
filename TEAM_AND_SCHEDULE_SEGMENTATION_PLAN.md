# Architecture & Implementation Plan: Team Segmentation, Schedule Relocation, RBAC Enforcement & Activity History

**Version:** 1.0.0  
**Status:** Proposal / Specification  
**Author:** Senior Frontend & Security Engineering  
**Scope:** Idarty Tenant Dashboard (`app/[locale]/tenants/[slug]/dashboard/`)

---

## 1. Executive Summary

This specification addresses three foundational evolutions of the Idarty dashboard:
1. **Domain Segmentation:** Disentangle the current `الفريق والجدول` ("Team & Schedule") tab into two distinct operational hubs:
   - **`team` (الفريق):** Dedicated Staff Directory, Role Management, and Employee Profile with Activity Audit History.
   - **`schedule` (ساعات العمل والجدول):** Business Availability, Operating Hours, Date Overrides/Holidays, and Booking Capacity.
2. **Backend-Enforced Roles & Permissions (RBAC):** Move beyond coarse rank-checking and UI badge displays to a granular, backend-enforced permission model where every Server Action strictly authorizes the user's role before mutating data.
3. **Staff Activity History (Audit Feed):** Expose individual staff activity logs (bookings created, status changes, cancellations, reschedules) in an Employee Detail Drawer backed by the existing `audit_logs` infrastructure.

---

## 2. Current State Audit & Architectural Challenges

### Current Layout Issues
* **Cognitive Mismatch:** The current `team` tab renders Staff rows, the "Add Staff" form, Weekly Working Hours, and Date Overrides in a single, vertically stacked view.
* **Overcrowding:** Staff management (HR/access) and working hours (business operations) compete for attention, limiting the depth of data that can be shown for either.
* **Zero Traces of Staff-Service Coupling:** Confirmed that `staff_services` has been permanently dropped from both database schema and actions. Staff members are operators, not service assignees.

### Current Authorization Limitations
* `requireTenantAccess(headers, slug, minimumRole)` in `lib/authz.ts` uses a numeric rank comparison (`roleRank = { receptionist: 1, staff: 2, manager: 3, admin: 4, owner: 5 }`).
* While this establishes a baseline hierarchy, it lacks **fine-grained capability enforcement**:
  - Some mutating actions default to `receptionist` or lack explicit role constraints.
  - UI hides buttons, but if a malicious user invokes server actions directly (e.g. via Next.js action IDs), coarse checks can permit unintended mutations.
  - Granular permissions (e.g., "Can Receptionist change working hours? No. Can Receptionist cancel bookings? Yes.") must be hard-coded into single, reusable permission gates.

---

## 3. Information Architecture & Navigation Segmentation

### 3.1 Updated Navigation Matrix

```
Existing Nav (7 items)                 Target Nav (7 or 8 items)
----------------------                 -------------------------
1. Overview (نظرة عامة)            ->  1. Overview (نظرة عامة)
2. Bookings (الحجوزات)             ->  2. Bookings (الحجوزات)
3. Customers (العملاء)             ->  3. Customers (العملاء)
4. Services (الخدمات)              ->  4. Services (الخدمات)
5. Team & Schedule (الفريق والجدول)->  5. Team (الفريق)          [DEDICATED]
6. Website (الموقع)                ->  6. Schedule (ساعات العمل) [DEDICATED]
7. Settings (الإعدادات)            ->  7. Website (الموقع)
                                       8. Settings (الإعدادات)
```

*(Alternative: Schedule can be placed as a primary tab `schedule` or housed inside `settings` under an "Operating Hours & Schedule" section. Given that appointments rely on schedule, a dedicated `schedule` tab or keeping it clearly segmented provides the best daily ergonomics.)*

### 3.2 Backward Compatibility & Safe Redirects
* Any saved link or existing bookmark to `?tab=team` continues to open the dedicated **Team Directory**.
* Direct links to `?tab=schedule` open the new **Operating Hours & Overrides** hub.
* Breadcrumbs, mobile drawer (`DashboardMobileNav`), and desktop sidebar links are kept 100% in sync via `lib/dashboard-nav.tsx`.

---

## 4. Granular Roles & Permissions (Backend-Enforced RBAC)

### 4.1 The Five Role Personas

| Role | Arabic | System Role | Intended User |
| :--- | :--- | :--- | :--- |
| **`owner`** | مالك | Full Tenancy Owner | Salon/business owner; owns billing, deletion, and all settings |
| **`admin`** | مشرف | General Administrator | Trusted partner; manages entire workspace except transferring ownership |
| **`manager`** | مدير | Operations Manager | Shift supervisor; manages staff, services catalog, and working hours |
| **`staff`** | عضو فريق | Standard Staff | Internal operator; views calendar and bookings |
| **`receptionist`** | موظف استقبال | Front Desk | Frontline desk; creates walk-ins, checks clients in, takes calls |

---

### 4.2 Comprehensive Capabilities & Enforcement Matrix

| Capability / Action | Owner | Admin | Manager | Staff | Receptionist | Server Action Enforcement Gate |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **View Dashboard & Calendar** | ✅ | ✅ | ✅ | ✅ | ✅ | `requirePermission('dashboard:view')` (receptionist+) |
| **Create Walk-in / Phone Booking** | ✅ | ✅ | ✅ | ✅ | ✅ | `requirePermission('booking:create')` (receptionist+) |
| **Update Booking Status (Complete/No-Show)**| ✅ | ✅ | ✅ | ✅ | ✅ | `requirePermission('booking:status')` (receptionist+) |
| **Cancel / Reschedule Booking** | ✅ | ✅ | ✅ | ❌ | ✅ | `requirePermission('booking:cancel')` (receptionist+) |
| **View Customer Directory** | ✅ | ✅ | ✅ | ✅ | ✅ | `requirePermission('customers:view')` (receptionist+) |
| **Edit Customer Notes / Phone** | ✅ | ✅ | ✅ | ❌ | ✅ | `requirePermission('customers:edit')` (receptionist+) |
| **View Services Catalog** | ✅ | ✅ | ✅ | ✅ | ✅ | `requirePermission('services:view')` (receptionist+) |
| **Create / Edit / Archive Services** | ✅ | ✅ | ✅ | ❌ | ❌ | `requirePermission('services:manage')` (manager+) |
| **View Working Hours & Overrides** | ✅ | ✅ | ✅ | ✅ | ✅ | `requirePermission('schedule:view')` (receptionist+) |
| **Edit Working Hours & Overrides** | ✅ | ✅ | ✅ | ❌ | ❌ | `requirePermission('schedule:manage')` (manager+) |
| **Update Tenant Booking Capacity** | ✅ | ✅ | ✅ | ❌ | ❌ | `requirePermission('settings:capacity')` (manager+) |
| **View Team Directory** | ✅ | ✅ | ✅ | ✅ | ✅ | `requirePermission('team:view')` (receptionist+) |
| **View Staff Activity History** | ✅ | ✅ | ✅ | ❌ | ❌ | `requirePermission('team:activity:view')` (manager+) |
| **Invite Staff / Add Employee** | ✅ | ✅ | ✅ | ❌ | ❌ | `requirePermission('team:invite')` (manager+) |
| **Resend / Revoke Invitation** | ✅ | ✅ | ✅ | ❌ | ❌ | `requirePermission('team:invite')` (manager+) |
| **Edit Staff Role / Demote / Promote**| ✅ | ✅ | ⚠️ *(Staff only)*| ❌ | ❌ | `requirePermission('team:role:manage')` (admin+) |
| **Archive / Deactivate Staff Member**| ✅ | ✅ | ⚠️ *(Staff only)*| ❌ | ❌ | `requirePermission('team:archive')` (admin+) |
| **Edit Website Builder & Publish** | ✅ | ✅ | ✅ | ❌ | ❌ | `requirePermission('website:manage')` (manager+) |
| **Modify Workspace Settings & Name** | ✅ | ✅ | ❌ | ❌ | ❌ | `requirePermission('workspace:manage')` (admin+) |
| **Transfer Ownership / Delete Tenant**| ✅ | ❌ | ❌ | ❌ | ❌ | `requirePermission('workspace:owner')` (owner only) |

---

### 4.3 Backend Enforcement Implementation Pattern

Create a centralized permission module in `lib/permissions.ts`:

```typescript
export type Permission =
  | 'dashboard:view'
  | 'booking:create'
  | 'booking:status'
  | 'booking:cancel'
  | 'customers:view'
  | 'customers:edit'
  | 'services:view'
  | 'services:manage'
  | 'schedule:view'
  | 'schedule:manage'
  | 'settings:capacity'
  | 'team:view'
  | 'team:activity:view'
  | 'team:invite'
  | 'team:role:manage'
  | 'team:archive'
  | 'website:manage'
  | 'workspace:manage'
  | 'workspace:owner'

export const ROLE_PERMISSIONS: Record<MemberRole, readonly Permission[]> = {
  receptionist: [
    'dashboard:view',
    'booking:create',
    'booking:status',
    'booking:cancel',
    'customers:view',
    'customers:edit',
    'services:view',
    'schedule:view',
    'team:view',
  ],
  staff: [
    'dashboard:view',
    'booking:create',
    'booking:status',
    'customers:view',
    'services:view',
    'schedule:view',
    'team:view',
  ],
  manager: [
    'dashboard:view',
    'booking:create',
    'booking:status',
    'booking:cancel',
    'customers:view',
    'customers:edit',
    'services:view',
    'services:manage',
    'schedule:view',
    'schedule:manage',
    'settings:capacity',
    'team:view',
    'team:activity:view',
    'team:invite',
    'website:manage',
  ],
  admin: [
    // All manager permissions + workspace administration
    'dashboard:view',
    'booking:create',
    'booking:status',
    'booking:cancel',
    'customers:view',
    'customers:edit',
    'services:view',
    'services:manage',
    'schedule:view',
    'schedule:manage',
    'settings:capacity',
    'team:view',
    'team:activity:view',
    'team:invite',
    'team:role:manage',
    'team:archive',
    'website:manage',
    'workspace:manage',
  ],
  owner: [
    // Everything including billing and destruction
    'dashboard:view',
    'booking:create',
    'booking:status',
    'booking:cancel',
    'customers:view',
    'customers:edit',
    'services:view',
    'services:manage',
    'schedule:view',
    'schedule:manage',
    'settings:capacity',
    'team:view',
    'team:activity:view',
    'team:invite',
    'team:role:manage',
    'team:archive',
    'website:manage',
    'workspace:manage',
    'workspace:owner',
  ],
}

/**
 * Backend Authorizer: Evaluates permissions and logs violations.
 */
export async function requirePermission(
  headers: Headers,
  slug: string,
  permission: Permission
) {
  // Resolves membership and tenant
  const access = await requireTenantAccess(headers, slug, 'receptionist')
  const allowed = ROLE_PERMISSIONS[access.membership.role].includes(permission)

  if (!allowed) {
    await logAudit({
      actorUserId: access.session.user.id,
      tenantId: access.tenant.id,
      action: 'authz.permission_denied',
      entityType: 'tenant',
      entityId: access.tenant.id,
      metadata: {
        permission,
        role: access.membership.role,
        slug,
      },
    }, headers)

    throw new Error('FORBIDDEN')
  }

  return access
}
```

---

## 5. Employee Profile & Activity History Architecture

### 5.1 Data Model & Audit Logs Re-use
Idarty already maintains an `audit_logs` table:
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  actor_user_id TEXT REFERENCES "user"(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Query Strategy for Staff Activity
When viewing staff member $X$:
1. If staff member is active (`membership_id` is linked to `user_id`):
   ```sql
   SELECT id, action, entity_type, entity_id, metadata, created_at
   FROM audit_logs
   WHERE tenant_id = :tenantId
     AND actor_user_id = :userId
   ORDER BY created_at DESC
   LIMIT 50;
   ```
2. The result formats into human-readable, localized Arabic/English activity cards:
   - `booking.created` -> *"قام بإنشاء حجز جديد للعميل حسن"* (Created booking for Hassan)
   - `booking.status_change` -> *"قام بتحديث حالة الحجز إلى: مكتمل"* (Updated booking status to: Completed)
   - `booking.cancelled` -> *"قام بإلغاء حجز"* (Cancelled booking)

### 5.2 UI Component: Staff Profile Slide-Over Drawer
Instead of cluttering the main table, clicking an employee opens `<StaffProfileDrawer>`:

```
┌────────────────────────────────────────────────────────┐
│  تفاصيل عضو الفريق                                [X]  │
├────────────────────────────────────────────────────────┤
│  [Avatar] Sameh Sanad                                  │
│  sameh.eid77@gmail.com · +201012345678                │
│  [ موظف استقبال ]  [ مفعّل ● ]                         │
├────────────────────────────────────────────────────────┤
│  Tabs: [ سجل النشاطات (Activity) ] [ الصلاحيات ]       │
├────────────────────────────────────────────────────────┤
│  سجل النشاطات الحديثة:                                 │
│                                                        │
│  • 25 أكتوبر 04:30 م                                   │
│    قام بتأكيد حجز #104 للعميل: أحمد علي               │
│                                                        │
│  • 25 أكتوبر 02:15 م                                   │
│    قام بإنشاء حجز يدوي للعميل: سارة محمود              │
│                                                        │
│  • 24 أكتوبر 11:00 ص                                   │
│    قام بتسجيل الدخول إلى لوحة التحكم                   │
├────────────────────────────────────────────────────────┤
│  [تعديل البيانات]               [أرشفة الموظف (Admin)] │
└────────────────────────────────────────────────────────┘
```

---

## 6. Implementation Milestones

### Milestone 1: Permission Enforcement Primitives (Backend First)
- [ ] Create `lib/permissions.ts` with strict role-to-permission mapping.
- [ ] Refactor server actions in:
  - `hours-actions.ts` -> require `schedule:manage`
  - `override-actions.ts` -> require `schedule:manage`
  - `workspace-actions.ts` -> require `settings:capacity` or `workspace:manage`
  - `staff-actions.ts` -> require `team:invite`, `team:role:manage`, `team:archive`
  - `actions.ts` (services) -> require `services:manage`
  - `booking-actions.ts` -> require `booking:cancel`
- [ ] Unit tests in `lib/rbac.test.ts` verifying unauthorized roles throw `FORBIDDEN` and log security audit entries.

### Milestone 2: Navigation & Tab Segmentation
- [ ] Update `lib/dashboard-nav.tsx`:
  - Split `team` into `team` (الفريق) and `schedule` (ساعات العمل).
  - Update nav icons: `Users` for Team, `Clock` or `CalendarDays` for Schedule.
- [ ] Update `app/[locale]/tenants/[slug]/dashboard/page.tsx`:
  - `tab === 'team'` renders purely Staff Directory and Add Staff.
  - `tab === 'schedule'` renders Working Hours and Date Overrides.

### Milestone 3: Staff Profile & Activity History
- [ ] Create server action `getStaffActivityHistory(staffId, tenantSlug)`.
- [ ] Build `<StaffProfileDrawer>` using `@base-ui/react` dialog/sheet primitives.
- [ ] Implement localized activity timeline formatters.
- [ ] Render "View Profile / عرض الملف" trigger on each staff card.

### Milestone 4: Verification & Regression Testing
- [ ] Full Vitest suite run (`npm test`).
- [ ] Audit logs verification in test database.
- [ ] Typecheck pass (`tsc --noEmit`).

---

## 7. Approval & Next Steps

This plan provides a clear, scalable roadmap. Upon your review and approval:
1. We can begin with **Milestone 1** (Backend RBAC enforcement and tests).
2. Follow up with **Milestone 2** (UI tab segmentation).
3. Conclude with **Milestone 3** (The Activity Drawer).
