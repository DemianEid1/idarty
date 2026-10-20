import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import AuthForm from '@/components/auth-form'

export default async function SignupPage() {
  const session = await getSession(await headers())
  if (session) redirect('/ar/dashboard')
  return <AuthForm mode="signup" locale="ar" nextPath="/ar/dashboard" />
}
