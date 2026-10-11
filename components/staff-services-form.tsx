"use client"

import { useFormStatus } from 'react-dom'
import { updateStaffServices } from '@/app/[locale]/tenants/[slug]/dashboard/staff-actions'
import { useToast } from '@/components/toast'

export function StaffServicesForm({ slug, locale, staffId, services, selected }: { slug: string; locale: 'ar' | 'en'; staffId: string; services: Array<{ id: string; name: string }>; selected: string[] }) {
  const { toast } = useToast()
  const rtl = locale === 'ar'
  return <form action={async (formData) => { try { await updateStaffServices(formData); toast('success', rtl ? 'تم حفظ الخدمات' : 'Services saved') } catch { toast('error', rtl ? 'تعذر الحفظ' : 'Could not save') } }} className="mt-3 rounded-xl border border-[#e3e8f4] bg-paper p-3"><input type="hidden" name="slug" value={slug} /><input type="hidden" name="locale" value={locale} /><input type="hidden" name="staffId" value={staffId} /><p className="text-xs font-semibold text-ink-muted">{rtl ? 'الخدمات المسندة' : 'Assigned services'}</p><div className="mt-2 flex flex-wrap gap-2">{services.map((service) => <label key={service.id} className="flex min-w-0 max-w-full items-center gap-2 rounded-lg bg-[#f7f8fb] px-2 py-1 text-xs"><input type="checkbox" name="serviceIds" value={service.id} defaultChecked={selected.includes(service.id)} className="shrink-0" /><span className="min-w-0 wrap-anywhere">{service.name}</span></label>)}</div><SubmitLabel rtl={rtl} /></form>
}

function SubmitLabel({ rtl }: { rtl: boolean }) { const { pending } = useFormStatus(); return <button disabled={pending} className="mt-3 rounded-lg bg-brand-teal px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">{pending ? (rtl ? 'جارٍ الحفظ...' : 'Saving...') : (rtl ? 'حفظ الخدمات' : 'Save services')}</button> }
