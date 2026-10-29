import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Section,
  Text,
} from '@react-email/components'

const copy = {
  ar: {
    verifyPreview: 'تأكيد بريدك الإلكتروني في idarty',
    verifyTitle: 'أهلًا بك في idarty',
    verifyBody: 'اضغط الزر أدناه لتأكيد بريدك الإلكتروني والبدء باستخدام مساحة العمل.',
    verifyCta: 'تأكيد البريد الإلكتروني',
    resetPreview: 'إعادة تعيين كلمة المرور في idarty',
    resetTitle: 'إعادة تعيين كلمة المرور',
    resetBody: 'وصلنا طلب لإعادة تعيين كلمة المرور. الرابط صالح لفترة محدودة.',
    resetCta: 'إعادة تعيين كلمة المرور',
    footer: 'إذا لم تطلب هذا البريد، يمكنك تجاهله بأمان.',
    bookingPreview: 'تم تأكيد موعدك في idarty', bookingTitle: 'تم تأكيد موعدك', bookingBody: 'تم حجز موعدك بنجاح. ننتظرك في الوقت المحدد.', bookingDate: 'الموعد', bookingCta: 'إدارة الموعد', cancelPreview: 'تم إلغاء موعدك في idarty', cancelTitle: 'تم إلغاء الموعد', cancelBody: 'تم إلغاء موعدك بنجاح. إذا كان ذلك غير متوقع، تواصل مع النشاط مباشرة.', cancelCta: 'عرض التفاصيل',
    reminderPreview: 'تذكير بموعدك القادم في idarty', reminderTitle: 'تذكير بموعدك', reminderBody: 'هذا تذكير بموعدك القادم. نرجو الحضور في الوقت المحدد.', reminderDate: 'الموعد', reminderCta: 'إدارة الموعد',
    invitePreview: 'دعوة للانضمام إلى فريق العمل في idarty', inviteTitle: 'دعوة للانضمام إلى فريق العمل', inviteBody: 'تمت دعوتك للانضمام إلى مساحة العمل في idarty. اضغط الزر أدناه لتفعيل حسابك وتعيين كلمة المرور.', inviteCta: 'تفعيل الحساب والانضمام',
  },
  en: {
    verifyPreview: 'Verify your email for idarty',
    verifyTitle: 'Welcome to idarty',
    verifyBody: 'Use the button below to verify your email and start using your workspace.',
    verifyCta: 'Verify email address',
    resetPreview: 'Reset your idarty password',
    resetTitle: 'Reset your password',
    resetBody: 'We received a request to reset your password. This link expires soon.',
    resetCta: 'Reset password',
    footer: 'If you did not request this email, you can safely ignore it.',
    bookingPreview: 'Your idarty appointment is confirmed', bookingTitle: 'Appointment confirmed', bookingBody: 'Your appointment has been booked successfully. We look forward to seeing you.', bookingDate: 'Appointment', bookingCta: 'Manage appointment', cancelPreview: 'Your idarty appointment was cancelled', cancelTitle: 'Appointment cancelled', cancelBody: 'Your appointment was cancelled successfully. If this was unexpected, please contact the business directly.', cancelCta: 'View details',
    reminderPreview: 'Reminder for your upcoming idarty appointment', reminderTitle: 'Appointment reminder', reminderBody: 'This is a reminder for your upcoming appointment. Please arrive on time.', reminderDate: 'Appointment', reminderCta: 'Manage appointment',
    invitePreview: 'Invitation to join a team on idarty', inviteTitle: 'Invitation to join the team', inviteBody: 'You have been invited to join a workspace on idarty. Click the button below to activate your account and set your password.', inviteCta: 'Activate Account & Join',
  },
} as const

type Locale = keyof typeof copy

