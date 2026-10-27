'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/navigation'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  ChevronUp,
  Globe,
  Lock,
  LogOut,
  Shield,
  User,
} from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { buildLocalizedPath, UNLOCALIZED_ROUTES } from '@/lib/locale-path'
import type { Locale } from '@/lib/i18n'
import type { MemberRole } from '@/lib/authz'

interface DashboardUserMenuProps {
  user: {
    name: string
    email: string
    image?: string | null
  }
  role: MemberRole
  locale: Locale
  slug: string
}

const ROLE_LABELS: Record<MemberRole, { ar: string; en: string }> = {
  owner: { ar: 'المالك', en: 'Owner' },
  admin: { ar: 'مشرف', en: 'Admin' },
  manager: { ar: 'مدير', en: 'Manager' },
  receptionist: { ar: 'موظف استقبال', en: 'Receptionist' },
  staff: { ar: 'موظف استقبال', en: 'Receptionist' },
}

const ROLE_BADGES: Record<MemberRole, string> = {
  owner: 'bg-purple-100 text-purple-700 border-purple-200',
  admin: 'bg-amber-100 text-amber-800 border-amber-200',
  manager: 'bg-blue-100 text-blue-800 border-blue-200',
  receptionist: 'bg-teal-50 text-brand-teal border-[#bfe8e4]',
  staff: 'bg-teal-50 text-brand-teal border-[#bfe8e4]',
}

export function DashboardUserMenu({
  user,
  role,
  locale,
  slug,
}: DashboardUserMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const rtl = locale === 'ar'

  const targetLocale = locale === 'ar' ? 'en' : 'ar'

  // Click outside & Escape dismiss
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  function handleLanguageSwitch() {
    document.cookie = `idarty_locale=${targetLocale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    const search = searchParams.toString() ? `?${searchParams.toString()}` : ''
    const localized = buildLocalizedPath(pathname, locale, targetLocale, search)
    if (localized) {
      router.push(localized)
      return
    }
    const segments = pathname.split('/').filter(Boolean)
    if (segments.length === 1 && UNLOCALIZED_ROUTES.has(segments[0])) {
      router.push(`/${targetLocale}/${segments[0]}${search}`)
    } else {
      router.push(`/${targetLocale}`)
    }
  }

  async function handleSignOut() {
    await authClient.signOut()
    window.location.href = '/'
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
    <div ref={menuRef} className="relative w-full">
      {/* Floating Popover Menu (Opens above the button) */}
      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute bottom-full mb-2 start-0 end-0 z-50 rounded-2xl border border-border bg-paper p-2 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {/* Popover User Identity Header */}
          <div className="flex items-center gap-3 p-2.5 border-b border-border/80 pb-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-teal/15 text-sm font-bold text-brand-teal border border-brand-teal/20">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[#172033]">{cleanName}</p>
              <p className="truncate text-xs text-ink-muted">{user.email}</p>
              <div className="mt-1">
                <span
                  className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ROLE_BADGES[role]}`}
                >
                  {ROLE_LABELS[role]?.[locale] ?? role}
                </span>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="mt-1 space-y-0.5 text-xs">
            {/* My Profile */}
            <a
              href={`/${locale}/tenants/${slug}/dashboard?tab=settings&sub=profile`}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 font-medium text-[#172033] transition hover:bg-surface hover:text-brand-teal"
            >
              <User className="h-4 w-4 text-ink-muted" />
              <span>{rtl ? 'الملف الشخصي' : 'My Profile'}</span>
            </a>

            {/* Security & Password */}
            <a
              href={`/${locale}/tenants/${slug}/dashboard?tab=settings&sub=security`}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 font-medium text-[#172033] transition hover:bg-surface hover:text-brand-teal"
            >
              <Lock className="h-4 w-4 text-ink-muted" />
              <span>{rtl ? 'إعدادات الأمان وكلمة المرور' : 'Security & Password'}</span>
            </a>

            {/* Language Switcher */}
            <button
              type="button"
              onClick={handleLanguageSwitch}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 font-medium text-[#172033] transition hover:bg-surface hover:text-brand-teal text-start"
            >
              <div className="flex items-center gap-2.5">
                <Globe className="h-4 w-4 text-ink-muted" />
                <span>{rtl ? 'تغيير اللغة' : 'Change Language'}</span>
              </div>
              <span className="rounded-lg border border-border bg-surface px-2 py-0.5 text-[10px] font-bold text-ink-muted">
                {rtl ? 'English' : 'العربية'}
              </span>
            </button>

            <div className="my-1 border-t border-border/80" />

            {/* Sign Out */}
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 font-medium text-rose-600 transition hover:bg-rose-50 text-start"
            >
              <LogOut className="h-4 w-4" />
              <span>{rtl ? 'تسجيل الخروج' : 'Sign out'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Persistent Sidebar Footer Card / Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={`flex w-full items-center justify-between gap-2.5 rounded-2xl border p-2.5 text-start transition cursor-pointer ${
          isOpen
            ? 'border-brand-teal bg-surface shadow-xs'
            : 'border-border bg-surface/70 hover:border-brand-teal/50 hover:bg-surface'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-teal/15 text-xs font-bold text-brand-teal border border-brand-teal/20">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-[#172033]">{user.name}</p>
            <p className="truncate text-[10px] text-ink-muted">{ROLE_LABELS[role]?.[locale] ?? role}</p>
          </div>
        </div>
        <ChevronUp
          className={`h-4 w-4 shrink-0 text-ink-muted transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-brand-teal' : ''
          }`}
        />
      </button>
    </div>
  )
}
