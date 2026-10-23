import { headers } from 'next/headers'
import { isLocale, type Locale } from '@/lib/i18n'
import { getSession } from '@/lib/auth'
import { getInvitationDetails } from '@/app/[locale]/invite/actions'
import { InviteClaimCard } from '@/components/invite-claim-card'

export default async function InviteClaimPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { locale: rawLocale } = await params
  const { token } = await searchParams
  const locale: Locale = isLocale(rawLocale) ? rawLocale : 'ar'
  const rtl = locale === 'ar'

  const session = await getSession(await headers())
  const details = await getInvitationDetails(token || '', locale)

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-surface px-4 py-12 text-[#172033]"
      dir={rtl ? 'rtl' : 'ltr'}
    >
      <InviteClaimCard
        details={details}
        token={token || ''}
        locale={locale}
        isLoggedIn={Boolean(session?.user)}
        currentUserEmail={session?.user?.email}
      />
    </main>
  )
}
