import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarRange, CalendarPlus, Cake, CalendarSearch, ArrowLeftRight } from 'lucide-react'
import { Button, Card, Field, Input, Select, Switch, Tabs, Textarea, Segmented } from '@/components/ui'
import { Stat } from '@/tools/dev/_dev/kit'

const DAY = 86400000
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null }
const today = () => iso(new Date())
const utcDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY
const long = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

/** calendar difference y/m/d (a <= b) */
function ymd(a: Date, b: Date) {
  let y = b.getFullYear() - a.getFullYear(), m = b.getMonth() - a.getMonth(), d = b.getDate() - a.getDate()
  if (d < 0) { m--; d += new Date(b.getFullYear(), b.getMonth(), 0).getDate() }
  if (m < 0) { y--; m += 12 }
  return { y, m, d }
}
function addMonths(d: Date, n: number) { const r = new Date(d.getFullYear(), d.getMonth() + n, 1); r.setDate(Math.min(d.getDate(), new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate())); return r }
function parseHolidays(s: string) { return new Set(s.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) }
function businessDays(a: Date, b: Date, hol: Set<string>, weekend: number[], inclusive: boolean) {
  const s = Math.min(utcDay(a), utcDay(b)), e = Math.max(utcDay(a), utcDay(b)); let n = 0, h = 0
  for (let t = s; t < e + (inclusive ? 1 : 0); t++) { const d = new Date(t * DAY); const wd = d.getUTCDay(); if (weekend.includes(wd)) continue; const k = d.toISOString().slice(0, 10); if (hol.has(k)) { h++; continue } n++ }
  return { n, h }
}
function addBusinessDays(d: Date, n: number, hol: Set<string>, weekend: number[]) {
  const r = new Date(d); const step = n < 0 ? -1 : 1; let left = Math.abs(n)
  while (left > 0) { r.setDate(r.getDate() + step); if (!weekend.includes(r.getDay()) && !hol.has(iso(r))) left-- }
  return r
}
const WEEKENDS: Record<string, number[]> = { 'sat-sun': [0, 6], sun: [0], 'fri-sat': [5, 6], none: [] }

export default function DateCalculator() {
  const [tab, setTab] = useState<'diff' | 'add' | 'age' | 'dow'>('diff')
  const [hol, setHol] = useState('')
  const [weekend, setWeekend] = useState('sat-sun')
  const holidays = useMemo(() => parseHolidays(hol), [hol])
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'diff', label: <span className="flex items-center gap-1.5"><CalendarRange className="size-4" />Difference</span> },
          { value: 'add', label: <span className="flex items-center gap-1.5"><CalendarPlus className="size-4" />Add / subtract</span> },
          { value: 'age', label: <span className="flex items-center gap-1.5"><Cake className="size-4" />Age</span> },
          { value: 'dow', label: <span className="flex items-center gap-1.5"><CalendarSearch className="size-4" />Day of week</span> },
        ]} />
        {tab === 'diff' && <Diff holidays={holidays} weekend={WEEKENDS[weekend]} />}
        {tab === 'add' && <Add holidays={holidays} weekend={WEEKENDS[weekend]} />}
        {tab === 'age' && <Age />}
        {tab === 'dow' && <Dow />}
      </div>
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Business days settings</div>
          <Field label="Weekend"><Select value={weekend} onChange={setWeekend} options={[{ value: 'sat-sun', label: 'Saturday + Sunday' }, { value: 'sun', label: 'Sunday only' }, { value: 'fri-sat', label: 'Friday + Saturday' }, { value: 'none', label: 'No weekend' }]} /></Field>
          <Field label="Holidays (YYYY-MM-DD)" hint={`${holidays.size} set`}><Textarea value={hol} onChange={(e) => setHol(e.target.value)} placeholder={'2026-01-26\n2026-08-15\n2026-10-02'} className="min-h-28" /></Field>
          <Button size="sm" variant="outline" onClick={() => { const y = new Date().getFullYear(); setHol([`${y}-01-26`, `${y}-08-15`, `${y}-10-02`, `${y}-12-25`, `${y + 1}-01-26`].join('\n')) }}>Add Indian national holidays</Button>
          <p className="text-[11px] text-muted">Holidays that fall on a weekday are excluded from business-day counts and from “add business days”.</p>
        </Card>
      </aside>
    </div>
  )
}

