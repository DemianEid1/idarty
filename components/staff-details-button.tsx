'use client'

import { useState } from 'react'
import { User } from 'lucide-react'
import type { Locale } from '@/lib/i18n'
import type { MemberRole } from '@/lib/authz'
import { StaffDetailsDrawer, type StaffDrawerMember } from '@/components/staff-details-drawer'

interface StaffDetailsButtonProps {
  locale: Locale
  slug: string
  callerRole: MemberRole
  staffMember: StaffDrawerMember
  stats?: {
    bookingsCount: number
    confirmedCount: number
    noShowCount: number
  }
}

export function StaffDetailsButton({
  locale,
  slug,
  callerRole,
  staffMember,
  stats,
}: StaffDetailsButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const rtl = locale === 'ar'

  // Access restricted strictly to Owner and Supervisor (Admin) only
  if (callerRole !== 'owner' && callerRole !== 'admin') {
    return null
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border border-border bg-paper px-3 py-1.5 text-xs font-semibold text-[#172033] outline-none transition hover:border-brand-teal hover:text-brand-teal focus-visible:ring-2 focus-visible:ring-brand-teal cursor-pointer shadow-2xs"
        aria-label={rtl ? `عرض بيانات ${staffMember.name}` : `View details for ${staffMember.name}`}
      >
        <User className="h-3.5 w-3.5 text-brand-teal" />
        <span>{rtl ? 'بيانات الموظف' : 'Employee Data'}</span>
      </button>

      {isOpen && (
        <StaffDetailsDrawer
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          locale={locale}
          slug={slug}
          callerRole={callerRole}
          staffMember={staffMember}
          stats={stats}
        />
      )}
    </>
  )
}
