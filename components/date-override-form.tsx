"use client"

import { useTransition } from 'react'
import { createDateOverride } from '@/app/[locale]/tenants/[slug]/dashboard/override-actions'
import type { Locale } from '@/lib/i18n'
import { useToast } from '@/components/toast'

export function DateOverrideForm({ locale, slug, branchId }: { locale: Locale; slug: string; branchId?: string }) {
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const rtl = locale === 'ar'
  return <form action={(formData) => startTransition(async () => { try { await createDateOverride(formData); toast('success', rtl ? 'تمت إضافة الاستثناء' : 'Override added') } catch { toast('error', rtl ? 'تعذر الإضافة' : 'Could not add override') } })} className="mt-5 grid gap-3 sm:grid-cols-2">
    <input type="hidden" name="locale" value={locale} /><input type="hidden" name="slug" value={slug} />{branchId && <input type="hidden" name="branchId" value={branchId} />}
    <label className="text-sm font-semibold">{rtl ? 'من تاريخ' : 'Start date'}<input required name="startDate" type="date" className="mt-2 h-11 w-full rounded-xl border border-[#e1e5ed] px-3" /></label>
    <label className="text-sm font-semibold">{rtl ? 'إلى تاريخ' : 'End date'}<input required name="endDate" type="date" className="mt-2 h-11 w-full rounded-xl border border-[#e1e5ed] px-3" /></label>
    <label className="text-sm font-semibold">{rtl ? 'نوع الاستثناء' : 'Override type'}<select name="kind" className="mt-2 h-11 w-full rounded-xl border border-[#e1e5ed] px-3"><option value="closed">{rtl ? 'مغلق' : 'Closed'}</option><option value="custom_hours">{rtl ? 'ساعات مخصصة' : 'Custom hours'}</option></select></label>
    <label className="text-sm font-semibold">{rtl ? 'الوصف' : 'Label'}<input name="label" placeholder={rtl ? 'عطلة رسمية' : 'Public holiday'} className="mt-2 h-11 w-full rounded-xl border border-[#e1e5ed] px-3" /></label>
    <label className="text-sm font-semibold">{rtl ? 'وقت البداية' : 'Start time'}<input name="startTime" type="time" className="mt-2 h-11 w-full rounded-xl border border-[#e1e5ed] px-3" /></label>
    <label className="text-sm font-semibold">{rtl ? 'وقت النهاية' : 'End time'}<input name="endTime" type="time" className="mt-2 h-11 w-full rounded-xl border border-[#e1e5ed] px-3" /></label>
    <button disabled={pending} className="h-11 rounded-xl bg-brand-teal px-4 text-sm font-semibold text-white sm:col-span-2">{pending ? '...' : rtl ? 'إضافة استثناء' : 'Add override'}</button>
  </form>
}

import { deleteDateOverride } from '@/app/[locale]/tenants/[slug]/dashboard/override-actions'
import { Trash2 } from 'lucide-react'

export function DateOverrideDeleteButton({ locale, slug, overrideId }: { locale: Locale; slug: string; overrideId: string }) {
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const rtl = locale === 'ar'

  return (
    <form action={(formData) => startTransition(async () => {
      try {
        await deleteDateOverride(formData)
        toast('success', rtl ? 'تم الحذف' : 'Deleted')
      } catch {
        toast('error', rtl ? 'تعذر الحذف' : 'Could not delete')
      }
    })}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="overrideId" value={overrideId} />
      <button disabled={pending} title={rtl ? 'حذف' : 'Delete'} className="p-2 text-ink-muted transition hover:text-red-600 disabled:opacity-50">
        <Trash2 className="h-4 w-4" />
      </button>
    </form>
  )
}
