'use client'

import { useState, useTransition } from 'react'
import { createService } from '@/app/[locale]/tenants/[slug]/dashboard/actions'
import type { Locale } from '@/lib/i18n'
import { useToast } from '@/components/toast'

/**
 * The ONE service-creation form in the app.
 *
 * Used by the Dashboard "Services" tab and by the Website Builder's services
 * panel. It submits to the existing `createService` server action, so
 * validation, authorization, tenant isolation and error handling are shared —
 * there is no second creation path.
 *
 * `onSuccess` is optional: the Dashboard does not need it (its own revalidate
 * refreshes the page), while the Website Builder uses it to refresh the list it
 * displays. Passing it must not change anything else.
 */
export function ServiceForm({ locale, slug, onSuccess }: { locale: Locale; slug: string; onSuccess?: () => void }) {
  const rtl = locale === 'ar'
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  return <form dir={rtl ? 'rtl' : 'ltr'} action={(formData) => { setMessage(''); startTransition(async () => { try { await createService(formData); const msg = rtl ? 'تمت إضافة الخدمة.' : 'Service added.'; setMessage(msg); toast('success', msg); onSuccess?.() } catch { const msg = rtl ? 'تعذر إضافة الخدمة.' : 'Could not add service.'; setMessage(msg); toast('error', msg) } }) }} className="mt-5 grid gap-3 sm:grid-cols-2">
    <input type="hidden" name="slug" value={slug} /><input type="hidden" name="locale" value={locale} />
    <label className="text-sm font-medium">{rtl ? 'اسم الخدمة' : 'Service name'}<input required name="name" className="mt-1 h-11 w-full rounded-xl border border-[#e1e5ed] px-3 outline-none focus:border-brand-teal" /></label>
    <label className="text-sm font-medium">{rtl ? 'المدة بالدقائق' : 'Duration in minutes'}<input required name="durationMin" type="number" min="15" step="15" defaultValue="60" className="mt-1 h-11 w-full rounded-xl border border-[#e1e5ed] px-3 outline-none focus:border-brand-teal" /></label>
    <label className="text-sm font-medium">{rtl ? 'السعر' : 'Price'}<input required name="priceAmount" type="number" min="0" step="0.01" defaultValue="0" className="mt-1 h-11 w-full rounded-xl border border-[#e1e5ed] px-3 outline-none focus:border-brand-teal" /></label>
    <label className="text-sm font-medium">{rtl ? 'الوصف' : 'Description'}<input name="description" className="mt-1 h-11 w-full rounded-xl border border-[#e1e5ed] px-3 outline-none focus:border-brand-teal" /></label>
    <div className="sm:col-span-2 flex items-center justify-between gap-3"><button disabled={pending} className="rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{pending ? (rtl ? 'جارٍ الحفظ...' : 'Saving...') : (rtl ? 'إضافة خدمة' : 'Add service')}</button>{message && <p role="status" className="text-sm text-[#24865b]">{message}</p>}</div>
  </form>
}
