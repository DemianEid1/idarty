'use client'

import { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { saveDraft } from '@/lib/publish-actions'
import { publishChanges, discardDraft } from '@/lib/publish-actions'
import {
  isRenderableSectionType,
  SECTION_CONTENT_FIELDS,
  createDefaultWebsiteConfig,
  addSection,
  removeSection,
  moveSection as moveSectionInConfig,
  hasSectionType,
  ADDABLE_SECTION_TYPES,
  type WebsiteConfig,
} from '@/lib/website-config'
import { useToast } from '@/components/toast'
import { THEME_PRESETS, applyPreset, detectPreset } from '@/lib/theme-presets'
import type { Locale } from '@/lib/i18n'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Service = { id: string; name: string | null; durationMin: number; priceAmount: string }

type Props = {
  locale: Locale
  slug: string
  initialConfig: WebsiteConfig | null
  publishedConfig: WebsiteConfig | null
  tenant: {
    name: string
    tagline: string | null
    description: string | null
    address: string | null
    phoneE164: string | null
    email: string | null
    currency: string
    theme: Record<string, string>
  }
  services: Service[]
  canPublish: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function configsEqual(a: WebsiteConfig | null, b: WebsiteConfig | null): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return JSON.stringify(normalizeConfig(a)) === JSON.stringify(normalizeConfig(b))
}

function normalizeConfig(config: WebsiteConfig): unknown {
  return {
    theme: config.theme,
    sections: config.sections
      .map((s) => ({
        id: s.id,
        type: s.type,
        variant: s.variant,
        isVisible: s.isVisible,
        sortOrder: s.sortOrder,
        content: s.content,
        dataSource: s.dataSource,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }
}

// ---------------------------------------------------------------------------
// Section metadata
// ---------------------------------------------------------------------------

const SECTION_LABELS: Record<string, { ar: string; en: string; description: { ar: string; en: string } }> = {
  hero: {
    ar: 'البطل',
    en: 'Hero',
    description: { ar: 'القسم الرئيسي مع العنوان والوصف وزر الحجز', en: 'Main section with headline, description, and booking CTA' },
  },
  services: {
    ar: 'الخدمات',
    en: 'Services',
    description: { ar: 'قائمة الخدمات المتاحة مع الأسعار', en: 'List of available services with prices' },
  },
  team: {
    ar: 'الفريق',
    en: 'Team',
    description: { ar: 'أعضاء الفريق وتخصصاتهم', en: 'Team members and their specialties' },
  },
  about: {
    ar: 'من نحن',
    en: 'About',
    description: { ar: 'معلومات عن الشركة وقصتها', en: 'About the business and its story' },
  },
  contact: {
    ar: 'اتصل بنا',
    en: 'Contact',
    description: { ar: 'معلومات الاتصال وروابط التواصل', en: 'Contact information and social links' },
  },
}

// Human-readable labels for the editable content fields defined in
// SECTION_CONTENT_FIELDS (lib/website-config.ts). Keys must match that map.
const CONTENT_FIELD_LABELS: Record<string, { ar: string; en: string }> = {
  headline: { ar: 'العنوان الرئيسي', en: 'Headline' },
  tagline: { ar: 'الشريط العلوي', en: 'Tagline' },
  subtitle: { ar: 'الوصف', en: 'Description' },
  ctaLabel: { ar: 'نص زر الحجز', en: 'Booking button text' },
  heading: { ar: 'عنوان القسم', en: 'Section heading' },
  description: { ar: 'وصف القسم', en: 'Section description' },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WebsiteEditor({
  locale,
  slug,
  initialConfig,
  publishedConfig,
  tenant,
  services,
  canPublish,
}: Props) {
  const rtl = locale === 'ar'
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()

  // Draft state
  const [config, setConfig] = useState<WebsiteConfig>(() => {
    if (initialConfig) return initialConfig
    return {
      ...createDefaultWebsiteConfig(),
      theme: { ...tenant.theme },
    }
  })

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [publishStatus, setPublishStatus] = useState<'idle' | 'publishing' | 'published' | 'error'>('idle')
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  // Determine if there are saved unpublished changes
  const hasUnpublishedChanges = !configsEqual(config, publishedConfig)

  // Track changes
  const markChanged = useCallback(() => {
    setHasUnsavedChanges(true)
    setSaveStatus('idle')
  }, [])

  // Theme handlers
  const updateTheme = useCallback(
    (field: string, value: string) => {
      setConfig((prev) => ({
        ...prev,
        theme: { ...prev.theme, [field]: value || undefined },
      }))
      markChanged()
    },
    [markChanged]
  )

  // Preset selection — presentation-only, DRAFT only. Never publishes.
  // applyPreset preserves logo, section content, visibility and ordering.
  const selectedPresetId = detectPreset(config)
  const handleSelectPreset = useCallback(
    (presetId: string) => {
      setConfig((prev) => applyPreset(prev, presetId))
      markChanged()
    },
    [markChanged]
  )

  // Section handlers
  const toggleSectionVisibility = useCallback(
    (sectionId: string) => {
      setConfig((prev) => ({
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === sectionId ? { ...s, isVisible: !s.isVisible } : s
        ),
      }))
      markChanged()
    },
    [markChanged]
  )

  const moveSection = useCallback(
    (sectionId: string, direction: 'up' | 'down') => {
      setConfig((prev) => moveSectionInConfig(prev, sectionId, direction))
      markChanged()
    },
    [markChanged]
  )

  // Add a supported section. No-op for unsupported types or an existing type
  // (the schema does not model duplicate section instances).
  const handleAddSection = useCallback(
    (type: string) => {
      setConfig((prev) => addSection(prev, type))
      markChanged()
    },
    [markChanged]
  )

  // Remove a section from the website configuration only. Never touches services,
  // staff, customers, bookings, or hours.
  const handleRemoveSection = useCallback(
    (sectionId: string) => {
      setConfig((prev) => removeSection(prev, sectionId))
      markChanged()
    },
    [markChanged]
  )

  const updateSectionContent = useCallback(
    (sectionId: string, locale: 'ar' | 'en', field: string, value: string) => {
      setConfig((prev) => ({
        ...prev,
        sections: prev.sections.map((s) => {
          if (s.id !== sectionId) return s
          const currentContent = s.content?.[locale] ?? {}
          return {
            ...s,
            content: {
              ...s.content,
              [locale]: { ...currentContent, [field]: value },
            },
          }
        }),
      }))
      markChanged()
    },
    [markChanged]
  )

  // Reset a single section's editable content to its defaults, leaving the
  // section's visibility, order, and every other section untouched.
  const resetSectionContent = useCallback(
    (sectionId: string) => {
      setConfig((prev) => ({
        ...prev,
        sections: prev.sections.map((s) =>
          s.id === sectionId ? { ...s, content: { ar: {}, en: {} } } : s
        ),
      }))
      markChanged()
    },
    [markChanged]
  )

  // Save draft
  const handleSaveDraft = useCallback(() => {
    setSaveStatus('saving')
    startTransition(async () => {
      try {
        const result = await saveDraft({ slug, locale, config })
        if (result.ok) {
          setSaveStatus('saved')
          setHasUnsavedChanges(false)
          toast('success', rtl ? 'تم حفظ المسودة بنجاح' : 'Draft saved successfully')
          router.refresh()
        } else {
          setSaveStatus('error')
          toast('error', rtl ? 'تعذر حفظ المسودة' : 'Failed to save draft')
        }
      } catch {
        setSaveStatus('error')
        toast('error', rtl ? 'تعذر حفظ المسودة' : 'Failed to save draft')
      }
    })
  }, [slug, locale, config, rtl, toast, startTransition])

  // Publish — sends the current editor state directly to the server
  const handlePublish = useCallback(() => {
    setShowPublishConfirm(false)
    setPublishStatus('publishing')
    startTransition(async () => {
      try {
        const result = await publishChanges({ slug, locale, config })
        if (result.ok) {
          setPublishStatus('published')
          setHasUnsavedChanges(false)
          setSaveStatus('idle')
          toast('success', rtl ? 'تم نشر التغييرات بنجاح' : 'Changes published successfully')
          router.refresh()
        } else {
          setPublishStatus('error')
          toast('error', rtl ? 'تعذر النشر' : 'Failed to publish')
        }
      } catch {
        setPublishStatus('error')
        toast('error', rtl ? 'تعذر النشر' : 'Failed to publish')
      }
    })
  }, [slug, locale, config, rtl, toast, router, startTransition])

  // Discard
  const handleDiscard = useCallback(() => {
    setShowDiscardConfirm(false)
    startTransition(async () => {
      try {
        const result = await discardDraft({ slug, locale })
        if (result.ok) {
          // Sync editor state to the configuration the server actually reset the
          // draft to. Prefer the server-returned config over the (possibly
          // stale) server-rendered props.
          if (result.config) {
            setConfig(result.config)
          } else if (publishedConfig) {
            setConfig(publishedConfig)
          } else {
            setConfig({ ...createDefaultWebsiteConfig(), theme: { ...tenant.theme } })
          }
          setHasUnsavedChanges(false)
          setSaveStatus('idle')
          toast('success', rtl ? 'تم تجاهل التغييرات' : 'Changes discarded')
          router.refresh()
        } else {
          toast('error', rtl ? 'تعذر تجاهل التغييرات' : 'Failed to discard changes')
        }
      } catch {
        toast('error', rtl ? 'تعذر تجاهل التغييرات' : 'Failed to discard changes')
      }
    })
  }, [slug, locale, publishedConfig, tenant.theme, rtl, toast, router, startTransition])

  // Preview
  const handlePreview = useCallback(() => {
    if (hasUnsavedChanges) {
      if (window.confirm(rtl ? 'لديك تغييرات غير محفوظة. المعاينة ستعرض آخر مسودة محفوظة. هل تريد المتابعة؟' : 'You have unsaved changes. Preview will show the last saved draft. Continue?')) {
        router.push(`/${locale}/tenants/${slug}/preview`)
      }
    } else {
      router.push(`/${locale}/tenants/${slug}/preview`)
    }
  }, [hasUnsavedChanges, locale, slug, rtl, router])

  // Live website
  const handleLiveWebsite = useCallback(() => {
    window.open(`/${locale}/tenants/${slug}`, '_blank')
  }, [locale, slug])

  // Sections that actually have a renderer. Sections of other types may exist
  // in a persisted config but cannot be toggled or reordered to any effect, so
  // they are not shown as editable controls.
  const editableSections = config.sections.filter((s) => isRenderableSectionType(s.type))

  // Check if all renderable sections are hidden
  const allHidden = editableSections.length > 0 && editableSections.every((s) => !s.isVisible)
  // No renderable sections at all (e.g. every section removed).
  const noSections = editableSections.length === 0

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-paper p-4">
        <div className="flex items-center gap-3">
          {hasUnsavedChanges && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
              {rtl ? 'تغييرات غير محفوظة' : 'Unsaved changes'}
            </span>
          )}
          {!hasUnsavedChanges && hasUnpublishedChanges && (
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
              {rtl ? 'مسودة محفوظة غير منشورة' : 'Saved unpublished draft'}
            </span>
          )}
          {!hasUnsavedChanges && !hasUnpublishedChanges && (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              {rtl ? 'محدث' : 'Up to date'}
            </span>
          )}
          {saveStatus === 'saved' && !hasUnsavedChanges && (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              {rtl ? 'تم حفظ المسودة' : 'Draft saved'}
            </span>
          )}
          {publishStatus === 'published' && (
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
              {rtl ? 'تم النشر' : 'Published'}
            </span>
          )}
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={handleLiveWebsite}
            className="rounded-xl border border-border bg-paper px-4 py-2 text-center text-sm font-semibold text-ink-muted transition hover:border-brand-teal hover:text-brand-teal"
          >
            {rtl ? 'الموقع المباشر' : 'Live website'}
          </button>
          <button
            type="button"
            onClick={handlePreview}
            className="rounded-xl border border-border bg-paper px-4 py-2 text-center text-sm font-semibold text-ink-muted transition hover:border-brand-teal hover:text-brand-teal"
          >
            {rtl ? 'معاينة المسودة' : 'Preview draft'}
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={pending || !hasUnsavedChanges}
            className="rounded-xl bg-brand-teal px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-[#0d6560] disabled:opacity-50"
          >
            {saveStatus === 'saving' ? (rtl ? 'جارٍ الحفظ...' : 'Saving...') : (rtl ? 'حفظ المسودة' : 'Save draft')}
          </button>
          {canPublish && (
            <button
              type="button"
              onClick={() => setShowDiscardConfirm(true)}
              disabled={pending || !hasUnpublishedChanges}
              className="rounded-xl border border-border bg-paper px-4 py-2 text-center text-sm font-semibold text-ink-muted transition hover:border-red-400 hover:text-red-600 disabled:opacity-50"
              title={rtl ? 'إعادة المسودة إلى آخر إصدار منشور' : 'Reset draft to the last published version'}
            >
              {rtl ? 'تجاهل' : 'Discard'}
            </button>
          )}
          {canPublish && (
            <button
              type="button"
              onClick={() => setShowPublishConfirm(true)}
              disabled={pending || (!hasUnsavedChanges && !hasUnpublishedChanges)}
              className="rounded-xl bg-[#0F766E] px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-[#0d6560] disabled:opacity-50"
              title={rtl ? 'نشر التغييرات الحالية' : 'Publish current changes'}
            >
              {publishStatus === 'publishing' ? (rtl ? 'جارٍ النشر...' : 'Publishing...') : (rtl ? 'نشر' : 'Publish')}
            </button>
          )}
        </div>
      </div>

      {/* All hidden warning */}
      {allHidden && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {rtl
            ? 'جميع الأقسام مخفية. لن يظهر أي محتوى في الموقع العام. قم بإظهار قسم واحد على الأقل.'
            : 'All sections are hidden. No content will appear on the public website. Enable at least one section.'}
        </div>
      )}

      {/* No sections at all */}
      {noSections && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {rtl
            ? 'لا توجد أقسام. أضف قسماً واحداً على الأقل ليظهر موقعك.'
            : 'There are no sections. Add at least one section for your website to show anything.'}
        </div>
      )}

      {/* Website Identity */}
      <div className="rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6">
        <h2 className="text-lg font-semibold">{rtl ? 'هوية الموقع' : 'Website Identity'}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {rtl ? 'تخصيص الألوان والشعار والمحتوى الرئيسي للموقع.' : 'Customize colors, logo, and main website content.'}
        </p>

        <div className="mt-6 space-y-6">
          {/* Theme presets — presentation-only bundles applied to the draft. */}
          <div>
            <span className="mb-2 block text-xs font-semibold text-[#647087]">
              {rtl ? 'قالب التصميم' : 'Theme preset'}
            </span>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {THEME_PRESETS.map((preset) => {
                const isSelected = selectedPresetId === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id)}
                    aria-pressed={isSelected}
                    className={`flex flex-col gap-2 rounded-2xl border p-3 text-start outline-none transition focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 ${
                      isSelected
                        ? 'border-brand-teal bg-surface shadow-sm'
                        : 'border-[#e1e5ed] bg-paper hover:border-brand-teal/60 hover:bg-surface'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{preset.name[locale]}</span>
                      {isSelected && (
                        <span className="rounded-full bg-brand-teal px-2 py-0.5 text-[10px] font-bold text-white">
                          {rtl ? 'محدد' : 'Selected'}
                        </span>
                      )}
                    </span>
                    {/* Honest swatches: the exact colors the preset sets —
                        primary (buttons/links) and the global background.
                        (accentColor duplicates backgroundColor by design.) */}
                    <span className="flex items-center gap-1.5" aria-hidden="true">
                      <span
                        className="h-6 w-6 rounded-full border border-black/5"
                        style={{ backgroundColor: preset.theme.primaryColor }}
                      />
                      <span
                        className="h-6 w-6 rounded-full border border-black/5"
                        style={{ backgroundColor: preset.theme.backgroundColor }}
                      />
                    </span>
                    <span className="text-xs text-ink-muted">{preset.description[locale]}</span>
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-ink-lighter">
              {rtl
                ? 'اختيار القالب يغيّر الألوان فقط ولا يحذف المحتوى أو الشعار. لا يتم النشر حتى تضغط «نشر».'
                : 'Choosing a preset only changes colors — your content and logo are kept. Nothing is published until you click Publish.'}
            </p>
          </div>

          {/* Colors */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-[#647087]">{rtl ? 'اللون الأساسي' : 'Primary color'}</span>
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-[#e1e5ed] bg-paper px-3 py-2">
                <input
                  type="color"
                  value={config.theme.primaryColor ?? '#0F766E'}
                  onChange={(e) => updateTheme('primaryColor', e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                />
                <span className="font-mono text-sm text-[#374151]">{config.theme.primaryColor ?? '#0F766E'}</span>
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-[#647087]">
                {rtl ? 'لون خلفية الموقع' : 'Website background color'}
              </span>
              <span className="mt-0.5 block text-[11px] text-ink-lighter">
                {rtl ? 'يظهر كخلفية الصفحة الرئيسية للموقع.' : 'Shown as the main background of your website.'}
              </span>
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-[#e1e5ed] bg-paper px-3 py-2">
                <input
                  type="color"
                  value={config.theme.backgroundColor ?? config.theme.accentColor ?? '#FBFCFE'}
                  onChange={(e) => updateTheme('backgroundColor', e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                />
                <span className="font-mono text-sm text-[#374151]">
                  {config.theme.backgroundColor ?? config.theme.accentColor ?? '#FBFCFE'}
                </span>
              </div>
            </label>
          </div>

          {/* Logo */}
          <div>
            <span className="mb-2 block text-xs font-semibold text-[#647087]">{rtl ? 'الشعار' : 'Logo'}</span>
            <div className="flex items-center gap-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#e1e5ed] bg-surface">
                {config.theme.logo ? (
                  <img src={config.theme.logo} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs text-ink-lighter">id</span>
                )}
              </div>
              <div>
                <label className="cursor-pointer rounded-lg border border-[#e1e5ed] bg-paper px-3 py-1.5 text-xs font-semibold text-[#516078] transition hover:bg-surface">
                  {rtl ? 'تغيير الشعار' : 'Change logo'}
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = (event) => {
                        if (typeof event.target?.result === 'string') {
                          updateTheme('logo', event.target.result)
                        }
                      }
                      reader.readAsDataURL(file)
                    }}
                  />
                </label>
                {config.theme.logo && (
                  <button
                    type="button"
                    onClick={() => updateTheme('logo', '')}
                    className="ms-2 text-xs text-red-600 hover:underline"
                  >
                    {rtl ? 'إزالة' : 'Remove'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section Content — driven by SECTION_CONTENT_FIELDS so the editor and
          renderer always agree on which fields are editable. */}
      <div className="rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6">
        <h2 className="text-lg font-semibold">{rtl ? 'محتوى الأقسام' : 'Section Content'}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {rtl
            ? 'عدّل النصوص الظاهرة في كل قسم. اترك الحقل فارغاً لاستخدام النص الافتراضي.'
            : 'Edit the text shown in each section. Leave a field empty to use the default text.'}
        </p>

        <div className="mt-6 space-y-8">
          {editableSections
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((section) => {
              const fields = isRenderableSectionType(section.type)
                ? SECTION_CONTENT_FIELDS[section.type]
                : []
              if (fields.length === 0) return null

              const sectionLabel = SECTION_LABELS[section.type]
              const contentAr = section.content?.ar ?? {}
              const contentEn = section.content?.en ?? {}
              const hasContent = fields.some(
                (f) => (contentAr[f.key] ?? '') !== '' || (contentEn[f.key] ?? '') !== ''
              )

              return (
                <div key={section.id} className="rounded-2xl border border-[#edf0f4] bg-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">
                        {sectionLabel ? sectionLabel[locale] : section.type}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {sectionLabel ? sectionLabel.description[locale] : ''}
                      </p>
                    </div>
                    {hasContent && (
                      <button
                        type="button"
                        onClick={() => resetSectionContent(section.id)}
                        className="rounded-lg border border-[#e1e5ed] bg-paper px-3 py-1.5 text-xs font-semibold text-[#516078] transition hover:bg-surface"
                        title={rtl ? 'إعادة تعيين محتوى هذا القسم فقط' : 'Reset this section’s content only'}
                      >
                        {rtl ? 'إعادة تعيين' : 'Reset'}
                      </button>
                    )}
                  </div>

                  <div className="mt-4 space-y-4">
                    {fields.map((field) => {
                      const meta = CONTENT_FIELD_LABELS[field.key] ?? {
                        ar: field.key,
                        en: field.key,
                      }
                      const placeholder =
                        section.type === 'hero' && field.key === 'headline'
                          ? tenant.name
                          : section.type === 'hero' && field.key === 'subtitle'
                            ? (tenant.description ?? '')
                            : ''

                      return (
                        <div key={field.key} className="grid gap-4 sm:grid-cols-2">
                          <label className="block">
                            <span className="text-xs font-semibold text-[#647087]">
                              {meta[locale]} ({rtl ? 'عربي' : 'Arabic'})
                            </span>
                            {field.multiline ? (
                              <textarea
                                value={contentAr[field.key] ?? ''}
                                onChange={(e) =>
                                  updateSectionContent(section.id, 'ar', field.key, e.target.value)
                                }
                                placeholder={placeholder}
                                maxLength={field.maxLength}
                                rows={3}
                                className="mt-2 w-full rounded-xl border border-[#e1e5ed] bg-paper px-4 py-3 text-sm outline-none focus:border-brand-teal"
                                dir="rtl"
                              />
                            ) : (
                              <input
                                type="text"
                                value={contentAr[field.key] ?? ''}
                                onChange={(e) =>
                                  updateSectionContent(section.id, 'ar', field.key, e.target.value)
                                }
                                placeholder={placeholder}
                                maxLength={field.maxLength}
                                className="mt-2 h-11 w-full rounded-xl border border-[#e1e5ed] bg-paper px-4 text-sm outline-none focus:border-brand-teal"
                                dir="rtl"
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
                                onChange={(e) =>
                                  updateSectionContent(section.id, 'en', field.key, e.target.value)
                                }
                                placeholder={placeholder}
                                maxLength={field.maxLength}
                                rows={3}
                                className="mt-2 w-full rounded-xl border border-[#e1e5ed] bg-paper px-4 py-3 text-sm outline-none focus:border-brand-teal"
                                dir="ltr"
                              />
                            ) : (
                              <input
                                type="text"
                                value={contentEn[field.key] ?? ''}
                                onChange={(e) =>
                                  updateSectionContent(section.id, 'en', field.key, e.target.value)
                                }
                                placeholder={placeholder}
                                maxLength={field.maxLength}
                                className="mt-2 h-11 w-full rounded-xl border border-[#e1e5ed] bg-paper px-4 text-sm outline-none focus:border-brand-teal"
                                dir="ltr"
                              />
                            )}
                          </label>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {/* Section Management */}
      <div className="rounded-3xl border border-border bg-paper p-5 shadow-float sm:p-6">
        <h2 className="text-lg font-semibold">{rtl ? 'إدارة الأقسام' : 'Section Management'}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {rtl ? 'التحكم في ظهور الأقسام وترتيبها في الموقع.' : 'Control which sections appear and their order on the website.'}
        </p>

        <div className="mt-6 space-y-3">
          {editableSections
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((section, index, sorted) => {
              const label = SECTION_LABELS[section.type] ?? { ar: section.type, en: section.type, description: { ar: '', en: '' } }
              return (
                <div
                  key={section.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 transition ${
                    section.isVisible ? 'border-[#edf0f4] bg-surface' : 'border-[#e1e5ed] bg-gray-50 opacity-60'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => moveSection(section.id, 'up')}
                        disabled={index === 0}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"
                        aria-label={rtl ? 'تحريك لأعلى' : 'Move up'}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSection(section.id, 'down')}
                        disabled={index === sorted.length - 1}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"
                        aria-label={rtl ? 'تحريك لأسفل' : 'Move down'}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold wrap-anywhere">{label[locale]}</p>
                      <p className="text-xs text-ink-muted wrap-anywhere">{label.description[locale]}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      section.isVisible ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {section.isVisible ? (rtl ? 'ظاهر' : 'Visible') : (rtl ? 'مخفي' : 'Hidden')}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleSectionVisibility(section.id)}
                      className={`relative h-6 w-11 rounded-full transition ${
                        section.isVisible ? 'bg-brand-teal' : 'bg-gray-300'
                      }`}
                      role="switch"
                      aria-checked={section.isVisible}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                          section.isVisible ? 'start-0.5' : 'end-0.5'
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveSection(section.id)}
                      className="rounded-lg border border-[#e1e5ed] bg-paper px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50"
                      title={rtl ? 'إزالة القسم من الموقع' : 'Remove this section from the website'}
                    >
                      {rtl ? 'إزالة' : 'Remove'}
                    </button>
                  </div>
                </div>
              )
            })}
        </div>

        {/* Add a supported section. Only renderable types are offered, and a type
            that is already present is disabled so duplicates cannot be created. */}
        <div className="mt-6 border-t border-[#edf0f4] pt-5">
          <p className="text-xs font-semibold text-[#647087]">{rtl ? 'إضافة قسم' : 'Add a section'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ADDABLE_SECTION_TYPES.map((type) => {
              const already = hasSectionType(config, type)
              const label = SECTION_LABELS[type] ?? { ar: type, en: type, description: { ar: '', en: '' } }
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleAddSection(type)}
                  disabled={already}
                  className="rounded-xl border border-[#e1e5ed] bg-paper px-4 py-2 text-sm font-semibold text-[#516078] transition hover:border-brand-teal hover:text-brand-teal disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#e1e5ed] disabled:hover:text-[#516078]"
                  title={already ? (rtl ? 'هذا القسم مضاف بالفعل' : 'This section is already added') : undefined}
                >
                  + {label[locale]}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Publish confirmation modal */}
      {showPublishConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" dir={rtl ? 'rtl' : 'ltr'}>
            <h3 className="text-lg font-semibold">{rtl ? 'تأكيد النشر' : 'Confirm Publish'}</h3>
            <p className="mt-2 text-sm text-ink-muted">
              {rtl
                ? 'سيتم نشر التغييرات الحالية إلى الموقع العام. هل أنت متأكد؟'
                : 'This will publish your current changes to the public website. Are you sure?'}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPublishConfirm(false)}
                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-ink-muted hover:bg-surface"
              >
                {rtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={pending}
                className="rounded-xl bg-[#0F766E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d6560] disabled:opacity-50"
              >
                {publishStatus === 'publishing' ? (rtl ? 'جارٍ النشر...' : 'Publishing...') : (rtl ? 'نشر' : 'Publish')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discard confirmation modal */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" dir={rtl ? 'rtl' : 'ltr'}>
            <h3 className="text-lg font-semibold">{rtl ? 'تأكيد التجاهل' : 'Confirm Discard'}</h3>
            <p className="mt-2 text-sm text-ink-muted">
              {rtl
                ? 'سيتم إعادة تعيين المسودة إلى آخر إصدار منشور. هل أنت متأكد؟'
                : 'This will reset the draft to the last published version. Are you sure?'}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-ink-muted hover:bg-surface"
              >
                {rtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleDiscard}
                disabled={pending}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {rtl ? 'تجاهل' : 'Discard'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
