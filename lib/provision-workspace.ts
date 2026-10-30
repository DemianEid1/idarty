// Workspace provisioning.
//
// Extracted from the onboarding server action so the exact same sequence can be
// exercised against a real database (inside a transaction that is rolled back)
// without going through auth. The action owns authentication, validation and
// redirects; this module owns the rows.
//
// Order matters:
//   tenant → translations → membership → primary branch → branch translations
//   → sample service (+ availability) → sample staff (+ branch assignment)
//   → optional working hours.
//
// Nothing here invents data: no working hours are written unless the caller
// supplies a schedule, and the sample service/staff are flagged as samples so
// the Getting Started checklist does not count them as real setup.

import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '@/lib/db/schema'
import {
  branches,
  branchServices,
  branchTranslations,
  memberships,
  serviceTranslations,
  services,
  staff,
  staffBranches,
  staffTranslations,
  tenantTranslations,
  tenants,
  workingHours,
} from '@/lib/db/schema'
import { defaultServiceName, defaultServicePreset, type BusinessType } from '@/lib/business-types'
import type { ScheduleDay } from '@/lib/onboarding-hours'
import { slugifyName } from '@/lib/slug'

// Type-only reference to the app database, so this module can be imported by
// scripts that build their own Drizzle instance (the app's `lib/db` is marked
// `server-only` and cannot be loaded outside Next.js).
export type ProvisionDatabase = NodePgDatabase<typeof schema>
export type ProvisionTransaction = Parameters<Parameters<ProvisionDatabase['transaction']>[0]>[0]

export type ProvisionActor = {
  userId: string
  email: string
  name: string | null
}

export type ProvisionInput = {
  slug: string
  name: string
  tagline: string | null
  businessType: BusinessType
  locale: 'ar' | 'en'
  countryCode: string
  currency: string
  timezone: string
  branchName: string
  branchAddress: string | null
  branchPhone: string | null
  theme: Record<string, string>
  /** `null` means the user skipped working hours; no rows are written. */
  schedule: ScheduleDay[] | null
}

export type ProvisionResult = {
  id: string
  slug: string
  /** The branch created in this call, or null when the workspace already existed. */
  branchId: string | null
}

export async function provisionWorkspace(
  tx: ProvisionTransaction,
  actor: ProvisionActor,
  input: ProvisionInput
): Promise<ProvisionResult> {
  // Retrying the same submission must not create a second workspace (or branch).
  const existing = await tx
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .innerJoin(memberships, eq(memberships.tenantId, tenants.id))
    .where(and(eq(tenants.slug, input.slug), eq(memberships.userId, actor.userId)))
    .limit(1)
  if (existing.length) return { ...existing[0], branchId: null }

  const taken = await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, input.slug)).limit(1)
  if (taken.length) throw Object.assign(new Error('SLUG_TAKEN'), { code: '23505' })

  const [createdTenant] = await tx
    .insert(tenants)
    .values({
      slug: input.slug,
      businessType: input.businessType,
      defaultLocale: input.locale,
      supportedLocales: ['ar', 'en'],
      countryCode: input.countryCode.slice(0, 2),
      currency: input.currency,
      timezone: input.timezone,
      phoneE164: input.branchPhone,
      email: actor.email,
      theme: input.theme,
    })
    .returning({ id: tenants.id, slug: tenants.slug })

  // The public website reads the tenant translation, so the branch address is
  // mirrored here. An empty tagline stays empty — the business type is never
  // reused as marketing copy.
  await tx.insert(tenantTranslations).values(
    (['ar', 'en'] as const).map((locale) => ({
      tenantId: createdTenant.id,
      locale,
      name: input.name,
      tagline: input.tagline,
      address: input.branchAddress,
    }))
  )

  const [ownerMembership] = await tx
    .insert(memberships)
    .values({ tenantId: createdTenant.id, userId: actor.userId, role: 'owner', status: 'active' })
    .returning({ id: memberships.id })

  // --- Primary branch --------------------------------------------------------
  const [primaryBranch] = await tx
    .insert(branches)
    .values({
      tenantId: createdTenant.id,
      slug: slugifyName(input.branchName),
      phoneE164: input.branchPhone,
      isDefault: true,
      isActive: true,
      bookingCapacity: 1,
    })
    .returning({ id: branches.id })

  await tx.insert(branchTranslations).values(
    (['ar', 'en'] as const).map((locale) => ({
      tenantId: createdTenant.id,
      branchId: primaryBranch.id,
      locale,
      name: input.branchName,
      address: input.branchAddress,
    }))
  )

  // --- Sample service and owner ----------------------------------------------
  const preset = defaultServicePreset(input.businessType)
  const [defaultService] = await tx
    .insert(services)
    .values({
      tenantId: createdTenant.id,
      durationMin: preset.durationMin,
      priceAmount: preset.priceAmount,
      sortOrder: 0,
      isSample: true,
    })
    .returning({ id: services.id })

  await tx.insert(serviceTranslations).values(
    (['ar', 'en'] as const).map((locale) => ({
      tenantId: createdTenant.id,
      serviceId: defaultService.id,
      locale,
      name: defaultServiceName(input.businessType, locale),
    }))
  )

  // The sample service is intentionally bookable at the primary branch.
  await tx.insert(branchServices).values({
    tenantId: createdTenant.id,
    branchId: primaryBranch.id,
    serviceId: defaultService.id,
    isAvailable: true,
  })

  const [defaultStaff] = await tx
    .insert(staff)
    .values({
      tenantId: createdTenant.id,
      membershipId: ownerMembership.id,
      role: 'owner' as const,
      email: actor.email,
      sortOrder: 0,
      isSample: true,
    })
    .returning({ id: staff.id })

  const ownerStaffName = actor.name?.trim() || (input.locale === 'ar' ? 'المالك' : 'Owner')
  await tx.insert(staffTranslations).values(
    (['ar', 'en'] as const).map((locale) => ({
      tenantId: createdTenant.id,
      staffId: defaultStaff.id,
      locale,
      name: ownerStaffName,
    }))
  )

  // Location link only — business hours are NOT attached to the staff row, which
  // is what made newly onboarded workspaces unbookable before.
  await tx.insert(staffBranches).values({
    tenantId: createdTenant.id,
    staffId: defaultStaff.id,
    branchId: primaryBranch.id,
    isPrimary: true,
  })

  // --- Optional working hours ------------------------------------------------
  if (input.schedule) {
    const openDays = input.schedule.filter((day) => !day.closed)
    if (openDays.length > 0) {
      await tx.insert(workingHours).values(
        openDays.map((day) => ({
          tenantId: createdTenant.id,
          branchId: primaryBranch.id,
          staffId: null,
          weekday: day.weekday,
          startTime: day.startTime,
          endTime: day.endTime,
          isSample: false,
        }))
      )
    }
  }

  return { ...createdTenant, branchId: primaryBranch.id }
}
