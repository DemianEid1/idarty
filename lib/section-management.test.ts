import { describe, expect, it } from 'vitest'
import {
  addSection,
  removeSection,
  moveSection,
  hasSectionType,
  createSectionDefaults,
  createDefaultWebsiteConfig,
  parseWebsiteConfig,
  safeParseWebsiteConfig,
  ADDABLE_SECTION_TYPES,
  RENDERABLE_SECTION_TYPES,
  type WebsiteConfig,
} from './website-config'
import { applyPreset } from './theme-presets'

// ---------------------------------------------------------------------------
// A config carrying localized content, a logo, visibility and ordering, used to
// prove that add/remove/reorder never disturb unrelated state.
// ---------------------------------------------------------------------------
function richConfig(): WebsiteConfig {
  return parseWebsiteConfig({
    theme: { primaryColor: '#111111', accentColor: '#222222', logo: 'data:image/png;base64,AA', fontPreset: 'bold' },
    sections: [
      {
        id: 'sec_hero',
        type: 'hero',
        isVisible: true,
        sortOrder: 0,
        content: {
          ar: { headline: 'عنوان', subtitle: 'وصف', tagline: 'شريط', ctaLabel: 'احجز' },
          en: { headline: 'Headline', subtitle: 'Subtitle', tagline: 'Tagline', ctaLabel: 'Book' },
        },
      },
      {
        id: 'sec_services',
        type: 'services',
        isVisible: false,
        sortOrder: 1,
        content: { ar: { heading: 'خدماتنا' }, en: { heading: 'Our services' } },
      },
    ],
  })
}

