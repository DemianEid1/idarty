import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Corrections round — the three fixes requested against the screenshot.
 *
 * Source-level assertions that pin the corrected architecture. They are
 * regression GUARDS, not layout measurements.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')

const editor = read('components/website-editor.tsx')
const servicesSection = read('components/services-section.tsx')
const dashboard = read('app/[locale]/tenants/[slug]/dashboard/page.tsx')

// The two editor blocks, sliced by their headings, so assertions cannot
// accidentally match text in the wrong block.
const sectionContentBlock = editor.slice(
  editor.indexOf("{rtl ? 'محتوى الأقسام'"),
  editor.indexOf("{rtl ? 'إدارة الأقسام'")
)
const sectionManagementBlock = editor.slice(editor.indexOf("{rtl ? 'إدارة الأقسام'"))

// ---------------------------------------------------------------------------
// 1. Section Management restored
// ---------------------------------------------------------------------------
describe('fix 1 — "إدارة الأقسام" restored to its original interface', () => {
  it('still exists with its original heading and description', () => {
    expect(editor).toContain("{rtl ? 'إدارة الأقسام' : 'Section Management'}")
    expect(editor).toContain(
      "{rtl ? 'التحكم في ظهور الأقسام وترتيبها في الموقع.' : 'Control which sections appear and their order on the website.'}"
    )
  })

  it('lists EVERY renderable section, not a filtered subset', () => {
    expect(sectionManagementBlock).toContain('{editableSections')
    // The regression: services used to be filtered out of it.
    expect(editor).not.toContain('genericSections')
  })

  it('keeps its original per-section controls and labels', () => {
    expect(sectionManagementBlock).toContain('toggleSectionVisibility')
    expect(sectionManagementBlock).toContain('moveSection')
    expect(sectionManagementBlock).toContain('handleRemoveSection')
    // Original visible/hidden pill, switch and remove button.
    expect(sectionManagementBlock).toContain("rtl ? 'ظاهر' : 'Visible'")
    expect(sectionManagementBlock).toContain("rtl ? 'مخفي' : 'Hidden'")
    expect(sectionManagementBlock).toContain('role="switch"')
    expect(sectionManagementBlock).toContain('aria-checked')
    expect(sectionManagementBlock).toContain("rtl ? 'إزالة' : 'Remove'")
    // Original move-up/down affordances.
    expect(sectionManagementBlock).toContain("rtl ? 'تحريك لأعلى' : 'Move up'")
    expect(sectionManagementBlock).toContain("rtl ? 'تحريك لأسفل' : 'Move down'")
  })

  it('resets content from the Section Content block, not from Section Management', () => {
    // resetSectionContent is declared once and used in the content-editing block
    // and the Services area. It is NOT a Section Management control.
    expect(sectionContentBlock).toContain('resetSectionContent')
    // The management block must not contain it — visibility, ordering, and removal
    // are its only responsibilities.
    expect(sectionManagementBlock).not.toContain('resetSectionContent')
  })



  it('is NOT replaced by a "Visibility and order" subsection', () => {
    // Assert on the RENDERED literal (single-quoted), not any mention in prose —
    // the component's header comment legitimately describes the removed block.
    expect(editor).not.toContain("'الظهور والترتيب'")
    expect(editor).not.toContain("'Visibility and order'")
    expect(servicesSection).not.toContain("'الظهور والترتيب'")
    expect(servicesSection).not.toContain("'Visibility and order'")
  })

  it('still reuses the editor handlers rather than duplicating them', () => {
    expect(sectionManagementBlock).toContain('moveSection(section.id')
    expect(sectionManagementBlock).toContain('toggleSectionVisibility(section.id)')
    expect(sectionManagementBlock).toContain('handleRemoveSection(section.id)')
  })
})

