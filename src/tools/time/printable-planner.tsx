import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { Button, Card, Input, Label, Segmented, Slider, Switch } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { addDays, parseYmd, MONTHS, WEEKDAYS } from '@/lib/cf/time'
import { newPdf, today } from '@/lib/cf/ui'

export default function PrintablePlanner() {
  const [kind, setKind] = useState<'week' | 'day' | 'habit'>('week'), [start, setStart] = useState(today()), [pages, setPages] = useState(4)
  const [from, setFrom] = useState(7), [to, setTo] = useState(21), [todo, setTodo] = useState(true), [notes, setNotes] = useState(true), [size, setSize] = useState<'a4' | 'letter'>('a4')
  const [habits, setHabits] = useState('Read 20 minutes, Walk, Water 8 glasses, No phone after 10pm, Stretch')
  const make = async () => {
    const { doc, W, H } = await newPdf({ size, landscape: kind !== 'day' }); const m = 30
    let d = parseYmd(start) ?? new Date(); if (kind === 'week') d = addDays(d, -((d.getDay() + 6) % 7))
    for (let p = 0; p < pages; p++) {
      if (p) doc.addPage()
      doc.setDrawColor(190); doc.setTextColor(0)
      if (kind === 'week') {
        const e = addDays(d, 6); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(`Week of ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`, m, m + 10)
        const cols = todo ? 4 : 4, rowsN = 2, gw = (W - m * 2) / cols, gh = (H - m * 2 - 26) / rowsN
        for (let i = 0; i < 8; i++) { const x = m + (i % cols) * gw, y = m + 26 + Math.floor(i / cols) * gh; doc.rect(x, y, gw, gh); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
          if (i < 7) { const day = addDays(d, i); doc.setTextColor([0, 6].includes(day.getDay()) ? 15 : 180, [0, 6].includes(day.getDay()) ? 118 : 110, [0, 6].includes(day.getDay()) ? 110 : 0); doc.text(`${WEEKDAYS[day.getDay()]} ${day.getDate()}`, x + 6, y + 14); doc.setTextColor(0) } else doc.text(todo ? 'To do' : 'Notes', x + 6, y + 14)
          doc.setDrawColor(230); for (let ly = y + 30; ly < y + gh - 4; ly += 18) { if (i === 7 && todo) doc.rect(x + 6, ly - 8, 7, 7); doc.line(x + (i === 7 && todo ? 18 : 6), ly, x + gw - 6, ly) } doc.setDrawColor(190) }
        void e; d = addDays(d, 7)
      } else if (kind === 'day') {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text(`${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`, m, m + 12)
        const sw = todo || notes ? (W - m * 2) * 0.58 : W - m * 2, top = m + 34, slots = to - from + 1, rh = (H - top - m) / (slots * 2)
        doc.setFontSize(8); doc.setFont('helvetica', 'normal')
        for (let s = 0; s < slots * 2; s++) { const y = top + s * rh; doc.setDrawColor(s % 2 ? 235 : 200); doc.line(m + 34, y, m + sw, y); if (s % 2 === 0) doc.text(`${String(from + s / 2).padStart(2, '0')}:00`, m, y + 8) }
        doc.setDrawColor(190); const x2 = m + sw + 16, w2 = W - m - x2
        if (todo) { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Top 3', x2, top + 4); doc.setDrawColor(220); for (let i = 0; i < 3; i++) { doc.rect(x2, top + 14 + i * 22, 8, 8); doc.line(x2 + 14, top + 22 + i * 22, x2 + w2, top + 22 + i * 22) } doc.setFont('helvetica', 'bold'); doc.text('To do', x2, top + 96); for (let i = 0; i < 10; i++) { doc.rect(x2, top + 106 + i * 20, 7, 7); doc.line(x2 + 12, top + 113 + i * 20, x2 + w2, top + 113 + i * 20) } }
        if (notes) { const ny = todo ? top + 330 : top + 4; doc.setFont('helvetica', 'bold'); doc.text('Notes', x2, ny); doc.setDrawColor(230); for (let y = ny + 18; y < H - m; y += 18) doc.line(x2, y, x2 + w2, y) }
        d = addDays(d, 1)
      } else {
        const list = habits.split(',').map((x) => x.trim()).filter(Boolean), dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
        doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(`Habit tracker: ${MONTHS[d.getMonth()]} ${d.getFullYear()}`, m, m + 10)
        const nameW = 140, cw = (W - m * 2 - nameW) / dim, top = m + 30, rh = Math.min(30, (H - top - m) / (list.length + 1))
        doc.setFontSize(7); doc.setFont('helvetica', 'normal')
        for (let i = 1; i <= dim; i++) { const day = new Date(d.getFullYear(), d.getMonth(), i); doc.text(`${WEEKDAYS[day.getDay()][0]}`, m + nameW + (i - 0.5) * cw, top + 8, { align: 'center' }); doc.text(String(i), m + nameW + (i - 0.5) * cw, top + 17, { align: 'center' }) }
        list.forEach((h, r) => { const y = top + rh * (r + 1); doc.setFontSize(10); doc.text(doc.splitTextToSize(h, nameW - 8)[0], m, y + rh / 2 + 3); for (let i = 0; i < dim; i++) doc.rect(m + nameW + i * cw + 1, y + 2, cw - 2, rh - 4) })
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      }
    }
    downloadBlob(doc.output('blob'), `${kind}-planner.pdf`)
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="space-y-3">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'week', label: 'Weekly planner' }, { value: 'day', label: 'Daily planner' }, { value: 'habit', label: 'Monthly habit tracker' }]} />
        <div className={`grid gap-1.5 rounded-xl border border-border p-3 ${kind === 'week' ? 'grid-cols-4' : kind === 'day' ? 'grid-cols-[1.4fr_1fr]' : 'grid-cols-1'}`} aria-hidden="true">
          {kind === 'week' && ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', todo ? 'To do' : 'Notes'].map((x) => <div key={x} className="h-24 rounded border border-border/70 p-1 text-[10px] font-semibold text-accent">{x}</div>)}
          {kind === 'day' && <><div className="space-y-1">{Array.from({ length: Math.min(10, to - from + 1) }, (_, i) => <div key={i} className="border-b border-border/60 text-[10px] text-muted">{String(from + i).padStart(2, '0')}:00</div>)}</div><div className="space-y-1 text-[10px] font-semibold text-accent">{todo && <div>Top 3 · To do</div>}{notes && <div>Notes</div>}</div></>}
          {kind === 'habit' && habits.split(',').filter(Boolean).map((h) => <div key={h} className="flex items-center gap-1 text-[10px]"><span className="w-28 truncate">{h.trim()}</span>{Array.from({ length: 31 }, (_, i) => <span key={i} className="size-2.5 rounded-sm border border-border" />)}</div>)}
        </div>
      </Card>
      <Card className="space-y-4 self-start">
        <div><Label>{kind === 'habit' ? 'First month' : 'Starts'}</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <Slider label={kind === 'week' ? 'Weeks' : kind === 'day' ? 'Days' : 'Months'} value={pages} onChange={setPages} min={1} max={kind === 'day' ? 62 : kind === 'week' ? 53 : 12} />
        {kind === 'day' && <><Slider label="Day starts" value={from} onChange={setFrom} min={4} max={12} suffix=":00" /><Slider label="Day ends" value={to} onChange={setTo} min={14} max={23} suffix=":00" /></>}
        {kind !== 'habit' && <><Switch checked={todo} onChange={setTodo} label="To do list" />{kind === 'day' && <Switch checked={notes} onChange={setNotes} label="Notes area" />}</>}
        {kind === 'habit' && <div><Label>Habits (comma separated)</Label><Input value={habits} onChange={(e) => setHabits(e.target.value)} /></div>}
        <div><Label>Paper</Label><Segmented value={size} onChange={setSize} options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }]} /></div>
        <Button className="w-full" icon={<FileDown className="size-4" />} onClick={make}>Download PDF</Button>
      </Card>
    </div>
  )
}
