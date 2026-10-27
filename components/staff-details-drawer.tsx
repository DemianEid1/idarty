'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  Mail,
  Phone,
  Shield,
  ShieldAlert,
  User,
  UserX,
  X,
  Lock,
  Send,
  Layers,
  Check,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { Locale } from '@/lib/i18n'
import type { MemberRole } from '@/lib/authz'
import { hasPermission } from '@/lib/permissions-client'
import { useToast } from '@/components/toast'
import { updateStaff, resendStaffInvitation } from '@/app/[locale]/tenants/[slug]/dashboard/staff-actions'

import { StaffArchiveButton } from '@/components/staff-archive-button'

export interface StaffDrawerMember {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  role: MemberRole
  isInvited?: boolean
  userId?: string | null
}



interface StaffDetailsDrawerProps {
  isOpen: boolean
  onClose?: () => void
  closeHref?: string
  locale: Locale
  slug: string
  callerRole: MemberRole
  staffMember: StaffDrawerMember | null
  stats?: {
    bookingsCount: number
    confirmedCount: number
    noShowCount: number
  }
}

const ROLE_DATA: Record<
  MemberRole,
  {
    title: { ar: string; en: string }
    badge: string
    description: { ar: string; en: string }
    abilities: { ar: string[]; en: string[] }
  }
> = {
  owner: {
    title: { ar: 'المالك', en: 'Workspace Owner' },
    badge: 'bg-purple-100 text-purple-700 border-purple-200',
    description: {
      ar: 'المسؤول المالي والقانوني الأول وصاحب الصلاحيات المطلقة في مساحة العمل.',
      en: 'Primary financial and legal authority with unrestricted workspace control.',
    },
    abilities: {
      ar: ['كامل الصلاحيات والتحكم المطلق', 'إدارة الفوترة والاشتراكات', 'حذف أو نقل ملكية مساحة العمل'],
      en: ['Full unrestricted authority', 'Manage billing & subscriptions', 'Delete or transfer workspace'],
    },
  },
  admin: {
    title: { ar: 'مشرف', en: 'Administrator' },
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    description: {
      ar: 'الإشراف الإداري الشامل، إدارة موقع الويب، وأعضاء الفريق.',
      en: 'Comprehensive administration, public site management, and team oversight.',
    },
    abilities: {
      ar: ['إدارة موقع الويب والصفحة العامة', 'إدارة رتب وأدوار الفريق', 'الرقابة على سجل التدقيق الأمني'],
      en: ['Manage website layout & publishing', 'Manage team roles and invitations', 'Inspect full audit feed'],
    },
  },
  manager: {
    title: { ar: 'مدير', en: 'Branch Manager' },
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
    description: {
      ar: 'إدارة العمليات اليومية لكتالوج الخدمات، المواعيد، وساعات العمل.',
      en: 'Operational management of service catalog, schedule, and daily calendar.',
    },
    abilities: {
      ar: ['تعديل كتالوج الخدمات والأسعار', 'ضبط ساعات العمل والعطلات', 'دعوة موظفي استقبال ومديرين'],
      en: ['Manage services & pricing', 'Configure hours and holiday overrides', 'Invite new staff members'],
    },
  },
  receptionist: {
    title: { ar: 'موظف استقبال', en: 'Receptionist' },
    badge: 'bg-teal-50 text-brand-teal border-[#bfe8e4]',
    description: {
      ar: 'خدمة العملاء المباشرة وإدخال وتنظيم المواعيد من الكاونتر.',
      en: 'Front-desk operations, appointment scheduling, and client check-in.',
    },
    abilities: {
      ar: ['إنشاء الحجوزات وإدخال المواعيد', 'تأكيد وصول العملاء أو تسجيل الغياب', 'استعراض بيانات تواصل العملاء'],
      en: ['Create bookings via desk/phone', 'Check-in arrivals or mark no-show', 'View customer contact records'],
    },
  },
  staff: {
    title: { ar: 'موظف استقبال', en: 'Receptionist' },
    badge: 'bg-teal-50 text-brand-teal border-[#bfe8e4]',
    description: {
      ar: 'خدمة العملاء المباشرة وتنظيم المواعيد.',
      en: 'Front-desk operations and appointment scheduling.',
    },
    abilities: {
      ar: ['إنشاء الحجوزات وتأكيد الحضور'],
      en: ['Create bookings & check-in'],
    },
  },
}

