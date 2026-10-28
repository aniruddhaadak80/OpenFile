/* Arbitrary base (2 to 64) conversion with BigInt, plus Roman numerals. Pure logic. */
export const DIGITS64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/'

/** Digits up to base 36 are case-insensitive. Above 36 the case matters (A=10, a=36), then + and /. */
export function parseBase(input: string, radix: number): bigint {
  if (radix < 2 || radix > 64) throw new Error('Base must be between 2 and 64')
  let t = input.trim().replace(/[\s_']/g, '')
  let neg = false
  if (t.startsWith('-') || t.startsWith('\u2212')) { neg = true; t = t.slice(1) } else if (t.startsWith('+') && radix < 63) t = t.slice(1)
  if (radix <= 36) t = t.toUpperCase()
  if (radix === 16) t = t.replace(/^0X/, ''); else if (radix === 2) t = t.replace(/^0B/, ''); else if (radix === 8) t = t.replace(/^0O/, '')
  if (!t) throw new Error('empty')
  const R = BigInt(radix)
  let v = 0n
  for (const ch of t) {
    const d = DIGITS64.indexOf(ch)
    if (d < 0 || d >= radix) throw new Error(`"${ch}" is not a valid base ${radix} digit`)
    v = v * R + BigInt(d)
  }
  return neg ? -v : v
}

export function toBase(v: bigint, radix: number, upper = true): string {
  if (radix < 2 || radix > 64) throw new Error('Base must be between 2 and 64')
  if (radix <= 36) { const s = v.toString(radix); return upper ? s.toUpperCase() : s }
  if (v === 0n) return '0'
  const neg = v < 0n; let n = neg ? -v : v; const R = BigInt(radix); let s = ''
  while (n > 0n) { s = DIGITS64[Number(n % R)] + s; n /= R }
  return (neg ? '-' : '') + s
}

const ROMAN: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
const OVER = '\u0305'
/** 1 to 3,999 in standard form. Up to 3,999,999 using a combining overline (vinculum) for thousands. */
export function toRoman(n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error('Roman numerals start at 1 (there is no zero or negative)')
  if (n > 3999999) throw new Error('Too large, the limit is 3,999,999')
  const plain = (x: number) => { let s = ''; for (const [v, r] of ROMAN) while (x >= v) { s += r; x -= v } return s }
  if (n < 4000) return plain(n)
  const th = Math.floor(n / 1000), rest = n % 1000
  return Array.from(plain(th)).map((c) => c + OVER).join('') + plain(rest)
}
export function fromRoman(input: string): number {
  const s = input.trim().toUpperCase().replace(/\s/g, '')
  if (!s) throw new Error('empty')
  // split vinculum part
  let big = '', small = ''
  for (let i = 0; i < s.length; i++) { if (s[i + 1] === OVER) { big += s[i]; i++ } else small += s[i] }
  const one = (r: string) => {
    if (!r) return 0
    if (!/^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(r)) throw new Error(`"${r}" is not a valid Roman numeral`)
    let i = 0, n = 0
    for (const [v, sym] of ROMAN) while (r.startsWith(sym, i)) { n += v; i += sym.length }
    return n
  }
  if (/[^MDCLXVI]/.test(big + small)) throw new Error('Roman numerals use only I, V, X, L, C, D and M')
  const n = one(big) * 1000 + one(small)
  if (!n) throw new Error('empty')
  return n
}
