'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  ArrowRight,
  ArrowLeft,
  Check,
  RotateCcw,
} from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Logo } from '@/components/logo'

export interface VerifyEmailCardProps {
  locale: 'ar' | 'en'
  email: string
  nextPath?: string
  initialError?: string
}

const copy = {
  ar: {
    title: 'تحقق من بريدك الإلكتروني',
    sentPrefix: 'أرسلنا رابط التحقق إلى',
    noEmail: 'أضف بريدك الإلكتروني لإرسال رابط التحقق:',
    sentSuffix: 'افتح الرسالة واضغط على الرابط لمتابعة الإعداد.',
    verifiedSuccess: 'تم تأكيد البريد الإلكتروني بنجاح! جاري توجيهك...',
    resend: 'إعادة إرسال رابط التحقق',
    resending: 'جارٍ إرسال الرابط...',
    resendCooldown: (seconds: number) => `إعادة الإرسال بعد ${seconds} ثانية`,
    resendSuccess: 'تم إرسال رابط جديد. يرجى مراجعة بريدك.',
    resendError: 'تعذر إرسال الرابط. قد تكون تجاوزت الحد المسموح به، يرجى الانتظار قليلاً.',
    spamHint: 'لم تجدها؟ تحقق من مجلد الرسائل غير المرغوبة.',
    changeEmail: 'تعديل البريد',
    saveEmail: 'حفظ',
    cancelEdit: 'إلغاء',
    createNew: 'إنشاء حساب جديد',
    backToLogin: 'العودة لتسجيل الدخول',
    errors: {
      TOKEN_EXPIRED: 'انتهت صلاحية رابط التحقق. لأسباب أمنية تنتهي صلاحية الروابط تلقائياً. يرجى طلب رابط جديد أدناه.',
      INVALID_TOKEN: 'رابط التحقق غير صالح أو قد تم استخدامه مسبقاً. يرجى طلب رابط جديد.',
      USER_NOT_FOUND: 'لم يتم العثور على الحساب المرتبط بهذا الرابط. يرجى التأكد من البريد أو إنشاء حساب جديد.',
      GENERIC: 'حدث خطأ أثناء محاولة التحقق. يرجى طلب رابط جديد والمحاولة مرة أخرى.',
    },
  },
  en: {
    title: 'Check your email',
    sentPrefix: 'We sent a verification link to',
    noEmail: 'Enter your email to receive a verification link:',
    sentSuffix: 'Open it to finish setting up your workspace.',
    verifiedSuccess: 'Email verified successfully! Redirecting...',
    resend: 'Resend verification email',
    resending: 'Sending link...',
    resendCooldown: (seconds: number) => `Resend in ${seconds}s`,
    resendSuccess: 'A new link has been sent. Please check your inbox.',
    resendError: 'Unable to resend email. You may have exceeded the rate limit, please wait a moment.',
    spamHint: "Didn't get it? Check your spam folder.",
    changeEmail: 'Change email',
    saveEmail: 'Save',
    cancelEdit: 'Cancel',
    createNew: 'Create a new account',
    backToLogin: 'Back to Sign in',
    errors: {
      TOKEN_EXPIRED: 'Your verification link has expired for security reasons. Please request a new link below.',
      INVALID_TOKEN: 'This verification link is invalid or has already been used. Please request a new link below.',
      USER_NOT_FOUND: 'No account was found for this link. Please check your email or register again.',
      GENERIC: 'A verification error occurred. Please request a new link and try again.',
    },
  },
} as const

const COOLDOWN_DURATION = 60

