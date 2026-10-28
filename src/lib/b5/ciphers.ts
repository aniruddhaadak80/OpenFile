/* Classic ciphers and codes (pure). */
const shiftChar = (c: string, k: number) => {
  const code = c.charCodeAt(0)
  if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 + k) % 26 + 26) % 26 + 65)
  if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 + k) % 26 + 26) % 26 + 97)
  return c
}
export const caesar = (s: string, k: number) => s.replace(/[a-z]/gi, (c) => shiftChar(c, k))
export const rot13 = (s: string) => caesar(s, 13)
export const rot47 = (s: string) => s.replace(/[!-~]/g, (c) => String.fromCharCode(33 + ((c.charCodeAt(0) - 33 + 47) % 94)))
export const atbash = (s: string) => s.replace(/[a-z]/gi, (c) => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(b + 25 - (c.charCodeAt(0) - b)) })

export function vigenere(s: string, key: string, decrypt = false) {
  const k = key.toLowerCase().replace(/[^a-z]/g, '')
  if (!k) throw new Error('The key needs at least one letter.')
  let i = 0
  return s.replace(/[a-z]/gi, (c) => { const sh = k.charCodeAt(i++ % k.length) - 97; return shiftChar(c, decrypt ? -sh : sh) })
}

export function affine(s: string, a: number, b: number, decrypt = false) {
  const g = (x: number, y: number): number => (y ? g(y, x % y) : x)
  if (g(a, 26) !== 1) throw new Error('a must be coprime with 26 (1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23 or 25).')
  let inv = 1; while ((a * inv) % 26 !== 1) inv++
  return s.replace(/[a-z]/gi, (c) => { const base = c <= 'Z' ? 65 : 97; const x = c.charCodeAt(0) - base; const y = decrypt ? (((inv * (x - b)) % 26) + 26) % 26 : (a * x + b) % 26; return String.fromCharCode(base + y) })
}

const MORSE: Record<string, string> = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', _: '..--.-', '"': '.-..-.', $: '...-..-', '@': '.--.-.' }
const MORSE_R = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]))
export const toMorse = (s: string) => s.toUpperCase().split(/\s+/).filter(Boolean).map((w) => Array.from(w).map((c) => MORSE[c] ?? '').filter(Boolean).join(' ')).join(' / ')
export const fromMorse = (s: string) => s.trim().replace(/[•·]/g, '.').replace(/[—–_]/g, '-').split(/\s*[/|]\s*|\s{3,}/).map((w) => w.split(/\s+/).map((c) => MORSE_R[c] ?? (c ? '?' : '')).join('')).join(' ')

export function bacon(s: string, decode = false) {
  const enc = (i: number) => i.toString(2).padStart(5, '0').replace(/0/g, 'A').replace(/1/g, 'B')
  if (!decode) return s.toUpperCase().replace(/[A-Z]/g, (c) => enc(c.charCodeAt(0) - 65) + ' ').replace(/[^AB\s]/g, '').trim().replace(/\s+/g, ' ')
  const t = s.toUpperCase().replace(/[^AB]/g, '')
  return (t.match(/.{5}/g) ?? []).map((g) => { const i = parseInt(g.replace(/A/g, '0').replace(/B/g, '1'), 2); return i < 26 ? String.fromCharCode(65 + i) : '?' }).join('')
}

export function railFence(s: string, rails: number, decode = false) {
  if (rails < 2) return s
  const n = s.length; const cycle = 2 * (rails - 1)
  const railOf = (i: number) => { const p = i % cycle; return p < rails ? p : cycle - p }
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => railOf(a) - railOf(b) || a - b)
  if (!decode) return order.map((i) => s[i]).join('')
  const out = Array<string>(n); order.forEach((pos, k) => { out[pos] = s[k] }); return out.join('')
}

const NATO = ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'X-ray', 'Yankee', 'Zulu']
const NATO_D = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
export const toNato = (s: string) => Array.from(s).map((c) => /[a-z]/i.test(c) ? NATO[c.toUpperCase().charCodeAt(0) - 65] : /\d/.test(c) ? NATO_D[+c] : c === ' ' ? '/' : c).join(' ')
export const fromNato = (s: string) => s.split(/\s+/).map((w) => { if (w === '/') return ' '; const i = NATO.findIndex((n) => n.toLowerCase() === w.toLowerCase().replace('alpha', 'alfa').replace('juliet', 'juliett').replace('xray', 'x-ray')); if (i >= 0) return String.fromCharCode(65 + i); const d = NATO_D.findIndex((n) => n.toLowerCase() === w.toLowerCase()); return d >= 0 ? String(d) : w }).join('')

const BR = ' a1b\'k2l@cif/msp"e3h9o6r^djg>ntq,*5<-u8v.%[$+x!&;:4\\0z7(_?w]#y)='
export const toBraille = (s: string) => Array.from(s.toLowerCase()).map((c) => { const i = BR.indexOf(c); return i >= 0 ? String.fromCharCode(0x2800 + i) : c }).join('')
export const fromBraille = (s: string) => Array.from(s).map((c) => { const i = c.charCodeAt(0) - 0x2800; return i >= 0 && i < 64 ? BR[i] : c }).join('')

const LEET: Record<string, string> = { a: '4', b: '8', e: '3', g: '6', i: '1', l: '1', o: '0', s: '5', t: '7', z: '2' }
const LEET_R: Record<string, string> = { 4: 'a', 8: 'b', 3: 'e', 6: 'g', 1: 'i', 0: 'o', 5: 's', 7: 't', 2: 'z' }
export const toLeet = (s: string) => s.replace(/[abegilostz]/gi, (c) => LEET[c.toLowerCase()])
export const fromLeet = (s: string) => s.replace(/[0-8]/g, (c) => LEET_R[c] ?? c)

export const toBin = (s: string) => Array.from(new TextEncoder().encode(s), (b) => b.toString(2).padStart(8, '0')).join(' ')
export const fromBin = (s: string) => { const t = s.replace(/[^01]/g, ''); return new TextDecoder().decode(Uint8Array.from(t.match(/.{8}/g) ?? [], (x) => parseInt(x, 2))) }

export const toA1Z26 = (s: string) => s.toUpperCase().split(/\s+/).map((w) => Array.from(w).filter((c) => /[A-Z]/.test(c)).map((c) => c.charCodeAt(0) - 64).join('-')).filter(Boolean).join(' ')
export const fromA1Z26 = (s: string) => s.trim().split(/\s+/).map((w) => w.split(/[-,.]/).filter(Boolean).map((n) => { const i = parseInt(n, 10); return i >= 1 && i <= 26 ? String.fromCharCode(64 + i) : '?' }).join('')).join(' ')

export function xorHex(s: string, key: string, decode = false) {
  const k = new TextEncoder().encode(key); if (!k.length) throw new Error('XOR needs a key.')
  if (!decode) return Array.from(new TextEncoder().encode(s), (b, i) => (b ^ k[i % k.length]).toString(16).padStart(2, '0')).join(' ')
  const bytes = (s.replace(/[^0-9a-f]/gi, '').match(/../g) ?? []).map((h, i) => parseInt(h, 16) ^ k[i % k.length])
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

/** English letter frequency score, used to rank Caesar brute-force results. */
const FREQ = 'etaoinshrdlcumwfgypbvkjxqz'
export function englishScore(s: string) { let sc = 0; for (const c of s.toLowerCase()) { const i = FREQ.indexOf(c); if (i >= 0) sc += 26 - i } return sc / Math.max(1, s.length) }