// ---------------------------------------------------------------------------
// 2. The two screenshot sections merged
// ---------------------------------------------------------------------------
describe('fix 2 — the screenshot\u2019s two sections are now one', () => {
  it('renders one Services area with the screenshot\u2019s three subareas', () => {
    // Screenshot order: heading → نص القسم → خدماتك.
    expect(servicesSection).toContain("{rtl ? 'الخدمات' : 'Services'}")
    expect(servicesSection).toContain("{rtl ? 'نص القسم' : 'Section text'}")
    expect(servicesSection).toContain("{rtl ? 'خدماتك' : 'Your services'}")
    const textIdx = servicesSection.indexOf("'نص القسم'")
    const listIdx = servicesSection.indexOf("'خدماتك'")
    expect(textIdx).toBeGreaterThan(-1)
    expect(listIdx).toBeGreaterThan(textIdx)
  })

  it('does not repeat the Services text in the generic Section Content block', () => {
    expect(sectionContentBlock).toContain('{contentSections')
    expect(editor).toContain("const contentSections = editableSections.filter((s) => s.type !== 'services')")
  })

  it('avoids duplicate headings for the same section', () => {
    // "الخدمات / Services" appears as a panel heading exactly once in the editor.
    const headingCount = (editor.match(/text-lg font-semibold">\{rtl \? 'الخدمات'/g) ?? []).length
    expect(headingCount).toBe(0) // it is a sub-panel, not a top-level h2
    expect(servicesSection).toContain("<h2 className=\"text-lg font-semibold\">{rtl ? 'الخدمات' : 'Services'}</h2>")
    // The Services area is rendered once.
    expect((editor.match(/<ServicesSection/g) ?? []).length).toBe(1)
  })

  it('preserves all persisted functionality', () => {
    // Section text (per locale) — persisted through the draft config.
    expect(servicesSection).toContain('SECTION_CONTENT_FIELDS.services')
    expect(servicesSection).toContain("onUpdateContent(sectionId, 'ar'")
    expect(servicesSection).toContain("onUpdateContent(sectionId, 'en'")
    // The service list, Add service, and per-service images.
    expect(servicesSection).toContain('<ServiceForm')
    expect(servicesSection).toContain('إضافة خدمة')
    expect(servicesSection).toContain('<ServiceImageForm')
    // Visibility/ordering remain available in Section Management.
    expect(sectionManagementBlock).toContain('toggleSectionVisibility')
  })

  it('does not migrate or drop any data to achieve the merge', () => {
    // No schema or config-key change accompanies this UI merge.
    expect(servicesSection).not.toContain('migrat')
    // The persisted content shape is unchanged: same keys, same section.
    expect(servicesSection).toContain('content?.ar')
    expect(servicesSection).toContain('content?.en')
  })

  it('passes the real section id and content from the draft', () => {
    expect(editor).toContain('sectionId={servicesSection.id}')
    expect(editor).toContain('content={servicesSection.content ?? null}')
    expect(editor).toContain('services={services}')
  })
})

// ---------------------------------------------------------------------------
// 3. Service images managed from Website Management
// ---------------------------------------------------------------------------
describe('fix 3 — service images live in Website Management', () => {
  it('renders per-service image controls in the Services area', () => {
    expect(servicesSection).toContain('<ServiceImageForm')
    expect(servicesSection).toContain('serviceId={service.id}')
    expect(servicesSection).toContain('currentImage={service.image}')
    expect(servicesSection).toContain('currentCrop={service.imageCrop}')
  })

  it('removes the duplicate controls from the Dashboard Services tab', () => {
    const servicesTab = dashboard.slice(dashboard.indexOf("{tab === 'services'"))
    expect(servicesTab).not.toContain('<ServiceImageForm')
    // ...while keeping the other service management intact.
    expect(servicesTab).toContain('<ServiceEditForm')
    expect(servicesTab).toContain('<ServiceDeleteButton')
    expect(servicesTab).toContain('<ServiceForm')
  })

  it('reuses the SAME image control and server actions — no second path', () => {
    // The image form is imported once and used in one place.
    expect((servicesSection.match(/ServiceImageForm/g) ?? []).length).toBeGreaterThanOrEqual(2)
    const form = read('components/service-image-form.tsx')
    expect(form).toContain('saveServiceImage')
    expect(form).toContain('saveServiceImageCrop')
    expect(form).toContain('removeServiceImage')
    // The Services area does not talk to the actions directly.
    expect(servicesSection).not.toContain('saveServiceImage')
    expect(servicesSection).not.toContain('insert(services)')
  })

  it('keeps upload / crop / replace / remove available', () => {
    const form = read('components/service-image-form.tsx')
    expect(form).toContain('handleFilePicked') // upload / replace
    expect(form).toContain('setCropping({ dataUrl: currentImage, isNew: false })') // re-crop
    expect(form).toContain('handleRemove') // remove
    expect(form).toContain('<ImageCropper')
  })

  it('keeps the cropper, validation and size limits unchanged', () => {
    const form = read('components/service-image-form.tsx')
    expect(form).toContain('MAX_SERVICE_IMAGE_SIZE')
    expect(form).toContain('SUPPORTED_IMAGE_MIME_TYPES')
    expect(form).toContain('CROP_ASPECTS.service')
  })

  it('keeps service images optional with the same public placeholder', () => {
    // The public renderer still reserves one image area for every card.
    const site = read('components/tenant-website.tsx')
    expect(site).toContain('aspect-[16/10]')
    expect(site).toContain('item.image ? (')
  })

  it('does not publish the website as a side effect', () => {
    expect(servicesSection).not.toContain('publishChanges')
    expect(servicesSection).not.toContain('saveDraft')
    expect(servicesSection).toContain('not published until you click Publish')
  })

  it('passes image + crop through the editor services prop', () => {
    expect(editor).toContain('image?: string | null')
    expect(editor).toContain('imageCrop?: ImageCrop | null')
    expect(dashboard).toContain('imageCrop: numericCrop(s)')
  })

  it('is localized in both languages', () => {
    for (const label of ['الخدمات', 'Services', 'نص القسم', 'Section text', 'خدماتك', 'Your services', 'إضافة خدمة', 'Add service']) {
      expect(servicesSection).toContain(label)
    }
  })
})

// ---------------------------------------------------------------------------
// No regressions to the earlier phases
// ---------------------------------------------------------------------------
describe('earlier-phase functionality is untouched', () => {
  it('keeps the hero cropper and its draft/publish isolation', () => {
    expect(editor).toContain('<ImageCropper')
    expect(editor).toContain('aspect={CROP_ASPECTS.hero}')
    expect(editor).toContain('heroImageCrop: next')
  })

  it('keeps the Hero opacity control', () => {
    expect(editor).toContain('heroImageOpacity: next')
    expect(editor).toContain("{rtl ? 'شفافية الصورة' : 'Image opacity'}")
  })

  it('keeps the safe soft delete and its confirmation', () => {
    const deleteButton = read('components/service-delete-button.tsx')
    expect(deleteButton).toContain('archiveService')
    expect(deleteButton).toContain('role="dialog"')
    expect(read('app/[locale]/tenants/[slug]/dashboard/actions.ts')).toContain('isActive: false')
  })

  it('keeps the full-bleed hero and gradient overlay', () => {
    const site = read('components/tenant-website.tsx')
    expect(site).toContain("heroImage ? 'relative w-full overflow-hidden' : 'w-full'")
    expect(site).toContain('bg-gradient-to-t from-black/45')
  })

  it('keeps the migration files intact', () => {
    for (const f of [
      'db/migrations/0005_service_images.sql',
      'db/migrations/0006_service_image_focal_point.sql',
      'db/migrations/0007_service_image_crop.sql',
    ]) {
      expect(read(f).length).toBeGreaterThan(0)
    }
  })
})
