// Typed mirror of db/migrations/*.sql for Drizzle queries.
// The SQL migrations are the source of truth (exclusion constraint, composite FKs,
// triggers and partial indexes live there). Update this file whenever a migration changes a table.
import {
  bigint,
  boolean,
  char,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

const tsz = (name: string) => timestamp(name, { withTimezone: true })

export const appLocale = pgEnum('app_locale', ['ar', 'en'])
export const tenantStatus = pgEnum('tenant_status', ['active', 'suspended', 'archived'])
export const memberRole = pgEnum('member_role', ['owner', 'admin', 'manager', 'staff', 'receptionist'])
export const memberStatus = pgEnum('member_status', ['active', 'invited', 'suspended'])
export const bookingStatus = pgEnum('booking_status', ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'])
export const bookingSource = pgEnum('booking_source', ['online', 'dashboard'])
export const dateOverrideKind = pgEnum('date_override_kind', ['closed', 'custom_hours'])
export const notificationType = pgEnum('notification_type', [
  'booking_confirmation',
  'booking_reminder',
  'booking_cancelled',
  'booking_rescheduled',
])
export const notificationChannel = pgEnum('notification_channel', ['email'])
export const notificationStatus = pgEnum('notification_status', ['pending', 'processing', 'sent', 'failed', 'skipped'])
export const cronRunStatus = pgEnum('cron_run_status', ['running', 'succeeded', 'failed'])

// --- Better Auth -----------------------------------------------------------
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  preferredLocale: text('preferredLocale').notNull().default('ar'),
  isPlatformAdmin: boolean('isPlatformAdmin').notNull().default(false),
  createdAt: tsz('createdAt').notNull().defaultNow(),
  updatedAt: tsz('updatedAt').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: tsz('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: tsz('createdAt').notNull().defaultNow(),
  updatedAt: tsz('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: tsz('accessTokenExpiresAt'),
  refreshTokenExpiresAt: tsz('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: tsz('createdAt').notNull().defaultNow(),
  updatedAt: tsz('updatedAt').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: tsz('expiresAt').notNull(),
  createdAt: tsz('createdAt').defaultNow(),
  updatedAt: tsz('updatedAt').defaultNow(),
})

// --- Tenants ---------------------------------------------------------------
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  status: tenantStatus('status').notNull().default('active'),
  plan: text('plan').notNull().default('free'),
  businessType: text('business_type').notNull().default('salon'),
  defaultLocale: appLocale('default_locale').notNull().default('ar'),
  supportedLocales: appLocale('supported_locales').array().notNull().default(['ar', 'en']),
  timezone: text('timezone').notNull().default('Africa/Cairo'),
  currency: char('currency', { length: 3 }).notNull().default('EGP'),
  countryCode: char('country_code', { length: 2 }).notNull().default('EG'),
  weekStartDay: text('week_start_day').notNull().default('saturday'),
  numberingSystem: text('numbering_system').notNull().default('latn'),
  phoneE164: text('phone_e164'),
  email: text('email'),
  theme: jsonb('theme').$type<Record<string, string>>().notNull().default({}),
  createdAt: tsz('created_at').notNull().defaultNow(),
  updatedAt: tsz('updated_at').notNull().defaultNow(),
  deletedAt: tsz('deleted_at'),
})

export const tenantTranslations = pgTable(
  'tenant_translations',
  {
    tenantId: uuid('tenant_id').notNull(),
    locale: appLocale('locale').notNull(),
    name: text('name').notNull(),
    tagline: text('tagline'),
    description: text('description'),
    address: text('address'),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.locale] })],
)

export const memberships = pgTable('memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  role: memberRole('role').notNull(),
  status: memberStatus('status').notNull().default('active'),
  createdAt: tsz('created_at').notNull().defaultNow(),
  updatedAt: tsz('updated_at').notNull().defaultNow(),
})

