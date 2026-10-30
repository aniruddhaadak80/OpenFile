/* Printable PDFs for the study tools: flashcards, worksheets, word search, crossword and Cornell notes. */
import type { Card as FCard, Problem } from './study'
import { newPdf } from './ui'

export async function cardsPdf(cards: FCard[], o: { cols: number; rows: number; title: string }) {
  const { doc, W, H } = await newPdf()
  const m = 36, cw = (W - m * 2) / o.cols, ch = (H - m * 2) / o.rows, per = o.cols * o.rows
  const page = (side: 'front' | 'back', start: number) => {
    doc.setDrawColor(200); doc.setLineDashPattern([3, 3], 0)
    for (let i = 0; i < per && start + i < cards.length; i++) {
      const c = cards[start + i], r = Math.floor(i / o.cols), col = side === 'front' ? i % o.cols : o.cols - 1 - (i % o.cols)
      const x = m + col * cw, y = m + r * ch
      doc.rect(x, y, cw, ch)
      const t = side === 'front' ? c.front : c.back
      doc.setFont('helvetica', side === 'front' ? 'bold' : 'normal'); doc.setFontSize(side === 'front' ? 16 : 11)
      const lines = doc.splitTextToSize(t, cw - 24)
      doc.text(lines.slice(0, 14), x + cw / 2, y + ch / 2 - ((Math.min(14, lines.length) - 1) * (side === 'front' ? 8 : 6.5)), { align: 'center' })
      doc.setFontSize(7); doc.setTextColor(150); doc.text(`${start + i + 1}`, x + 6, y + 10); doc.setTextColor(0)
    }
  }
  for (let s = 0; s < cards.length; s += per) { if (s) doc.addPage(); page('front', s); doc.addPage(); page('back', s) }
  doc.setProperties({ title: o.title })
  return doc.output('blob')
}


export async function worksheetPdf(o: { title: string; problems: Problem[]; cols: number; name: boolean; key: boolean; size: 'a4' | 'letter'; vertical: boolean }) {
  const { doc, W, H } = await newPdf({ size: o.size })
  const m = 48
  const header = (t: string) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(t, m, m + 6)
    if (o.name) { doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.text('Name: ______________________   Date: ____________   Score: ______', m, m + 30) }
  }
  const draw = (answers: boolean) => {
    header(answers ? `${o.title}: answer key` : o.title)
    const top = m + 56, cw = (W - m * 2) / o.cols, rh = o.vertical ? 92 : 34
    const perPage = o.cols * Math.floor((H - top - m) / rh)
    o.problems.forEach((p, i) => {
      if (i && i % perPage === 0) { doc.addPage(); header(answers ? `${o.title}: answer key` : o.title) }
      const k = i % perPage, x = m + (k % o.cols) * cw, y = top + Math.floor(k / o.cols) * rh
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(140); doc.text(`${i + 1}.`, x, y + 12); doc.setTextColor(0)
      doc.setFont('courier', 'normal'); doc.setFontSize(o.vertical ? 15 : 13)
      if (o.vertical) {
        const r = x + Math.min(cw - 20, 90), sa = String(p.a), sb = `${p.op} ${p.b}`
        doc.text(sa, r, y + 18, { align: 'right' }); doc.text(sb, r, y + 38, { align: 'right' }); doc.line(r - 70, y + 44, r + 2, y + 44)
        if (answers) { doc.setTextColor(16, 120, 100); doc.text(String(p.answer), r, y + 64, { align: 'right' }); doc.setTextColor(0) }
      } else {
        doc.text(`${p.text} ${answers ? String(p.answer) : '_______'}`, x + 18, y + 12)
      }
    })
  }
  draw(false)
  if (o.key) { doc.addPage(); draw(true) }
  return doc.output('blob')
}

