import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LocaleSwitcher, LocaleSwitchLink } from '@/components/locale-switcher'

/**
 * The Website Builder toolbar must not carry a second language switcher — the
 * Workspace header already provides one, and the public website provides its own.
 *
 * These are static checks against the editor source, because the editor is a
 * client component that cannot be rendered in this node-environment suite.
 */

const editorSource = readFileSync(resolve(__dirname, '../components/website-editor.tsx'), 'utf8')
const switcherSource = readFileSync(resolve(__dirname, '../components/locale-switcher.tsx'), 'utf8')
// The Workspace header (and its language switcher) is part of the persistent
// dashboard shell, which lives in the dashboard layout.
const shell = readFileSync(resolve(__dirname, '../app/[locale]/tenants/[slug]/dashboard/layout.tsx'), 'utf8')

describe('Website Builder toolbar language switcher removal', () => {
  it('the editor no longer imports the interactive LocaleSwitcher', () => {
    expect(editorSource).not.toContain('LocaleSwitcher')
    expect(editorSource).not.toMatch(/from '@\/components\/locale-switcher'/)
  })

  it('the editor renders no locale-switcher element', () => {
    expect(editorSource).not.toContain('<LocaleSwitcher')
    expect(editorSource).not.toContain('<LocaleSwitchLink')
  })

  it('keeps every other toolbar action', () => {
    for (const action of ['handlePreview', 'handleSaveDraft', 'handlePublish', 'handleDiscard']) {
      expect(editorSource).toContain(action)
    }
    // The visible labels for the preserved actions.
    expect(editorSource).toContain("'معاينة المسودة'")
    expect(editorSource).toContain("'Preview draft'")
  })

  it('the shared LocaleSwitcher component still exists and is exported', () => {
    expect(switcherSource).toContain('export function LocaleSwitcher')
    expect(typeof LocaleSwitcher).toBe('function')
  })

  it('the public LocaleSwitchLink still exists and is exported', () => {
    expect(switcherSource).toContain('export function LocaleSwitchLink')
    expect(typeof LocaleSwitchLink).toBe('function')
  })

  it('the Workspace header still uses the switcher', () => {
    const dashboard = readFileSync(
      resolve(__dirname, '../app/[locale]/tenants/[slug]/dashboard/page.tsx'),
      'utf8'
    )
    // The switcher moved to the persistent shell with the header.
    expect(shell).toContain('LocaleSwitcher')
    expect(shell).toContain('<LocaleSwitcher currentLocale={typedLocale} />')
  })

  it('the public tenant website still passes its own switcher', () => {
    const publicPage = readFileSync(resolve(__dirname, '../app/[locale]/tenants/[slug]/page.tsx'), 'utf8')
    expect(publicPage).toContain('LocaleSwitchLink')
    expect(publicPage).toContain('localeSwitch=')
  })

  it('the editor still declares no unsaved-changes guard for locale switching', () => {
    // Removing the switcher also removes the only hasUnsavedChanges consumer in
    // the editor; confirm the flag is still used for the save/discard logic.
    expect(editorSource).toContain('hasUnsavedChanges')
  })
})
