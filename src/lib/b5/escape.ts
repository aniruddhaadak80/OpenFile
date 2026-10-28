/* String escaping for many languages (pure). */
export type EscLang = 'json' | 'js' | 'java' | 'csharp' | 'csharp-verbatim' | 'python' | 'c' | 'go' | 'sql' | 'csv' | 'regex' | 'shell' | 'powershell' | 'xml' | 'html' | 'url'

const cEsc: Record<string, string> = { '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f', '\v': '\\v', '\0': '\\0' }
const u4 = (c: string) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')

function escC(s: string, opts: { single?: boolean; unicode?: 'u4' | 'u8' | 'x' | 'none'; vtab?: boolean; nul?: boolean }) {
  let out = ''
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    if (ch === "'" && opts.single) out += "\\'"
    else if (cEsc[ch] && (ch !== '\v' || opts.vtab) && (ch !== '\0' || opts.nul)) out += cEsc[ch]
    else if (cp < 0x20 || cp === 0x7f) out += opts.unicode === 'x' ? '\\x' + cp.toString(16).padStart(2, '0') : u4(ch)
    else if (cp > 0x7e && opts.unicode && opts.unicode !== 'none') {
      if (opts.unicode === 'u8' && cp > 0xffff) out += '\\U' + cp.toString(16).padStart(8, '0')
      else out += ch.split('').map(u4).join('')
    } else out += ch
  }
  return out
}

function unescC(s: string) {
  return s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|x[0-9a-fA-F]{2}|[0-7]{1,3}|.)/g, (_, e: string) => {
    if (e[0] === 'u' && e[1] === '{') return String.fromCodePoint(parseInt(e.slice(2, -1), 16))
    if (e[0] === 'u') return String.fromCharCode(parseInt(e.slice(1), 16))
    if (e[0] === 'U') return String.fromCodePoint(parseInt(e.slice(1), 16))
    if (e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16))
    if (/^[0-7]+$/.test(e)) return String.fromCharCode(parseInt(e, 8))
    return ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0', a: '\x07', e: '\x1b' } as Record<string, string>)[e] ?? e
  })
}

const htmlMap: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const decodeEntities = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, e: string) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' } as Record<string, string>)[e.toLowerCase()])

export function escape(lang: EscLang, s: string, o: { unicode?: boolean; quote?: boolean } = {}): string {
  const q = (x: string, c = '"') => (o.quote ? c + x + c : x)
  switch (lang) {
    case 'json': return q(JSON.stringify(s).slice(1, -1).replace(/[\u007f-\uffff]/g, (c) => (o.unicode ? u4(c) : c)))
    case 'js': return q(escC(s, { single: true, unicode: o.unicode ? 'u4' : 'none', vtab: true, nul: true }).replace(/`/g, '\\`').replace(/\$\{/g, '\\${'), "'")
    case 'java': return q(escC(s, { unicode: o.unicode ? 'u4' : 'none' }).replace(/'/g, "\\'"))
    case 'csharp': return q(escC(s, { unicode: o.unicode ? 'u8' : 'none', vtab: true, nul: true }))
    case 'csharp-verbatim': return o.quote ? '@"' + s.replace(/"/g, '""') + '"' : s.replace(/"/g, '""')
    case 'python': return q(escC(s, { single: true, unicode: o.unicode ? 'u8' : 'none', vtab: true, nul: true }), "'")
    case 'c': return q(escC(s, { unicode: o.unicode ? 'x' : 'none', vtab: true, nul: true }).replace(/\?\?/g, '?\\?'))
    case 'go': return q(escC(s, { unicode: o.unicode ? 'u8' : 'none', vtab: true }))
    case 'sql': return q(s.replace(/'/g, "''").replace(/\0/g, ''), "'")
    case 'csv': return /[",\r\n]/.test(s) || o.quote ? '"' + s.replace(/"/g, '""') + '"' : s
    case 'regex': return s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')
    case 'shell': return "'" + s.replace(/'/g, `'\\''`) + "'"
    case 'powershell': return "'" + s.replace(/'/g, "''") + "'"
    case 'xml': return s.replace(/[&<>"']/g, (c) => (c === "'" ? '&apos;' : htmlMap[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    case 'html': return s.replace(/[&<>"']/g, (c) => htmlMap[c]).replace(/[\u0080-\uffff]/g, (c) => (o.unicode ? `&#${c.codePointAt(0)};` : c))
    case 'url': return encodeURIComponent(s)
  }
}

export function unescape(lang: EscLang, s: string): string {
  const strip = (x: string, ...qs: string[]) => { for (const c of qs) if (x.length >= 2 && x.startsWith(c) && x.endsWith(c)) return x.slice(1, -1); return x }
  const t = s.trim()
  switch (lang) {
    case 'json': return JSON.parse('"' + strip(t, '"').replace(/(^|[^\\])"/g, '$1\\"') + '"')
    case 'js': case 'java': case 'csharp': case 'python': case 'c': case 'go': return unescC(strip(t, '"', "'", '`'))
    case 'csharp-verbatim': return strip(t.replace(/^@/, ''), '"').replace(/""/g, '"')
    case 'sql': return strip(t, "'").replace(/''/g, "'")
    case 'csv': return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).replace(/""/g, '"') : t
    case 'regex': return s.replace(/\\(.)/g, '$1')
    case 'shell': return t.replace(/'\\''/g, "'").replace(/^'|'$/g, '')
    case 'powershell': return strip(t, "'").replace(/''/g, "'")
    case 'xml': case 'html': return decodeEntities(s)
    case 'url': return decodeURIComponent(s.replace(/\+/g, ' '))
  }
}
