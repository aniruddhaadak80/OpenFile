import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Card, Label, Select, Textarea } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { buildIcs, parseClock, type CalEvent } from '@/lib/cf/time'
import { sniffDelimiter, str } from '@/lib/cf/sheet'
import { csvSplit } from '@/lib/cf/study'
import { useSheet, useColOptions, RowsTable, Stat, Stats } from '@/lib/cf/ui'

const SAMPLE = 'Subject,Date,Start,End,Location,Notes\nMaths exam,2026-11-12,09:30,12:30,Hall A,Bring a calculator\nPhysics lab,2026-11-14,14:00,16:00,Lab 2,\nProject due,2026-11-20,,,Online,Submit by midnight\nDiwali holiday,2026-11-08,,,,'
function parseDate(v: string): Date | null {
  const s = v.trim(); let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/); if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; const [d, mo] = +m[1] > 12 ? [+m[1], +m[2]] : [+m[2], +m[1]]; return new Date(y, mo - 1, d) }
  const t = Date.parse(s); return isNaN(t) ? null : new Date(t)
}
/** Spreadsheet cells can arrive as Excel serial numbers (dates), day fractions (times) or "1899-12-30 10:00:00" strings. */
const cellDate = (v: string) => { const t = v.trim(); if (/^\d{5}(\.\d+)?$/.test(t)) { const d = new Date(Math.round((+t - 25569) * 864e5)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` } return t }
const cellClock = (v: string) => { const t = v.trim(); if (/^0?\.\d+$/.test(t)) { const m = Math.round(+t * 1440); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` } const m = t.match(/^\d{4}-\d{2}-\d{2}[ T](\d{1,2}:\d{2})/); return m ? m[1] : t }
const guess = (head: string[], re: RegExp) => head.findIndex((h) => re.test(h.toLowerCase()))

export default function CsvToIcs() {
  const s = useSheet()
  const [text, setText] = useState(SAMPLE)
  const rows = useMemo(() => (s.book ? s.rows.map((r) => r.map((c) => ((c as unknown) instanceof Date ? (c as unknown as Date).toISOString().slice(0, 10) : str(c)))) : text.trim().split(/\r?\n/).map((l) => csvSplit(l, sniffDelimiter(text)))), [s.book, s.rows, text])
  const head = rows[0] ?? [], opts = useColOptions(rows, true)
  const [map, setMap] = useState<Record<string, string>>({})
  const col = (k: string, re: RegExp) => +(map[k] ?? guess(head, re))
  const C = { title: col('title', /subject|title|name|event|summary/), date: col('date', /^date|start date|day/), start: col('start', /^start|from|begin|time/), end: col('end', /^end|to|until|finish/), loc: col('loc', /location|place|room|venue|where/), notes: col('notes', /note|desc|detail/) }
  const { events, bad } = useMemo(() => {
    const ev: CalEvent[] = [], bad: number[] = []
    rows.slice(1).forEach((r, i) => {
      const d = C.date >= 0 ? parseDate(cellDate(r[C.date] ?? '')) : null; if (!d || !(r[C.title] ?? '').trim()) { bad.push(i + 2); return }
      const a = C.start >= 0 ? parseClock(cellClock(r[C.start] ?? '')) : null, b = C.end >= 0 ? parseClock(cellClock(r[C.end] ?? '')) : null
      const start = new Date(d), allDay = a == null
      if (!allDay) start.setHours(Math.floor(a! / 60), a! % 60)
      let end: Date | undefined; if (!allDay) { end = new Date(d); const bb = b ?? a! + 60; end.setHours(Math.floor(bb / 60), bb % 60); if (end <= start) end.setDate(end.getDate() + 1) }
      ev.push({ summary: r[C.title], start, end, allDay, location: C.loc >= 0 ? r[C.loc] : undefined, description: C.notes >= 0 ? r[C.notes] : undefined })
    })
    return { events: ev, bad }
  }, [rows, JSON.stringify(C)])
  const pick = (k: keyof typeof C, l: string) => <div><Label>{l}</Label><Select value={String(C[k])} onChange={(v) => setMap({ ...map, [k]: v })} options={[{ value: '-1', label: 'None' }, ...opts]} /></div>
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-3">
        {!s.book ? <div><Label hint={<label className="cursor-pointer text-accent focus-within:underline">or open a file<input type="file" className="sr-only" accept=".csv,.tsv,.xlsx,.xls,.ods" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; if (/\.(csv|tsv|txt)$/i.test(f.name)) { s.reset(); setText(await f.text()) } else s.open(f) }} /></label>}>Schedule (CSV, first row is the header)</Label><Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-40" /></div>
          : <div className="flex justify-between text-sm"><span className="truncate">{s.file?.name}</span><Button size="sm" variant="ghost" onClick={s.reset}>Use pasted data</Button></div>}
        <Stats><Stat label="Events" value={events.length} tone="good" /><Stat label="All day" value={events.filter((e) => e.allDay).length} /><Stat label="Rows skipped" value={bad.length} sub={bad.length ? `rows ${bad.slice(0, 6).join(', ')}` : 'none'} tone={bad.length ? 'warn' : undefined} /></Stats>
        <RowsTable rows={rows} max={60} />
      </div>
      <Card className="space-y-3 self-start">
        {pick('title', 'Title')}{pick('date', 'Date')}<div className="grid grid-cols-2 gap-2">{pick('start', 'Start time')}{pick('end', 'End time')}</div>{pick('loc', 'Location')}{pick('notes', 'Notes')}
        <p className="text-xs text-muted">Rows without a start time become all-day events. Dates like 2026-11-12, 12/11/2026 and Nov 12 2026 all work.</p>
        <Button className="w-full" icon={<Download className="size-4" />} disabled={!events.length} onClick={() => downloadBlob(new Blob([buildIcs(events, { name: s.book?.name ?? 'Schedule' })], { type: 'text/calendar' }), `${s.book?.name ?? 'schedule'}.ics`)}>Download .ics with {events.length} events</Button>
      </Card>
    </div>
  )
}
