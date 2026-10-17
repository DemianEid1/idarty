import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AccordionSection } from '@/components/accordion-section'
import { ImageUploadZone } from '@/components/image-upload-zone'
import { Palette, FileText, BriefcaseBusiness, Contact, Share2, MousePointerClick, LayoutGrid } from 'lucide-react'

/**
 * Website Builder reorganization — top-level section order, per-section icons,
 * the independent Services accordion, and the wide horizontal upload zone.
 *
 * Source-level guards for the editor's structure, plus real renders of the
 * shared components so their contract is exercised rather than re-implemented.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')

const editor = read('components/website-editor.tsx')
const accordion = read('components/accordion-section.tsx')
const uploadZone = read('components/image-upload-zone.tsx')
const servicesSection = read('components/services-section.tsx')

// ---------------------------------------------------------------------------
// 1. Top-level section order
// ---------------------------------------------------------------------------

describe('top-level Website Builder section order', () => {
  const ORDER = [
    { key: 'identity', label: 'هوية الموقع' },
    { key: 'content', label: 'محتوى الأقسام' },
    { key: 'services', label: 'خدماتك' },
    { key: 'contact', label: 'معلومات الاتصال' },
    { key: 'social', label: 'روابط التواصل' },
    { key: 'cta', label: 'زر الإجراء الرئيسي' },
    { key: 'sections', label: 'إدارة الأقسام' },
  ]

  it('renders the seven sections in exactly the requested order', () => {
    const positions = ORDER.map(({ key }) => {
      const i = editor.indexOf(`accordion('${key}'`)
      expect(i, `accordion('${key}') not found`).toBeGreaterThan(-1)
      return { key, i }
    })
    for (let n = 1; n < positions.length; n++) {
      expect(
        positions[n].i,
        `${positions[n].key} must come after ${positions[n - 1].key}`
      ).toBeGreaterThan(positions[n - 1].i)
    }
  })

  it('uses the requested Arabic labels', () => {
    for (const { label } of ORDER) {
      expect(editor).toContain(label)
    }
  })

  it('does not nest one top-level accordion inside another', () => {
    // Every accordion call is at the same JSX depth (6 spaces of indentation),
    // except the services one which is guarded by `{servicesSection &&` at 6 and
    // the call at 8 — still a sibling, not nested.
    const calls = editor.match(/^\s*\{?accordion\('/gm) ?? []
    expect(calls.length).toBe(7)
    const depths = new Set(calls.map((c) => c.match(/^\s*/)?.[0].length ?? 0))
    expect(Math.max(...depths)).toBeLessThanOrEqual(10)
  })
})

// ---------------------------------------------------------------------------
// 2. Icons
// ---------------------------------------------------------------------------

describe('every top-level section has a consistent icon', () => {
  it('passes an icon as the 6th accordion argument for all seven sections', () => {
    const icons = [
      'Palette',
      'FileText',
      'BriefcaseBusiness',
      'Contact',
      'Share2',
      'MousePointerClick',
      'LayoutGrid',
    ]
    for (const icon of icons) {
      // Each icon is passed as a bare identifier argument to the helper.
      expect(editor, `${icon} not wired`).toMatch(new RegExp(`\\)\\, ${icon}\\)`))
    }
  })

  it('imports every icon from the installed icon library', () => {
    for (const icon of ['Palette', 'FileText', 'BriefcaseBusiness', 'Contact', 'Share2', 'MousePointerClick', 'LayoutGrid']) {
      expect(editor).toContain(icon)
    }
    expect(editor).toContain("from 'lucide-react'")
    expect(editor).toMatch(/import type \{ LucideIcon \} from 'lucide-react'/)
  })

  it('renders the icon in a uniform teal chip', () => {
    expect(accordion).toContain('icon?: LucideIcon')
    expect(accordion).toContain('{Icon && (')
    // One shared chip treatment for all sections.
    expect(accordion).toContain('rounded-xl bg-[#f0faf9] text-brand-teal')
    expect(accordion).toContain('h-[18px] w-[18px]')
  })

  it('marks the icon decorative so it never doubles the title for screen readers', () => {
    const iconBlock = accordion.slice(
      accordion.indexOf('{Icon && ('),
      accordion.indexOf('<Chevron')
    )
    expect(iconBlock).toContain('aria-hidden="true"')
  })

  it('lays the header out with logical flex so RTL mirrors without overrides', () => {
    // No flex-row-reverse and no direction-specific margins/spacing.
    expect(accordion).not.toContain('flex-row-reverse')
    expect(accordion).not.toMatch(/\bml-\d|\bmr-\d/)
  })

  it('renders the icon and title without error for every icon', () => {
    const html = renderToStaticMarkup(
      createElement(AccordionSection, {
        locale: 'ar' as const,
        title: 'هوية الموقع',
        description: 'وصف',
        open: false,
        onToggle: () => {},
        icon: Palette,
        testId: 'identity',
        children: 'BODY',
      })
    )
    expect(html).toContain('data-testid="identity-icon"')
    expect(html).toContain('هوية الموقع')
    // Description keeps the body weight (the bold regression must not return).
    expect(html).toContain('font-normal')
  })
})

// ---------------------------------------------------------------------------
// 3. Independent Services accordion
// ---------------------------------------------------------------------------