function Diff({ holidays, weekend }: { holidays: Set<string>; weekend: number[] }) {
  const [a, setA] = useState(today())
  const [b, setB] = useState(() => iso(new Date(new Date().getFullYear(), 11, 31)))
  const [incl, setIncl] = useState(false)
  const r = useMemo(() => {
    const A = parse(a), B = parse(b); if (!A || !B) return null
    const neg = B < A; const [x, y] = neg ? [B, A] : [A, B]
    const days = utcDay(y) - utcDay(x) + (incl ? 1 : 0)
    const c = ymd(x, y); const bd = businessDays(x, y, holidays, weekend, incl)
    return { neg, days, c, weeks: Math.floor(days / 7), rem: days % 7, hours: days * 24, minutes: days * 1440, bd, x, y }
  }, [a, b, incl, holidays, weekend])
  return (
    <div className="space-y-4">
      <Card className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <Field label="Start date"><Input type="date" value={a} onChange={(e) => setA(e.target.value)} /></Field>
        <Button variant="ghost" icon={<ArrowLeftRight className="size-4" />} onClick={() => { setA(b); setB(a) }} aria-label="Swap" />
        <Field label="End date"><Input type="date" value={b} onChange={(e) => setB(e.target.value)} /></Field>
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          <Switch checked={incl} onChange={setIncl} label="Include end date (+1 day)" />
          <div className="ml-auto flex gap-1">{[['Today', () => setA(today())], ['+30d', () => setB(iso(new Date((parse(a) ?? new Date()).getTime() + 30 * DAY)))], ['End of year', () => setB(iso(new Date((parse(a) ?? new Date()).getFullYear(), 11, 31)))]].map(([l, f]) => <Button key={l as string} size="sm" variant="ghost" onClick={f as () => void}>{l as string}</Button>)}</div>
        </div>
      </Card>
      {r && (
        <motion.div key={a + b + incl} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <Card className="bg-gradient-to-br from-accent/10 to-transparent">
            <div className="text-xs text-muted">{r.neg && 'End is before start · '}{long(r.x)} → {long(r.y)}</div>
            <div className="mt-1 font-display text-3xl font-bold sm:text-4xl">{r.c.y > 0 && `${r.c.y} year${r.c.y > 1 ? 's' : ''}, `}{r.c.m > 0 && `${r.c.m} month${r.c.m > 1 ? 's' : ''}, `}{r.c.d} day{r.c.d !== 1 ? 's' : ''}</div>
          </Card>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Total days" value={r.days.toLocaleString()} />
            <Stat label="Weeks" value={`${r.weeks}`} sub={`+ ${r.rem} day${r.rem !== 1 ? 's' : ''}`} />
            <Stat label="Business days" value={r.bd.n.toLocaleString()} sub={r.bd.h ? `${r.bd.h} holiday${r.bd.h > 1 ? 's' : ''} excluded` : 'excl. weekends'} />
            <Stat label="Months" value={(r.c.y * 12 + r.c.m).toLocaleString()} sub={`+ ${r.c.d} days`} />
            <Stat label="Hours" value={r.hours.toLocaleString()} />
            <Stat label="Minutes" value={r.minutes.toLocaleString()} />
          </div>
        </motion.div>
      )}
    </div>
  )
}

function Add({ holidays, weekend }: { holidays: Set<string>; weekend: number[] }) {
  const [start, setStart] = useState(today())
  const [op, setOp] = useState<'+' | '-'>('+')
  const [v, setV] = useState({ y: 0, m: 0, w: 0, d: 30 })
  const [biz, setBiz] = useState(false)
  const r = useMemo(() => {
    const s = parse(start); if (!s) return null
    const k = op === '+' ? 1 : -1
    if (biz) return addBusinessDays(s, k * (v.d + v.w * 5), holidays, weekend)
    let d = addMonths(s, k * (v.y * 12 + v.m)); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + k * (v.w * 7 + v.d)); return d
  }, [start, op, v, biz, holidays, weekend])
  const N = (k: keyof typeof v, label: string) => <Field label={label}><Input type="number" min={0} value={v[k]} onChange={(e) => setV({ ...v, [k]: Math.max(0, Number(e.target.value) || 0) })} /></Field>
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><Field label="Start date"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Operation"><Segmented value={op} onChange={setOp} options={[{ value: '+', label: 'Add' }, { value: '-', label: 'Subtract' }]} /></Field></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{!biz && N('y', 'Years')}{!biz && N('m', 'Months')}{N('w', biz ? 'Work weeks' : 'Weeks')}{N('d', biz ? 'Business days' : 'Days')}</div>
        <Switch checked={biz} onChange={setBiz} label="Count business days only (skip weekends & holidays)" />
      </Card>
      {r && (
        <motion.div key={iso(r)} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
          <Card className="bg-gradient-to-br from-accent/10 to-transparent">
            <div className="text-xs uppercase tracking-wide text-muted">Result</div>
            <div className="mt-1 font-display text-3xl font-bold">{long(r)}</div>
            <div className="mt-1 font-mono text-sm text-muted">{iso(r)} · {Math.abs(utcDay(r) - utcDay(parse(start)!))} calendar days {op === '+' ? 'after' : 'before'} start</div>
          </Card>
        </motion.div>
      )}
    </div>
  )
}

