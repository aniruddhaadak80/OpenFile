import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Card, Input, Label, Select, Slider, Textarea } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { buildIcs, buildRota, parseClock, parseYmd, ROTA_PRESETS, ymd, WEEKDAYS, type CalEvent } from '@/lib/cf/time'
import { writeBook } from '@/lib/bcat/sheets'
import { today } from '@/lib/cf/ui'

const COLORS = ['#F5A524', '#22D3EE', '#10B981', '#0EA5E9', '#F97316', '#84CC16', '#14B8A6']

export default function ShiftRotaPlanner() {
  const [preset, setPreset] = useState('four-on-four-off')
  const [pattern, setPattern] = useState(ROTA_PRESETS['four-on-four-off'].pattern)
  const [codes, setCodes] = useState(Object.entries(ROTA_PRESETS['four-on-four-off'].codes).map(([k, v]) => `${k} = ${v.name}${v.start ? ` ${v.start}-${v.end}` : ''}`).join('\n'))
  const [people, setPeople] = useState('Team A\nTeam B\nTeam C\nTeam D'), [start, setStart] = useState(today()), [days, setDays] = useState(28), [stagger, setStagger] = useState(2)
  const codeMap = useMemo(() => Object.fromEntries(codes.split('\n').map((l) => l.match(/^\s*(\S+)\s*=\s*(.+?)(?:\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2}))?\s*$/)).filter(Boolean).map((m) => [m![1], { name: m![2], start: m![3], end: m![4] }])), [codes])
  const pats = pattern.split(/[\s,]+/).filter(Boolean), ppl = people.split('\n').map((x) => x.trim()).filter(Boolean)
  const r = useMemo(() => { try { return buildRota(pats, ppl, parseYmd(start) ?? new Date(), days, stagger) } catch { return null } }, [pattern, people, start, days, stagger])
  const codeColor = (c: string) => (codeMap[c]?.start ? COLORS[Object.keys(codeMap).indexOf(c) % COLORS.length] : 'transparent')
  const loadPreset = (k: string) => { setPreset(k); const p = ROTA_PRESETS[k]; setPattern(p.pattern); setCodes(Object.entries(p.codes).map(([c, v]) => `${c} = ${v.name}${v.start ? ` ${v.start}-${v.end}` : ''}`).join('\n')) }
  const ics = (person: number) => { if (!r) return; const ev: CalEvent[] = []; r.rows[person].codes.forEach((c, d) => { const info = codeMap[c]; if (!info?.start) return; const a = parseClock(info.start)!, b = parseClock(info.end!)!; const s = new Date(r.dates[d]); s.setHours(Math.floor(a / 60), a % 60); const e = new Date(r.dates[d]); e.setHours(Math.floor(b / 60), b % 60); if (e <= s) e.setDate(e.getDate() + 1); ev.push({ summary: `${info.name} shift`, start: s, end: e, alarmMin: 60 }) }); downloadBlob(new Blob([buildIcs(ev, { name: `${r.rows[person].person} rota` })], { type: 'text/calendar' }), `${r.rows[person].person.replace(/\W+/g, '-')}-rota.ics`) }
  const xlsx = async () => { if (!r) return; const head = ['Name', ...r.dates.map((d) => `${WEEKDAYS[d.getDay()].slice(0, 3)} ${ymd(d)}`)]; const rows = [head, ...r.rows.map((x) => [x.person, ...x.codes])]; downloadBlob(await writeBook([{ name: 'Rota', rows }], 'xlsx'), 'shift-rota.xlsx') }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3"><div><Label>Pattern</Label><Select value={preset} onChange={loadPreset} options={Object.entries(ROTA_PRESETS).map(([k, v]) => ({ value: k, label: v.label }))} /></div><div><Label>One code per day, then it repeats</Label><Input value={pattern} onChange={(e) => setPattern(e.target.value)} className="font-mono" /></div><div><Label>Codes (CODE = name start-end)</Label><Textarea value={codes} onChange={(e) => setCodes(e.target.value)} className="min-h-20 font-mono text-xs" /></div></Card>
        <Card className="space-y-3"><div><Label>People or teams</Label><Textarea value={people} onChange={(e) => setPeople(e.target.value)} className="min-h-28" /></div><Slider label="Each one starts this many days later" value={stagger} onChange={setStagger} min={0} max={Math.max(1, pats.length - 1)} /></Card>
        <Card className="space-y-3"><div><Label>Start date</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div><Slider label="Days to show" value={days} onChange={setDays} min={7} max={120} /><Button className="w-full" variant="outline" icon={<Download className="size-4" />} disabled={!r} onClick={xlsx}>Excel rota</Button></Card>
      </div>
      {r && <Card className="overflow-x-auto p-2">
        <table className="text-center text-[11px]"><thead><tr><th className="sticky left-0 bg-surface px-2 text-left">Name</th>{r.dates.map((d, i) => <th key={i} className={`min-w-7 px-0.5 font-normal ${d.getDay() === 0 || d.getDay() === 6 ? 'text-accent' : 'text-muted'}`}>{WEEKDAYS[d.getDay()][0]}<br />{d.getDate()}</th>)}<th className="px-2">Calendar</th></tr></thead>
          <tbody>{r.rows.map((row, p) => <tr key={p}><td className="sticky left-0 bg-surface px-2 text-left font-medium whitespace-nowrap">{row.person}</td>{row.codes.map((c, d) => <td key={d} className="px-0.5 py-0.5"><span className="block rounded py-1 font-bold" style={{ background: codeColor(c) + (codeColor(c) === 'transparent' ? '' : '40') }} title={codeMap[c]?.name}>{c}</span></td>)}<td className="px-2"><button className="text-accent hover:underline cursor-pointer" onClick={() => ics(p)}>.ics</button></td></tr>)}
            <tr className="text-muted"><td className="sticky left-0 bg-surface px-2 text-left">On shift</td>{r.cover.map((c, d) => <td key={d}>{Object.entries(c).filter(([k]) => codeMap[k]?.start).reduce((s, [, n]) => s + n, 0)}</td>)}<td /></tr></tbody></table>
      </Card>}
      <p className="text-xs text-muted">Each person gets a calendar file of their own shifts with a reminder an hour before. The bottom row shows how many are working each day, so gaps stand out.</p>
    </div>
  )
}
