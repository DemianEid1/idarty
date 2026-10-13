'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { ServiceForm } from '@/components/service-form'
import { ServiceImageForm } from '@/components/service-image-form'
import { SECTION_CONTENT_FIELDS } from '@/lib/website-config'
import type { ImageCrop } from '@/lib/image-crop'
import type { Locale } from '@/lib/i18n'

/**
 * The Website Builder's Services area — the ONE place a tenant manages services.
 *
 * RESPONSIBILITIES
 * ----------------
 *  A. The Services section's own text (heading + description, per locale).
 *  B. The service list with prices, plus Add service.
 *  C. Each service's image (upload / crop / replace / remove).
 *
 * WHY IT LOOKS LIKE THIS
 * ----------------------
 * The screenshot this was built to match shows the Services area as: the section
 * heading, then the section's text fields, then the service list. The
 * visibility/order sub-block that used to sit between them is deliberately GONE
 * — that concern belongs to "إدارة الأقسام / Section Management", which keeps
 * its original interface and still lists every section, services included.
 *
 * Section ordering and visibility therefore remain exactly where the tenant has
 * always found them, and this area no longer duplicates those controls.
 *
 * IMAGES
 * ------
 * Service images were previously managed from the Dashboard's Services tab. They
 * live here now, next to the service they belong to, reusing the SAME cropper,
 * validation, server actions and authorization — there is no second upload path.
 *
 * Adding a service reuses the shared `ServiceForm` → existing `createService`
 * action, so validation, authorization and tenant isolation are not duplicated.
 */

type ServiceRow = {
  id: string
  name: string | null
  durationMin: number
  priceAmount: string
  image?: string | null
  imageCrop?: ImageCrop | null
}

