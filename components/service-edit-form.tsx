'use client'

import { useState, useTransition } from 'react'
import { updateService } from '@/app/[locale]/tenants/[slug]/dashboard/actions'
import type { Locale } from '@/lib/i18n'

/**
 * Inline service editor.
 *
 * Layout note (the overflow fix): the editor previously sat inside a
 * `sm:grid-cols-4` grid with no `min-width: 0` on its cells and no
 * `w-full`/`min-w-0` on the inputs. A grid cell's default `min-width` is
 * `auto`, so a cell refuses to shrink below its content's intrinsic width —
 * which for a number input is the browser default (~20 characters) plus the
 * `px-2` padding. On narrow screens that pushed the fields past the service
 * container instead of wrapping.
 *
 * The fix is structural, not a fixed width:
 *   - `w-full min-w-0` on the form so it can shrink inside its flex parent.
 *   - `grid-cols-1` by default with `minmax(0,1fr)` columns from `sm` up, so no
 *     cell can be forced wider than its share.
 *   - `w-full min-w-0` on every input, so an input can never exceed its cell.
 *   - the action row spans all columns and wraps.
 *
 * Desktop keeps its single-row shape; mobile stacks cleanly.
 */
export function ServiceEditForm({ locale, slug, service }: { locale: Locale; slug: string; service: { id: string; name: string; durationMin: number; priceAmount: string } }) {
  const rtl = locale === 'ar'
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState('')
  if (!editing) return <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-brand-teal">{rtl ? 'تعديل' : 'Edit'}</button>
  return <form className="mt-3 grid w-full min-w-0 grid-cols-1 gap-2 rounded-xl border border-[#dfe5f0] bg-paper p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]" action={(formData) => { startTransition(async () => { try { await updateService(formData); setMessage(rtl ? 'تم الحفظ' : 'Saved'); setEditing(false) } catch { setMessage(rtl ? 'تعذر الحفظ' : 'Could not save') } }) }}><input type="hidden" name="slug" value={slug} /><input type="hidden" name="locale" value={locale} /><input type="hidden" name="serviceId" value={service.id} /><input required name="name" aria-label={rtl ? 'اسم الخدمة' : 'Service name'} defaultValue={service.name} className="w-full min-w-0 rounded-lg border px-2 py-2 text-sm" /><input required name="durationMin" aria-label={rtl ? 'المدة بالدقائق' : 'Duration in minutes'} type="number" min="15" step="15" defaultValue={service.durationMin} className="w-full min-w-0 rounded-lg border px-2 py-2 text-sm" /><input required name="priceAmount" aria-label={rtl ? 'السعر' : 'Price'} type="number" min="0" step="0.01" defaultValue={service.priceAmount} className="w-full min-w-0 rounded-lg border px-2 py-2 text-sm" /><button disabled={pending} className="w-full min-w-0 rounded-lg bg-brand-teal px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto">{pending ? (rtl ? 'جارٍ الحفظ' : 'Saving') : (rtl ? 'حفظ' : 'Save')}</button>{message && <span role="status" className="min-w-0 text-xs text-[#24865b] wrap-anywhere sm:col-span-full">{message}</span>}</form>
}
