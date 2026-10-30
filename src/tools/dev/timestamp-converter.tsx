import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Pause, Play, Clock, ListOrdered, ArrowRightLeft, AlertTriangle } from 'lucide-react'
import { Button, Card, Field, Input, Select, Textarea, Tabs, CopyButton, Segmented } from '@/components/ui'
import { DownloadButton, Pane } from './_dev/kit'

const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone
const ZONES: string[] = (() => { try { return ['UTC', ...(Intl as any).supportedValuesOf('timeZone').filter((z: string) => z !== 'UTC')] } catch { return ['UTC', LOCAL_TZ, 'Asia/Kolkata', 'America/New_York', 'Europe/London', 'Asia/Tokyo'] } })()

/** offset (minutes east of UTC) of a timezone at a given instant */
function tzOffset(ms: number, tz: string): number {
  const s = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = /GMT([+-])(\d{1,2}):?(\d{2})?/.exec(s)
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0
}
const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0')
const offStr = (o: number, colon = true) => `${o < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(o) / 60))}${colon ? ':' : ''}${pad(Math.abs(o) % 60)}`
function wall(ms: number, tz: string) {
  const o = tzOffset(ms, tz); const d = new Date(ms + o * 60000)
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), ms: d.getUTCMilliseconds(), dow: d.getUTCDay(), o }
}
/** wall-clock time in tz → epoch ms (handles DST by iterating) */
function fromWall(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s)
  let t = guess - tzOffset(guess, tz) * 60000
  t = guess - tzOffset(t, tz) * 60000
  return t
}
function isoIn(ms: number, tz: string) { const w = wall(ms, tz); return `${w.y}-${pad(w.mo)}-${pad(w.d)}T${pad(w.h)}:${pad(w.mi)}:${pad(w.s)}.${pad(w.ms, 3)}${w.o === 0 && tz === 'UTC' ? 'Z' : offStr(w.o)}` }
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function rfc2822(ms: number, tz: string) { const w = wall(ms, tz); return `${DOW[w.dow]}, ${pad(w.d)} ${MON[w.mo - 1]} ${w.y} ${pad(w.h)}:${pad(w.mi)}:${pad(w.s)} ${offStr(w.o, false)}` }
function relative(ms: number, now = Date.now()) {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' }); const d = (ms - now) / 1000, a = Math.abs(d)
  const u: [number, Intl.RelativeTimeFormatUnit][] = [[31536000, 'year'], [2592000, 'month'], [604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']]
  for (const [s, n] of u) if (a >= s) return rtf.format(Math.round(d / s), n)
  return 'now'
}
function isoWeek(y: number, mo: number, d: number) { const t = new Date(Date.UTC(y, mo - 1, d)); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((+t - +y0) / 86400000 + 1) / 7) }

type Unit = 'auto' | 's' | 'ms' | 'us' | 'ns'
/** Parse input: number (epoch) or date string. Returns epoch ms (may be fractional for µs) */
function parseInput(raw: string, unit: Unit, tz: string): { ms: number; detected: string } | { err: string } {
  const s = raw.trim()
  if (!s) return { err: '' }
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s); const digits = s.replace(/^-/, '').split('.')[0].length
    const u = unit !== 'auto' ? unit : digits <= 11 ? 's' : digits <= 14 ? 'ms' : digits <= 17 ? 'us' : 'ns'
    const ms = u === 's' ? n * 1000 : u === 'ms' ? n : u === 'us' ? n / 1000 : n / 1e6
    return { ms, detected: { s: 'seconds', ms: 'milliseconds', us: 'microseconds', ns: 'nanoseconds' }[u] }
  }
  // wall-clock string without zone → interpret in selected tz
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(s)
  if (m) { const t = fromWall(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), tz) + Number((m[7] ?? '0').padEnd(3, '0')); return { ms: t, detected: `date in ${tz}` } }
  const t = Date.parse(s)
  if (!isNaN(t)) return { ms: t, detected: 'date string' }
  return { err: 'Could not understand this. Use an epoch number or a date like 2026-10-28 14:30, ISO 8601 or RFC 2822.' }
}