export function ServicesSection({
  locale,
  slug,
  content,
  services,
  onUpdateContent,
  onResetContent,
  sectionId,
}: {
  locale: Locale
  slug: string
  /** The `services` section's stored content, or undefined when absent. */
  content: { ar?: Record<string, string>; en?: Record<string, string> } | null
  services: ServiceRow[]
  onUpdateContent: (sectionId: string, locale: 'ar' | 'en', field: string, value: string) => void
  onResetContent: (sectionId: string) => void
  sectionId: string
}) {
  const rtl = locale === 'ar'
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)

  const handleCreated = useCallback(() => {
    // Refresh the server-rendered list so the new service appears with its real
    // persisted values.
    router.refresh()
  }, [router])

  const fields = SECTION_CONTENT_FIELDS.services
  const contentAr = content?.ar ?? {}
  const contentEn = content?.en ?? {}
  const hasContent = fields.some(
    (f) => (contentAr[f.key] ?? '') !== '' || (contentEn[f.key] ?? '') !== ''
  )

  const FIELD_LABELS: Record<string, { ar: string; en: string }> = {
    heading: { ar: 'عنوان القسم', en: 'Section heading' },
    description: { ar: 'وصف القسم', en: 'Section description' },
  }

  return (
    <div className="rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6">
      {/* Heading */}
      <h2 className="text-lg font-semibold">{rtl ? 'الخدمات' : 'Services'}</h2>
      <p className="mt-1 text-sm text-ink-muted">
        {rtl
          ? 'نص قسم الخدمات، وقائمة خدماتك مع أسعارها وصورها.'
          : 'Your Services section text, and the service list with prices and images.'}
      </p>

      {/* A. Section text */}
      <div className="mt-6 rounded-2xl border border-[#edf0f4] bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">{rtl ? 'نص القسم' : 'Section text'}</p>
          {hasContent && (
            <button
              type="button"
              onClick={() => onResetContent(sectionId)}
              className="rounded-lg border border-[#e1e5ed] bg-paper px-3 py-1.5 text-xs font-semibold text-[#516078] transition hover:bg-surface"
              title={rtl ? 'إعادة تعيين النص إلى الافتراضي' : 'Reset the text to its default'}
            >
              {rtl ? 'إعادة تعيين' : 'Reset'}
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          {rtl
            ? 'اترك الحقل فارغاً لاستخدام النص الافتراضي.'
            : 'Leave a field empty to use the default text.'}
        </p>

        <div className="mt-4 space-y-4">
          {fields.map((field) => {
            const meta = FIELD_LABELS[field.key] ?? { ar: field.key, en: field.key }
            return (
              <div key={field.key} className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-[#647087]">
                    {meta[locale]} ({rtl ? 'عربي' : 'Arabic'})
                  </span>
                  {field.multiline ? (
                    <textarea
                      value={contentAr[field.key] ?? ''}
                      onChange={(e) => onUpdateContent(sectionId, 'ar', field.key, e.target.value)}
                      maxLength={field.maxLength}
                      rows={3}
                      dir="rtl"
                      className="mt-2 w-full rounded-xl border border-[#e1e5ed] bg-paper px-4 py-3 text-sm outline-none focus:border-brand-teal"
                    />
                  ) : (
                    <input
                      type="text"
                      value={contentAr[field.key] ?? ''}
                      onChange={(e) => onUpdateContent(sectionId, 'ar', field.key, e.target.value)}
                      maxLength={field.maxLength}
                      dir="rtl"
                      className="mt-2 h-11 w-full rounded-xl border border-[#e1e5ed] bg-paper px-4 text-sm outline-none focus:border-brand-teal"
                    />
                  )}
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-[#647087]">
                    {meta[locale]} ({rtl ? 'إنجليزي' : 'English'})
                  </span>
                  {field.multiline ? (
                    <textarea
                      value={contentEn[field.key] ?? ''}
                      onChange={(e) => onUpdateContent(sectionId, 'en', field.key, e.target.value)}
                      maxLength={field.maxLength}
                      rows={3}
                      dir="ltr"
                      className="mt-2 w-full rounded-xl border border-[#e1e5ed] bg-paper px-4 py-3 text-sm outline-none focus:border-brand-teal"
                    />
                  ) : (
                    <input
                      type="text"
                      value={contentEn[field.key] ?? ''}
                      onChange={(e) => onUpdateContent(sectionId, 'en', field.key, e.target.value)}
                      maxLength={field.maxLength}
                      dir="ltr"
                      className="mt-2 h-11 w-full rounded-xl border border-[#e1e5ed] bg-paper px-4 text-sm outline-none focus:border-brand-teal"
                    />
                  )}
                </label>
              </div>
            )
          })}
        </div>
      </div>

      {/* B + C. The service list, each row carrying its own image controls */}
      <div className="mt-4 rounded-2xl border border-[#edf0f4] bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{rtl ? 'خدماتك' : 'Your services'}</p>
            <p className="mt-1 text-xs text-ink-muted">
              {rtl
                ? 'قائمة الخدمات المتاحة مع الأسعار. أضف صورة لأي خدمة.'
                : 'Your services with prices. Add an image to any service.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-[#f0faf9] px-3 py-1 text-xs font-semibold text-brand-teal">
              {services.length}
            </span>
            <button
              type="button"
              onClick={() => setShowForm((open) => !open)}
              aria-expanded={showForm}
              aria-controls="services-section-form"
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-teal px-4 py-2 text-sm font-semibold text-white outline-none transition hover:bg-[#0d6560] focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
            >
              {showForm ? (
                <X aria-hidden="true" className="h-4 w-4 shrink-0" />
              ) : (
                <Plus aria-hidden="true" className="h-4 w-4 shrink-0" />
              )}
              {rtl ? 'إضافة خدمة' : 'Add service'}
            </button>
          </div>
        </div>

        {/* The existing, shared creation form — no duplicated business logic. */}
        {showForm && (
          <div id="services-section-form" className="mt-4 rounded-2xl border border-[#e1e5ed] bg-paper p-4">
            <ServiceForm locale={locale} slug={slug} onSuccess={handleCreated} />
          </div>
        )}

        <div className="mt-4 space-y-2">
          {services.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#dfe4ee] px-5 py-10 text-center text-sm text-ink-muted">
              {rtl ? 'لا توجد خدمات بعد. أضف خدمتك الأولى.' : 'No services yet. Add your first service.'}
            </div>
          ) : (
            services.map((service) => (
              <div key={service.id} className="rounded-2xl bg-paper px-4 py-3">
                <p className="font-semibold wrap-anywhere">
                  {service.name ?? (rtl ? 'خدمة بدون ترجمة' : 'Untitled service')}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {service.durationMin} {rtl ? 'دقيقة' : 'min'} · {service.priceAmount}
                </p>
                {/* Image management for THIS service — the same control the
                    Dashboard used, so there is one upload implementation. */}
                <ServiceImageForm
                  locale={locale}
                  slug={slug}
                  serviceId={service.id}
                  currentImage={service.image}
                  currentCrop={service.imageCrop}
                />
              </div>
            ))
          )}
        </div>

        <p className="mt-4 text-[11px] text-ink-lighter">
          {rtl
            ? 'الخدمات وصورها بيانات تشغيلية وتُحفظ فوراً. لا يتم نشر الموقع حتى تضغط «نشر».'
            : 'Services and their images are operational data and save immediately. Your website is not published until you click Publish.'}
        </p>
      </div>
    </div>
  )
}
