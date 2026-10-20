import type { Locale } from '@/lib/i18n'

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'

export const ALL_BOOKING_STATUSES: BookingStatus[] = [
  'pending',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
]

export const statusColors: Record<BookingStatus, string> = {
  confirmed: 'bg-[#eaf8f1] text-[#24865b]',
  pending: 'bg-[#fef9c3] text-[#854d0e]',
  completed: 'bg-[#eff6ff] text-[#1d4ed8]',
  cancelled: 'bg-[#fdf2f2] text-[#b42318]',
  no_show: 'bg-[#f1f5f9] text-[#475569]',
}

export const statusText: Record<BookingStatus, Record<Locale, string>> = {
  pending: { ar: 'قيد الانتظار', en: 'Pending' },
  confirmed: { ar: 'مؤكد', en: 'Confirmed' },
  completed: { ar: 'مكتمل', en: 'Completed' },
  cancelled: { ar: 'ملغى', en: 'Cancelled' },
  no_show: { ar: 'لم يحضر', en: 'No-show' },
}

export function getStatusColor(status: string): string {
  return statusColors[status as BookingStatus] ?? statusColors.confirmed
}

export function getStatusLabel(status: string, locale: Locale): string {
  return statusText[status as BookingStatus]?.[locale] ?? status
}
