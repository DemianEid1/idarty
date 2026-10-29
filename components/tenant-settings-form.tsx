"use client"

import { useActionState } from 'react'
import { updateTenantWebsite } from '@/app/[locale]/tenants/[slug]/settings/actions'
import { useToast } from '@/components/toast'
import { currencyOptions, supportedTimezones } from '@/lib/regions'

const fieldClass =
  'rounded-xl border border-[#dfe4ee] px-4 py-3 font-normal outline-none focus:border-brand-teal'
const selectClass = 'rounded-xl border border-[#dfe4ee] bg-paper px-4 py-3 font-normal outline-none focus:border-brand-teal'

export function TenantSettingsForm({ slug, locale, initial }: { slug: string; locale: 'ar' | 'en'; initial: { name: string; tagline: string; description: string; address: string; phone: string; email: string; defaultLocale: 'ar' | 'en'; supportedLocales: string; timezone: string; currency: string } }) {
  const rtl = locale === 'ar'
  const { toast } = useToast()
  const [state, action, pending] = useActionState(async (_: { ok: boolean; message?: string } | null, formData: FormData) => {
    try {
      const result = await updateTenantWebsite(formData)
      if (result.ok) toast('success', rtl ? 'تم حفظ التغييرات' : 'Changes saved')
      return result
    } catch {
      toast('error', rtl ? 'تعذر الحفظ' : 'Could not save')
      return null
    }
  }, null)
  const fields = [
    ['name', rtl ? 'اسم النشاط' : 'Business name', initial.name],
    ['tagline', rtl ? 'الوصف المختصر' : 'Short tagline', initial.tagline],
    ['address', rtl ? 'العنوان' : 'Address', initial.address],
    ['phone', rtl ? 'الهاتف' : 'Phone', initial.phone],
    ['email', rtl ? 'البريد الإلكتروني' : 'Email', initial.email],
  ] as const

  // A workspace may hold a value that is no longer in the curated list (for
  // example one set before onboarding offered regions). Keep it selectable so
  // saving an unrelated field never silently rewrites it.
  const timezones = supportedTimezones.includes(initial.timezone)
    ? supportedTimezones
    : [initial.timezone, ...supportedTimezones]
  const currencies = currencyOptions.some((option) => option.code === initial.currency)
    ? currencyOptions
    : [{ code: initial.currency, name: { ar: initial.currency, en: initial.currency } }, ...currencyOptions]

  return (
    <form action={action} className="mt-6 grid gap-5 rounded-3xl border border-border bg-paper p-6 shadow-float sm:p-8">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="locale" value={locale} />

      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map(([name, label, value]) => (
          <label key={name} className="grid gap-2 text-sm font-semibold">
            {label}
            <input name={name} type={name === 'email' ? 'email' : 'text'} defaultValue={value} className={fieldClass} />
          </label>
        ))}
      </div>

      <label className="grid gap-2 text-sm font-semibold">
        {rtl ? 'نبذة عن النشاط' : 'About your business'}
        <textarea name="description" defaultValue={initial.description} rows={5} className={fieldClass} />
      </label>

      <div className="grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">
          {rtl ? 'اللغة الافتراضية' : 'Default language'}
          <select name="defaultLocale" defaultValue={initial.defaultLocale} className={selectClass}>
            <option value="ar">العربية / Arabic</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          {rtl ? 'اللغات المدعومة' : 'Supported languages'}
          <select name="supportedLocales" defaultValue={initial.supportedLocales} className={selectClass}>
            <option value="ar,en">Arabic + English</option>
            <option value="ar">Arabic only</option>
            <option value="en">English only</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          {rtl ? 'المنطقة الزمنية' : 'Timezone'}
          <select name="timezone" defaultValue={initial.timezone} className={selectClass}>
            {timezones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          {rtl ? 'العملة' : 'Currency'}
          <select name="currency" defaultValue={initial.currency} className={selectClass}>
            {currencies.map((option) => (
              <option key={option.code} value={option.code}>
                {option.code} — {option.name[locale]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-[#24865b]">{state?.ok ? (rtl ? 'تم حفظ التغييرات.' : 'Changes saved.') : null}</p>
        <button disabled={pending} className="rounded-xl bg-brand-teal px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? (rtl ? 'جارٍ الحفظ...' : 'Saving...') : rtl ? 'حفظ التغييرات' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
