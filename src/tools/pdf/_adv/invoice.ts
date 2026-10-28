/* Invoice model, maths, amount-in-words and jsPDF renderer (3 templates). Pure: no React. */
import type { jsPDF } from 'jspdf'
import { hexRgb, tint } from './color'

export type TaxMode = 'cgst' | 'igst' | 'vat' | 'none'
export type Template = 'modern' | 'classic' | 'minimal'
export interface Party { name: string; address: string; taxId: string; email: string; phone: string }
export interface LineItem { id: string; desc: string; hsn: string; qty: number; rate: number; tax: number }
export interface Invoice {
  template: Template; accent: string; currency: string; title: string
  number: string; date: string; due: string; placeOfSupply: string; poNumber: string
  business: Party; client: Party; shipTo: string; showShipTo: boolean
  logo: string | null
  items: LineItem[]
  taxMode: TaxMode
  discountType: 'percent' | 'flat'; discount: number
  shipping: number; roundOff: boolean
  notes: string; terms: string; payment: string
  signatory: string
}

export const CURRENCIES: { code: string; symbol: string; pdf: string; locale: string; major: string; minor: string; decimals: number }[] = [
  { code: 'INR', symbol: '₹', pdf: 'Rs.', locale: 'en-IN', major: 'Rupees', minor: 'Paise', decimals: 2 },
  { code: 'USD', symbol: '$', pdf: '$', locale: 'en-US', major: 'Dollars', minor: 'Cents', decimals: 2 },
  { code: 'EUR', symbol: '€', pdf: '€', locale: 'de-DE', major: 'Euros', minor: 'Cents', decimals: 2 },
  { code: 'GBP', symbol: '£', pdf: '£', locale: 'en-GB', major: 'Pounds', minor: 'Pence', decimals: 2 },
  { code: 'AED', symbol: 'AED', pdf: 'AED', locale: 'en-AE', major: 'Dirhams', minor: 'Fils', decimals: 2 },
  { code: 'AUD', symbol: 'A$', pdf: 'A$', locale: 'en-AU', major: 'Dollars', minor: 'Cents', decimals: 2 },
  { code: 'CAD', symbol: 'C$', pdf: 'C$', locale: 'en-CA', major: 'Dollars', minor: 'Cents', decimals: 2 },
  { code: 'SGD', symbol: 'S$', pdf: 'S$', locale: 'en-SG', major: 'Dollars', minor: 'Cents', decimals: 2 },
  { code: 'JPY', symbol: '¥', pdf: '¥', locale: 'ja-JP', major: 'Yen', minor: '', decimals: 0 },
  { code: 'CNY', symbol: '¥', pdf: 'CNY', locale: 'zh-CN', major: 'Yuan', minor: 'Fen', decimals: 2 },
  { code: 'BDT', symbol: '৳', pdf: 'Tk', locale: 'en-IN', major: 'Taka', minor: 'Poisha', decimals: 2 },
  { code: 'NPR', symbol: 'Rs', pdf: 'NPR', locale: 'en-IN', major: 'Rupees', minor: 'Paisa', decimals: 2 },
  { code: 'ZAR', symbol: 'R', pdf: 'R', locale: 'en-ZA', major: 'Rand', minor: 'Cents', decimals: 2 },
]
export const cur = (code: string) => CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0]

export function money(n: number, code: string, forPdf = false) {
  const c = cur(code)
  const s = new Intl.NumberFormat(c.locale === 'de-DE' ? 'en-IE' : c.locale, { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals }).format(Math.abs(n))
  const sym = forPdf ? c.pdf : c.symbol
  return `${n < 0 ? '-' : ''}${sym}${sym.length > 1 ? ' ' : ''}${s}`
}

