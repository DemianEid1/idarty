'use client'

import { FormEvent, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Logo } from '@/components/logo'
import { useToast } from '@/components/toast'
import type { InvitationDetails } from '@/app/[locale]/invite/actions'
import { activateEmployeeAccount, acceptInvitationForExistingUser } from '@/app/[locale]/invite/actions'

export function InviteClaimCard({
  details,
  token,
  locale,
  isLoggedIn,
  currentUserEmail,
}: {
  details: InvitationDetails
  token: string
  locale: 'ar' | 'en'
  isLoggedIn: boolean
  currentUserEmail?: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const rtl = locale === 'ar'

  const [name, setName] = useState(details.valid ? details.staffName : '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const roleLabels: Record<string, { ar: string; en: string }> = {
    admin: { ar: 'مشرف (Admin)', en: 'Admin' },
    manager: { ar: 'مدير (Manager)', en: 'Manager' },
    staff: { ar: 'عضو فريق (Staff)', en: 'Staff' },
    receptionist: { ar: 'موظف استقبال (Receptionist)', en: 'Receptionist' },
  }

  if (!details.valid) {
    const errorMessages = {
      NOT_FOUND: rtl ? 'رابط الدعوة غير صالح أو غير موجود.' : 'Invitation link is invalid or not found.',
      EXPIRED: rtl ? 'انتهت صلاحية رابط الدعوة (صالح لمدة 7 أيام). يرجى طلب دعوة جديدة.' : 'This invitation has expired (valid for 7 days). Please request a new invite.',
      ALREADY_ACCEPTED: rtl ? 'تم قبول هذه الدعوة مسبقاً. يمكنك تسجيل الدخول مباشرة.' : 'This invitation has already been accepted. You can log in directly.',
    }
    return (
      <div className="mx-auto w-full max-w-md rounded-3xl border border-[#e1e5ed] bg-paper p-8 text-center shadow-float">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold">{rtl ? 'تعذر إتمام الدعوة' : 'Invitation Unavailable'}</h1>
        <p className="mt-2 text-sm text-ink-muted">{errorMessages[details.reason]}</p>
        <div className="mt-6">
          <Link
            href={`/${locale}/login`}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-teal px-6 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {rtl ? 'تسجيل الدخول' : 'Go to Login'}
          </Link>
        </div>
      </div>
    )
  }

  const roleDisplay = roleLabels[details.role]?.[locale] ?? details.role

  // Case 1: User is already logged in with the matching email
  if (isLoggedIn && currentUserEmail?.toLowerCase() === details.email.toLowerCase()) {
    const handleAccept = () => {
      startTransition(async () => {
        try {
          const res = await acceptInvitationForExistingUser(token)
          toast('success', rtl ? 'تم قبول الدعوة بنجاح' : 'Invitation accepted successfully')
          router.push(`/${locale}/tenants/${res.slug}/dashboard`)
        } catch (err: any) {
          setError(err.message || (rtl ? 'تعذر قبول الدعوة' : 'Could not accept invitation'))
        }
      })
    }

    return (
      <div className="mx-auto w-full max-w-md rounded-3xl border border-[#e1e5ed] bg-paper p-8 shadow-float">
        <div className="mb-6 text-center">
          <Logo locale={locale} height={28} />
          <h1 className="mt-4 text-xl font-bold">{rtl ? 'قبول الدعوة' : 'Accept Workspace Invitation'}</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {rtl
              ? `تمت دعوتك للانضمام إلى مساحة "${details.tenantName}" بصلاحية ${roleDisplay}.`
              : `You have been invited to join "${details.tenantName}" as ${roleDisplay}.`}
          </p>
        </div>

        <div className="rounded-2xl bg-surface p-4 text-sm">
          <p className="text-xs text-ink-muted">{rtl ? 'الحساب المسجل حالياً:' : 'Signed in as:'}</p>
          <p className="font-semibold text-ink">{currentUserEmail}</p>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <button
          onClick={handleAccept}
          disabled={pending}
          className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-brand-teal text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : rtl ? 'قبول والانتقال لمساحة العمل' : 'Accept & Enter Workspace'}
        </button>
      </div>
    )
  }

  // Case 2: User is logged in with a different email
  if (isLoggedIn && currentUserEmail && currentUserEmail.toLowerCase() !== details.email.toLowerCase()) {
    return (
      <div className="mx-auto w-full max-w-md rounded-3xl border border-[#e1e5ed] bg-paper p-8 text-center shadow-float">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold">{rtl ? 'البريد الإلكتروني غير متطابق' : 'Email Mismatch'}</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {rtl
            ? `هذه الدعوة مخصصة للبريد (${details.email})، بينما أنت مسجل الدخول حالياً بحساب (${currentUserEmail}).`
            : `This invitation was issued to (${details.email}), but you are currently signed in as (${currentUserEmail}).`}
        </p>
        <p className="mt-2 text-xs text-ink-muted">
          {rtl
            ? 'يرجى تسجيل الخروج ثم فتح رابط الدعوة مرة أخرى بحسابك المخصص.'
            : 'Please sign out and open the invitation link using the intended account.'}
        </p>
        <div className="mt-6">
          <Link
            href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/invite/claim?token=${token}`)}`}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-teal px-6 text-sm font-semibold text-white"
          >
            {rtl ? 'تسجيل الخروج والتبديل' : 'Switch Account'}
          </Link>
        </div>
      </div>
    )
  }

  // Case 3: User is not logged in — New employee account activation form
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!details.valid) return
    setError('')

    if (password.length < 8) {
      setError(rtl ? 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.' : 'Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError(rtl ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.')
      return
    }

    startTransition(async () => {
      try {
        const res = await activateEmployeeAccount({
          token,
          name: name.trim() || details.staffName,
          password,
          locale,
        })
        toast('success', rtl ? 'تم تفعيل الحساب بنجاح' : 'Account activated successfully')
        router.push(`/${locale}/tenants/${res.slug}/dashboard`)
      } catch (err: any) {
        setError(err.message || (rtl ? 'تعذر إتمام التفعيل. تحقق من البيانات.' : 'Could not activate account. Please check details.'))
      }
    })
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-3xl border border-[#e1e5ed] bg-paper p-8 shadow-float">
      <div className="mb-6 text-center">
        <Logo locale={locale} height={28} />
        <h1 className="mt-4 text-xl font-bold">{rtl ? 'تفعيل حسابك في idarty' : 'Activate Your Idarty Account'}</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {rtl
            ? `مرحباً بك! تمت دعوتك للانضمام إلى مساحة "${details.tenantName}" بصلاحية ${roleDisplay}.`
            : `Welcome! You've been invited to join "${details.tenantName}" as ${roleDisplay}.`}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-ink-muted">{rtl ? 'الاسم الكامل' : 'Full Name'}</label>
          <input
            required
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-[#e1e5ed] px-3 text-sm outline-none transition focus-visible:border-brand-teal focus-visible:ring-2 focus-visible:ring-brand-teal/20"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-ink-muted">{rtl ? 'البريد الإلكتروني (محدد مسبقاً)' : 'Email Address (Preset)'}</label>
          <input
            disabled
            type="email"
            value={details.email}
            className="mt-1 h-11 w-full rounded-xl border border-[#e1e5ed] bg-surface px-3 text-sm text-ink-muted opacity-80"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-ink-muted">{rtl ? 'تعيين كلمة المرور' : 'Set Password'}</label>
          <div className="relative mt-1">
            <input
              required
              minLength={8}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={rtl ? '8 أحرف على الأقل' : 'At least 8 characters'}
              className="h-11 w-full rounded-xl border border-[#e1e5ed] px-3 text-sm outline-none transition focus-visible:border-brand-teal focus-visible:ring-2 focus-visible:ring-brand-teal/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute top-1/2 -translate-y-1/2 end-3 text-ink-muted hover:text-ink"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-ink-muted">{rtl ? 'تأكيد كلمة المرور' : 'Confirm Password'}</label>
          <input
            required
            minLength={8}
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-[#e1e5ed] px-3 text-sm outline-none transition focus-visible:border-brand-teal focus-visible:ring-2 focus-visible:ring-brand-teal/20"
          />
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 p-3 text-xs text-red-600 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="flex h-12 w-full items-center justify-center rounded-xl bg-brand-teal text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : rtl ? 'تفعيل الحساب والانضمام' : 'Activate Account & Join'}
        </button>

        <p className="text-center text-xs text-ink-muted pt-2">
          {rtl ? 'لديك حساب بالفعل بهذا البريد؟' : 'Already have an account with this email?'}{' '}
          <Link
            href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/invite/claim?token=${token}`)}`}
            className="font-semibold text-brand-teal hover:underline"
          >
            {rtl ? 'سجل الدخول هنا' : 'Sign in here'}
          </Link>
        </p>
      </form>
    </div>
  )
}