// --- Catalog ---------------------------------------------------------------
export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  durationMin: integer('duration_min').notNull(),
  bufferBeforeMin: integer('buffer_before_min').notNull().default(0),
  bufferAfterMin: integer('buffer_after_min').notNull().default(0),
  priceAmount: numeric('price_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  isActive: boolean('is_active').notNull().default(true),
  isSample: boolean('is_sample').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  image: text('image'),
  // Focal point for the optional service image, as percentages. NULL means the
  // centre — the crop position already in use — so existing rows need no backfill.
  //
  // LEGACY: superseded by the crop rectangle below. Retained (and still
  // populated when a crop is confirmed) so any row or code path that reads the
  // focal point keeps working. Not exposed in the UI any more.
  imageFocalX: smallint('image_focal_x'),
  imageFocalY: smallint('image_focal_y'),
  // The crop the tenant framed in the cropper, as fractions of the source image
  // (numeric(5,4) => 0.0000..1.0000). All NULL means "show the whole image",
  // which is how every image uploaded before this feature renders.
  imageCropX: numeric('image_crop_x', { precision: 5, scale: 4 }),
  imageCropY: numeric('image_crop_y', { precision: 5, scale: 4 }),
  imageCropWidth: numeric('image_crop_width', { precision: 5, scale: 4 }),
  imageCropHeight: numeric('image_crop_height', { precision: 5, scale: 4 }),
  createdAt: tsz('created_at').notNull().defaultNow(),
  updatedAt: tsz('updated_at').notNull().defaultNow(),
  deletedAt: tsz('deleted_at'),
})

export const serviceTranslations = pgTable(
  'service_translations',
  {
    tenantId: uuid('tenant_id').notNull(),
    serviceId: uuid('service_id').notNull(),
    locale: appLocale('locale').notNull(),
    name: text('name').notNull(),
    description: text('description'),
  },
  (t) => [primaryKey({ columns: [t.serviceId, t.locale] })],
)

export const staff = pgTable('staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  membershipId: uuid('membership_id'),
  email: text('email'),
  phoneE164: text('phone_e164'),
  color: text('color'),
  isActive: boolean('is_active').notNull().default(true),
  isSample: boolean('is_sample').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: tsz('created_at').notNull().defaultNow(),
  updatedAt: tsz('updated_at').notNull().defaultNow(),
  deletedAt: tsz('deleted_at'),
})

export const staffTranslations = pgTable(
  'staff_translations',
  {
    tenantId: uuid('tenant_id').notNull(),
    staffId: uuid('staff_id').notNull(),
    locale: appLocale('locale').notNull(),
    name: text('name').notNull(),
    title: text('title'),
    bio: text('bio'),
  },
  (t) => [primaryKey({ columns: [t.staffId, t.locale] })],
)

export const staffServices = pgTable(
  'staff_services',
  {
    tenantId: uuid('tenant_id').notNull(),
    staffId: uuid('staff_id').notNull(),
    serviceId: uuid('service_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.staffId, t.serviceId] })],
)

// --- Availability ----------------------------------------------------------
export const workingHours = pgTable('working_hours', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  staffId: uuid('staff_id'),
  weekday: smallint('weekday').notNull(),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  isSample: boolean('is_sample').notNull().default(false),
})

export const dateOverrides = pgTable('date_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  staffId: uuid('staff_id'),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  kind: dateOverrideKind('kind').notNull(),
  startTime: time('start_time'),
  endTime: time('end_time'),
  label: text('label'),
  createdAt: tsz('created_at').notNull().defaultNow(),
})

// --- Customers & bookings --------------------------------------------------
export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  fullName: text('full_name').notNull(),
  nameNormalized: text('name_normalized').notNull(),
  phoneE164: text('phone_e164').notNull(),
  email: text('email'),
  preferredLocale: appLocale('preferred_locale'),
  notes: text('notes'),
  createdAt: tsz('created_at').notNull().defaultNow(),
  updatedAt: tsz('updated_at').notNull().defaultNow(),
  deletedAt: tsz('deleted_at'),
})

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  customerId: uuid('customer_id').notNull(),
  status: bookingStatus('status').notNull().default('confirmed'),
  source: bookingSource('source').notNull(),
  locale: appLocale('locale').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  startsAt: tsz('starts_at').notNull(),
  endsAt: tsz('ends_at').notNull(),
  customerNote: text('customer_note'),
  internalNote: text('internal_note'),
  createdByUserId: text('created_by_user_id'),
  cancelledAt: tsz('cancelled_at'),
  cancelReason: text('cancel_reason'),
  createdAt: tsz('created_at').notNull().defaultNow(),
  updatedAt: tsz('updated_at').notNull().defaultNow(),
  deletedAt: tsz('deleted_at'),
})