export default function TimestampConverter() {
  const [now, setNow] = useState(Date.now())
  const [paused, setPaused] = useState(false)
  const [tz, setTz] = useState(LOCAL_TZ)
  const [tab, setTab] = useState<'convert' | 'build' | 'batch'>('convert')
  useEffect(() => { if (paused) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t) }, [paused])

  return (
    <div className="space-y-5">
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-accent/10 blur-2xl" />
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Current Unix time (seconds)</div>
            <motion.div key={Math.floor(now / 1000)} initial={{ opacity: 0.6 }} animate={{ opacity: 1 }} className="font-mono text-3xl font-bold tabular-nums sm:text-4xl">{Math.floor(now / 1000)}</motion.div>
          </div>
          <div><div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Milliseconds</div><div className="font-mono text-lg tabular-nums text-muted">{now}</div></div>
          <div className="min-w-0"><div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{tz}</div><div className="truncate font-mono text-sm">{isoIn(now, tz)}</div></div>
          <div className="ml-auto flex gap-2">
            <CopyButton text={String(Math.floor(now / 1000))} label="Copy s" />
            <CopyButton text={String(now)} label="Copy ms" />
            <Button size="sm" variant="ghost" icon={paused ? <Play className="size-4" /> : <Pause className="size-4" />} onClick={() => setPaused(!paused)}>{paused ? 'Resume' : 'Pause'}</Button>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-end gap-3">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'convert', label: <span className="flex items-center gap-1.5"><ArrowRightLeft className="size-4" />Convert</span> }, { value: 'build', label: <span className="flex items-center gap-1.5"><Clock className="size-4" />Date → epoch</span> }, { value: 'batch', label: <span className="flex items-center gap-1.5"><ListOrdered className="size-4" />Batch</span> }]} />
        <div className="ml-auto w-full sm:w-72"><Field label="Time zone" hint={tz === LOCAL_TZ ? 'local' : offStr(tzOffset(now, tz))}><Select value={tz} onChange={setTz} options={ZONES.map((z) => ({ value: z, label: z === LOCAL_TZ ? `${z} (local)` : z }))} /></Field></div>
      </div>

      {tab === 'convert' && <Convert tz={tz} now={now} />}
      {tab === 'build' && <Build tz={tz} />}
      {tab === 'batch' && <Batch tz={tz} />}
    </div>
  )
}

function Rows({ ms, tz, now }: { ms: number; tz: string; now: number }) {
  const w = wall(ms, tz)
  const doy = Math.floor((Date.UTC(w.y, w.mo - 1, w.d) - Date.UTC(w.y, 0, 1)) / 86400000) + 1
  const rows: [string, string][] = [
    ['Unix seconds', String(Math.floor(ms / 1000))], ['Unix milliseconds', String(Math.round(ms))], ['Unix microseconds', String(Math.round(ms * 1000))],
    ['ISO 8601 (UTC)', new Date(ms).toISOString()], [`ISO 8601 (${tz})`, isoIn(ms, tz)], ['RFC 2822', rfc2822(ms, tz)], ['RFC 7231 (HTTP)', new Date(ms).toUTCString()],
    ['Locale', new Intl.DateTimeFormat(undefined, { timeZone: tz, dateStyle: 'full', timeStyle: 'long' }).format(new Date(ms))],
    ['Relative', relative(ms, now)], ['Day / week', `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][w.dow]} · ISO week ${isoWeek(w.y, w.mo, w.d)} · day ${doy} of ${w.y}`],
    ['UTC offset', `${offStr(w.o)} (${tz})`],
  ]
  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
      {rows.map(([k, v]) => (
        <div key={k} className="group flex items-center gap-3 px-4 py-2.5">
          <div className="w-40 shrink-0 text-xs font-medium text-muted">{k}</div>
          <div className="min-w-0 flex-1 break-all font-mono text-[13px]">{v}</div>
          <div className="opacity-60 transition group-hover:opacity-100"><CopyButton text={v} label="" variant="ghost" /></div>
        </div>
      ))}
    </div>
  )
}

