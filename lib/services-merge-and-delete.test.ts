import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Requirements 4 and 5, plus the crop-UI contract.
 *
 * Source-level assertions: they pin the architecture (one Services area, no
 * duplicated controls, delete wired to the existing action) so it cannot
 * silently regress. They are NOT layout measurements.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')

const editor = read('components/website-editor.tsx')
const servicesSection = read('components/services-section.tsx')
const dashboard = read('app/[locale]/tenants/[slug]/dashboard/page.tsx')
const deleteButton = read('components/service-delete-button.tsx')
const serviceImageForm = read('components/service-image-form.tsx')
const actions = read('app/[locale]/tenants/[slug]/dashboard/actions.ts')

// ---------------------------------------------------------------------------
// Req 4 — one unified Services area
// ---------------------------------------------------------------------------
describe('req 4 — the two Services sections are merged into one', () => {
  it('renders exactly one Services area', () => {
    expect(editor).toContain('<ServicesSection')
    // The old separate panel is gone.
    expect(existsSync(resolve(process.cwd(), 'components/website-services-panel.tsx'))).toBe(false)
    expect(editor).not.toContain('WebsiteServicesPanel')
    expect(dashboard).not.toContain('WebsiteServicesPanel')
  })

  it('keeps Section Management listing EVERY section, services included', () => {
    // Restored behaviour: Section Management is the original interface and owns
    // visibility/ordering for all sections.
    expect(editor).toContain("const editableSections = config.sections.filter((s) => isRenderableSectionType(s.type))")
    const managementBlock = editor.slice(editor.indexOf("accordion('sections'"))
    expect(managementBlock).toContain('{editableSections')
    // It is NOT filtered to exclude services.
    expect(editor).not.toContain('genericSections')
  })

  it('edits the Services text in Section Content, which lists every section', () => {
    // The Services section's text is edited by the generic Section Content
    // accordion, which now lists EVERY renderable section — services included.
    // One editor per field: the text is not repeated in the services list panel.
    expect(editor).not.toContain("editableSections.filter((s) => s.type !== 'services')")
    const contentBlock = editor.slice(
      editor.indexOf("accordion('content'"),
      editor.indexOf("accordion('services'")
    )
    expect(contentBlock).toContain('{editableSections')
  })

  it('preserves every control that existed before the merge', () => {
    // The service list + add
    expect(servicesSection).toContain('<ServiceForm')
    expect(servicesSection).toContain('إضافة خدمة')
    expect(servicesSection).toContain('Add service')
    // Per-service image management
    expect(servicesSection).toContain('<ServiceImageForm')
    // The Services section TEXT is still editable — through the shared
    // SECTION_CONTENT_FIELDS contract rendered by Section Content.
    expect(editor).toContain('SECTION_CONTENT_FIELDS[section.type]')
    expect(editor).toContain('updateSectionContent')
    expect(editor).toContain('resetSectionContent')
    // Visibility/ordering are NOT in the services panel — they belong to Section
    // Management, which the editor still renders for every section. Assert on the
    // rendered literal so the component's own prose is not a false positive.
    expect(servicesSection).not.toContain('onToggleVisibility')
    expect(servicesSection).not.toContain('onMove')
    expect(servicesSection).not.toContain("'الظهور والترتيب'")
    expect(servicesSection).not.toContain("'Visibility and order'")
  })

  it('keeps the section content fields driven by the shared contract', () => {
    // No hand-rolled field list that could drift from the renderer: Section
    // Content reads the shared contract for every section, services included.
    expect(editor).toContain('SECTION_CONTENT_FIELDS[section.type]')
    expect(editor).toContain('isRenderableSectionType(section.type)')
  })

  it('reuses the editor handlers rather than re-implementing them', () => {
    // The component must not own a second config-mutation path.
    expect(servicesSection).not.toContain('setConfig')
    expect(servicesSection).not.toContain('markChanged')
    expect(servicesSection).not.toContain('removeSection(')
    // The section-text handlers are declared once in the editor and used by the
    // Section Content accordion; they are not re-implemented anywhere.
    expect(editor).toContain('updateSectionContent')
    expect(editor).toContain('resetSectionContent')
    expect(servicesSection).not.toContain('updateSectionContent')
    expect(servicesSection).not.toContain('resetSectionContent')
  })

  it('restores Section Management with its own visibility/order/remove controls', () => {
    const managementBlock = editor.slice(editor.indexOf("accordion('sections'"))
    expect(managementBlock).toContain('toggleSectionVisibility')
    expect(managementBlock).toContain('moveSection')
    expect(managementBlock).toContain('handleRemoveSection')
    // The original labels are present.
    expect(managementBlock).toContain("rtl ? 'ظاهر' : 'Visible'")
    expect(managementBlock).toContain("rtl ? 'مخفي' : 'Hidden'")
    expect(managementBlock).toContain("rtl ? 'إزالة' : 'Remove'")
  })

  it('passes the real services list through', () => {
    expect(editor).toContain('services={services}')
    expect(editor).toContain('services: Service[]')
  })

  it('is localized in both languages', () => {
    for (const label of ['خدماتك', 'Your services', 'إضافة خدمة', 'Add service']) {
      expect(servicesSection).toContain(label)
    }
    // The Services section's own heading/description labels are edited through
    // the shared Section Content accordion.
    expect(editor).toContain('CONTENT_FIELD_LABELS')
  })

  it('refreshes the list after creating a service', () => {
    expect(servicesSection).toContain('router.refresh()')
    expect(servicesSection).toContain('onSuccess')
  })
})

