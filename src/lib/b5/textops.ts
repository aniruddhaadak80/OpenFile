/* Text utilities (pure). */
const seg = typeof Intl !== 'undefined' && (Intl as any).Segmenter ? new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' }) : null
export const graphemes = (s: string): string[] => (seg ? Array.from(seg.segment(s), (x: any) => x.segment) : Array.from(s))

/* ---------- reverse ---------- */
export function reverseText(s: string, mode: 'chars' | 'words' | 'lines' | 'each-word' | 'each-line' | 'upside') {
  switch (mode) {
    case 'chars': return graphemes(s).reverse().join('')
    case 'words': return s.split('\n').map((l) => l.split(/(\s+)/).reverse().join('')).join('\n')
    case 'lines': return s.split('\n').reverse().join('\n')
    case 'each-word': return s.replace(/\S+/g, (w) => graphemes(w).reverse().join(''))
    case 'each-line': return s.split('\n').map((l) => graphemes(l).reverse().join('')).join('\n')
    case 'upside': return graphemes(s).reverse().map((c) => UPSIDE[c] ?? c).join('')
  }
}
const UP_SRC = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?\'"()[]{}<>&_;'
const UP_DST = 'ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz∀ꓭƆꓷƎℲ⅁HIꓩꓘ⅂WNOԀꝹꓤSꓕՈɅMX⅄Z0⇂↊↋ߤϛ9ㄥ86˙\'¡¿,„)(][}{><⅋‾؛'
const UPSIDE: Record<string, string> = Object.fromEntries(Array.from(UP_SRC).map((c, i) => [c, Array.from(UP_DST)[i]]))

/* ---------- line numbers ---------- */
export function addLineNumbers(s: string, o: { start: number; step: number; format: string; pad: 'none' | 'zero' | 'space'; skipEmpty: boolean }) {
  const lines = s.split('\n'); let n = o.start
  const width = String(o.start + (lines.length - 1) * o.step).length
  return lines.map((l) => {
    if (o.skipEmpty && !l.trim()) return l
    const num = o.pad === 'zero' ? String(n).padStart(width, '0') : o.pad === 'space' ? String(n).padStart(width, ' ') : String(n)
    n += o.step
    return o.format.includes('{n}') ? o.format.replace('{n}', num) + l : num + o.format + l
  }).join('\n')
}
export function removeLineNumbers(s: string) {
  return s.split('\n').map((l) => l.replace(/^\s*(?:\[\s*)?\d+(?:\s*\])?\s*(?:[.:)|\-–]\s?|\t|\s{1,})/, '')).join('\n')
}

/* ---------- slug ---------- */
const TRANSLIT: Record<string, string> = {
  ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', æ: 'ae', ø: 'o', å: 'a', œ: 'oe', ð: 'd', þ: 'th', ł: 'l', đ: 'd', ħ: 'h', ı: 'i', ŀ: 'l', ŉ: 'n', ŧ: 't',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', і: 'i', ї: 'yi', є: 'ye', ґ: 'g',
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
  ş: 's', ğ: 'g', ç: 'c', '&': ' and ', '@': ' at ', '%': ' percent ', '+': ' plus ', '€': ' euro ', '$': ' dollar ', '£': ' pound ', '₹': ' rupee ',
}
export function slugify(s: string, o: { sep: string; lower: boolean; max: number; translit: boolean; stop: boolean } = { sep: '-', lower: true, max: 0, translit: true, stop: false }) {
  let t = s
  if (o.translit) t = Array.from(t).map((c) => { const l = c.toLowerCase(); const r = TRANSLIT[l]; if (r === undefined) return c; return c !== l && r ? r[0].toUpperCase() + r.slice(1) : r }).join('')
  t = t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  if (o.lower) t = t.toLowerCase()
  if (o.stop) t = t.replace(/\b(a|an|the|and|or|of|to|in|on|for|with|at|by|is|are)\b/gi, ' ')
  t = t.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, o.sep)
  if (o.max > 0 && t.length > o.max) { t = t.slice(0, o.max); const i = t.lastIndexOf(o.sep); if (i > o.max * 0.6) t = t.slice(0, i) }
  return t.replace(new RegExp(`^${esc(o.sep)}+|${esc(o.sep)}+$`, 'g'), '')
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/* ---------- extractors ---------- */
export const EXTRACTORS: { id: string; name: string; re: RegExp; norm?: (s: string) => string }[] = [
  { id: 'email', name: 'Emails', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, norm: (s) => s.toLowerCase() },
  { id: 'url', name: 'URLs', re: /\bhttps?:\/\/[^\s<>"'`)\]]+[^\s<>"'`)\].,;:!?]/gi },
  { id: 'domain', name: 'Domains', re: /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|io|dev|app|ai|co|in|uk|de|fr|jp|cn|ru|br|au|ca|es|it|nl|se|ch|us|edu|gov|info|biz|me|tv|xyz|tech|cloud|site|online|store|blog)\b/gi, norm: (s) => s.toLowerCase() },
  { id: 'ipv4', name: 'IPv4 addresses', re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g },
  { id: 'ipv6', name: 'IPv6 addresses', re: /(?<![\w:])(?:[0-9a-f]{1,4}:){2,7}(?::|[0-9a-f]{1,4})(?:[0-9a-f]{0,4}(?::[0-9a-f]{1,4})*)?(?![\w:])/gi },
  { id: 'phone', name: 'Phone numbers', re: /(?<!\w)\+?\d[\d\s().-]{7,}\d(?!\w)/g, norm: (s) => s.trim() },
  { id: 'hash', name: 'Hashes (MD5, SHA)', re: /\b(?:[a-f0-9]{128}|[a-f0-9]{64}|[a-f0-9]{40}|[a-f0-9]{32})\b/gi },
  { id: 'date', name: 'Dates', re: /\b(?:\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4})\b/gi },
  { id: 'mac', name: 'MAC addresses', re: /\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/gi },
  { id: 'uuid', name: 'UUIDs', re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi },
  { id: 'hashtag', name: 'Hashtags', re: /(?<![\w&])#[\p{L}\p{N}_]+/gu },
  { id: 'mention', name: '@mentions', re: /(?<![\w.])@[A-Za-z0-9_]{2,}/g },
  { id: 'number', name: 'Numbers', re: /-?\b\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?\b|-?\b\d+(?:\.\d+)?\b/g },
  { id: 'money', name: 'Money amounts', re: /(?:[$€£¥₹]\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{1,2})?\s?(?:USD|EUR|GBP|INR|JPY))/g },
  { id: 'card', name: 'Card-like numbers', re: /\b\d(?:[ -]?\d){12,18}\b/g },
]

