/* Layout analysis on pdf.js text items: lines, paragraphs, headings (for PDF → Word) and
 * row/column clustering (for PDF → Excel). Pure functions, no DOM, so they are unit-testable. */

export interface TItem { str: string; x: number; y: number; w: number; size: number; font: string; bold: boolean; italic: boolean; eol?: boolean }
export interface Run { text: string; bold: boolean; italic: boolean }
export interface Line { items: TItem[]; text: string; runs: Run[]; x: number; x1: number; y: number; size: number; bold: boolean }
export type BlockKind = 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'oli'
export interface Block { kind: BlockKind; runs: Run[]; text: string; size: number; indent: number; y: number; align?: 'left' | 'center' }

const BULLET = /^\s*([•●○◦▪▫■□‣⁃∙·\-–—*➢►✓✔])\s+/
const NUMBERED = /^\s*(\(?\d{1,3}[.)]|\(?[a-zA-Z][.)]|[ivxIVX]{1,4}[.)])\s+/

export interface FontInfo { name?: string; bold?: boolean; italic?: boolean }
/** Convert a raw pdf.js text item (+ page height) to a TItem. `fontOf` resolves the loaded font (for bold/italic). */
export function toItem(it: any, pageHeight: number, fontOf?: (id: string) => FontInfo | undefined, styles?: Record<string, any>): TItem | null {
  if (!it || typeof it.str !== 'string') return null
  const [a, b, c, d, e, f] = it.transform
  const size = Math.hypot(c, d) || Math.hypot(a, b) || 10
  const info = fontOf?.(it.fontName) ?? {}
  const real = (info.name || styles?.[it.fontName]?.fontFamily || it.fontName || '').toString()
  const lower = real.toLowerCase()
  return {
    str: it.str, x: e, y: pageHeight - f, w: it.width ?? 0, size, font: real,
    bold: !!info.bold || /bold|black|heavy|semibold|demi|,b\b|-b\b/.test(lower),
    italic: !!info.italic || /italic|oblique|-it\b|,i\b/.test(lower),
    eol: !!it.hasEOL,
  }
}

/** Resolve pdf.js font objects after `page.getOperatorList()` has loaded them. */
export function fontResolver(page: any) {
  const cache = new Map<string, FontInfo>()
  return (id: string): FontInfo | undefined => {
    if (cache.has(id)) return cache.get(id)
    let info: FontInfo = {}
    try {
      const o = page.commonObjs.has?.(id) ? page.commonObjs.get(id) : page.objs?.has?.(id) ? page.objs.get(id) : null
      if (o) info = { name: o.name || o.systemFontInfo?.baseFontName || o.loadedName, bold: !!(o.bold || o.black), italic: !!o.italic }
    } catch { /* not loaded */ }
    cache.set(id, info)
    return info
  }
}

const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

/** Group items into visual lines (top → bottom, left → right). */
export function groupLines(items: TItem[]): Line[] {
  const its = items.filter((i) => i.str.length > 0).sort((p, q) => p.y - q.y || p.x - q.x)
  const rows: TItem[][] = []
  for (const it of its) {
    if (!it.str.trim() && !rows.length) continue
    const row = rows.find((r) => { const ry = median(r.map((z) => z.y)); const rs = median(r.map((z) => z.size)); return Math.abs(ry - it.y) <= Math.max(2, Math.min(rs, it.size) * 0.45) })
    if (row) row.push(it); else rows.push([it])
  }
  const lines: Line[] = []
  for (const r of rows) {
    r.sort((p, q) => p.x - q.x)
    const runs: Run[] = []
    let text = ''
    let prev: TItem | null = null
    for (const it of r) {
      let piece = it.str
      if (prev) {
        const gap = it.x - (prev.x + prev.w)
        const needSpace = gap > Math.min(prev.size, it.size) * 0.18 && !text.endsWith(' ') && !piece.startsWith(' ')
        if (needSpace) piece = ' ' + piece
      }
      text += piece
      const last = runs[runs.length - 1]
      if (last && last.bold === it.bold && last.italic === it.italic) last.text += piece
      else runs.push({ text: piece, bold: it.bold, italic: it.italic })
      prev = it
    }
    const visible = r.filter((i) => i.str.trim())
    if (!visible.length) continue
    const chars = visible.reduce((s, i) => s + i.str.trim().length, 0)
    const boldChars = visible.filter((i) => i.bold).reduce((s, i) => s + i.str.trim().length, 0)
    lines.push({
      items: r, text: text.replace(/\s+/g, ' ').trim(), runs: trimRuns(runs),
      x: visible[0].x, x1: Math.max(...visible.map((i) => i.x + i.w)),
      y: median(visible.map((i) => i.y)), size: median(visible.map((i) => i.size)), bold: boldChars >= chars * 0.6,
    })
  }
  return lines.sort((p, q) => p.y - q.y)
}

