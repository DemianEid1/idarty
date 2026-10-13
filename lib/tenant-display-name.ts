/**
 * The workspace's display name.
 *
 * Its localized translation is preferred, falling back to the slug when a
 * translation row is missing. Shared so the persistent shell (layout) and the
 * page's public-website card resolve the name the same way — the shell can only
 * query the translation row once, and the page already has it in hand.
 */
export function resolveTenantDisplayName(
  translation: { name?: string | null } | null | undefined,
  slug: string
): string {
  return translation?.name?.trim() || slug
}
