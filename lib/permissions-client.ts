import type { MemberRole } from '@/lib/authz'

export type Permission =
  | 'dashboard:view'
  | 'booking:create'
  | 'booking:status'
  | 'booking:cancel'
  | 'customers:view'
  | 'customers:edit'
  | 'services:view'
  | 'services:manage'
  | 'schedule:view'
  | 'schedule:manage'
  | 'settings:capacity'
  | 'team:view'
  | 'team:activity:view'
  | 'team:invite'
  | 'team:role:manage'
  | 'team:archive'
  | 'website:manage'
  | 'workspace:manage'
  | 'workspace:owner'

export const ROLE_PERMISSIONS: Record<MemberRole, readonly Permission[]> = {
  receptionist: [
    'dashboard:view',
    'booking:create',
    'booking:status',
    'booking:cancel',
    'customers:view',
    'customers:edit',
    'services:view',
    'schedule:view',
    'team:view',
  ],
  staff: [
    'dashboard:view',
    'booking:create',
    'booking:status',
    'customers:view',
    'services:view',
    'schedule:view',
    'team:view',
  ],
  manager: [
    'dashboard:view',
    'booking:create',
    'booking:status',
    'booking:cancel',
    'customers:view',
    'customers:edit',
    'services:view',
    'services:manage',
    'schedule:view',
    'schedule:manage',
    'settings:capacity',
    'team:view',
    'team:activity:view',
    'team:invite',
    'website:manage',
  ],
  admin: [
    'dashboard:view',
    'booking:create',
    'booking:status',
    'booking:cancel',
    'customers:view',
    'customers:edit',
    'services:view',
    'services:manage',
    'schedule:view',
    'schedule:manage',
    'settings:capacity',
    'team:view',
    'team:activity:view',
    'team:invite',
    'team:role:manage',
    'team:archive',
    'website:manage',
    'workspace:manage',
  ],
  owner: [
    'dashboard:view',
    'booking:create',
    'booking:status',
    'booking:cancel',
    'customers:view',
    'customers:edit',
    'services:view',
    'services:manage',
    'schedule:view',
    'schedule:manage',
    'settings:capacity',
    'team:view',
    'team:activity:view',
    'team:invite',
    'team:role:manage',
    'team:archive',
    'website:manage',
    'workspace:manage',
    'workspace:owner',
  ],
} as const

export function hasPermission(role: MemberRole, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] as readonly Permission[]).includes(permission)
}

export const PERMISSION_LABELS: Record<Permission, { ar: { title: string; desc: string }; en: { title: string; desc: string } }> = {
  'dashboard:view': {
    ar: { title: 'عرض لوحة التحكم', desc: 'الوصول إلى لوحة التحكم الرئيسية والإحصائيات.' },
    en: { title: 'View Dashboard', desc: 'Access the main workspace dashboard and statistics.' },
  },
  'booking:create': {
    ar: { title: 'إنشاء حجز', desc: 'تسجيل حجز يدوي نيابة عن العملاء.' },
    en: { title: 'Create Booking', desc: 'Register manual bookings on behalf of customers.' },
  },
  'booking:status': {
    ar: { title: 'تحديث حالة الحجز', desc: 'تأكيد أو وضع علامة عدم حضور على الحجز.' },
    en: { title: 'Update Booking Status', desc: 'Confirm or mark bookings as no-show.' },
  },
  'booking:cancel': {
    ar: { title: 'إلغاء الحجز', desc: 'إلغاء المواعيد المحجوزة مع توضيح السبب.' },
    en: { title: 'Cancel Booking', desc: 'Cancel scheduled bookings with cancellation reasons.' },
  },
  'customers:view': {
    ar: { title: 'عرض العملاء', desc: 'الاطلاع على قائمة العملاء ومعلومات الاتصال.' },
    en: { title: 'View Customers', desc: 'View customer directory and contact information.' },
  },
  'customers:edit': {
    ar: { title: 'تعديل العملاء', desc: 'إدارة وتحديث بيانات وسجلات العملاء.' },
    en: { title: 'Edit Customers', desc: 'Manage and update customer details and records.' },
  },
  'services:view': {
    ar: { title: 'عرض الخدمات', desc: 'الاطلاع على الخدمات المتاحة وأسعارها.' },
    en: { title: 'View Services', desc: 'View services list, durations and prices.' },
  },
  'services:manage': {
    ar: { title: 'إدارة الخدمات', desc: 'إضافة، تعديل، وحذف الخدمات المعروضة.' },
    en: { title: 'Manage Services', desc: 'Create, update, and remove offered services.' },
  },
  'schedule:view': {
    ar: { title: 'عرض ساعات العمل', desc: 'الاطلاع على جدول وساعات العمل العامة.' },
    en: { title: 'View Schedule', desc: 'View regular working hours and availability.' },
  },
  'schedule:manage': {
    ar: { title: 'إدارة ساعات العمل', desc: 'تعديل ساعات العمل اليومية واستثناءات العطلات.' },
    en: { title: 'Manage Schedule', desc: 'Update weekly hours and date holiday overrides.' },
  },
  'settings:capacity': {
    ar: { title: 'تعديل الطاقة الاستيعابية', desc: 'تحديد الحد الأقصى للحجوزات المتزامنة.' },
    en: { title: 'Manage Capacity', desc: 'Configure concurrent booking capacity.' },
  },
  'team:view': {
    ar: { title: 'عرض الفريق', desc: 'الاطلاع على قائمة أعضاء الفريق.' },
    en: { title: 'View Team', desc: 'View team members directory.' },
  },
  'team:activity:view': {
    ar: { title: 'عرض سجل نشاط الفريق', desc: 'الاطلاع على السجل الزمني للأفعال الإدارية.' },
    en: { title: 'View Staff Activity Log', desc: 'Audit history and action log for staff members.' },
  },
  'team:invite': {
    ar: { title: 'دعوة أعضاء الفريق', desc: 'إرسال دعوات وإضافة موظفين جدد.' },
    en: { title: 'Invite Staff', desc: 'Invite and onboard new staff members.' },
  },
  'team:role:manage': {
    ar: { title: 'إدارة أدوار الفريق', desc: 'ترقية وتعديل أدوار ومسميات الموظفين.' },
    en: { title: 'Manage Staff Roles', desc: 'Promote, demote, and modify staff roles.' },
  },
  'team:archive': {
    ar: { title: 'أرشفة الموظفين', desc: 'تعطيل حسابات الموظفين وإيقاف وصولهم.' },
    en: { title: 'Archive Staff', desc: 'Deactivate staff accounts and revoke access.' },
  },
  'website:manage': {
    ar: { title: 'إدارة الموقع العام', desc: 'تخصيص محتوى الموقع، الأقسام، ونشر التحديثات.' },
    en: { title: 'Manage Website', desc: 'Edit website layout, content, and publish changes.' },
  },
  'workspace:manage': {
    ar: { title: 'إدارة مساحة العمل', desc: 'تعديل الإعدادات الأساسية والهوية.' },
    en: { title: 'Manage Workspace', desc: 'Update core workspace settings and identity.' },
  },
  'workspace:owner': {
    ar: { title: 'صلاحيات المالك الكاملة', desc: 'التحكم الإداري والمالي الكامل بالمساحة.' },
    en: { title: 'Full Workspace Ownership', desc: 'Complete administrative and financial control.' },
  },
}
