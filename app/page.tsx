'use client'

import React, { useRef } from 'react'
import Link from 'next/link'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(useGSAP, ScrollTrigger)
import { ArrowRight, Building2, CalendarCheck2, Camera, Check, Clock3, Dumbbell, HeartPulse, LayoutDashboard, Scissors, ShieldCheck, Sparkles, UsersRound } from 'lucide-react'
import { MobileNav } from '@/components/mobile-nav'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { Logo } from '@/components/logo'
import { authClient } from '@/lib/auth-client'

const features = [
  {
    icon: CalendarCheck2,
    title: 'Bookings that fit your business',
    description: 'Let customers book the right service, with the right team member, at a time that works — all without a single phone call.',
  },
  {
    icon: Clock3,
    title: 'Less back-and-forth',
    description: 'Automated availability and reminders keep every appointment moving without extra admin work on your side.',
  },
  {
    icon: UsersRound,
    title: 'One calm workspace',
    description: 'Give your team a simple, beautiful place to manage schedules, customers, and daily requests.',
  },
]

const arabicFeatures = [
  {
    icon: CalendarCheck2,
    title: 'حجوزات تناسب نشاطك',
    description: 'دع العملاء يحجزون الخدمة المناسبة مع الموظف المناسب في الوقت المناسب، بدون أي مكالمات هاتفية.',
  },
  {
    icon: Clock3,
    title: 'تواصل أقل',
    description: 'تساعدك أوقات التوفر والتذكيرات التلقائية على تنظيم كل موعد بسهولة، بدون جهد إضافي من طرفك.',
  },
  {
    icon: UsersRound,
    title: 'مساحة عمل هادئة',
    description: 'امنح فريقك مكاناً بسيطاً وجميلاً لإدارة الجداول والعملاء والطلبات اليومية.',
  },
]

