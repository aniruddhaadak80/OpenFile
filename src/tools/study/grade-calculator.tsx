import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button, Card, Input, Label, Segmented } from '@/components/ui'
import { letter, neededOnFinal, weightedGrade } from '@/lib/cf/study'
import { NumBox, Stat, Stats } from '@/lib/cf/ui'

export default function GradeCalculator() {
  const [mode, setMode] = useState<'final' | 'weighted'>('final')
  const [cur, setCur] = useState<number | null>(82), [target, setTarget] = useState<number | null>(90), [w, setW] = useState<number | null>(40)
  const [parts, setParts] = useState([{ name: 'Homework', weight: 20, score: 92 as number | null }, { name: 'Midterm', weight: 30, score: 78 as number | null }, { name: 'Project', weight: 20, score: 88 as number | null }, { name: 'Final exam', weight: 30, score: null as number | null }])
  const need = useMemo(() => { try { return cur != null && target != null && w != null ? neededOnFinal(cur, target, w) : null } catch { return null } }, [cur, target, w])
  const wg = useMemo(() => weightedGrade(parts), [parts])
  const upd = (i: number, p: Partial<(typeof parts)[number]>) => setParts(parts.map((x, k) => (k === i ? { ...x, ...p } : x)))
  return (
    <div className="space-y-4">
      <Segmented value={mode} onChange={setMode} options={[{ value: 'final', label: 'What do I need on the final' }, { value: 'weighted', label: 'Weighted grade' }]} />
      {mode === 'final' ? <Card className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3"><NumBox label="Grade now" unit="%" value={cur} onChange={setCur} /><NumBox label="Grade I want" unit="%" value={target} onChange={setTarget} /><NumBox label="Final exam is worth" unit="%" value={w} onChange={setW} /></div>
        {need != null && <Stats cols={3}><Stat label="You need on the final" value={`${need.toFixed(1)}%`} tone={need > 100 ? 'bad' : need > 90 ? 'warn' : 'good'} /><Stat label="If you score 100%" value={`${((cur! * (1 - w! / 100)) + w!).toFixed(1)}%`} /><Stat label="If you score 0%" value={`${(cur! * (1 - w! / 100)).toFixed(1)}%`} /></Stats>}
        {need != null && <p className="text-sm text-muted">{need > 100 ? 'That target is out of reach with this final alone. Aim for the highest grade you can still get.' : need <= 0 ? 'You already have it, even with a zero on the final.' : `Score ${need.toFixed(1)}% or more to finish with ${target}% (${letter(target!)}).`}</p>}
        {cur != null && w != null && <div className="grid grid-cols-5 gap-2 text-center text-xs sm:grid-cols-10">{[50, 55, 60, 65, 70, 75, 80, 85, 90, 95].map((t) => { const n = neededOnFinal(cur, t, w); return <div key={t} className={`rounded-lg border border-border p-1.5 ${n > 100 ? 'opacity-40' : ''}`}><div className="font-bold">{t}%</div><div className="text-muted">{n <= 0 ? 'done' : n > 100 ? 'no' : `${n.toFixed(0)}%`}</div></div> })}</div>}
      </Card> : <Card className="space-y-2">
        <div className="grid grid-cols-[1fr_6rem_6rem_2rem] gap-2 text-xs font-medium uppercase text-muted"><span>Part</span><span>Weight %</span><span>Score %</span><span /></div>
        {parts.map((p, i) => <div key={i} className="grid grid-cols-[1fr_6rem_6rem_2rem] items-center gap-2"><Input value={p.name} onChange={(e) => upd(i, { name: e.target.value })} aria-label="Part" /><Input inputMode="decimal" value={p.weight} onChange={(e) => upd(i, { weight: +e.target.value || 0 })} aria-label="Weight" /><Input inputMode="decimal" value={p.score ?? ''} placeholder="not yet" onChange={(e) => upd(i, { score: e.target.value === '' ? null : +e.target.value })} aria-label="Score" /><button aria-label="Remove" className="text-muted hover:text-danger cursor-pointer" onClick={() => setParts(parts.filter((_, k) => k !== i))}><X className="size-4" /></button></div>)}
        <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={() => setParts([...parts, { name: '', weight: 10, score: null }])}>Add part</Button>
        <Stats cols={3}><Stat label="Grade so far" value={`${wg.average.toFixed(1)}%`} sub={letter(wg.average)} tone="good" /><Stat label="Weight graded" value={`${wg.counted}%`} /><Stat label="Weight left" value={`${wg.remaining}%`} /></Stats>
        {wg.totalWeight !== 100 && <p className="text-sm text-warn">Weights add up to {wg.totalWeight}%, not 100%.</p>}
        <Label className="pt-2">Letter grades use the common US cut-offs (93 A, 90 A-, 87 B+ and so on).</Label>
      </Card>}
    </div>
  )
}
