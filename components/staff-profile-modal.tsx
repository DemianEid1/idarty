'use client'

import { useState, useTransition, useEffect } from 'react'
import {
  Activity,
  CalendarCheck,
  Check,
  Clock,
  Mail,
  Phone,
  Shield,
  ShieldCheck,
  User,
  X,
} from 'lucide-react'
import type { Locale } from '@/lib/i18n'
import type { MemberRole } from '@/lib/authz'
import {
  ROLE_PERMISSIONS,
  PERMISSION_LABELS,
  type Permission,
} from '@/lib/permissions-client'
import {
  getStaffActivityHistory,
  type StaffActivityLogItem,
  type StaffProfileDetails,
} from '@/app/[locale]/tenants/[slug]/dashboard/activity-actions'

interface StaffProfileModalProps {
  slug: string
  locale: Locale
  staffId: string
  staffName: string
  role: MemberRole
  email?: string | null
  phone?: string | null
  statusText?: string
  canViewActivity: boolean
}

export function StaffProfileModal({
  slug,
  locale,
  staffId,
  staffName,
  role,
  email,
  phone,
  canViewActivity,
}: StaffProfileModalProps) {
  const rtl = locale === 'ar'
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'activity' | 'permissions'>('activity')
  const [loading, startTransition] = useTransition()
  const [details, setDetails] = useState<StaffProfileDetails | null>(null)
  const [logs, setLogs] = useState<StaffActivityLogItem[]>([])
  const [error, setError] = useState<string | null>(null)

  function loadData() {
    if (!canViewActivity) {
      setActiveTab('permissions')
      return
    }
    startTransition(async () => {
      try {
        setError(null)
        const res = await getStaffActivityHistory(slug, staffId)
        if (res.ok) {
          setDetails(res.profile)
          setLogs(res.logs)
        }
      } catch (err: any) {
        setError(err.message === 'FORBIDDEN' ? (rtl ? 'ليس لديك صلاحية لعرض سجل النشاط.' : 'You do not have permission to view activity logs.') : (rtl ? 'تعذر تحميل البيانات.' : 'Failed to load details.'))
      }
    })
  }

  function handleOpen() {
    setIsOpen(true)
    loadData()
  }

  function handleClose() {
    setIsOpen(false)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        handleClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen])

  const roleBadgeClasses: Record<MemberRole, string> = {
    owner: 'bg-purple-50 text-purple-700 border-purple-200',
    admin: 'bg-amber-50 text-amber-700 border-amber-200',
    manager: 'bg-blue-50 text-blue-700 border-blue-200',
    staff: 'bg-[#f0faf9] text-brand-teal border-[#bfe8e4]',
    receptionist: 'bg-slate-100 text-slate-700 border-slate-200',
  }

  const roleLabels: Record<MemberRole, { ar: string; en: string }> = {
    owner: { ar: 'مالك', en: 'Owner' },
    admin: { ar: 'مشرف', en: 'Admin' },
    manager: { ar: 'مدير', en: 'Manager' },
    staff: { ar: 'عضو فريق', en: 'Staff' },
    receptionist: { ar: 'موظف استقبال', en: 'Receptionist' },
  }

  const permissions = ROLE_PERMISSIONS[role] ?? []

  function formatActionLabel(action: string) {
    const map: Record<string, { ar: string; en: string }> = {
      'booking.created_manually': { ar: 'إنشاء حجز يدوي', en: 'Manual booking created' },
      'booking.cancelled': { ar: 'إلغاء حجز', en: 'Booking cancelled' },
      'booking.no_show': { ar: 'تسجيل عدم حضور', en: 'Marked as no-show' },
      'booking.confirmed': { ar: 'تأكيد حجز', en: 'Booking confirmed' },
      'booking.rescheduled': { ar: 'تعديل موعد حجز', en: 'Booking rescheduled' },
      'website.saved': { ar: 'حفظ تعديلات الموقع', en: 'Website draft saved' },
      'website.published': { ar: 'نشر الموقع للجمهور', en: 'Website published' },
      'service.deleted': { ar: 'حذف خدمة', en: 'Service removed' },
      'authz.permission_denied': { ar: 'محاولة وصول بصلاحية غير مصرحة', en: 'Permission denied' },
      'authz.tenant.insufficient_role': { ar: 'محاولة إجراء بصلاحية غير كافية', en: 'Insufficient role attempt' },
      'authz.tenant.unauthorized': { ar: 'محاولة وصول بدون عضوية نشطة', en: 'Unauthorized access attempt' },
    }
    return map[action]?.[locale] ?? action
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-paper px-3 py-1.5 text-xs font-semibold text-[#374151] transition hover:border-brand-teal hover:text-brand-teal"
        aria-label={rtl ? `عرض ملف ${staffName}` : `View profile for ${staffName}`}
      >
        <User className="h-3.5 w-3.5" />
        <span>{rtl ? 'عرض الملف والنشاط' : 'View Profile'}</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={rtl ? `ملف الموظف: ${staffName}` : `Staff Profile: ${staffName}`}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
        >
          {/* Backdrop */}
          <div
            onClick={handleClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in"
          />

          {/* Modal Panel */}
          <div
            className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl border border-border bg-paper shadow-2xl animate-in zoom-in-95 duration-200"
            dir={rtl ? 'rtl' : 'ltr'}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-border p-5 sm:p-6">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="text-xl font-bold tracking-tight text-[#172033] wrap-anywhere">
                    {staffName}
                  </h3>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${roleBadgeClasses[role]}`}
                  >
                    {roleLabels[role]?.[locale] ?? role}
                  </span>
                  {details?.status === 'active' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      ● {rtl ? 'مفعّل' : 'Active'}
                    </span>
                  )}
                  {details?.status === 'invited' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      ● {rtl ? 'دعوة معلقة' : 'Invited'}
                    </span>
                  )}
                  {details?.status === 'local' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                      ○ {rtl ? 'ملف محلي' : 'Local'}
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink-muted">
                  {(email || details?.email) && (
                    <span className="flex items-center gap-1.5 wrap-anywhere">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      {email || details?.email}
                    </span>
                  )}
                  {(phone || details?.phone) && (
                    <span className="flex items-center gap-1.5" dir="ltr">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      {phone || details?.phone}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="shrink-0 rounded-xl p-1.5 text-ink-muted hover:bg-surface hover:text-[#172033] transition"
                aria-label={rtl ? 'إغلاق' : 'Close'}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-border px-5 sm:px-6">
              {canViewActivity && (
                <button
                  type="button"
                  onClick={() => setActiveTab('activity')}
                  className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
                    activeTab === 'activity'
                      ? 'border-brand-teal text-brand-teal'
                      : 'border-transparent text-ink-muted hover:text-[#172033]'
                  }`}
                >
                  <Activity className="h-4 w-4" />
                  <span>{rtl ? 'سجل النشاطات' : 'Activity Log'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab('permissions')}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
                  activeTab === 'permissions'
                    ? 'border-brand-teal text-brand-teal'
                    : 'border-transparent text-ink-muted hover:text-[#172033]'
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                <span>{rtl ? 'الصلاحيات الممنوحة' : 'Permissions & Capabilities'}</span>
              </button>
            </div>

            {/* Tab Body */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
              {activeTab === 'activity' && (
                <div className="space-y-4">
                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700">
                      {error}
                    </div>
                  )}

                  {loading ? (
                    <div className="space-y-3 py-6">
                      <div className="h-4 w-1/3 animate-pulse rounded-md bg-surface" />
                      <div className="h-14 w-full animate-pulse rounded-2xl bg-surface" />
                      <div className="h-14 w-full animate-pulse rounded-2xl bg-surface" />
                    </div>
                  ) : logs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#dfe4ee] px-5 py-12 text-center text-sm text-ink-muted">
                      <Clock className="mx-auto h-8 w-8 text-ink-muted/50 mb-2" />
                      <p className="font-semibold text-[#172033]">
                        {rtl ? 'لا توجد عمليات مسجلة بعد' : 'No recorded activity yet'}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted max-w-sm mx-auto">
                        {rtl
                          ? 'أي حجوزات يدوية أو إلغاءات أو تعديلات يقوم بها هذا الموظف ستظهر هنا تلقائياً في السجل.'
                          : 'Manual bookings, cancellations, and status modifications made by this staff member will be logged here.'}
                      </p>
                    </div>
                  ) : (
                    <div className="relative border-s-2 border-border ps-5 space-y-4 ms-2">
                      {logs.map((log) => {
                        const isAuthzEvent = log.action.startsWith('authz.')
                        return (
                        <div key={log.id} className="relative">
                          {/* Timeline dot */}
                          <div
                            className={`absolute -start-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-paper ${
                              isAuthzEvent ? 'bg-amber-500' : 'bg-brand-teal'
                            }`}
                          />
                          <div
                            className={`rounded-2xl border p-3.5 transition ${
                              isAuthzEvent
                                ? 'border-amber-200 bg-amber-50/40 hover:border-amber-300'
                                : 'border-border bg-surface hover:border-[#ccd5e4]'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-[#172033]">
                                  {formatActionLabel(log.action)}
                                </span>
                                {isAuthzEvent && (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                    {rtl ? 'تم الرفض أمنياً' : 'Blocked'}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-ink-muted">
                                {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                }).format(new Date(log.createdAt))}
                              </span>
                            </div>
                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                              <div className="mt-2 text-xs text-ink-muted flex flex-wrap gap-x-4 gap-y-1">
                                {typeof log.metadata.requiredRole === 'string' && (
                                  <span>
                                    {rtl ? 'الدور المطلوب: ' : 'Required role: '}
                                    <strong className="text-amber-900 font-medium">
                                      {roleLabels[log.metadata.requiredRole as MemberRole]?.[locale] ?? log.metadata.requiredRole}
                                    </strong>
                                  </span>
                                )}
                                {typeof log.metadata.actualRole === 'string' && (
                                  <span>
                                    {rtl ? 'دور الموظف حينها: ' : 'Staff role: '}
                                    <strong className="text-[#172033] font-medium">
                                      {roleLabels[log.metadata.actualRole as MemberRole]?.[locale] ?? log.metadata.actualRole}
                                    </strong>
                                  </span>
                                )}
                                {typeof log.metadata.permission === 'string' && (
                                  <span>
                                    {rtl ? 'الصلاحية المطلوبة: ' : 'Required capability: '}
                                    <strong className="text-amber-900 font-medium">
                                      {PERMISSION_LABELS[log.metadata.permission as Permission]?.[locale]?.title ?? log.metadata.permission}
                                    </strong>
                                  </span>
                                )}
                                {typeof log.metadata.customerName === 'string' && (
                                  <span>
                                    {rtl ? 'العميل: ' : 'Customer: '}
                                    <strong className="text-[#172033] font-medium">
                                      {log.metadata.customerName}
                                    </strong>
                                  </span>
                                )}
                                {typeof log.metadata.reason === 'string' && (
                                  <span>
                                    {rtl ? 'السبب: ' : 'Reason: '}
                                    <strong className="text-[#172033] font-medium">
                                      {log.metadata.reason}
                                    </strong>
                                  </span>
                                )}
                                {typeof log.metadata.source === 'string' && (
                                  <span>
                                    {rtl ? 'المصدر: ' : 'Source: '}
                                    {log.metadata.source}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )})}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'permissions' && (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-surface p-4 border border-border">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-brand-teal shrink-0" />
                      <p className="text-xs font-semibold text-[#172033]">
                        {rtl
                          ? `صلاحيات دور "${roleLabels[role]?.[locale] ?? role}" المطبقة على الخادم`
                          : `Enforced backend permissions for role "${roleLabels[role]?.[locale] ?? role}"`}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      {rtl
                        ? 'تُفحص هذه الصلاحيات بشكل صارم في إجراءات الخادم (Server Actions) لضمان أمان البيانات.'
                        : 'These capabilities are strictly enforced in backend Server Actions to maintain workspace security.'}
                    </p>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {permissions.map((p) => {
                      const meta = PERMISSION_LABELS[p]?.[locale]
                      return (
                        <div
                          key={p}
                          className="flex items-start gap-2.5 rounded-2xl border border-border bg-paper p-3 transition hover:border-[#ccd5e4]"
                        >
                          <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-teal/10 text-brand-teal">
                            <Check className="h-3 w-3" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-[#172033]">
                              {meta?.title ?? p}
                            </p>
                            <p className="mt-0.5 text-[11px] text-ink-muted">
                              {meta?.desc ?? ''}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end border-t border-border p-4 bg-surface/50 rounded-b-3xl">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl border border-border bg-paper px-4 py-2 text-xs font-semibold text-[#374151] hover:border-brand-teal hover:text-brand-teal transition"
              >
                {rtl ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