export default function Page({ locale = 'ar' }: { locale?: 'ar' | 'en' }) {
  const { data: session, isPending: authPending } = authClient.useSession()
  const authPath = (path: 'login' | 'signup') => `/${locale}/${path}`
  const rtl = locale === 'ar'

  const copy = rtl ? {
    how: 'كيف يعمل',
    features: 'المزايا',
    businesses: 'للشركات',
    pricing: 'الأسعار',
    login: 'تسجيل الدخول',
    getStarted: 'ابدأ الآن',
    dashboard: 'لوحة التحكم',
    eyebrow: 'طريقة أفضل لإدارة يومك',
    title: 'اجعل كل حجز أكثر سهولة.',
    description: 'يمنح idarty الشركات الخدمية مكاناً واحداً لإدارة المواعيد والفرق والعملاء، لتمنح وقتك لما يهم فعلاً.',
    start: 'ابدأ مجاناً',
    seeHow: 'اكتشف كيف يعمل',
    noCard: 'لا تحتاج إلى بطاقة ائتمانية',
    teams: 'مصمم للفرق النامية',
    howWorksTitle: 'الطريقة التي يعمل بها',
    howWorksDesc: 'من أول حجز إلى آخر تذكير، يساعدك idarty على تنظيم نشاطك والعناية بعملائك.',
    featuresTitle: 'كل ما تحتاجه في مكان واحد',
    businessEyebrow: 'مصمم للشركات الحقيقية',
    businessTitle: 'رعاية أكبر للعملاء. عمل أقل خلف الكواليس.',
    businessDescription: 'سواء كنت تدير عيادة أو استوديو أو مكتباً استشارياً أو خدمة محلية، يتكيف idarty مع طريقة عمل فريقك.',
    createWorkspace: 'أنشئ مساحة عملك',
    ready: 'مستعد عندما تكون',
    readyTitle: 'امنح نشاطك طريقة أكثر هدوءاً للنمو.',
    readyDesc: 'انضم إلى الشركات التي تثق في idarty لإدارة أيامها.',
    secure: 'مصمم بأمان',
    featuresFooter: 'المزايا',
    businessesFooter: 'الشركات',
    secureAria: 'آمن بتصميمه',
    copyright: '© 2025 إدارتي',
  } : {
    how: 'How it works',
    features: 'Features',
    businesses: 'For businesses',
    pricing: 'Pricing',
    login: 'Log in',
    getStarted: 'Get started',
    dashboard: 'Dashboard',
    eyebrow: 'A better way to run your day',
    title: 'Make every booking feel effortless.',
    description: 'idarty gives service businesses one simple place to manage appointments, teams, and customers — so you can spend more time on work that matters.',
    start: 'Start for free',
    seeHow: 'See how it works',
    noCard: 'No credit card required',
    teams: 'Built for growing teams',
    howWorksTitle: 'How it works',
    howWorksDesc: 'From the first booking to the final reminder, idarty helps you organize your business and care for your clients.',
    featuresTitle: 'Everything you need in one place',
    businessEyebrow: 'Built for real businesses',
    businessTitle: 'More care for clients. Less work behind the scenes.',
    businessDescription: 'Whether you run a clinic, studio, consulting firm, or local service, idarty adapts to how your team works.',
    createWorkspace: 'Create your workspace',
    ready: 'Ready when you are',
    readyTitle: 'Give your business a calmer way to grow.',
    readyDesc: 'Join the businesses that trust idarty to manage their day.',
    secure: 'Secure by design',
    featuresFooter: 'Features',
    businessesFooter: 'Businesses',
    secureAria: 'Secure by design',
    copyright: '© 2025 Idarty',
  }

  const activeFeatures = rtl ? arabicFeatures : features

  const container = useRef<HTMLElement>(null)

  useGSAP(() => {
    // 1. Hero Entrance Animation
    const tl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 1 } })
    
    tl.fromTo('.hero-eyebrow', { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.8 })
      .fromTo('.hero-title > span', { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.15 }, '-=0.5')
      .fromTo('.hero-desc', { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1 }, '-=0.6')
      .fromTo('.hero-cta', { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.1 }, '-=0.7')
      .fromTo('.hero-trust', { autoAlpha: 0 }, { autoAlpha: 1 }, '-=0.5')
      .fromTo('.hero-mockup', { y: 60, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1.2, ease: 'expo.out' }, '-=0.8')
      .fromTo('.hero-mockup-badge', { scale: 0.8, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, stagger: 0.15, ease: 'back.out(1.5)' }, '-=0.8')
      .fromTo('.hero-metrics > div', { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.1 }, '-=0.9')

    // 2. Scroll Animations for Sections
    gsap.utils.toArray<HTMLElement>('.fade-up-section').forEach((section) => {
      gsap.fromTo(section, 
        { y: 40, autoAlpha: 0 },
        { scrollTrigger: { trigger: section, start: 'top 85%' }, y: 0, autoAlpha: 1, duration: 1, ease: 'power3.out' }
      )
    })

    // 3. Staggered Step Cards (How it works)
    gsap.fromTo('.step-card', 
      { y: 40, autoAlpha: 0 },
      { scrollTrigger: { trigger: '#how-it-works-grid', start: 'top 80%' }, y: 0, autoAlpha: 1, stagger: 0.1, duration: 0.8, ease: 'power2.out' }
    )

    // 4. Staggered Feature Cards
    gsap.fromTo('.feature-card', 
      { y: 40, autoAlpha: 0 },
      { scrollTrigger: { trigger: '#features-grid', start: 'top 80%' }, y: 0, autoAlpha: 1, stagger: 0.1, duration: 0.8, ease: 'power2.out' }
    )

    // 5. Staggered Business Tiles
    gsap.fromTo('.business-tile', 
      { scale: 0.95, y: 30, autoAlpha: 0 },
      { scrollTrigger: { trigger: '#businesses-grid', start: 'top 85%' }, scale: 1, y: 0, autoAlpha: 1, stagger: 0.05, duration: 0.8, ease: 'back.out(1.2)' }
    )
  }, { scope: container })

  return (
    <main ref={container} dir={rtl ? 'rtl' : 'ltr'} className="min-h-screen overflow-x-hidden bg-paper text-ink pt-20">

      {/* ── HEADER ─────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-50 border-b border-[#eaeff7] bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label={rtl ? 'الصفحة الرئيسية - إدارتي' : 'Idarty home'}>
            <Logo locale={locale} height={28} />
          </Link>

          <nav className="hidden items-center gap-8 md:flex" aria-label="Main navigation">
            {[{ label: copy.how, href: '#how-it-works' }, { label: copy.features, href: '#features' }, { label: copy.businesses, href: '#businesses' }].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-semibold text-ink-muted transition-colors hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 rounded-sm"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <LocaleSwitcher currentLocale={locale} />
            {authPending ? (
              <div className="hidden h-10 w-24 animate-pulse rounded-xl bg-border/40 md:block" />
            ) : session ? (
              <Link
                href={`/${locale}/dashboard`}
                className="hidden rounded-xl bg-brand-teal px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(15,118,110,0.25)] transition-all hover:bg-[#0d6560] hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(15,118,110,0.3)] outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 md:inline-flex md:items-center md:gap-1.5"
              >
                {copy.dashboard}
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
            ) : (
              <>
                <Link
                  href={authPath('login')}
                  className="hidden rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-teal md:block"
                >
                  {copy.login}
                </Link>
                <Link
                  href={authPath('signup')}
                  className="hidden md:inline-flex items-center gap-1.5 rounded-xl bg-brand-teal px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(15,118,110,0.25)] transition-all hover:bg-[#0d6560] hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(15,118,110,0.3)] outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
                >
                  {copy.getStarted}
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </Link>
              </>
            )}
            <MobileNav locale={locale} labels={{ open: rtl ? 'فتح القائمة' : 'Open navigation', close: rtl ? 'إغلاق القائمة' : 'Close navigation', links: [{ label: copy.how, href: '#how-it-works' }, { label: copy.features, href: '#features' }, { label: copy.businesses, href: '#businesses' }] }} />
          </div>
        </div>
      </header>

      {/* ── HERO ───────────────────────────────── */}
      <section className="relative overflow-hidden bg-paper">
        {/* Background: large soft teal glow top-right, secondary glow bottom-left */}
        <div aria-hidden="true" className="pointer-events-none absolute -top-32 -end-32 size-[700px] rounded-full bg-gradient-radial from-brand-teal/10 via-brand-teal/[0.04] to-transparent blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-0 -start-40 size-[500px] rounded-full bg-gradient-radial from-brand-teal/[0.06] to-transparent blur-3xl" />

        {/* Fine grid texture overlay */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#0F766E08_1px,transparent_1px),linear-gradient(to_bottom,#0F766E08_1px,transparent_1px)] bg-[size:64px_64px]" />

        <div className="relative mx-auto max-w-7xl px-5 sm:px-8">

          {/* ── Top eyebrow strip ── */}
          <div className="flex items-center justify-center pt-16 sm:pt-20">
            <div className="hero-eyebrow inline-flex items-center gap-2.5 rounded-full border border-brand-teal/25 bg-brand-teal/5 px-5 py-2.5 text-xs font-bold tracking-widest text-brand-teal uppercase shadow-[0_2px_12px_rgba(15,118,110,0.10)]">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-teal animate-pulse" />
              {copy.eyebrow}
            </div>
          </div>

          {/* ── Headline ── */}
          <div className="mx-auto mt-10 max-w-4xl text-center">
            <h1 className="hero-title text-[2.5rem] font-extrabold leading-[1.06] tracking-[-0.03em] text-ink sm:text-5xl lg:text-[4.5rem]">
              {rtl ? (
                <span className="block">{copy.title}</span>
              ) : (
                <>
                  <span className="block text-ink">Make every booking</span>
                  <span className="relative mt-1 inline-block">
                    <span className="relative z-10 text-brand-teal">feel effortless.</span>
                    {/* Underline accent */}
                    <svg aria-hidden="true" className="absolute -bottom-3 start-0 w-full" viewBox="0 0 400 14" fill="none" preserveAspectRatio="none">
                      <path d="M2 10 Q100 2 200 8 Q300 14 398 6" stroke="#0F766E" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.45"/>
                    </svg>
                  </span>
                </>
              )}
            </h1>

            <p className="hero-desc mx-auto mt-7 max-w-2xl text-lg leading-8 text-ink-muted sm:text-xl sm:leading-relaxed">
              {copy.description}
            </p>
          </div>

          {/* ── CTAs ── */}
          <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href={authPath('signup')}
              className="hero-cta group relative inline-flex h-14 w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-brand-teal px-10 text-base font-bold text-white shadow-[0_6px_24px_rgba(15,118,110,0.30)] transition-all duration-300 hover:bg-[#0d6560] hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(15,118,110,0.38)] outline-none focus-visible:ring-4 focus-visible:ring-brand-teal/30 sm:w-auto"
            >
              <span className="relative z-10">{copy.start}</span>
              <ArrowRight aria-hidden="true" className="relative z-10 size-4.5 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <a
              href="#how-it-works"
              className="hero-cta inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#dfe5f0] bg-paper px-10 text-base font-bold text-ink-muted transition-all duration-200 hover:border-brand-teal/40 hover:bg-brand-teal/4 hover:text-brand-teal outline-none focus-visible:ring-4 focus-visible:ring-brand-teal/20 sm:w-auto"
            >
              {copy.seeHow}
            </a>
          </div>

          {/* ── Trust signals ── */}
          <div className="hero-trust mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-lighter">
              <Check aria-hidden="true" className="size-4 text-success" />
              {copy.noCard}
            </span>
            <span className="h-4 w-px bg-border hidden sm:block" />
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-lighter">
              <Check aria-hidden="true" className="size-4 text-success" />
              {copy.teams}
            </span>
            <span className="h-4 w-px bg-border hidden sm:block" />
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-lighter">
              <ShieldCheck aria-hidden="true" className="size-4 text-success" />
              {copy.secure}
            </span>
          </div>

          {/* ── Hero app mockup — full width, browser chrome style ── */}
          <div className="relative mt-20 sm:mt-24">
            {/* Floating stat badge — top start */}
            <div className="hero-mockup-badge absolute -start-3 -top-6 z-20 hidden rounded-2xl border border-[#d8eae8] bg-paper px-4 py-3.5 shadow-[0_10px_40px_rgba(15,118,110,0.14)] sm:block">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-success-soft text-success">
                  <CalendarCheck2 className="size-4.5" />
                </span>
                <div>
                  <p className="text-xs font-bold text-ink">{rtl ? 'تم تأكيد الحجز' : 'Booking confirmed'}</p>
                  <p className="text-[11px] text-ink-lighter">{rtl ? 'اليوم الساعة ١٠:٣٠ ص' : 'Today at 10:30 AM'}</p>
                </div>
              </div>
            </div>

            {/* Floating growth badge — top end */}
            <div className="hero-mockup-badge absolute -end-3 -top-6 z-20 hidden rounded-2xl border border-[#d8eae8] bg-paper px-5 py-3.5 shadow-[0_10px_40px_rgba(11,11,15,0.10)] sm:block">
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-lighter">{rtl ? 'هذا الشهر' : 'This month'}</p>
              <p className="mt-0.5 text-3xl font-extrabold tracking-tight text-ink">+28%</p>
              <p className="text-xs font-semibold text-success">{rtl ? 'حجوزات أكثر' : 'more bookings'}</p>
            </div>

            {/* Browser frame */}
            <div className="hero-mockup overflow-hidden rounded-t-3xl border-2 border-b-0 border-[#dde4f0] bg-paper shadow-[0_-12px_80px_rgba(11,11,15,0.08),0_0_0_1px_rgba(15,118,110,0.06)]">
              {/* Browser top bar */}
              <div className="flex h-11 items-center gap-3 border-b border-[#eaeff7] bg-surface px-5">
                <div className="flex gap-1.5">
                  <div className="size-3 rounded-full bg-[#ffb3b0]" />
                  <div className="size-3 rounded-full bg-[#ffd580]" />
                  <div className="size-3 rounded-full bg-[#a4e0c0]" />
                </div>
                <div className="flex h-6 flex-1 items-center rounded-md border border-[#dde4f0] bg-paper px-3">
                  <span className="text-[11px] font-semibold text-ink-lighter">app.idarty.com/dashboard</span>
                </div>
              </div>

              {/* App body */}
              <div className="grid min-h-[360px] sm:min-h-[440px] grid-cols-1 sm:grid-cols-[220px_1fr]">
                {/* Sidebar */}
                <div className="hidden border-e border-[#eaeff7] bg-surface sm:block">
                  <div className="p-5">
                    <div className="mb-6 h-7 w-24 rounded-lg bg-border/40" />
                    {['Dashboard', 'Bookings', 'Clients', 'Services', 'Staff', 'Settings'].map((item, i) => (
                      <div
                        key={item}
                        className={`mb-1.5 flex h-9 items-center gap-2.5 rounded-xl px-3 text-xs font-semibold ${i === 1 ? 'bg-brand-teal text-white' : 'text-ink-muted hover:bg-[#eaeff7]'}`}
                      >
                        <div className={`size-4 rounded ${i === 1 ? 'bg-white/30' : 'bg-border/50'}`} />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Main content */}
                <div className="p-5 sm:p-8">
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <div className="h-3 w-28 rounded-full bg-border/40" />
                      <div className="mt-2 h-6 w-44 rounded-lg bg-ink/10" />
                    </div>
                    <div className="h-9 w-28 rounded-xl bg-brand-teal/15" />
                  </div>

                  {/* Schedule items */}
                  <div className="space-y-3">
                    <ScheduleItem time="09:00" title={rtl ? 'استشارة' : 'Consultation'} name={rtl ? 'عيادة القاهرة للأسنان' : 'Cairo Dental Clinic'} accent="teal" />
                    <ScheduleItem time="10:30" title={rtl ? 'موعد متابعة' : 'Follow-up appointment'} name={rtl ? 'مركز النيل للعافية' : 'Nile Wellness Center'} accent="violet" />
                    <ScheduleItem time="12:00" title={rtl ? 'توافر الفريق' : 'Team availability'} name={rtl ? '٣ أعضاء متصلون' : '3 members online'} accent="green" />
                    <div className="h-12 rounded-xl border border-dashed border-[#c8d6f0] bg-surface/60" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Metrics strip below mockup ── */}
          <div className="hero-metrics grid grid-cols-2 divide-x divide-[#eaeff7] border-x-2 border-b-2 border-[#dde4f0] sm:grid-cols-4">
            {([
              { value: '3 min', label: rtl ? 'متوسط وقت الإعداد' : 'Avg. setup time' },
              { value: '98%', label: rtl ? 'رضا العملاء' : 'Client satisfaction' },
              { value: '40h', label: rtl ? 'موفرة شهرياً' : 'Saved per month' },
              { value: '10×', label: rtl ? 'أسرع من البريد الإلكتروني' : 'Faster than email' },
            ] as Array<{ value: string; label: string }>).map(({ value, label }) => (
              <div key={label} className="flex flex-col items-center gap-1 bg-paper px-4 py-6">
                <span className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{value}</span>
                <span className="text-center text-xs font-semibold text-ink-lighter">{label}</span>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────── */}
      <section id="how-it-works" className="fade-up-section bg-surface py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold tracking-widest text-brand-teal uppercase">{copy.howWorksTitle}</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl lg:text-5xl">
              {rtl ? 'يبدأ اليوم الواضح من هنا.' : 'A clearer day starts here.'}
            </h2>
            <p className="mt-5 text-lg leading-8 text-ink-muted">{copy.howWorksDesc}</p>
          </div>

          {/* Steps */}
          <div id="how-it-works-grid" className="mt-20 grid gap-8 sm:grid-cols-3">
            {([
              { step: '01', en: 'Set up your workspace', ar: 'أنشئ مساحة عملك', endesc: 'Add your services, set your team hours, and share your booking link.', ardesc: 'أضف خدماتك، وحدد ساعات فريقك، وشارك رابط الحجز الخاص بك.' },
              { step: '02', en: 'Customers book online', ar: 'العملاء يحجزون عبر الإنترنت', endesc: 'They pick a service, choose a staff member, and select a time — no calls needed.', ardesc: 'يختار العملاء خدمة وموظفاً وموعداً، دون الحاجة إلى مكالمات.' },
              { step: '03', en: 'You focus on the work', ar: 'ركز أنت على العمل', endesc: 'idarty handles confirmations, reminders, and your daily schedule view.', ardesc: 'يتولى idarty التأكيدات والتذكيرات وعرض جدولك اليومي.' },
            ] as Array<{ step: string; en: string; ar: string; endesc: string; ardesc: string }>).map(({ step, en, ar, endesc, ardesc }) => (
              <div key={step} className="step-card relative rounded-3xl border border-[#e4ecf6] bg-paper p-8 shadow-[0_4px_20px_rgba(15,118,110,0.05)] transition-shadow hover:shadow-[0_8px_32px_rgba(15,118,110,0.10)]">
                <span className="text-4xl font-extrabold text-brand-teal/15 select-none">{step}</span>
                <h3 className="mt-3 text-lg font-bold text-ink">{rtl ? ar : en}</h3>
                <p className="mt-2 text-[15px] leading-7 text-ink-muted">{rtl ? ardesc : endesc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ───────────────────────────── */}
      <section id="features" className="fade-up-section bg-paper py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mx-auto max-w-xl text-center">
            <p className="text-sm font-bold tracking-widest text-brand-teal uppercase">{copy.featuresTitle}</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              {rtl ? 'كل ما تحتاجه في مكان واحد' : 'Everything your team needs, in one place'}
            </h2>
          </div>

          <div id="features-grid" className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {activeFeatures.map((feature) => (
              <div
                key={feature.title}
                className="feature-card group flex flex-col gap-5 rounded-3xl border border-[#eaeff7] bg-paper p-8 shadow-[0_2px_12px_rgba(11,11,15,0.04)] transition-all duration-300 hover:border-brand-teal/30 hover:shadow-[0_8px_32px_rgba(15,118,110,0.10)] hover:-translate-y-1"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-teal/8 text-brand-teal transition-colors group-hover:bg-brand-teal group-hover:text-white">
                  <feature.icon aria-hidden="true" className="size-5.5" />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-ink">{feature.title}</h3>
                  <p className="mt-2.5 text-[15px] leading-7 text-ink-muted">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BUILT FOR YOUR BUSINESS ─────────────── */}
      <section id="businesses" className="fade-up-section bg-surface py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">

          {/* Header */}
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold tracking-widest text-brand-teal uppercase">{copy.businessEyebrow}</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-5xl leading-[1.1]">
              {rtl ? 'مصمم لنشاطك التجاري' : 'Built for your business'}
            </h2>
            <p className="mt-5 text-lg leading-8 text-ink-muted">
              {rtl
                ? 'سواء كنت تدير صالوناً أو عيادة أو نادياً رياضياً، idarty يتكيف مع طريقة عملك.'
                : 'Whether you run a salon, a clinic, or a gym, idarty adapts to how your business works.'}
            </p>
          </div>

          {/* Activity tiles — 3 cols on md, 4 on lg */}
          <div id="businesses-grid" className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {([
              {
                icon: Scissors,
                en: 'Beauty Salon',       ar: 'صالون تجميل',
                tag_en: 'Hair · Nails · Skin',  tag_ar: 'شعر · أظافر · بشرة',
                color: 'bg-[#fdf4ff] text-[#9333ea] border-[#f3e8ff]',
                iconHover: 'group-hover:bg-[#9333ea]',
              },
              {
                icon: UsersRound,
                en: "Men's Barbershop",  ar: 'حلاق رجالي',
                tag_en: 'Cuts · Shave · Beard', tag_ar: 'قص · حلاقة · لحية',
                color: 'bg-[#eff6ff] text-[#2563eb] border-[#dbeafe]',
                iconHover: 'group-hover:bg-[#2563eb]',
              },
              {
                icon: Dumbbell,
                en: 'Gym & Fitness',     ar: 'نادي رياضي',
                tag_en: 'Classes · PT · Yoga',  tag_ar: 'جلسات · مدرب · يوغا',
                color: 'bg-[#fff7ed] text-[#ea580c] border-[#fed7aa]',
                iconHover: 'group-hover:bg-[#ea580c]',
              },
              {
                icon: HeartPulse,
                en: 'Clinic',            ar: 'عيادة',
                tag_en: 'Medical · Dental · Mental', tag_ar: 'طب · أسنان · نفسي',
                color: 'bg-[#f0fdf4] text-[#16a34a] border-[#bbf7d0]',
                iconHover: 'group-hover:bg-[#16a34a]',
              },
              {
                icon: Camera,
                en: 'Studio',            ar: 'استوديو',
                tag_en: 'Photo · Video · Music',    tag_ar: 'تصوير · مونتاج · موسيقى',
                color: 'bg-[#fff1f2] text-[#e11d48] border-[#fecdd3]',
                iconHover: 'group-hover:bg-[#e11d48]',
              },
              {
                icon: Building2,
                en: 'Consulting',        ar: 'استشارات',
                tag_en: 'Legal · Finance · HR',     tag_ar: 'قانوني · مالي · موارد',
                color: 'bg-brand-teal/5 text-brand-teal border-brand-teal/20',
                iconHover: 'group-hover:bg-brand-teal',
              },
              {
                icon: LayoutDashboard,
                en: 'Any Service',       ar: 'نشاط آخر',
                tag_en: 'If you book it, we handle it', tag_ar: 'أي نشاط لديه مواعيد',
                color: 'bg-[#f8fafc] text-[#64748b] border-[#e2e8f0]',
                iconHover: 'group-hover:bg-[#64748b]',
              },
            ] as Array<{ icon: React.ElementType; en: string; ar: string; tag_en: string; tag_ar: string; color: string; iconHover: string }>).map(({ icon: Icon, en, ar, tag_en, tag_ar, color, iconHover }) => (
              <div
                key={en}
                className="business-tile group relative flex flex-col gap-4 overflow-hidden rounded-3xl border border-[#e4ecf6] bg-paper p-6 shadow-[0_2px_8px_rgba(11,11,15,0.04)] transition-all duration-300 hover:shadow-[0_10px_36px_rgba(11,11,15,0.09)] hover:-translate-y-1 cursor-default"
              >
                <span className={`relative flex size-12 items-center justify-center rounded-2xl border transition-all duration-300 group-hover:text-white group-hover:border-transparent group-hover:scale-105 ${color} ${iconHover}`}>
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <h3 className="text-[15px] font-extrabold tracking-tight text-ink">{rtl ? ar : en}</h3>
                  <p className="mt-1.5 text-xs font-semibold text-ink-lighter leading-5">{rtl ? tag_ar : tag_en}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom CTA bar */}
          <div className="mt-10 flex flex-col items-center gap-5 sm:flex-row sm:justify-between rounded-3xl border border-[#e4ecf6] bg-paper px-8 py-6 shadow-[0_2px_12px_rgba(11,11,15,0.04)]">
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 sm:justify-start">
              {([
                { en: 'Free to start', ar: 'مجاني للبدء' },
                { en: 'Ready in minutes', ar: 'جاهز في دقائق' },
                { en: 'No setup fee', ar: 'بدون رسوم إعداد' },
              ] as Array<{ en: string; ar: string }>).map(({ en, ar }) => (
                <span key={en} className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
                  <Check aria-hidden="true" className="size-4 text-success" />
                  {rtl ? ar : en}
                </span>
              ))}
            </div>
            <Link
              href={authPath('signup')}
              className="group shrink-0 inline-flex items-center gap-2 rounded-xl bg-brand-teal px-7 py-3.5 text-[15px] font-bold text-white shadow-[0_4px_16px_rgba(15,118,110,0.24)] transition-all hover:bg-[#0d6560] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,118,110,0.30)] outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
            >
              {copy.createWorkspace}
              <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

        </div>
      </section>


      {/* ── CTA ────────────────────────────────── */}
      <section id="pricing" className="fade-up-section bg-paper py-24 sm:py-32">
        <div className="mx-auto max-w-4xl px-5 sm:px-8 text-center">
          <div className="relative overflow-hidden rounded-3xl bg-brand-teal/5 border border-brand-teal/15 px-8 py-20 sm:px-16 sm:py-24">
            {/* Subtle radial glow */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-80 w-80 rounded-full bg-brand-teal/10 blur-3xl" />
            </div>

            <div className="relative">
              <p className="text-sm font-bold tracking-widest text-brand-teal uppercase">{copy.ready}</p>
              <h2 className="mt-5 text-3xl font-bold tracking-tight text-ink sm:text-5xl leading-[1.1]">
                {copy.readyTitle}
              </h2>
              <p className="mx-auto mt-5 max-w-lg text-lg text-ink-muted">{copy.readyDesc}</p>

              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href={authPath('signup')}
                  className="group inline-flex h-12 items-center gap-2 rounded-xl bg-brand-teal px-8 text-[15px] font-semibold text-white shadow-[0_4px_16px_rgba(15,118,110,0.24)] transition-all hover:bg-[#0d6560] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,118,110,0.3)] outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
                >
                  {rtl ? 'ابدأ مجاناً' : 'Start for free'}
                  <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>

              <p className="mt-5 text-sm text-ink-lighter flex items-center justify-center gap-2">
                <Check aria-hidden="true" className="size-3.5 text-success" />
                {copy.noCard}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────── */}
      <footer className="border-t border-[#eaeff7] bg-surface">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-center md:justify-between">
          <Link href="/" aria-label={rtl ? 'إدارتي' : 'Idarty'}>
            <Logo locale={locale} height={26} />
          </Link>

          <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-semibold text-ink-muted">
            <a href="#how-it-works" className="transition-colors hover:text-ink">{copy.featuresFooter}</a>
            <a href="#businesses" className="transition-colors hover:text-ink">{copy.businessesFooter}</a>
            {session ? (
              <Link href={`/${locale}/dashboard`} className="transition-colors hover:text-ink">{copy.dashboard}</Link>
            ) : (
              <>
                <Link href={authPath('login')} className="transition-colors hover:text-ink">{copy.login}</Link>
                <Link href={authPath('signup')} className="transition-colors hover:text-brand-teal">{copy.getStarted}</Link>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm font-semibold text-ink-lighter">
            <ShieldCheck className="size-4 text-brand-teal" />
            {copy.secureAria}
          </div>
        </div>
      </footer>
    </main>
  )
}

/* ── sub-components ──────────────────────────────────────── */

function ScheduleItem({
  time,
  title,
  name,
  accent,
}: {
  time: string
  title: string
  name: string
  accent: 'teal' | 'violet' | 'green'
}) {
  const bg = { teal: 'bg-brand-teal/10 text-brand-teal', violet: 'bg-[#ede9fb] text-[#6d42cc]', green: 'bg-success-soft text-success' }
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-paper p-3 shadow-[0_1px_4px_rgba(11,11,15,0.06)]">
      <span className="w-11 shrink-0 text-xs font-bold text-ink-lighter">{time}</span>
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${bg[accent]}`}>
        <CalendarCheck2 aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-bold text-ink">{title}</p>
        <p className="truncate text-[11px] text-ink-lighter">{name}</p>
      </div>
    </div>
  )
}

