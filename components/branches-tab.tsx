'use client'

import { useState, useTransition } from 'react'
import {
  Building2,
  Clock,
  Edit2,
  Mail,
  MapPin,
  Phone,
  Plus,
  ShieldAlert,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import type { Locale } from '@/lib/i18n'
import { useToast } from '@/components/toast'
import {
  archiveBranch,
  createBranch,
  setDefaultBranch,
  updateBranch,
} from '@/app/[locale]/tenants/[slug]/dashboard/branch-actions'

export type BranchData = {
  id: string
  slug: string
  name: string
  fallbackName?: string | null
  address?: string | null
  description?: string | null
  phone?: string | null
  email?: string | null
  bookingCapacity: number
  isDefault: boolean
  isActive: boolean
  staffCount: number
  todayBookingsCount: number
}

type Props = {
  locale: Locale
  slug: string
  branches: BranchData[]
  canManage: boolean
  canArchive: boolean
}

export function BranchesTab({
  locale,
  slug,
  branches,
  canManage,
  canArchive,
}: Props) {
  const rtl = locale === 'ar'
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<BranchData | null>(null)
  const [archivingBranch, setArchivingBranch] = useState<BranchData | null>(null)

  const handleSetDefault = (branchId: string) => {
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.append('slug', slug)
        formData.append('locale', locale)
        formData.append('branchId', branchId)
        await setDefaultBranch(formData)
        toast('success', rtl ? 'تم تعيين الفرع كفرع افتراضي' : 'Default branch updated')
      } catch (err: any) {
        toast('error', err.message || (rtl ? 'حدث خطأ' : 'Failed to set default branch'))
      }
    })
  }

  const handleArchive = (branch: BranchData) => {
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.append('slug', slug)
        formData.append('locale', locale)
        formData.append('branchId', branch.id)
        const res = await archiveBranch(formData)
        if (res.ok) {
          toast('success', rtl ? 'تمت أرشفة الفرع بنجاح' : 'Branch archived successfully')
          setArchivingBranch(null)
        } else {
          toast('error', res.message || (rtl ? 'تعذر أرشفة الفرع' : 'Could not archive branch'))
        }
      } catch (err: any) {
        toast('error', err.message || (rtl ? 'حدث خطأ' : 'Error archiving branch'))
      }
    })
  }

  return (
    <div className="mt-9 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Tab Header Card */}
      <div className="rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f0faf9] text-brand-teal">
                <Building2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="text-lg font-semibold text-[#172033]">
                {rtl ? 'إدارة الفروع' : 'Branch Management'}
              </h2>
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {rtl
                ? 'إدارة فروع ومواقع منشأتك، تحديد السعة الاستيعابية، وتخصيص ساعات العمل لكل فرع.'
                : 'Manage your business locations, operational capacity, and dedicated working hours.'}
            </p>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-teal px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#0d6560] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal cursor-pointer"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{rtl ? 'إضافة فرع جديد' : 'Add New Branch'}</span>
            </button>
          )}
        </div>

        {/* Branch Cards Grid */}
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {branches.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-[#dfe4ee] px-5 py-12 text-center text-sm text-ink-muted">
              {rtl ? 'لا توجد فروع مسجلة حتى الآن.' : 'No branches created yet.'}
            </div>
          ) : (
            branches.map((b) => {
              const displayName = b.name || b.fallbackName || (rtl ? 'فرع بدون اسم' : 'Unnamed branch')
              return (
                <div
                  key={b.id}
                  className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 shadow-xs transition hover:border-brand-teal/40 hover:bg-paper"
                >
                  <div>
                    {/* Header: Name + Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-[#172033] truncate">{displayName}</h3>
                          {b.isDefault && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
                              <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                              {rtl ? 'الافتراضي' : 'Default'}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-ink-muted">/{b.slug}</p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          b.isActive ? 'bg-[#eaf8f1] text-[#24865b]' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {b.isActive ? (rtl ? 'نشط' : 'Active') : (rtl ? 'مغلق مؤقتاً' : 'Inactive')}
                      </span>
                    </div>

                    {/* Meta Details */}
                    <div className="mt-4 space-y-2 text-xs text-ink-muted">
                      {b.address && (
                        <div className="flex items-center gap-2 text-[#374151]">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-teal" />
                          <span className="truncate">{b.address}</span>
                        </div>
                      )}
                      {b.phone && (
                        <div className="flex items-center gap-2" dir="ltr">
                          <Phone className="h-3.5 w-3.5 shrink-0 text-brand-teal" />
                          <span>{b.phone}</span>
                        </div>
                      )}
                      {b.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 shrink-0 text-brand-teal" />
                          <span className="truncate">{b.email}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-1 font-medium text-[#172033]">
                        <Users className="h-3.5 w-3.5 shrink-0 text-brand-teal" />
                        <span>
                          {rtl
                            ? `الطاقة الاستيعابية: ${b.bookingCapacity} مواعيد متزامنة`
                            : `Capacity: ${b.bookingCapacity} concurrent clients`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                    <a
                      href={`?tab=schedule&branch=${b.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-xs font-medium text-brand-teal hover:bg-[#f0faf9] transition"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      <span>{rtl ? 'ساعات العمل' : 'Schedule'}</span>
                    </a>

                    <div className="flex items-center gap-1">
                      {canManage && !b.isDefault && (
                        <button
                          type="button"
                          onClick={() => handleSetDefault(b.id)}
                          disabled={pending}
                          title={rtl ? 'تعيين كفرع افتراضي' : 'Set as default'}
                          className="rounded-lg p-1.5 text-ink-muted hover:bg-surface hover:text-amber-600 transition cursor-pointer"
                        >
                          <Star className="h-4 w-4" />
                        </button>
                      )}

                      {canManage && (
                        <button
                          type="button"
                          onClick={() => setEditingBranch(b)}
                          disabled={pending}
                          title={rtl ? 'تعديل الفرع' : 'Edit branch'}
                          className="rounded-lg p-1.5 text-ink-muted hover:bg-surface hover:text-brand-teal transition cursor-pointer"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      )}

                      {canArchive && !b.isDefault && (
                        <button
                          type="button"
                          onClick={() => setArchivingBranch(b)}
                          disabled={pending}
                          title={rtl ? 'أرشفة الفرع' : 'Archive branch'}
                          className="rounded-lg p-1.5 text-ink-muted hover:bg-red-50 hover:text-red-600 transition cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── CREATE BRANCH MODAL ────────────────────────────────────── */}
      {createModalOpen && (
        <BranchModal
          mode="create"
          locale={locale}
          slug={slug}
          rtl={rtl}
          onClose={() => setCreateModalOpen(false)}
        />
      )}

      {/* ── EDIT BRANCH MODAL ──────────────────────────────────────── */}
      {editingBranch && (
        <BranchModal
          mode="edit"
          branch={editingBranch}
          locale={locale}
          slug={slug}
          rtl={rtl}
          onClose={() => setEditingBranch(null)}
        />
      )}

      {/* ── ARCHIVE CONFIRMATION MODAL ─────────────────────────────── */}
      {archivingBranch && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
          dir={rtl ? 'rtl' : 'ltr'}
        >
          <div className="relative w-full max-w-md rounded-3xl border border-border bg-paper p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <h3 className="text-base font-semibold text-[#172033]">
                {rtl ? 'تأكيد أرشفة الفرع' : 'Confirm Branch Archival'}
              </h3>
            </div>

            <p className="mt-3 text-xs leading-5 text-ink-muted">
              {rtl
                ? `هل أنت متأكد من أرشفة فرع "${archivingBranch.name}"؟ لن يتمكن العملاء من حجز مواعيد جديدة في هذا الفرع.`
                : `Are you sure you want to archive "${archivingBranch.name}"? Customers will no longer be able to book appointments at this location.`}
            </p>

            <div className="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setArchivingBranch(null)}
                disabled={pending}
                className="rounded-xl border border-border bg-paper px-4 py-2 text-xs font-semibold text-ink-muted hover:bg-surface transition"
              >
                {rtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => handleArchive(archivingBranch)}
                disabled={pending}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-red-700 disabled:opacity-50 cursor-pointer"
              >
                {pending ? (rtl ? 'جارٍ الأرشفة...' : 'Archiving...') : (rtl ? 'أرشفة الفرع' : 'Archive Branch')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BranchModal({
  mode,
  branch,
  locale,
  slug,
  rtl,
  onClose,
}: {
  mode: 'create' | 'edit'
  branch?: BranchData
  locale: Locale
  slug: string
  rtl: boolean
  onClose: () => void
}) {
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const isCreate = mode === 'create'

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        if (isCreate) {
          const res = await createBranch(form)
          if (res.ok) {
            toast('success', rtl ? 'تمت إضافة الفرع بنجاح' : 'Branch created successfully')
            onClose()
          }
        } else if (branch) {
          form.append('branchId', branch.id)
          const res = await updateBranch(form)
          if (res.ok) {
            toast('success', rtl ? 'تم تحديث بيانات الفرع' : 'Branch updated successfully')
            onClose()
          }
        }
      } catch (err: any) {
        toast('error', err.message || (rtl ? 'حدث خطأ' : 'An error occurred'))
      }
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
      dir={rtl ? 'rtl' : 'ltr'}
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose()
      }}
    >
      <div className="relative w-full max-w-lg rounded-3xl border border-border bg-paper p-6 shadow-2xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f0faf9] text-brand-teal">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-[#172033]">
                {isCreate ? (rtl ? 'إضافة فرع جديد' : 'Add New Branch') : (rtl ? 'تعديل بيانات الفرع' : 'Edit Branch')}
              </h3>
              <p className="mt-0.5 text-xs text-ink-muted">
                {rtl
                  ? 'أدخل البيانات الأساسية وموقع وسعة الفرع.'
                  : 'Enter location info, contact details, and concurrent capacity.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg p-1 text-ink-muted hover:bg-surface hover:text-[#172033] transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="slug" value={slug} />

          <div className="space-y-3 rounded-2xl bg-surface p-4 border border-border">
            <h4 className="font-semibold text-[#172033]">{rtl ? 'البيانات الأساسية' : 'Branch Details'}</h4>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <label className="font-medium text-[#374151]">
                  {rtl ? 'اسم الفرع *' : 'Branch Name *'}
                </label>
                <input
                  required
                  name="name"
                  defaultValue={branch?.name ?? ''}
                  placeholder={rtl ? 'مثال: فرع المعادي' : 'e.g. Maadi Branch'}
                  className="w-full rounded-xl border border-border bg-paper px-3 py-2 text-xs outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal"
                />
              </div>

              {isCreate && (
                <div className="space-y-1 sm:col-span-2">
                  <label className="font-medium text-[#374151]">
                    {rtl ? 'معرف الرابط (Slug اختياري)' : 'URL Slug (Optional)'}
                  </label>
                  <input
                    name="branchSlug"
                    placeholder="maadi"
                    dir="ltr"
                    className="w-full rounded-xl border border-border bg-paper px-3 py-2 text-xs outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal text-left"
                  />
                </div>
              )}

              <div className="space-y-1 sm:col-span-2">
                <label className="font-medium text-[#374151]">
                  {rtl ? 'العنوان الفعلي' : 'Street Address'}
                </label>
                <input
                  name="address"
                  defaultValue={branch?.address ?? ''}
                  placeholder={rtl ? 'شارع النصر، المعادي، القاهرة' : 'Victory Street, Maadi, Cairo'}
                  className="w-full rounded-xl border border-border bg-paper px-3 py-2 text-xs outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-[#374151]">
                  {rtl ? 'رقم الهاتف' : 'Phone'}
                </label>
                <input
                  name="phone"
                  type="tel"
                  dir="ltr"
                  defaultValue={branch?.phone ?? ''}
                  placeholder="+2010..."
                  className="w-full rounded-xl border border-border bg-paper px-3 py-2 text-xs outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal text-left"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-[#374151]">
                  {rtl ? 'البريد الإلكتروني' : 'Email'}
                </label>
                <input
                  name="email"
                  type="email"
                  dir="ltr"
                  defaultValue={branch?.email ?? ''}
                  placeholder="branch@example.com"
                  className="w-full rounded-xl border border-border bg-paper px-3 py-2 text-xs outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal text-left"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl bg-surface p-4 border border-border">
            <h4 className="font-semibold text-[#172033]">{rtl ? 'الطاقة الاستيعابية والإعدادات' : 'Capacity & Settings'}</h4>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <label className="font-medium text-[#374151]">
                  {rtl ? 'عدد الحجوزات المتزامنة (الكراسي / الأسرّة) *' : 'Concurrent Booking Capacity *'}
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  required
                  name="bookingCapacity"
                  defaultValue={branch?.bookingCapacity ?? 1}
                  className="w-full rounded-xl border border-border bg-paper px-3 py-2 text-xs outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal"
                />
                <p className="text-[11px] text-ink-muted">
                  {rtl
                    ? 'الحد الأقصى لعدد العملاء الذين يمكن خدمتهم في نفس الوقت في هذا الفرع.'
                    : 'Maximum simultaneous clients this branch can serve at the same time.'}
                </p>
              </div>

              <div className="flex items-center gap-2 sm:col-span-2 pt-1">
                <input
                  type="checkbox"
                  id="isDefault"
                  name="isDefault"
                  defaultChecked={branch?.isDefault ?? false}
                  className="h-4 w-4 rounded-md border-border text-brand-teal focus:ring-brand-teal"
                />
                <label htmlFor="isDefault" className="font-medium text-[#172033] cursor-pointer">
                  {rtl ? 'تعيين كفرع افتراضي للمنشأة' : 'Set as primary default branch'}
                </label>
              </div>

              {!isCreate && (
                <div className="flex items-center gap-2 sm:col-span-2 pt-1">
                  <input
                    type="checkbox"
                    id="isActive"
                    name="isActive"
                    value="true"
                    defaultChecked={branch?.isActive ?? true}
                    className="h-4 w-4 rounded-md border-border text-brand-teal focus:ring-brand-teal"
                  />
                  <label htmlFor="isActive" className="font-medium text-[#172033] cursor-pointer">
                    {rtl ? 'الفرع نشط ويستقبل حجوزات' : 'Branch is active and taking bookings'}
                  </label>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              disabled={pending}
              onClick={onClose}
              className="rounded-xl border border-border bg-paper px-4 py-2 text-xs font-semibold text-ink-muted hover:bg-surface transition"
            >
              {rtl ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-brand-teal px-5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#0d6560] disabled:opacity-50 cursor-pointer"
            >
              {pending
                ? (rtl ? 'جارٍ الحفظ...' : 'Saving...')
                : isCreate
                ? (rtl ? 'إضافة الفرع' : 'Create Branch')
                : (rtl ? 'حفظ التعديلات' : 'Save Changes')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