export interface Totals {
  subtotal: number; discount: number; taxable: number
  taxes: { label: string; amount: number }[]
  taxTotal: number; shipping: number; round: number; total: number
  lines: { amount: number; taxable: number; tax: number }[]
}
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function calc(inv: Invoice): Totals {
  const lines = inv.items.map((it) => ({ amount: r2((+it.qty || 0) * (+it.rate || 0)), taxable: 0, tax: 0 }))
  const subtotal = r2(lines.reduce((n, l) => n + l.amount, 0))
  const rawDisc = inv.discountType === 'percent' ? subtotal * Math.min(100, Math.max(0, inv.discount || 0)) / 100 : Math.min(subtotal, Math.max(0, inv.discount || 0))
  const discount = r2(rawDisc)
  const ratio = subtotal ? (subtotal - discount) / subtotal : 0
  const byRate = new Map<number, number>()
  inv.items.forEach((it, i) => {
    const taxable = lines[i].amount * ratio
    lines[i].taxable = taxable
    const rate = inv.taxMode === 'none' ? 0 : Math.max(0, +it.tax || 0)
    lines[i].tax = taxable * rate / 100
    if (rate) byRate.set(rate, (byRate.get(rate) ?? 0) + taxable)
  })
  const taxes: { label: string; amount: number }[] = []
  for (const [rate, base] of [...byRate.entries()].sort((a, b) => a[0] - b[0])) {
    const t = base * rate / 100
    if (inv.taxMode === 'cgst') { const half = +(rate / 2).toFixed(3); taxes.push({ label: `CGST @ ${half}%`, amount: r2(t / 2) }, { label: `SGST @ ${half}%`, amount: r2(t / 2) }) }
    else if (inv.taxMode === 'igst') taxes.push({ label: `IGST @ ${rate}%`, amount: r2(t) })
    else if (inv.taxMode === 'vat') taxes.push({ label: `VAT @ ${rate}%`, amount: r2(t) })
  }
  const taxable = r2(subtotal - discount)
  const taxTotal = r2(taxes.reduce((n, t) => n + t.amount, 0))
  const shipping = r2(Math.max(0, inv.shipping || 0))
  const pre = r2(taxable + taxTotal + shipping)
  const decimals = cur(inv.currency).decimals
  const total = inv.roundOff ? Math.round(pre) : decimals === 0 ? Math.round(pre) : pre
  return { subtotal, discount, taxable, taxes, taxTotal, shipping, round: r2(total - pre), total, lines }
}

