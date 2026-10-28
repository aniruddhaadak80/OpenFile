/** Regex helpers: token explainer + pattern library. */
export interface Tok { text: string; desc: string; kind: 'anchor' | 'class' | 'quant' | 'group' | 'escape' | 'literal' | 'alt' | 'set' | 'backref' | 'look' }

const ESC: Record<string, string> = {
  d: 'a digit (0–9)', D: 'a non-digit', w: 'a word character (letter, digit, _)', W: 'a non-word character', s: 'whitespace (space, tab, newline…)', S: 'a non-whitespace character',
  b: 'a word boundary', B: 'a non-word boundary', n: 'a newline', r: 'a carriage return', t: 'a tab', f: 'a form feed', v: 'a vertical tab', '0': 'a NUL character',
}

function quantDesc(q: string): string {
  const lazy = q.endsWith('?') && q.length > 1
  const base = lazy ? q.slice(0, -1) : q
  let d = base === '*' ? 'zero or more times' : base === '+' ? 'one or more times' : base === '?' ? 'optionally (zero or one time)' : ''
  const m = /^\{(\d+)(,(\d*))?\}$/.exec(base)
  if (m) d = m[2] === undefined ? `exactly ${m[1]} times` : m[3] === '' ? `${m[1]} or more times` : `between ${m[1]} and ${m[3]} times`
  return d + (lazy ? ' (lazy — as few as possible)' : '')
}

