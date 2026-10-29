import 'server-only'

import { render } from '@react-email/render'
import { BookingCancellationEmail, BookingConfirmationEmail, BookingReminderEmail, EmployeeInvitationEmail, emailSubjects, ResetPasswordEmail, VerifyEmailEmail, type EmailLocale, type EmailTemplate } from './templates'

async function getTransporter() {
  const user = process.env.GMAIL_SMTP_USER
  const pass = process.env.GMAIL_SMTP_APP_PASSWORD
  if (!user || !pass) return null
  const { default: nodemailer } = await import('nodemailer')
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  })
}

function fromAddress() {
  const user = process.env.GMAIL_SMTP_USER
  return user ? `IDARTY <${user}>` : 'IDARTY <noreply@idarty.com>'
}

export async function sendTransactionalEmail(input: {
  to: string
  locale?: EmailLocale
  template: EmailTemplate
  url: string
  idempotencyKey: string
  startsAt?: string
  workspaceName?: string
  roleName?: string
  branchName?: string
  branchAddress?: string
}) {
  const locale = input.locale || 'ar'
  const element = input.template === 'verify'
    ? <VerifyEmailEmail locale={locale} url={input.url} />
    : input.template === 'booking'
      ? <BookingConfirmationEmail locale={locale} url={input.url} startsAt={input.startsAt ?? new Date().toISOString()} branchName={input.branchName} branchAddress={input.branchAddress} />
      : input.template === 'cancellation'
        ? <BookingCancellationEmail locale={locale} url={input.url} startsAt={input.startsAt ?? new Date().toISOString()} />
        : input.template === 'reminder'
          ? <BookingReminderEmail locale={locale} url={input.url} startsAt={input.startsAt ?? new Date().toISOString()} branchName={input.branchName} branchAddress={input.branchAddress} />
          : input.template === 'invite'
            ? <EmployeeInvitationEmail locale={locale} url={input.url} workspaceName={input.workspaceName} roleName={input.roleName} />
            : <ResetPasswordEmail locale={locale} url={input.url} />
  const rawHtml = await render(element)
  // Sanitize React Email HTML output — strip patterns known to trigger Gmail's
  // inbound spam filter before the message reaches the recipient's inbox.
  const html = rawHtml
    // 1. Replace XHTML DOCTYPE (contains external w3.org URL) with plain HTML5 DOCTYPE
    .replace(/<!DOCTYPE[^>]*>/i, '<!DOCTYPE html>')
    // 2. Strip MSO conditional comments (contain invisible Unicode hair-space chars &#8202;)
    .replace(/<!--\[if[^\]]*]>[\s\S]*?<!\[endif\]-->/g, '')
    // 3. Strip React server-rendering marker comments
    .replace(/<!--\/?[$a-z]+-->/g, '')
    // 4. Strip Apple/MSO-specific meta tags
    .replace(/<meta name="x-apple-disable-message-reformatting"[^\/]*\/>/gi, '')
    // 5. Strip residual mso- inline style properties
    .replace(/\bmso-[\w-]+:[^;}"']+;?/g, '')
  const text = await render(element, { plainText: true })
  const transporter = await getTransporter()
  if (!transporter) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[idarty:dev-email] No SMTP configured in non-production. Logged email delivery:', {
        to: input.to,
        template: input.template,
        subject: emailSubjects[locale][input.template],
        url: input.url,
      })
      try {
        const { db } = await import('@/lib/db')
        const { devEmailOutbox } = await import('@/lib/db/schema')
        await db.insert(devEmailOutbox).values({
          toAddress: input.to,
          subject: emailSubjects[locale][input.template],
          locale: locale as 'ar' | 'en',
          html,
        })
      } catch {
        // Ignore db outbox write errors in mock/offline test environments
      }
      return { messageId: `dev-${Date.now()}`, accepted: [input.to] }
    }
    console.error('[idarty] GMAIL_SMTP_USER or GMAIL_SMTP_APP_PASSWORD is not configured')
    throw new Error('EMAIL_NOT_CONFIGURED')
  }
  try {
    const info = await transporter.sendMail({
      from: fromAddress(),
      to: input.to,
      subject: emailSubjects[locale][input.template],
      html,
      text,
    })
    console.log('[email] Successfully handed off to SMTP.', {
      messageId: info.messageId,
      accepted: info.accepted
    })
    return info
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[email] Gmail SMTP failed', { message, template: input.template })
    throw new Error('EMAIL_DELIVERY_FAILED')
  }
}
