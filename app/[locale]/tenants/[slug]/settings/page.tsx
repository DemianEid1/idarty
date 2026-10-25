import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Globe2 } from 'lucide-react'
import { and, eq } from 'drizzle-orm'
import type { Locale } from '@/lib/i18n'
import { requireTenantAccess } from '@/lib/authz'
import { db } from '@/lib/db'
import { tenantTranslations } from '@/lib/db/schema'
import { TenantSettingsForm } from '@/components/tenant-settings-form'

export default async function SettingsPage({ params }: { params: Promise<{ locale: Locale; slug: string }> }) {
  const { locale, slug } = await params
  let access
  try {
    access = await requireTenantAccess(await headers(), slug, 'manager')
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      redirect(`/${locale}/login?next=/${locale}/tenants/${slug}/settings`)
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      notFound()
    }
    throw error
  }
  const translation = await db.query.tenantTranslations.findFirst({ where: and(eq(tenantTranslations.tenantId, access.tenant.id), eq(tenantTranslations.locale, locale)) })
  return <main className="min-h-screen bg-[#fbfcfe] text-[#172033]" dir={locale === 'ar' ? 'rtl' : 'ltr'}><header className="border-b border-[#e8ebf1] bg-paper"><div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5"><Link href={`/${locale}/tenants/${slug}/dashboard`} className="flex items-center gap-2 text-sm font-semibold"><ArrowLeft className="h-4 w-4" />{locale === 'ar' ? 'العودة للوحة التحكم' : 'Back to dashboard'}</Link><Globe2 className="h-5 w-5 text-brand-teal" /></div></header><section className="mx-auto max-w-5xl px-6 py-12"><p className="text-sm font-semibold text-brand-teal">{locale === 'ar' ? 'الموقع العام' : 'Public website'}</p><h1 className="mt-3 text-4xl font-semibold tracking-[-.04em]">{locale === 'ar' ? 'خصص صفحة نشاطك' : 'Customize your website'}</h1><p className="mt-4 max-w-2xl text-ink-muted">{locale === 'ar' ? 'حدّث المعلومات التي يراها عملاؤك قبل الحجز.' : 'Update the information customers see before booking.'}</p><TenantSettingsForm slug={slug} locale={locale} initial={{ name: translation?.name ?? '', tagline: translation?.tagline ?? '', description: translation?.description ?? '', address: translation?.address ?? '', phone: access.tenant.phoneE164 ?? '', email: access.tenant.email ?? '', defaultLocale: access.tenant.defaultLocale, supportedLocales: access.tenant.supportedLocales.join(','), timezone: access.tenant.timezone, currency: access.tenant.currency }} /></section></main>
}
