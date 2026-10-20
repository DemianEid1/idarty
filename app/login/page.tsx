import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import AuthForm from '@/components/auth-form'

export default async function LoginPage() {
  const session = await getSession(await headers())
  if (session) redirect('/ar/dashboard')
  return <AuthForm mode="login" locale="ar" nextPath="/ar/dashboard" />
}