export function StaffDetailsDrawer({
  isOpen,
  onClose,
  closeHref,
  locale,
  slug,
  callerRole,
  staffMember,
  stats = { bookingsCount: 0, confirmedCount: 0, noShowCount: 0 },
}: StaffDetailsDrawerProps) {
  const rtl = locale === 'ar'
  const router = useRouter()
  const { toast } = useToast()
  const [rolePending, startRoleTransition] = useTransition()
  const [resendPending, startResendTransition] = useTransition()

  const handleDismiss = () => {
    if (onClose) onClose()
    if (closeHref) router.push(closeHref)
  }

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleDismiss()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])


  // Strict restriction: Owner and Supervisor (Admin) only
  if (!isOpen || !staffMember || (callerRole !== 'owner' && callerRole !== 'admin')) return null

  const normalizedRole = staffMember.role === 'staff' ? 'receptionist' : staffMember.role
  const roleDef = ROLE_DATA[normalizedRole]
  const canEditRole =
    hasPermission(callerRole, 'team:role:manage') &&
    staffMember.role !== 'owner'
  const canArchive = hasPermission(callerRole, 'team:archive') && staffMember.role !== 'owner'

  async function handleRoleChange(newRole: MemberRole) {
    startRoleTransition(async () => {
      try {
        const fd = new FormData()
        fd.append('slug', slug)
        fd.append('locale', locale)
        fd.append('staffId', staffMember!.id)
        fd.append('name', staffMember!.name)
        fd.append('role', newRole)
        if (staffMember!.email) fd.append('email', staffMember!.email)
        if (staffMember!.phone) fd.append('phone', staffMember!.phone)
        await updateStaff(fd)
        toast('success', rtl ? 'تم تحديث دور الموظف بنجاح.' : 'Role updated successfully.')
      } catch (err: any) {
        toast('error', rtl ? 'تعذر تعديل دور الموظف.' : 'Failed to update role.')
      }
    })
  }

  async function handleResendInvite() {
    startResendTransition(async () => {
      try {
        const fd = new FormData()
        fd.append('slug', slug)
        fd.append('locale', locale)
        fd.append('staffId', staffMember!.id)
        await resendStaffInvitation(fd)
        toast('success', rtl ? 'تمت إعادة إرسال رابط الدعوة بنجاح.' : 'Invitation link resent.')
      } catch {
        toast('error', rtl ? 'تعذر إعادة إرسال الدعوة.' : 'Failed to resend invitation.')
      }
    })
  }

  const initials = staffMember.name
    ? staffMember.name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((n) => n[0].toUpperCase())
        .join('')
    : 'U'

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="fixed inset-0 z-50 flex items-center justify-end p-3 sm:p-5 pointer-events-none">
      {/* Backdrop */}
      <div
        onClick={handleDismiss}
        className="fixed inset-0 bg-black/35 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-150 pointer-events-auto"
      />

      {/* Simple, Floating Tab Panel */}
      <div className="pointer-events-auto relative z-10 flex h-[calc(100vh-2.5rem)] max-h-[860px] w-full max-w-md flex-col rounded-3xl border border-border/80 bg-paper shadow-2xl overflow-hidden animate-in fade-in slide-in-from-end duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-teal/15 text-sm font-bold text-brand-teal border border-brand-teal/20">
              {initials}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-[#172033]">{staffMember.name}</h3>
                {staffMember.isInvited ? (
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                    ● {rtl ? 'دعوة معلقة' : 'Invited'}
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                    ● {rtl ? 'مفعّل' : 'Active'}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-ink-muted">
                {staffMember.email || staffMember.phone || (rtl ? 'بدون وسيلة تواصل' : 'No contact info')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            aria-label={rtl ? 'إغلاق' : 'Close'}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-muted hover:bg-surface hover:text-[#172033] transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Contact Details Card */}
          <div className="rounded-2xl border border-border bg-surface p-4 space-y-2.5">
            <div className="flex items-center justify-between text-ink-muted">
              <span className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-brand-teal" />
                <span>{rtl ? 'البريد الإلكتروني:' : 'Email:'}</span>
              </span>
              <span className="font-semibold text-[#172033] select-all">
                {staffMember.email || (rtl ? 'غير مسجل' : 'Not set')}
              </span>
            </div>
            <div className="flex items-center justify-between text-ink-muted">
              <span className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-brand-teal" />
                <span>{rtl ? 'رقم الهاتف:' : 'Phone:'}</span>
              </span>
              <span className="font-semibold text-[#172033] select-all" dir="ltr">
                {staffMember.phone || (rtl ? 'غير مسجل' : 'Not set')}
              </span>
            </div>
          </div>

          {/* Role & Permissions Card */}
          <div className="rounded-2xl border border-border bg-paper p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-brand-teal" />
                <h4 className="font-bold text-[#172033]">{rtl ? 'الدور والصلاحيات' : 'Role & Permissions'}</h4>
              </div>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${roleDef.badge}`}>
                {roleDef.title[locale]}
              </span>
            </div>

            <p className="text-ink-muted leading-relaxed">{roleDef.description[locale]}</p>

            {/* Permissions summary */}
            <div className="space-y-1.5 pt-2 border-t border-border/80">
              <p className="font-semibold text-[#172033] text-[11px]">
                {rtl ? 'المهام المصرح بها في المنشأة:' : 'Permitted Operations:'}
              </p>
              <ul className="space-y-1 text-ink-muted ps-1">
                {roleDef.abilities[locale].map((point, idx) => (
                  <li key={idx} className="flex items-start gap-1.5 leading-normal">
                    <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>


          </div>

          {/* Operational Statistics (Separated from services) */}
          <div className="rounded-2xl border border-border bg-paper p-4 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-brand-teal" />
              <h4 className="font-bold text-[#172033]">
                {rtl ? 'مؤشرات النشاط التشغيلي' : 'Operational Activity'}
              </h4>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-border bg-surface p-2.5">
                <p className="text-base font-bold text-brand-teal">{stats.bookingsCount}</p>
                <p className="mt-0.5 text-[10px] text-ink-muted">{rtl ? 'حجوزات مسجلة' : 'Created'}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-2.5">
                <p className="text-base font-bold text-emerald-600">{stats.confirmedCount}</p>
                <p className="mt-0.5 text-[10px] text-ink-muted">{rtl ? 'حضور مؤكد' : 'Confirmed'}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-2.5">
                <p className="text-base font-bold text-slate-600">{stats.noShowCount}</p>
                <p className="mt-0.5 text-[10px] text-ink-muted">{rtl ? 'عدم حضور' : 'No-shows'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-border p-4 flex flex-wrap items-center justify-between gap-2">
          {staffMember.isInvited && (
            <button
              type="button"
              onClick={handleResendInvite}
              disabled={resendPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{resendPending ? '...' : rtl ? 'إعادة إرسال الدعوة' : 'Resend Invite'}</span>
            </button>
          )}

          <div className="ms-auto flex items-center gap-2">
            {canArchive && (
              <StaffArchiveButton slug={slug} locale={locale} staffId={staffMember.id} />
            )}
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-ink-muted hover:text-ink transition cursor-pointer"
            >
              {rtl ? 'إغلاق' : 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