function trimRuns(runs: Run[]): Run[] {
  const out = runs.map((r) => ({ ...r, text: r.text.replace(/\s+/g, ' ') })).filter((r) => r.text.length)
  if (out.length) { out[0].text = out[0].text.replace(/^\s+/, ''); out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '') }
  return out.filter((r) => r.text.length)
}

/** Most common font size weighted by characters (the body text size). */
export function bodySize(lines: Line[]) {
  const w = new Map<number, number>()
  for (const l of lines) { const k = Math.round(l.size * 2) / 2; w.set(k, (w.get(k) ?? 0) + l.text.length) }
  let best = 10, bw = -1
  for (const [k, v] of w) if (v > bw) { bw = v; best = k }
  return best
}

/** Build headings / paragraphs / list items from lines of one page. `headingSizes` maps rounded size → level. */
export function buildBlocks(lines: Line[], body: number, headingSizes: number[], pageWidth: number): Block[] {
  const blocks: Block[] = []
  const lineGap = median(lines.slice(1).map((l, i) => l.y - lines[i].y).filter((g) => g > 0 && g < body * 3)) || body * 1.25
  const leftEdge = median(lines.filter((l) => Math.abs(l.size - body) < 0.6).map((l) => l.x)) || (lines[0]?.x ?? 0)
  const rightEdge = Math.max(...lines.map((l) => l.x1), 0)
  let cur: Block | null = null
  let prevLine: Line | null = null
  const level = (size: number): BlockKind | null => {
    if (size < body * 1.15) return null
    const idx = headingSizes.findIndex((s) => Math.abs(s - size) < 0.6)
    return idx === 0 ? 'h1' : idx === 1 ? 'h2' : 'h3'
  }
  for (const l of lines) {
    const hk = level(l.size)
    const isHeading = hk && l.text.length < 160
    const bullet = BULLET.exec(l.text)
    const num = !bullet && NUMBERED.exec(l.text)
    const gap = prevLine ? l.y - prevLine.y : Infinity
    const sizeChange = prevLine ? Math.abs(prevLine.size - l.size) > 0.8 : true
    const prevShort = prevLine ? prevLine.x1 < rightEdge - Math.max(40, body * 4) && /[.!?:;"”)]$/.test(prevLine.text) : false
    const indentShift = prevLine ? l.x - leftEdge > body * 1.2 && Math.abs(prevLine.x - leftEdge) < body * 0.5 && cur?.kind === 'p' : false
    const centered = Math.abs((l.x + l.x1) / 2 - pageWidth / 2) < pageWidth * 0.04 && l.x - leftEdge > body * 3
    const startNew = !cur || isHeading || cur.kind.startsWith('h') || bullet || num || gap > lineGap * 1.45 || sizeChange || prevShort || indentShift
    if (startNew) {
      if (cur) blocks.push(cur)
      let runs = l.runs.map((r) => ({ ...r }))
      let kind: BlockKind = isHeading ? hk! : bullet ? 'li' : num ? 'oli' : 'p'
      if (bullet && runs.length) runs[0].text = runs[0].text.replace(BULLET, '')
      runs = runs.filter((r) => r.text.length)
      cur = { kind, runs, text: bullet ? l.text.replace(BULLET, '') : l.text, size: l.size, indent: Math.max(0, l.x - leftEdge), y: l.y, align: centered ? 'center' : 'left' }
    } else if (cur) {
      // continuation line: join, de-hyphenating words split across lines
      const lastRun = cur.runs[cur.runs.length - 1]
      const add = l.runs.map((r) => ({ ...r }))
      const hyph = !!lastRun && /[a-z]-$/.test(lastRun.text) && /^[a-z]/.test(add[0]?.text ?? '')
      if (hyph) lastRun.text = lastRun.text.slice(0, -1)
      else if (add[0]) add[0].text = ' ' + add[0].text
      for (const r of add) {
        const lr = cur.runs[cur.runs.length - 1]
        if (lr && lr.bold === r.bold && lr.italic === r.italic) lr.text += r.text; else cur.runs.push(r)
      }
      // keep the plain text in step with the runs, so "transduc-" + "tion" reads "transduction" in text output too
      if (hyph) { const t = cur.text.trimEnd(); cur.text = (t.endsWith('-') ? t.slice(0, -1) : t) + l.text } else cur.text += ' ' + l.text
      if (cur.align === 'center' && !centered) cur.align = 'left'
    }
    prevLine = l
  }
  if (cur) blocks.push(cur)
  return blocks
}

/** Determine heading sizes across the whole document (largest first, max 3 levels). */
export function headingSizesOf(allLines: Line[], body: number) {
  const sizes = new Map<number, number>()
  for (const l of allLines) if (l.size >= body * 1.15 && l.text.length < 160) { const k = Math.round(l.size * 2) / 2; sizes.set(k, (sizes.get(k) ?? 0) + 1) }
  return [...sizes.keys()].sort((a, b) => b - a).slice(0, 3)
}

/* ---------------------------- tables (PDF → Excel) ---------------------------- */

export interface Cell { text: string; x0: number; x1: number }
export interface TableOpts { rowTolerance?: number; cellGap?: number }

/** Split each visual line into cells wherever the horizontal gap is larger than `cellGap` × font size. */
export function lineCells(line: Line, cellGap = 1.2): Cell[] {
  const items = line.items.filter((i) => i.str.trim()).sort((a, b) => a.x - b.x)
  const cells: Cell[] = []
  let cur: Cell | null = null
  let prev: TItem | null = null
  for (const it of items) {
    const gap = prev ? it.x - (prev.x + prev.w) : Infinity
    if (!cur || gap > Math.max(2, Math.min(prev!.size, it.size) * cellGap)) {
      if (cur) cells.push(cur)
      cur = { text: it.str.trim(), x0: it.x, x1: it.x + it.w }
    } else {
      cur.text += (gap > it.size * 0.15 ? ' ' : '') + it.str.trim()
      cur.x1 = Math.max(cur.x1, it.x + it.w)
    }
    prev = it
  }
  if (cur) cells.push(cur)
  return cells.map((c) => ({ ...c, text: c.text.replace(/\s+/g, ' ').trim() }))
}

/** Cluster cells into a grid using x-axis projection: columns are separated by vertical gutters no cell crosses. */
export function toGrid(lines: Line[], pageWidth: number, opts: TableOpts = {}): string[][] {
  const rows = lines.map((l) => lineCells(l, opts.cellGap ?? 1.2)).filter((r) => r.length)
  if (!rows.length) return []
  // intervals, ignoring very wide cells (titles, paragraphs) which would glue columns together
  const wideLimit = pageWidth * 0.45
  const ivs = rows.filter((r) => r.length > 1).flat().filter((c) => c.x1 - c.x0 < wideLimit).map((c) => [c.x0, c.x1] as [number, number]).sort((a, b) => a[0] - b[0])
  const cols: [number, number][] = []
  for (const iv of ivs) {
    const last = cols[cols.length - 1]
    if (last && iv[0] <= last[1] + 1) last[1] = Math.max(last[1], iv[1]); else cols.push([...iv])
  }
  if (cols.length <= 1) return rows.map((r) => [r.map((c) => c.text).join(' ')])
  const colOf = (c: Cell) => {
    const mid = (c.x0 + c.x1) / 2
    let best = 0, bd = Infinity
    cols.forEach(([a, b], i) => { const d = mid < a ? a - mid : mid > b ? mid - b : 0; if (d < bd) { bd = d; best = i } })
    // a cell overlapping a column start strongly prefers the leftmost overlapped column
    const ov = cols.findIndex(([a, b]) => c.x0 < b && c.x1 > a)
    return ov >= 0 ? ov : best
  }
  return rows.map((r) => {
    const out = new Array(cols.length).fill('')
    for (const c of r) { const i = colOf(c); out[i] = out[i] ? out[i] + ' ' + c.text : c.text }
    return out
  })
}

/** Parse "1,234.50", "(12)", "45%", "$3.10", "-7" as numbers; otherwise return null. */
export function parseNumberish(s: string): number | null {
  const t = s.trim()
  if (!t || t.length > 24) return null
  const m = /^(\()?([-+−]?)[$€£₹¥]?\s?([\d]{1,3}(?:[,\s]\d{3})+|\d+)(\.\d+)?(%)?(\))?$/.exec(t)
  if (!m) return null
  if (!!m[1] !== !!m[6]) return null
  let v = parseFloat(m[3].replace(/[,\s]/g, '') + (m[4] ?? ''))
  if (m[2] === '-' || m[2] === '−' || m[1]) v = -v
  if (m[5]) v = v / 100
  return Number.isFinite(v) ? v : null
}

/** Split a page's lines into runs of normal text and table-like regions (≥2 consecutive lines with ≥3 well-separated cells). */
export function splitTables(lines: Line[], pageWidth: number): ({ type: 'text'; lines: Line[] } | { type: 'table'; rows: string[][] })[] {
  const isRow = (l: Line) => lineCells(l, 2).length >= 3
  const out: ({ type: 'text'; lines: Line[] } | { type: 'table'; rows: string[][] })[] = []
  let i = 0
  while (i < lines.length) {
    if (isRow(lines[i])) {
      let j = i
      while (j < lines.length && isRow(lines[j])) j++
      if (j - i >= 2) {
        const rows = toGrid(lines.slice(i, j), pageWidth, { cellGap: 2 })
        if (rows[0] && rows[0].length >= 2) { out.push({ type: 'table', rows }); i = j; continue }
      }
    }
    const last = out[out.length - 1]
    if (last && last.type === 'text') last.lines.push(lines[i]); else out.push({ type: 'text', lines: [lines[i]] })
    i++
  }
  return out
}
