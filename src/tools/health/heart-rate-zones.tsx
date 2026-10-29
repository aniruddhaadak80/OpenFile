import { useMemo, useState } from 'react'
import { Dropzone, Input, Label, Segmented, ToolGrid, ErrorNote } from '@/components/ui'
import { baseName } from '@/lib/files'
import { ZONES, zoneTimes, trimp, maxHrTanaka, fmtDuration, activityStats } from '@/lib/r13/health'
import { useActivity, ACTIVITY_ACCEPT } from '@/lib/r13/ui'
import { toCsv, DlButton } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

export default function HeartRateZones() {
  const a = useActivity()
  const [age, setAge] = useState('30')
  const [maxHr, setMaxHr] = useState('')
  const [rest, setRest] = useState('60')
  const [model, setModel] = useState<'max' | 'reserve'>('max')
  const [sex, setSex] = useState<'m' | 'f'>('m')
  const max = +maxHr || maxHrTanaka(+age || 30)
  const pts = a.act?.points ?? []
  const z = useMemo(() => zoneTimes(pts, max, model === 'reserve' ? +rest || 60 : undefined), [pts, max, model, rest])
  const load = useMemo(() => trimp(pts, max, +rest || 60, sex), [pts, max, rest, sex])
  const total = z.secs.reduce((x, y) => x + y, 0) + z.below
  const s = a.act ? activityStats(a.act) : null
  const bound = (f: number) => Math.round(model === 'reserve' ? (+rest || 60) + f * (max - (+rest || 60)) : f * max)
  return (
    <ToolGrid
      main={<>
        {!a.file ? <Dropzone accept={ACTIVITY_ACCEPT} onFiles={(f) => f[0] && a.load(f[0])} label="Drop a workout with heart rate" sub="FIT, TCX or GPX from a watch, chest strap or bike computer. Read on your device." />
          : <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate font-medium">{a.file.name}</span><button type="button" className="rounded-lg border border-border px-2 py-1 text-xs hover:border-accent cursor-pointer" onClick={a.reset}>Change file</button></div>}
        <ErrorNote error={a.error} />
        {s && !s.hasHr && <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">This file has no heart rate samples. Zones need a heart rate sensor.</p>}
        {s?.hasHr && <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Time with heart rate" value={fmtDuration(total)} /><Stat label="Average" value={`${s.avgHr} bpm`} /><Stat label="Highest" value={`${s.maxHr} bpm`} sub={s.maxHr! > max ? 'above your max, raise it' : undefined} /><Stat label="Training load (TRIMP)" value={Math.round(load)} sub={load < 50 ? 'light' : load < 120 ? 'moderate' : load < 250 ? 'hard' : 'very hard'} /></div>
          <div className="flex h-6 overflow-hidden rounded-full" aria-hidden>{z.secs.map((v, i) => <span key={i} style={{ width: `${(v / Math.max(1, total)) * 100}%`, background: ZONES[i].color }} />)}<span style={{ width: `${(z.below / Math.max(1, total)) * 100}%` }} className="bg-surface-2" /></div>
          <div className="overflow-hidden rounded-2xl border border-border"><table className="w-full text-sm"><thead className="bg-surface-2 text-left text-xs text-muted"><tr><th className="px-3 py-2">Zone</th><th className="px-3 py-2">Range (bpm)</th><th className="px-3 py-2 text-right">Time</th><th className="px-3 py-2 text-right">Share</th></tr></thead>
            <tbody>{ZONES.map((Z, i) => <tr key={Z.name} className="border-t border-border"><td className="px-3 py-1.5"><span className="mr-2 inline-block size-2.5 rounded-full" style={{ background: Z.color }} />{Z.name}</td><td className="px-3 py-1.5 font-mono text-xs">{bound(Z.lo)} to {i === 4 ? max : bound(Z.hi) - 1}</td><td className="px-3 py-1.5 text-right font-mono">{fmtDuration(z.secs[i])}</td><td className="px-3 py-1.5 text-right font-mono">{((z.secs[i] / Math.max(1, total)) * 100).toFixed(0)}%</td></tr>)}
              <tr className="border-t border-border text-muted"><td className="px-3 py-1.5">Below zone 1</td><td className="px-3 py-1.5 font-mono text-xs">under {bound(0.5)}</td><td className="px-3 py-1.5 text-right font-mono">{fmtDuration(z.below)}</td><td className="px-3 py-1.5 text-right font-mono">{((z.below / Math.max(1, total)) * 100).toFixed(0)}%</td></tr></tbody></table></div>
        </>}
      </>}
      side={<>
        <div className="grid grid-cols-2 gap-2"><label className="block text-xs text-muted">Age<Input inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} /></label><label className="block text-xs text-muted">Max heart rate<Input inputMode="numeric" value={maxHr} placeholder={String(maxHrTanaka(+age || 30))} onChange={(e) => setMaxHr(e.target.value)} /></label></div>
        <p className="-mt-2 text-xs text-muted">Leave max empty to estimate it from age (208 minus 0.7 times age). A real max from a hard test is better.</p>
        <label className="block text-xs text-muted">Resting heart rate<Input inputMode="numeric" value={rest} onChange={(e) => setRest(e.target.value)} /></label>
        <div><Label>Zones from</Label><Segmented value={model} onChange={setModel} options={[{ value: 'max', label: '% of max' }, { value: 'reserve', label: 'Heart rate reserve' }]} /></div>
        <div><Label>Load formula for</Label><Segmented value={sex} onChange={setSex} options={[{ value: 'm', label: 'Male' }, { value: 'f', label: 'Female' }]} /></div>
        <DlButton className="w-full" disabled={!s?.hasHr} name={() => `${baseName(a.file?.name ?? 'workout')}-zones.csv`} mime="text/csv" data={() => toCsv([['zone', 'from_bpm', 'to_bpm', 'seconds'], ...ZONES.map((Z, i) => [Z.name, bound(Z.lo), i === 4 ? max : bound(Z.hi) - 1, Math.round(z.secs[i])])])}>Download CSV</DlButton>
        <p className="text-xs text-muted">Training load uses the Banister TRIMP formula. This is training information, not medical advice.</p>
      </>}
    />
  )
}
