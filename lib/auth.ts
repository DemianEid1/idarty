import { betterAuth } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '@/lib/db'
import { sendTransactionalEmail } from '@/lib/email/send'
import { logAudit } from '@/lib/audit'
import { checkRateLimit } from '@/lib/rate-limit'

const skipEmailVerification = process.env.SKIP_EMAIL_VERIFICATION === 'true'
const productionRuntime = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'
if (skipEmailVerification && productionRuntime) throw new Error('SKIP_EMAIL_VERIFICATION cannot be enabled in production')

const runtimeOrigins = [
  process.env.V0_RUNTIME_URL,
  process.env.V0_DEV_APP_URL,
  process.env.V0_BUILD_URL,
  process.env.V0_SANDBOX_URL,
].filter((value): value is string => Boolean(value))

function getBaseURL() {
  const url =
    process.env.BETTER_AUTH_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    process.env.V0_RUNTIME_URL

  if (url) {
    return url.startsWith('http') ? url : `https://${url}`
  }

  const isProd =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production'
  if (isProd) {
    throw new Error('BETTER_AUTH_URL or a Vercel environment URL is required in production environment.')
  }

  return 'http://localhost:3000'
}
const baseURL = getBaseURL()

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  baseURL,
  trustedOrigins: [
    'http://localhost:3000',
    ...runtimeOrigins,
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: !skipEmailVerification,
    sendResetPassword: async ({ user, url }) => {
      await sendTransactionalEmail({
        to: user.email,
        template: 'reset',
        url,
        locale: 'ar',
        idempotencyKey: `reset-password/${user.id}`,
      })
    },
  },
  emailVerification: {
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendTransactionalEmail({
        to: user.email,
        template: 'verify',
        url,
        locale: (user as any).preferredLocale === 'en' ? 'en' : 'ar',
        idempotencyKey: `verify-email/${user.id}-${Date.now()}`,
      })
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const path = (ctx as { path?: string }).path
      if (path !== '/sign-in/email' && path !== '/sign-up/email') return

      const headers = ctx.headers as Headers | undefined
      const ip = headers?.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
      const limit = path === '/sign-in/email' ? 10 : 5
      const windowMs = 15 * 60_000

      const { allowed, resetAt } = await checkRateLimit(`auth:${ip}`, limit, windowMs)
      if (!allowed) {
        const retryAfterSec = Math.ceil((resetAt.getTime() - Date.now()) / 1000)
        throw Object.assign(
          new Error('Too many attempts. Please try again later.'),
          { code: 'RATE_LIMITED', retryAfterSec },
        )
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      // Early return for non-auth paths to avoid unnecessary processing
      // Note: `path` is available at runtime on the middleware context but not in the type definition
      const path = (ctx as { path?: string }).path
      const authPaths = ['/sign-in/email', '/sign-up/email', '/change-password', '/reset-password', '/verify-email']
      if (!path || !authPaths.includes(path)) return

      // Headers are available on the middleware input context
      const headers = ctx.headers as Headers | undefined
      const ctxAny = ctx as any
      const returned = ctxAny.context?.returned
      const hasError =
        returned instanceof Error ||
        returned?.status === 'UNAUTHORIZED' ||
        returned?.status === 'BAD_REQUEST' ||
        (typeof returned?.statusCode === 'number' && returned.statusCode >= 400)
      const isSuccess =
        ctxAny.status === 'ok' ||
        (returned !== undefined && !hasError && ctxAny.status !== 'unauthorized')
      const user =
        ctxAny.user ??
        ctxAny.context?.newSession?.user ??
        (returned && !hasError ? returned.user : undefined)

      if (path === '/sign-in/email') {
        if (isSuccess) {
          await logAudit({
            actorUserId: user?.id,
            action: 'auth.login.success',
            entityType: 'user',
            entityId: user?.id,
          }, headers)
        } else {
          // Do NOT log the raw email address — prevents account enumeration
          await logAudit({
            action: 'auth.login.failure',
            entityType: 'user',
            metadata: { reason: 'invalid_credentials' },
          }, headers)
        }
      } else if (path === '/sign-up/email' && isSuccess) {
        await logAudit({
          actorUserId: user?.id,
          action: 'auth.signup',
          entityType: 'user',
          entityId: user?.id,
        }, headers)
      } else if (path === '/change-password' && isSuccess) {
        await logAudit({
          actorUserId: user?.id,
          action: 'auth.password.change',
          entityType: 'user',
          entityId: user?.id,
        }, headers)
      } else if (path === '/reset-password' && isSuccess) {
        await logAudit({
          actorUserId: user?.id,
          action: 'auth.password.reset',
          entityType: 'user',
          entityId: user?.id,
        }, headers)
      } else if (path === '/verify-email' && isSuccess) {
        await logAudit({
          actorUserId: user?.id,
          action: 'auth.email.verified',
          entityType: 'user',
          entityId: user?.id,
        }, headers)
      }
    }),
  },
  user: {
    additionalFields: {
      preferredLocale: { type: 'string', required: false, defaultValue: 'ar' },
      isPlatformAdmin: { type: 'boolean', required: false, defaultValue: false },
    },
  },
  session: {
    expiresIn: 3600 * 24 * 30, // 30 days
    updateAge: 3600 * 24, // 24 hours
  },
  ...(process.env.NODE_ENV === 'development' && baseURL.startsWith('https')
    ? {
        advanced: {
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
          },
        },
      }
    : {}),
})

export type Session = typeof auth.$Infer.Session

export async function getSession(requestHeaders: Headers) {
  return auth.api.getSession({ headers: requestHeaders })
}

export async function requireSession(requestHeaders: Headers) {
  const session = await getSession(requestHeaders)
  if (!session) throw new Error('UNAUTHORIZED')
  return session
}

export function publicOrigin() {
  return baseURL.startsWith('http') ? baseURL : `https://${baseURL}`
}

export default auth
