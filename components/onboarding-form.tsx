'use client'

import { useActionState, useState } from 'react'
import { createTenant, validateSlug } from '@/app/[locale]/onboarding/actions'
import { businessTypes, businessTypeLabels, defaultWorkspacePlaceholder, type BusinessType } from '@/lib/business-types'
import {
  DEFAULT_COUNTRY,
  countries,
  currencyName,
  findCountry,
  regionForCountry,
  supportedTimezones,
} from '@/lib/regions'
import { MAX_LOGO_IMAGE_SIZE, SUPPORTED_IMAGE_MIME_TYPES } from '@/lib/image-validation'
import { WEEKDAYS, cloneDefaultSchedule, isValidTime, scheduleSummary, weekdayLabel, type ScheduleDay } from '@/lib/onboarding-hours'
import { publicTenantUrl } from '@/lib/routes'
import {
  Building2,
  Palette,
  PartyPopper,
  MapPin,
  ShieldCheck,
  Clock,
  ArrowRight,
  ArrowLeft,
  Loader2,
} from 'lucide-react'
import { Logo } from '@/components/logo'
import { useToast } from '@/components/toast'

const PRESET_COLORS = [
  { label: 'idarty Blue', primary: '#0F766E', accent: '#f0faf9' },
  { label: 'Emerald',     primary: '#059669', accent: '#d1fae5' },
  { label: 'Violet',      primary: '#7c3aed', accent: '#ede9fe' },
  { label: 'Rose',        primary: '#e11d48', accent: '#ffe4e6' },
  { label: 'Amber',       primary: '#d97706', accent: '#fef3c7' },
  { label: 'Slate',       primary: '#475569', accent: '#f1f5f9' },
]

const messages: Record<string, { ar: string; en: string }> = {
  UNAUTHENTICATED: { ar: 'انتهت الجلسة. سجّل الدخول مرة أخرى.', en: 'Your session expired. Please sign in again.' },
  UNVERIFIED: { ar: 'يرجى تأكيد بريدك الإلكتروني أولاً.', en: 'Please verify your email address first.' },
  INVALID_SLUG: { ar: 'استخدم رابطاً قصيراً صالحاً بحروف إنجليزية وأرقام وشرطات.', en: 'Use a valid URL with lowercase letters, numbers, and hyphens.' },
  SLUG_RESERVED: { ar: 'هذا الرابط محجوز. اختر رابطاً آخر.', en: 'That URL is reserved. Choose another one.' },
  SLUG_TAKEN: { ar: 'هذا الرابط مستخدم بالفعل. اختر رابطاً آخر.', en: 'That URL is already taken. Choose another one.' },
  INVALID_INPUT: { ar: 'تحقق من الحقول المطلوبة وحاول مرة أخرى.', en: 'Check the required fields and try again.' },
  INVALID_LOGO: {
    ar: 'الشعار غير مدعوم. استخدم صورة PNG أو JPEG أو WebP بحجم 1 ميجابايت أو أقل.',
    en: 'Logo is not supported. Use a PNG, JPEG, or WebP image up to 1MB.',
  },
  INVALID_HOURS: {
    ar: 'ساعات العمل غير صالحة. تحقق من أوقات البدء والانتهاء.',
    en: 'Working hours are invalid. Check the opening and closing times.',
  },
  UNKNOWN: { ar: 'تعذر إنشاء مساحة العمل. حاول مرة أخرى.', en: 'Could not create the workspace. Please try again.' },
}

const inputClass =
  'mt-2 h-12 w-full rounded-xl border border-[#e1e5ed] bg-paper px-4 text-sm outline-none transition focus-visible:border-brand-teal focus-visible:ring-4 focus-visible:ring-brand-teal/10'
const labelClass = 'block text-sm font-semibold'
const primaryButtonClass =
  'flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-teal text-sm font-semibold text-white shadow-sm outline-none transition hover:bg-[#0d6560] focus-visible:ring-4 focus-visible:ring-brand-teal/20 disabled:opacity-60'
const secondaryButtonClass =
  'flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#e1e5ed] bg-paper text-sm font-semibold text-[#516078] shadow-sm outline-none transition hover:bg-surface focus-visible:ring-4 focus-visible:ring-brand-teal/20 disabled:opacity-50'

