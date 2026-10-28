/* Find text matches on PDF pages and return their boxes in viewport points (top-left origin, scale 1). */
import { pdfjs, type PdfJsDoc } from '@/lib/pdf'

export type PresetId = 'email' | 'phone' | 'card' | 'ssn' | 'aadhaar' | 'pan' | 'iban' | 'url' | 'ip'
export const PRESETS: { id: PresetId; label: string; example: string }[] = [
  { id: 'email', label: 'Email addresses', example: 'name@example.com' },
  { id: 'phone', label: 'Phone numbers', example: '+91 98765 43210' },
  { id: 'card', label: 'Credit / debit cards', example: '4111 1111 1111 1111' },
  { id: 'ssn', label: 'US SSN', example: '123-45-6789' },
  { id: 'aadhaar', label: 'Aadhaar numbers', example: '2345 6789 0123' },
  { id: 'pan', label: 'PAN (India)', example: 'ABCDE1234F' },
  { id: 'iban', label: 'IBAN', example: 'GB82 WEST 1234 …' },
  { id: 'url', label: 'Web links', example: 'https://…' },
  { id: 'ip', label: 'IP addresses', example: '192.168.0.1' },
]

function luhn(digits: string) {
  let sum = 0, alt = false
  for (let i = digits.length - 1; i >= 0; i--) { let n = +digits[i]; if (alt) { n *= 2; if (n > 9) n -= 9 } sum += n; alt = !alt }
  return sum % 10 === 0
}

// order matters: more specific patterns first so later ones skip overlaps
const RX: Record<PresetId, { re: RegExp; ok?: (m: string) => boolean }> = {
  email: { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  url: { re: /\b(?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)]/gi },
  card: { re: /\b(?:\d[ -]?){12,18}\d\b/g, ok: (m) => { const d = m.replace(/\D/g, ''); return d.length >= 13 && d.length <= 19 && luhn(d) } },
  iban: { re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g },
  ssn: { re: /\b\d{3}-\d{2}-\d{4}\b/g },
  aadhaar: { re: /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g },
  pan: { re: /\b[A-Z]{3}[ABCFGHLJPTK][A-Z]\d{4}[A-Z]\b/g },
  ip: { re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g },
  phone: { re: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d[\d\s.-]{6,14}\d/g, ok: (m) => { const d = m.replace(/\D/g, ''); return d.length >= 8 && d.length <= 15 && !/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(m.trim()) } },
}
const ORDER: PresetId[] = ['email', 'url', 'card', 'iban', 'ssn', 'aadhaar', 'pan', 'ip', 'phone']

export interface Match { id: string; page: number; kind: string; text: string; boxes: { x: number; y: number; w: number; h: number }[] }

export function buildCustom(regex: string, words: string, wholeWord: boolean, caseSensitive: boolean): { res: { kind: string; re: RegExp }[]; error: string | null } {
  const res: { kind: string; re: RegExp }[] = []
  const flags = caseSensitive ? 'g' : 'gi'
  const list = words.split(/[\n,]+/).map((w) => w.trim()).filter(Boolean)
  if (list.length) {
    const esc = list.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length)
    const body = `(?:${esc.join('|')})`
    res.push({ kind: 'Word', re: new RegExp(wholeWord ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body, flags + 'u') })
  }
  if (regex.trim()) {
    try {
      const r = new RegExp(regex, flags)
      if (r.test('')) return { res, error: 'That pattern matches empty text — make it more specific.' }
      res.push({ kind: 'Pattern', re: r })
    } catch (e: any) { return { res, error: 'Invalid regular expression: ' + (e?.message || '') } }
  }
  return { res, error: null }
}

const measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null

