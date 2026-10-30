'use client'

import { useState, useTransition, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { saveDraft } from '@/lib/publish-actions'
import { publishChanges, discardDraft } from '@/lib/publish-actions'
import { publicTenantUrl } from '@/lib/routes'
import {
  isRenderableSectionType,
  SECTION_CONTENT_FIELDS,
  createDefaultWebsiteConfig,
  removeSection,
  moveSection as moveSectionInConfig,
  type WebsiteConfig,
} from '@/lib/website-config'
import { useToast } from '@/components/toast'
import {
  BriefcaseBusiness,
  Check,
  Contact,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  LayoutGrid,
  MousePointerClick,
  Palette,
  Share2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { THEME_PRESETS, applyPreset, detectPreset } from '@/lib/theme-presets'
import { MAX_HERO_IMAGE_SIZE, SUPPORTED_IMAGE_MIME_TYPES } from '@/lib/image-validation'
import { ImageCropper } from '@/components/image-cropper'
import { ServicesSection } from '@/components/services-section'
import { AccordionSection } from '@/components/accordion-section'
import { ImageUploadZone } from '@/components/image-upload-zone'
import { CROP_ASPECTS, resolveCrop, type ImageCrop } from '@/lib/image-crop'
import { focalPointToCss } from '@/lib/image-focal-point'
import {
  CONTACT_PRACTICAL_LIMITS,
  CTA_ACTIONS,
  CTA_WARNINGS,
  CONTACT_EMPTY_WARNING,
  PHONE_FORMAT_HINT,
  PHONE_INVALID_HINT,
  URL_INVALID_HINT,
  VALIDATION_MESSAGES,
  SOCIAL_PLATFORMS,
  createDefaultContact,
  createDefaultSocial,
  createDefaultCta,
  createDefaultMobileStickyCta,
  hasVisibleContactData,
  isHttpUrl,
  toTelHref,
  toWhatsAppHref,
  toMailto,
  resolveCtaTarget,
  resolveCtaLabel,
  type ValidationIssue,
  type CtaAction,
} from '@/lib/contact-social'
import type { Locale } from '@/lib/i18n'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Service = {
  id: string
  name: string | null
  durationMin: number
  priceAmount: string
  /**
   * Service images are managed in the Website Builder's Services area. The
   * editor itself does not render them, but the prop is typed here so the shape
   * the dashboard passes is explicit and a missing field is a compile error.
   */
  image?: string | null
  imageCrop?: ImageCrop | null
}

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
    // Every new top-level field must be included. Omitting one would make
    // configsEqual report a permanent difference for that field's edits, so
    // `hasUnpublishedChanges` would never settle back to false.
    contact: config.contact,
    social: config.social,
    cta: config.cta,
    mobileStickyCta: config.mobileStickyCta,
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

/**
 * One contact/social field: a text input, a visibility toggle, an optional
 * persistent hint, an optional advisory warning, and an optional server-issued
 * validation error. Advisory warnings never block saving; server errors are
 * shown only after a rejected write, and the input keeps its value.
 */
function ContactFieldRow({
  rtl,
  label,
  hint,
  warning,
  issue,
  value,
  isVisible,
  maxLength,
  locale,
  onValue,
  onToggle,
}: {
  rtl: boolean
  label: string
  hint?: string
  warning?: string
  issue?: ValidationIssue
  value: string
  isVisible: boolean
  maxLength: number
  locale: 'ar' | 'en'
  onValue: (v: string) => void
  onToggle: () => void
}) {
  const overAdvisory = value.length > maxLength
  return (
    <div className="rounded-2xl border border-[#edf0f4] bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold">{label}</span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-ink-muted">
            {isVisible ? (rtl ? 'ظاهر' : 'Visible') : (rtl ? 'مخفي' : 'Hidden')}
          </span>
          <button
            type="button"
            onClick={onToggle}
            role="switch"
            aria-checked={isVisible}
            aria-label={label}
            className={`relative h-6 w-11 rounded-full transition ${isVisible ? 'bg-brand-teal' : 'bg-gray-300'}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                isVisible ? 'start-0.5' : 'end-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      <input
        type="text"
        value={value}
        onChange={(e) => onValue(e.target.value)}
        maxLength={maxLength}
        dir="ltr"
        className="mt-3 h-11 w-full rounded-xl border border-[#e1e5ed] bg-paper px-4 text-sm outline-none focus:border-brand-teal"
      />

      {hint && <p className="mt-1.5 text-[11px] text-ink-lighter">{hint}</p>}
      {warning && <p className="mt-1.5 text-[11px] text-amber-700">{warning}</p>}
      {overAdvisory && (
        <p className="mt-1.5 text-[11px] text-amber-700">
          {locale === 'ar'
            ? 'الحقل أطول من المعتاد. قد لا يظهر بشكل جيد على الموقع.'
            : 'This field is longer than usual and may not display well.'}
        </p>
      )}
      {issue && (
        <p className="mt-1.5 text-[11px] font-semibold text-red-600">
          {VALIDATION_MESSAGES[issue.code][locale]}
        </p>
      )}
    </div>
  )
}

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
  /**
   * Field-level validation issues returned by the server. Set on a failed save
   * or publish and cleared on the next attempt. The editor's `config` state is
   * deliberately NEVER replaced on failure, so the tenant's text stays on screen
   * for correction.
   */
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([])
  const [generalError, setGeneralError] = useState<string | null>(null)

  const issueFor = useCallback(
    (field: string) => validationIssues.find((i) => i.field === field),
    [validationIssues]
  )

  // Determine if there are saved unpublished changes
  const hasUnpublishedChanges = !configsEqual(config, publishedConfig)

  // Hero image opacity as a percentage for the control. Absent => 100%.
  const heroOpacity =
    typeof config.theme.heroImageOpacity === 'number' ? config.theme.heroImageOpacity : 1

  // Cropper visibility. Only one cropper can be open at a time.
  const [showHeroCropper, setShowHeroCropper] = useState(false)
  const hasHeroCrop = resolveCrop(config.theme.heroImageCrop) !== null

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

  // Hero crop — DRAFT only, exactly like the image itself. The cropper writes
  // here on confirm; Cancel simply never calls it, so the previous crop (and the
  // previous image) are untouched.
  const setHeroCrop = useCallback(
    (next: ImageCrop) => {
      setConfig((prev) => ({
        ...prev,
        theme: { ...prev.theme, heroImageCrop: next },
      }))
      markChanged()
    },
    [markChanged]
  )

  // Hero image opacity (0–1). Applies to the image LAYER only.
  const setHeroOpacity = useCallback(
    (next: number) => {
      setConfig((prev) => ({
        ...prev,
        theme: { ...prev.theme, heroImageOpacity: next },
      }))
      markChanged()
    },
    [markChanged]
  )

  // Hero image upload — reads the file as a data URL and updates the draft theme.
  // The image is stored as a base64 data URL in the draft config. It is NOT
  // published until the user explicitly clicks Publish.
  //
  // The size/type limits come from lib/image-validation.ts, the SAME module the
  // server-side Zod schema uses, so the client check can never drift from what
  // the server will accept.
  const handleHeroImageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      // Client-side validation: only the explicitly supported raster formats.
      if (!(SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
        toast('error', rtl ? 'نوع الصورة غير مدعوم. يُسمح بـ JPEG و PNG و WebP فقط.' : 'Unsupported image type. Only JPEG, PNG, and WebP are allowed.')
        e.target.value = ''
        return
      }
      // Client-side size check, mirroring the server-side bound.
      if (file.size > MAX_HERO_IMAGE_SIZE) {
        toast('error', rtl ? 'حجم الصورة كبير جداً. الحد الأقصى 2 ميجابايت.' : 'Image is too large. Maximum size is 2MB.')
        e.target.value = ''
        return
      }
      const reader = new FileReader()
      reader.onload = (event) => {
        if (typeof event.target?.result === 'string') {
          updateTheme('heroImage', event.target.result)
        }
      }
      reader.readAsDataURL(file)
      // Reset the input so the same file can be selected again
      e.target.value = ''
    },
    [rtl, toast, updateTheme]
  )

  // --- Collapsible section state (LOCAL only) ---
  // Collapsing never discards inputs and never triggers Save/Publish/Discard.
  // Initial states keep the editor from being overwhelmingly long on first
  // open while still surfacing the two areas most tenants edit first.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    identity: true,
    content: false,
    // Services is a frequent, operational task, so it starts open.
    services: true,
    contact: true,
    cta: false,
    social: false,
    sections: false,
  })

  const toggleAccordion = useCallback((key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  // Show the general error banner (and point at the offending section) when the
  // last failed write carried field-level issues, so a problem inside a
  // collapsed section is never silently hidden.
  const errorSection = validationIssues.length > 0 && !generalError
    ? (validationIssues[0].field.startsWith('contact.')
        ? 'contact'
        : validationIssues[0].field.startsWith('social.')
          ? 'social'
          : validationIssues[0].field.startsWith('cta.')
            ? 'cta'
            : null)
    : null
  useEffect(() => {
    if (!errorSection) return
    setOpenSections((prev) => (prev[errorSection] ? prev : { ...prev, [errorSection]: true }))
  }, [errorSection])

  const accordion = useCallback(
    (
      key: string,
      title: string,
      description: string,
      body: React.ReactNode,
      preview?: React.ReactNode,
      icon?: LucideIcon
    ) => (
      <AccordionSection
        key={key}
        locale={locale}
        title={title}
        description={description}
        open={openSections[key]}
        onToggle={() => toggleAccordion(key)}
        preview={preview}
        icon={icon}
        testId={key}
      >
        {body}
      </AccordionSection>
    ),
    [locale, openSections, toggleAccordion]
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

  // --- Contact / Social / CTA handlers (all DRAFT-only) --------------------

  const updateContactField = useCallback(
    (field: keyof WebsiteConfig['contact'], patch: { value?: string; isVisible?: boolean }) => {
      setConfig((prev) => ({
        ...prev,
        contact: { ...prev.contact, [field]: { ...prev.contact[field], ...patch } },
      }))
      markChanged()
    },
    [markChanged]
  )

  const updateSocialLink = useCallback(
    (platform: (typeof SOCIAL_PLATFORMS)[number], patch: { url?: string; isEnabled?: boolean }) => {
      setConfig((prev) => ({
        ...prev,
        social: { ...prev.social, [platform]: { ...prev.social[platform], ...patch } },
      }))
      markChanged()
    },
    [markChanged]
  )

  const updateCta = useCallback(
    (patch: Partial<WebsiteConfig['cta']>) => {
      setConfig((prev) => ({ ...prev, cta: { ...prev.cta, ...patch } }))
      markChanged()
    },
    [markChanged]
  )

  const updateCtaLabel = useCallback(
    (loc: 'ar' | 'en', value: string) => {
      setConfig((prev) => ({
        ...prev,
        cta: { ...prev.cta, label: { ...prev.cta.label, [loc]: value } },
      }))
      markChanged()
    },
    [markChanged]
  )

  const toggleMobileSticky = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      mobileStickyCta: { ...prev.mobileStickyCta, isEnabled: !prev.mobileStickyCta.isEnabled },
    }))
    markChanged()
  }, [markChanged])

  // Save draft
  const handleSaveDraft = useCallback(() => {
    setSaveStatus('saving')
    setValidationIssues([])
    setGeneralError(null)
    startTransition(async () => {
      try {
        const result = await saveDraft({ slug, locale, config })
        if (result.ok) {
          setSaveStatus('saved')
          setHasUnsavedChanges(false)
          setValidationIssues([])
          toast('success', rtl ? 'تم حفظ المسودة بنجاح' : 'Draft saved successfully')
          router.refresh()
        } else {
          // Failure: report it and keep the tenant's text exactly as typed.
          setSaveStatus('error')
          if (result.errors?.length) setValidationIssues(result.errors)
          setGeneralError(rtl ? 'تعذر حفظ المسودة' : 'Failed to save draft')
          toast('error', rtl ? 'تعذر حفظ المسودة' : 'Failed to save draft')
        }
      } catch {
        setSaveStatus('error')
        setGeneralError(rtl ? 'تعذر حفظ المسودة' : 'Failed to save draft')
        toast('error', rtl ? 'تعذر حفظ المسودة' : 'Failed to save draft')
      }
    })
  }, [slug, locale, config, rtl, toast, startTransition])

  // Publish — sends the current editor state directly to the server
  const handlePublish = useCallback(() => {
    setShowPublishConfirm(false)
    setPublishStatus('publishing')
    setValidationIssues([])
    setGeneralError(null)
    startTransition(async () => {
      try {
        const result = await publishChanges({ slug, locale, config })
        if (result.ok) {
          setPublishStatus('published')
          setHasUnsavedChanges(false)
          setSaveStatus('idle')
          setValidationIssues([])
          toast('success', rtl ? 'تم نشر التغييرات بنجاح' : 'Changes published successfully')
          router.refresh()
        } else {
          setPublishStatus('error')
          if (result.errors?.length) setValidationIssues(result.errors)
          // A blocked publish is surfaced with the specific reason (e.g. the
          // selected CTA action has no destination) rather than a generic error.
          const message =
            result.error === 'CTA_NO_DESTINATION'
              ? (rtl
                  ? 'لا يمكن النشر: الإجراء المحدد لا يملك وجهة صالحة. صحّح البيانات أو غيّر الإجراء.'
                  : 'Cannot publish: the selected action has no valid destination. Fix the details or change the action.')
              : (rtl ? 'تعذر النشر' : 'Failed to publish')
          setGeneralError(message)
          toast('error', message)
        }
      } catch {
        setPublishStatus('error')
        setGeneralError(rtl ? 'تعذر النشر' : 'Failed to publish')
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

  // --- Live website URL (toolbar) ---
  const publicUrl = publicTenantUrl(locale, slug)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current) }, [])

  const handleCopyUrl = useCallback(async () => {
    const absolute = /^https?:\/\//i.test(publicUrl) ? publicUrl : `${window.location.origin}${publicUrl}`
    let ok = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(absolute)
        ok = true
      } else {
        const area = document.createElement('textarea')
        area.value = absolute
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.top = '0'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        ok = document.execCommand('copy')
        document.body.removeChild(area)
      }
    } catch {
      ok = false
    }
    setCopyStatus(ok ? 'copied' : 'error')
    if (copyTimer.current) clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopyStatus('idle'), ok ? 2000 : 3000)
  }, [publicUrl])

  // Live website
  const handleLiveWebsite = useCallback(() => {
    window.open(`/${locale}/tenants/${slug}`, '_blank')
  }, [locale, slug])

  // Sections that actually have a renderer. Sections of other types may exist
  // in a persisted config but cannot be toggled or reordered to any effect, so
  // they are not shown as editable controls.
  const editableSections = config.sections.filter((s) => isRenderableSectionType(s.type))

  // The `services` section gets its own Services area (see
  // components/services-section.tsx), where its text sits with the service list
  // and their images. Its text is therefore NOT repeated in Section Content.
  //
  // Section Management, by contrast, keeps listing EVERY renderable section —
  // services included — because visibility and ordering are its job and always
  // have been.
  const servicesSection = editableSections.find((s) => s.type === 'services') ?? null

  // -------------------------------------------------------------------------
  // Collapsed-section previews.
  //
  // Every value below is read from the LIVE editor state (`config`), never
  // hardcoded, and never persisted. Each is presentational only.
  // -------------------------------------------------------------------------

  // Identity: the business name (tenant's) and the active primary color. The
  // editor has no "business name" input — the name is the tenant's own.
  const previewBusinessName = (tenant.name ?? '').trim()
  const previewPrimaryColor = config.theme.primaryColor ?? '#0F766E'

  // Hero: the current image, if one has been chosen.
  const previewHeroImage = config.theme.heroImage ?? ''

  // Contact: a concise count of the fields that are BOTH visible AND non-empty.
  // Hidden or empty fields are never surfaced, matching the public renderer.
  const previewContactFields: Array<{ key: string; label: string; value: string }> = (
    [
      { key: 'phone', label: rtl ? 'هاتف' : 'Phone', field: config.contact.phone },
      { key: 'whatsapp', label: rtl ? 'واتساب' : 'WhatsApp', field: config.contact.whatsapp },
      { key: 'email', label: rtl ? 'بريد' : 'Email', field: config.contact.email },
    ] as const
  )
    .filter(({ field }) => field.isVisible && field.value.trim() !== '')
    .map(({ key, label, field }) => ({ key, label, value: field.value.trim() }))

  // Social: the platforms that are enabled AND carry a usable URL.
  const previewSocialCount = SOCIAL_PLATFORMS.filter((p) => {
    const link = config.social[p]
    return link?.isEnabled && isHttpUrl(link.url)
  }).length

  // CTA: the selected action and the label that will actually render.
  const previewCtaActionLabel =
    config.cta.action === 'booking'
      ? (rtl ? 'حجز موعد' : 'Book')
      : config.cta.action === 'call'
        ? (rtl ? 'اتصال' : 'Call')
        : (rtl ? 'واتساب' : 'WhatsApp')
  const previewCtaLabel = resolveCtaLabel(locale, config.cta, null)

  // Check if all renderable sections are hidden
  const allHidden = editableSections.length > 0 && editableSections.every((s) => !s.isVisible)
  // No renderable sections at all (e.g. every section removed).
  const noSections = editableSections.length === 0

  // --- Contact / CTA derived state -----------------------------------------

  const contactSection = editableSections.find((s) => s.type === 'contact') ?? null
  // The Contact section is enabled but has nothing to show: the public site will
  // omit it entirely, so the editor says so rather than letting the tenant
  // publish an invisible section by surprise.
  const contactEmptyWarning =
    !!contactSection && contactSection.isVisible && !hasVisibleContactData(config.contact)
  const ctaTarget = resolveCtaTarget(config.cta, config.contact)

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
          {/* Live website URL container — replaces the standalone button.
              Uses the same URL helper as the Overview page, so the displayed
              URL is always consistent. */}
          <div className="col-span-2 flex min-w-0 items-center gap-2 rounded-xl border border-border bg-paper px-3 py-2 sm:col-span-1">
            <Globe aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-teal" />
            <span dir="ltr" title={publicUrl} className="min-w-0 flex-1 wrap-anywhere font-mono text-xs text-ink-muted">
              {publicUrl}
            </span>
            <button
              type="button"
              onClick={handleCopyUrl}
              aria-label={rtl ? 'نسخ رابط الموقع' : 'Copy website link'}
              title={rtl ? 'نسخ الرابط' : 'Copy link'}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#516078] outline-none transition hover:text-brand-teal focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
            >
              {copyStatus === 'copied' ? (
                <Check aria-hidden="true" className="h-4 w-4 text-[#24865b]" />
              ) : (
                <Copy aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={rtl ? 'فتح الموقع في تبويب جديد' : 'Open website in a new tab'}
              title={rtl ? 'فتح الموقع' : 'Open website'}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#516078] outline-none transition hover:text-brand-teal focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
            >
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
            </a>
          </div>
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

      {/* General (non-field) error from the last failed save/publish. The
          tenant's edited values are still in state — nothing was discarded. */}
      {generalError && (
        <div
          role="alert"
          data-testid="editor-general-error"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {generalError}
        </div>
      )}

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
      {accordion('identity', rtl ? 'هوية الموقع' : 'Website Identity', rtl ? 'تخصيص الألوان والشعار والمحتوى الرئيسي للموقع.' : 'Customize colors, logo, and main website content.', (
        <>

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

          {/* Logo — one wide horizontal upload zone. The current logo is shown
              inside the zone itself, so there is no separate thumbnail box. */}
          <div>
            <span className="mb-2 block text-xs font-semibold text-[#647087]">{rtl ? 'الشعار' : 'Logo'}</span>
            <ImageUploadZone
              locale={locale}
              title={config.theme.logo ? (rtl ? 'تغيير الشعار' : 'Change logo') : (rtl ? 'رفع شعار' : 'Upload logo')}
              accept="image/png, image/jpeg, image/svg+xml"
              maxSizeLabel="PNG · JPEG · SVG"
              preview={config.theme.logo || undefined}
              onFile={(file) => {
                const reader = new FileReader()
                reader.onload = (event) => {
                  if (typeof event.target?.result === 'string') {
                    updateTheme('logo', event.target.result)
                  }
                }
                reader.readAsDataURL(file)
              }}
            />
            {config.theme.logo && (
              <button
                type="button"
                onClick={() => updateTheme('logo', '')}
                className="mt-2 text-xs text-red-600 hover:underline"
              >
                {rtl ? 'إزالة الشعار' : 'Remove logo'}
              </button>
            )}
          </div>

          {/* Hero image — optional background image for the hero section */}
          <div>
            <span className="mb-2 block text-xs font-semibold text-[#647087]">
              {rtl ? 'صورة القسم الرئيسي' : 'Hero image'}
            </span>
            <p className="mb-3 text-[11px] text-ink-lighter">
              {rtl
                ? 'صورة خلفية اختيارية للقسم الرئيسي. تُعرض بنص فوقها. الحد الأقصى 2 ميجابايت.'
                : 'Optional background image for the hero section. Text is overlaid on top. Max 2MB.'}
            </p>
            {/* One wide horizontal zone. The current hero image (with its focal
                point applied) is shown inside the zone itself. */}
            <ImageUploadZone
              locale={locale}
              title={
                config.theme.heroImage
                  ? (rtl ? 'تغيير الصورة' : 'Change image')
                  : (rtl ? 'رفع صورة' : 'Upload image')
              }
              accept="image/png, image/jpeg, image/webp"
              maxSizeLabel="PNG · JPEG · WebP · 2MB"
              preview={config.theme.heroImage || undefined}
              previewFit="cover"
              previewStyle={{ objectPosition: focalPointToCss(config.theme.heroImageFocalPoint) }}
              onFile={(file) => handleHeroImageChange({ target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>)}
            />
            {config.theme.heroImage && (
              <button
                type="button"
                // Clear the focal point and opacity alongside the image, so
                // removing the image cannot leave stale crop/opacity state
                // to be applied to whatever is uploaded next.
                onClick={() => {
                  setConfig((prev) => ({
                    ...prev,
                    theme: {
                      ...prev.theme,
                      heroImage: undefined,
                      heroImageFocalPoint: undefined,
                      heroImageCrop: undefined,
                      heroImageOpacity: undefined,
                    },
                  }))
                  markChanged()
                }}
                className="mt-2 text-xs text-red-600 hover:underline"
              >
                {rtl ? 'إزالة الصورة' : 'Remove image'}
              </button>
            )}

            {/* Crop — opens the cropper at the hero band's aspect ratio. */}
            {config.theme.heroImage && (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowHeroCropper(true)}
                    className="rounded-lg border border-[#e1e5ed] bg-paper px-3 py-1.5 text-xs font-semibold text-[#516078] transition hover:bg-surface"
                  >
                    {hasHeroCrop
                      ? (rtl ? 'تعديل الاقتصاص' : 'Adjust crop')
                      : (rtl ? 'اقتصاص الصورة' : 'Crop image')}
                  </button>
                  {hasHeroCrop && (
                    <button
                      type="button"
                      onClick={() => updateTheme('heroImageCrop', '')}
                      className="text-xs text-brand-teal hover:underline"
                    >
                      {rtl ? 'إلغاء الاقتصاص' : 'Remove crop'}
                    </button>
                  )}
                </div>

                <div className="mt-4 max-w-sm">
                  <label className="block">
                    <span className="flex items-center justify-between text-xs font-semibold text-[#647087]">
                      <span>{rtl ? 'شفافية الصورة' : 'Image opacity'}</span>
                      <span className="font-mono">{Math.round(heroOpacity * 100)}%</span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(heroOpacity * 100)}
                      onChange={(e) => setHeroOpacity(Number(e.target.value) / 100)}
                      aria-label={rtl ? 'شفافية صورة القسم الرئيسي' : 'Hero image opacity'}
                      className="mt-2 h-1.5 w-full cursor-pointer accent-[#0F766E]"
                    />
                  </label>
                  <p className="mt-1 text-[11px] text-ink-lighter">
                    {rtl
                      ? 'تؤثر على الصورة فقط — يبقى النص والأزرار واضحة تماماً.'
                      : 'Affects the image only — your text and buttons stay fully opaque.'}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
        </>
        ), (
        <>
        {previewBusinessName && (
          <span className="inline-flex items-center gap-1.5">
            <span className="font-semibold text-[#516078]">{previewBusinessName}</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10"
            style={{ backgroundColor: previewPrimaryColor }}
            aria-hidden="true"
          />
          <span className="font-mono" dir="ltr">
            {previewPrimaryColor}
          </span>
        </span>
        {previewHeroImage && (
          <span className="inline-flex items-center gap-1.5">
            <img
              src={previewHeroImage}
              alt=""
              className="h-6 w-10 rounded object-cover"
              aria-hidden="true"
            />
            <span>{rtl ? 'صورة رئيسية' : 'Hero image'}</span>
          </span>
        )}
        </>
        ), Palette)}

      {/* Section Content — driven by SECTION_CONTENT_FIELDS so the editor and
          renderer always agree on which fields are editable.
          The Services section's text is NOT here: it lives in the Services area
          below, beside the service list it describes. Every other renderable
          section is listed here exactly as before. */}
      {accordion('content', rtl ? 'محتوى الأقسام' : 'Section Content', rtl ? 'عدّل النصوص الظاهرة في كل قسم. اترك الحقل فارغاً لاستخدام النص الافتراضي.' : 'Edit the text shown in each section. Leave a field empty to use the default text.', (
        <>

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
        </>
      ), (
        <span>
          {rtl
            ? `${editableSections.length} قسم قابل للتعديل`
            : `${editableSections.length} editable section${editableSections.length === 1 ? '' : 's'}`}
        </span>
      ), FileText)}

      {/* خدماتك — Services management in its OWN top-level accordion, using the
          shared AccordionSection. The Services section's TEXT is edited in
          محتوى الأقسام above; this accordion owns the service list, prices,
          durations and per-service images. Not nested inside any other section. */}
      {servicesSection &&
        accordion('services', rtl ? 'خدماتك' : 'Your Services', rtl ? 'قائمة خدماتك مع الأسعار والمدة وصور كل خدمة. تُحفظ فوراً.' : 'Your service list with prices, duration and each service’s image. Saves immediately.', (
          <div className="mt-6">
            <ServicesSection locale={locale} slug={slug} services={services} />
          </div>
        ), (
          <span>
            {services.length > 0
              ? (rtl ? `${services.length} خدمة` : `${services.length} service${services.length === 1 ? '' : 's'}`)
              : (rtl ? 'لا توجد خدمات بعد' : 'No services yet')}
          </span>
        ), BriefcaseBusiness)}

        {/* Contact Information — managed independently of the tenant profile
          fields, per the product contract. Each field has its own visibility
          toggle; hidden or empty fields render nothing on the public site. */}
      {accordion('contact', rtl ? 'معلومات الاتصال' : 'Contact Information', rtl ? 'بيانات الاتصال الظاهرة في قسم "تواصل معنا" وفي التذييل. كل حقل مستقل ويمكن إخفاؤه.' : 'The contact details shown in the Contact section and the footer. Each field is independent and can be hidden.', (
        <>

        {contactEmptyWarning && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {CONTACT_EMPTY_WARNING[locale]}
          </div>
        )}

        <div className="mt-6 space-y-5">
          {/* Phone */}
          <ContactFieldRow
            rtl={rtl}
            label={rtl ? 'رقم الهاتف' : 'Phone number'}
            hint={PHONE_FORMAT_HINT[locale]}
            value={config.contact.phone.value}
            isVisible={config.contact.phone.isVisible}
            maxLength={CONTACT_PRACTICAL_LIMITS.phone}
            warning={
              config.contact.phone.value.trim() !== '' && !toTelHref(config.contact.phone.value)
                ? PHONE_INVALID_HINT[locale]
                : undefined
            }
            issue={issueFor('contact.phone.value')}
            locale={locale}
            onValue={(v) => updateContactField('phone', { value: v })}
            onToggle={() => updateContactField('phone', { isVisible: !config.contact.phone.isVisible })}
          />

          {/* WhatsApp */}
          <ContactFieldRow
            rtl={rtl}
            label={rtl ? 'رقم واتساب' : 'WhatsApp number'}
            hint={PHONE_FORMAT_HINT[locale]}
            value={config.contact.whatsapp.value}
            isVisible={config.contact.whatsapp.isVisible}
            maxLength={CONTACT_PRACTICAL_LIMITS.whatsapp}
            warning={
              config.contact.whatsapp.value.trim() !== '' && !toWhatsAppHref(config.contact.whatsapp.value)
                ? PHONE_INVALID_HINT[locale]
                : undefined
            }
            issue={issueFor('contact.whatsapp.value')}
            locale={locale}
            onValue={(v) => updateContactField('whatsapp', { value: v })}
            onToggle={() => updateContactField('whatsapp', { isVisible: !config.contact.whatsapp.isVisible })}
          />

          {/* Email */}
          <ContactFieldRow
            rtl={rtl}
            label={rtl ? 'البريد الإلكتروني' : 'Email address'}
            value={config.contact.email.value}
            isVisible={config.contact.email.isVisible}
            maxLength={CONTACT_PRACTICAL_LIMITS.email}
            warning={
              config.contact.email.value.trim() !== '' && !toMailto(config.contact.email.value)
                ? (rtl ? 'صيغة البريد الإلكتروني غير صحيحة.' : 'Invalid email address.')
                : undefined
            }
            issue={issueFor('contact.email.value')}
            locale={locale}
            onValue={(v) => updateContactField('email', { value: v })}
            onToggle={() => updateContactField('email', { isVisible: !config.contact.email.isVisible })}
          />


        </div>
        </>
      ), (
        previewContactFields.length > 0 ? (
          <>
            {previewContactFields.map((f) => (
              <span key={f.key} className="inline-flex items-center gap-1">
                <span className="text-[#929bad]">{f.label}:</span>
                <span className="break-all" dir="ltr">
                  {f.value}
                </span>
              </span>
            ))}
          </>
        ) : (
          <span className="text-[#929bad]">
            {rtl ? 'لا توجد بيانات اتصال ظاهرة' : 'No visible contact details'}
          </span>
        )
      ), Contact)}

      {/* Social Links — the four fixed platforms only. */}
      {accordion('social', rtl ? 'روابط التواصل' : 'Social Links', rtl ? 'روابط حساباتك على المنصات المدعومة. تُعرض في قسم التواصل والترويسة والتذييل.' : 'Your profiles on the supported platforms. Shown in the Contact section, header and footer.', (
        <>

        <div className="mt-6 space-y-5">
          {SOCIAL_PLATFORMS.map((platform) => {
            const labels: Record<string, { ar: string; en: string }> = {
              instagram: { ar: 'إنستغرام', en: 'Instagram' },
              facebook: { ar: 'فيسبوك', en: 'Facebook' },
              tiktok: { ar: 'تيك توك', en: 'TikTok' },
              youtube: { ar: 'يوتيوب', en: 'YouTube' },
            }
            const link = config.social[platform]
            return (
              <ContactFieldRow
                key={platform}
                rtl={rtl}
                label={labels[platform][locale]}
                value={link.url}
                isVisible={link.isEnabled}
                maxLength={CONTACT_PRACTICAL_LIMITS.socialUrl}
                warning={
                  link.url.trim() !== '' && !isHttpUrl(link.url) ? URL_INVALID_HINT[locale] : undefined
                }
                issue={issueFor(`social.${platform}.url`)}
                locale={locale}
                onValue={(v) => updateSocialLink(platform, { url: v })}
                onToggle={() => updateSocialLink(platform, { isEnabled: !link.isEnabled })}
              />
            )
          })}
        </div>
        </>
      ), (
        previewSocialCount > 0 ? (
          <span>
            {rtl
              ? `${previewSocialCount} منصة مُفعّلة`
              : `${previewSocialCount} platform${previewSocialCount === 1 ? '' : 's'} enabled`}
          </span>
        ) : (
          <span className="text-[#929bad]">{rtl ? 'لا توجد منصات مُفعّلة' : 'No platforms enabled'}</span>
        )
      ), Share2)}

      {/* Primary CTA + Mobile Sticky CTA */}
      {accordion('cta', rtl ? 'زر الإجراء الرئيسي' : 'Primary Call-to-Action', rtl ? 'حدد الإجراء الذي يقوم به الزر الرئيسي في الموقع، ونصّه بالعربية والإنجليزية.' : 'Choose what the website’s main button does, and its Arabic and English text.', (
        <>

        <div className="mt-6 space-y-6">
          <div>
            <span className="mb-2 block text-xs font-semibold text-[#647087]">
              {rtl ? 'الإجراء' : 'Action'}
            </span>
            <div className="flex flex-wrap gap-2">
              {CTA_ACTIONS.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => updateCta({ action })}
                  aria-pressed={config.cta.action === action}
                  className={`rounded-xl border px-4 py-2 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 ${
                    config.cta.action === action
                      ? 'border-brand-teal bg-surface text-brand-teal'
                      : 'border-[#e1e5ed] bg-paper text-[#516078] hover:border-brand-teal/60'
                  }`}
                >
                  {action === 'booking'
                    ? (rtl ? 'حجز موعد' : 'Book')
                    : action === 'call'
                      ? (rtl ? 'اتصال' : 'Call')
                      : (rtl ? 'واتساب' : 'WhatsApp')}
                </button>
              ))}
            </div>
          </div>

          {/* Destination warning, specific to the selected action. Never a
              fallback: the CTA simply will not render until it is valid. */}
          {config.cta.action !== 'booking' && ctaTarget.kind === 'none' && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              {CTA_WARNINGS[config.cta.action as Exclude<CtaAction, 'booking'>][locale]}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-[#647087]">
                {rtl ? 'نص الزر (عربي)' : 'Button text (Arabic)'}
              </span>
              <input
                type="text"
                value={config.cta.label.ar}
                onChange={(e) => updateCtaLabel('ar', e.target.value)}
                maxLength={CONTACT_PRACTICAL_LIMITS.ctaLabel}
                placeholder="احجز موعداً"
                dir="rtl"
                className="mt-2 h-11 w-full rounded-xl border border-[#e1e5ed] bg-paper px-4 text-sm outline-none focus:border-brand-teal"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-[#647087]">
                {rtl ? 'نص الزر (إنجليزي)' : 'Button text (English)'}
              </span>
              <input
                type="text"
                value={config.cta.label.en}
                onChange={(e) => updateCtaLabel('en', e.target.value)}
                maxLength={CONTACT_PRACTICAL_LIMITS.ctaLabel}
                placeholder="Book an appointment"
                dir="ltr"
                className="mt-2 h-11 w-full rounded-xl border border-[#e1e5ed] bg-paper px-4 text-sm outline-none focus:border-brand-teal"
              />
            </label>
          </div>
          <p className="text-xs text-ink-lighter">
            {rtl
              ? 'اترك النص فارغاً لاستخدام نص قسم البطل أو النص الافتراضي.'
              : 'Leave empty to use the hero section\u2019s button text or the default.'}
          </p>

          {/* Mobile sticky CTA */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#edf0f4] bg-surface p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{rtl ? 'زر ثابت للجوال' : 'Mobile sticky CTA'}</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {rtl
                  ? 'يظهر شريط الزر في أسفل الشاشة على الجوال فقط، بنفس إجراء الزر الرئيسي.'
                  : 'Shows the button bar at the bottom of the screen on mobile only, using the same action as the primary CTA.'}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleMobileSticky}
              role="switch"
              aria-checked={config.mobileStickyCta.isEnabled}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                config.mobileStickyCta.isEnabled ? 'bg-brand-teal' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                  config.mobileStickyCta.isEnabled ? 'start-0.5' : 'end-0.5'
                }`}
              />
            </button>
          </div>
        </div>
        </>
      ), (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-[#929bad]">{rtl ? 'الإجراء:' : 'Action:'}</span>
            <span className="font-semibold text-[#516078]">{previewCtaActionLabel}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-[#929bad]">{rtl ? 'النص:' : 'Label:'}</span>
            <span className="break-words text-[#516078]">{previewCtaLabel}</span>
          </span>
        </>
      ), MousePointerClick)}


      {/* Section Management — visibility, ordering and removal. */}
        {accordion('sections', rtl ? 'إدارة الأقسام' : 'Section Management', rtl ? 'التحكم في ظهور الأقسام وترتيبها في الموقع.' : 'Control which sections appear and their order on the website.', (
        <>

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
        </>
      ), (
        <span>
          {rtl
            ? `${editableSections.filter((s) => s.isVisible).length} من ${editableSections.length} ظاهرة`
            : `${editableSections.filter((s) => s.isVisible).length} of ${editableSections.length} visible`}
        </span>
      ), LayoutGrid)}

      {/* Hero image cropper — modal, opened from the Hero image controls.
          Cancel leaves the previous image AND crop untouched. */}
      {showHeroCropper && config.theme.heroImage && (
        <ImageCropper
          locale={locale}
          image={config.theme.heroImage}
          aspect={CROP_ASPECTS.hero}
          initialCrop={resolveCrop(config.theme.heroImageCrop)}
          title={rtl ? 'اقتصاص صورة القسم الرئيسي' : 'Crop hero image'}
          onCancel={() => setShowHeroCropper(false)}
          onConfirm={(crop) => {
            setHeroCrop(crop)
            setShowHeroCropper(false)
          }}
        />
      )}

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
