import { useEffect, useState } from 'react'
import { Download, Plus, X } from 'lucide-react'
import { Button, Card, Input, Label } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { fmtDecimal, fmtHM, rowMinutes, timesheetTotals, type TimeRow, addDays, ymd } from '@/lib/cf/time'
import { toCsvText } from '@/lib/cf/sheet'
import { NumBox, Stat, Stats } from '@/lib/cf/ui'

const KEY = 'of-timesheet'
const week = (): TimeRow[] => { const m = new Date(); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return Array.from({ length: 5 }, (_, i) => ({ date: ymd(addDays(m, i)), start: '9:00', end: '17:30', breakMin: 30 })) }

export default function TimesheetCalculator() {
  const [rows, setRows] = useState<TimeRow[]>(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '') } catch { return week() } })
  const [rate, setRate] = useState<number | null>(null), [otRate, setOtRate] = useState<number | null>(1.5), [daily, setDaily] = useState<number | null>(null), [weekly, setWeekly] = useState<number | null>(40)
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(rows)) }, [rows])
  const t = timesheetTotals(rows, { dailyOt: daily ?? undefined, weeklyOt: weekly ?? undefined, rate: rate ?? undefined, otRate: otRate ?? 1.5 })
  const upd = (i: number, p: Partial<TimeRow>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...p } : r)))
  const csv = () => downloadBlob(new Blob(['\ufeff' + toCsvText([['Date', 'Start', 'End', 'Break (min)', 'Hours', 'Decimal', 'Note'], ...rows.map((r) => { const m = rowMinutes(r); return [r.date ?? '', r.start, r.end, r.breakMin, m == null ? '' : fmtHM(m), m == null ? '' : fmtDecimal(m), r.note ?? ''] }), ['Total', '', '', '', fmtHM(t.total), fmtDecimal(t.total), '']])], { type: 'text/csv' }), 'timesheet.csv')
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <Card className="space-y-2 overflow-x-auto">
        <div className="grid min-w-[36rem] grid-cols-[9rem_6rem_6rem_5rem_5rem_1fr_2rem] gap-2 text-[11px] font-medium uppercase text-muted"><span>Date</span><span>Start</span><span>End</span><span>Break</span><span>Hours</span><span>Note</span><span /></div>
        {rows.map((r, i) => { const m = rowMinutes(r); return <div key={i} className="grid min-w-[36rem] grid-cols-[9rem_6rem_6rem_5rem_5rem_1fr_2rem] items-center gap-2">
          <Input type="date" value={r.date ?? ''} onChange={(e) => upd(i, { date: e.target.value })} aria-label="Date" /><Input value={r.start} onChange={(e) => upd(i, { start: e.target.value })} aria-label="Start" placeholder="9:00" /><Input value={r.end} onChange={(e) => upd(i, { end: e.target.value })} aria-label="End" placeholder="5:30 pm" /><Input inputMode="numeric" value={r.breakMin} onChange={(e) => upd(i, { breakMin: +e.target.value || 0 })} aria-label="Break minutes" />
          <span className={`font-mono text-sm ${m == null ? 'text-danger' : ''}`}>{m == null ? 'check' : fmtHM(m)}</span><Input value={r.note ?? ''} onChange={(e) => upd(i, { note: e.target.value })} aria-label="Note" /><button aria-label="Remove day" onClick={() => setRows(rows.filter((_, k) => k !== i))} className="text-muted hover:text-danger cursor-pointer"><X className="size-4" /></button></div> })}
        <div className="flex gap-2"><Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={() => { const last = rows.at(-1); setRows([...rows, { date: last?.date ? ymd(addDays(new Date(last.date), 1)) : '', start: last?.start ?? '9:00', end: last?.end ?? '17:00', breakMin: last?.breakMin ?? 30 }]) }}>Add day</Button><Button size="sm" variant="ghost" onClick={() => setRows(week())}>New week</Button></div>
        <p className="text-xs text-muted">Type times as 9, 9:30, 0930, 5pm or 17:15. A shift that ends after midnight is counted correctly.</p>
      </Card>
      <Card className="space-y-3 self-start">
        <Stats cols={2}><Stat label="Total" value={fmtHM(t.total)} sub={`${fmtDecimal(t.total)} hours`} tone="good" /><Stat label="Overtime" value={fmtHM(t.overtime)} sub={`${fmtDecimal(t.overtime)} h`} /></Stats>
        <div className="grid grid-cols-2 gap-2"><NumBox label="Hourly rate" value={rate} onChange={setRate} /><NumBox label="Overtime ×" value={otRate} onChange={setOtRate} /><NumBox label="Overtime after (h/day)" value={daily} onChange={setDaily} /><NumBox label="Overtime after (h/week)" value={weekly} onChange={setWeekly} /></div>
        {rate ? <Stat label="Pay" value={t.pay.toFixed(2)} sub={`${fmtDecimal(t.regular)} h regular + ${fmtDecimal(t.overtime)} h overtime`} /> : null}
        <Button className="w-full" variant="outline" icon={<Download className="size-4" />} onClick={csv}>Download CSV</Button>
        <p className="text-xs text-muted">Saved in this browser only.</p>
      </Card>
    </div>
  )
}
