'use client'

import {
  Briefcase,
  CalendarCheck,
  Check,
  Crown,
  Lock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from 'lucide-react'
import type { Locale } from '@/lib/i18n'
import type { MemberRole } from '@/lib/authz'

export interface TeamRoleMember {
  id: string
  name: string
  role: MemberRole
  userId?: string | null
  email?: string | null
}

interface TeamRolesMatrixProps {
  locale: Locale
  currentCallerRole?: MemberRole
  members?: TeamRoleMember[]
}

// The 4 active operational roles in Idarty (excluding legacy/redundant generic 'staff')
const ACTIVE_ROLES: MemberRole[] = ['owner', 'admin', 'manager', 'receptionist']

interface RoleDefinition {
  role: MemberRole
  icon: typeof Shield
  colorBadge: string
  cardBorder: string
  activeGlow: string
  title: { ar: string; en: string }
  subtitle: { ar: string; en: string }
  targetPersona: { ar: string; en: string }
  canDo: { ar: string[]; en: string[] }
  cannotDo: { ar: string[]; en: string[] }
}

const ROLE_DEFINITIONS: Record<MemberRole, RoleDefinition> = {
  owner: {
    role: 'owner',
    icon: Crown,
    colorBadge: 'bg-purple-100 text-purple-700 border-purple-200',
    cardBorder: 'hover:border-purple-300',
    activeGlow: 'ring-2 ring-purple-500/20 border-purple-300 bg-purple-50/20',
    title: { ar: 'المالك', en: 'Workspace Owner' },
    subtitle: { ar: 'صاحب المنشأة والمسؤول المالي والقانوني الأول', en: 'Founder & Primary Legal / Financial Authority' },
    targetPersona: { ar: 'المؤسس أو المالك المسجل للنشاط التجاري', en: 'The founder or registered business owner' },
    canDo: {
      ar: [
        'كامل الصلاحيات والتحكم المطلق دون أي قيود على مساحة العمل',
        'إدارة الاشتراكات والفوترة والربط المالي',
        'ترقية وتعيين المشرفين والمديرين ونقل ملكية مساحة العمل أو حذفها',
        'الوصول الشامل لسجل التدقيق الأمني ونشاط جميع أفراد الفريق',
        'إدارة الخدمات وساعات العمل والعملاء والحجوزات وموقع الويب بالكامل',
      ],
      en: [
        'Full, unrestricted authority over workspace settings and operations',
        'Manage billing, subscriptions, and financial configurations',
        'Promote/demote admins & managers, transfer workspace ownership or delete it',
        'Full access to security audit logs and team activity history',
        'Complete control over services, schedules, customers, bookings, and public website',
      ],
    },
    cannotDo: {
      ar: ['لا توجد أي قيود برمجية أو إدارية على هذا الحساب'],
      en: ['No system or administrative restrictions apply to this role'],
    },
  },
  admin: {
    role: 'admin',
    icon: ShieldAlert,
    colorBadge: 'bg-amber-100 text-amber-800 border-amber-200',
    cardBorder: 'hover:border-amber-300',
    activeGlow: 'ring-2 ring-amber-500/20 border-amber-300 bg-amber-50/20',
    title: { ar: 'المشرف', en: 'Administrator' },
    subtitle: { ar: 'الإشراف والرقابة التشغيلية والتقنية الشاملة على المنصة', en: 'Operational supervision, site management, and team oversight' },
    targetPersona: { ar: 'الشريك التنفيذي، مدير العمليات، أو مسؤول النظام التقني', en: 'Managing partner, operations lead, or IT administrator' },
    canDo: {
      ar: [
        'إدارة وتخصيص موقع الويب التعريفي والصفحة العامة ونشر التحديثات',
        'إدارة الفريق: دعوة الأعضاء، تعديل أدوارهم ورتبهم، وأرشفة الحسابات',
        'الاطلاع الكامل على سجل النشاطات التشغيلية لجميع أعضاء الفريق',
        'إدارة كتالوج الخدمات، الأسعار، المدد، وسعة الحجز المتزامن',
        'ضبط ساعات العمل الأسبوعية، العطلات، والاستثناءات الزمنية',
        'إدارة كاملة لجميع الحجوزات، المواعيد، وبيانات العملاء',
      ],
      en: [
        'Manage and customize public booking website layout and publish updates',
        'Full team governance: invite members, adjust roles/ranks, and archive accounts',
        'Full visibility into workspace audit logs and team operations history',
        'Manage service catalog, pricing, durations, and concurrent booking capacity',
        'Configure weekly operating hours, holidays, and schedule overrides',
        'Full management of all client appointments, statuses, and customer records',
      ],
    },
    cannotDo: {
      ar: [
        'لا يمكنه حذف مساحة العمل أو نقل ملكيتها القانونية',
        'لا يمكنه تعديل صلاحيات المالك أو خفض رتبته',
        'لا يمكنه تغيير خطة الاشتراك والفوترة الأساسية',
      ],
      en: [
        'Cannot delete workspace or transfer legal ownership',
        'Cannot modify the Owner account or downgrade owner rank',
        'Cannot access master billing or subscription plan modifications',
      ],
    },
  },
  manager: {
    role: 'manager',
    icon: Briefcase,
    colorBadge: 'bg-blue-100 text-blue-800 border-blue-200',
    cardBorder: 'hover:border-blue-300',
    activeGlow: 'ring-2 ring-blue-500/20 border-blue-300 bg-blue-50/20',
    title: { ar: 'المدير', en: 'Branch Manager' },
    subtitle: { ar: 'إدارة العمليات اليومية للخدمات والمواعيد والتشغيل', en: 'Daily operational management of services, calendar, and bookings' },
    targetPersona: { ar: 'مدير الفرع، مشرف الصالة، أو منسق الخدمات', en: 'Branch manager, floor supervisor, or service coordinator' },
    canDo: {
      ar: [
        'إضافة وتحديث كتالوج الخدمات المعروضة ومددها وأسعارها',
        'تعديل ساعات العمل الأسبوعية للمنشأة وإضافة استثناءات العطلات',
        'ضبط سعة الحجز المتزامن لمساحة العمل',
        'دعوة موظفي استقبال ومديرين جدد إلى الفريق',
        'إدارة الحجوزات: إنشاء المواعيد، تأكيد الحضور، الإلغاء، وتسجيل الملاحظات',
        'استعراض سجل النشاطات التشغيلية لمتابعة حركة العمل',
      ],
      en: [
        'Add and update offered service catalog, durations, and pricing',
        'Configure weekly operational hours and holiday date overrides',
        'Adjust simultaneous workspace booking capacity',
        'Invite new receptionists and managers to the workspace',
        'Comprehensive booking management: scheduling, confirmations, cancellations, and client notes',
        'Review operational activity log to oversee daily workflow',
      ],
    },
    cannotDo: {
      ar: [
        'لا يمكنه تغيير أدوار أو رتب أعضاء الفريق أو ترقيتهم لمشرفين',
        'لا يمكنه أرشفة أو حذف أعضاء الفريق من مساحة العمل',
        'لا يمكنه تعديل إعدادات مساحة العمل الحساسة أو موقع الويب الأساسي',
      ],
      en: [
        'Cannot modify team roles, promote members to admin, or edit ranks',
        'Cannot archive or delete team members from the workspace',
        'Cannot modify core workspace identity settings or public website layout',
      ],
    },
  },
  receptionist: {
    role: 'receptionist',
    icon: CalendarCheck,
    colorBadge: 'bg-teal-50 text-brand-teal border-[#bfe8e4]',
    cardBorder: 'hover:border-brand-teal/40',
    activeGlow: 'ring-2 ring-brand-teal/20 border-brand-teal bg-[#f0faf9]/30',
    title: { ar: 'موظف استقبال', en: 'Front Desk / Receptionist' },
    subtitle: { ar: 'خدمة العملاء المباشرة وإدخال وتنظيم المواعيد والحجوزات', en: 'Direct customer service, booking desk, and appointment scheduling' },
    targetPersona: { ar: 'موظف الكاونتر، منسق الحجوزات، أو ممثل خدمة العملاء', en: 'Front-desk staff, appointment clerk, or customer service representative' },
    canDo: {
      ar: [
        'تسجيل الحجوزات الجديدة يدوياً للعملاء عبر الهاتف أو الكاونتر',
        'تأكيد وصول العملاء أو تسجيل حالات عدم الحضور (No-show)',
        'إلغاء المواعيد وتحديث أسباب الإلغاء والملاحظات الداخلية',
        'استعراض وتعديل سجلات العملاء وأرقام هواتفهم للتواصل المباشر',
        'الاطلاع على التقويم الأسبوعي والمواعيد القادمة في اليوم',
      ],
      en: [
        'Create manual walk-in or phone bookings during available hours',
        'Check-in arriving clients or mark no-show appointments',
        'Cancel bookings with mandatory cancellation reason and internal notes',
        'View and update customer contact records for appointment coordination',
        'Access weekly calendar overview and daily appointment schedules',
      ],
    },
    cannotDo: {
      ar: [
        'لا يمكنه إضافة أو حذف الخدمات أو تغيير الأسعار والمدد',
        'لا يمكنه تعديل ساعات عمل المنشأة أو العطلات والاستثناءات',
        'لا يمكنه دعوة أفراد جدد أو الاطلاع على سجل النشاطات الإدارية',
        'لا يمكنه الوصول لإعدادات الموقع أو مساحة العمل',
      ],
      en: [
        'Cannot add, remove, or edit service catalog items, prices, or durations',
        'Cannot adjust operating hours, holidays, or schedule overrides',
        'Cannot invite new team members or inspect administrative audit logs',
        'Cannot access workspace settings or website configuration',
      ],
    },
  },
  staff: {
    // Fallback mapping in case of legacy DB enum
    role: 'staff',
    icon: UserCheck,
    colorBadge: 'bg-slate-100 text-slate-700 border-slate-200',
    cardBorder: 'hover:border-slate-300',
    activeGlow: '',
    title: { ar: 'عضو فريق (سابق)', en: 'Staff Member (Legacy)' },
    subtitle: { ar: 'دور عام سابق مدمج ضمن موظف الاستقبال', en: 'Legacy generic role now merged into Receptionist' },
    targetPersona: { ar: 'يتم التعامل معه كموظف استقبال', en: 'Treated with receptionist operational privileges' },
    canDo: { ar: [], en: [] },
    cannotDo: { ar: [], en: [] },
  },
}

export function TeamRolesMatrix({
  locale,
  currentCallerRole = 'owner',
  members = [],
}: TeamRolesMatrixProps) {
  const rtl = locale === 'ar'

  // Map legacy 'staff' members to 'receptionist' for clean display
  const getMembersByRole = (role: MemberRole) => {
    return members.filter((m) => {
      const normalizedRole = m.role === 'staff' ? 'receptionist' : m.role
      return normalizedRole === role
    })
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-teal/10 text-brand-teal">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-[#172033] sm:text-lg">
                  {rtl ? 'صلاحيات ومسؤوليات الأدوار' : 'Roles & Permissions'}
                </h3>
                {currentCallerRole && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                    <UserCheck className="h-3 w-3 text-brand-teal" />
                    <span>
                      {rtl ? 'رتبتك الحالية:' : 'Your role:'}{' '}
                      <strong className="text-ink">
                        {ROLE_DEFINITIONS[currentCallerRole]?.title[locale] || currentCallerRole}
                      </strong>
                    </span>
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted max-w-2xl">
                {rtl
                  ? 'تم تصميم الأدوار لتمكين كل فرد في الفريق من مهامه اليومية بمرونة، مع تطبيق حماية مشددة على مستوى الخادم (Backend Server Actions) لمنع أي تجاوزات.'
                  : 'Roles are organized to empower team members in their daily workflows, strictly enforced on backend server actions to ensure data integrity.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Role Cards Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {ACTIVE_ROLES.map((role) => {
          const def = ROLE_DEFINITIONS[role]
          const RoleIcon = def.icon
          const assignedMembers = getMembersByRole(role)
          const isCaller = currentCallerRole === role

          return (
            <div
              key={role}
              className={`relative flex flex-col justify-between rounded-3xl border border-border bg-paper p-5 shadow-float transition-all sm:p-6 ${def.cardBorder} ${
                isCaller ? def.activeGlow : ''
              }`}
            >
              <div>
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3 border-b border-border/80 pb-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${def.colorBadge}`}
                    >
                      <RoleIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-bold text-[#172033]">
                          {def.title[locale]}
                        </h4>
                        {isCaller && (
                          <span className="rounded-full bg-brand-teal/10 px-2 py-0.5 text-[10px] font-bold text-brand-teal">
                            {rtl ? 'أنت' : 'You'}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs font-medium text-ink-muted">
                        {def.subtitle[locale]}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Persona Tagline */}
                <div className="mt-3.5 rounded-xl bg-surface/70 px-3 py-2 text-[11px] text-ink-muted">
                  <span className="font-semibold text-ink">
                    {rtl ? 'الفئة المستهدفة: ' : 'Target Persona: '}
                  </span>
                  {def.targetPersona[locale]}
                </div>

                {/* Assigned Members Chips */}
                <div className="mt-4 border-b border-border/60 pb-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-ink">
                    <span>{rtl ? 'يشغل هذا الدور حالياً' : 'Assigned Team Members'}</span>
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] text-ink-muted border border-border">
                      {assignedMembers.length === 0
                        ? rtl
                          ? 'لا يوجد'
                          : 'None'
                        : rtl
                          ? `${assignedMembers.length} عضو`
                          : `${assignedMembers.length} member${assignedMembers.length > 1 ? 's' : ''}`}
                    </span>
                  </div>

                  {assignedMembers.length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {assignedMembers.map((m) => {
                        const initial = (m.name || 'U').charAt(0).toUpperCase()
                        return (
                          <span
                            key={m.id}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-1 text-xs font-medium text-[#172033]"
                          >
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-teal/20 text-[9px] font-bold text-brand-teal">
                              {initial}
                            </span>
                            <span>{m.name}</span>
                          </span>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-ink-muted italic">
                      {rtl
                        ? 'لم يتم تعيين أي موظف بهذا الدور في مساحة عملك حتى الآن.'
                        : 'No staff currently assigned to this role in your workspace.'}
                    </p>
                  )}
                </div>

                {/* Capabilities (What they can do) */}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                    <Check className="h-3.5 w-3.5 stroke-[2.5] text-emerald-600" />
                    <span>{rtl ? 'ما يمكنه فعله (الصلاحيات التشغيلية)' : 'Operational Capabilities'}</span>
                  </div>
                  <ul className="space-y-1.5 ps-1 text-xs text-[#2d3748]">
                    {def.canDo[locale].map((point, idx) => (
                      <li key={idx} className="flex items-start gap-2 leading-relaxed">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Restrictions (Guardrails) */}
                <div className="mt-4 pt-3 border-t border-border/60 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                    <Lock className="h-3.5 w-3.5 text-amber-600" />
                    <span>{rtl ? 'القيود والحدود الإدارية' : 'Administrative Guardrails'}</span>
                  </div>
                  <ul className="space-y-1.5 ps-1 text-xs text-ink-muted">
                    {def.cannotDo[locale].map((point, idx) => (
                      <li key={idx} className="flex items-start gap-2 leading-relaxed">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Footer Assurance Tag */}
              <div className="mt-6 pt-3 border-t border-border/60 flex items-center justify-between text-[11px] text-ink-muted">
                <span className="inline-flex items-center gap-1">
                  <Shield className="h-3 w-3 text-brand-teal" />
                  <span>{rtl ? 'مفحوص برمجياً بالخادم' : 'Server enforced'}</span>
                </span>
                <span className="font-mono text-[10px] text-slate-400">role:{role}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Security Assurance Footer Card */}
      <div className="rounded-2xl border border-[#bfe8e4] bg-[#f0faf9]/60 p-4 text-xs text-ink">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 shrink-0 text-brand-teal mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-[#172033]">
              {rtl
                ? 'الحماية المشددة وسجل التدقيق (Backend Enforcement & Audit)'
                : 'Backend Security & Audit Trail'}
            </p>
            <p className="text-ink-muted leading-relaxed">
              {rtl
                ? 'في إدارتي، لا تعتمد الصلاحيات على إخفاء الأزرار في الواجهة فقط، بل يتم التحقق من كل إجراء (Server Action) بواسطة الدالة البرمجية `requirePermission` مع تسجيل أي محاولة غير مصرح بها تلقائياً في سجل التدقيق الأمني للرجوع إليها عند الحاجة.'
                : 'In Idarty, permissions are not just visual; every Server Action strictly validates identity via `requirePermission`, and any unauthorized attempts are logged into the tenant audit feed.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export const TeamRolesCards = TeamRolesMatrix
