import type { MemberRole } from '@/lib/authz'
import { requireTenantAccess } from '@/lib/authz'
import { logAudit } from '@/lib/audit'
import {
  type Permission,
  ROLE_PERMISSIONS,
  hasPermission,
} from '@/lib/permissions-client'

export type { Permission }
export { ROLE_PERMISSIONS, hasPermission }

const ROLES_HIERARCHY: MemberRole[] = ['receptionist', 'staff', 'manager', 'admin', 'owner']

export function getMinimumRoleForPermission(permission: Permission): MemberRole {
  for (const role of ROLES_HIERARCHY) {
    if (hasPermission(role, permission)) return role
  }
  return 'owner'
}

/**
 * Backend Authorizer: Evaluates permissions and logs violations.
 * Throws FORBIDDEN if the active user's role lacks the required capability.
 */
export async function requirePermission(
  headers: Headers,
  slug: string,
  permission: Permission
) {
  const minRole = getMinimumRoleForPermission(permission)
  const access = await requireTenantAccess(headers, slug, minRole)
  const allowed = hasPermission(access.membership.role, permission)

  if (!allowed) {
    await logAudit(
      {
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
      },
      headers
    )

    throw new Error('FORBIDDEN')
  }

  return access
}
