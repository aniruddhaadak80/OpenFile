/* Calendar and time helpers: ICS writing and merging, RRULE expansion, working days, ages, ISO weeks,
 * sunrise and sunset, timesheets and shift rotas. Pure functions so they run in Node tests. */

export const pad = (n: number, w = 2) => String(n).padStart(w, '0')
export const ymd = (d: Date) => `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** Keep a year inside 1..9999 so Date math and array sizes stay valid. */
export const clampYear = (y: number) => Math.min(9999, Math.max(1, Math.trunc(Number.isFinite(y) ? y : new Date().getFullYear()) || 1))
/** Local date for any year 1..9999 (new Date(y, ...) maps years below 100 to 19xx). */
export const dateOf = (y: number, m: number, d: number) => { const x = new Date(2000, 0, 1); x.setFullYear(y, m, d); return x }
export const parseYmd = (s: string) => { const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (!m) return null; const d = dateOf(+m[1], +m[2] - 1, +m[3]); return isNaN(+d) ? null : d }
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const dayDiff = (a: Date, b: Date) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5)
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/* ---------------- ICS ---------------- */
export interface CalEvent { uid?: string; summary: string; start: Date; end?: Date; allDay?: boolean; location?: string; description?: string; url?: string; rrule?: string; alarmMin?: number; categories?: string }
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
/** Fold lines at 75 octets as RFC 5545 asks. */
export function fold(line: string) {
  const enc = new TextEncoder(); if (enc.encode(line).length <= 75) return line
  const out: string[] = []; let cur = '', len = 0
  for (const ch of line) { const l = enc.encode(ch).length; if (len + l > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0 } cur += ch; len += l }
  out.push(cur)
  return out.join('\r\n ')
}
const utcStamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
const dateOnly = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
const localStamp = (d: Date) => `${dateOnly(d)}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
let uidN = 0
/** Build an ICS calendar. With tz set, times are written as floating local times tagged with TZID. */
export function buildIcs(events: CalEvent[], o: { name?: string; tz?: string; now?: Date } = {}) {
  const now = o.now ?? new Date()
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OpenFile//Calendar tools//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  if (o.name) L.push(`X-WR-CALNAME:${icsText(o.name)}`)
  if (o.tz) L.push(`X-WR-TIMEZONE:${o.tz}`)
  for (const e of events) {
    L.push('BEGIN:VEVENT', `UID:${e.uid ?? `${now.getTime().toString(36)}-${(++uidN).toString(36)}@openfile`}`, `DTSTAMP:${utcStamp(now)}`)
    if (e.allDay) { L.push(`DTSTART;VALUE=DATE:${dateOnly(e.start)}`, `DTEND;VALUE=DATE:${dateOnly(e.end && dayDiff(e.start, e.end) > 0 ? e.end : addDays(e.start, 1))}`) }
    else if (o.tz) { L.push(`DTSTART;TZID=${o.tz}:${localStamp(e.start)}`, `DTEND;TZID=${o.tz}:${localStamp(e.end ?? new Date(+e.start + 36e5))}`) }
    else L.push(`DTSTART:${utcStamp(e.start)}`, `DTEND:${utcStamp(e.end ?? new Date(+e.start + 36e5))}`)
    L.push(`SUMMARY:${icsText(e.summary || 'Event')}`)
    if (e.location) L.push(`LOCATION:${icsText(e.location)}`)
    if (e.description) L.push(`DESCRIPTION:${icsText(e.description)}`)
    if (e.url) L.push(`URL:${e.url}`)
    if (e.categories) L.push(`CATEGORIES:${icsText(e.categories)}`)
    if (e.rrule) L.push(`RRULE:${e.rrule.replace(/^RRULE:/i, '')}`)
    if (e.alarmMin != null && e.alarmMin >= 0) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(e.summary || 'Reminder')}`, `TRIGGER:-PT${Math.round(e.alarmMin)}M`, 'END:VALARM')
    L.push('END:VEVENT')
  }
  L.push('END:VCALENDAR')
  return L.map(fold).join('\r\n') + '\r\n'
}

/** Split an ICS file into its raw VEVENT blocks plus VTIMEZONE blocks (kept verbatim so nothing is lost when merging). */
export function icsBlocks(text: string) {
  const unfolded = text.replace(/\r?\n[ \t]/g, '')
  const events = [...unfolded.matchAll(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g)].map((m) => m[0])
  const tzs = [...unfolded.matchAll(/BEGIN:VTIMEZONE[\s\S]*?END:VTIMEZONE/g)].map((m) => m[0])
  const name = unfolded.match(/^X-WR-CALNAME:(.*)$/m)?.[1]?.trim()
  return { events, tzs, name }
}
const prop = (block: string, k: string) => block.match(new RegExp(`^${k}(?:;[^:\\r\\n]*)?:(.*)$`, 'm'))?.[1]?.trim() ?? ''
export const blockSummary = (b: string) => prop(b, 'SUMMARY').replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, ' ')
export const blockStart = (b: string) => prop(b, 'DTSTART')
export const blockUid = (b: string) => prop(b, 'UID')
/** Parse DTSTART values into a sortable key (YYYYMMDDTHHMMSS). */
export const startKey = (b: string) => blockStart(b).replace(/Z$/, '').padEnd(15, '0')
export interface MergeOpts { dedupe: 'uid' | 'title-time' | 'none'; from?: string; to?: string; keyword?: string; prefixSource?: boolean }
export function mergeIcs(files: { name: string; text: string }[], o: MergeOpts) {
  const tzMap = new Map<string, string>()
  const out: { block: string; source: string }[] = []
  const seen = new Set<string>()
  let dupes = 0, filtered = 0
  for (const f of files) {
    const { events, tzs } = icsBlocks(f.text)
    for (const t of tzs) { const id = prop(t, 'TZID'); if (id && !tzMap.has(id)) tzMap.set(id, t) }
    for (let b of events) {
      const k = startKey(b).slice(0, 8)
      if ((o.from && k < o.from.replace(/-/g, '')) || (o.to && k > o.to.replace(/-/g, ''))) { if (!/^RRULE/m.test(b)) { filtered++; continue } }
      if (o.keyword && !blockSummary(b).toLowerCase().includes(o.keyword.toLowerCase()) && !prop(b, 'DESCRIPTION').toLowerCase().includes(o.keyword.toLowerCase())) { filtered++; continue }
      const key = o.dedupe === 'uid' ? blockUid(b) || blockSummary(b) + startKey(b) : o.dedupe === 'title-time' ? blockSummary(b).toLowerCase() + '|' + startKey(b) : ''
      if (key && seen.has(key)) { dupes++; continue }
      if (key) seen.add(key)
      if (o.prefixSource) b = b.replace(/^SUMMARY(;[^:\r\n]*)?:(.*)$/m, (_m, p = '', s) => `SUMMARY${p}:[${icsText(f.name.replace(/\.ics$/i, ''))}] ${s}`)
      out.push({ block: b, source: f.name })
    }
  }
  out.sort((a, b) => startKey(a.block).localeCompare(startKey(b.block)))
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OpenFile//ICS merger//EN', 'CALSCALE:GREGORIAN', ...tzMap.values(), ...out.map((x) => x.block), 'END:VCALENDAR']
  const ics = L.join('\r\n').split(/\r?\n/).map(fold).join('\r\n') + '\r\n'
  return { ics, count: out.length, dupes, filtered, events: out }
}

/* ---------------- RRULE ---------------- */
export interface RRule { freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'; interval: number; byday?: string[]; bymonthday?: number[]; bysetpos?: number; count?: number; until?: string; bymonth?: number[] }
const DAYC = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
export function rruleString(r: RRule) {
  const p = [`FREQ=${r.freq}`]
  if (r.interval > 1) p.push(`INTERVAL=${r.interval}`)
  if (r.byday?.length) p.push(`BYDAY=${r.byday.join(',')}`)
  if (r.bymonthday?.length) p.push(`BYMONTHDAY=${r.bymonthday.join(',')}`)
  if (r.bymonth?.length) p.push(`BYMONTH=${r.bymonth.join(',')}`)
  if (r.bysetpos) p.push(`BYSETPOS=${r.bysetpos}`)
  if (r.count) p.push(`COUNT=${r.count}`)
  else if (r.until) p.push(`UNTIL=${r.until.replace(/-/g, '')}T235959Z`)
  return p.join(';')
}
export function parseRrule(s: string): RRule {
  const o: any = { interval: 1 }
  for (const part of s.replace(/^RRULE:/i, '').split(';')) {
    const [k, v] = part.split('='); if (!v) continue
    if (k === 'FREQ') o.freq = v
    else if (k === 'INTERVAL') o.interval = +v
    else if (k === 'BYDAY') o.byday = v.split(',')
    else if (k === 'BYMONTHDAY') o.bymonthday = v.split(',').map(Number)
    else if (k === 'BYMONTH') o.bymonth = v.split(',').map(Number)
    else if (k === 'BYSETPOS') o.bysetpos = +v
    else if (k === 'COUNT') o.count = +v
    else if (k === 'UNTIL') o.until = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`
  }
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(o.freq)) throw new Error('FREQ must be DAILY, WEEKLY, MONTHLY or YEARLY.')
  return o
}
/** Expand a rule from a start date. Supports the parts above, which cover almost every real calendar. */
export function expandRrule(r: RRule, start: Date, max = 500): Date[] {
  const out: Date[] = []
  const until = r.until ? parseYmd(r.until) : null
  const limit = r.count ?? max
  const push = (d: Date) => { if (d < start) return true; if (until && d > until) return false; out.push(d); return out.length < Math.min(limit, max) }
  const dayMatch = (d: Date, bd: string) => { const m = bd.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/); if (!m) return false; if (d.getDay() !== DAYC.indexOf(m[2])) return false; if (!m[1]) return true; const n = +m[1]; const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); const nth = Math.ceil(d.getDate() / 7), nthLast = -Math.ceil((dim - d.getDate() + 1) / 7); return n === nth || n === nthLast }
  for (let i = 0, guard = 0; guard < 5000; i += r.interval, guard++) {
    let cands: Date[] = []
    if (r.freq === 'DAILY') { const d = addDays(start, i); if (!r.byday?.length || r.byday.some((b) => dayMatch(d, b))) cands = [d] }
    else if (r.freq === 'WEEKLY') { const ws = addDays(start, i * 7 - start.getDay()); const days = r.byday?.length ? r.byday : [DAYC[start.getDay()]]; cands = days.map((b) => addDays(ws, DAYC.indexOf(b.slice(-2)))).sort((a, b) => +a - +b) }
    else if (r.freq === 'MONTHLY' || r.freq === 'YEARLY') {
      const months = r.freq === 'MONTHLY' ? [new Date(start.getFullYear(), start.getMonth() + i, 1)] : (r.bymonth?.length ? r.bymonth : [start.getMonth() + 1]).map((m) => new Date(start.getFullYear() + i, m - 1, 1))
      for (const m0 of months) {
        const dim = new Date(m0.getFullYear(), m0.getMonth() + 1, 0).getDate()
        let ds: Date[] = []
        if (r.bymonthday?.length) ds = r.bymonthday.map((n) => (n > 0 ? n : dim + n + 1)).filter((n) => n >= 1 && n <= dim).map((n) => new Date(m0.getFullYear(), m0.getMonth(), n))
        else if (r.byday?.length) { for (let dd = 1; dd <= dim; dd++) { const d = new Date(m0.getFullYear(), m0.getMonth(), dd); if (r.byday.some((b) => dayMatch(d, b))) ds.push(d) } }
        else if (start.getDate() <= dim) ds = [new Date(m0.getFullYear(), m0.getMonth(), start.getDate())]
        if (r.bysetpos) ds = [ds.sort((a, b) => +a - +b).at(r.bysetpos > 0 ? r.bysetpos - 1 : r.bysetpos)!].filter(Boolean)
        cands.push(...ds)
      }
    }
    for (const d of cands.sort((a, b) => +a - +b)) { d.setHours(start.getHours(), start.getMinutes()); if (!push(d)) return out }
    if (until && cands.length && cands[cands.length - 1] > until) break
  }
  return out
}
export function describeRule(r: RRule) {
  const names: Record<string, string> = { SU: 'Sunday', MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday', SA: 'Saturday' }
  const ord = (n: number) => (n === -1 ? 'last' : ['', 'first', 'second', 'third', 'fourth', 'fifth'][n] ?? `${n}th`)
  const unit = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[r.freq]
  let s = r.interval > 1 ? `Every ${r.interval} ${unit}s` : `Every ${unit}`
  if (r.byday?.length) s += ' on ' + r.byday.map((b) => { const m = b.match(/^([+-]?\d+)?(\w\w)$/)!; return (m[1] ? ord(+m[1]) + ' ' : '') + names[m[2]] }).join(', ')
  if (r.bymonthday?.length) s += ' on day ' + r.bymonthday.map((n) => (n < 0 ? (n === -1 ? 'last' : `${-n} from the end`) : n)).join(', ')
  if (r.bysetpos) s += ` (the ${ord(r.bysetpos)} match)`
  if (r.bymonth?.length) s += ' in ' + r.bymonth.map((m) => MONTHS[m - 1]).join(', ')
  if (r.count) s += `, ${r.count} times`
  else if (r.until) s += `, until ${r.until}`
  return s
}

/* ---------------- working days ---------------- */
export function workingDays(a: Date, b: Date, o: { weekend?: number[]; holidays?: string[]; inclusive?: boolean } = {}) {
  const weekend = new Set(o.weekend ?? [0, 6]), hol = new Set(o.holidays ?? [])
  const [s, e] = a <= b ? [a, b] : [b, a]
  const total = dayDiff(s, e) + (o.inclusive ? 1 : 0)
  let work = 0, weekends = 0, holidays = 0
  for (let i = 0; i < total; i++) { const d = addDays(s, i); if (weekend.has(d.getDay())) weekends++; else if (hol.has(ymd(d))) holidays++; else work++ }
  return { total, work, weekends, holidays, sign: a <= b ? 1 : -1 }
}
export function addWorkingDays(a: Date, n: number, o: { weekend?: number[]; holidays?: string[] } = {}) {
  const weekend = new Set(o.weekend ?? [0, 6]), hol = new Set(o.holidays ?? [])
  let d = new Date(a), left = Math.abs(n); const step = n < 0 ? -1 : 1
  while (left > 0) { d = addDays(d, step); if (!weekend.has(d.getDay()) && !hol.has(ymd(d))) left-- }
  return d
}
export function parseHolidays(text: string) { return text.split(/[\s,;]+/).map((x) => parseYmd(x)).filter((d): d is Date => !!d).map(ymd) }

/* ---------------- age ---------------- */
export function ageBetween(birth: Date, on: Date) {
  let y = on.getFullYear() - birth.getFullYear(), m = on.getMonth() - birth.getMonth(), d = on.getDate() - birth.getDate()
  if (d < 0) { m--; d += new Date(on.getFullYear(), on.getMonth(), 0).getDate() }
  if (m < 0) { y--; m += 12 }
  const days = dayDiff(birth, on)
  let next = new Date(on.getFullYear(), birth.getMonth(), birth.getDate())
  if (birth.getMonth() === 1 && birth.getDate() === 29 && next.getMonth() !== 1) next = new Date(on.getFullYear(), 1, 28)
  if (dayDiff(on, next) < 0) next = new Date(on.getFullYear() + 1, birth.getMonth(), birth.getDate())
  return { years: y, months: m, days: d, totalDays: days, totalWeeks: Math.floor(days / 7), totalMonths: y * 12 + m, hours: days * 24, nextBirthday: next, daysToBirthday: dayDiff(on, next), weekday: WEEKDAYS[birth.getDay()] }
}

/* ---------------- ISO week ---------------- */
export function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return { year: t.getUTCFullYear(), week: Math.ceil(((+t - +y0) / 864e5 + 1) / 7) }
}
export function isoWeekStart(year: number, week: number) {
  const j4 = new Date(year, 0, 4), day = j4.getDay() || 7
  return addDays(j4, (week - 1) * 7 - (day - 1))
}
export const weeksInYear = (y: number) => isoWeek(new Date(y, 11, 28)).week
export const dayOfYear = (d: Date) => dayDiff(new Date(d.getFullYear(), 0, 1), d) + 1