export function explainRegex(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0, groupNo = 0
  while (i < src.length) {
    const c = src[i]
    if (c === '\\') {
      const n = src[i + 1] ?? ''
      if (/[1-9]/.test(n)) { const m = /^\d+/.exec(src.slice(i + 1))![0]; out.push({ text: '\\' + m, desc: `back-reference to group ${m}`, kind: 'backref' }); i += 1 + m.length; continue }
      if (n === 'k' && src[i + 2] === '<') { const e = src.indexOf('>', i); const name = src.slice(i + 3, e); out.push({ text: src.slice(i, e + 1), desc: `back-reference to group “${name}”`, kind: 'backref' }); i = e + 1; continue }
      if (n === 'u' && src[i + 2] === '{') { const e = src.indexOf('}', i); out.push({ text: src.slice(i, e + 1), desc: `Unicode code point U+${src.slice(i + 3, e).toUpperCase()}`, kind: 'escape' }); i = e + 1; continue }
      if (n === 'u') { out.push({ text: src.slice(i, i + 6), desc: `Unicode character U+${src.slice(i + 2, i + 6).toUpperCase()}`, kind: 'escape' }); i += 6; continue }
      if (n === 'x') { out.push({ text: src.slice(i, i + 4), desc: `character with hex code ${src.slice(i + 2, i + 4)}`, kind: 'escape' }); i += 4; continue }
      if ((n === 'p' || n === 'P') && src[i + 2] === '{') { const e = src.indexOf('}', i); out.push({ text: src.slice(i, e + 1), desc: `${n === 'P' ? 'NOT ' : ''}a character with Unicode property ${src.slice(i + 3, e)}`, kind: 'class' }); i = e + 1; continue }
      if (n === 'c') { out.push({ text: src.slice(i, i + 3), desc: `control character Ctrl+${src[i + 2]}`, kind: 'escape' }); i += 3; continue }
      out.push({ text: '\\' + n, desc: ESC[n] ?? `the literal character “${n}”`, kind: ESC[n] ? (n === 'b' || n === 'B' ? 'anchor' : 'class') : 'escape' }); i += 2; continue
    }
    if (c === '[') {
      let j = i + 1; if (src[j] === '^') j++; if (src[j] === ']') j++
      while (j < src.length && src[j] !== ']') { if (src[j] === '\\') j++; j++ }
      const body = src.slice(i, j + 1); const neg = body[1] === '^'
      const inner = body.slice(neg ? 2 : 1, -1)
      const parts: string[] = []
      const re = /\\.|.-[^\]]|./g; let m: RegExpExecArray | null
      while ((m = re.exec(inner))) { const p = m[0]; parts.push(p.length === 3 && p[1] === '-' ? `${p[0]}–${p[2]}` : p.startsWith('\\') ? (ESC[p[1]] ? ESC[p[1]].replace(/^an? /, '') : p[1]) : `“${p}”`) }
      out.push({ text: body, desc: `${neg ? 'any character EXCEPT' : 'one of'}: ${parts.join(', ')}`, kind: 'set' }); i = j + 1; continue
    }
    if (c === '(') {
      let text = '(', desc = ''
      if (src.startsWith('(?:', i)) { text = '(?:'; desc = 'start of a non-capturing group' }
      else if (src.startsWith('(?=', i)) { text = '(?='; desc = 'start of a positive lookahead — followed by…' }
      else if (src.startsWith('(?!', i)) { text = '(?!'; desc = 'start of a negative lookahead — NOT followed by…' }
      else if (src.startsWith('(?<=', i)) { text = '(?<='; desc = 'start of a positive lookbehind — preceded by…' }
      else if (src.startsWith('(?<!', i)) { text = '(?<!'; desc = 'start of a negative lookbehind — NOT preceded by…' }
      else if (src.startsWith('(?<', i)) { const e = src.indexOf('>', i); text = src.slice(i, e + 1); groupNo++; desc = `start of capture group #${groupNo} named “${src.slice(i + 3, e)}”` }
      else { groupNo++; desc = `start of capture group #${groupNo}` }
      out.push({ text, desc, kind: text.length > 2 && text[2] !== '<' ? 'look' : 'group' }); i += text.length; continue
    }
    if (c === ')') { out.push({ text: ')', desc: 'end of group', kind: 'group' }); i++; continue }
    if ('*+?'.includes(c) || (c === '{' && /^\{\d+(,\d*)?\}/.test(src.slice(i)))) {
      const m = /^(\*|\+|\?|\{\d+(?:,\d*)?\})\??/.exec(src.slice(i))!
      out.push({ text: m[0], desc: `repeat the previous item ${quantDesc(m[0])}`, kind: 'quant' }); i += m[0].length; continue
    }
    if (c === '^') { out.push({ text: '^', desc: 'start of the string (or line, with the m flag)', kind: 'anchor' }); i++; continue }
    if (c === '$') { out.push({ text: '$', desc: 'end of the string (or line, with the m flag)', kind: 'anchor' }); i++; continue }
    if (c === '.') { out.push({ text: '.', desc: 'any character except a newline (any at all with the s flag)', kind: 'class' }); i++; continue }
    if (c === '|') { out.push({ text: '|', desc: 'OR — match either the left side or the right side', kind: 'alt' }); i++; continue }
    // merge consecutive literals
    let j = i; while (j < src.length && !'\\[]().*+?{}^$|'.includes(src[j])) j++
    if (j === i) j = i + 1
    // if the literal run is followed by a quantifier, the quantifier applies only to the last char
    const next = src[j]
    if (j - i > 1 && next && ('*+?'.includes(next) || (next === '{' && /^\{\d+(,\d*)?\}/.test(src.slice(j))))) j--
    const lit = src.slice(i, j)
    out.push({ text: lit, desc: lit.length === 1 ? `the character “${lit}”` : `the text “${lit}”`, kind: 'literal' }); i = j
  }
  return out
}

export const TOK_COLOR: Record<Tok['kind'], string> = {
  anchor: '#f472b6', class: '#22d3ee', quant: '#f59e0b', group: '#8b6cff', escape: '#a3e635', literal: 'var(--fg)', alt: '#ef4444', set: '#06b6d4', backref: '#fb923c', look: '#c084fc',
}

