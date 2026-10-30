import { useMemo, useState } from 'react'
import { FileDown } from 'lucide-react'
import { Button, Card, Input, Label, Segmented, Switch, Textarea } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { isoWeek, monthGrid, MONTHS, WEEKDAYS, parseYmd, ymd } from '@/lib/cf/time'
import { newPdf } from '@/lib/cf/ui'

export default function PrintableCalendar() {
  const [year, setYear] = useState(new Date().getFullYear() + (new Date().getMonth() >= 10 ? 1 : 0))
  const [layout, setLayout] = useState<'year' | 'months'>('months'), [monday, setMonday] = useState(true), [weeks, setWeeks] = useState(false), [size, setSize] = useState<'a4' | 'letter'>('a4'), [land, setLand] = useState(true)
  const [events, setEvents] = useState(`${year}-01-26 Republic Day\n${year}-08-15 Independence Day\n${year}-10-02 Gandhi Jayanti\n${year}-12-25 Christmas`), [title, setTitle] = useState('')
  const marks = useMemo(() => { const m = new Map<string, string>(); for (const l of events.split('\n')) { const d = parseYmd(l.trim()); if (d) m.set(ymd(d), l.trim().replace(/^\S+\s*/, '')) } return m }, [events])
  const ws = monday ? 1 : 0, heads = (monday ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6]).map((d) => WEEKDAYS[d])
  const make = async () => {
    const { doc, W, H } = await newPdf({ size, landscape: layout === 'months' ? land : false }); const m = 32
    const month = (mo: number, x: number, y: number, w: number, h: number, big: boolean) => {
      const g = monthGrid(year, mo, ws), rows = g.length / 7, cw = w / 7, top = big ? 46 : 16, rh = (h - top) / rows
      doc.setFont('helvetica', 'bold'); doc.setFontSize(big ? 26 : 11); doc.setTextColor(180, 110, 0); doc.text(big ? `${MONTHS[mo]} ${year}` : MONTHS[mo], x + (big ? 0 : w / 2), y + (big ? 20 : 9), { align: big ? 'left' : 'center' }); doc.setTextColor(0)
      doc.setFontSize(big ? 9 : 6); doc.setFont('helvetica', 'normal')
      heads.forEach((hd, i) => doc.text(big ? hd.toUpperCase() : hd[0], x + i * cw + (big ? 4 : cw / 2), y + top - 4, { align: big ? 'left' : 'center' }))
      g.forEach((dn, i) => {
        const cx = x + (i % 7) * cw, cy = y + top + Math.floor(i / 7) * rh
        if (big) { doc.setDrawColor(200); doc.rect(cx, cy, cw, rh) }
        if (!dn) return
        const key = ymd(new Date(year, mo, dn)), wkend = [0, 6].includes(new Date(year, mo, dn).getDay())
        if (marks.has(key)) { doc.setFillColor(253, 230, 138); big ? doc.rect(cx + 0.5, cy + 0.5, cw - 1, rh - 1, 'F') : doc.circle(cx + cw / 2, cy + rh / 2 - 1.5, Math.min(cw, rh) / 2.3, 'F'); if (big) doc.rect(cx, cy, cw, rh) }
        doc.setTextColor(wkend ? 15 : 0, wkend ? 118 : 0, wkend ? 110 : 0); doc.setFontSize(big ? 12 : 7); doc.text(String(dn), big ? cx + 5 : cx + cw / 2, big ? cy + 14 : cy + rh / 2 + 1, { align: big ? 'left' : 'center' }); doc.setTextColor(0)
        if (big && marks.has(key)) { doc.setFontSize(7); doc.text(doc.splitTextToSize(marks.get(key)!, cw - 8).slice(0, 3), cx + 4, cy + 26) }
        if (weeks && (i % 7 === 0)) { doc.setFontSize(big ? 6 : 5); doc.setTextColor(140); doc.text(`W${isoWeek(new Date(year, mo, dn)).week}`, big ? cx + cw - 14 : x - 1, big ? cy + 10 : cy + rh / 2 + 1, { align: big ? 'left' : 'right' }); doc.setTextColor(0) }
      })
    }
    if (layout === 'year') {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(30); doc.text(title || String(year), W / 2, m + 24, { align: 'center' })
      const cols = 3, gw = (W - m * 2 - 20 * (cols - 1)) / cols, gh = (H - m * 2 - 50 - 16 * 3) / 4
      for (let mo = 0; mo < 12; mo++) month(mo, m + (mo % cols) * (gw + 20), m + 50 + Math.floor(mo / cols) * (gh + 16), gw, gh, false)
    } else for (let mo = 0; mo < 12; mo++) { if (mo) doc.addPage(); month(mo, m, m, W - m * 2, H - m * 2, true) }
    downloadBlob(doc.output('blob'), `calendar-${year}${layout === 'year' ? '-year' : ''}.pdf`)
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 12 }, (_, mo) => <div key={mo} className="text-[10px]"><div className="mb-1 text-center font-semibold text-accent">{MONTHS[mo]}</div><div className="grid grid-cols-7 gap-px text-center">{heads.map((h) => <span key={h} className="text-muted">{h[0]}</span>)}{monthGrid(year, mo, ws).map((d, i) => <span key={i} className={d && marks.has(ymd(new Date(year, mo, d))) ? 'rounded bg-accent/30' : ''}>{d ?? ''}</span>)}</div></div>)}</Card>
      <Card className="space-y-4 self-start">
        <div className="grid grid-cols-2 gap-2"><div><Label>Year</Label><Input type="number" value={year} onChange={(e) => setYear(+e.target.value)} /></div><div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={String(year)} /></div></div>
        <div><Label>Layout</Label><Segmented value={layout} onChange={setLayout} options={[{ value: 'months', label: 'A month per page' }, { value: 'year', label: 'Year on one page' }]} /></div>
        <Switch checked={monday} onChange={setMonday} label="Weeks start on Monday" /><Switch checked={weeks} onChange={setWeeks} label="Week numbers" />{layout === 'months' && <Switch checked={land} onChange={setLand} label="Landscape" />}
        <div><Label>Holidays and dates to mark (YYYY-MM-DD name)</Label><Textarea value={events} onChange={(e) => setEvents(e.target.value)} className="min-h-28 text-xs" /></div>
        <div><Label>Paper</Label><Segmented value={size} onChange={setSize} options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }]} /></div>
        <Button className="w-full" icon={<FileDown className="size-4" />} onClick={make}>Download PDF</Button>
      </Card>
    </div>
  )
}