export function extract(text: string, id: string, unique = true, sort = false) {
  const x = EXTRACTORS.find((e) => e.id === id)!; x.re.lastIndex = 0
  let out = (text.match(x.re) ?? []).map((m) => (x.norm ? x.norm(m) : m))
  if (id === 'card') out = out.filter((c) => luhn(c.replace(/\D/g, '')))
  if (unique) out = [...new Set(out)]
  if (sort) out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return out
}
export function luhn(d: string) { let s = 0; for (let i = 0; i < d.length; i++) { let n = +d[d.length - 1 - i]; if (i % 2) { n *= 2; if (n > 9) n -= 9 } s += n } return d.length >= 13 && s % 10 === 0 }

/* ---------- list tools ---------- */
export function splitList(s: string, sep: string) {
  const re = sep === 'auto' ? (s.includes('\n') ? /\r?\n/ : s.includes(',') ? /,/ : s.includes(';') ? /;/ : s.includes('\t') ? /\t/ : /\s+/) : sep === 'newline' ? /\r?\n/ : sep === 'space' ? /\s+/ : sep === 'tab' ? /\t/ : new RegExp(esc(sep))
  return s.split(re)
}
export type SetOp = 'union' | 'intersection' | 'a-b' | 'b-a' | 'xor'
export function setOp(a: string[], b: string[], op: SetOp, ci: boolean) {
  const k = (x: string) => (ci ? x.toLowerCase() : x)
  const A = new Map(a.map((x) => [k(x), x])), B = new Map(b.map((x) => [k(x), x]))
  switch (op) {
    case 'union': return [...new Map([...A, ...[...B].filter(([key]) => !A.has(key))]).values()]
    case 'intersection': return [...A].filter(([key]) => B.has(key)).map(([, v]) => v)
    case 'a-b': return [...A].filter(([key]) => !B.has(key)).map(([, v]) => v)
    case 'b-a': return [...B].filter(([key]) => !A.has(key)).map(([, v]) => v)
    case 'xor': return [...[...A].filter(([key]) => !B.has(key)), ...[...B].filter(([key]) => !A.has(key))].map(([, v]) => v)
  }
}
export function shuffle<T>(a: T[]): T[] {
  const r = a.slice(); const buf = new Uint32Array(1)
  for (let i = r.length - 1; i > 0; i--) { crypto.getRandomValues(buf); const j = buf[0] % (i + 1); [r[i], r[j]] = [r[j], r[i]] }
  return r
}