/* ---------------- sunrise and sunset (NOAA algorithm) ---------------- */
const rad = Math.PI / 180
export function sunTimes(date: Date, lat: number, lon: number, zenith = 90.833) {
  const jd = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5 + 2440587.5
  const n = Math.ceil(jd - 2451545.0 + 0.0008)
  const Js = n - lon / 360
  const M = (357.5291 + 0.98560028 * Js) % 360
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad)
  const L = (M + C + 180 + 102.9372) % 360
  const Jt = 2451545.0 + Js + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * L * rad)
  const decl = Math.asin(Math.sin(L * rad) * Math.sin(23.4397 * rad))
  const cosH = (Math.cos(zenith * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl))
  const toDate = (j: number) => new Date((j - 2440587.5) * 864e5)
  const noon = toDate(Jt)
  if (cosH > 1) return { noon, rise: null, set: null, polar: 'night' as const, dayLength: 0 }
  if (cosH < -1) return { noon, rise: null, set: null, polar: 'day' as const, dayLength: 24 * 3600 }
  const H = Math.acos(cosH) / rad
  const rise = toDate(Jt - H / 360), set = toDate(Jt + H / 360)
  return { noon, rise, set, polar: null, dayLength: (+set - +rise) / 1000 }
}

/* ---------------- timesheet ---------------- */
/** Parse 9, 9:30, 0930, 9.30, 9am, 5:15 pm into minutes after midnight. */
export function parseClock(s: string): number | null {
  const t = s.trim().toLowerCase().replace(/\s+/g, '')
  if (!t) return null
  const m = t.match(/^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a|p)?$/)
  if (!m) return null
  let h = +m[1]; const min = m[2] ? +m[2] : 0
  if (m[3]) { const pm = m[3].startsWith('p'); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12 }
  if (h > 24 || min > 59) return null
  return h * 60 + min
}
export interface TimeRow { date?: string; start: string; end: string; breakMin: number; note?: string }
export function rowMinutes(r: TimeRow) {
  const a = parseClock(r.start), b = parseClock(r.end)
  if (a == null || b == null) return null
  let d = b - a; if (d < 0) d += 1440 // overnight shift
  return Math.max(0, d - (r.breakMin || 0))
}
export function timesheetTotals(rows: TimeRow[], o: { dailyOt?: number; weeklyOt?: number; rate?: number; otRate?: number }) {
  let total = 0, ot = 0
  const per = rows.map((r) => { const m = rowMinutes(r); if (m == null) return null; total += m; const dOt = o.dailyOt ? Math.max(0, m - o.dailyOt * 60) : 0; ot += dOt; return { minutes: m, overtime: dOt } })
  if (o.weeklyOt) ot = Math.max(ot, Math.max(0, total - o.weeklyOt * 60))
  const regular = total - ot
  const pay = o.rate ? (regular / 60) * o.rate + (ot / 60) * o.rate * (o.otRate ?? 1.5) : 0
  return { per, total, overtime: ot, regular, pay }
}
export const fmtHM = (min: number) => `${Math.floor(min / 60)}:${pad(Math.round(min % 60))}`
export const fmtDecimal = (min: number) => (min / 60).toFixed(2)

