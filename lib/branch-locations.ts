// Branch addresses shown on the public website.
//
// The Branches tab owns the data; the website config owns only whether the
// section is displayed. Resolving rows here (instead of in each page) keeps the
// public page and the draft preview identical.

export interface BranchLocation {
  id: string
  name: string | null
  address: string
  /** Safe http(s) destination for this branch's Google Maps location. */
  googleMapsUrl: string | null
  isDefault: boolean
}

export interface BranchTranslationRow {
  branchId: string
  isDefault: boolean
  locale: string
  name: string | null
  address: string | null
  googleMapsUrl: string | null
}

/**
 * Collapse one row per (branch, locale) into one entry per branch, preferring
 * the requested locale and falling back to the other one. Branches without an
 * address are dropped — an address card with no address has nothing to show.
 *
 * Row order is preserved, so callers must order their query (default branch
 * first) if they want a deterministic first card.
 */
export function resolveBranchLocations(
  rows: readonly BranchTranslationRow[],
  locale: 'ar' | 'en'
): BranchLocation[] {
  const byBranch = new Map<
    string,
    {
      id: string
      isDefault: boolean
      googleMapsUrl: string | null
      names: Record<string, string | null>
      addresses: Record<string, string | null>
    }
  >()

  for (const row of rows) {
    const entry = byBranch.get(row.branchId) ?? {
      id: row.branchId,
      isDefault: row.isDefault,
      googleMapsUrl: row.googleMapsUrl,
      names: {},
      addresses: {},
    }
    entry.names[row.locale] = row.name
    entry.addresses[row.locale] = row.address
    byBranch.set(row.branchId, entry)
  }

  return [...byBranch.values()]
    .map((branch) => {
      const preferredFirst = (values: Record<string, string | null>) =>
        (values[locale] ?? '').trim() || (values[locale === 'ar' ? 'en' : 'ar'] ?? '').trim() || null

      return {
        id: branch.id,
        name: preferredFirst(branch.names),
        address: preferredFirst(branch.addresses) ?? '',
        googleMapsUrl: branch.googleMapsUrl,
        isDefault: branch.isDefault,
      }
    })
    .filter((branch) => branch.address !== '')
}