/* ---------- fancy unicode text ---------- */
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const D = '0123456789'
function mathMap(upper: number, lower: number, digit?: number, exceptions: Record<string, string> = {}) {
  return (s: string) => Array.from(s).map((c) => {
    if (exceptions[c]) return exceptions[c]
    const i = A.indexOf(c)
    if (i >= 0) return String.fromCodePoint((i < 26 ? upper : lower) + (i % 26))
    const d = D.indexOf(c); if (d >= 0 && digit) return String.fromCodePoint(digit + d)
    return c
  }).join('')
}
const fromList = (list: string) => { const chars = Array.from(list); return (s: string) => Array.from(s).map((c) => { const i = A.indexOf(c); if (i >= 0) return chars[i] ?? c; const d = D.indexOf(c); return d >= 0 && chars[52 + d] ? chars[52 + d] : c }).join('') }
const combine = (mark: string) => (s: string) => Array.from(s).map((c) => (c.trim() ? c + mark : c)).join('')

export const FANCY: { id: string; name: string; fn: (s: string) => string }[] = [
  { id: 'bold', name: 'Bold', fn: mathMap(0x1d400, 0x1d41a, 0x1d7ce) },
  { id: 'italic', name: 'Italic', fn: mathMap(0x1d434, 0x1d44e, undefined, { h: 'ℎ' }) },
  { id: 'bolditalic', name: 'Bold italic', fn: mathMap(0x1d468, 0x1d482) },
  { id: 'sans', name: 'Sans', fn: mathMap(0x1d5a0, 0x1d5ba, 0x1d7e2) },
  { id: 'sansbold', name: 'Sans bold', fn: mathMap(0x1d5d4, 0x1d5ee, 0x1d7ec) },
  { id: 'sansitalic', name: 'Sans italic', fn: mathMap(0x1d608, 0x1d622) },
  { id: 'script', name: 'Script', fn: mathMap(0x1d49c, 0x1d4b6, undefined, { B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ', e: 'ℯ', g: 'ℊ', o: 'ℴ' }) },
  { id: 'boldscript', name: 'Bold script', fn: mathMap(0x1d4d0, 0x1d4ea) },
  { id: 'fraktur', name: 'Gothic', fn: mathMap(0x1d504, 0x1d51e, undefined, { C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ' }) },
  { id: 'boldfraktur', name: 'Bold gothic', fn: mathMap(0x1d56c, 0x1d586) },
  { id: 'double', name: 'Double struck', fn: mathMap(0x1d538, 0x1d552, 0x1d7d8, { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' }) },
  { id: 'mono', name: 'Monospace', fn: mathMap(0x1d670, 0x1d68a, 0x1d7f6) },
  { id: 'bubble', name: 'Bubbles', fn: fromList('ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ⓪①②③④⑤⑥⑦⑧⑨') },
  { id: 'bubbledark', name: 'Dark bubbles', fn: fromList('🅐🅑🅒🅓🅔🅕🅖🅗🅘🅙🅚🅛🅜🅝🅞🅟🅠🅡🅢🅣🅤🅥🅦🅧🅨🅩🅐🅑🅒🅓🅔🅕🅖🅗🅘🅙🅚🅛🅜🅝🅞🅟🅠🅡🅢🅣🅤🅥🅦🅧🅨🅩⓿❶❷❸❹❺❻❼❽❾') },
  { id: 'squares', name: 'Squares', fn: fromList('🄰🄱🄲🄳🄴🄵🄶🄷🄸🄹🄺🄻🄼🄽🄾🄿🅀🅁🅂🅃🅄🅅🅆🅇🅈🅉🄰🄱🄲🄳🄴🄵🄶🄷🄸🄹🄺🄻🄼🄽🄾🄿🅀🅁🅂🅃🅄🅅🅆🅇🅈🅉') },
  { id: 'wide', name: 'Full width', fn: (s) => Array.from(s).map((c) => { const cp = c.codePointAt(0)!; return cp >= 33 && cp <= 126 ? String.fromCodePoint(cp + 0xfee0) : c === ' ' ? '\u3000' : c }).join('') },
  { id: 'smallcaps', name: 'Small caps', fn: (s) => fromList('ABCDEFGHIJKLMNOPQRSTUVWXYZᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ')(s) },
  { id: 'superscript', name: 'Tiny', fn: fromList('ᴬᴮᶜᴰᴱᶠᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾQᴿˢᵀᵁⱽᵂˣʸᶻᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖᑫʳˢᵗᵘᵛʷˣʸᶻ⁰¹²³⁴⁵⁶⁷⁸⁹') },
  { id: 'upside', name: 'Upside down', fn: (s) => reverseText(s, 'upside') },
  { id: 'strike', name: 'Strikethrough', fn: combine('\u0336') },
  { id: 'underline', name: 'Underline', fn: combine('\u0332') },
  { id: 'slash', name: 'Slashed', fn: combine('\u0338') },
  { id: 'spaced', name: 'S p a c e d', fn: (s) => Array.from(s).join(' ') },
]
