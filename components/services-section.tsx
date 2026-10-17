'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { ServiceForm } from '@/components/service-form'
import { ServiceImageForm } from '@/components/service-image-form'
import type { ImageCrop } from '@/lib/image-crop'
import type { Locale } from '@/lib/i18n'

/**
 * The Website Builder's Services management panel (خدماتك).
 *
 * RESPONSIBILITIES
 * ----------------
 *  A. The service list with prices and durations, plus Add service.
 *  B. Each service's image (upload / crop / replace / remove).
 *
 * WHAT IS *NOT* HERE
 * ------------------
 * The Services SECTION's own text (heading + description, per locale) is edited
 * in the Website Builder's "محتوى الأقسام / Section Content" accordion, which
 * lists every renderable section including services. It is deliberately not
 * repeated here — one editor per field.
 *
 * Visibility and ordering are likewise NOT here: they belong to
 * "إدارة الأقسام / Section Management", which lists every section.
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
  services,
}: {
  locale: Locale
  slug: string
  services: ServiceRow[]
}) {
  const rtl = locale === 'ar'
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)

  const handleCreated = useCallback(() => {
    // Refresh the server-rendered list so the new service appears with its real
    // persisted values.
    router.refresh()
  }, [router])

  return (
    <div className="space-y-4">
      {/* The service list, each row carrying its own image controls */}
      <div className="rounded-2xl border border-[#edf0f4] bg-surface p-4">
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