function Age() {
  const [dob, setDob] = useState('2000-01-01')
  const [at, setAt] = useState(today())
  const r = useMemo(() => {
    const b = parse(dob), a = parse(at); if (!b || !a || a < b) return null
    const c = ymd(b, a); const days = utcDay(a) - utcDay(b)
    let next = new Date(a.getFullYear(), b.getMonth(), b.getDate()); if (next < a || (next.getMonth() !== b.getMonth())) next = new Date(a.getFullYear() + 1, b.getMonth(), b.getDate())
    if (iso(next) === iso(a)) next = a
    const until = utcDay(next) - utcDay(a)
    const zodiac = ['Capricorn', 'Aquarius', 'Pisces', 'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn'][b.getMonth() + (b.getDate() >= [20, 19, 21, 20, 21, 21, 23, 23, 23, 23, 22, 22][b.getMonth()] ? 1 : 0)]
    return { c, days, until, next, zodiac, born: long(b), weeks: Math.floor(days / 7), hours: days * 24 }
  }, [dob, at])
  return (
    <div className="space-y-4">
      <Card className="grid gap-3 sm:grid-cols-2"><Field label="Date of birth"><Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></Field><Field label="Age at date"><Input type="date" value={at} onChange={(e) => setAt(e.target.value)} /></Field></Card>
      {r ? (
        <motion.div key={dob + at} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <Card className="bg-gradient-to-br from-accent/10 to-transparent">
            <div className="text-xs text-muted">Born {r.born}</div>
            <div className="mt-1 font-display text-4xl font-bold">{r.c.y} <span className="text-2xl font-semibold text-muted">years</span> {r.c.m} <span className="text-2xl font-semibold text-muted">months</span> {r.c.d} <span className="text-2xl font-semibold text-muted">days</span></div>
            <div className="mt-2 text-sm">{r.until === 0 ? '🎉 Happy birthday!' : `🎂 Next birthday in ${r.until} day${r.until > 1 ? 's' : ''} — ${long(r.next)} (turning ${r.c.y + 1})`}</div>
          </Card>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Total days" value={r.days.toLocaleString()} /><Stat label="Weeks" value={r.weeks.toLocaleString()} /><Stat label="Hours" value={r.hours.toLocaleString()} /><Stat label="Zodiac" value={r.zodiac} /></div>
        </motion.div>
      ) : <div className="text-sm text-danger">The “age at” date must be after the date of birth.</div>}
    </div>
  )
}

function Dow() {
  const [d, setD] = useState(today())
  const r = useMemo(() => {
    const x = parse(d); if (!x) return null
    const start = new Date(x.getFullYear(), 0, 1); const doy = utcDay(x) - utcDay(start) + 1
    const leap = new Date(x.getFullYear(), 1, 29).getMonth() === 1
    const t = new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const week = Math.ceil(((+t - Date.UTC(t.getUTCFullYear(), 0, 1)) / DAY + 1) / 7)
    const diff = utcDay(x) - utcDay(new Date())
    const first = new Date(x.getFullYear(), x.getMonth(), 1).getDay(); const dim = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()
    return { x, doy, leap, week, diff, first, dim, q: Math.floor(x.getMonth() / 3) + 1, left: (leap ? 366 : 365) - doy }
  }, [d])
  return (
    <div className="space-y-4">
      <Card><Field label="Date"><Input type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field></Card>
      {r && (
        <div className="grid gap-4 sm:grid-cols-[1fr_260px]">
          <div className="space-y-3">
            <Card className="bg-gradient-to-br from-accent/10 to-transparent"><div className="font-display text-4xl font-bold">{r.x.toLocaleDateString(undefined, { weekday: 'long' })}</div><div className="text-sm text-muted">{long(r.x)} · {r.diff === 0 ? 'today' : r.diff > 0 ? `in ${r.diff} days` : `${-r.diff} days ago`}</div></Card>
            <div className="grid grid-cols-2 gap-2"><Stat label="Day of year" value={r.doy} sub={`${r.left} days left`} /><Stat label="ISO week" value={r.week} /><Stat label="Quarter" value={`Q${r.q}`} /><Stat label="Leap year" value={r.leap ? 'Yes' : 'No'} /></div>
          </div>
          <Card className="p-3">
            <div className="mb-2 text-center text-sm font-semibold">{r.x.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x, i) => <div key={i} className="py-1 text-muted">{x}</div>)}
              {Array.from({ length: r.first }, (_, i) => <div key={'e' + i} />)}
              {Array.from({ length: r.dim }, (_, i) => <button key={i} onClick={() => setD(iso(new Date(r.x.getFullYear(), r.x.getMonth(), i + 1)))} className={`rounded-md py-1.5 ${i + 1 === r.x.getDate() ? 'bg-accent font-bold text-white' : 'hover:bg-surface-2'}`}>{i + 1}</button>)}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
