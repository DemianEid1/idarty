'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowUpDown,
  Calendar,
  FileText,
  Mail,
  Phone,
  Search,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Serialisable types — all Dates are ISO strings so they survive the
// server → client prop boundary without React complaining about non-plain
// values.
// ---------------------------------------------------------------------------
export type CustomerRow = {
  id: string
  name: string
  phone: string
  email: string | null
  createdAt: string // ISO
  notes: string | null
  preferredLocale: string | null
}

export type CustomerBookingStat = {
  customerId: string
  bookingCount: number
  lastBookingAt: string | null // ISO or null
}

export type CustomerFilter = 'all' | 'returning' | 'new' | 'has_notes'
export type CustomerSort = 'newest' | 'bookings' | 'recent_visit' | 'name'

type Props = {
  customerRows: CustomerRow[]
  customerBookingStats: CustomerBookingStat[]
  customerCount: number
  newThisMonth: number
  returningCount: number
  notesCount: number
  customerSearch: string
  currentFilter: CustomerFilter
  currentSort: CustomerSort
  page: number
  pageSize: number
  customerSearchTotal: number
  locale: string
  rtl: boolean
}

export function CustomersTab({
  customerRows,
  customerBookingStats,
  customerCount,
  newThisMonth,
  returningCount,
  notesCount,
  customerSearch,
  currentFilter,
  currentSort,
  page,
  pageSize,
  customerSearchTotal,
  locale,
  rtl,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [searchValue, setSearchValue] = useState(customerSearch)
  const router = useRouter()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Navigate with updated searchParams (preserving active filters/sort/search)
  const updateParams = useCallback(
    (updates: { q?: string; filter?: CustomerFilter; sort?: CustomerSort; page?: number }) => {
      setOpenId(null)
      const currentSearchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
      const branchParam = currentSearchParams.get('branch')
      const params = new URLSearchParams()
      params.set('tab', 'customers')
      if (branchParam && branchParam !== 'all') params.set('branch', branchParam)

      const q = updates.q !== undefined ? updates.q : searchValue
      const f = updates.filter !== undefined ? updates.filter : currentFilter
      const s = updates.sort !== undefined ? updates.sort : currentSort
      const p = updates.page !== undefined ? updates.page : 1

      if (q.trim()) params.set('q', q.trim())
      if (f && f !== 'all') params.set('filter', f)
      if (s && s !== 'newest') params.set('sort', s)
      if (p > 1) params.set('page', String(p))

      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [router, searchValue, currentFilter, currentSort]
  )

  // Debounced search: fires 350 ms after the user stops typing.
  const handleSearch = useCallback(
    (value: string) => {
      setSearchValue(value)
      setOpenId(null)

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        updateParams({ q: value, page: 1 })
      }, 350)
    },
    [updateParams]
  )

  // Instant clear for search input
  const handleClearSearch = useCallback(() => {
    setSearchValue('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    updateParams({ q: '', page: 1 })
  }, [updateParams])

  // Sync controlled input if the URL search term changes
  useEffect(() => {
    setSearchValue(customerSearch)
  }, [customerSearch])

  // Build a fast lookup map once per render
  const statsMap = new Map(
    customerBookingStats.map((s) => [
      s.customerId,
      { bookingCount: s.bookingCount, lastBookingAt: s.lastBookingAt },
    ])
  )

  const fmt = (iso: string | null) => {
    if (!iso) return null
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso))
  }

  const t = {
    totalCustomers: locale === 'ar' ? 'إجمالي العملاء' : 'Total customers',
    newThisMonth: locale === 'ar' ? 'جدد هذا الشهر' : 'New this month',
    returning: locale === 'ar' ? 'عملاء عائدون' : 'Returning customers',
    notesBadge: locale === 'ar' ? 'ملاحظات مسجلة' : 'With notes',
    searchPlaceholder:
      locale === 'ar'
        ? 'ابحث بالاسم، رقم الهاتف، أو البريد...'
        : 'Search by name, phone, or email…',
    searchLabel: locale === 'ar' ? 'البحث في العملاء' : 'Search customers',
    clearSearch: locale === 'ar' ? 'مسح البحث' : 'Clear search',
    sortLabel: locale === 'ar' ? 'ترتيب حسب' : 'Sort by',
    sortNewest: locale === 'ar' ? 'الأحدث تسجيلاً' : 'Newest registered',
    sortBookings: locale === 'ar' ? 'الأكثر حجزاً' : 'Most bookings',
    sortRecentVisit: locale === 'ar' ? 'آخر زيارة' : 'Recent visit',
    sortName: locale === 'ar' ? 'الاسم (أ - ي)' : 'Name (A–Z)',
    filterAriaLabel: locale === 'ar' ? 'تصفية العملاء' : 'Filter customers',
    filterAll: locale === 'ar' ? 'الكل' : 'All',
    filterReturning: locale === 'ar' ? 'عائدون' : 'Returning',
    filterNew: locale === 'ar' ? 'جدد هذا الشهر' : 'New this month',
    filterHasNotes: locale === 'ar' ? 'لديهم ملاحظات' : 'Has notes',
    resetFilters: locale === 'ar' ? 'إعادة ضبط التصفية' : 'Reset filters',
    noCustomers: locale === 'ar' ? 'لا يوجد عملاء بعد.' : 'No customers yet.',
    noResults: locale === 'ar' ? 'لا توجد نتائج مطابقة.' : 'No matching customers.',
    noCustomersHint:
      locale === 'ar'
        ? 'سيظهر العملاء هنا بعد أول حجز.'
        : 'Customers will appear here after the first booking.',
    noResultsHint:
      locale === 'ar'
        ? 'جرّب تغيير التصفية أو مسح كلمة البحث.'
        : 'Try changing the filter or clearing the search term.',
    contact: locale === 'ar' ? 'بيانات التواصل' : 'Contact',
    prefLang: locale === 'ar' ? 'اللغة المفضلة:' : 'Preferred language:',
    arabic: 'العربية',
    english: 'English',
    bookingHistory: locale === 'ar' ? 'سجل الحجوزات' : 'Booking history',
    lastVisit: locale === 'ar' ? 'آخر زيارة:' : 'Last visit:',
    since: locale === 'ar' ? 'عميل منذ:' : 'Customer since:',
    notes: locale === 'ar' ? 'ملاحظات' : 'Notes',
    hideDetails: locale === 'ar' ? '← إخفاء التفاصيل' : 'Hide details →',
    customers: locale === 'ar' ? 'العملاء' : 'Customers',
    latestBookedWith: locale === 'ar' ? 'آخر العملاء الذين حجزوا معك.' : 'The latest customers who booked with you.',
    previous: locale === 'ar' ? 'السابق' : 'Previous',
    next: locale === 'ar' ? 'التالي' : 'Next',
    results: (n: number) =>
      locale === 'ar' ? `${n} نتيجة` : `${n} result${n === 1 ? '' : 's'}`,
    resultsFor: (q: string) =>
      locale === 'ar' ? `نتائج: "${q}"` : `Results for "${q}"`,
    nBookings: (n: number) =>
      locale === 'ar'
        ? n === 1
          ? 'حجز'
          : 'حجوزات'
        : n === 1
          ? 'booking'
          : 'bookings',
    nBookingsTotal: (n: number) =>
      locale === 'ar'
        ? n === 1
          ? 'حجز إجمالاً'
          : 'حجوزات إجمالاً'
        : n === 1
          ? 'booking total'
          : 'bookings total',
  }

  const filterPills: Array<{
    id: CustomerFilter
    label: string
    count: number
    icon: React.ReactNode
  }> = [
    {
      id: 'all',
      label: t.filterAll,
      count: customerCount,
      icon: <Users className="h-3.5 w-3.5" aria-hidden="true" />,
    },
    {
      id: 'returning',
      label: t.filterReturning,
      count: returningCount,
      icon: <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />,
    },
    {
      id: 'new',
      label: t.filterNew,
      count: newThisMonth,
      icon: <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />,
    },
    {
      id: 'has_notes',
      label: t.filterHasNotes,
      count: notesCount,
      icon: <FileText className="h-3.5 w-3.5" aria-hidden="true" />,
    },
  ]

  const getPageUrl = (p: number) => {
    const params = new URLSearchParams()
    params.set('tab', 'customers')
    if (p > 1) params.set('page', String(p))
    if (customerSearch) params.set('q', customerSearch)
    if (currentFilter !== 'all') params.set('filter', currentFilter)
    if (currentSort !== 'newest') params.set('sort', currentSort)
    return `?${params.toString()}`
  }

  const activePill = filterPills.find((p) => p.id === currentFilter)

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* ── Stats bar ───────────────────────────────────────────────── */}
      <div className="mt-9 grid gap-4 sm:grid-cols-3">
        {[
          { icon: <Users className="h-5 w-5" aria-hidden="true" />, value: customerCount, label: t.totalCustomers },
          { icon: <TrendingUp className="h-5 w-5" aria-hidden="true" />, value: newThisMonth, label: t.newThisMonth },
          { icon: <UserCheck className="h-5 w-5" aria-hidden="true" />, value: returningCount, label: t.returning },
        ].map(({ icon, value, label }) => (
          <div key={label} className="flex items-center gap-4 rounded-2xl border border-border bg-paper p-4 shadow-float">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f0faf9] text-brand-teal">
              {icon}
            </span>
            <div>
              <p className="text-2xl font-semibold">{value}</p>
              <p className="mt-0.5 text-xs text-ink-muted">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Search & Controls Toolbar ──────────────────────────────── */}
      <div className="mt-6 space-y-3">
        {/* Row 1: Search input + Sort dropdown */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Search bar */}
          <div role="search" aria-label={t.searchLabel} className="relative flex-1 sm:max-w-md">
            <span
              className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-lighter ${
                rtl ? 'right-4' : 'left-4'
              }`}
              aria-hidden="true"
            >
              <Search className="h-4 w-4" />
            </span>
            <input
              id="customers-search"
              type="search"
              value={searchValue}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={t.searchPlaceholder}
              className={`w-full rounded-2xl border border-border bg-paper py-2.5 text-sm text-[#172033] outline-none placeholder:text-ink-lighter transition focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20 ${
                rtl ? 'pr-11 pl-10' : 'pl-11 pr-10'
              }`}
            />
            {searchValue && (
              <button
                type="button"
                onClick={handleClearSearch}
                aria-label={t.clearSearch}
                className={`absolute top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-muted transition hover:bg-surface hover:text-[#172033] ${
                  rtl ? 'left-3' : 'right-3'
                }`}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Sort dropdown */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <label htmlFor="customers-sort" className="sr-only">
              {t.sortLabel}
            </label>
            <div className="relative inline-flex items-center">
              <span
                className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-muted ${
                  rtl ? 'right-3' : 'left-3'
                }`}
                aria-hidden="true"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
              </span>
              <select
                id="customers-sort"
                value={currentSort}
                onChange={(e) => updateParams({ sort: e.target.value as CustomerSort, page: 1 })}
                className={`h-10 cursor-pointer appearance-none rounded-2xl border border-border bg-paper py-2 text-xs font-semibold text-[#172033] shadow-xs outline-none transition hover:border-brand-teal/50 focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20 ${
                  rtl ? 'pr-8 pl-8' : 'pl-8 pr-8'
                }`}
              >
                <option value="newest">{t.sortNewest}</option>
                <option value="bookings">{t.sortBookings}</option>
                <option value="recent_visit">{t.sortRecentVisit}</option>
                <option value="name">{t.sortName}</option>
              </select>
              <span
                className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-[10px] text-ink-muted ${
                  rtl ? 'left-3' : 'right-3'
                }`}
                aria-hidden="true"
              >
                ▼
              </span>
            </div>
          </div>
        </div>

        {/* Row 2: Filter Pills — 2x2 grid on mobile (no horizontal scroll), inline flex on desktop */}
        <div
          role="tablist"
          aria-label={t.filterAriaLabel}
          className="grid grid-cols-2 gap-2 text-xs sm:flex sm:flex-wrap sm:items-center sm:gap-2"
        >
          {filterPills.map((pill) => {
            const isActive = currentFilter === pill.id
            return (
              <button
                key={pill.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => updateParams({ filter: pill.id, page: 1 })}
                className={`inline-flex w-full items-center justify-between gap-1.5 rounded-xl px-3 py-2 font-semibold transition sm:w-auto sm:justify-start sm:px-3.5 sm:py-1.5 ${
                  isActive
                    ? 'bg-brand-teal text-white shadow-xs'
                    : 'border border-border bg-paper text-ink-muted hover:border-brand-teal/50 hover:text-[#172033]'
                }`}
              >
                <span className="inline-flex items-center gap-1.5 truncate">
                  {pill.icon}
                  <span className="truncate">{pill.label}</span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-surface text-ink-muted'
                  }`}
                >
                  {pill.count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Customer list card ───────────────────────────────────────── */}
      <div className="mt-4 rounded-3xl border border-border bg-paper shadow-float">
        {/* Card header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-base font-semibold">
              {customerSearch
                ? t.resultsFor(customerSearch)
                : currentFilter !== 'all' && activePill
                  ? activePill.label
                  : t.customers}
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              {customerSearch || currentFilter !== 'all'
                ? t.results(customerSearchTotal)
                : t.latestBookedWith}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-[#f0faf9] px-3 py-1 text-xs font-semibold text-brand-teal">
            {customerSearchTotal}
          </span>
        </div>

        {/* Empty state */}
        {customerRows.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f0faf9] text-brand-teal">
              <Users className="h-7 w-7" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold text-[#172033]">
              {customerSearch || currentFilter !== 'all' ? t.noResults : t.noCustomers}
            </p>
            <p className="max-w-xs text-xs text-ink-muted">
              {customerSearch || currentFilter !== 'all' ? t.noResultsHint : t.noCustomersHint}
            </p>
            {(customerSearch || currentFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchValue('')
                  updateParams({ q: '', filter: 'all', sort: 'newest', page: 1 })
                }}
                className="mt-2 rounded-xl border border-border bg-surface px-4 py-1.5 text-xs font-semibold text-[#172033] transition hover:border-brand-teal hover:text-brand-teal"
              >
                {t.resetFilters}
              </button>
            )}
          </div>
        )}

        {/* Rows */}
        {customerRows.length > 0 && (
          <ul className="divide-y divide-border" role="list">
            {customerRows.map((customer) => {
              const stats = statsMap.get(customer.id)
              const bookCount = stats?.bookingCount ?? 0
              const lastDate = fmt(stats?.lastBookingAt ?? null)
              const joinDate = fmt(customer.createdAt)
              const isOpen = openId === customer.id
              const initials = customer.name
                .split(' ')
                .slice(0, 2)
                .map((w) => w[0])
                .join('')
                .toUpperCase()

              return (
                <li key={customer.id} className="group">
                  {/* Clickable row — accordion trigger */}
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : customer.id)}
                    aria-expanded={isOpen}
                    aria-controls={`customer-detail-${customer.id}`}
                    className={`flex w-full items-center gap-4 px-5 py-4 text-start transition sm:px-6 ${
                      isOpen ? 'bg-[#f7fdfb]' : 'hover:bg-surface'
                    }`}
                  >
                    {/* Avatar */}
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e6f7f5] text-sm font-semibold text-brand-teal"
                      aria-hidden="true"
                    >
                      {initials}
                    </span>

                    {/* Name + contact */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold wrap-anywhere">{customer.name}</p>
                        {customer.notes && (
                          <span
                            title={t.notes}
                            className="inline-flex items-center rounded-md bg-amber-50 p-1 text-amber-600"
                          >
                            <FileText className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {customer.phone && (
                          <span className="flex items-center gap-1 text-xs text-ink-muted" dir="ltr">
                            <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
                            {customer.phone}
                          </span>
                        )}
                        {customer.email && (
                          <span className="flex items-center gap-1 text-xs text-ink-muted" dir="ltr">
                            <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                            {customer.email}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Booking badge + join date + chevron */}
                    <div className={`flex shrink-0 flex-col gap-1 ${rtl ? 'items-start' : 'items-end'}`}>
                      {bookCount > 0 && (
                        <span className="rounded-full bg-[#f0faf9] px-2.5 py-0.5 text-xs font-semibold text-brand-teal">
                          {bookCount} {t.nBookings(bookCount)}
                        </span>
                      )}
                      <span className="text-xs text-ink-lighter">{joinDate}</span>
                    </div>

                    {/* Chevron indicator */}
                    <span
                      className={`ms-1 shrink-0 text-ink-lighter transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                      aria-hidden="true"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path
                          d="M4 6l4 4 4-4"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>

                  {/* Accordion panel */}
                  {isOpen && (
                    <div
                      id={`customer-detail-${customer.id}`}
                      role="region"
                      aria-label={customer.name}
                      className="border-t border-dashed border-[#e5eaf4] bg-[#f7fdfb] px-5 py-5 sm:px-6"
                    >
                      <div className="grid gap-5 sm:grid-cols-2">
                        {/* Contact */}
                        <div className="space-y-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-ink-lighter">
                            {t.contact}
                          </p>
                          {customer.phone && (
                            <div className="flex items-center gap-2" dir="ltr">
                              <Phone className="h-4 w-4 shrink-0 text-ink-lighter" aria-hidden="true" />
                              <a
                                href={`tel:${customer.phone}`}
                                className="text-sm text-brand-teal hover:underline"
                              >
                                {customer.phone}
                              </a>
                            </div>
                          )}
                          {customer.email && (
                            <div className="flex items-center gap-2" dir="ltr">
                              <Mail className="h-4 w-4 shrink-0 text-ink-lighter" aria-hidden="true" />
                              <a
                                href={`mailto:${customer.email}`}
                                className="text-sm text-brand-teal hover:underline wrap-anywhere"
                              >
                                {customer.email}
                              </a>
                            </div>
                          )}
                          {customer.preferredLocale && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-xs text-ink-lighter">{t.prefLang}</span>
                              <span className="text-xs font-semibold">
                                {customer.preferredLocale === 'ar' ? t.arabic : t.english}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Booking history */}
                        <div className="space-y-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-ink-lighter">
                            {t.bookingHistory}
                          </p>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 shrink-0 text-ink-lighter" aria-hidden="true" />
                            <span className="text-sm">
                              <strong>{bookCount}</strong> {t.nBookingsTotal(bookCount)}
                            </span>
                          </div>
                          {lastDate && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-ink-lighter">{t.lastVisit}</span>
                              <span className="text-xs font-semibold">{lastDate}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-ink-lighter">{t.since}</span>
                            <span className="text-xs font-semibold">{joinDate}</span>
                          </div>
                        </div>
                      </div>

                      {/* Notes */}
                      {customer.notes && (
                        <div className="mt-4 rounded-xl border border-[#e5eaf4] bg-white px-4 py-3">
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-lighter">
                            {t.notes}
                          </p>
                          <p className="text-sm text-[#172033] wrap-anywhere">{customer.notes}</p>
                        </div>
                      )}

                      {/* Close */}
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => setOpenId(null)}
                          className="text-xs font-semibold text-ink-muted transition hover:text-brand-teal"
                        >
                          {t.hideDetails}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {/* Pagination */}
        {customerSearchTotal > pageSize && (
          <div className="flex items-center justify-center gap-3 border-t border-border px-5 py-4">
            {page > 1 && (
              <a
                href={getPageUrl(page - 1)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-ink-muted transition hover:border-brand-teal hover:text-brand-teal"
              >
                {rtl ? '→' : '←'} {t.previous}
              </a>
            )}
            <span className="text-sm text-ink-muted">
              {page} / {Math.ceil(customerSearchTotal / pageSize)}
            </span>
            {page * pageSize < customerSearchTotal && (
              <a
                href={getPageUrl(page + 1)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-ink-muted transition hover:border-brand-teal hover:text-brand-teal"
              >
                {t.next} {rtl ? '←' : '→'}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
