/* Turn OCR word boxes into a table: words are grouped into rows by their vertical centre, and
 * columns are found from the horizontal gaps that run through every row (a projection profile).
 * Pure logic, tested in scripts/tests/b1/ocrtable.test.mjs. */

export interface OcrWord { text: string; x0: number; y0: number; x1: number; y1: number }

const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

/** Group words into lines (rows), top to bottom, words left to right. */
export function wordsToRows(words: OcrWord[]): OcrWord[][] {
  const ws = words.filter((w) => w.text.trim()).sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2)
  if (!ws.length) return []
  const mh = median(ws.map((w) => w.y1 - w.y0)) || 10
  const rows: { cy: number; words: OcrWord[] }[] = []
  for (const w of ws) {
    const cy = (w.y0 + w.y1) / 2
    const last = rows[rows.length - 1]
    if (last && Math.abs(cy - last.cy) < mh * 0.6) { last.words.push(w); last.cy = (last.cy * (last.words.length - 1) + cy) / last.words.length }
    else rows.push({ cy, words: [w] })
  }
  return rows.map((r) => r.words.sort((a, b) => a.x0 - b.x0))
}

/** Column boundaries [start, end] from the union of word extents, splitting where a gap wider than minGap runs through all rows. */
export function findColumns(rows: OcrWord[][], minGap?: number): [number, number][] {
  const all = rows.flat()
  if (!all.length) return []
  const mh = median(all.map((w) => w.y1 - w.y0)) || 10
  const gap = minGap ?? mh * 1.2
  // Only rows with 2+ words define columns, so a title or a paragraph line does not glue everything together.
  const defining = rows.filter((r) => r.length > 1)
  const src = (defining.length ? defining : rows).flat()
  const spans = src.map((w) => [w.x0, w.x1] as [number, number]).sort((a, b) => a[0] - b[0])
  const cols: [number, number][] = []
  for (const s of spans) {
    const last = cols[cols.length - 1]
    if (last && s[0] - last[1] < gap) last[1] = Math.max(last[1], s[1])
    else cols.push([s[0], s[1]])
  }
  return cols
}

/** Build a 2D array of cell strings. */
export function wordsToTable(words: OcrWord[], minGap?: number): string[][] {
  const rows = wordsToRows(words)
  const cols = findColumns(rows, minGap)
  if (!cols.length) return []
  const colOf = (w: OcrWord) => {
    const cx = (w.x0 + w.x1) / 2
    let best = 0, bd = Infinity
    cols.forEach((c, i) => { const d = cx < c[0] ? c[0] - cx : cx > c[1] ? cx - c[1] : 0; if (d < bd) { bd = d; best = i } })
    return best
  }
  return rows.map((r) => {
    const cells: string[][] = cols.map(() => [])
    for (const w of r) cells[colOf(w)].push(w.text)
    return cells.map((c) => c.join(' '))
  })
}

export function toCsv(table: string[][], sep = ','): string {
  const q = (s: string) => (/[",\n\r;\t]/.test(s) || s.startsWith(' ') ? `"${s.replace(/"/g, '""')}"` : s)
  return table.map((r) => r.map(q).join(sep)).join('\r\n')
}
