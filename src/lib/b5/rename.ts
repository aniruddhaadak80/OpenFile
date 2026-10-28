/* Bulk rename pattern engine (pure). */
export type RenameOpts = {
  pattern: string // e.g. "{name}-{n:3}.{ext}"
  find: string; replace: string; regex: boolean; matchCase: boolean
  caseMode: 'keep' | 'lower' | 'upper' | 'title' | 'kebab' | 'snake'
  start: number; step: number
  spaces: 'keep' | 'dash' | 'underscore' | 'remove'
}
export type Item = { name: string; size: number; date: Date; exifDate?: Date | null; folder?: string }

const pad = (n: number, w: number) => String(n).padStart(w, '0')
export function fmtDate(d: Date, f: string) {
  return f.replace(/YYYY|YY|MM|DD|HH|mm|ss/g, (t) => ({ YYYY: String(d.getFullYear()), YY: String(d.getFullYear()).slice(2), MM: pad(d.getMonth() + 1, 2), DD: pad(d.getDate(), 2), HH: pad(d.getHours(), 2), mm: pad(d.getMinutes(), 2), ss: pad(d.getSeconds(), 2) })[t]!)
}
export const splitName = (n: string) => { const i = n.lastIndexOf('.'); return i > 0 ? { base: n.slice(0, i), ext: n.slice(i + 1) } : { base: n, ext: '' } }

function applyCase(s: string, m: RenameOpts['caseMode']) {
  switch (m) {
    case 'lower': return s.toLowerCase()
    case 'upper': return s.toUpperCase()
    case 'title': return s.toLowerCase().replace(/(^|[\s_-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
    case 'kebab': return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-')
    case 'snake': return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[\s-]+/g, '_').replace(/_+/g, '_')
    default: return s
  }
}

const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g

export function renameOne(it: Item, i: number, total: number, o: RenameOpts): string {
  const { base, ext } = splitName(it.name)
  let b = base
  if (o.find) {
    try { const re = o.regex ? new RegExp(o.find, o.matchCase ? 'g' : 'gi') : new RegExp(o.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), o.matchCase ? 'g' : 'gi'); b = b.replace(re, o.replace) } catch { /* invalid regex: leave as is */ }
  }
  const n = o.start + i * o.step
  const width = String(o.start + (total - 1) * o.step).length
  let out = o.pattern.replace(/\{(\w+)(?::([^}]+))?\}/g, (m, key: string, arg?: string) => {
    switch (key) {
      case 'name': return b
      case 'ext': return ext
      case 'n': return arg === 'auto' ? pad(n, width) : arg ? pad(n, Number(arg) || 1) : String(n)
      case 'date': return fmtDate(it.exifDate ?? it.date, arg ?? 'YYYY-MM-DD')
      case 'mdate': return fmtDate(it.date, arg ?? 'YYYY-MM-DD')
      case 'size': return arg === 'kb' ? String(Math.round(it.size / 1024)) : String(it.size)
      case 'folder': return it.folder ?? ''
      case 'orig': return it.name
      default: return m
    }
  })
  // case and spaces apply to the base, never to the extension dot
  const { base: ob, ext: oe } = splitName(out)
  let nb = applyCase(ob, o.caseMode)
  if (o.spaces === 'dash') nb = nb.replace(/\s+/g, '-'); else if (o.spaces === 'underscore') nb = nb.replace(/\s+/g, '_'); else if (o.spaces === 'remove') nb = nb.replace(/\s+/g, '')
  out = (oe ? `${nb}.${o.caseMode === 'upper' ? oe : oe.toLowerCase() === oe ? oe : oe}` : nb).replace(ILLEGAL, '_').replace(/^\.+$/, '_').trim()
  return out || `file-${n}`
}

export function renameAll(items: Item[], o: RenameOpts) {
  const names = items.map((it, i) => renameOne(it, i, items.length, o))
  const seen = new Map<string, number>(); const dup = new Set<number>()
  names.forEach((n, i) => { const k = n.toLowerCase(); if (seen.has(k)) { dup.add(i); dup.add(seen.get(k)!) } else seen.set(k, i) })
  return { names, dup }
}

/** Make names unique by adding (2), (3)… */
export function dedupeNames(names: string[]) {
  const used = new Set<string>()
  return names.map((n) => { let c = n, k = 2; const { base, ext } = splitName(n); while (used.has(c.toLowerCase())) c = `${base} (${k++})${ext ? '.' + ext : ''}`; used.add(c.toLowerCase()); return c })
}