// ---------------------------------------------------------------------------
// Req 5 — Delete instead of Archive
// ---------------------------------------------------------------------------
describe('req 5 — service Delete replaces Archive', () => {
  it('no longer shows the Archive label', () => {
    // Assert on the rendered label strings, not the whole file: the component's
    // comment legitimately names the old label when explaining the rename, so a
    // blanket `not.toContain('Archive')` would be a false positive.
    expect(deleteButton).not.toMatch(/'أرشفة'/)
    expect(deleteButton).not.toMatch(/'Archive'/)
    // It renders the Delete label in both languages instead.
    expect(deleteButton).toMatch(/'حذف'/)
    expect(deleteButton).toMatch(/'Delete'/)
    // The old component is removed.
    expect(existsSync(resolve(process.cwd(), 'components/service-archive-button.tsx'))).toBe(false)
    expect(dashboard).not.toContain('ServiceArchiveButton')
  })

  it('shows a localized Delete label with a trash icon and an accessible name', () => {
    expect(deleteButton).toContain('حذف')
    expect(deleteButton).toContain('Delete')
    expect(deleteButton).toContain('Trash2')
    expect(deleteButton).toContain('aria-label')
  })

  it('asks for confirmation before deleting', () => {
    expect(deleteButton).toContain('role="dialog"')
    expect(deleteButton).toContain('aria-modal')
    expect(deleteButton).toContain('confirming')
    expect(deleteButton).toContain('تأكيد الحذف')
    expect(deleteButton).toContain('Confirm delete')
  })

  it('reuses the EXISTING server action — no new delete path', () => {
    expect(deleteButton).toContain('archiveService')
    // No raw DB delete anywhere in the UI or the action.
    expect(deleteButton).not.toContain('db.delete')
    expect(actions).not.toContain('db.delete')
    // The action still authorizes, tenant-scopes and audits.
    expect(actions).toContain("requireTenantAccess(await headers(), input.slug, 'manager')")
    expect(actions).toContain("action: 'service.deleted'")
    expect(actions).toContain('eq(services.tenantId, access.tenant.id)')
  })

  it('is a SOFT delete, because booking_items has no ON DELETE CASCADE', () => {
    // This is the load-bearing fact: a hard DELETE would violate the FK for any
    // booked service. Assert the action only deactivates.
    expect(actions).toContain('isActive: false')
    expect(actions).toContain('deletedAt: new Date()')
    // And that the schema really does lack the cascade on booking_items.
    const init = read('db/migrations/0001_init.sql')
    const bookingItemsFk = init
      .split('\n')
      .find((l) => l.includes('FOREIGN KEY (tenant_id, service_id) REFERENCES services') && l.trim().endsWith(','))
    expect(bookingItemsFk).toBeDefined()
    expect(bookingItemsFk).not.toContain('ON DELETE CASCADE')
  })

  it('states the booking consequence in the confirmation', () => {
    expect(deleteButton).toContain('bookingCount')
    expect(deleteButton).toContain('booking history is kept intact')
    expect(deleteButton).toContain('سجلات الحجز')
  })

  it('tells the user the booking count comes from real data', () => {
    // Derived from the page's own query, not invented.
    expect(dashboard).toContain('bookingItems')
    expect(dashboard).toContain('bookingsByService')
    expect(dashboard).toContain('bookingCount={bookingsByService.get(service.id) ?? 0}')
  })

  it('surfaces success and failure feedback', () => {
    expect(deleteButton).toContain("toast('success'")
    expect(deleteButton).toContain("toast('error'")
    expect(deleteButton).toContain('disabled={pending}')
  })
})