export function OnboardingForm({ locale }: { locale: 'ar' | 'en' }) {
  const rtl = locale === 'ar'
  const { toast } = useToast()
  const [state, action, pending] = useActionState(createTenant, null)

  const [step, setStep] = useState(1)
  const [stepError, setStepError] = useState<string | null>(null)

  // Step 1 — business
  const [businessType, setBusinessType] = useState<BusinessType>('salon')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugError, setSlugError] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [tagline, setTagline] = useState('')
  const [country, setCountry] = useState<string>(DEFAULT_COUNTRY)
  const [timezone, setTimezone] = useState(regionForCountry(DEFAULT_COUNTRY).timezone)

  // Step 2 — primary branch and optional working hours
  const [branchName, setBranchName] = useState(rtl ? 'الفرع الرئيسي' : 'Main branch')
  const [branchAddress, setBranchAddress] = useState('')
  const [branchPhone, setBranchPhone] = useState('')
  const [configureHours, setConfigureHours] = useState(true)
  const [hours, setHours] = useState<ScheduleDay[]>(() => cloneDefaultSchedule())

  // Step 3 — branding
  const [primary, setPrimary] = useState('#0F766E')
  const [accent, setAccent] = useState('#f0faf9')
  const [logo, setLogo] = useState('')
  const [logoError, setLogoError] = useState<string | null>(null)

  const selectedCountry = findCountry(country)
  const currency = regionForCountry(country).currency
  const openDays = hours.filter((day) => !day.closed).length

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset so the same file can be picked again after an error.
    e.target.value = ''
    if (!file) return
    if (!(SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
      setLogoError(
        rtl
          ? 'نوع الصورة غير مدعوم. يُسمح بـ PNG و JPEG و WebP.'
          : 'Unsupported image type. Only PNG, JPEG, and WebP are allowed.'
      )
      return
    }
    if (file.size > MAX_LOGO_IMAGE_SIZE) {
      setLogoError(rtl ? 'حجم الصورة كبير جداً. الحد الأقصى 1 ميجابايت.' : 'Image is too large. Maximum size is 1MB.')
      return
    }
    setLogoError(null)
    const reader = new FileReader()
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setLogo(event.target.result)
      }
    }
    reader.readAsDataURL(file)
  }

  /** Returns an error message, or null when the schedule is submittable. */
  function validateHours(): string | null {
    for (const day of hours) {
      if (day.closed) continue
      const label = weekdayLabel(day.weekday, locale)
      if (!isValidTime(day.startTime) || !isValidTime(day.endTime)) {
        return rtl ? `أدخل أوقاتاً صحيحة ليوم ${label}` : `Enter valid times for ${label}`
      }
      if (day.startTime >= day.endTime) {
        return rtl
          ? `وقت البدء يجب أن يكون قبل وقت الانتهاء ليوم ${label}`
          : `Start time must be before end time for ${label}`
      }
    }
    if (openDays === 0) {
      return rtl ? 'افتح يوماً واحداً على الأقل أو تخطَّ هذه الخطوة.' : 'Open at least one day, or skip this step.'
    }
    return null
  }

  async function nextStep() {
    setStepError(null)
    if (step === 1) {
      if (!name || name.trim().length < 2) {
        setStepError(rtl ? 'أدخل اسم مساحة العمل (حرفان على الأقل).' : 'Enter a workspace name (at least 2 characters).')
        return
      }
      if (!slug || slug.length < 3) {
        setSlugError(rtl ? 'أدخل رابطاً مختصراً (3 أحرف على الأقل).' : 'Enter a workspace URL (at least 3 characters).')
        return
      }
      setIsValidating(true)
      setSlugError(null)
      const error = await validateSlug(slug)
      setIsValidating(false)
      if (error) {
        setSlugError(messages[error][locale])
        return
      }
    }
    if (step === 2) {
      if (branchName.trim().length < 2) {
        setStepError(rtl ? 'أدخل اسم الفرع.' : 'Enter a branch name.')
        return
      }
      if (configureHours) {
        const hoursError = validateHours()
        if (hoursError) {
          setStepError(hoursError)
          return
        }
      }
    }
    setStep((current) => Math.min(4, current + 1))
  }

  function prevStep() {
    setStepError(null)
    setStep((current) => Math.max(1, current - 1))
  }

  /** Hours are optional: skip stores nothing and keeps the step editable later. */
  function skipHours() {
    setConfigureHours(false)
    setStepError(null)
    setStep(3)
  }

  const stepTitles = {
    1: rtl ? 'أنشئ مساحة العمل الأولى' : 'Create your workspace',
    2: rtl ? 'الفرع الرئيسي' : 'Primary branch',
    3: rtl ? 'تخصيص الهوية البصرية' : 'Customize your brand',
    4: rtl ? 'أنت جاهز للبدء!' : "You're ready to start!",
  }
  const stepDescriptions = {
    1: rtl ? 'مساحتك تجمع فريقك وبياناتك وسير العمل في مكان واحد.' : 'Bring your team, data, and daily workflows together in one calm workspace.',
    2: rtl
      ? 'حدد موقعك الرئيسي. يمكنك تخطي ساعات العمل وإضافتها لاحقاً من جدول المواعيد.'
      : 'Set up your first location. You can skip working hours and add them later in Schedule.',
    3: rtl ? 'اختر الألوان والشعار الخاص بنشاطك التجاري.' : 'Choose colors and a logo for your business.',
    4: rtl ? 'راجع التفاصيل ثم أنشئ مساحة العمل.' : 'Review your details, then create the workspace.',
  }
  const stepIcons = [
    <Building2 key="b" className="h-7 w-7" />,
    <MapPin key="m" className="h-7 w-7" />,
    <Palette key="p" className="h-7 w-7" />,
    <PartyPopper key="c" className="h-7 w-7" />,
  ]

  const hoursField = configureHours ? JSON.stringify(hours) : ''

  return (
    <>
      <div className="flex items-center justify-between">
        <a href={`/${locale}`} className="flex items-center" aria-label={rtl ? 'إدارتي' : 'Idarty'}>
          <Logo locale={locale} height={28} />
        </a>
        <div className="flex items-center gap-2" dir="ltr">
          {[1, 2, 3, 4].map((s) => (
            <span key={s} className={`h-1.5 w-8 rounded-full transition-colors ${s <= step ? 'bg-brand-teal' : 'bg-[#dfe4ee]'}`} />
          ))}
        </div>
      </div>

      <div className="mt-12 rounded-[2rem] border border-border bg-paper p-7 shadow-[0_20px_60px_rgba(30,45,80,.05)] sm:p-12">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f0faf9] text-brand-teal">
          {stepIcons[step - 1]}
        </div>

        <div className="mt-6 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">{stepTitles[step as keyof typeof stepTitles]}</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-ink-muted">
            {stepDescriptions[step as keyof typeof stepDescriptions]}
          </p>
        </div>

        <form
          action={action}
          onSubmit={(event) => {
            // Only the review step may submit: pressing Enter in an earlier step
            // must not create the workspace.
            if (step < 4) event.preventDefault()
          }}
          className="mt-10 mx-auto max-w-md"
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="hoursConfigured" value={configureHours ? 'true' : 'false'} />
          <input type="hidden" name="hours" value={hoursField} />

          {/* STEP 1 — Business */}
          <div className={`space-y-5 ${step === 1 ? 'block' : 'hidden'}`}>
            <label className={labelClass}>
              {rtl ? 'نوع النشاط' : 'Business type'}
              <select
                name="businessType"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value as BusinessType)}
                className={inputClass}
              >
                {businessTypes.map((type) => (
                  <option key={type} value={type}>
                    {businessTypeLabels[type][locale]}
                  </option>
                ))}
              </select>
            </label>

            <label className={labelClass}>
              {rtl ? 'اسم مساحة العمل' : 'Workspace name'}
              <input
                name="name"
                autoComplete="organization"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setStepError(null)
                }}
                maxLength={100}
                className={inputClass}
                placeholder={defaultWorkspacePlaceholder(businessType, locale)}
              />
            </label>

            <label className={labelClass}>
              {rtl ? 'الرابط المختصر' : 'Workspace URL'}
              <div className="mt-2 flex items-center overflow-hidden rounded-xl border border-[#e1e5ed] focus-within:border-brand-teal focus-within:ring-4 focus-within:ring-brand-teal/10">
                <span className="max-w-[55%] truncate px-4 text-sm text-[#9aa3b2]" dir="ltr">
                  {publicTenantUrl(locale, '')}
                </span>
                <input
                  name="slug"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))
                    setSlugError(null)
                  }}
                  maxLength={48}
                  className="h-12 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm outline-none placeholder:text-left rtl:text-left rtl:pl-4"
                  placeholder="nile-wellness"
                  dir="ltr"
                />
              </div>
              <span className="mt-2 block text-xs font-normal text-ink-lighter">
                {rtl
                  ? 'لا يمكن تغيير هذا الرابط بعد الإنشاء.'
                  : 'This URL cannot be changed after the workspace is created.'}
              </span>
            </label>

            <label className={labelClass}>
              <span className="flex items-center justify-between">
                <span>{rtl ? 'وصف مختصر' : 'Short tagline'}</span>
                <span className="text-xs font-normal text-ink-lighter">{rtl ? 'اختياري' : 'Optional'}</span>
              </span>
              <input
                name="tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                maxLength={160}
                className={inputClass}
                placeholder={rtl ? 'مثال: صالون عناية في القاهرة' : 'e.g. A calm salon in Cairo'}
              />
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className={labelClass}>
                {rtl ? 'الدولة' : 'Country'}
                <select
                  name="country"
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value)
                    setTimezone(regionForCountry(e.target.value).timezone)
                  }}
                  className={inputClass}
                >
                  {countries.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.name[locale]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                {rtl ? 'المنطقة الزمنية' : 'Timezone'}
                <select name="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass}>
                  {supportedTimezones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="rounded-xl bg-surface px-4 py-3 text-xs text-ink-muted">
              {rtl
                ? `العملة المستخدمة في مساحتك: ${currencyName(currency, locale)} (${currency}). يمكنك تغييرها لاحقاً من الإعدادات.`
                : `Your workspace currency will be ${currencyName(currency, locale)} (${currency}). You can change it later in settings.`}
            </p>

            {stepError && (
              <p role="alert" aria-live="polite" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {stepError}
              </p>
            )}
            {slugError && (
              <p role="alert" aria-live="polite" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {slugError}
              </p>
            )}

            <button type="button" onClick={nextStep} disabled={isValidating} className={`mt-8 ${primaryButtonClass}`}>
              {isValidating && <Loader2 className="h-4 w-4 animate-spin" />}
              {isValidating ? (rtl ? 'جاري التحقق...' : 'Checking...') : rtl ? 'التالي' : 'Next step'}
              {!isValidating && (rtl ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />)}
            </button>
          </div>

          {/* STEP 2 — Primary branch and optional working hours */}
          <div className={`space-y-5 ${step === 2 ? 'block' : 'hidden'}`}>
            <label className={labelClass}>
              {rtl ? 'اسم الفرع' : 'Branch name'}
              <input
                name="branchName"
                value={branchName}
                onChange={(e) => {
                  setBranchName(e.target.value)
                  setStepError(null)
                }}
                maxLength={100}
                className={inputClass}
                placeholder={rtl ? 'الفرع الرئيسي' : 'Main branch'}
              />
            </label>

            <label className={labelClass}>
              <span className="flex items-center justify-between">
                <span>{rtl ? 'عنوان الفرع' : 'Branch address'}</span>
                <span className="text-xs font-normal text-ink-lighter">{rtl ? 'اختياري' : 'Optional'}</span>
              </span>
              <input
                name="branchAddress"
                value={branchAddress}
                onChange={(e) => setBranchAddress(e.target.value)}
                maxLength={300}
                className={inputClass}
                placeholder={rtl ? '١٢ شارع التحرير، القاهرة' : '12 El Tahrir St, Cairo'}
              />
            </label>

            <label className={labelClass}>
              <span className="flex items-center justify-between">
                <span>{rtl ? 'هاتف الفرع' : 'Branch phone'}</span>
                <span className="text-xs font-normal text-ink-lighter">{rtl ? 'اختياري' : 'Optional'}</span>
              </span>
              <input
                name="branchPhone"
                value={branchPhone}
                onChange={(e) => setBranchPhone(e.target.value)}
                maxLength={30}
                dir="ltr"
                className={inputClass}
                placeholder="+20 100 000 0000"
              />
            </label>

            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Clock className="h-4 w-4 text-brand-teal" />
                  {rtl ? 'ساعات العمل' : 'Working hours'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={configureHours}
                  aria-label={rtl ? 'تحديد ساعات العمل الآن' : 'Set working hours now'}
                  onClick={() => {
                    setConfigureHours((current) => !current)
                    setStepError(null)
                  }}
                  dir="ltr"
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-teal focus:ring-offset-2 ${
                    configureHours ? 'bg-brand-teal' : 'bg-gray-300'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                      configureHours ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {configureHours ? (
                <>
                  <p className="mt-1 text-xs text-ink-lighter">
                    {rtl
                      ? 'تُستخدم هذه الأوقات لإنشاء المواعيد المتاحة للحجز.'
                      : 'These hours determine which booking slots customers can pick.'}
                  </p>
                  <div className="mt-3 space-y-2">
                    {hours.map((day) => {
                      const isOpen = !day.closed
                      return (
                        <div key={day.weekday} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#f1f3f7] bg-paper p-2.5">
                          <button
                            type="button"
                            onClick={() =>
                              setHours((current) =>
                                current.map((item) => (item.weekday === day.weekday ? { ...item, closed: !item.closed } : item))
                              )
                            }
                            className={`min-w-[64px] rounded-lg px-2 py-1 text-xs font-semibold transition ${
                              isOpen ? 'bg-[#e7f6f1] text-brand-teal' : 'bg-[#f1f3f7] text-ink-muted'
                            }`}
                          >
                            {isOpen ? (rtl ? 'مفتوح' : 'Open') : rtl ? 'مغلق' : 'Closed'}
                          </button>
                          <span className="min-w-[68px] text-xs font-semibold">{WEEKDAYS[day.weekday][locale]}</span>
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <input
                              type="time"
                              value={day.startTime}
                              onChange={(e) =>
                                setHours((current) =>
                                  current.map((item) =>
                                    item.weekday === day.weekday ? { ...item, startTime: e.target.value } : item
                                  )
                                )
                              }
                              disabled={day.closed}
                              aria-label={`${WEEKDAYS[day.weekday][locale]} ${rtl ? 'من' : 'from'}`}
                              className="h-10 min-w-0 flex-1 rounded-lg border border-[#e1e5ed] bg-paper px-2 text-xs outline-none focus:border-brand-teal disabled:cursor-not-allowed disabled:bg-[#f8f9fb] disabled:opacity-40"
                            />
                            <span className="text-xs text-ink-lighter">—</span>
                            <input
                              type="time"
                              value={day.endTime}
                              onChange={(e) =>
                                setHours((current) =>
                                  current.map((item) =>
                                    item.weekday === day.weekday ? { ...item, endTime: e.target.value } : item
                                  )
                                )
                              }
                              disabled={day.closed}
                              aria-label={`${WEEKDAYS[day.weekday][locale]} ${rtl ? 'إلى' : 'to'}`}
                              className="h-10 min-w-0 flex-1 rounded-lg border border-[#e1e5ed] bg-paper px-2 text-xs outline-none focus:border-brand-teal disabled:cursor-not-allowed disabled:bg-[#f8f9fb] disabled:opacity-40"
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-2 text-xs text-ink-lighter">{scheduleSummary(hours, locale)}</p>
                </>
              ) : (
                <p className="mt-2 text-xs text-ink-muted">
                  {rtl
                    ? 'لن نضيف أي ساعات عمل الآن. لن تظهر أوقات حجز حتى تحدّدها من تبويب «المواعيد» بعد إنشاء المساحة.'
                    : 'No working hours will be added now. Customers will see no bookable times until you set them in the Schedule tab after creating the workspace.'}
                </p>
              )}
            </div>

            {stepError && (
              <p role="alert" aria-live="polite" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {stepError}
              </p>
            )}

            <div className="mt-8 flex items-center gap-3">
              <button type="button" onClick={prevStep} className={secondaryButtonClass}>
                {rtl ? 'السابق' : 'Previous'}
              </button>
              <button type="button" onClick={nextStep} className={primaryButtonClass}>
                {rtl ? 'التالي' : 'Next step'}
              </button>
            </div>
            {configureHours && (
              <button
                type="button"
                onClick={skipHours}
                className="mx-auto block text-xs font-semibold text-ink-muted underline underline-offset-4 transition hover:text-brand-teal"
              >
                {rtl ? 'تخطي الآن وإضافة الساعات لاحقاً' : 'Skip for now and add hours later'}
              </button>
            )}
          </div>

          {/* STEP 3 — Branding */}
          <div className={`space-y-6 ${step === 3 ? 'block' : 'hidden'}`}>
            <input type="hidden" name="primaryColor" value={primary} />
            <input type="hidden" name="accentColor" value={accent} />
            <input type="hidden" name="logoBase64" value={logo} />

            <div>
              <span className="mb-2 flex items-center justify-between text-xs font-semibold text-[#647087]">
                <span>{rtl ? 'شعار مساحة العمل' : 'Workspace logo'}</span>
                <span className="font-normal text-ink-lighter">{rtl ? 'اختياري' : 'Optional'}</span>
              </span>
              <div className="flex items-center gap-5">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#e1e5ed] bg-surface">
                  {logo ? <img src={logo} alt="" className="h-full w-full object-contain" /> : <span className="text-xs text-ink-lighter">id</span>}
                </div>
                <div>
                  <label className="cursor-pointer rounded-lg border border-[#e1e5ed] bg-paper px-3 py-1.5 text-xs font-semibold text-[#516078] outline-none transition hover:bg-surface focus-within:ring-2 focus-within:ring-brand-teal/40">
                    {rtl ? 'اختر صورة' : 'Choose image'}
                    <input
                      type="file"
                      accept={SUPPORTED_IMAGE_MIME_TYPES.join(', ')}
                      onChange={handleLogoChange}
                      className="hidden"
                    />
                  </label>
                  <p className="mt-2 text-xs text-ink-lighter">
                    {rtl ? 'PNG أو JPEG أو WebP (الحد الأقصى 1 ميجابايت)' : 'PNG, JPEG or WebP (Max 1MB)'}
                  </p>
                  {logo && (
                    <button
                      type="button"
                      onClick={() => {
                        setLogo('')
                        setLogoError(null)
                      }}
                      className="mt-1 text-xs font-semibold text-red-600 hover:underline"
                    >
                      {rtl ? 'إزالة الشعار' : 'Remove logo'}
                    </button>
                  )}
                </div>
              </div>
              {logoError && (
                <p role="alert" aria-live="polite" className="mt-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {logoError}
                </p>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-ink-lighter">{rtl ? 'ألوان جاهزة' : 'Preset palettes'}</p>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset.primary}
                    type="button"
                    title={preset.label}
                    aria-label={preset.label}
                    aria-pressed={primary === preset.primary}
                    onClick={() => {
                      setPrimary(preset.primary)
                      setAccent(preset.accent)
                    }}
                    className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl shadow-sm outline-none transition hover:scale-110 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-teal ${
                      primary === preset.primary ? 'ring-2 ring-offset-2 ring-brand-teal' : ''
                    }`}
                    style={{ background: preset.primary }}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-5 text-center">
              <h3 className="text-sm font-semibold">{name || (rtl ? 'اسم مساحة العمل' : 'Workspace name')}</h3>
              <p className="mt-1 text-xs text-ink-lighter" dir="ltr">
                {publicTenantUrl(locale, slug || 'url')}
              </p>
              <div className="mx-auto mt-4 flex w-fit items-center gap-3 rounded-xl border border-[#e1e5ed] bg-paper p-3">
                <span className="h-8 w-8 shrink-0 rounded-lg shadow-sm" style={{ background: primary }} />
                <span className="h-8 w-8 shrink-0 rounded-lg border border-[#e1e5ed] shadow-sm" style={{ background: accent }} />
                <span className="text-xs font-medium text-[#647087]">{rtl ? 'ألوان مساحة العمل' : 'Workspace colors'}</span>
              </div>
            </div>

            <div className="mt-8 flex items-center gap-3">
              <button type="button" onClick={prevStep} className={secondaryButtonClass}>
                {rtl ? 'السابق' : 'Previous'}
              </button>
              <button type="button" onClick={nextStep} className={primaryButtonClass}>
                {rtl ? 'التالي' : 'Next step'}
              </button>
            </div>
          </div>

          {/* STEP 4 — Review */}
          <div className={`space-y-4 ${step === 4 ? 'block' : 'hidden'}`}>
            <dl className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface text-sm">
              <ReviewRow label={rtl ? 'نوع النشاط' : 'Business type'} value={businessTypeLabels[businessType][locale]} />
              <ReviewRow label={rtl ? 'اسم مساحة العمل' : 'Workspace name'} value={name || '—'} />
              <ReviewRow label={rtl ? 'الرابط' : 'URL'} value={publicTenantUrl(locale, slug || 'url')} ltr />
              <ReviewRow label={rtl ? 'الوصف المختصر' : 'Tagline'} value={tagline.trim() || (rtl ? 'غير محدد' : 'Not set')} />
              <ReviewRow
                label={rtl ? 'الدولة' : 'Country'}
                value={`${selectedCountry ? selectedCountry.name[locale] : country} · ${currency}`}
              />
              <ReviewRow label={rtl ? 'المنطقة الزمنية' : 'Timezone'} value={timezone} ltr />
              <ReviewRow label={rtl ? 'الفرع الرئيسي' : 'Primary branch'} value={branchName || '—'} />
              <ReviewRow label={rtl ? 'العنوان' : 'Address'} value={branchAddress.trim() || (rtl ? 'غير محدد' : 'Not set')} />
              <ReviewRow label={rtl ? 'هاتف الفرع' : 'Branch phone'} value={branchPhone.trim() || (rtl ? 'غير محدد' : 'Not set')} ltr />
              <ReviewRow
                label={rtl ? 'ساعات العمل' : 'Working hours'}
                value={
                  configureHours && openDays > 0
                    ? scheduleSummary(hours, locale)
                    : rtl
                      ? 'لم تُحدد — ستضيفها لاحقاً من تبويب «المواعيد»'
                      : 'Not set — you will add them later in Schedule'
                }
              />
              <ReviewRow
                label={rtl ? 'الشعار' : 'Logo'}
                value={logo ? (rtl ? 'تم اختيار شعار' : 'Logo selected') : rtl ? 'بدون شعار' : 'No logo'}
              />
            </dl>

            <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#e1e5ed] bg-paper p-3">
              <span className="h-8 w-8 shrink-0 rounded-lg shadow-sm" style={{ background: primary }} />
              <span className="h-8 w-8 shrink-0 rounded-lg border border-[#e1e5ed] shadow-sm" style={{ background: accent }} />
              <span className="text-xs font-medium text-[#647087]">{rtl ? 'ألوان مساحة العمل' : 'Workspace colors'}</span>
            </div>

            <p className="rounded-xl bg-surface px-4 py-3 text-xs text-ink-muted">
              {rtl
                ? 'يمكنك تعديل الاسم والشعار والألوان والعنوان لاحقاً. الرابط المختصر دائم ولا يمكن تغييره.'
                : 'You can change the name, logo, colors and address later. The workspace URL is permanent.'}
            </p>

            {state && (
              <p role="alert" aria-live="polite" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {state.message[locale]}
              </p>
            )}
            {state && (toast('error', state.message[locale]), null)}

            <div className="mt-8 flex items-center gap-3">
              <button type="button" onClick={prevStep} disabled={pending} className={secondaryButtonClass}>
                {rtl ? 'السابق' : 'Previous'}
              </button>
              <button type="submit" disabled={pending} className={primaryButtonClass}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {pending ? (rtl ? 'جارٍ الإنشاء...' : 'Creating...') : rtl ? 'إنشاء مساحة العمل' : 'Create workspace'}
              </button>
            </div>
          </div>
        </form>

        <div className="mt-8 flex justify-center items-center gap-2 text-xs text-ink-lighter">
          <ShieldCheck className="h-4 w-4 text-[#35a672]" />
          {rtl ? 'بياناتك محفوظة داخل مساحتك فقط' : 'Your data stays inside your workspace'}
        </div>
      </div>
    </>
  )
}

function ReviewRow({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 text-xs font-semibold text-[#647087]">{label}</dt>
      <dd className="min-w-0 break-words text-end text-xs font-medium text-[#172033]" dir={ltr ? 'ltr' : undefined}>
        {value}
      </dd>
    </div>
  )
}
