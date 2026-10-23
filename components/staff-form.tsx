'use client'

import { useRef, useState, useTransition } from 'react'
import { createStaff } from '@/app/[locale]/tenants/[slug]/dashboard/staff-actions'
import type { Locale } from '@/lib/i18n'
import { useToast } from '@/components/toast'

export function StaffForm({
  locale,
  slug,
  callerRole = 'owner',
}: {
  locale: Locale
  slug: string
  callerRole?: string
}) {
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const rtl = locale === 'ar'

  return (
    <form
      ref={formRef}
      className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      action={(formData) =>
        startTransition(async () => {
          try {
            await createStaff(formData)
            const msg = rtl ? 'تمت إضافة الموظف وإرسال الدعوة إن وجد البريد.' : 'Staff member added and invitation sent if email provided.'
            setMessage(msg)
            toast('success', msg)
            formRef.current?.reset()
          } catch (err: any) {
            const msg = err.message === 'CANNOT_ASSIGN_EQUAL_OR_HIGHER_ROLE'
              ? (rtl ? 'لا يمكنك تعيين دور مساوٍ أو أعلى من دورك.' : 'Cannot assign an equal or higher role than your own.')
              : (rtl ? 'تعذر إضافة الموظف.' : 'Could not add staff member.')
            setMessage(msg)
            toast('error', msg)
          }
        })
      }
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="slug" value={slug} />

      <input
        required
        name="name"
        placeholder={rtl ? 'اسم الموظف' : 'Staff name'}
        className="h-11 rounded-xl border border-[#e1e5ed] px-3 text-sm outline-none transition focus-visible:border-brand-teal focus-visible:ring-2 focus-visible:ring-brand-teal/20"
      />

      <select
        name="role"
        defaultValue="receptionist"
        className="h-11 rounded-xl border border-[#e1e5ed] bg-paper px-3 text-sm text-ink outline-none transition focus-visible:border-brand-teal focus-visible:ring-2 focus-visible:ring-brand-teal/20"
      >
        <option value="receptionist">{rtl ? 'موظف استقبال' : 'Receptionist'}</option>
        <option value="manager">{rtl ? 'مدير' : 'Manager'}</option>
        {callerRole === 'owner' && (
          <option value="admin">{rtl ? 'مشرف' : 'Admin'}</option>
        )}
      </select>

      <input
        name="email"
        type="email"
        placeholder={rtl ? 'البريد الإلكتروني (للدعوة)' : 'Email (for invitation)'}
        className="h-11 rounded-xl border border-[#e1e5ed] px-3 text-sm outline-none transition focus-visible:border-brand-teal focus-visible:ring-2 focus-visible:ring-brand-teal/20"
      />

      <div className="flex gap-2">
        <input
          name="phone"
          placeholder={rtl ? 'الهاتف (010...)' : 'Phone (e.g. 010...)'}
          className="h-11 min-w-0 flex-1 rounded-xl border border-[#e1e5ed] px-3 text-sm outline-none transition focus-visible:border-brand-teal focus-visible:ring-2 focus-visible:ring-brand-teal/20"
        />
        <button
          disabled={pending}
          className="h-11 shrink-0 rounded-xl bg-brand-teal px-4 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
        >
          {pending ? '...' : rtl ? 'إضافة موظف' : 'Add staff'}
        </button>
      </div>

      {message && <p className="text-xs text-[#24865b] sm:col-span-2 lg:col-span-4">{message}</p>}
    </form>
  )
}
