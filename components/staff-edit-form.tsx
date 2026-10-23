'use client'

import { useState, useTransition } from 'react'
import { updateStaff, resendStaffInvitation } from '@/app/[locale]/tenants/[slug]/dashboard/staff-actions'
import type { Locale } from '@/lib/i18n'
import { useToast } from '@/components/toast'

type Staff = {
  id: string
  name: string
  email: string
  phone: string
  role?: string
  isInvited?: boolean
}

export function StaffEditForm({
  locale,
  slug,
  staff,
  callerRole = 'owner',
}: {
  locale: Locale
  slug: string
  staff: Staff
  callerRole?: string
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [resending, startResendTransition] = useTransition()
  const rtl = locale === 'ar'

  const handleResend = () => {
    startResendTransition(async () => {
      const fd = new FormData()
      fd.append('slug', slug)
      fd.append('locale', locale)
      fd.append('staffId', staff.id)
      try {
        await resendStaffInvitation(fd)
        toast('success', rtl ? 'تمت إعادة إرسال رابط الدعوة' : 'Invitation link resent')
      } catch (err: any) {
        toast('error', err.message || (rtl ? 'تعذر إعادة الإرسال' : 'Could not resend invitation'))
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-brand-teal hover:underline"
      >
        {rtl ? 'تعديل' : 'Edit'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#172033]/30 p-4">
          <form
            action={(formData) =>
              startTransition(async () => {
                try {
                  await updateStaff(formData)
                  toast('success', rtl ? 'تم حفظ التغييرات' : 'Changes saved')
                  setOpen(false)
                } catch (err: any) {
                  toast('error', err.message || (rtl ? 'تعذر الحفظ' : 'Could not save'))
                }
              })
            }
            className="grid w-full max-w-md gap-3 rounded-3xl bg-paper p-6 shadow-xl"
          >
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="staffId" value={staff.id} />

            <label className="grid gap-1 text-sm font-semibold">
              {rtl ? 'الاسم' : 'Name'}
              <input required name="name" defaultValue={staff.name} className="rounded-xl border px-3 py-2 font-normal" />
            </label>

            <label className="grid gap-1 text-sm font-semibold">
              {rtl ? 'الدور والصلاحية' : 'Role & Permission'}
              {staff.role === 'owner' ? (
                <>
                  <div className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-medium text-purple-800">
                    {rtl ? 'مالك مساحة العمل (Owner)' : 'Workspace Owner'}
                  </div>
                  <input type="hidden" name="role" value="owner" />
                </>
              ) : (
                <select
                  name="role"
                  defaultValue={staff.role === 'staff' ? 'receptionist' : (staff.role || 'receptionist')}
                  className="rounded-xl border px-3 py-2 font-normal bg-paper"
                >
                  <option value="receptionist">{rtl ? 'موظف استقبال (Receptionist)' : 'Receptionist'}</option>
                  <option value="manager">{rtl ? 'مدير (Manager)' : 'Manager'}</option>
                  {callerRole === 'owner' && (
                    <option value="admin">{rtl ? 'مشرف (Admin)' : 'Admin'}</option>
                  )}
                </select>
              )}
            </label>

            <label className="grid gap-1 text-sm font-semibold">
              {rtl ? 'البريد الإلكتروني' : 'Email'}
              <input name="email" type="email" defaultValue={staff.email} className="rounded-xl border px-3 py-2 font-normal" />
            </label>

            <label className="grid gap-1 text-sm font-semibold">
              {rtl ? 'الهاتف' : 'Phone'}
              <input
                name="phone"
                defaultValue={staff.phone}
                placeholder={rtl ? 'مثال: 01001234567' : 'e.g. 01001234567'}
                title={rtl ? 'يمكنك إدخال الرقم المحلي أو بالصيغة الدولية' : 'Local format or international format allowed'}
                className="rounded-xl border px-3 py-2 font-normal"
              />
            </label>

            {staff.isInvited && (
              <div className="flex items-center justify-between rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                <span>{rtl ? 'الدعوة بانتظار التفعيل' : 'Invitation pending activation'}</span>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="font-bold underline disabled:opacity-50"
                >
                  {resending ? '...' : rtl ? 'إعادة الإرسال' : 'Resend'}
                </button>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-2 text-sm text-ink-muted hover:text-ink"
              >
                {rtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                disabled={pending}
                className="rounded-xl bg-brand-teal px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
              >
                {pending ? '...' : rtl ? 'حفظ' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