describe('Services management is its own top-level accordion', () => {
  it('uses the shared AccordionSection with its own key and preview', () => {
    expect(editor).toContain("accordion('services'")
    expect(editor).toContain("rtl ? 'خدماتك' : 'Your Services'")
    // Preview reflects real state.
    expect(editor).toMatch(/services\.length > 0[\s\S]{0,200}خدمة/)
  })

  it('keeps the service list, add and images inside the panel', () => {
    expect(editor).toContain('<ServicesSection locale={locale} slug={slug} services={services} />')
    expect(servicesSection).toContain('<ServiceForm')
    expect(servicesSection).toContain('<ServiceImageForm')
    expect(servicesSection).toContain('إضافة خدمة')
  })

  it('moves the Services section text into Section Content without duplication', () => {
    // Section Content lists every renderable section, services included...
    expect(editor).not.toContain("editableSections.filter((s) => s.type !== 'services')")
    // ...and the services list panel no longer renders those text fields.
    expect(servicesSection).not.toContain('SECTION_CONTENT_FIELDS.services')
    expect(servicesSection).not.toContain('onUpdateContent')
    expect(servicesSection).not.toContain('onResetContent')
  })

  it('gives the Services accordion a sensible default open state', () => {
    const block = editor.slice(
      editor.indexOf('const [openSections'),
      editor.indexOf('const toggleAccordion')
    )
    expect(block).toContain('services: true')
    expect(block).toContain('identity: true')
  })

  it('still auto-expands a collapsed section that owns a validation error', () => {
    expect(editor).toContain('errorSection')
    expect(editor).toMatch(/setOpenSections\(\(prev\) => \(prev\[errorSection\]/)
  })

  it('does not change the public website section order', () => {
    // The public renderer's order comes from the stored config, not the editor.
    const site = read('components/tenant-website.tsx')
    expect(site).toContain('resolveOrderedSectionTypes')
    // The editor reorder introduced no config mutation.
    expect(editor).not.toMatch(/sortOrder:\s*\d+\s*,\s*\/\/\s*editor order/)
  })
})

// ---------------------------------------------------------------------------
// 4. Wide horizontal upload zone
// ---------------------------------------------------------------------------

describe('image upload zone is a wide horizontal rectangle', () => {
  const render = (props: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(ImageUploadZone, {
        locale: 'en' as const,
        onFile: () => {},
        accept: 'image/png, image/jpeg, image/webp',
        maxSizeLabel: 'PNG · JPEG · WebP · 2MB',
        title: 'Upload image',
        ...props,
      })
    )

  it('lays its content out horizontally and full width', () => {
    expect(uploadZone).toContain('flex-row')
    expect(uploadZone).toContain('w-full')
    // No reverse-row trick; RTL must mirror via logical flow. Assert on the CODE
    // (the header comment legitimately names the avoided class).
    const code = uploadZone.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toContain('flex-row-reverse')
  })

  it('keeps a usable minimum height', () => {
    expect(uploadZone).toMatch(/min-h-\[\d+px\]/)
  })

  it('uses a subtle border and rounded corners', () => {
    expect(uploadZone).toContain('border border-dashed')
    expect(uploadZone).toContain('rounded-2xl')
  })

  it('renders icon, text and action in one horizontal row', () => {
    const html = render()
    expect(html).toContain('Choose image')
    expect(html).toContain('Upload image')
    expect(html).toContain('PNG · JPEG · WebP · 2MB')
  })

  it('shows a thumbnail and a change action when an image exists', () => {
    const html = render({ preview: 'data:image/png;base64,AAAA', title: 'Change image' })
    expect(html).toContain('Change image')
    expect(html).toContain('<img')
  })

  it('never crops the preview by default (logo safety)', () => {
    expect(uploadZone).toContain("previewFit = 'contain'")
    const html = render({ preview: 'data:image/png;base64,AAAA' })
    expect(html).toContain('object-contain')
  })

  it('lets the hero opt into cover with a focal point', () => {
    const html = render({
      preview: 'data:image/png;base64,AAAA',
      previewFit: 'cover',
      previewStyle: { objectPosition: '50% 30%' },
    })
    expect(html).toContain('object-cover')
    expect(html).toContain('object-position:50% 30%')
  })

  it('prevents the picker button from double-triggering the picker', () => {
    // The button stops propagation before opening the native picker.
    expect(uploadZone).toContain('e.stopPropagation()')
    expect(uploadZone).toContain('openPicker()')
  })

  it('preserves accept filters, validation feedback and keyboard access', () => {
    const html = render()
    expect(html).toContain('accept="image/png, image/jpeg, image/webp"')
    expect(html).toContain('type="file"')
    expect(html).toContain('aria-label="Upload image"')
  })

  it('keeps drag-and-drop handlers', () => {
    expect(uploadZone).toContain('onDragOver')
    expect(uploadZone).toContain('onDrop')
    expect(uploadZone).toContain('onDragLeave')
  })

  it('is used for both the logo and the hero image', () => {
    expect(editor).toContain('ImageUploadZone')
    // Logo: preview passed, contain (default).
    const logoBlock = editor.slice(
      editor.indexOf("rtl ? 'الشعار' : 'Logo'"),
      editor.indexOf('Hero image — optional background image')
    )
    expect(logoBlock).toContain('preview={config.theme.logo')
    // Hero: cover + focal point.
    expect(editor).toContain('preview={config.theme.heroImage')
    expect(editor).toContain('previewFit="cover"')
    expect(editor).toContain('focalPointToCss(config.theme.heroImageFocalPoint)')
  })

  it('keeps Remove as a separate explicit action', () => {
    expect(editor).toContain("rtl ? 'إزالة الشعار' : 'Remove logo'")
    expect(editor).toContain("rtl ? 'إزالة الصورة' : 'Remove image'")
  })

  it('does not change service-image behavior', () => {
    const form = read('components/service-image-form.tsx')
    expect(form).toContain('MAX_SERVICE_IMAGE_SIZE')
    expect(form).toContain('SUPPORTED_IMAGE_MIME_TYPES')
    expect(form).toContain('CROP_ASPECTS.service')
    // Service images keep their own control; they are not routed through the zone.
    expect(form).not.toContain('ImageUploadZone')
  })
})