// ---------- amount in words ----------
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
function below1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100
  const parts: string[] = []
  if (h) parts.push(ONES[h] + ' Hundred')
  if (r) parts.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? '-' + ONES[r % 10] : ''))
  return parts.join(' ')
}
function intWords(n: number, indian: boolean): string {
  if (n === 0) return 'Zero'
  const parts: string[] = []
  if (indian) {
    const crore = Math.floor(n / 1e7); n %= 1e7
    const lakh = Math.floor(n / 1e5); n %= 1e5
    const th = Math.floor(n / 1e3); n %= 1e3
    if (crore) parts.push(intWords(crore, true) + ' Crore')
    if (lakh) parts.push(below1000(lakh) + ' Lakh')
    if (th) parts.push(below1000(th) + ' Thousand')
    if (n) parts.push(below1000(n))
  } else {
    const units = [[1e12, 'Trillion'], [1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']] as const
    for (const [v, name] of units) { const q = Math.floor(n / v); if (q) { parts.push(below1000(q) + ' ' + name); n %= v } }
    if (n) parts.push(below1000(n))
  }
  return parts.join(' ')
}
export function amountInWords(amount: number, code: string): string {
  const c = cur(code)
  const indian = ['INR', 'NPR', 'BDT'].includes(c.code)
  const abs = Math.abs(amount)
  let major = Math.floor(abs)
  let minor = c.decimals ? Math.round((abs - major) * 100) : 0
  if (minor === 100) { major++; minor = 0 }
  let s = `${c.major} ${intWords(major, indian)}`
  if (minor && c.minor) s += ` and ${intWords(minor, indian)} ${c.minor}`
  return s + ' Only'
}

// ---------- PDF ----------
export function renderInvoice(doc: jsPDF, family: string, inv: Invoice) {
  const t = calc(inv)
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight()
  const M = 40
  const accent = hexRgb(inv.accent)
  const dark: [number, number, number] = [24, 27, 38], mid: [number, number, number] = [96, 101, 118], line: [number, number, number] = [222, 225, 233]
  const F = (style: 'normal' | 'bold' | 'italic' = 'normal', size = 9, color = dark) => { doc.setFont(family, style); doc.setFontSize(size); doc.setTextColor(...color) }
  const m = (n: number) => money(n, inv.currency, true)
  const tpl = inv.template
  let y = M

  const logoBox = (x: number, yy: number, maxW: number, maxH: number) => {
    if (!inv.logo) return 0
    try {
      const p = doc.getImageProperties(inv.logo)
      const s = Math.min(maxW / p.width, maxH / p.height)
      const w = p.width * s, h = p.height * s
      doc.addImage(inv.logo, p.fileType || 'PNG', x, yy, w, h, undefined, 'FAST')
      return w
    } catch { return 0 }
  }
  const partyLines = (p: Party, taxLabel: string) => [
    ...p.address.split('\n').map((s) => s.trim()).filter(Boolean),
    ...(p.taxId ? [`${taxLabel}: ${p.taxId}`] : []),
    ...[p.email, p.phone].filter(Boolean),
  ]
  const taxLabel = inv.taxMode === 'cgst' || inv.taxMode === 'igst' ? 'GSTIN' : inv.taxMode === 'vat' ? 'VAT No' : 'Tax ID'

  // ---- header ----
  const meta: [string, string][] = [['Invoice No', inv.number], ['Invoice Date', fmtDate(inv.date)], ...(inv.due ? [['Due Date', fmtDate(inv.due)] as [string, string]] : []), ...(inv.poNumber ? [['PO / Ref', inv.poNumber] as [string, string]] : []), ...(inv.placeOfSupply ? [['Place of Supply', inv.placeOfSupply] as [string, string]] : [])]
  if (tpl === 'modern') {
    const bandH = 118
    doc.setFillColor(...accent); doc.rect(0, 0, W, bandH, 'F')
    let lx = M
    if (inv.logo) {
      doc.setFillColor(255, 255, 255); doc.roundedRect(M, 26, 66, 66, 8, 8, 'F')
      logoBox(M + 5, 31, 56, 56); lx = M + 80
    }
    F('bold', 16, [255, 255, 255]); doc.text(inv.business.name || 'Your Business', lx, 44, { maxWidth: W / 2 - 20 })
    F('normal', 8.5, tint(inv.accent, 0.82)); let by = 58
    for (const l of partyLines(inv.business, taxLabel).slice(0, 5)) { doc.text(l, lx, by, { maxWidth: W / 2 - 40 }); by += 11 }
    F('bold', 24, [255, 255, 255]); doc.text(inv.title.toUpperCase(), W - M, 52, { align: 'right' })
    F('normal', 10, tint(inv.accent, 0.82)); doc.text(`# ${inv.number}`, W - M, 70, { align: 'right' })
    F('bold', 11, [255, 255, 255]); doc.text(m(t.total), W - M, 92, { align: 'right' })
    F('normal', 7.5, tint(inv.accent, 0.82)); doc.text('AMOUNT DUE', W - M, 103, { align: 'right' })
    y = bandH + 26
  } else if (tpl === 'classic') {
    const lw = logoBox(M, y, 90, 60)
    const lx = lw ? M + lw + 14 : M
    F('bold', 15, accent); doc.text(inv.business.name || 'Your Business', lx, y + 14, { maxWidth: W / 2 - lw })
    F('normal', 8.5, mid); let by = y + 28
    for (const l of partyLines(inv.business, taxLabel).slice(0, 6)) { doc.text(l, lx, by, { maxWidth: W / 2 - 30 }); by += 11 }
    F('bold', 22, dark); doc.text(inv.title.toUpperCase(), W - M, y + 18, { align: 'right' })
    y = Math.max(by, y + 66) + 8
    doc.setDrawColor(...accent); doc.setLineWidth(2); doc.line(M, y, W - M, y); doc.setLineWidth(0.5); doc.line(M, y + 3, W - M, y + 3)
    y += 22
  } else {
    F('normal', 8, mid); doc.setCharSpace(2.5); doc.text(inv.title.toUpperCase(), M, y + 6); doc.setCharSpace(0)
    F('bold', 20, dark); doc.text(inv.number || '—', M, y + 30)
    const lw = inv.logo ? 0 : 0
    void lw
    const rightX = W - M
    let ry = y + 4
    if (inv.logo) { const p = (() => { try { return doc.getImageProperties(inv.logo!) } catch { return null } })(); if (p) { const s = Math.min(70 / p.width, 40 / p.height); doc.addImage(inv.logo, p.fileType || 'PNG', rightX - p.width * s, ry, p.width * s, p.height * s, undefined, 'FAST'); ry += p.height * s + 8 } }
    F('bold', 11, dark); doc.text(inv.business.name || 'Your Business', rightX, ry + 6, { align: 'right' }); ry += 18
    F('normal', 8.5, mid)
    for (const l of partyLines(inv.business, taxLabel).slice(0, 6)) { doc.text(l, rightX, ry, { align: 'right' }); ry += 11 }
    y = Math.max(ry, y + 44) + 14
    doc.setDrawColor(...line); doc.setLineWidth(0.6); doc.line(M, y, W - M, y)
    y += 20
  }

  // ---- bill to / ship to / meta ----
  const colW = (W - 2 * M) / 3
  const blockTop = y
  const labelColor = tpl === 'minimal' ? mid : accent
  F('bold', 7.5, labelColor); doc.setCharSpace(0.8); doc.text('BILL TO', M, y); doc.setCharSpace(0)
  F('bold', 10.5, dark); doc.text(inv.client.name || 'Client name', M, y + 15, { maxWidth: colW - 10 })
  F('normal', 8.5, mid); let cy = y + 28
  for (const l of partyLines(inv.client, taxLabel)) { const wrapped = doc.splitTextToSize(l, colW - 10) as string[]; doc.text(wrapped, M, cy); cy += 11 * wrapped.length }
  let sy = y
  if (inv.showShipTo && inv.shipTo.trim()) {
    F('bold', 7.5, labelColor); doc.setCharSpace(0.8); doc.text('SHIP TO', M + colW, y); doc.setCharSpace(0)
    F('normal', 8.5, mid); sy = y + 15
    for (const l of inv.shipTo.split('\n').filter(Boolean)) { const wrapped = doc.splitTextToSize(l, colW - 10) as string[]; doc.text(wrapped, M + colW, sy); sy += 11 * wrapped.length }
  }
  // meta table on the right
  let my = y
  const metaRows = tpl !== 'classic' ? meta.filter(([k]) => k !== 'Invoice No') : meta
  for (const [k, v] of metaRows) {
    F('normal', 8.5, mid); doc.text(k, W - M - 150, my + 2)
    F('bold', 8.5, dark); doc.text(v || '—', W - M, my + 2, { align: 'right', maxWidth: 90 })
    my += 15
  }
  y = Math.max(cy, sy, my) + 18

  // ---- items table ----
  const gst = inv.taxMode === 'cgst' || inv.taxMode === 'igst'
  const showTax = inv.taxMode !== 'none'
  const cols = [
    { key: '#', w: 22, align: 'left' as const },
    { key: 'Description', w: 0, align: 'left' as const },
    ...(gst ? [{ key: 'HSN/SAC', w: 56, align: 'left' as const }] : []),
    { key: 'Qty', w: 40, align: 'right' as const },
    { key: 'Rate', w: 72, align: 'right' as const },
    ...(showTax ? [{ key: inv.taxMode === 'vat' ? 'VAT' : 'GST', w: 40, align: 'right' as const }] : []),
    { key: 'Amount', w: 84, align: 'right' as const },
  ]
  const fixed = cols.reduce((n, c) => n + c.w, 0)
  cols[1].w = W - 2 * M - fixed
  const xs: number[] = []; { let x = M; for (const c of cols) { xs.push(x); x += c.w } }
  const pad = 6
  const header = () => {
    const hh = 22
    if (tpl === 'modern') { doc.setFillColor(...accent); doc.rect(M, y, W - 2 * M, hh, 'F') }
    else if (tpl === 'classic') { doc.setFillColor(...tint(inv.accent, 0.88)); doc.rect(M, y, W - 2 * M, hh, 'F'); doc.setDrawColor(...tint(inv.accent, 0.6)); doc.setLineWidth(0.6); doc.rect(M, y, W - 2 * M, hh, 'S') }
    F('bold', 8, tpl === 'modern' ? [255, 255, 255] : tpl === 'classic' ? accent : mid)
    cols.forEach((c, i) => doc.text(c.key.toUpperCase(), c.align === 'right' ? xs[i] + c.w - pad : xs[i] + pad, y + 14.5, { align: c.align }))
    if (tpl === 'minimal') { doc.setDrawColor(...dark); doc.setLineWidth(0.8); doc.line(M, y + hh, W - M, y + hh) }
    y += hh
  }
  const bottomLimit = H - 60
  header()
  inv.items.forEach((it, i) => {
    F('normal', 9, dark)
    const descLines = doc.splitTextToSize(it.desc || '—', cols[1].w - pad * 2) as string[]
    const rowH = Math.max(22, descLines.length * 11.5 + 11)
    if (y + rowH > bottomLimit) { doc.addPage(); y = M; header() }
    if (tpl !== 'classic' && i % 2 === 1) { doc.setFillColor(...(tpl === 'modern' ? tint(inv.accent, 0.95) : [248, 249, 251] as [number, number, number])); doc.rect(M, y, W - 2 * M, rowH, 'F') }
    const ty = y + 14.5
    let ci = 0
    const cell = (txt: string, bold = false) => { const c = cols[ci]; F(bold ? 'bold' : 'normal', 9, dark); doc.text(txt, c.align === 'right' ? xs[ci] + c.w - pad : xs[ci] + pad, ty, { align: c.align }); ci++ }
    F('normal', 9, mid); doc.text(String(i + 1), xs[0] + pad, ty); ci = 1
    F('normal', 9, dark); doc.text(descLines, xs[1] + pad, ty); ci = 2
    if (gst) { F('normal', 8.5, mid); doc.text(it.hsn || '', xs[ci] + pad, ty); ci++ }
    cell(fmtQty(it.qty))
    cell(m(+it.rate || 0))
    if (showTax) cell(`${+it.tax || 0}%`)
    cell(m(t.lines[i].amount), true)
    if (tpl === 'classic') { doc.setDrawColor(...line); doc.setLineWidth(0.5); doc.rect(M, y, W - 2 * M, rowH, 'S'); for (let k = 1; k < xs.length; k++) doc.line(xs[k], y, xs[k], y + rowH) }
    else { doc.setDrawColor(...line); doc.setLineWidth(0.5); doc.line(M, y + rowH, W - M, y + rowH) }
    y += rowH
  })
  if (!inv.items.length) { F('italic', 9, mid); doc.text('No line items yet', M + pad, y + 16); y += 26 }

  // ---- totals ----
  const rows: [string, string, boolean?][] = [['Subtotal', m(t.subtotal)]]
  if (t.discount) rows.push([`Discount${inv.discountType === 'percent' ? ` (${inv.discount}%)` : ''}`, '-' + m(t.discount)])
  if (t.discount && t.taxes.length) rows.push(['Taxable value', m(t.taxable)])
  for (const tx of t.taxes) rows.push([tx.label, m(tx.amount)])
  if (t.shipping) rows.push(['Shipping', m(t.shipping)])
  if (t.round) rows.push(['Round off', (t.round < 0 ? '-' : '+') + m(Math.abs(t.round))])
  const totalsH = rows.length * 16 + 40
  if (y + totalsH + 30 > bottomLimit) { doc.addPage(); y = M }
  y += 14
  const tx0 = W - M - 230
  const totalsTop = y
  for (const [k, v] of rows) {
    F('normal', 9, mid); doc.text(k, tx0, y + 4)
    F('normal', 9, dark); doc.text(v, W - M, y + 4, { align: 'right' })
    y += 16
  }
  y += 4
  if (tpl === 'modern') { doc.setFillColor(...accent); doc.roundedRect(tx0 - 10, y - 4, W - M - tx0 + 10, 28, 4, 4, 'F'); F('bold', 11, [255, 255, 255]) }
  else { doc.setDrawColor(...(tpl === 'classic' ? accent : dark)); doc.setLineWidth(1); doc.line(tx0 - 10, y - 4, W - M, y - 4); F('bold', 11, tpl === 'classic' ? accent : dark) }
  doc.text('Total', tx0, y + 14); doc.text(m(t.total), W - M, y + 14, { align: 'right' })
  y += 34

  // amount in words + notes, left column (beside totals)
  let ly = totalsTop
  const lw = tx0 - M - 30
  F('bold', 7.5, labelColor); doc.setCharSpace(0.8); doc.text('AMOUNT IN WORDS', M, ly + 4); doc.setCharSpace(0); ly += 16
  F('italic', 9, dark); const words = doc.splitTextToSize(amountInWords(t.total, inv.currency), lw) as string[]; doc.text(words, M, ly); ly += words.length * 11.5 + 10
  if (inv.payment.trim()) {
    F('bold', 7.5, labelColor); doc.setCharSpace(0.8); doc.text('PAYMENT DETAILS', M, ly); doc.setCharSpace(0); ly += 13
    F('normal', 8.5, mid); const pl = doc.splitTextToSize(inv.payment, lw) as string[]; doc.text(pl, M, ly); ly += pl.length * 11 + 8
  }
  y = Math.max(y, ly) + 8

  const block = (title: string, body: string) => {
    if (!body.trim()) return
    const lines = doc.splitTextToSize(body, W - 2 * M) as string[]
    if (y + 20 + lines.length * 11 > bottomLimit) { doc.addPage(); y = M }
    F('bold', 7.5, labelColor); doc.setCharSpace(0.8); doc.text(title, M, y); doc.setCharSpace(0); y += 13
    F('normal', 8.5, mid); doc.text(lines, M, y); y += lines.length * 11 + 12
  }
  block('NOTES', inv.notes)
  block('TERMS & CONDITIONS', inv.terms)

  // signature
  if (y + 60 > bottomLimit) { doc.addPage(); y = M }
  const sx = W - M - 170
  y = Math.max(y + 10, y)
  F('normal', 8.5, mid); doc.text(`For ${inv.business.name || 'Your Business'}`, W - M, y + 6, { align: 'right', maxWidth: 170 })
  doc.setDrawColor(...line); doc.setLineWidth(0.6); doc.line(sx, y + 44, W - M, y + 44)
  F('normal', 8, mid); doc.text(inv.signatory || 'Authorised Signatory', W - M, y + 56, { align: 'right' })

  // footer
  const n = doc.getNumberOfPages()
  for (let p = 1; p <= n; p++) {
    doc.setPage(p)
    if (tpl === 'modern') { doc.setFillColor(...accent); doc.rect(0, H - 6, W, 6, 'F') }
    F('normal', 7.5, [150, 154, 168])
    doc.text(inv.taxMode === 'cgst' || inv.taxMode === 'igst' ? 'This is a computer-generated invoice.' : 'Thank you for your business.', M, H - 22)
    if (n > 1) doc.text(`Page ${p} of ${n}`, W - M, H - 22, { align: 'right' })
  }
  doc.setProperties({ title: `${inv.title} ${inv.number}`, subject: `Invoice for ${inv.client.name}`, creator: 'OpenFile Invoice Generator', author: inv.business.name })
}

export function fmtDate(iso: string) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(+d)) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtQty(q: number) { const n = +q || 0; return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '') }
