import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  parseWebsiteConfig,
  safeParseWebsiteConfig,
  createDefaultWebsiteConfig,
  websiteConfigSchema,
  websiteSectionType,
  resolveOrderedSectionTypes,
  isRenderableSectionType,
  RENDERABLE_SECTION_TYPES,
  SECTION_CONTENT_FIELDS,
  SECTION_CONTENT_MAX_VALUE_LENGTH,
  SECTION_CONTENT_MAX_KEYS,
  type WebsiteConfig,
} from './website-config'

describe('website-config validation', () => {
  describe('parseWebsiteConfig', () => {
    it('accepts a valid configuration', () => {
      const input = {
        theme: { primaryColor: '#FF0000' },
        sections: [
          {
            id: 'sec_1',
            type: 'hero',
            variant: 'centered',
            isVisible: true,
            sortOrder: 0,
            content: { ar: { title: 'مرحبا' }, en: { title: 'Hello' } },
          },
        ],
      }
      const result = parseWebsiteConfig(input)
      expect(result.sections).toHaveLength(1)
      expect(result.sections[0].type).toBe('hero')
      expect(result.theme.primaryColor).toBe('#FF0000')
    })

    it('applies default values for optional fields', () => {
      const input = {
        theme: {},
        sections: [
          {
            id: 'sec_1',
            type: 'services',
            content: {},
          },
        ],
      }
      const result = parseWebsiteConfig(input)
      expect(result.sections[0].variant).toBe('default')
      expect(result.sections[0].isVisible).toBe(true)
      expect(result.sections[0].sortOrder).toBe(0)
    })

    it('rejects invalid section types', () => {
      const input = {
        theme: {},
        sections: [{ id: 'sec_1', type: 'invalid_type', content: {} }],
      }
      expect(() => parseWebsiteConfig(input)).toThrow()
    })

    it('rejects invalid color format', () => {
      const input = {
        theme: { primaryColor: 'red' },
        sections: [],
      }
      expect(() => parseWebsiteConfig(input)).toThrow()
    })

    it('rejects more than 20 sections', () => {
      const sections = Array.from({ length: 21 }, (_, i) => ({
        id: `sec_${i}`,
        type: 'hero' as const,
        content: {},
      }))
      const input = { theme: {}, sections }
      expect(() => parseWebsiteConfig(input)).toThrow()
    })

    it('rejects missing section id', () => {
      const input = {
        theme: {},
        sections: [{ type: 'hero', content: {} }],
      }
      expect(() => parseWebsiteConfig(input)).toThrow()
    })

    it('rejects non-object input', () => {
      expect(() => parseWebsiteConfig(null)).toThrow()
      expect(() => parseWebsiteConfig('string')).toThrow()
      expect(() => parseWebsiteConfig(42)).toThrow()
    })
  })

  describe('safeParseWebsiteConfig', () => {
    it('returns the config for valid input', () => {
      const input = { theme: {}, sections: [] }
      const result = safeParseWebsiteConfig(input)
      expect(result).not.toBeNull()
      expect(result?.sections).toEqual([])
    })

    it('returns null for invalid input', () => {
      const result = safeParseWebsiteConfig({ sections: 'not-an-array' })
      expect(result).toBeNull()
    })

    it('returns null for null/undefined', () => {
      expect(safeParseWebsiteConfig(null)).toBeNull()
      expect(safeParseWebsiteConfig(undefined)).toBeNull()
    })
  })

  describe('createDefaultWebsiteConfig', () => {
    it('creates a config with hero, services and contact sections', () => {
      const config = createDefaultWebsiteConfig()
      expect(config.sections).toHaveLength(3)
      expect(config.sections[0].type).toBe('hero')
      expect(config.sections[1].type).toBe('services')
      // Contact defaults after Services and before the Footer.
      expect(config.sections[2].type).toBe('contact')
      expect(config.sections[0].isVisible).toBe(true)
      expect(config.sections[1].isVisible).toBe(true)
    })

    it('has empty theme overrides', () => {
      const config = createDefaultWebsiteConfig()
      expect(config.theme).toEqual({})
    })

    it('has valid section IDs', () => {
      const config = createDefaultWebsiteConfig()
      config.sections.forEach((s) => {
        expect(s.id).toBeTruthy()
        expect(s.id.length).toBeGreaterThan(0)
      })
    })
  })

  describe('websiteConfigSchema', () => {
    it('is a Zod object schema', () => {
      expect(websiteConfigSchema).toBeDefined()
      expect(typeof websiteConfigSchema.parse).toBe('function')
    })
  })

  // -------------------------------------------------------------------------
  // Shared renderer section resolution.
  // Both the live public website and the draft preview call this to decide
  // which sections render and in what order.
  // -------------------------------------------------------------------------
  describe('resolveOrderedSectionTypes', () => {
    const makeConfig = (
      sections: Array<{ type: WebsiteConfig['sections'][number]['type']; isVisible: boolean; sortOrder: number }>
    ): WebsiteConfig =>
      parseWebsiteConfig({
        theme: {},
        sections: sections.map((s, i) => ({
          id: `sec_${i}`,
          type: s.type,
          isVisible: s.isVisible,
          sortOrder: s.sortOrder,
          content: {},
        })),
      })

    it('returns the legacy default order when no config exists', () => {
      expect(resolveOrderedSectionTypes(null)).toEqual(['hero', 'services', 'contact'])
    })

    it('returns visible sections ordered by sortOrder', () => {
      const config = makeConfig([
        { type: 'services', isVisible: true, sortOrder: 1 },
        { type: 'hero', isVisible: true, sortOrder: 0 },
      ])
      expect(resolveOrderedSectionTypes(config)).toEqual(['hero', 'services'])
    })

    it('honors reversed ordering', () => {
      const config = makeConfig([
        { type: 'hero', isVisible: true, sortOrder: 5 },
        { type: 'services', isVisible: true, sortOrder: 1 },
      ])
      expect(resolveOrderedSectionTypes(config)).toEqual(['services', 'hero'])
    })

    it('excludes explicitly hidden sections', () => {
      const config = makeConfig([
        { type: 'hero', isVisible: true, sortOrder: 0 },
        { type: 'services', isVisible: false, sortOrder: 1 },
      ])
      expect(resolveOrderedSectionTypes(config)).toEqual(['hero'])
    })

    it('returns an empty array when every section is hidden', () => {
      const config = makeConfig([
        { type: 'hero', isVisible: false, sortOrder: 0 },
        { type: 'services', isVisible: false, sortOrder: 1 },
      ])
      expect(resolveOrderedSectionTypes(config)).toEqual([])
    })

    it('does not mutate the input config order', () => {
      const config = makeConfig([
        { type: 'services', isVisible: true, sortOrder: 9 },
        { type: 'hero', isVisible: true, sortOrder: 0 },
      ])
      const originalOrder = config.sections.map((s) => s.type)
      resolveOrderedSectionTypes(config)
      expect(config.sections.map((s) => s.type)).toEqual(originalOrder)
    })

    it('drops section types that have no renderer', () => {
      const config = makeConfig([
        { type: 'hero', isVisible: true, sortOrder: 0 },
        { type: 'team', isVisible: true, sortOrder: 1 },
        { type: 'about', isVisible: true, sortOrder: 2 },
        { type: 'contact', isVisible: true, sortOrder: 3 },
      ])
      // Only hero is renderable and visible; unsupported types are excluded so
      // they cannot silently produce an incomplete website.
      expect(resolveOrderedSectionTypes(config)).toEqual(['hero'])
    })

    it('returns an empty array when only unsupported sections are present', () => {
      const config = makeConfig([{ type: 'team', isVisible: true, sortOrder: 0 }])
      expect(resolveOrderedSectionTypes(config)).toEqual([])
    })

    it('keeps supported sections interleaved with unsupported ones in order', () => {
      const config = makeConfig([
        { type: 'services', isVisible: true, sortOrder: 0 },
        { type: 'about', isVisible: true, sortOrder: 1 },
        { type: 'hero', isVisible: true, sortOrder: 2 },
      ])
      expect(resolveOrderedSectionTypes(config)).toEqual(['services', 'hero'])
    })
  })

  // -------------------------------------------------------------------------
  // Renderable section types.
  // -------------------------------------------------------------------------
  describe('isRenderableSectionType', () => {
    it('accepts hero and services', () => {
      expect(isRenderableSectionType('hero')).toBe(true)
      expect(isRenderableSectionType('services')).toBe(true)
    })

    it('rejects schema-valid but unrendered types', () => {
      expect(isRenderableSectionType('team')).toBe(false)
      expect(isRenderableSectionType('about')).toBe(false)
      // `contact` gained a renderer in this phase, so it is now renderable.
      expect(isRenderableSectionType('contact')).toBe(true)
    })

    it('rejects arbitrary strings', () => {
      expect(isRenderableSectionType('nope')).toBe(false)
      expect(isRenderableSectionType('')).toBe(false)
    })

    it('agrees with the schema enum for every renderable type', () => {
      for (const type of RENDERABLE_SECTION_TYPES) {
        expect(websiteSectionType.options).toContain(type)
      }
    })
  })

  // -------------------------------------------------------------------------
  // Editable section content: server-side bounds.
  // -------------------------------------------------------------------------
  describe('section content bounds', () => {
    const makeSection = (content: unknown) => ({
      theme: {},
      sections: [{ id: 'sec_1', type: 'hero' as const, content }],
    })

    it('accepts bilingual content within limits', () => {
      const result = parseWebsiteConfig(
        makeSection({
          ar: { headline: 'عنوان', subtitle: 'وصف' },
          en: { headline: 'Headline', subtitle: 'Description' },
        })
      )
      expect(result.sections[0].content.ar?.headline).toBe('عنوان')
      expect(result.sections[0].content.en?.headline).toBe('Headline')
    })

    it('rejects a value longer than the max length', () => {
      const tooLong = 'a'.repeat(SECTION_CONTENT_MAX_VALUE_LENGTH + 1)
      expect(() => parseWebsiteConfig(makeSection({ en: { headline: tooLong } }))).toThrow()
    })

    it('accepts a value exactly at the max length', () => {
      const atLimit = 'a'.repeat(SECTION_CONTENT_MAX_VALUE_LENGTH)
      const result = parseWebsiteConfig(makeSection({ en: { subtitle: atLimit } }))
      expect(result.sections[0].content.en?.subtitle).toHaveLength(SECTION_CONTENT_MAX_VALUE_LENGTH)
    })

    it('rejects more content keys than allowed per locale', () => {
      const manyKeys: Record<string, string> = {}
      for (let i = 0; i <= SECTION_CONTENT_MAX_KEYS; i++) manyKeys[`k${i}`] = 'v'
      expect(() => parseWebsiteConfig(makeSection({ en: manyKeys }))).toThrow()
    })

    it('rejects a non-string content value', () => {
      expect(() => parseWebsiteConfig(makeSection({ en: { headline: 42 } }))).toThrow()
    })

    it('stays backward compatible with empty content objects', () => {
      const result = parseWebsiteConfig(makeSection({ ar: {}, en: {} }))
      expect(result.sections[0].content).toEqual({ ar: {}, en: {} })
    })

    it('stays backward compatible when content is omitted entirely', () => {
      const result = parseWebsiteConfig({
        theme: {},
        sections: [{ id: 'sec_1', type: 'services' }],
      })
      expect(result.sections[0].content).toEqual({})
    })
  })

  // -------------------------------------------------------------------------
  // SECTION_CONTENT_FIELDS: the editor/renderer contract.
  // -------------------------------------------------------------------------
  describe('SECTION_CONTENT_FIELDS', () => {
    it('defines fields for every renderable section type', () => {
      for (const type of RENDERABLE_SECTION_TYPES) {
        expect(SECTION_CONTENT_FIELDS[type]).toBeDefined()
        expect(SECTION_CONTENT_FIELDS[type].length).toBeGreaterThan(0)
      }
    })

    it('only exposes hero, services and contact', () => {
      expect(Object.keys(SECTION_CONTENT_FIELDS).sort()).toEqual(['contact', 'hero', 'services'])
    })

    it('keeps every field maxLength within the server-side value bound', () => {
      for (const fields of Object.values(SECTION_CONTENT_FIELDS)) {
        for (const field of fields) {
          expect(field.maxLength).toBeGreaterThan(0)
          expect(field.maxLength).toBeLessThanOrEqual(SECTION_CONTENT_MAX_VALUE_LENGTH)
        }
      }
    })

    it('has unique field keys within each section', () => {
      for (const fields of Object.values(SECTION_CONTENT_FIELDS)) {
        const keys = fields.map((f) => f.key)
        expect(new Set(keys).size).toBe(keys.length)
      }
    })

    it('produces configs the schema accepts for every declared field', () => {
      for (const [type, fields] of Object.entries(SECTION_CONTENT_FIELDS)) {
        const ar: Record<string, string> = {}
        const en: Record<string, string> = {}
        for (const field of fields) {
          ar[field.key] = 'ن'.repeat(Math.min(field.maxLength, 10))
          en[field.key] = 'x'.repeat(Math.min(field.maxLength, 10))
        }
        const result = parseWebsiteConfig({
          theme: {},
          sections: [{ id: 'sec_1', type, content: { ar, en } }],
        })
        expect(result.sections[0].content.ar).toEqual(ar)
      }
    })
  })
})
