import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Logo navigation tests.
 *
 * Verifies that:
 * - Global Idarty logo navigates to the localized public landing page
 * - Tenant/business logo on a public tenant website navigates to that tenant's homepage
 * - Tenant/business logo inside tenant dashboard navigates to the tenant dashboard
 * - Logo links are semantic, accessible, and do not contain nested interactive elements
 * - The landing page is auth-aware (Dashboard button when signed in)
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')

const landingPage = read('app/page.tsx')
const tenantWebsite = read('components/tenant-website.tsx')
const dashboardLayout = read('app/[locale]/tenants/[slug]/dashboard/layout.tsx')
const authForm = read('components/auth-form.tsx')
const localeSwitcher = read('components/locale-switcher.tsx')
const bookingPage = read('app/[locale]/tenants/[slug]/book/page.tsx')
const dashboardPage = read('app/[locale]/tenants/[slug]/dashboard/page.tsx')

describe('1. global logo destination and locale preservation', () => {
  it('landing page header logo links to "/" (the proxy resolves locale)', () => {
    // The proxy at / resolves to /{locale} based on cookie/accept-language
    expect(landingPage).toContain('href="/"')
    expect(landingPage).toContain('aria-label={rtl ? \'الصفحة الرئيسية - إدارتي\' : \'Idarty home\'}')
  })

  it('landing page footer logo links to "/"', () => {
    // Footer logo is also a Link to "/"
    const footerSection = landingPage.slice(landingPage.indexOf('<footer'))
    expect(footerSection).toContain('href="/"')
    expect(footerSection).toContain('aria-label={rtl ? \'إدارتي\' : \'Idarty\'}')
  })

  it('auth form logo links to "/"', () => {
    expect(authForm).toContain('href="/"')
    expect(authForm).toContain('aria-label={locale === \'ar\' ? \'الرئيسية - إدارتي\' : \'Home - Idarty\'}')
  })

  it('tenant website footer Idarty logo links to "/"', () => {
    const footerSection = tenantWebsite.slice(tenantWebsite.indexOf('<footer'))
    expect(footerSection).toContain('href="/"')
    expect(footerSection).toContain('aria-label="Idarty"')
  })
})

describe('2. tenant logo destination and tenant slug preservation', () => {
  it('tenant website header logo links to the tenant\'s public homepage', () => {
    // The header logo should go to /{locale}/tenants/{slug}, NOT /{locale}
    const headerSection = tenantWebsite.slice(
      tenantWebsite.indexOf('<header'),
      tenantWebsite.indexOf('</header>')
    )
    expect(headerSection).toContain('href={`/${locale}/tenants/${slug}`}')
    expect(headerSection).not.toContain('href={`/${locale}`}')
  })

  it('tenant website header logo preserves the tenant slug', () => {
    const headerSection = tenantWebsite.slice(
      tenantWebsite.indexOf('<header'),
      tenantWebsite.indexOf('</header>')
    )
    // The href uses the slug variable, not a hardcoded value
    expect(headerSection).toContain('${slug}')
  })

  it('tenant website header logo is a semantic Link', () => {
    const headerSection = tenantWebsite.slice(
      tenantWebsite.indexOf('<header'),
      tenantWebsite.indexOf('</header>')
    )
    expect(headerSection).toContain('<Link')
    expect(headerSection).not.toContain('<a href')
  })
})

describe('3. logo behavior in the dashboard', () => {
  it('dashboard sidebar logo uses Link (not <a>) for client-side navigation', () => {
    expect(dashboardLayout).toContain('<Link href={`/${locale}/tenants/${slug}/dashboard`}')
    // The logo link should NOT use a plain <a> tag which causes full page reload
    // (The admin link at the bottom of the sidebar still uses <a>, which is fine)
    const logoLinkStart = dashboardLayout.indexOf('<Logo')
    const logoLinkEnd = dashboardLayout.indexOf('</Link>', logoLinkStart)
    const logoLinkSection = dashboardLayout.slice(logoLinkStart, logoLinkEnd)
    expect(logoLinkSection).not.toContain('<a href')
  })

  it('dashboard sidebar logo navigates to the tenant dashboard home', () => {
    expect(dashboardLayout).toContain('href={`/${locale}/tenants/${slug}/dashboard`}')
  })

  it('dashboard sidebar logo has an accessible label', () => {
    const aside = dashboardLayout.slice(
      dashboardLayout.indexOf('<aside'),
      dashboardLayout.indexOf('</aside>')
    )
    expect(aside).toContain('aria-label={rtl ? \'إدارتي\' : \'Idarty\'}')
  })
})

describe('4. signed-out landing page shows Login and Signup', () => {
  it('shows Login link when not authenticated', () => {
    // The conditional rendering: when !session, show Login and Signup
    expect(landingPage).toContain('authPath(\'login\')')
    expect(landingPage).toContain('authPath(\'signup\')')
  })

  it('Login link uses the localized path', () => {
    expect(landingPage).toContain('authPath = (path: \'login\' | \'signup\') => `/${locale}/${path}`')
  })

  it('Signup link uses the localized path', () => {
    // Both login and signup use the same authPath function
    expect(landingPage).toContain('authPath(\'signup\')')
  })
})