/* ---------------- shift rota ---------------- */
/** Repeat a pattern like "D D N N O O O O" (one code per day) across people, each starting at a different offset. */
export function buildRota(pattern: string[], people: string[], start: Date, days: number, stagger: number) {
  if (!pattern.length) throw new Error('Type a pattern, one code per day, like D D N N O O.')
  const rows = people.map((p, i) => ({ person: p, codes: Array.from({ length: days }, (_, d) => pattern[(((d + i * stagger) % pattern.length) + pattern.length) % pattern.length]) }))
  const dates = Array.from({ length: days }, (_, d) => addDays(start, d))
  const cover = dates.map((_, d) => { const c: Record<string, number> = {}; for (const r of rows) c[r.codes[d]] = (c[r.codes[d]] ?? 0) + 1; return c })
  return { rows, dates, cover }
}
export const ROTA_PRESETS: Record<string, { label: string; pattern: string; codes: Record<string, { name: string; start?: string; end?: string }> }> = {
  'four-on-four-off': { label: '4 on, 4 off (days and nights)', pattern: 'D D N N O O O O', codes: { D: { name: 'Day', start: '07:00', end: '19:00' }, N: { name: 'Night', start: '19:00', end: '07:00' }, O: { name: 'Off' } } },
  'pitman': { label: 'Pitman 2-2-3', pattern: 'D D O O D D D O O D D O O O', codes: { D: { name: 'Day', start: '07:00', end: '19:00' }, O: { name: 'Off' } } },
  'three-shift': { label: 'Early, late, night (5 on, 2 off)', pattern: 'E E E E E O O L L L L L O O N N N N N O O', codes: { E: { name: 'Early', start: '06:00', end: '14:00' }, L: { name: 'Late', start: '14:00', end: '22:00' }, N: { name: 'Night', start: '22:00', end: '06:00' }, O: { name: 'Off' } } },
  'office': { label: 'Monday to Friday', pattern: 'W W W W W O O', codes: { W: { name: 'Work', start: '09:00', end: '17:00' }, O: { name: 'Off' } } },
}

