import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Card, Input, Label, Segmented } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { addDays, dayOfYear, isoWeek, isoWeekStart, parseYmd, weeksInYear, ymd, MONTHS } from '@/lib/cf/time'
import { toCsvText } from '@/lib/cf/sheet'
import { Stat, Stats, today } from '@/lib/cf/ui'

export default function WeekNumber() {
  const [date, setDate] = useState(today())
  const [year, setYear] = useState(new Date().getFullYear()), [wk, setWk] = useState(1), [mode, setMode] = useState<'date' | 'week'>('date')
  const d = parseYmd(date)
  const w = d ? isoWeek(d) : null
  const ws = mode === 'week' ? isoWeekStart(year, wk) : w ? isoWeekStart(w.year, w.week) : null
  const list = useMemo(() => Array.from({ length: weeksInYear(year) }, (_, i) => { const s = isoWeekStart(year, i + 1); return { n: i + 1, s, e: addDays(s, 6) } }), [year])
  const cur = isoWeek(new Date())
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-3">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'date', label: 'Date to week' }, { value: 'week', label: 'Week to dates' }]} />
        <Card className="grid gap-3 sm:grid-cols-2">{mode === 'date' ? <div><Label>Date</Label><Input aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div> : <><div><Label>Year</Label><Input aria-label="Year" type="number" value={year} onChange={(e) => setYear(+e.target.value)} /></div><div><Label>Week</Label><Input aria-label="Week" type="number" min={1} max={53} value={wk} onChange={(e) => setWk(Math.min(53, Math.max(1, +e.target.value)))} /></div></>}</Card>
        {ws && <Stats cols={2}>
          {mode === 'date' && w && <><Stat label="ISO week" value={`W${String(w.week).padStart(2, '0')}`} sub={`${w.year}-W${String(w.week).padStart(2, '0')}-${((d!.getDay() + 6) % 7) + 1}`} tone="good" /><Stat label="Day of year" value={dayOfYear(d!)} sub={`of ${new Date(d!.getFullYear(), 11, 31).getDate() && dayOfYear(new Date(d!.getFullYear(), 11, 31))}`} /></>}
          <Stat label="Week starts (Monday)" value={<span className="text-base">{ws.toDateString()}</span>} /><Stat label="Week ends (Sunday)" value={<span className="text-base">{addDays(ws, 6).toDateString()}</span>} />
        </Stats>}
        <p className="text-xs text-muted">ISO 8601 weeks start on Monday, and week 1 is the week with the year's first Thursday. So 1 January can fall in week 52 or 53 of the year before. This week is W{cur.week} of {cur.year}.</p>
      </div>
      <Card className="space-y-2 p-3">
        <div className="flex items-center gap-2"><Label className="mb-0 mr-auto">{year} has {list.length} weeks</Label><Input type="number" className="h-8 w-24" value={year} onChange={(e) => setYear(+e.target.value)} aria-label="Year" /><Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([toCsvText([['week', 'start', 'end'], ...list.map((x) => [x.n, ymd(x.s), ymd(x.e)])])], { type: 'text/csv' }), `iso-weeks-${year}.csv`)}>CSV</Button></div>
        <div className="max-h-[28rem] overflow-auto text-xs">{list.map((x) => <div key={x.n} className={`grid grid-cols-[3rem_1fr] px-2 py-1 ${cur.year === year && cur.week === x.n ? 'rounded bg-accent/15 font-semibold' : ''}`}><span className="font-mono">W{String(x.n).padStart(2, '0')}</span><span>{x.s.getDate()} {MONTHS[x.s.getMonth()].slice(0, 3)} to {x.e.getDate()} {MONTHS[x.e.getMonth()].slice(0, 3)} {x.e.getFullYear()}</span></div>)}</div>
      </Card>
    </div>
  )
}