function Shell({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <Html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <Head />
      <Body style={{ backgroundColor: '#f7f8fa', color: '#142033', fontFamily: 'Arial, sans-serif', padding: '32px 12px' }}>
        <Container style={{ backgroundColor: '#ffffff', border: '1px solid #e3e8ef', borderRadius: '16px', maxWidth: '560px', padding: '36px' }}>
          <Text style={{ color: '#142033', fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em' }}>idarty</Text>
          {children}
          <Text style={{ color: '#667085', fontSize: '13px', lineHeight: '20px', marginTop: '32px' }}>{copy[locale].footer}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export function VerifyEmailEmail({ locale = 'ar', url }: { locale?: Locale; url: string }) {
  const c = copy[locale]
  return <Shell locale={locale}><Heading style={{ fontSize: '28px', lineHeight: '36px' }}>{c.verifyTitle}</Heading><Text style={{ fontSize: '16px', lineHeight: '26px' }}>{c.verifyBody}</Text><Section style={{ margin: '28px 0' }}><Button href={url} style={{ backgroundColor: '#142033', borderRadius: '8px', color: '#fff', display: 'inline-block', fontSize: '15px', padding: '13px 18px', textDecoration: 'none' }}>{c.verifyCta}</Button></Section></Shell>
}

export function ResetPasswordEmail({ locale = 'ar', url }: { locale?: Locale; url: string }) {
  const c = copy[locale]
  return <Shell locale={locale}><Heading style={{ fontSize: '28px', lineHeight: '36px' }}>{c.resetTitle}</Heading><Text style={{ fontSize: '16px', lineHeight: '26px' }}>{c.resetBody}</Text><Section style={{ margin: '28px 0' }}><Button href={url} style={{ backgroundColor: '#142033', borderRadius: '8px', color: '#fff', display: 'inline-block', fontSize: '15px', padding: '13px 18px', textDecoration: 'none' }}>{c.resetCta}</Button></Section></Shell>
}

export function EmployeeInvitationEmail({ locale = 'ar', url, workspaceName, roleName }: { locale?: Locale; url: string; workspaceName?: string; roleName?: string }) {
  const c = copy[locale]
  return (
    <Shell locale={locale}>
      <Heading style={{ fontSize: '28px', lineHeight: '36px' }}>{c.inviteTitle}</Heading>
      <Text style={{ fontSize: '16px', lineHeight: '26px' }}>
        {workspaceName
          ? (locale === 'ar' ? `تمت دعوتك للانضمام إلى مساحة عمل "${workspaceName}"${roleName ? ` بدور (${roleName})` : ''}.` : `You have been invited to join the "${workspaceName}" workspace${roleName ? ` as (${roleName})` : ''}.`)
          : c.inviteBody}
      </Text>
      <Text style={{ fontSize: '14px', lineHeight: '22px', color: '#475467', marginTop: '8px' }}>
        {locale === 'ar' ? 'هذا الرابط مخصص لك فقط وصالح لمدة 7 أيام.' : 'This link is intended solely for you and expires in 7 days.'}
      </Text>
      <Section style={{ margin: '28px 0' }}>
        <Button href={url} style={{ backgroundColor: '#142033', borderRadius: '8px', color: '#fff', display: 'inline-block', fontSize: '15px', padding: '13px 18px', textDecoration: 'none' }}>
          {c.inviteCta}
        </Button>
      </Section>
    </Shell>
  )
}

export function BookingConfirmationEmail({ locale = 'ar', url, startsAt, branchName, branchAddress }: { locale?: Locale; url: string; startsAt: string; branchName?: string; branchAddress?: string }) {
  const c = copy[locale]
  return <Shell locale={locale}><Heading style={{ fontSize: '28px', lineHeight: '36px' }}>{c.bookingTitle}</Heading><Text style={{ fontSize: '16px', lineHeight: '26px' }}>{c.bookingBody}</Text><Text style={{ fontSize: '15px', fontWeight: 700 }}>{c.bookingDate}: {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(startsAt))}</Text>{branchName && <Text style={{ fontSize: '14px', color: '#475467', marginTop: '6px' }}>{locale === 'ar' ? `الفرع: ${branchName}` : `Branch: ${branchName}`}{branchAddress ? ` (${branchAddress})` : ''}</Text>}<Section style={{ margin: '28px 0' }}><Button href={url} style={{ backgroundColor: '#142033', borderRadius: '8px', color: '#fff', display: 'inline-block', fontSize: '15px', padding: '13px 18px', textDecoration: 'none' }}>{c.bookingCta}</Button></Section></Shell>
}

export type EmailLocale = Locale
export function BookingCancellationEmail({ locale = 'ar', url, startsAt }: { locale?: Locale; url: string; startsAt: string }) {
  const c = copy[locale]
  return <Shell locale={locale}><Heading style={{ fontSize: '28px', lineHeight: '36px' }}>{c.cancelTitle}</Heading><Text style={{ fontSize: '16px', lineHeight: '26px' }}>{c.cancelBody}</Text><Text style={{ fontSize: '15px', fontWeight: 700 }}>{c.bookingDate}: {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(startsAt))}</Text><Section style={{ margin: '28px 0' }}><Button href={url} style={{ backgroundColor: '#142033', borderRadius: '8px', color: '#fff', display: 'inline-block', fontSize: '15px', padding: '13px 18px', textDecoration: 'none' }}>{c.cancelCta}</Button></Section></Shell>
}

export function BookingReminderEmail({ locale = 'ar', url, startsAt, branchName, branchAddress }: { locale?: Locale; url: string; startsAt: string; branchName?: string; branchAddress?: string }) {
  const c = copy[locale]
  return <Shell locale={locale}><Heading style={{ fontSize: '28px', lineHeight: '36px' }}>{c.reminderTitle}</Heading><Text style={{ fontSize: '16px', lineHeight: '26px' }}>{c.reminderBody}</Text><Text style={{ fontSize: '15px', fontWeight: 700 }}>{c.reminderDate}: {new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(startsAt))}</Text>{branchName && <Text style={{ fontSize: '14px', color: '#475467', marginTop: '6px' }}>{locale === 'ar' ? `الفرع: ${branchName}` : `Branch: ${branchName}`}{branchAddress ? ` (${branchAddress})` : ''}</Text>}<Section style={{ margin: '28px 0' }}><Button href={url} style={{ backgroundColor: '#142033', borderRadius: '8px', color: '#fff', display: 'inline-block', fontSize: '15px', padding: '13px 18px', textDecoration: 'none' }}>{c.reminderCta}</Button></Section></Shell>
}

export type EmailTemplate = 'verify' | 'reset' | 'booking' | 'cancellation' | 'reminder' | 'invite'
export const emailSubjects = {
  ar: { verify: 'تأكيد بريدك الإلكتروني في idarty', reset: 'إعادة تعيين كلمة المرور في idarty', booking: 'تم تأكيد موعدك في idarty', cancellation: 'تم إلغاء موعدك في idarty', reminder: 'تذكير بموعدك القادم في idarty', invite: 'دعوة للانضمام إلى مساحة العمل في idarty' },
  en: { verify: 'Verify your email for idarty', reset: 'Reset your idarty password', booking: 'Your idarty appointment is confirmed', cancellation: 'Your idarty appointment was cancelled', reminder: 'Reminder for your upcoming idarty appointment', invite: 'Invitation to join workspace on idarty' },
} as const