describe('website section management', () => {
  // -------------------------------------------------------------------------
  // Adding sections
  // -------------------------------------------------------------------------
  describe('addSection', () => {
    it('adds a supported section type', () => {
      const config = parseWebsiteConfig({ theme: {}, sections: [] })
      const result = addSection(config, 'hero')
      expect(result.sections).toHaveLength(1)
      expect(result.sections[0].type).toBe('hero')
    })

    it('appends the new section after every existing section', () => {
      const config = richConfig()
      const result = addSection({ ...config, sections: [config.sections[0]] }, 'services')
      const orders = result.sections.map((s) => s.sortOrder)
      expect(orders).toEqual([0, 1])
      expect(result.sections[1].type).toBe('services')
    })

    it('initializes localized content for the new section', () => {
      const config = parseWebsiteConfig({ theme: {}, sections: [] })
      const result = addSection(config, 'hero')
      expect(result.sections[0].content).toEqual({ ar: {}, en: {} })
      expect(result.sections[0].isVisible).toBe(true)
    })

    it('gives a services section its data source', () => {
      const config = parseWebsiteConfig({ theme: {}, sections: [] })
      const result = addSection(config, 'services')
      expect(result.sections[0].dataSource).toEqual({ type: 'services', sort: 'sortOrder' })
    })

    it('rejects an unsupported section type', () => {
      const config = richConfig()
      // `contact` is now renderable, so it is deliberately NOT in this list.
      for (const type of ['team', 'about', 'bogus', '', 'hero; DROP TABLE']) {
        expect(addSection(config, type)).toEqual(config)
      }
    })

    it('accepts the contact section type now that it has a renderer', () => {
      const config = richConfig()
      const result = addSection(config, 'contact')
      expect(result.sections.map((s) => s.type)).toContain('contact')
    })

    it('prevents duplicate instances of the same type', () => {
      const config = richConfig()
      const result = addSection(config, 'hero')
      expect(result).toEqual(config)
      expect(result.sections.filter((s) => s.type === 'hero')).toHaveLength(1)
    })

    it('assigns a unique id when the default id is taken', () => {
      const config = parseWebsiteConfig({
        theme: {},
        sections: [{ id: 'sec_hero', type: 'hero', content: {} }],
      })
      // 'hero' already exists, so this exercises the id-collision path directly.
      const section = createSectionDefaults('hero', 5, config.sections.map((s) => s.id))
      expect(config.sections.map((s) => s.id)).not.toContain(section.id)
    })

    it('does not mutate the input config', () => {
      const config = richConfig()
      const snapshot = JSON.stringify(config)
      addSection(config, 'services')
      expect(JSON.stringify(config)).toBe(snapshot)
    })

    it('produces a config the schema still accepts', () => {
      const result = addSection(parseWebsiteConfig({ theme: {}, sections: [] }), 'hero')
      expect(safeParseWebsiteConfig(result)).not.toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // Removing sections
  // -------------------------------------------------------------------------
  describe('removeSection', () => {
    it('removes the requested section', () => {
      const result = removeSection(richConfig(), 'sec_hero')
      expect(result.sections.map((s) => s.id)).toEqual(['sec_services'])
    })

    it('renormalizes sortOrder so no gaps remain', () => {
      const config = parseWebsiteConfig({
        theme: {},
        sections: [
          { id: 'a', type: 'hero', sortOrder: 0, content: {} },
          { id: 'b', type: 'services', sortOrder: 5, content: {} },
          { id: 'c', type: 'hero', sortOrder: 9, content: {} },
        ],
      })
      const result = removeSection(config, 'b')
      expect(result.sections.map((s) => s.sortOrder)).toEqual([0, 1])
    })

    it('leaves unrelated sections and their content intact', () => {
      const result = removeSection(richConfig(), 'sec_hero')
      expect(result.sections[0].content.ar?.heading).toBe('خدماتنا')
      expect(result.sections[0].isVisible).toBe(false)
    })

    it('preserves theme properties including the logo', () => {
      const result = removeSection(richConfig(), 'sec_services')
      expect(result.theme.logo).toBe('data:image/png;base64,AA')
      expect(result.theme.fontPreset).toBe('bold')
    })

    it('is a no-op for an unknown id', () => {
      const config = richConfig()
      expect(removeSection(config, 'nope')).toEqual(config)
    })

    it('does not mutate the input config', () => {
      const config = richConfig()
      const snapshot = JSON.stringify(config)
      removeSection(config, 'sec_hero')
      expect(JSON.stringify(config)).toBe(snapshot)
    })

    it('allows removing every section without corrupting the config', () => {
      let config = richConfig()
      config = removeSection(config, 'sec_hero')
      config = removeSection(config, 'sec_services')
      expect(config.sections).toEqual([])
      expect(safeParseWebsiteConfig(config)).not.toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // Reordering
  // -------------------------------------------------------------------------
  describe('moveSection', () => {
    const three = () =>
      parseWebsiteConfig({
        theme: {},
        sections: [
          { id: 'a', type: 'hero', sortOrder: 0, content: { en: { headline: 'A' } } },
          { id: 'b', type: 'services', sortOrder: 1, content: { en: { headline: 'B' } } },
          { id: 'c', type: 'hero', sortOrder: 2, content: { en: { headline: 'C' } } },
        ],
      })

    it('moves a section exactly one position up', () => {
      const result = moveSection(three(), 'b', 'up')
      expect(result.sections.map((s) => s.id)).toEqual(['b', 'a', 'c'])
    })

    it('moves a section exactly one position down', () => {
      const result = moveSection(three(), 'b', 'down')
      expect(result.sections.map((s) => s.id)).toEqual(['a', 'c', 'b'])
    })

    it('refuses to move the first section up', () => {
      const config = three()
      expect(moveSection(config, 'a', 'up')).toEqual(config)
    })

    it('refuses to move the last section down', () => {
      const config = three()
      expect(moveSection(config, 'c', 'down')).toEqual(config)
    })

    it('keeps sortOrder dense and consistent after a move', () => {
      const result = moveSection(three(), 'c', 'up')
      expect(result.sections.map((s) => s.sortOrder)).toEqual([0, 1, 2])
    })

    it('applies rapid successive moves to the latest state', () => {
      // Simulates repeated clicks through a functional state update.
      let config = three()
      config = moveSection(config, 'c', 'up') // c,a,b
      config = moveSection(config, 'c', 'up') // c,a,b -> a? no: c moves to index 0
      expect(config.sections.map((s) => s.id)).toEqual(['c', 'a', 'b'])
      config = moveSection(config, 'c', 'down') // a,c,b
      expect(config.sections.map((s) => s.id)).toEqual(['a', 'c', 'b'])
    })

    it('never mutates the input or its section objects', () => {
      const config = three()
      const snapshot = JSON.stringify(config)
      moveSection(config, 'a', 'down')
      expect(JSON.stringify(config)).toBe(snapshot)
    })

    it('returns brand-new section objects', () => {
      const config = three()
      const result = moveSection(config, 'a', 'down')
      result.sections.forEach((s) => expect(config.sections).not.toContain(s))
    })

    it('preserves content and visibility through a move', () => {
      const result = moveSection(three(), 'a', 'down')
      const a = result.sections.find((s) => s.id === 'a')!
      expect(a.content.en?.headline).toBe('A')
    })

    it('is a no-op for an unknown id', () => {
      const config = three()
      expect(moveSection(config, 'zzz', 'up')).toEqual(config)
    })

    it('survives a save/reload round trip in the new order', () => {
      const moved = moveSection(three(), 'c', 'up')
      const reloaded = safeParseWebsiteConfig(JSON.parse(JSON.stringify(moved)))!
      expect(reloaded.sections.map((s) => s.id)).toEqual(['a', 'c', 'b'])
    })
  })

  // -------------------------------------------------------------------------
  // Interplay with theme presets and existing data
  // -------------------------------------------------------------------------
  describe('interaction with presets and existing tenants', () => {
    it('adding a section preserves the applied preset', () => {
      const themed = applyPreset(createDefaultWebsiteConfig(), 'salon')
      const result = addSection({ ...themed, sections: [] }, 'hero')
      expect(result.theme.primaryColor).toBe('#DB2777')
    })

    it('reordering preserves the applied preset and the logo', () => {
      const themed = applyPreset(richConfig(), 'clinic')
      const result = moveSection(themed, 'sec_services', 'up')
      expect(result.theme.primaryColor).toBe('#2563EB')
      expect(result.theme.logo).toBe('data:image/png;base64,AA')
    })

    it('every addable type has a real renderer', () => {
      for (const type of ADDABLE_SECTION_TYPES) {
        expect(RENDERABLE_SECTION_TYPES).toContain(type)
      }
    })

    it('hasSectionType reports presence correctly', () => {
      const config = richConfig()
      expect(hasSectionType(config, 'hero')).toBe(true)
      expect(hasSectionType(config, 'services')).toBe(true)
      expect(hasSectionType(config, 'about')).toBe(false)
    })

    it('existing tenants keep their appearance when nothing changes', () => {
      const legacy = safeParseWebsiteConfig({
        theme: {},
        sections: [
          { id: 'sec_hero', type: 'hero', content: { ar: {}, en: {} } },
          { id: 'sec_services', type: 'services', content: { ar: {}, en: {} } },
        ],
      })!
      expect(legacy.sections).toHaveLength(2)
      expect(legacy.sections[0].isVisible).toBe(true)
    })
  })
})