export async function gridPuzzlePdf(o: { title: string; grid: (string | null)[][]; words?: string[]; clues?: { across: string[]; down: string[] }; numbers?: Map<string, number>; solution?: (string | null)[][]; showLetters: boolean; size: 'a4' | 'letter'; highlight?: Set<string> }) {
  const { doc, W, H } = await newPdf({ size: o.size })
  const m = 40
  const page = (sol: boolean) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(sol ? `${o.title}: answers` : o.title, m, m + 6)
    const rows = o.grid.length, cols = o.grid[0]?.length ?? 1
    const maxW = W - m * 2, maxH = (H - m * 2) * (o.clues ? 0.55 : 0.68)
    const cell = Math.min(maxW / cols, maxH / rows, 34), gx = m + (maxW - cell * cols) / 2, gy = m + 24
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const v = o.grid[r][c], x = gx + c * cell, y = gy + r * cell
      if (o.showLetters) {
        if (sol && o.highlight?.has(`${r},${c}`)) { doc.setFillColor(253, 230, 138); doc.rect(x, y, cell, cell, 'F') }
        doc.setFont('courier', 'bold'); doc.setFontSize(cell * 0.62); doc.text(v ?? '', x + cell / 2, y + cell * 0.7, { align: 'center' })
      } else if (v == null) { doc.setFillColor(20, 20, 20); doc.rect(x, y, cell, cell, 'F') }
      else {
        doc.setDrawColor(60); doc.rect(x, y, cell, cell)
        const n = o.numbers?.get(`${r},${c}`); if (n) { doc.setFont('helvetica', 'normal'); doc.setFontSize(cell * 0.28); doc.text(String(n), x + 2, y + cell * 0.3) }
        if (sol) { doc.setFont('helvetica', 'bold'); doc.setFontSize(cell * 0.55); doc.text(v, x + cell / 2, y + cell * 0.72, { align: 'center' }) }
      }
    }
    let y = gy + rows * cell + 28
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11)
    if (o.words) { const colW = (W - m * 2) / 4; o.words.forEach((w, i) => { doc.text(w, m + (i % 4) * colW, y + Math.floor(i / 4) * 16) }) }
    if (o.clues) {
      const half = (W - m * 2) / 2 - 10
      for (const [k, list, x] of [['Across', o.clues.across, m], ['Down', o.clues.down, m + half + 20]] as const) {
        let yy = y; doc.setFont('helvetica', 'bold'); doc.text(k, x, yy); yy += 16; doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
        for (const cl of list) { const ls = doc.splitTextToSize(cl, half); if (yy + ls.length * 12 > H - m) break; doc.text(ls, x, yy); yy += ls.length * 12 + 3 }
        doc.setFontSize(11)
      }
    }
  }
  page(false); doc.addPage(); page(true)
  return doc.output('blob')
}

export async function cornellPdf(o: { title: string; subject: string; date: string; cues: string; notes: string; summary: string; pages: number; size: 'a4' | 'letter'; lines: boolean }) {
  const { doc, W, H } = await newPdf({ size: o.size })
  const m = 36, cueW = (W - m * 2) * 0.3, top = m + 50, sumH = H * 0.2
  for (let p = 0; p < Math.max(1, o.pages); p++) {
    if (p) doc.addPage()
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(o.title || 'Notes', m, m + 12)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(`${o.subject ? 'Subject: ' + o.subject + '    ' : ''}${o.date ? 'Date: ' + o.date : ''}`, m, m + 30)
    doc.setDrawColor(120); doc.setLineWidth(1)
    doc.line(m, top, W - m, top); doc.line(m + cueW, top, m + cueW, H - m - sumH); doc.line(m, H - m - sumH, W - m, H - m - sumH)
    doc.setFontSize(8); doc.setTextColor(130); doc.text('CUES AND QUESTIONS', m + 4, top + 12); doc.text('NOTES', m + cueW + 6, top + 12); doc.text('SUMMARY', m + 4, H - m - sumH + 12); doc.setTextColor(0)
    if (o.lines) { doc.setDrawColor(225); doc.setLineWidth(0.5); for (let y = top + 36; y < H - m - sumH - 4; y += 22) doc.line(m + cueW + 6, y, W - m, y); for (let y = H - m - sumH + 36; y < H - m; y += 22) doc.line(m + 4, y, W - m, y) }
    if (p === 0) {
      doc.setFontSize(10)
      const put = (t: string, x: number, y: number, w: number, maxY: number) => { const ls = doc.splitTextToSize(t, w); let yy = y; for (const l of ls) { if (yy > maxY) break; doc.text(l, x, yy); yy += 22 } }
      put(o.cues, m + 4, top + 32, cueW - 10, H - m - sumH - 8)
      put(o.notes, m + cueW + 8, top + 32, W - m * 2 - cueW - 12, H - m - sumH - 8)
      put(o.summary, m + 4, H - m - sumH + 32, W - m * 2 - 8, H - m - 6)
    }
  }
  return doc.output('blob')
}
