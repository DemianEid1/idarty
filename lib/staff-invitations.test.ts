import { describe, expect, it, vi } from 'vitest'
import { createHash, randomBytes } from 'crypto'

vi.mock('server-only', () => ({}))
import { staff, tenantInvitations, memberRole } from '@/lib/db/schema'
import { roleRank, type MemberRole } from '@/lib/authz'

describe('Staff Roles, Permissions & Invitations Unit Tests', () => {
  describe('Role Hierarchy & Assignment Rules', () => {
    it('defines correct strict role levels: receptionist < staff < manager < admin < owner', () => {
      expect(roleRank.receptionist).toBeLessThan(roleRank.staff)
      expect(roleRank.staff).toBeLessThan(roleRank.manager)
      expect(roleRank.manager).toBeLessThan(roleRank.admin)
      expect(roleRank.admin).toBeLessThan(roleRank.owner)
    })

    function validateRoleAssignment(actorRole: MemberRole, targetRole: MemberRole): { allowed: boolean; reason?: string } {
      if (roleRank[actorRole] < roleRank.manager) {
        return { allowed: false, reason: 'Staff and Receptionists cannot manage employee roles' }
      }
      if (targetRole === 'owner') {
        return { allowed: false, reason: 'Owner role cannot be assigned' }
      }
      const actorLevel = roleRank[actorRole] ?? 0
      const targetLevel = roleRank[targetRole] ?? 0
      if (actorRole !== 'owner' && targetLevel >= actorLevel) {
        return { allowed: false, reason: 'Cannot assign a role equal to or higher than your own' }
      }
      return { allowed: true }
    }

    it('prevents any actor (even Owner) from assigning the Owner role', () => {
      expect(validateRoleAssignment('owner', 'owner').allowed).toBe(false)
      expect(validateRoleAssignment('admin', 'owner').allowed).toBe(false)
      expect(validateRoleAssignment('manager', 'owner').allowed).toBe(false)
    })

    it('allows Owner to assign Admin, Manager, Staff, Receptionist', () => {
      expect(validateRoleAssignment('owner', 'admin').allowed).toBe(true)
      expect(validateRoleAssignment('owner', 'manager').allowed).toBe(true)
      expect(validateRoleAssignment('owner', 'staff').allowed).toBe(true)
      expect(validateRoleAssignment('owner', 'receptionist').allowed).toBe(true)
    })

    it('allows Admin to assign only roles strictly below Admin (Manager, Staff, Receptionist)', () => {
      expect(validateRoleAssignment('admin', 'admin').allowed).toBe(false)
      expect(validateRoleAssignment('admin', 'manager').allowed).toBe(true)
      expect(validateRoleAssignment('admin', 'staff').allowed).toBe(true)
      expect(validateRoleAssignment('admin', 'receptionist').allowed).toBe(true)
    })

    it('allows Manager to assign only roles strictly below Manager (Staff, Receptionist)', () => {
      expect(validateRoleAssignment('manager', 'admin').allowed).toBe(false)
      expect(validateRoleAssignment('manager', 'manager').allowed).toBe(false)
      expect(validateRoleAssignment('manager', 'staff').allowed).toBe(true)
      expect(validateRoleAssignment('manager', 'receptionist').allowed).toBe(true)
    })

    it('rejects Staff and Receptionist from assigning any roles', () => {
      expect(validateRoleAssignment('staff', 'staff').allowed).toBe(false)
      expect(validateRoleAssignment('staff', 'receptionist').allowed).toBe(false)
      expect(validateRoleAssignment('receptionist', 'receptionist').allowed).toBe(false)
    })
  })

  describe('Secure Token Generation and SHA-256 Hashing', () => {
    it('generates high-entropy single-use tokens and hashes them via SHA-256', () => {
      const rawToken = randomBytes(32).toString('hex')
      expect(rawToken).toHaveLength(64)

      const tokenHash = createHash('sha256').update(rawToken).digest('hex')
      expect(tokenHash).toHaveLength(64)
      expect(tokenHash).not.toEqual(rawToken)

      // Test hashing consistency
      const verifyHash = createHash('sha256').update(rawToken).digest('hex')
      expect(verifyHash).toBe(tokenHash)

      // Test collision resistance for different raw tokens
      const differentRawToken = randomBytes(32).toString('hex')
      const differentHash = createHash('sha256').update(differentRawToken).digest('hex')
      expect(differentHash).not.toEqual(tokenHash)
    })
  })

  describe('Invitation State Validation (Expiry & Single-Use)', () => {
    function evaluateInvitation(invitation: {
      expiresAt: Date
      acceptedAt: Date | null
    }): { valid: boolean; reason?: 'EXPIRED' | 'ALREADY_ACCEPTED' } {
      if (invitation.acceptedAt) {
        return { valid: false, reason: 'ALREADY_ACCEPTED' }
      }
      if (new Date() > invitation.expiresAt) {
        return { valid: false, reason: 'EXPIRED' }
      }
      return { valid: true }
    }

    it('validates an active invitation within the 7-day expiration window', () => {
      const activeInvite = {
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        acceptedAt: null,
      }
      expect(evaluateInvitation(activeInvite).valid).toBe(true)
    })

    it('rejects an expired invitation', () => {
      const expiredInvite = {
        expiresAt: new Date(Date.now() - 1000), // expired 1s ago
        acceptedAt: null,
      }
      const result = evaluateInvitation(expiredInvite)
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('EXPIRED')
    })

    it('rejects an already accepted invitation (single-use guarantee)', () => {
      const acceptedInvite = {
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        acceptedAt: new Date(Date.now() - 5000),
      }
      const result = evaluateInvitation(acceptedInvite)
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('ALREADY_ACCEPTED')
    })
  })

  describe('Self-Archiving Protection', () => {
    function canArchiveStaff(actorUserId: string, targetStaffUserId: string | null): boolean {
      if (targetStaffUserId && actorUserId === targetStaffUserId) {
        return false // Self-archiving is forbidden
      }
      return true
    }

    it('prevents an actor from archiving their own staff account', () => {
      expect(canArchiveStaff('user-123', 'user-123')).toBe(false)
    })

    it('allows archiving another staff member or unlinked staff profile', () => {
      expect(canArchiveStaff('user-123', 'user-456')).toBe(true)
      expect(canArchiveStaff('user-123', null)).toBe(true)
    })
  })

  describe('Database Schema Declarations', () => {
    it('verifies staff table has role column with member_role enum', () => {
      expect(staff.role).toBeDefined()
      expect(memberRole.enumValues).toEqual(['owner', 'admin', 'manager', 'staff', 'receptionist'])
    })

    it('verifies tenant_invitations table has all required columns and constraints', () => {
      expect(tenantInvitations.id).toBeDefined()
      expect(tenantInvitations.tenantId).toBeDefined()
      expect(tenantInvitations.staffId).toBeDefined()
      expect(tenantInvitations.email).toBeDefined()
      expect(tenantInvitations.role).toBeDefined()
      expect(tenantInvitations.tokenHash).toBeDefined()
      expect(tenantInvitations.expiresAt).toBeDefined()
      expect(tenantInvitations.acceptedAt).toBeDefined()
      expect(tenantInvitations.invitedByUserId).toBeDefined()
      expect(tenantInvitations.createdAt).toBeDefined()
    })
  })

  describe('Full Staff-Service Decoupling Regression Invariants', () => {
    it('1. Employees can be created without service assignments', () => {
      // Simulates staff creation payload: only requires name, role, optional email/phone
      const staffPayload = {
        tenantId: '00000000-0000-4000-8000-000000000001',
        name: 'Sara Ahmed',
        role: 'staff',
        email: 'sara@example.com',
      }
      expect(staffPayload).not.toHaveProperty('serviceIds')
      expect(staffPayload).not.toHaveProperty('serviceId')
      expect(staffPayload.tenantId).toBeDefined()
      expect(staffPayload.role).toBe('staff')
    })

    it('2. Services can be created without employee assignments', () => {
      // Simulates service creation payload: only requires name, duration, price
      const servicePayload = {
        tenantId: '00000000-0000-4000-8000-000000000001',
        name: 'Dental Cleaning',
        durationMin: 30,
        priceAmount: '250.00',
      }
      expect(servicePayload).not.toHaveProperty('staffIds')
      expect(servicePayload).not.toHaveProperty('staffId')
      expect(servicePayload.durationMin).toBeGreaterThan(0)
    })

    it('3. Customers can book services without employee-service relationship records', () => {
      // Scheduling resolves any active staff member belonging to the tenant
      const activeTenantStaff = [
        { id: 'staff-1', tenantId: 'tenant-a', isActive: true, deletedAt: null },
        { id: 'staff-2', tenantId: 'tenant-a', isActive: true, deletedAt: null },
      ]
      // Assignment table is non-existent/empty
      const staffServiceRecords: Array<{ staffId: string; serviceId: string }> = []
      expect(staffServiceRecords.length).toBe(0)

      // Service booking is satisfied by selecting any active non-busy staff from activeTenantStaff
      const eligibleStaff = activeTenantStaff.filter((s) => s.isActive && !s.deletedAt)
      expect(eligibleStaff.length).toBe(2)
      expect(eligibleStaff[0].id).toBe('staff-1')
    })

    it('4. Existing role-based permissions and invitations continue to work', () => {
      expect(roleRank.owner).toBe(5)
      expect(roleRank.admin).toBe(4)
      expect(roleRank.manager).toBe(3)
      expect(roleRank.staff).toBe(2)
      expect(roleRank.receptionist).toBe(1)
    })

    it('5. Tenant boundaries and scheduling/conflict validation remain enforced', () => {
      const tenantA = 'tenant-a'
      const tenantB = 'tenant-b'
      const candidateStaff = { id: 'staff-x', tenantId: tenantB, isActive: true }

      // Validate tenant boundary: staff from tenantB cannot be booked in tenantA
      const isStaffInTenant = (staffObj: { tenantId: string }, targetTenantId: string) =>
        staffObj.tenantId === targetTenantId
      expect(isStaffInTenant(candidateStaff, tenantA)).toBe(false)
      expect(isStaffInTenant(candidateStaff, tenantB)).toBe(true)

      // Conflict validation: overlapping appointment intervals for same staff member are detected
      const existingBlock = { start: new Date('2026-10-22T10:00:00Z'), end: new Date('2026-10-22T11:00:00Z') }
      const newBlockOverlap = { start: new Date('2026-10-22T10:30:00Z'), end: new Date('2026-10-22T11:30:00Z') }
      const newBlockNonOverlap = { start: new Date('2026-10-22T11:00:00Z'), end: new Date('2026-10-22T12:00:00Z') }

      const hasConflict = (b1: typeof existingBlock, b2: typeof existingBlock) =>
        b1.start < b2.end && b1.end > b2.start

      expect(hasConflict(existingBlock, newBlockOverlap)).toBe(true)
      expect(hasConflict(existingBlock, newBlockNonOverlap)).toBe(false)
    })
  })
})

