/* Category grid layout helpers. The first 16 categories are the original set; the rest are the newer
 * categories, shown as their own block so every row stays full on phones, tablets and desktops. */

export const ORIGINAL_COUNT = 16
export function catGroups<T>(cats: T[]): [T[], T[]] { return [cats.slice(0, ORIGINAL_COUNT), cats.slice(ORIGINAL_COUNT)] }

type Bp = 'base' | 'sm' | 'md' | 'lg' | 'xl'
// Literal class names so Tailwind keeps them.
const SPAN: Record<Bp, string[]> = {
  base: ['', 'col-span-1', 'col-span-2', 'col-span-3', 'col-span-4', 'col-span-5', 'col-span-6'],
  sm: ['', 'sm:col-span-1', 'sm:col-span-2', 'sm:col-span-3', 'sm:col-span-4', 'sm:col-span-5', 'sm:col-span-6'],
  md: ['', 'md:col-span-1', 'md:col-span-2', 'md:col-span-3', 'md:col-span-4', 'md:col-span-5', 'md:col-span-6'],
  lg: ['', 'lg:col-span-1', 'lg:col-span-2', 'lg:col-span-3', 'lg:col-span-4', 'lg:col-span-5', 'lg:col-span-6'],
  xl: ['', 'xl:col-span-1', 'xl:col-span-2', 'xl:col-span-3', 'xl:col-span-4', 'xl:col-span-5', 'xl:col-span-6'],
}
const COLS: Record<Bp, string[]> = {
  base: ['', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-5', 'grid-cols-6'],
  sm: ['', 'sm:grid-cols-1', 'sm:grid-cols-2', 'sm:grid-cols-3', 'sm:grid-cols-4', 'sm:grid-cols-5', 'sm:grid-cols-6'],
  md: ['', 'md:grid-cols-1', 'md:grid-cols-2', 'md:grid-cols-3', 'md:grid-cols-4', 'md:grid-cols-5', 'md:grid-cols-6'],
  lg: ['', 'lg:grid-cols-1', 'lg:grid-cols-2', 'lg:grid-cols-3', 'lg:grid-cols-4', 'lg:grid-cols-5', 'lg:grid-cols-6'],
  xl: ['', 'xl:grid-cols-1', 'xl:grid-cols-2', 'xl:grid-cols-3', 'xl:grid-cols-4', 'xl:grid-cols-5', 'xl:grid-cols-6'],
}

/** How many columns item i should span so the last row of n items fills c columns with no gap. */
export function spanFor(i: number, n: number, c: number) {
  const r = n % c
  if (!r || i < n - r) return 1
  const k = i - (n - r)
  return Math.floor(c / r) + (k < c % r ? 1 : 0)
}

/** Pick the largest column count from `prefer` that divides n evenly, so no spans are needed. */
export function evenCols(n: number, prefer: number[]) { return prefer.find((c) => n % c === 0) ?? prefer[0] }

export type Layout = Partial<Record<Bp, number>>
/** Grid column classes for a layout. */
export const colsClass = (l: Layout) => (Object.keys(l) as Bp[]).map((b) => COLS[b][l[b]!]).join(' ')
/** Span classes for item i of n under a layout, filling every last row. */
export function spanClass(i: number, n: number, l: Layout) {
  return (Object.keys(l) as Bp[]).map((b) => { const s = spanFor(i, n, l[b]!); return s === 1 && b === 'base' ? '' : SPAN[b][s] }).join(' ').trim()
}