function Convert({ tz, now }: { tz: string; now: number }) {
  const [input, setInput] = useState(String(Math.floor(Date.now() / 1000)))
  const [unit, setUnit] = useState<Unit>('auto')
  const p = useMemo(() => parseInput(input, unit, tz), [input, unit, tz])
  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="1793195299 · 1793195299559 · 2026-10-28 14:30 · Wed, 28 Oct 2026 09:00:00 GMT" className="h-12 min-w-0 flex-1 font-mono text-base" />
          <Button variant="outline" className="h-12" onClick={() => setInput(String(Math.floor(Date.now() / 1000)))}>Now</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented value={unit} onChange={setUnit} options={[{ value: 'auto', label: 'Auto' }, { value: 's', label: 'Seconds' }, { value: 'ms', label: 'Millis' }, { value: 'us', label: 'Micros' }, { value: 'ns', label: 'Nanos' }]} />
          {'detected' in p && <span className="text-xs text-muted">Interpreted as <b className="text-fg">{p.detected}</b></span>}
        </div>
      </Card>
      {'err' in p ? (p.err && <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger"><AlertTriangle className="size-4" />{p.err}</div>)
        : isNaN(new Date(p.ms).getTime()) ? <div className="text-sm text-danger">Out of range for JavaScript dates (±8.64e15 ms).</div> : <Rows ms={p.ms} tz={tz} now={now} />}
    </div>
  )
}

function Build({ tz }: { tz: string }) {
  const w = wall(Date.now(), tz)
  const [date, setDate] = useState(`${w.y}-${pad(w.mo)}-${pad(w.d)}`)
  const [time, setTime] = useState(`${pad(w.h)}:${pad(w.mi)}:${pad(w.s)}`)
  const [add, setAdd] = useState({ n: 0, u: 'day' as 'second' | 'minute' | 'hour' | 'day' | 'week' })
  const ms = useMemo(() => {
    const [y, mo, d] = date.split('-').map(Number); const [h, mi, s] = (time || '0:0:0').split(':').map(Number)
    if (!y || !mo || !d) return NaN
    const base = fromWall(y, mo, d, h || 0, mi || 0, s || 0, tz)
    return base + add.n * { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800 }[add.u] * 1000
  }, [date, time, tz, add])
  return (
    <div className="space-y-3">
      <Card className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
        <Field label={`Date (${tz})`}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Time"><Input type="time" step={1} value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        <Field label="± offset"><Input type="number" value={add.n} onChange={(e) => setAdd({ ...add, n: Number(e.target.value) })} className="w-24" /></Field>
        <Field label="unit"><Select value={add.u} onChange={(u) => setAdd({ ...add, u })} options={['second', 'minute', 'hour', 'day', 'week']} /></Field>
      </Card>
      {!isNaN(ms) && <Rows ms={ms} tz={tz} now={Date.now()} />}
    </div>
  )
}

function Batch({ tz }: { tz: string }) {
  const [text, setText] = useState(`1700000000\n1793195299559\n2026-10-28T09:30:00Z\n2027-01-01 00:00\n0\nnot a date`)
  const rows = useMemo(() => text.split('\n').filter((l) => l.trim()).map((l) => { const p = parseInput(l, 'auto', tz); return 'err' in p ? { in: l.trim(), err: p.err } : { in: l.trim(), ms: p.ms } }), [text, tz])
  const csv = () => ['input,unix_seconds,unix_ms,iso_utc,iso_' + tz.replace(/\W/g, '_'), ...rows.map((r) => ('ms' in r && r.ms !== undefined ? [r.in, Math.floor(r.ms / 1000), Math.round(r.ms), new Date(r.ms).toISOString(), isoIn(r.ms, tz)] : [r.in, '', '', '', 'ERROR']).map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Pane title="One value per line"><Textarea aria-label="One value per line" value={text} onChange={(e) => setText(e.target.value)} className="min-h-80 rounded-none border-0 bg-transparent" /></Pane>
      <Pane title={`${rows.length} results`} actions={<><CopyButton text={csv} label="Copy CSV" variant="ghost" /><DownloadButton text={csv} filename="timestamps.csv" mime="text/csv" /></>}>
        <div className="scrollbar-thin max-h-[480px] overflow-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="sticky top-0 bg-surface-2 text-[10px] uppercase tracking-wider text-muted"><tr><th className="px-3 py-2">Input</th><th className="px-3 py-2">Unix (s)</th><th className="px-3 py-2">{tz}</th><th className="px-3 py-2">Relative</th></tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-surface-2/50">
                  <td className="max-w-40 truncate px-3 py-1.5">{r.in}</td>
                  {'ms' in r && r.ms !== undefined ? <><td className="px-3 py-1.5">{Math.floor(r.ms / 1000)}</td><td className="px-3 py-1.5">{isoIn(r.ms, tz)}</td><td className="px-3 py-1.5 text-muted">{relative(r.ms)}</td></>
                    : <td colSpan={3} className="px-3 py-1.5 text-danger">invalid</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Pane>
    </div>
  )
}
