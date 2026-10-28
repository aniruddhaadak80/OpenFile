const ROMAN: [number, string][] = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]
export function toRoman(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return ''
  let s = ''
  for (const [v, r] of ROMAN) while (n >= v) { s += r; n -= v }
  return s
}
export function fromRoman(s: string): number {
  const t = s.trim().toUpperCase()
  if (!/^[MDCLXVI]+$/.test(t)) return NaN
  let n = 0
  for (let i = 0; i < t.length; i++) {
    const a = ROMAN.find((x) => x[1] === t[i])![0]
    const b = i + 1 < t.length ? ROMAN.find((x) => x[1] === t[i + 1])![0] : 0
    n += a < b ? -a : a
  }
  return toRoman(n) === t ? n : NaN
}
export function romanLines(input: string): string {
  return input.split('\n').map((l) => {
    const t = l.trim()
    if (!t) return ''
    if (/^\d+$/.test(t)) return toRoman(Number(t)) || 'out of range (1 to 3999)'
    const n = fromRoman(t)
    return Number.isNaN(n) ? 'not a valid numeral' : String(n)
  }).join('\n')
}
const MORSE: Record<string, string> = { A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..','0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....','6':'-....','7':'--...','8':'---..','9':'----.','.':'.-.-.-',',':'--..--','?':'..--..',"'":'.----.','!':'-.-.--','/':'-..-.','(':'-.--.',')':'-.--.-','&':'.-...',':':'---...',';':'-.-.-.','=':'-...-','+':'.-.-.','-':'-....-','_':'..--.-','"':'.-..-.','$':'...-..-','@':'.--.-.' }
const REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]))
export function toMorse(t: string): string {
  return t.toUpperCase().split('\n').map((line) => line.split(/\s+/).filter(Boolean).map((w) => [...w].map((c) => MORSE[c] ?? '').filter(Boolean).join(' ')).join(' / ')).join('\n')
}
export function fromMorse(t: string): string {
  return t.split('\n').map((line) => line.split(/\s*\/\s*|\s{3,}/).map((w) => w.trim().split(/\s+/).filter(Boolean).map((c) => REV[c] ?? '?').join('')).join(' ')).join('\n')
}
export function morseDecode(t: string) { return /^[\s.\-/_·–•]+$/.test(t) && /[.\-]/.test(t) ? fromMorse(t.replace(/[·•]/g, '.').replace(/[–_]/g, '-')) : toMorse(t) }
export interface DedupeOpts { ignoreCase: boolean; trim: boolean; dropEmpty: boolean; onlyDuplicates: boolean }
export function dedupe(input: string, o: DedupeOpts) {
  const lines = input.split(/\r?\n/)
  const seen = new Map<string, number>()
  const key = (l: string) => { let k = o.trim ? l.trim() : l; if (o.ignoreCase) k = k.toLowerCase(); return k }
  for (const l of lines) seen.set(key(l), (seen.get(key(l)) ?? 0) + 1)
  const used = new Set<string>()
  const out: string[] = []
  for (const l of lines) {
    const k = key(l)
    if (o.dropEmpty && k === '') continue
    if (o.onlyDuplicates) { if ((seen.get(k) ?? 0) > 1 && !used.has(k)) { used.add(k); out.push(l) }; continue }
    if (used.has(k)) continue
    used.add(k); out.push(l)
  }
  return { text: out.join('\n'), removed: lines.length - out.length }
}
export type SortMode = 'az' | 'za' | 'natural' | 'length' | 'numeric' | 'random' | 'reverse'
export function sortLines(input: string, mode: SortMode, ignoreCase: boolean): string {
  const l = input.split(/\r?\n/)
  const k = (s: string) => (ignoreCase ? s.toLowerCase() : s)
  switch (mode) {
    case 'az': return l.sort((a, b) => k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0).join('\n')
    case 'za': return l.sort((a, b) => k(a) < k(b) ? 1 : k(a) > k(b) ? -1 : 0).join('\n')
    case 'natural': return l.sort((a, b) => k(a).localeCompare(k(b), undefined, { numeric: true })).join('\n')
    case 'length': return l.sort((a, b) => a.length - b.length).join('\n')
    case 'numeric': return l.sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0)).join('\n')
    case 'reverse': return l.reverse().join('\n')
    case 'random': for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]] } return l.join('\n')
  }
}
export function addLineNumbers(input: string, start: number, sep: string): string {
  return input.split(/\r?\n/).map((l, i) => `${start + i}${sep}${l}`).join('\n')
}
export function wrapText(input: string, width: number): string {
  return input.split('\n').map((p) => {
    const out: string[] = []; let cur = ''
    for (const w of p.split(/\s+/).filter(Boolean)) {
      if (cur && (cur + ' ' + w).length > width) { out.push(cur); cur = w } else cur = cur ? cur + ' ' + w : w
    }
    if (cur) out.push(cur)
    return out.join('\n')
  }).join('\n')
}
export function wcag(fg: string, bg: string) {
  const p = (h: string) => { const x = h.replace('#', ''); const f = x.length === 3 ? [...x].map((c) => c + c).join('') : x; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)) }
  const lum = (h: string) => { const [r, g, b] = p(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
  const a = lum(fg), b = lum(bg)
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  return { ratio, aaText: ratio >= 4.5, aaLarge: ratio >= 3, aaaText: ratio >= 7, aaaLarge: ratio >= 4.5 }
}
