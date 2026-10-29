import { useState } from 'react'
import { Input, Label, Segmented, Select, ToolGrid } from '@/components/ui'
import { bmi, bmiClass, bmr, navyBodyFat, idealWeight, ACTIVITY } from '@/lib/r13/health'
import { Stat } from '@/tools/dev/_b5/shell'

export default function BmiBmrCalculator() {
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric')
  const [sex, setSex] = useState<'m' | 'f'>('m')
  const [age, setAge] = useState('30')
  const [h, setH] = useState('172')
  const [w, setW] = useState('70')
  const [act, setAct] = useState('1.375')
  const [neck, setNeck] = useState('')
  const [waist, setWaist] = useState('')
  const [hip, setHip] = useState('')
  const cm = units === 'metric' ? +h : +h * 2.54, kg = units === 'metric' ? +w : +w * 0.45359237
  const len = (v: string) => (units === 'metric' ? +v : +v * 2.54)
  const B = bmi(kg, cm), R = bmr(kg, cm, +age, sex), T = R * +act
  const fat = +neck && +waist && (sex === 'm' || +hip) ? navyBodyFat(sex, cm, len(neck), len(waist), len(hip)) : NaN
  const ok = cm > 50 && kg > 10 && +age > 0
  const lo = 18.5 * (cm / 100) ** 2, hi = 24.9 * (cm / 100) ** 2
  const wt = (v: number) => (units === 'metric' ? `${v.toFixed(1)} kg` : `${(v / 0.45359237).toFixed(1)} lb`)
  const pos = Math.min(100, Math.max(0, ((B - 15) / 25) * 100))
  return (
    <ToolGrid
      main={ok ? <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="BMI" value={B.toFixed(1)} sub={bmiClass(B)} /><Stat label="Resting energy (BMR)" value={`${Math.round(R)} kcal`} /><Stat label="Daily energy (TDEE)" value={`${Math.round(T)} kcal`} /><Stat label="Body fat (US Navy)" value={isFinite(fat) ? `${fat.toFixed(1)}%` : '-'} sub={isFinite(fat) ? undefined : 'add measurements'} /></div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="relative h-3 rounded-full" style={{ background: 'linear-gradient(90deg,#38BDF8 0%,#38BDF8 14%,#10B981 14%,#10B981 40%,#F5A524 40%,#F5A524 60%,#F97316 60%)' }}><span className="absolute -top-1 size-5 -translate-x-1/2 rounded-full border-2 border-bg bg-fg" style={{ left: `${pos}%` }} /></div>
          <div className="mt-1 flex justify-between text-[10px] text-muted"><span>15</span><span>18.5</span><span>25</span><span>30</span><span>40</span></div>
          <p className="mt-3 text-sm">A healthy BMI range for your height is <b>{wt(lo)}</b> to <b>{wt(hi)}</b>. Devine ideal weight: {wt(idealWeight(cm, sex))}.</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4"><Label>Daily calories by goal</Label>
          <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3"><li className="rounded-xl bg-surface-2/50 p-2">Lose about 0.5 kg a week<br /><b>{Math.round(T - 500)} kcal</b></li><li className="rounded-xl bg-surface-2/50 p-2">Stay the same<br /><b>{Math.round(T)} kcal</b></li><li className="rounded-xl bg-surface-2/50 p-2">Gain slowly<br /><b>{Math.round(T + 300)} kcal</b></li></ul></div>
        <p className="text-xs text-muted">BMI does not see muscle, age or where fat sits, so treat it as a rough guide. Talk to a doctor for health advice.</p>
      </> : <p className="text-sm text-muted">Enter age, height and weight.</p>}
      side={<>
        <div><Label>Units</Label><Segmented value={units} onChange={setUnits} options={[{ value: 'metric', label: 'cm, kg' }, { value: 'imperial', label: 'in, lb' }]} /></div>
        <div><Label>Sex (for the formulas)</Label><Segmented value={sex} onChange={setSex} options={[{ value: 'm', label: 'Male' }, { value: 'f', label: 'Female' }]} /></div>
        <div className="grid grid-cols-3 gap-2"><label className="block text-xs text-muted">Age<Input inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} /></label><label className="block text-xs text-muted">Height<Input inputMode="decimal" value={h} onChange={(e) => setH(e.target.value)} /></label><label className="block text-xs text-muted">Weight<Input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} /></label></div>
        <label className="block text-xs text-muted">Activity<Select value={act} onChange={setAct} options={ACTIVITY.map((a) => ({ value: String(a.k), label: a.label }))} /></label>
        <Label>Body fat (optional, tape measure)</Label>
        <div className="grid grid-cols-3 gap-2"><label className="block text-xs text-muted">Neck<Input inputMode="decimal" value={neck} onChange={(e) => setNeck(e.target.value)} /></label><label className="block text-xs text-muted">Waist<Input inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value)} /></label>{sex === 'f' && <label className="block text-xs text-muted">Hips<Input inputMode="decimal" value={hip} onChange={(e) => setHip(e.target.value)} /></label>}</div>
        <p className="text-xs text-muted">BMR uses the Mifflin-St Jeor formula. Nothing you type leaves this page.</p>
      </>}
    />
  )
}