export function VerifyEmailCard({
  locale,
  email: initialEmail,
  nextPath = `/${locale}/onboarding`,
  initialError,
}: VerifyEmailCardProps) {
  const router = useRouter()
  const t = copy[locale]
  const rtl = locale === 'ar'

  const [currentEmail, setCurrentEmail] = useState(initialEmail)
  const [editingEmail, setEditingEmail] = useState(false)
  const [emailInput, setEmailInput] = useState(initialEmail)

  const [pending, setPending] = useState(false)
  const [sentSuccess, setSentSuccess] = useState(false)
  const [resendError, setResendError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [isVerified, setIsVerified] = useState(false)

  // Storage key for resend cooldown to persist across browser reloads
  const getCooldownStorageKey = (targetEmail: string) =>
    `idarty_resend_cd_${targetEmail.toLowerCase().trim() || 'default'}`

  // Check stored cooldown on mount or email change
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = getCooldownStorageKey(currentEmail)
    const storedExpiry = sessionStorage.getItem(key)
    if (storedExpiry) {
      const remaining = Math.ceil((parseInt(storedExpiry, 10) - Date.now()) / 1000)
      if (remaining > 0) {
        setCooldown(remaining)
      } else {
        sessionStorage.removeItem(key)
      }
    }
  }, [currentEmail])

  // Cooldown countdown tick
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          sessionStorage.removeItem(getCooldownStorageKey(currentEmail))
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown, currentEmail])

  // Polling: detect if the user clicked the verification link in another tab or device.
  // Only redirect when the session belongs to the SAME email that was submitted for
  // verification. A stale session from a different user must not authorize this flow.
  useEffect(() => {
    if (isVerified) return

    const pollInterval = setInterval(async () => {
      try {
        const session = await authClient.getSession()
        const sessionUser = session.data?.user
        if (
          sessionUser &&
          (sessionUser as any).emailVerified &&
          initialEmail &&
          sessionUser.email === initialEmail
        ) {
          setIsVerified(true)
          clearInterval(pollInterval)
          setTimeout(() => {
            router.push(nextPath)
            router.refresh()
          }, 1200)
        }
      } catch {
        // Silently ignore background polling errors
      }
    }, 4000)

    return () => clearInterval(pollInterval)
  }, [isVerified, nextPath, router, initialEmail])

  // Resend verification email handler
  async function handleResend() {
    const targetEmail = currentEmail.trim()
    if (!targetEmail || cooldown > 0 || pending) return

    setPending(true)
    setSentSuccess(false)
    setResendError('')

    try {
      const result = await authClient.sendVerificationEmail({
        email: targetEmail,
        callbackURL: nextPath,
      })

      if (result.error) {
        setResendError(result.error.message || t.resendError)
      } else {
        setSentSuccess(true)
        const expiry = Date.now() + COOLDOWN_DURATION * 1000
        sessionStorage.setItem(getCooldownStorageKey(targetEmail), expiry.toString())
        setCooldown(COOLDOWN_DURATION)
      }
    } catch {
      setResendError(t.resendError)
    } finally {
      setPending(false)
    }
  }

  // Handle saving new email if edited
  function handleSaveEmail() {
    if (!emailInput.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim())) return
    setCurrentEmail(emailInput.trim())
    setEditingEmail(false)
    setSentSuccess(false)
    setResendError('')
  }

  // Localized error message mapping
  const errorBanner = initialError
    ? initialError === 'TOKEN_EXPIRED'
      ? t.errors.TOKEN_EXPIRED
      : initialError === 'INVALID_TOKEN'
        ? t.errors.INVALID_TOKEN
        : initialError === 'USER_NOT_FOUND'
          ? t.errors.USER_NOT_FOUND
          : t.errors.GENERIC
    : null

  const ArrowIcon = rtl ? ArrowLeft : ArrowRight

  return (
    <div className="w-full">
      <Link
        href="/"
        className="mb-8 inline-flex items-center rounded-lg outline-none focus-visible:ring-4 focus-visible:ring-brand-teal/30"
        aria-label={locale === 'ar' ? 'الرئيسية - إدارتي' : 'Home - Idarty'}
      >
        <Logo locale={locale} height={32} />
      </Link>

      <div className="rounded-3xl border border-border bg-paper p-8 shadow-[0_8px_30px_rgba(11,11,15,0.04)] sm:p-10">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-teal/10 text-brand-teal">
          <Mail className="h-5 w-5" aria-hidden />
        </div>

        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          {t.title}
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          {currentEmail ? (
            <>
              {t.sentPrefix}{' '}
              <span dir="ltr" className="font-semibold text-ink break-all">
                {currentEmail}
              </span>
              . {t.sentSuffix}
            </>
          ) : (
            t.noEmail
          )}
        </p>

        {editingEmail ? (
          <div className="mt-3 flex items-center gap-2">
            <input
              type="email"
              dir="ltr"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              autoFocus
              aria-label={t.changeEmail}
              className="w-full rounded-xl border border-border bg-surface/50 px-4 py-2.5 text-sm outline-none transition-colors focus:border-brand-teal focus:bg-paper focus:ring-4 focus:ring-brand-teal/10"
              placeholder="name@example.com"
            />
            <button
              type="button"
              onClick={handleSaveEmail}
              aria-label={t.saveEmail}
              className="shrink-0 rounded-xl bg-brand-teal px-3.5 py-2.5 text-white transition hover:bg-brand-teal/90"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setEmailInput(currentEmail)
                setEditingEmail(false)
              }}
              className="shrink-0 rounded-xl px-2 py-2.5 text-xs font-semibold text-ink-muted transition hover:text-ink"
            >
              {t.cancelEdit}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEmailInput(currentEmail)
              setEditingEmail(true)
            }}
            className="mt-1 text-xs font-bold text-brand-teal underline-offset-4 hover:underline"
          >
            {t.changeEmail}
          </button>
        )}

        {/* Link problem reported by the verification callback */}
        {errorBanner && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <span className="leading-relaxed font-medium">{errorBanner}</span>
          </div>
        )}

        {/* Verified in another tab/device */}
        {isVerified && (
          <div
            role="status"
            className="mt-5 flex items-center gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <span>{t.verifiedSuccess}</span>
          </div>
        )}

        {sentSuccess && !isVerified && (
          <div
            role="status"
            className="mt-5 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <span>{t.resendSuccess}</span>
          </div>
        )}

        {resendError && !isVerified && (
          <div
            role="alert"
            className="mt-5 flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden />
            <span>{resendError}</span>
          </div>
        )}

        {!isVerified && (
          <>
            <button
              type="button"
              onClick={handleResend}
              disabled={pending || cooldown > 0 || !currentEmail}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-teal px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-teal/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  <span>{t.resending}</span>
                </>
              ) : cooldown > 0 ? (
                <span>{t.resendCooldown(cooldown)}</span>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  <span>{t.resend}</span>
                </>
              )}
            </button>

            <p className="mt-3 text-center text-xs text-ink-muted">{t.spamHint}</p>
          </>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm">
          <Link
            href={`/${locale}/login`}
            className="inline-flex items-center gap-1.5 font-semibold text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowIcon className="h-4 w-4" aria-hidden />
            <span>{t.backToLogin}</span>
          </Link>
          <span className="text-ink-muted/40" aria-hidden>
            ·
          </span>
          <Link href={`/${locale}/signup`} className="font-semibold text-brand-teal hover:underline">
            {t.createNew}
          </Link>
        </div>
      </div>
    </div>
  )
}

// Backward-compatible export alias for any components importing VerifyEmailForm
export const VerifyEmailForm = VerifyEmailCard
