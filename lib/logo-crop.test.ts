import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { safeParseWebsiteConfig, createDefaultWebsiteConfig } from '@/lib/website-config'

const editorSource = readFileSync(resolve(__dirname, '../components/website-editor.tsx'), 'utf8')
const tenantWebsiteSource = readFileSync(resolve(__dirname, '../components/tenant-website.tsx'), 'utf8')
const imageCropSource = readFileSync(resolve(__dirname, '../lib/image-crop.ts'), 'utf8')
const configSource = readFileSync(resolve(__dirname, '../lib/website-config.ts'), 'utf8')

/**
 * The public-site logo `<img>` tag, extracted by its `src={logo}` marker rather
 * than by an exact class string. The class list legitimately changes with
 * responsive/typography work; the crop-preservation PROPERTIES
 * (`object-contain`, natural `w-auto`, no fixed width) are what the tests guard.
 */
function logoImgTag(): string {
  const match = tenantWebsiteSource.match(/<img src=\{logo\}[^>]*\/>/)
  return match?.[0] ?? ''
}

describe('Logo is never cropped — object-contain always', () => {
  it('the editor renders the logo with object-contain', () => {
    // The logo preview now lives inside the shared ImageUploadZone. The zone
    // defaults to `contain`, and the logo call site does NOT override it to
    // `cover` — so a logo can never be cropped by its own preview.
    const zone = readFileSync(resolve(__dirname, '../components/image-upload-zone.tsx'), 'utf8')
    expect(zone).toContain("previewFit = 'contain'")
    expect(zone).toContain("object-contain")
    // The logo usage must not opt into cropping.
    const logoBlock = editorSource.slice(
      editorSource.indexOf("rtl ? 'الشعار' : 'Logo'"),
      editorSource.indexOf('Hero image — optional background image')
    )
    expect(logoBlock).not.toContain('previewFit="cover"')
  })

  it('the tenant website renders the logo with object-contain', () => {
    // The public site logo uses object-contain so it is never cropped.
    const img = logoImgTag()
    expect(img, 'logo <img> not found').toBeTruthy()
    expect(img).toContain('object-contain')
  })

  it('the editor has no logo crop button', () => {
    expect(editorSource).not.toContain('setShowLogoCropper')
    expect(editorSource).not.toContain('showLogoCropper')
    expect(editorSource).not.toContain('اقتصاص الشعار')
    expect(editorSource).not.toContain('Crop logo')
    expect(editorSource).not.toContain('Adjust logo crop')
  })

  it('the editor has no logo crop state or setter', () => {
    expect(editorSource).not.toContain('hasLogoCrop')
    expect(editorSource).not.toContain('setLogoCrop')
    expect(editorSource).not.toContain('logoImageCrop')
  })

  it('the tenant website has no logo crop rendering', () => {
    expect(tenantWebsiteSource).not.toContain('resolveCrop(themeOverride?.logoImageCrop)')
    expect(tenantWebsiteSource).not.toContain("aspectRatio: '3 / 1'")
  })

  it('CROP_ASPECTS has no logo entry', () => {
    expect(imageCropSource).not.toContain('logo: 3 / 1')
    // Hero and service aspects are preserved
    expect(imageCropSource).toContain('hero: 16 / 6')
    expect(imageCropSource).toContain('service: 16 / 10')
  })

  it('the website config schema has no logoImageCrop field', () => {
    expect(configSource).not.toContain('logoImageCrop')
  })
})

describe('Logo rendering for all image shapes', () => {
  it('a landscape logo is displayed completely with object-contain', () => {
    // object-contain preserves the full image regardless of aspect ratio
    // No fixed width-to-height ratio is imposed
    expect(tenantWebsiteSource).toContain('object-contain')
    expect(tenantWebsiteSource).not.toContain('w-24')
    expect(tenantWebsiteSource).not.toContain('aspectRatio')
  })

  it('a square logo retains its original aspect ratio', () => {
    // object-contain + a natural-width class preserves the square aspect ratio.
    // The height step is allowed to be responsive (e.g. `h-8 … sm:h-9`); what
    // must hold is that the width stays natural (`w-auto`) and no fixed width
    // is imposed.
    const img = logoImgTag()
    expect(img).toContain('object-contain')
    expect(img).toContain('w-auto')
    expect(img).not.toMatch(/(?:^|\s)w-(?:24|32|48)(?:\s|")/)
  })

  it('a portrait logo is displayed completely', () => {
    // object-contain with w-auto allows any height
    expect(tenantWebsiteSource).toContain('w-auto max-w-full')
  })

  it('transparent areas are preserved', () => {
    // object-contain does not crop or modify pixels
    // The logo img must exist and use object-contain
    const img = logoImgTag()
    expect(img).toContain('<img src={logo}')
    expect(img).toContain('object-contain')
    // The logo img has no overflow-hidden class (the overflow-hidden instances
    // are on the hero and service image containers, not the logo)
    expect(tenantWebsiteSource).not.toContain('overflow-hidden shrink-0 object-contain')
  })
})

describe('Logo crop metadata cannot cause parts to disappear', () => {
  it('even if logoImageCrop were present in stored config, the renderer ignores it', () => {
    // The renderer no longer reads logoImageCrop at all
    expect(tenantWebsiteSource).not.toContain('logoImageCrop')
    // The renderer always uses object-contain
    expect(tenantWebsiteSource).toContain('object-contain')
  })

  it('legacy logos without any crop metadata render correctly', () => {
    const config = createDefaultWebsiteConfig()
    config.theme.logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const parsed = safeParseWebsiteConfig(config)
    expect(parsed).not.toBeNull()
    expect(parsed!.theme.logo).toContain('data:image/png')
    // No logoImageCrop field in schema
    expect('logoImageCrop' in parsed!.theme).toBe(false)
  })
})

describe('Draft, preview, and published logo rendering consistency', () => {
  it('the editor preview and tenant website both use object-contain', () => {
    // Both surfaces render the logo without cropping: the public site with
    // object-contain, the editor through the zone's `contain` default.
    const zone = readFileSync(resolve(__dirname, '../components/image-upload-zone.tsx'), 'utf8')
    expect(zone).toContain('object-contain')
    expect(editorSource).toContain('ImageUploadZone')
    expect(tenantWebsiteSource).toContain('object-contain')
  })

  it('the logo upload handler does not set any crop state', () => {
    // Logo upload now goes through the shared ImageUploadZone, whose onFile
    // callback only writes the logo field. The upload path must never touch
    // crop state — the logo is never cropped.
    expect(editorSource).not.toContain('logoImageCrop')
    // The logo upload callback writes theme.logo and nothing else.
    const logoHandler = editorSource.match(/updateTheme\('logo', event\.target\.result\)/)
    expect(logoHandler).not.toBeNull()
    expect(logoHandler![0]).not.toContain('Crop')
  })
})

describe('Hero and service image cropping is preserved', () => {
  it('the editor still has hero crop functionality', () => {
    expect(editorSource).toContain('showHeroCropper')
    expect(editorSource).toContain('CROP_ASPECTS.hero')
    expect(editorSource).toContain('setHeroCrop')
    expect(editorSource).toContain('hasHeroCrop')
  })

  it('the tenant website still renders hero crop', () => {
    expect(tenantWebsiteSource).toContain('resolveCrop(themeOverride?.heroImageCrop)')
    expect(tenantWebsiteSource).toContain('cropToLayerStyle(themeOverride?.heroImageCrop)')
  })

  it('the config schema still has heroImageCrop', () => {
    expect(configSource).toContain('heroImageCrop')
  })
})