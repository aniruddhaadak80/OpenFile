import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Card, Input, Label, Segmented, Select, Slider } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { buildIcs, describeRule, expandRrule, parseRrule, rruleString, ymd, WEEKDAYS, type RRule } from '@/lib/cf/time'
import { today, OutBox } from '@/lib/cf/ui'

const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

export default function RecurringDates() {
  const [mode, setMode] = useState<'build' | 'read'>('build')
  const [freq, setFreq] = useState<RRule['freq']>('MONTHLY'), [interval, setInterval_] = useState(1), [byday, setByday] = useState<string[]>(['FR']), [pos, setPos] = useState('-1'), [mday, setMday] = useState('')
  const [endMode, setEndMode] = useState<'count' | 'until' | 'never'>('count'), [count, setCount] = useState(12), [until, setUntil] = useState(''), [start, setStart] = useState(today())
  const [raw, setRaw] = useState('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;COUNT=10'), [title, setTitle] = useState('Team meeting')
  const rule = useMemo((): RRule | string => {
    try {
      if (mode === 'read') return parseRrule(raw.replace(/^RRULE:/i, ''))
      const r: RRule = { freq, interval }
      if ((freq === 'WEEKLY' || freq === 'MONTHLY' || freq === 'YEARLY') && byday.length) r.byday = freq === 'WEEKLY' || pos === '' ? byday : byday.map((d) => (pos === 'all' ? d : pos + d))
      if (freq === 'MONTHLY' && mday) { r.bymonthday = mday.split(/[,\s]+/).map(Number).filter((x) => x); delete r.byday }
      if (endMode === 'count') r.count = count; if (endMode === 'until' && until) r.until = until
      return r
    } catch (e: any) { return e.message }
  }, [mode, raw, freq, interval, byday, pos, mday, endMode, count, until])
  const dates = useMemo(() => (typeof rule === 'string' ? [] : expandRrule(rule, new Date(start + 'T09:00'), endMode === 'never' && mode === 'build' ? 52 : 500)), [rule, start])
  const str = typeof rule === 'string' ? '' : rruleString(rule)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'build', label: 'Build a rule' }, { value: 'read', label: 'Explain a rule' }]} />
        {mode === 'build' ? <>
          <div className="grid grid-cols-[1fr_8rem] gap-2"><div><Label>Repeats</Label><Select value={freq} onChange={(v) => setFreq(v as RRule['freq'])} options={[{ value: 'DAILY', label: 'Daily' }, { value: 'WEEKLY', label: 'Weekly' }, { value: 'MONTHLY', label: 'Monthly' }, { value: 'YEARLY', label: 'Yearly' }]} /></div><div><Label>Every</Label><Input type="number" min={1} value={interval} onChange={(e) => setInterval_(Math.max(1, +e.target.value))} /></div></div>
          {freq !== 'DAILY' && <div><Label>On</Label><div className="flex gap-1">{DAYS.map((d, i) => <button key={d} aria-pressed={byday.includes(d)} onClick={() => setByday(byday.includes(d) ? byday.filter((x) => x !== d) : [...byday, d])} className={`size-9 rounded-lg border text-xs cursor-pointer ${byday.includes(d) ? 'border-accent bg-accent/10' : 'border-border text-muted'}`}>{WEEKDAYS[(i + 1) % 7].slice(0, 2)}</button>)}</div></div>}
          {freq === 'MONTHLY' && <div className="grid grid-cols-2 gap-2"><div><Label>Which one</Label><Select value={pos} onChange={setPos} options={[{ value: '1', label: 'First' }, { value: '2', label: 'Second' }, { value: '3', label: 'Third' }, { value: '4', label: 'Fourth' }, { value: '-1', label: 'Last' }, { value: 'all', label: 'Every' }]} /></div><div><Label>Or day of month</Label><Input value={mday} onChange={(e) => setMday(e.target.value)} placeholder="15 or 1,15" /></div></div>}
          <div><Label>Ends</Label><Segmented value={endMode} onChange={setEndMode} options={[{ value: 'count', label: 'After a number' }, { value: 'until', label: 'On a date' }, { value: 'never', label: 'Never' }]} /></div>
          {endMode === 'count' && <Slider label="Times" value={count} onChange={setCount} min={1} max={200} />}
          {endMode === 'until' && <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} aria-label="Until" />}
        </> : <div><Label>RRULE</Label><Input value={raw} onChange={(e) => setRaw(e.target.value)} className="font-mono" /></div>}
        <div className="grid grid-cols-2 gap-2"><div><Label>First date</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div><div><Label>Event title (for export)</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div></div>
      </Card>
      <div className="space-y-3">
        {typeof rule === 'string' ? <p className="text-sm text-danger">{rule}</p> : <>
          <Card><div className="font-display text-lg font-bold">{describeRule(rule)}</div><div className="mt-1 break-all font-mono text-xs text-muted">RRULE:{str}</div></Card>
          <OutBox title={`${dates.length} dates${endMode === 'never' && mode === 'build' ? ' (first year shown)' : ''}`} text={dates.map((d) => `${ymd(d)}  ${WEEKDAYS[d.getDay()]}`).join('\n')} filename="dates.txt" rows={12} />
          <Button variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([buildIcs([{ summary: title, start: new Date(start + 'T09:00'), end: new Date(start + 'T10:00'), rrule: str }], { name: title })], { type: 'text/calendar' }), 'recurring-event.ics')}>Download as a repeating .ics event</Button>
        </>}
      </div>
    </div>
  )
}
