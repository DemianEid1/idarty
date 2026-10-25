'use client'

import { useState } from 'react'
import { updateWorkspaceSettings } from '@/app/[locale]/tenants/[slug]/dashboard/workspace-actions'
import { businessTypes, businessTypeLabels, defaultWorkspacePlaceholder, type BusinessType } from '@/lib/business-types'
import { publicTenantUrl } from '@/lib/routes'
import { useToast } from '@/components/toast'

export function WorkspaceSettingsForm({
  locale,
  slug,
  currentName,
  currentType,
  currentCapacity = 1,
}: {
  locale: 'ar' | 'en'
  slug: string
  currentName: string
  currentType: BusinessType
  currentCapacity?: number
}) {
  const rtl = locale === 'ar'
  const { toast } = useToast()
  const [isPending, setIsPending] = useState(false)
  const [businessType, setBusinessType] = useState<BusinessType>(currentType)
  
  async function action(formData: FormData) {
    setIsPending(true)
    try {
      await updateWorkspaceSettings(slug, locale, formData)
      toast('success', rtl ? 'تم حفظ التغييرات' : 'Changes saved')
    } catch {
      toast('error', rtl ? 'تعذر الحفظ' : 'Could not save')
    }
    setIsPending(false)
  }

  return (
    <form action={action} className="mt-5 space-y-4">
      <label className="block text-sm font-semibold">{rtl ? 'اسم مساحة العمل' : 'Workspace name'}
        <input name="name" defaultValue={currentName} required minLength={2} maxLength={100} className="mt-2 h-12 w-full rounded-xl border border-[#e1e5ed] bg-surface px-4 text-sm outline-none transition focus:border-brand-teal focus:bg-paper focus:ring-4 focus:ring-brand-teal/10" placeholder={defaultWorkspacePlaceholder(businessType, locale)} />
      </label>
      
      <label className="block text-sm font-semibold">{rtl ? 'نوع النشاط' : 'Business type'}
        <select name="businessType" value={businessType} onChange={(e) => setBusinessType(e.target.value as BusinessType)} className="mt-2 h-12 w-full rounded-xl border border-[#e1e5ed] bg-surface px-4 text-sm outline-none transition focus:border-brand-teal focus:bg-paper focus:ring-4 focus:ring-brand-teal/10">
          {businessTypes.map((type) => <option key={type} value={type}>{businessTypeLabels[type][locale]}</option>)}
        </select>
      </label>

      <label className="block text-sm font-semibold">
        {rtl ? 'سعة الحجوزات المتزامنة' : 'Simultaneous booking capacity'}
        <input
          type="number"
          name="bookingCapacity"
          defaultValue={currentCapacity}
          min={1}
          max={100}
          required
          className="mt-2 h-12 w-full rounded-xl border border-[#e1e5ed] bg-surface px-4 text-sm outline-none transition focus:border-brand-teal focus:bg-paper focus:ring-4 focus:ring-brand-teal/10"
        />
        <span className="mt-1 block text-xs text-ink-muted">
          {rtl
            ? 'أقصى عدد من الحجوزات النشطة التي يمكن استقبالها في نفس الوقت (بحد أدنى 1).'
            : 'Maximum number of active bookings that can be hosted at the same time (minimum 1).'}
        </span>
      </label>
      
      <label className="block text-sm font-semibold opacity-70 cursor-not-allowed">{rtl ? 'الرابط المختصر (غير قابل للتعديل)' : 'Workspace URL (Disabled)'}
        <div className="mt-2 flex items-center overflow-hidden rounded-xl border border-[#e1e5ed] bg-gray-50 opacity-60">
          <span className="max-w-[55%] truncate px-4 text-sm text-[#9aa3b2]" dir="ltr">{publicTenantUrl(locale, '')}</span>
          <input disabled value={slug} className="h-12 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm outline-none placeholder:text-left rtl:text-left rtl:pl-4 cursor-not-allowed" dir="ltr" />
        </div>
      </label>
      
      <button type="submit" disabled={isPending} className="mt-6 flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-teal px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0d6560] disabled:opacity-60">
        {isPending ? (rtl ? 'جاري الحفظ...' : 'Saving...') : (rtl ? 'حفظ التغييرات' : 'Save changes')}
      </button>
    </form>
  )
}