export const LIBRARY: { name: string; pattern: string; flags: string; sample: string }[] = [
  { name: 'Email address', pattern: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}', flags: 'g', sample: 'Contact ada@example.com or alan.turing@cs.ox.ac.uk today.' },
  { name: 'URL (http/https)', pattern: 'https?:\\/\\/(?:www\\.)?[-\\w@:%.+~#=]{1,256}\\.[a-z]{2,63}\\b(?:[-\\w()@:%+.~#?&/=]*)', flags: 'gi', sample: 'Visit https://openfile.app/tools?x=1 or http://example.org.' },
  { name: 'Indian mobile number', pattern: '(?:\\+91[\\s-]?)?[6-9]\\d{4}[\\s-]?\\d{5}', flags: 'g', sample: 'Call +91 98765 43210 or 7012345678.' },
  { name: 'US phone number', pattern: '\\(?\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}', flags: 'g', sample: '(555) 123-4567, 555.987.6543' },
  { name: 'Date YYYY-MM-DD', pattern: '(?<year>\\d{4})-(?<month>0[1-9]|1[0-2])-(?<day>0[1-9]|[12]\\d|3[01])', flags: 'g', sample: 'Released 2026-10-28, patched 2026-11-03.' },
  { name: 'Date DD/MM/YYYY', pattern: '(0[1-9]|[12]\\d|3[01])\\/(0[1-9]|1[0-2])\\/\\d{4}', flags: 'g', sample: 'Due 28/10/2026 and 01/01/2027' },
  { name: 'Time 24h HH:MM', pattern: '\\b([01]\\d|2[0-3]):[0-5]\\d\\b', flags: 'g', sample: 'Meet at 09:30 or 18:45.' },
  { name: 'IPv4 address', pattern: '\\b(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\b', flags: 'g', sample: 'Server 192.168.1.10, gateway 10.0.0.1, bad 999.1.1.1' },
  { name: 'Hex color', pattern: '#(?:[0-9a-fA-F]{3}){1,2}\\b', flags: 'g', sample: 'Colors: #fff, #6d4aff, #06B6D4' },
  { name: 'Indian PIN code', pattern: '\\b[1-9]\\d{2}\\s?\\d{3}\\b', flags: 'g', sample: 'Kolkata 700137, Medinipur 721 137' },
  { name: 'PAN card', pattern: '\\b[A-Z]{5}\\d{4}[A-Z]\\b', flags: 'g', sample: 'PAN: ABCDE1234F' },
  { name: 'GSTIN', pattern: '\\b\\d{2}[A-Z]{5}\\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\\b', flags: 'g', sample: 'GSTIN 19ABCDE1234F1Z5' },
  { name: 'Strong password', pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^\\w\\s]).{8,}$', flags: 'gm', sample: 'weakpass\nStr0ng!Pass\nNoSymbol123' },
  { name: 'HTML tag', pattern: '<\\/?([a-z][a-z0-9]*)\\b[^>]*>', flags: 'gi', sample: '<div class="x"><b>bold</b></div>' },
  { name: 'Duplicate words', pattern: '\\b(\\w+)\\s+\\1\\b', flags: 'gi', sample: 'This is is a test of the the regex.' },
  { name: 'Leading/trailing spaces', pattern: '^[ \\t]+|[ \\t]+$', flags: 'gm', sample: '   indented\ntrailing   \n  both  ' },
  { name: 'Credit card (basic)', pattern: '\\b(?:\\d[ -]*?){13,16}\\b', flags: 'g', sample: 'Card 4111 1111 1111 1111' },
  { name: 'Slug', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', flags: 'gm', sample: 'my-blog-post\nNot A Slug\nanother-one' },
  { name: 'UUID', pattern: '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', flags: 'gi', sample: 'id=0190f3a2-7b1c-7cde-9f12-3456789abcde' },
  { name: 'Number (int/decimal)', pattern: '-?\\d+(?:\\.\\d+)?', flags: 'g', sample: 'Totals: 42, -3.14 and 1000.5' },
]
