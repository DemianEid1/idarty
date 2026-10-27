'use client'

import { useState, useTransition, useRef } from 'react'
import {
  CheckCircle2,
  KeyRound,
  Lock,
  LogOut,
  Monitor,
  Shield,
  Smartphone,
  User,
} from 'lucide-react'
import { useToast } from '@/components/toast'
import {
  updateUserProfile,
  changeUserPassword,
  revokeOtherSessions,
} from '@/app/[locale]/tenants/[slug]/dashboard/profile-actions'
import type { Locale } from '@/lib/i18n'

interface UserProfileSettingsProps {
  locale: Locale
  slug: string
  initialSubTab?: string
  user: {
    id: string
    name: string
    email: string
    phone?: string | null
    emailVerified?: boolean
    preferredLocale?: string
    image?: string | null
  }
  currentSession: {
    id: string
    ipAddress?: string | null
    userAgent?: string | null
    createdAt?: Date | null
  }
}

export function UserProfileSettings({
  locale,
  slug,
  initialSubTab = 'general',
  user,
  currentSession,
}: UserProfileSettingsProps) {
  const rtl = locale === 'ar'
  const { toast } = useToast()
  const [activeSub, setActiveSub] = useState<'general' | 'security'>(
    initialSubTab === 'security' ? 'security' : 'general'
  )

  // Profile Form state
  const [profilePending, startProfileTransition] = useTransition()
  const [profileMsg, setProfileMsg] = useState('')

  // Password Form state
  const [pwdPending, startPwdTransition] = useTransition()
  const [pwdMsg, setPwdMsg] = useState('')
  const [pwdError, setPwdError] = useState(false)
  const pwdFormRef = useRef<HTMLFormElement>(null)

  // Session state
  const [sessionPending, startSessionTransition] = useTransition()

  async function handleProfileSubmit(formData: FormData) {
    startProfileTransition(async () => {
      try {
        await updateUserProfile(formData)
        const msg = rtl ? 'تم حفظ التعديلات بنجاح.' : 'Profile updated successfully.'
        setProfileMsg(msg)
        toast('success', msg)
      } catch {
        const msg = rtl ? 'حدث خطأ أثناء حفظ التعديلات.' : 'Failed to update profile.'
        setProfileMsg(msg)
        toast('error', msg)
      }
    })
  }

  async function handlePasswordSubmit(formData: FormData) {
    startPwdTransition(async () => {
      try {
        await changeUserPassword(formData)
        const msg = rtl ? 'تم تغيير كلمة المرور بنجاح.' : 'Password changed successfully.'
        setPwdError(false)
        setPwdMsg(msg)
        toast('success', msg)
        pwdFormRef.current?.reset()
      } catch (err: any) {
        setPwdError(true)
        let msg = rtl ? 'تعذر تغيير كلمة المرور.' : 'Failed to change password.'
        if (err.message === 'PASSWORD_TOO_SHORT') {
          msg = rtl ? 'كلمة المرور يجب أن لا تقل عن 8 أحرف.' : 'Password must be at least 8 characters.'
        } else if (err.message === 'PASSWORDS_DO_NOT_MATCH') {
          msg = rtl ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.'
        } else if (err.message === 'INVALID_CURRENT_PASSWORD') {
          msg = rtl ? 'كلمة المرور الحالية غير صحيحة.' : 'Incorrect current password.'
        } else if (err.message === 'CURRENT_PASSWORD_REQUIRED') {
          msg = rtl ? 'يرجى إدخال كلمة المرور الحالية أولاً.' : 'Current password is required.'
        }
        setPwdMsg(msg)
        toast('error', msg)
      }
    })
  }

  async function handleRevokeSessions() {
    if (
      !window.confirm(
        rtl
          ? 'هل أنت متأكد من تسجيل الخروج من كافة الأجهزة والمتصفحات الأخرى؟'
          : 'Are you sure you want to log out from all other devices?'
      )
    ) {
      return
    }
    startSessionTransition(async () => {
      try {
        await revokeOtherSessions(slug, locale)
        toast(
          'success',
          rtl
          ? 'تم إنهاء جميع الجلسات الأخرى بنجاح.'
          : 'All other sessions have been revoked.'
        )
      } catch {
        toast('error', rtl ? 'تعذر إنهاء الجلسات الأخرى.' : 'Failed to revoke other sessions.')
      }
    })
  }

  const isEmail = (val?: string | null) => Boolean(val && val.includes('@'))
  const cleanName =
    user.name && !isEmail(user.name)
      ? user.name
      : (user.name?.includes('@') ? user.name.split('@')[0] : user.email?.split('@')[0] || 'User')

  const initials = cleanName
    ? cleanName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((n) => n[0].toUpperCase())
        .join('')
    : 'U'

  return (
    <div className="space-y-6">
      {/* Profile Header & Sub-navigation */}
      <div className="rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-teal/15 text-lg font-bold text-brand-teal border border-brand-teal/20">
              {initials}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-[#172033] sm:text-xl">{cleanName}</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>{rtl ? 'حساب موثق' : 'Verified Account'}</span>
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-muted">{user.email}</p>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex items-center self-start rounded-2xl border border-border bg-surface p-1 shadow-xs sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveSub('general')}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                activeSub === 'general'
                  ? 'bg-paper text-brand-teal shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>{rtl ? 'البيانات الشخصية' : 'Personal Info'}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSub('security')}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                activeSub === 'security'
                  ? 'bg-paper text-brand-teal shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              <span>{rtl ? 'الأمان وكلمة المرور' : 'Security & Password'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: General Info & Preferences */}
      {activeSub === 'general' && (
        <div className="rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6">
          <div className="border-b border-border/80 pb-4">
            <h3 className="text-base font-bold text-[#172033]">
              {rtl ? 'المعلومات الشخصية وتفضيلات الحساب' : 'Personal Details & Preferences'}
            </h3>
            <p className="mt-1 text-xs text-ink-muted">
              {rtl
                ? 'تحكم في اسم العرض وبيانات الاتصال واللغة الافتراضية الخاصة بحسابك.'
                : 'Manage your personal display name, contact info, and default account language.'}
            </p>
          </div>

          <form action={handleProfileSubmit} className="mt-6 space-y-4 max-w-2xl">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="locale" value={locale} />

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-bold text-[#172033]">
                {rtl ? 'الاسم الكامل' : 'Full Name'}
                <input
                  required
                  name="name"
                  defaultValue={cleanName}
                  placeholder={rtl ? 'اسمك الكامل' : 'Your full name'}
                  className="h-11 w-full rounded-xl border border-[#e1e5ed] px-3.5 text-sm font-normal outline-none transition focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                />
              </label>

              <label className="grid gap-1.5 text-xs font-bold text-[#172033]">
                {rtl ? 'البريد الإلكتروني' : 'Email Address'}
                <input
                  disabled
                  value={user.email}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-normal text-slate-500 cursor-not-allowed"
                />
              </label>

              <label className="grid gap-1.5 text-xs font-bold text-[#172033]">
                {rtl ? 'رقم الهاتف الشخصي' : 'Phone Number'}
                <input
                  name="phone"
                  defaultValue={user.phone ?? ''}
                  placeholder={rtl ? 'مثال: 01012345678' : 'e.g. +201012345678'}
                  className="h-11 w-full rounded-xl border border-[#e1e5ed] px-3.5 text-sm font-normal outline-none transition focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                />
              </label>

              <label className="grid gap-1.5 text-xs font-bold text-[#172033]">
                {rtl ? 'لغة الواجهة المفضلة' : 'Preferred Language'}
                <select
                  name="preferredLocale"
                  defaultValue={user.preferredLocale || locale}
                  className="h-11 w-full rounded-xl border border-[#e1e5ed] bg-paper px-3.5 text-sm font-normal text-ink outline-none transition focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                >
                  <option value="ar">العربية (Arabic)</option>
                  <option value="en">English (الإنجليزية)</option>
                </select>
              </label>
            </div>

            <div className="flex items-center justify-between pt-4">
              {profileMsg && (
                <p className="text-xs text-[#24865b] font-medium">{profileMsg}</p>
              )}
              <button
                disabled={profilePending}
                className="ms-auto rounded-xl bg-brand-teal px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50 cursor-pointer"
              >
                {profilePending ? '...' : rtl ? 'حفظ التعديلات' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: Security, Password & Sessions */}
      {activeSub === 'security' && (
        <div className="space-y-6">
          {/* Password Form Card */}
          <div className="rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6">
            <div className="border-b border-border/80 pb-4">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-brand-teal" />
                <h3 className="text-base font-bold text-[#172033]">
                  {rtl ? 'تغيير كلمة المرور' : 'Change Password'}
                </h3>
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                {rtl
                  ? 'اختر كلمة مرور قوية تحتوي على 8 أحرف على الأقل لحماية حسابك.'
                  : 'Choose a strong password containing at least 8 characters to secure your account.'}
              </p>
            </div>

            <form
              ref={pwdFormRef}
              action={handlePasswordSubmit}
              className="mt-6 space-y-4 max-w-xl"
            >
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="locale" value={locale} />

              <label className="grid gap-1.5 text-xs font-bold text-[#172033]">
                {rtl ? 'كلمة المرور الحالية' : 'Current Password'}
                <input
                  type="password"
                  name="currentPassword"
                  placeholder="••••••••"
                  className="h-11 w-full rounded-xl border border-[#e1e5ed] px-3.5 text-sm font-normal outline-none transition focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-bold text-[#172033]">
                  {rtl ? 'كلمة المرور الجديدة' : 'New Password'}
                  <input
                    required
                    minLength={8}
                    type="password"
                    name="newPassword"
                    placeholder="••••••••"
                    className="h-11 w-full rounded-xl border border-[#e1e5ed] px-3.5 text-sm font-normal outline-none transition focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                  />
                </label>

                <label className="grid gap-1.5 text-xs font-bold text-[#172033]">
                  {rtl ? 'تأكيد كلمة المرور الجديدة' : 'Confirm New Password'}
                  <input
                    required
                    minLength={8}
                    type="password"
                    name="confirmPassword"
                    placeholder="••••••••"
                    className="h-11 w-full rounded-xl border border-[#e1e5ed] px-3.5 text-sm font-normal outline-none transition focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                  />
                </label>
              </div>

              <div className="flex items-center justify-between pt-4">
                {pwdMsg && (
                  <p
                    className={`text-xs font-medium ${
                      pwdError ? 'text-rose-600' : 'text-[#24865b]'
                    }`}
                  >
                    {pwdMsg}
                  </p>
                )}
                <button
                  disabled={pwdPending}
                  className="ms-auto rounded-xl bg-brand-teal px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50 cursor-pointer"
                >
                  {pwdPending ? '...' : rtl ? 'تحديث كلمة المرور' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>

          {/* Active Sessions Card */}
          <div className="rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/80 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Monitor className="h-5 w-5 text-brand-teal" />
                  <h3 className="text-base font-bold text-[#172033]">
                    {rtl ? 'الجلسات والأجهزة النشطة' : 'Active Sessions & Devices'}
                  </h3>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {rtl
                    ? 'الأجهزة والمتصفحات التي سجلت الدخول بحسابك حالياً.'
                    : 'Browsers and devices currently logged into your account.'}
                </p>
              </div>

              <button
                type="button"
                onClick={handleRevokeSessions}
                disabled={sessionPending}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 cursor-pointer self-start sm:self-auto"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>
                  {sessionPending
                    ? '...'
                    : rtl
                    ? 'تسجيل الخروج من باقي الأجهزة'
                    : 'Log out of other devices'}
                </span>
              </button>
            </div>

            {/* Current Session Item */}
            <div className="mt-5 rounded-2xl border border-border bg-surface p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                  <Monitor className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-[#172033]">
                      {rtl ? 'هذا الجهاز (الجلسة الحالية)' : 'This device (Current session)'}
                    </p>
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted truncate max-w-md">
                    {currentSession.userAgent || (rtl ? 'متصفح الويب' : 'Web Browser')}
                    {currentSession.ipAddress ? ` · ${currentSession.ipAddress}` : ''}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-[10px] font-bold">
                {rtl ? 'نشط الآن' : 'Active Now'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
