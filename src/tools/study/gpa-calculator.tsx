import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button, Card, Input, Label, Select } from '@/components/ui'
import { cumulative, gpa, GPA_SCALES } from '@/lib/cf/study'
import { NumBox, Stat, Stats } from '@/lib/cf/ui'

interface Row { name: string; credits: number | null; grade: string }
const KEY = 'of-gpa'

export default function GpaCalculator() {
  const [scale, setScale] = useState('us4')
  const [rows, setRows] = useState<Row[]>(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '') } catch { return [{ name: 'Maths', credits: 4, grade: 'A' }, { name: 'Physics', credits: 3, grade: 'B+' }, { name: 'English', credits: 3, grade: 'A-' }, { name: 'History', credits: 2, grade: 'B' }] } })
  const [prevGpa, setPrevGpa] = useState<number | null>(null), [prevCr, setPrevCr] = useState<number | null>(null)
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(rows)) }, [rows])
  const S = GPA_SCALES[scale]
  const pts = (g: string) => { if (scale === 'pct') return Number(g); return S.grades.find(([k]) => k === g)?.[1] ?? NaN }
  const r = useMemo(() => gpa(rows.filter((x) => isFinite(pts(x.grade)) && x.credits).map((x) => ({ credits: x.credits!, points: pts(x.grade) }))), [rows, scale])
  const cum = prevGpa != null && prevCr ? cumulative(prevGpa, prevCr, r) : null
  const upd = (i: number, p: Partial<Row>) => setRows(rows.map((x, k) => (k === i ? { ...x, ...p } : x)))
  const pct = (g: number) => (scale === 'in10' ? `about ${((g - 0.75) * 10).toFixed(1)}% (CGPA × 9.5 is also used)` : scale === 'us4' ? `${Math.round((g / 4) * 100)}% of the scale` : '')
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="space-y-2">
        <div className="grid grid-cols-[1fr_6rem_8rem_2rem] gap-2 text-xs font-medium uppercase tracking-wide text-muted"><span>Course</span><span>Credits</span><span>Grade</span><span /></div>
        {rows.map((x, i) => <div key={i} className="grid grid-cols-[1fr_6rem_8rem_2rem] items-center gap-2">
          <Input value={x.name} onChange={(e) => upd(i, { name: e.target.value })} aria-label="Course" />
          <Input inputMode="decimal" value={x.credits ?? ''} onChange={(e) => upd(i, { credits: e.target.value === '' ? null : +e.target.value })} aria-label="Credits" />
          {scale === 'pct' ? <Input inputMode="decimal" value={x.grade} onChange={(e) => upd(i, { grade: e.target.value })} aria-label="Percent" /> : <Select value={x.grade} onChange={(v) => upd(i, { grade: v })} options={[{ value: '', label: 'Pick' }, ...S.grades.map(([k, v]) => ({ value: k, label: `${k} (${v})` }))]} />}
          <button aria-label="Remove course" onClick={() => setRows(rows.filter((_, k) => k !== i))} className="text-muted hover:text-danger cursor-pointer"><X className="size-4" /></button></div>)}
        <Button variant="outline" size="sm" icon={<Plus className="size-4" />} onClick={() => setRows([...rows, { name: '', credits: 3, grade: '' }])}>Add course</Button>
      </Card>
      <Card className="space-y-4 self-start">
        <div><Label>Grading scale</Label><Select value={scale} onChange={setScale} options={Object.entries(GPA_SCALES).map(([k, v]) => ({ value: k, label: v.label }))} /></div>
        <Stats cols={2}><Stat label="This term" value={scale === 'pct' || scale === 'uk' ? `${r.gpa.toFixed(1)}%` : r.gpa.toFixed(2)} sub={pct(r.gpa)} tone="good" /><Stat label="Credits" value={r.credits} /></Stats>
        <div className="grid grid-cols-2 gap-2"><NumBox label="Earlier GPA" value={prevGpa} onChange={setPrevGpa} /><NumBox label="Earlier credits" value={prevCr} onChange={setPrevCr} /></div>
        {cum != null && <Stat label="Cumulative" value={cum.toFixed(2)} sub={`over ${(prevCr ?? 0) + r.credits} credits`} />}
        <p className="text-xs text-muted">Each grade is weighted by its credits. Check your school's own scale, some use A+ = 4.3 or different cut-offs. Saved in this browser only.</p>
      </Card>
    </div>
  )
}
