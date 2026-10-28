/* Smart split points for Split PDF: by bookmarks, by text match, and at blank or QR separator pages.
 * Pure helpers (groupsFromStarts, groupsFromSeparators, textStarts, inkRatio) are tested in scripts/tests/b1/split.test.mjs. */

export interface SplitPlan { groups: number[][]; labels: string[]; dropped: number[] }

/** Build page groups from 0-based start indexes. Pages before the first start become their own group. */
export function groupsFromStarts(starts: number[], total: number, labels: string[] = []): SplitPlan {
  const pairs = starts.map((s, i) => ({ s, l: labels[i] ?? '' })).filter((p) => p.s >= 0 && p.s < total).sort((a, b) => a.s - b.s)
  const uniq: { s: number; l: string }[] = []
  for (const p of pairs) if (!uniq.length || uniq[uniq.length - 1].s !== p.s) uniq.push(p)
  if (!uniq.length) return { groups: total ? [Array.from({ length: total }, (_, i) => i)] : [], labels: [''], dropped: [] }
  if (uniq[0].s > 0) uniq.unshift({ s: 0, l: 'front' })
  const groups: number[][] = [], outLabels: string[] = []
  uniq.forEach((p, k) => {
    const end = k + 1 < uniq.length ? uniq[k + 1].s : total
    groups.push(Array.from({ length: end - p.s }, (_, i) => p.s + i))
    outLabels.push(p.l)
  })
  return { groups, labels: outLabels, dropped: [] }
}

/** Split at separator pages. With drop, separator pages are left out; otherwise each separator starts the next part. */
export function groupsFromSeparators(isSep: boolean[], drop: boolean, codes: (string | null)[] = []): SplitPlan {
  const groups: number[][] = [], labels: string[] = [], dropped: number[] = []
  let cur: number[] = [], curLabel = ''
  const flush = () => { if (cur.length) { groups.push(cur); labels.push(curLabel) } cur = [] }
  isSep.forEach((sep, i) => {
    if (sep) {
      flush()
      curLabel = codes[i] ?? ''
      if (drop) { dropped.push(i); return }
    }
    cur.push(i)
  })
  flush()
  return { groups, labels, dropped }
}

/** Pages (0-based) whose text matches the query. */
export function textStarts(pages: string[], query: string, o: { regex?: boolean; caseSensitive?: boolean } = {}): { starts: number[]; labels: string[]; error: string | null } {
  const q = query.trim()
  if (!q) return { starts: [], labels: [], error: null }
  let re: RegExp
  try { re = o.regex ? new RegExp(q, o.caseSensitive ? '' : 'i') : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), o.caseSensitive ? '' : 'i') } catch { return { starts: [], labels: [], error: 'That pattern is not a valid regular expression.' } }
  const starts: number[] = [], labels: string[] = []
  pages.forEach((t, i) => {
    const m = re.exec(t)
    if (m) {
      starts.push(i)
      // label: the rest of the matching line, trimmed, for nicer file names
      const lineEnd = t.indexOf('\n', m.index)
      labels.push(t.slice(m.index, lineEnd < 0 ? undefined : lineEnd).trim().slice(0, 40))
    }
  })
  return { starts, labels, error: null }
}

/** Share of dark pixels in RGBA data, ignoring a margin around the edges (scanner borders, punch holes). */
export function inkRatio(data: Uint8ClampedArray | Uint8Array, w: number, h: number, margin = 0.04, threshold = 200): number {
  const mx = Math.floor(w * margin), my = Math.floor(h * margin)
  let dark = 0, total = 0
  for (let y = my; y < h - my; y++) {
    for (let x = mx; x < w - mx; x++) {
      const i = (y * w + x) * 4
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      if (l < threshold) dark++
      total++
    }
  }
  return total ? dark / total : 0
}

/** Safe file-name fragment from a bookmark title or matched text. */
export const slugPart = (s: string) => s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40).toLowerCase()

/* ---------------- browser-only helpers (pdf.js) ---------------- */

/** Bookmark starts at the given depth (1 = top level, 2 = include sub-chapters). */
export async function bookmarkStarts(doc: any, depth: number): Promise<{ starts: number[]; labels: string[] }> {
  const outline = (await doc.getOutline()) ?? []
  const starts: number[] = [], labels: string[] = []
  const walk = async (items: any[], level: number) => {
    for (const it of items) {
      try {
        let dest = it.dest
        if (typeof dest === 'string') dest = await doc.getDestination(dest)
        if (Array.isArray(dest) && dest[0] != null) {
          const ref = dest[0]
          const idx = typeof ref === 'number' ? ref : await doc.getPageIndex(ref)
          starts.push(idx); labels.push(String(it.title || '').trim())
        }
      } catch { /* broken destination: skip */ }
      if (level < depth && it.items?.length) await walk(it.items, level + 1)
    }
  }
  await walk(outline, 1)
  return { starts, labels }
}

export interface PageScan { ink: number; qr: string | null }

/** Render a page small for blank detection and, when asked, larger for a QR code. */
export async function scanPage(doc: any, page: number, wantQr: boolean): Promise<PageScan> {
  const { renderPage } = await import('@/lib/pdf')
  const small = await renderPage(doc, page + 1, 0.4)
  const sd = small.getContext('2d')!.getImageData(0, 0, small.width, small.height)
  const ink = inkRatio(sd.data, sd.width, sd.height)
  let qr: string | null = null
  if (wantQr && ink > 0.001) {
    const jsQR = (await import('jsqr')).default
    const big = await renderPage(doc, page + 1, 1.5)
    const bd = big.getContext('2d')!.getImageData(0, 0, big.width, big.height)
    qr = jsQR(bd.data, bd.width, bd.height, { inversionAttempts: 'attemptBoth' })?.data ?? null
    big.width = big.height = 0
  }
  small.width = small.height = 0
  return { ink, qr }
}
