import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { hasPermission, ROLE_PERMISSIONS, requirePermission, type Permission } from './permissions'
import type { MemberRole } from './authz'

describe('Role-Based Access Control (RBAC) definitions', () => {
  it('owner has all permissions including workspace:owner', () => {
    expect(hasPermission('owner', 'workspace:owner')).toBe(true)
    expect(hasPermission('owner', 'team:archive')).toBe(true)
    expect(hasPermission('owner', 'schedule:manage')).toBe(true)
    expect(hasPermission('owner', 'services:manage')).toBe(true)
  })

  it('admin has administrative permissions but cannot delete or transfer workspace', () => {
    expect(hasPermission('admin', 'workspace:owner')).toBe(false)
    expect(hasPermission('admin', 'workspace:manage')).toBe(true)
    expect(hasPermission('admin', 'team:role:manage')).toBe(true)
    expect(hasPermission('admin', 'team:archive')).toBe(true)
    expect(hasPermission('admin', 'schedule:manage')).toBe(true)
  })

  it('manager can manage daily operations but cannot alter workspace settings or role promotions', () => {
    expect(hasPermission('manager', 'schedule:manage')).toBe(true)
    expect(hasPermission('manager', 'services:manage')).toBe(true)
    expect(hasPermission('manager', 'settings:capacity')).toBe(true)
    expect(hasPermission('manager', 'team:invite')).toBe(true)
    expect(hasPermission('manager', 'team:activity:view')).toBe(true)

    expect(hasPermission('manager', 'workspace:manage')).toBe(false)
    expect(hasPermission('manager', 'team:role:manage')).toBe(false)
    expect(hasPermission('manager', 'team:archive')).toBe(false)
  })

  it('receptionist can manage bookings and customers but cannot edit services or schedule', () => {
    expect(hasPermission('receptionist', 'booking:create')).toBe(true)
    expect(hasPermission('receptionist', 'booking:status')).toBe(true)
    expect(hasPermission('receptionist', 'booking:cancel')).toBe(true)
    expect(hasPermission('receptionist', 'customers:view')).toBe(true)
    expect(hasPermission('receptionist', 'customers:edit')).toBe(true)

    // Forbidden backend actions
    expect(hasPermission('receptionist', 'services:manage')).toBe(false)
    expect(hasPermission('receptionist', 'schedule:manage')).toBe(false)
    expect(hasPermission('receptionist', 'team:invite')).toBe(false)
    expect(hasPermission('receptionist', 'team:role:manage')).toBe(false)
    expect(hasPermission('receptionist', 'team:archive')).toBe(false)
    expect(hasPermission('receptionist', 'website:manage')).toBe(false)
    expect(hasPermission('receptionist', 'workspace:manage')).toBe(false)
  })

  it('staff has minimal operational view permissions', () => {
    expect(hasPermission('staff', 'dashboard:view')).toBe(true)
    expect(hasPermission('staff', 'booking:create')).toBe(true)
    expect(hasPermission('staff', 'booking:status')).toBe(true)

    expect(hasPermission('staff', 'booking:cancel')).toBe(false)
    expect(hasPermission('staff', 'services:manage')).toBe(false)
    expect(hasPermission('staff', 'schedule:manage')).toBe(false)
    expect(hasPermission('staff', 'team:invite')).toBe(false)
  })
})

describe('requirePermission backend enforcement', () => {
  it('throws FORBIDDEN and logs audit entry when permission is missing', async () => {
    const { requireTenantAccess } = await import('./authz')
    const { logAudit } = await import('./audit')

    vi.spyOn(await import('./authz'), 'requireTenantAccess').mockResolvedValueOnce({
      session: { user: { id: 'user-receptionist-1' } },
      tenant: { id: 'tenant-1', slug: 'demo' },
      membership: { role: 'receptionist', userId: 'user-receptionist-1' },
    } as any)

    const logAuditSpy = vi.spyOn(await import('./audit'), 'logAudit').mockResolvedValueOnce(undefined as any)

    await expect(
      requirePermission(new Headers(), 'demo', 'services:manage')
    ).rejects.toThrow('FORBIDDEN')

    expect(logAuditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'authz.permission_denied',
        actorUserId: 'user-receptionist-1',
        metadata: expect.objectContaining({
          permission: 'services:manage',
          role: 'receptionist',
        }),
      }),
      expect.any(Headers)
    )
  })

  it('allows access when user has permission', async () => {
    vi.spyOn(await import('./authz'), 'requireTenantAccess').mockResolvedValueOnce({
      session: { user: { id: 'user-manager-1' } },
      tenant: { id: 'tenant-1', slug: 'demo' },
      membership: { role: 'manager', userId: 'user-manager-1' },
    } as any)

    const access = await requirePermission(new Headers(), 'demo', 'services:manage')
    expect(access.membership.role).toBe('manager')
  })
})