export const bookingItems = pgTable('booking_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  bookingId: uuid('booking_id').notNull(),
  serviceId: uuid('service_id').notNull(),
  staffId: uuid('staff_id').notNull(),
  startsAt: tsz('starts_at').notNull(),
  endsAt: tsz('ends_at').notNull(),
  blockStartsAt: tsz('block_starts_at').notNull(),
  blockEndsAt: tsz('block_ends_at').notNull(),
  // Set by the booking_items_status_on_insert trigger from bookings.status.
  status: bookingStatus('status').notNull().default('confirmed'),
  priceAmount: numeric('price_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  sortOrder: integer('sort_order').notNull().default(0),
})

// --- Public content --------------------------------------------------------
export const faqs = pgTable('faqs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: tsz('created_at').notNull().defaultNow(),
  deletedAt: tsz('deleted_at'),
})

export const faqTranslations = pgTable(
  'faq_translations',
  {
    tenantId: uuid('tenant_id').notNull(),
    faqId: uuid('faq_id').notNull(),
    locale: appLocale('locale').notNull(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
  },
  (t) => [primaryKey({ columns: [t.faqId, t.locale] })],
)

export const pageSeo = pgTable('page_seo', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  pageKey: text('page_key').notNull(),
})

export const pageSeoTranslations = pgTable(
  'page_seo_translations',
  {
    tenantId: uuid('tenant_id').notNull(),
    pageSeoId: uuid('page_seo_id').notNull(),
    locale: appLocale('locale').notNull(),
    title: text('title').notNull(),
    description: text('description'),
  },
  (t) => [primaryKey({ columns: [t.pageSeoId, t.locale] })],
)

// --- Notifications ---------------------------------------------------------
export const notificationTemplates = pgTable('notification_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'),
  type: notificationType('type').notNull(),
  channel: notificationChannel('channel').notNull().default('email'),
  isActive: boolean('is_active').notNull().default(true),
})

export const notificationTemplateTranslations = pgTable(
  'notification_template_translations',
  {
    templateId: uuid('template_id').notNull(),
    locale: appLocale('locale').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
  },
  (t) => [primaryKey({ columns: [t.templateId, t.locale] })],
)

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  bookingId: uuid('booking_id'),
  type: notificationType('type').notNull(),
  channel: notificationChannel('channel').notNull().default('email'),
  locale: appLocale('locale').notNull(),
  recipient: text('recipient').notNull(),
  dedupeKey: text('dedupe_key').notNull(),
  scheduledAt: tsz('scheduled_at').notNull(),
  status: notificationStatus('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lockedAt: tsz('locked_at'),
  sentAt: tsz('sent_at'),
  providerMessageId: text('provider_message_id'),
  lastError: text('last_error'),
  createdAt: tsz('created_at').notNull().defaultNow(),
  updatedAt: tsz('updated_at').notNull().defaultNow(),
})

export const cronRuns = pgTable('cron_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  job: text('job').notNull(),
  status: cronRunStatus('status').notNull().default('running'),
  startedAt: tsz('started_at').notNull().defaultNow(),
  finishedAt: tsz('finished_at'),
  stats: jsonb('stats').$type<Record<string, unknown>>().notNull().default({}),
  error: text('error'),
})

// --- Audit / rate limit / dev outbox ---------------------------------------
export const auditLogs = pgTable('audit_logs', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  tenantId: uuid('tenant_id'),
  actorUserId: text('actor_user_id'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: tsz('created_at').notNull().defaultNow(),
})

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  windowStartedAt: tsz('window_started_at').notNull(),
})

export const devEmailOutbox = pgTable('dev_email_outbox', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  toAddress: text('to_address').notNull(),
  subject: text('subject').notNull(),
  locale: appLocale('locale').notNull(),
  html: text('html').notNull(),
  createdAt: tsz('created_at').notNull().defaultNow(),
})

// --- Website Builder -------------------------------------------------------
export const websiteConfig = pgTable('website_config', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),
  draft: jsonb('draft').$type<Record<string, unknown>>().notNull().default({}),
  published: jsonb('published').$type<Record<string, unknown>>(),
  publishedAt: tsz('published_at'),
  publishedBy: text('published_by').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: tsz('updated_at').notNull().defaultNow(),
})

export type Locale = (typeof appLocale.enumValues)[number]
export type MemberRole = (typeof memberRole.enumValues)[number]