describe('5. signed-in landing page shows Dashboard instead of Login and Signup', () => {
  it('shows Dashboard link when authenticated', () => {
    expect(landingPage).toContain('href={`/${locale}/dashboard`}')
    expect(landingPage).toContain('copy.dashboard')
  })

  it('Dashboard link is styled as a primary CTA', () => {
    // Dashboard button uses the same styling as the Signup button
    expect(landingPage).toContain('bg-brand-teal px-5 py-2.5 text-sm font-semibold text-white')
  })

  it('Dashboard label is localized', () => {
    expect(landingPage).toContain("dashboard: 'لوحة التحكم'")
    expect(landingPage).toContain("dashboard: 'Dashboard'")
  })

  it('uses authClient.useSession() for auth state', () => {
    expect(landingPage).toContain('authClient.useSession()')
  })

  it('shows a loading placeholder while auth state is pending', () => {
    expect(landingPage).toContain('authPending')
    expect(landingPage).toContain('animate-pulse')
  })
})

describe('6. dashboard button navigates through the correct existing flow', () => {
  it('Dashboard link goes to /{locale}/dashboard (the resolver)', () => {
    // The dashboard resolver at /[locale}/dashboard handles tenant selection
    expect(landingPage).toContain('href={`/${locale}/dashboard`}')
  })

  it('the dashboard resolver redirects to the correct tenant or onboarding', () => {
    const dashboardResolver = read('app/[locale]/dashboard/page.tsx')
    expect(dashboardResolver).toContain('redirect(safeNextPath(next, fallback))')
    expect(dashboardResolver).toContain('/onboarding')
  })
})

describe('7. logo links are semantic, accessible, and do not contain nested interactive elements', () => {
  it('all logo links use Next.js Link component', () => {
    // Landing page
    expect(landingPage).toContain('<Link href="/"')
    // Dashboard
    expect(dashboardLayout).toContain('<Link href={`/${locale}/tenants/${slug}/dashboard`}')
    // Tenant website
    expect(tenantWebsite).toContain('<Link')
  })

  it('no logo link contains a nested <a> tag', () => {
    // The dashboard sidebar logo should be a Link, not an <a>
    const aside = dashboardLayout.slice(
      dashboardLayout.indexOf('<aside'),
      dashboardLayout.indexOf('</aside>')
    )
    // Should not have nested interactive elements
    expect(aside).not.toMatch(/<a[^>]*>.*<a/)
  })

  it('all logo links have accessible labels', () => {
    // Landing page header
    expect(landingPage).toContain('aria-label={rtl ? \'الصفحة الرئيسية - إدارتي\' : \'Idarty home\'}')
    // Landing page footer
    expect(landingPage).toContain('aria-label={rtl ? \'إدارتي\' : \'Idarty\'}')
    // Dashboard sidebar
    expect(dashboardLayout).toContain('aria-label={rtl ? \'إدارتي\' : \'Idarty\'}')
    // Auth form
    expect(authForm).toContain('aria-label={locale === \'ar\' ? \'الرئيسية - إدارتي\' : \'Home - Idarty\'}')
  })
})

describe('8. mobile navigation and responsive headers do not block logo clicks', () => {
  it('landing page MobileNav is rendered after the logo in the header', () => {
    const headerSection = landingPage.slice(
      landingPage.indexOf('<header'),
      landingPage.indexOf('</header>')
    )
    const logoIndex = headerSection.indexOf('<Link href="/"')
    const mobileNavIndex = headerSection.indexOf('<MobileNav')
    expect(logoIndex).toBeGreaterThan(-1)
    expect(mobileNavIndex).toBeGreaterThan(logoIndex)
  })

  it('MobileNav uses md:hidden so it does not overlap the logo on desktop', () => {
    const mobileNav = read('components/mobile-nav.tsx')
    expect(mobileNav).toContain('md:hidden')
  })

  it('dashboard mobile nav trigger is lg:hidden', () => {
    const dashboardMobileNav = read('components/dashboard-mobile-nav.tsx')
    expect(dashboardMobileNav).toContain('lg:hidden')
  })
})

describe('9. booking flow preserves tenant context', () => {
  it('booking page back link goes to the tenant public page', () => {
    expect(bookingPage).toContain('href={`/${locale}/tenants/${slug}`}')
  })

  it('booking page does not navigate to an unrelated tenant', () => {
    // The back link uses the slug from params, not a hardcoded value
    expect(bookingPage).toContain('${slug}')
  })
})

describe('10. non-localized auth pages redirect authenticated users', () => {
  it('non-localized login page redirects to dashboard when authenticated', () => {
    const loginPage = read('app/login/page.tsx')
    expect(loginPage).toContain('redirect(\'/ar/dashboard\')')
  })

  it('non-localized signup page redirects to dashboard when authenticated', () => {
    const signupPage = read('app/signup/page.tsx')
    expect(signupPage).toContain('redirect(\'/ar/dashboard\')')
  })
})
