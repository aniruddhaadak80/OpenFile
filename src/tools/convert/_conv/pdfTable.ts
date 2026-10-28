/* Paginated table renderer for jsPDF (no plugin): measured column widths, wrapped cells,
 * repeating header row, gridlines, zebra rows, fit-to-width or column-split pagination. */
import type { jsPDF as JsPDF } from 'jspdf'

export interface TableDrawOpts {
  fontSize: number
  header: boolean
  repeatHeader: boolean
  gridlines: boolean
  zebra: boolean
  fit: 'width' | 'shrink' | 'none'
  margin: number
  title?: string
  font?: 'helvetica' | 'times' | 'courier'
  /** first page already exists and is blank (otherwise a new page is added) */
  usePage?: boolean
  maxColWidth?: number
}

const isNum = (s: string) => /^[-+(]?[$€£₹¥]?\s?[\d,]+(\.\d+)?%?\)?$/.test(s.trim())

export function drawTable(pdf: JsPDF, rowsIn: string[][], o: TableDrawOpts) {
  const font = o.font ?? 'helvetica'
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight()
  const avail = W - o.margin * 2
  const ncols = Math.max(1, ...rowsIn.map((r) => r.length))
  const rows = rowsIn.map((r) => Array.from({ length: ncols }, (_, i) => (r[i] ?? '').toString().replace(/\r/g, '')))
  let fs = o.fontSize
  const pad = () => Math.max(2, fs * 0.35)
  const measure = () => {
    pdf.setFont(font, 'normal'); pdf.setFontSize(fs)
    const maxW = o.maxColWidth ?? Math.max(120, avail * 0.45)
    return Array.from({ length: ncols }, (_, c) => {
      let w = 0
      for (let r = 0; r < rows.length; r++) {
        const bold = o.header && r === 0
        if (bold) pdf.setFont(font, 'bold')
        for (const line of rows[r][c].split('\n')) w = Math.max(w, pdf.getTextWidth(line))
        if (bold) pdf.setFont(font, 'normal')
        if (r > 400) break // sample is enough for very long sheets
      }
      return Math.min(maxW, Math.max(fs * 1.6, w)) + pad() * 2
    })
  }
  let widths = measure()
  let total = widths.reduce((a, b) => a + b, 0)
  if (o.fit === 'shrink' && total > avail) {
    for (let k = 0; k < 20 && total > avail && fs > 4; k++) { fs = Math.max(4, fs * Math.max(0.6, avail / total)); widths = measure(); total = widths.reduce((a, b) => a + b, 0) }
  }
  if (o.fit !== 'none') {
    const s = avail / total
    if (s < 1) {
      // shrink wide columns first so narrow numeric columns stay readable
      const target = avail
      let ws = [...widths]
      for (let k = 0; k < 10; k++) {
        const sum = ws.reduce((a, b) => a + b, 0)
        if (sum <= target + 0.5) break
        const cap = Math.max(...ws) * (target / sum)
        ws = ws.map((w) => Math.min(w, Math.max(cap, fs * 2.2)))
        const sum2 = ws.reduce((a, b) => a + b, 0)
        if (Math.abs(sum2 - sum) < 0.5) { ws = ws.map((w) => w * (target / sum2)); break }
      }
      widths = ws
    } else widths = widths.map((w) => w * s)
  }
  // column groups (only splits when fit === 'none' and the table is wider than the page)
  const groups: number[][] = []
  let cur: number[] = [], acc = 0
  widths.forEach((w, i) => { if (cur.length && acc + w > avail + 0.5) { groups.push(cur); cur = []; acc = 0 } cur.push(i); acc += w })
  if (cur.length) groups.push(cur)

  const lineH = fs * 1.25
  let first = true
  let pageCount = 0
  const newPage = () => {
    if (first && o.usePage) { first = false } else { pdf.addPage([W, H], W > H ? 'landscape' : 'portrait') ; first = false }
    pageCount++
  }
  for (let g = 0; g < groups.length; g++) {
    const cols = groups[g]
    const tableW = cols.reduce((s, c) => s + widths[c], 0)
    newPage()
    let y = o.margin
    if (o.title) {
      pdf.setFont(font, 'bold'); pdf.setFontSize(Math.max(fs + 4, 11)); pdf.setTextColor('#111827')
      pdf.text(o.title + (groups.length > 1 ? `  (columns ${cols[0] + 1}–${cols[cols.length - 1] + 1})` : ''), o.margin, y + fs + 2)
      y += fs + 14
    }
    const cellLines = (r: number, c: number) => { pdf.setFont(font, o.header && r === 0 ? 'bold' : 'normal'); pdf.setFontSize(fs); return pdf.splitTextToSize(rows[r][c] || '', widths[c] - pad() * 2) as string[] }
    const rowHeight = (lines: string[][]) => Math.max(1, ...lines.map((l) => l.length)) * lineH + pad() * 2 - (lineH - fs) 
    const drawRow = (r: number, lines: string[][], yy: number, h: number) => {
      let x = o.margin
      const isHead = o.header && r === 0
      if (isHead) { pdf.setFillColor('#e8ecf3'); pdf.rect(o.margin, yy, tableW, h, 'F') }
      else if (o.zebra && r % 2 === (o.header ? 0 : 1)) { pdf.setFillColor('#f6f7fa'); pdf.rect(o.margin, yy, tableW, h, 'F') }
      pdf.setTextColor(isHead ? '#111827' : '#1f2937')
      cols.forEach((c, k) => {
        pdf.setFont(font, isHead ? 'bold' : 'normal'); pdf.setFontSize(fs)
        const right = !isHead && isNum(rows[r][c])
        lines[k].forEach((ln, li) => {
          const ty = yy + pad() + fs * 0.85 + li * lineH
          if (right) pdf.text(ln, x + widths[c] - pad(), ty, { align: 'right' }); else pdf.text(ln, x + pad(), ty)
        })
        if (o.gridlines) { pdf.setDrawColor('#b9bfca'); pdf.setLineWidth(0.5); pdf.rect(x, yy, widths[c], h, 'S') }
        x += widths[c]
      })
      if (!o.gridlines && isHead) { pdf.setDrawColor('#9aa3b2'); pdf.setLineWidth(0.8); pdf.line(o.margin, yy + h, o.margin + tableW, yy + h) }
    }
    const headLines = o.header && rows.length ? cols.map((c) => cellLines(0, c)) : null
    const headH = headLines ? rowHeight(headLines) : 0
    if (headLines) { drawRow(0, headLines, y, headH); y += headH }
    for (let r = o.header ? 1 : 0; r < rows.length; r++) {
      const lines = cols.map((c) => cellLines(r, c))
      let h = rowHeight(lines)
      const maxH = H - o.margin * 2 - headH - 4
      if (h > maxH) { const keep = Math.floor((maxH - pad() * 2) / lineH); lines.forEach((l, i) => { if (l.length > keep) lines[i] = [...l.slice(0, keep - 1), l[keep - 1] + ' …'] }); h = rowHeight(lines) }
      if (y + h > H - o.margin) {
        newPage(); y = o.margin
        if (headLines && o.repeatHeader) { drawRow(0, headLines, y, headH); y += headH }
      }
      drawRow(r, lines, y, h)
      y += h
    }
  }
  return { pages: pageCount, fontSize: fs, columnGroups: groups.length }
}