export async function findMatches(doc: PdfJsDoc, presets: PresetId[], custom: { kind: string; re: RegExp }[], onProgress?: (p: number) => void): Promise<Match[]> {
  const out: Match[] = []
  let seq = 0
  const label: Record<string, string> = { email: 'Email', phone: 'Phone', card: 'Card', ssn: 'SSN', aadhaar: 'Aadhaar', pan: 'PAN', iban: 'IBAN', url: 'Link', ip: 'IP' }
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const vp = page.getViewport({ scale: 1 })
    const tc = await page.getTextContent()
    // build page string with char -> (item, offset) map
    type Seg = { tx: number[]; width: number; str: string }
    const segs: Seg[] = []
    let text = ''
    const map: ({ s: number; o: number } | null)[] = []
    for (const it of tc.items as any[]) {
      if (!('str' in it)) continue
      const tx = pdfjs.Util.transform(vp.transform, it.transform) as number[]
      const si = segs.length
      segs.push({ tx, width: it.width, str: it.str })
      // separator between items: newline if the baseline moved, otherwise a space when there is a visible gap
      if (si > 0 && text && !text.endsWith('\n')) {
        const prev = segs[si - 1]
        const fh = Math.hypot(tx[2], tx[3]) || 10
        const sameLine = Math.abs(prev.tx[5] - tx[5]) < fh * 0.5
        if (!sameLine) { text += '\n'; map.push(null) }
        else {
          const prevEnd = prev.tx[4] + prev.width * (Math.hypot(prev.tx[0], prev.tx[1]) / (Math.hypot(prev.tx[0], prev.tx[1]) || 1))
          if (tx[4] - prevEnd > fh * 0.15 && !text.endsWith(' ') && !it.str.startsWith(' ')) { text += ' '; map.push(null) }
        }
      }
      for (let o = 0; o < it.str.length; o++) { text += it.str[o]; map.push({ s: si, o }) }
      if (it.hasEOL) { text += '\n'; map.push(null) }
    }
    const taken: [number, number][] = []
    const overlaps = (a: number, b: number) => taken.some(([x, y]) => a < y && b > x)
    const run = (kind: string, re: RegExp, ok?: (m: string) => boolean) => {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(text))) {
        if (!m[0]) { re.lastIndex++; continue }
        const a = m.index, b = a + m[0].length
        if (overlaps(a, b) || (ok && !ok(m[0]))) continue
        taken.push([a, b])
        const boxes = boxesFor(segs, map, a, b)
        if (boxes.length) out.push({ id: `m${seq++}`, page: p - 1, kind, text: m[0].replace(/\s+/g, ' ').trim(), boxes })
      }
    }
    for (const c of custom) run(c.kind, c.re)
    for (const id of ORDER) if (presets.includes(id)) run(label[id], RX[id].re, RX[id].ok)
    onProgress?.(p / doc.numPages)
  }
  return out
}

function boxesFor(segs: { tx: number[]; width: number; str: string }[], map: ({ s: number; o: number } | null)[], a: number, b: number) {
  // group the char range by segment
  const per = new Map<number, [number, number]>()
  for (let i = a; i < b; i++) {
    const c = map[i]; if (!c) continue
    const r = per.get(c.s)
    if (!r) per.set(c.s, [c.o, c.o + 1]); else r[1] = c.o + 1
  }
  const boxes: { x: number; y: number; w: number; h: number }[] = []
  for (const [si, [o0, o1]] of per) {
    const s = segs[si]
    const fh = Math.hypot(s.tx[2], s.tx[3]) || 10
    const sx = Math.hypot(s.tx[0], s.tx[1]) || 1
    const dir = [s.tx[0] / sx, s.tx[1] / sx]
    const up = [dir[1], -dir[0]] // screen "up" for the glyphs (y grows downward)
    let f0 = o0 / s.str.length, f1 = o1 / s.str.length
    if (measureCtx && s.str.length) {
      measureCtx.font = '20px Helvetica, Arial, sans-serif'
      const W = measureCtx.measureText(s.str).width || 1
      f0 = measureCtx.measureText(s.str.slice(0, o0)).width / W
      f1 = measureCtx.measureText(s.str.slice(0, o1)).width / W
    }
    const len = s.width
    const ox = s.tx[4], oy = s.tx[5]
    const p0 = [ox + dir[0] * len * f0, oy + dir[1] * len * f0]
    const p1 = [ox + dir[0] * len * f1, oy + dir[1] * len * f1]
    const asc = fh * 0.88, desc = fh * 0.24
    const pts = [p0, p1].flatMap(([x, y]) => [[x + up[0] * asc, y + up[1] * asc], [x - up[0] * desc, y - up[1] * desc]])
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
    const x = Math.min(...xs) - 1, y = Math.min(...ys) - 1
    boxes.push({ x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1 })
  }
  return boxes
}
