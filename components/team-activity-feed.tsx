'use client'

import { useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Clock,
  Filter,
  ShieldAlert,
  User,
  Users,
} from 'lucide-react'
import type { Locale } from '@/lib/i18n'
import type { MemberRole } from '@/lib/authz'
import { PERMISSION_LABELS, type Permission } from '@/lib/permissions-client'

export interface ActivityFeedItem {
  id: number
  action: string
  entityType: string
  entityId: string | null
  metadata: Record<string, unknown>
  actorUserId: string | null
  actorName?: string | null
  actorRole?: MemberRole | null
  createdAt: Date | string
}

interface StaffFilterOption {
  id: string
  name: string
  role: MemberRole
  userId?: string | null
}

interface TeamActivityFeedProps {
  slug: string
  locale: Locale
  staffOptions: StaffFilterOption[]
  initialLogs: ActivityFeedItem[]
  currentActorFilter?: string
}

export function TeamActivityFeed({
  slug,
  locale,
  staffOptions,
  initialLogs,
  currentActorFilter = 'all',
}: TeamActivityFeedProps) {
  const rtl = locale === 'ar'
  const [selectedActor, setSelectedActor] = useState<string>(currentActorFilter)

  const roleLabels: Record<MemberRole, { ar: string; en: string }> = {
    owner: { ar: 'مالك', en: 'Owner' },
    admin: { ar: 'مشرف', en: 'Admin' },
    manager: { ar: 'مدير', en: 'Manager' },
    staff: { ar: 'عضو فريق', en: 'Staff' },
    receptionist: { ar: 'موظف استقبال', en: 'Receptionist' },
  }

  const roleBadges: Record<MemberRole, string> = {
    owner: 'bg-purple-50 text-purple-700 border-purple-200',
    admin: 'bg-amber-50 text-amber-700 border-amber-200',
    manager: 'bg-blue-50 text-blue-700 border-blue-200',
    staff: 'bg-[#f0faf9] text-brand-teal border-[#bfe8e4]',
    receptionist: 'bg-slate-100 text-slate-700 border-slate-200',
  }

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

  const filteredLogs = initialLogs.filter((log) => {
    if (selectedActor === 'all') return true
    return log.actorUserId === selectedActor
  })

  function handleFilterChange(userId: string) {
    setSelectedActor(userId)
    const url = new URL(window.location.href)
    if (userId === 'all') {
      url.searchParams.delete('actor')
    } else {
      url.searchParams.set('actor', userId)
    }
    window.history.replaceState({}, '', url.toString())
  }

  return (
    <div className="space-y-6">
      {/* Controls & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-teal/10 text-brand-teal">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#172033]">
              {rtl ? 'سجل العمليات الإدارية' : 'Audit Activity Trail'}
            </h3>
            <p className="mt-0.5 text-xs text-ink-muted">
              {rtl
                ? 'سجل زمني حي بجميع الإجراءات والتعديلات التي يقوم بها أعضاء الفريق.'
                : 'A live timeline of operations and modifications performed by workspace staff.'}
            </p>
          </div>
        </div>

        {/* Staff Filter Dropdown */}
        <div className="flex items-center gap-2">
          <label htmlFor="staff-filter-select" className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <Filter className="h-3.5 w-3.5" />
            <span>{rtl ? 'تصفية بالموظف:' : 'Filter by staff:'}</span>
          </label>
          <select
            id="staff-filter-select"
            value={selectedActor}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="rounded-xl border border-border bg-paper px-3 py-1.5 text-xs font-semibold text-[#172033] outline-none transition focus:border-brand-teal focus:ring-1 focus:ring-brand-teal"
          >
            <option value="all">{rtl ? 'جميع أعضاء الفريق' : 'All team members'}</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.userId ?? s.id} disabled={!s.userId}>
                {s.name} ({roleLabels[s.role]?.[locale] ?? s.role}) {!s.userId ? (rtl ? '- غير مفعّل' : '- Inactive') : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Timeline List */}
      <div className="rounded-3xl border border-border bg-paper p-5 sm:p-6 shadow-float">
        {filteredLogs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#dfe4ee] px-5 py-14 text-center text-sm text-ink-muted">
            <Clock className="mx-auto h-8 w-8 text-ink-muted/50 mb-2" />
            <p className="font-semibold text-[#172033]">
              {rtl ? 'لا توجد عمليات مسجلة في هذا النطاق' : 'No recorded activity found'}
            </p>
            <p className="mt-1 text-xs text-ink-muted max-w-sm mx-auto">
              {rtl
                ? 'أي حجوزات، أو إلغاءات، أو تعديلات يجريها أعضاء الفريق ستظهر هنا تلقائياً في السجل الرقابي.'
                : 'Manual bookings, cancellations, and status changes made by team members will be logged here.'}
            </p>
            {selectedActor !== 'all' && (
              <button
                type="button"
                onClick={() => handleFilterChange('all')}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-brand-teal hover:bg-paper transition"
              >
                {rtl ? 'إعادة التعيين وعرض الكل' : 'Reset filter and show all'}
              </button>
            )}
          </div>
        ) : (
          <div className="relative border-s-2 border-border ps-5 space-y-4 ms-3">
            {filteredLogs.map((log) => {
              const isAuthzEvent = log.action.startsWith('authz.')
              return (
                <div key={log.id} className="relative">
                  {/* Timeline dot */}
                  <div
                    className={`absolute -start-[27px] top-2 h-3.5 w-3.5 rounded-full border-2 border-paper ${
                      isAuthzEvent ? 'bg-amber-500 ring-2 ring-amber-100' : 'bg-brand-teal ring-2 ring-brand-teal/20'
                    }`}
                  />

                  {/* Event Card */}
                  <div
                    className={`rounded-2xl border p-4 transition ${
                      isAuthzEvent
                        ? 'border-amber-200 bg-amber-50/40 hover:border-amber-300'
                        : 'border-border bg-surface hover:border-[#ccd5e4]'
                    }`}
                  >
                    {/* Card Header: Action + Actor Info + Time */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-[#172033]">
                            {formatActionLabel(log.action)}
                          </span>

                          {isAuthzEvent && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                              <AlertTriangle className="h-3 w-3" />
                              <span>{rtl ? 'تم الرفض أمنياً' : 'Blocked'}</span>
                            </span>
                          )}

                          {/* Actor Badge */}
                          {log.actorName && (
                            <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                              <span>·</span>
                              <User className="h-3 w-3" />
                              <strong className="text-[#172033] font-medium">{log.actorName}</strong>
                              {log.actorRole && (
                                <span
                                  className={`rounded-full border px-2 py-0.2 text-[10px] font-semibold ${
                                    roleBadges[log.actorRole] ?? 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {roleLabels[log.actorRole]?.[locale] ?? log.actorRole}
                                </span>
                              )}
                            </span>
                          )}
                        </div>

                        {/* Metadata fields */}
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted">
                            {typeof log.metadata.requiredRole === 'string' && (
                              <span className="rounded-md bg-amber-100/70 px-2 py-0.5 text-amber-900 font-medium">
                                {rtl ? 'الدور المطلوب: ' : 'Required role: '}
                                <strong>
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
                              <span className="rounded-md bg-amber-100/70 px-2 py-0.5 text-amber-900 font-medium">
                                {rtl ? 'الصلاحية المطلوبة: ' : 'Required capability: '}
                                <strong>
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

                      {/* Time */}
                      <span className="shrink-0 text-xs text-ink-muted">
                        {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        }).format(new Date(log.createdAt))}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
