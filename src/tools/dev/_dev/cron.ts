/** Minimal-but-complete cron parser & iterator (5 or 6 fields, names, ranges, steps, L, #, W-less). */
export interface Field { name: string; min: number; max: number; values: number[]; any: boolean; raw: string; lastDay?: boolean; nth?: [number, number][]; lastDow?: number[] }
export interface Cron { seconds: Field; minutes: Field; hours: Field; dom: Field; months: Field; dow: Field; hasSeconds: boolean }

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
export const MACROS: Record<string, string> = { '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *' }

function parseField(raw: string, name: string, min: number, max: number, names?: string[]): Field {
  const f: Field = { name, min, max, values: [], any: raw === '*' || raw === '?', raw }
  const set = new Set<number>()
  const val = (s: string) => {
    const u = s.toUpperCase()
    if (names) { const i = names.indexOf(u.slice(0, 3)); if (i >= 0 && /^[A-Z]{3}$/.test(u)) return i + (name === 'month' ? 1 : 0) }
    if (!/^\d+$/.test(s)) throw new Error(`${name}: “${s}” is not a valid value`)
    let n = Number(s); if (name === 'day of week' && n === 7) n = 0
    if (n < min || n > max) throw new Error(`${name}: ${n} is out of range ${min}–${max}`)
    return n
  }
  for (const part of raw.split(',')) {
    if (!part) throw new Error(`${name}: empty list item`)
    if (name === 'day of month' && part.toUpperCase() === 'L') { f.lastDay = true; continue }
    if (name === 'day of week' && /^\w+#[1-5]$/.test(part)) { const [d, n] = part.split('#'); (f.nth ??= []).push([val(d), Number(n)]); continue }
    if (name === 'day of week' && /^\w+L$/i.test(part)) { (f.lastDow ??= []).push(val(part.slice(0, -1))); continue }
    const [range, stepS] = part.split('/')
    const step = stepS === undefined ? 1 : Number(stepS)
    if (!Number.isInteger(step) || step < 1) throw new Error(`${name}: invalid step “${stepS}”`)
    let a: number, b: number
    if (range === '*' || range === '?') { a = min; b = max; if (name === 'day of week') b = 6 }
    else if (range.includes('-')) { const [x, y] = range.split('-'); a = val(x); b = val(y); if (name === 'day of week' && y === '7') b = 6 }
    else { a = val(range); b = stepS !== undefined ? (name === 'day of week' ? 6 : max) : a }
    if (a > b) { // wrap-around range like FRI-MON or 22-2
      for (let v = a; v <= (name === 'day of week' ? 6 : max); v += step) set.add(v)
      for (let v = name === 'day of week' ? 0 : min; v <= b; v += step) set.add(v)
    } else for (let v = a; v <= b; v += step) set.add(v)
  }
  f.values = [...set].sort((x, y) => x - y)
  return f
}

export function parseCron(expr: string): Cron {
  let e = expr.trim().replace(/\s+/g, ' ')
  if (MACROS[e.toLowerCase()]) e = MACROS[e.toLowerCase()]
  const p = e.split(' ')
  if (p.length !== 5 && p.length !== 6) throw new Error(`Expected 5 fields (or 6 with seconds) but got ${p.length}`)
  const hasSeconds = p.length === 6
  const [s, mi, h, dom, mo, dow] = hasSeconds ? p : ['0', ...p]
  return {
    seconds: parseField(s, 'second', 0, 59), minutes: parseField(mi, 'minute', 0, 59), hours: parseField(h, 'hour', 0, 23),
    dom: parseField(dom, 'day of month', 1, 31), months: parseField(mo, 'month', 1, 12, MONTHS), dow: parseField(dow, 'day of week', 0, 7, DAYS), hasSeconds,
  }
}

function dayMatches(c: Cron, y: number, m: number, d: number, wd: number, dim: number) {
  if (!c.months.values.includes(m)) return false
  const domRestricted = !c.dom.any, dowRestricted = !c.dow.any
  const domOk = c.dom.values.includes(d) || (c.dom.lastDay && d === dim)
  const dowOk = c.dow.values.includes(wd) || !!c.dow.nth?.some(([w, n]) => w === wd && Math.ceil(d / 7) === n) || !!c.dow.lastDow?.some((w) => w === wd && d + 7 > dim)
  if (domRestricted && dowRestricted) return domOk || dowOk // Vixie cron OR semantics
  if (domRestricted) return domOk
  if (dowRestricted) return dowOk
  return true
}

/** next N run times after `from` (ms). utc=false uses the browser's local time. */
export function nextRuns(c: Cron, from: number, n: number, utc: boolean): Date[] {
  const out: Date[] = []
  const start = new Date(from)
  const get = (d: Date) => utc ? { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() } : { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() }
  const mk = (y: number, m: number, d: number, h = 0, mi = 0, s = 0) => utc ? new Date(Date.UTC(y, m, d, h, mi, s)) : new Date(y, m, d, h, mi, s)
  const s0 = get(start)
  for (let i = 0; i < 366 * 8 && out.length < n; i++) {
    const day = mk(s0.y, s0.m, s0.d + i)
    const { y, m, d } = get(day)
    const wd = utc ? day.getUTCDay() : day.getDay()
    const dim = utc ? new Date(Date.UTC(y, m + 1, 0)).getUTCDate() : new Date(y, m + 1, 0).getDate()
    if (!dayMatches(c, y, m + 1, d, wd, dim)) continue
    for (const h of c.hours.values) for (const mi of c.minutes.values) for (const s of c.seconds.values) {
      const t = mk(y, m, d, h, mi, s)
      // skip non-existent local times (DST gaps) that roll into another hour
      if (!utc && (t.getHours() !== h || t.getDate() !== d)) continue
      if (+t > from) { out.push(t); if (out.length >= n) return out }
    }
  }
  return out
}