// ---------------------------------------------------------------------------
// Req 1 — the cropper replaces the focal-point UI
// ---------------------------------------------------------------------------
describe('req 1 — cropper replaces the focal-point controls', () => {
  it('removes the focal-point UI entirely', () => {
    expect(existsSync(resolve(process.cwd(), 'components/focal-point-control.tsx'))).toBe(false)
    expect(editor).not.toContain('FocalPointControl')
    expect(serviceImageForm).not.toContain('FocalPointControl')
    expect(editor).not.toContain('setHeroFocalPoint')
  })

  it('uses the cropper for the hero AND for service images', () => {
    expect(editor).toContain('<ImageCropper')
    expect(editor).toContain('aspect={CROP_ASPECTS.hero}')
    expect(serviceImageForm).toContain('<ImageCropper')
    expect(serviceImageForm).toContain('aspect={CROP_ASPECTS.service}')
  })

  it('supports cancel, confirm and reopening an existing crop', () => {
    expect(editor).toContain('onCancel={() => setShowHeroCropper(false)}')
    expect(editor).toContain('onConfirm')
    // Reopening seeds the cropper from the stored crop.
    expect(editor).toContain('initialCrop={resolveCrop(config.theme.heroImageCrop)}')
    expect(serviceImageForm).toContain('initialCrop={cropping.isNew ? null : resolveCrop(currentCrop)}')
  })

  it('offers localized Crop / Cancel / Zoom / Reset labels', () => {
    const cropper = read('components/image-cropper.tsx')
    for (const label of ['اقتصاص', 'Crop', 'إلغاء', 'Cancel', 'تكبير', 'Zoom', 'إعادة تعيين', 'Reset']) {
      expect(cropper).toContain(label)
    }
  })

  it('is keyboard accessible', () => {
    const cropper = read('components/image-cropper.tsx')
    expect(cropper).toContain('onKeyDown')
    expect(cropper).toContain('ArrowLeft')
    expect(cropper).toContain("case 'Home'")
    expect(cropper).toContain('tabIndex={0}')
    expect(cropper).toContain('role="dialog"')
    expect(cropper).toContain('aria-modal')
  })

  it('supports pointer/touch dragging', () => {
    const cropper = read('components/image-cropper.tsx')
    expect(cropper).toContain('onPointerDown')
    expect(cropper).toContain('onPointerMove')
    expect(cropper).toContain('setPointerCapture')
    expect(cropper).toContain('touch-none')
  })

  it('does not save anything until the crop is confirmed', () => {
    // Picking a file only opens the cropper; the save happens on confirm.
    expect(serviceImageForm).toContain('setCropping({ dataUrl, isNew: true })')
    // Cancel just closes.
    expect(serviceImageForm).toContain('onCancel={() => setCropping(null)}')
  })

  it('keeps the existing upload validation unchanged', () => {
    expect(serviceImageForm).toContain('SUPPORTED_IMAGE_MIME_TYPES')
    expect(serviceImageForm).toContain('MAX_SERVICE_IMAGE_SIZE')
    expect(editor).toContain('MAX_HERO_IMAGE_SIZE')
  })

  it('removes the hero crop and its dependent settings together', () => {
    expect(editor).toContain('heroImageCrop: undefined')
    expect(editor).toContain('heroImageOpacity: undefined')
    expect(editor).toContain('heroImageFocalPoint: undefined')
  })
})

// ---------------------------------------------------------------------------
// Legacy compatibility
// ---------------------------------------------------------------------------
describe('legacy focal-point data is retained internally, not deleted', () => {
  it('keeps the already-applied migration files intact', () => {
    // Never rewrite migration history to remove a shipped feature.
    expect(existsSync(resolve(process.cwd(), 'db/migrations/0006_service_image_focal_point.sql'))).toBe(true)
    expect(existsSync(resolve(process.cwd(), 'db/migrations/0005_service_images.sql'))).toBe(true)
  })

  it('keeps the legacy columns in the schema', () => {
    const schema = read('lib/db/schema.ts')
    expect(schema).toContain("imageFocalX: smallint('image_focal_x')")
    expect(schema).toContain("imageFocalY: smallint('image_focal_y')")
  })

  it('keeps the focal-point helpers for stored configs and legacy rows', () => {
    const focal = read('lib/image-focal-point.ts')
    expect(focal).toContain('export function resolveFocalPoint')
    expect(focal).toContain('export function focalPointToCss')
    // The legacy render path is still wired into the hero.
    expect(read('components/tenant-website.tsx')).toContain('heroFocalCss')
  })
})
