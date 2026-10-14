import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { publicTenantUrl } from '@/lib/routes'

/**
 * Feature 1 — Public URL container in the Website Builder toolbar.
 *
 * The standalone "الموقع المباشر" / "Live website" button was replaced with
 * a URL container that shows the actual public tenant URL, provides a copy
 * action, and links to the public website in a new tab.
 */

const editorSource = readFileSync(resolve(__dirname, '../components/website-editor.tsx'), 'utf8')

describe('Website Builder toolbar public URL container', () => {
  it('removes the standalone Live Website button', () => {
    // The old button label is gone from the rendered output
    expect(editorSource).not.toContain("'الموقع المباشر'")
    expect(editorSource).not.toContain("'Live website'")
    // The old handler is no longer referenced in JSX
    expect(editorSource).not.toContain('onClick={handleLiveWebsite}')
  })

  it('renders the URL container with the public URL', () => {
    expect(editorSource).toContain('publicTenantUrl(locale, slug)')
    expect(editorSource).toContain('handleCopyUrl')
    expect(editorSource).toContain('dir="ltr"')
    // The URL wraps (never truncates, which the responsive-layout guard forbids)
    expect(editorSource).toContain('wrap-anywhere font-mono text-xs')
  })

  it('includes a copy action with localized aria-label', () => {
    expect(editorSource).toContain("'نسخ رابط الموقع'")
    expect(editorSource).toContain("'Copy website link'")
    expect(editorSource).toContain("navigator.clipboard?.writeText")
    expect(editorSource).toContain("document.execCommand('copy')")
  })

  it('includes an open-in-new-tab link', () => {
    expect(editorSource).toContain('target="_blank"')
    expect(editorSource).toContain('rel="noreferrer"')
    expect(editorSource).toContain("'فتح الموقع في تبويب جديد'")
    expect(editorSource).toContain("'Open website in a new tab'")
  })

  it('uses the same URL helper as the Overview page', () => {
    const routesSource = readFileSync(resolve(__dirname, '../lib/routes.ts'), 'utf8')
    expect(editorSource).toContain("import { publicTenantUrl } from '@/lib/routes'")
    expect(routesSource).toContain('export function publicTenantUrl')
  })

  it('does not hardcode a domain or tenant slug', () => {
    // No hardcoded domains in the URL container code
    expect(editorSource.includes('https://v0-idarty')).toBe(false)
    expect(editorSource.includes('localhost:3000')).toBe(false)
  })

  it('preserves all other toolbar actions', () => {
    for (const action of ['handlePreview', 'handleSaveDraft', 'handlePublish', 'handleDiscard']) {
      expect(editorSource).toContain(action)
    }
    expect(editorSource).toContain("'معاينة المسودة'")
    expect(editorSource).toContain("'Preview draft'")
    expect(editorSource).toContain("'حفظ المسودة'")
    expect(editorSource).toContain("'Save draft'")
  })

  it('generates correct URLs for different locales and slugs', () => {
    // Verify the helper produces the expected shape
    const url = publicTenantUrl('ar', 'my-salon')
    expect(url).toContain('/ar/tenants/my-salon')
    const urlEn = publicTenantUrl('en', 'test-studio')
    expect(urlEn).toContain('/en/tenants/test-studio')
  })
})