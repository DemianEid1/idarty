'use client'

import { useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Building2 } from 'lucide-react'
import type { Locale } from '@/lib/i18n'

export type SwitcherBranch = {
  id: string
  name: string
  isDefault: boolean
}

export function DashboardBranchSwitcher({
  branches,
  locale,
  slug,
  initialBranchId,
}: {
  branches: SwitcherBranch[]
  locale: Locale
  slug?: string
  initialBranchId?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const rtl = locale === 'ar'

  // If there's 0 or only 1 branch, no switcher is needed
  if (branches.length <= 1) {
    if (branches.length === 1) {
      return (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-[#374151]">
          <Building2 className="h-3.5 w-3.5 text-brand-teal" aria-hidden="true" />
          <span className="truncate max-w-[140px]">{branches[0].name}</span>
        </div>
      )
    }
    return null
  }

  const currentBranchId = searchParams.get('branch') || initialBranchId || 'all'

  const handleBranchChange = (newBranchId: string) => {
    // Persist to cookie so the selection remains constant across all dashboard pages & reloads
    if (slug) {
      try {
        if (!newBranchId || newBranchId === 'all') {
          document.cookie = `idarty_branch_${slug}=all; path=/; max-age=31536000; SameSite=Lax`
        } else {
          document.cookie = `idarty_branch_${slug}=${newBranchId}; path=/; max-age=31536000; SameSite=Lax`
        }
      } catch {}
    }

    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (!newBranchId || newBranchId === 'all') {
        params.delete('branch')
      } else {
        params.set('branch', newBranchId)
      }
      // Reset page back to 1 when changing branch filter
      params.delete('page')
      router.replace(`${pathname}?${params.toString()}`)
    })
  }

  return (
    <div className="relative inline-flex items-center">
      <label htmlFor="branch-switcher" className="sr-only">
        {rtl ? 'تصفية حسب الفرع' : 'Filter by branch'}
      </label>
      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-paper px-2.5 py-1.5 shadow-xs transition focus-within:border-brand-teal focus-within:ring-2 focus-within:ring-brand-teal/20">
        <Building2
          className={`h-4 w-4 shrink-0 ${pending ? 'animate-pulse text-brand-teal' : 'text-brand-teal'}`}
          aria-hidden="true"
        />
        <select
          id="branch-switcher"
          value={currentBranchId}
          disabled={pending}
          onChange={(e) => handleBranchChange(e.target.value)}
          className="bg-transparent text-xs font-semibold text-[#172033] outline-none cursor-pointer pr-1 rtl:pr-0 rtl:pl-1 disabled:opacity-60"
        >
          <option value="all">{rtl ? 'جميع الفروع (الكل)' : 'All Branches'}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} {b.isDefault ? (rtl ? '★ الافتراضي' : '★ Default') : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