/* ---------------- meeting planner ---------------- */
/** Hour of day (0..24, fractional) in a time zone for a given UTC instant. */
export function hourIn(tz: string, at: Date) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at)
  return +p.find((x) => x.type === 'hour')!.value + +p.find((x) => x.type === 'minute')!.value / 60
}
export function tzOffsetMin(tz: string, at: Date) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(at)
  const g = (t: string) => +p.find((x) => x.type === t)!.value
  return Math.round((Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - +at) / 60000)
}
/** Score each UTC hour of a day: how many people are inside their working hours. */
export function meetingSlots(day: Date, zones: { tz: string; from: number; to: number }[]) {
  const base = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())
  return Array.from({ length: 48 }, (_, i) => {
    const at = new Date(base + i * 30 * 60000)
    const hours = zones.map((z) => hourIn(z.tz, at))
    const ok = zones.map((z, k) => (z.from <= z.to ? hours[k] >= z.from && hours[k] + 0.5 <= z.to : hours[k] >= z.from || hours[k] + 0.5 <= z.to))
    return { at, hours, ok, score: ok.filter(Boolean).length }
  })
}

/* ---------------- month grid ---------------- */
export function monthGrid(year: number, month: number, weekStart = 1) {
  year = clampYear(year)
  const first = dateOf(year, month, 1), dim = dateOf(year, month + 1, 0).getDate()
  const lead = (first.getDay() - weekStart + 7) % 7
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)
  return cells
}
