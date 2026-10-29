// URL slugs for user-supplied names (branch names in particular).
//
// Arabic names are transliterated so an Arabic-only branch still gets a readable
// slug instead of a fallback. Kept framework-free so both server actions and any
// client preview can use it.

const ARABIC_MAP: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'a', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j',
  'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'th', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
  'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q',
  'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a',
  'ة': 'a', 'ء': '', 'ئ': 'y', 'ؤ': 'w', 'لا': 'la',
}

export function slugifyName(text: string): string {
  const transliterated = text
    .split('')
    .map((character) => ARABIC_MAP[character] ?? character)
    .join('')
  const result = transliterated
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return result || `branch-${Date.now().toString(36)}`
}
