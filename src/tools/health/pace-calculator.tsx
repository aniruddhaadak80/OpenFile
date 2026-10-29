import { useMemo, useState } from 'react'
import { Input, Label, Segmented, ToolGrid, CopyButton } from '@/components/ui'
import { parseDuration, fmtDuration, riegel } from '@/lib/r13/health'
import { toCsv, DlButton } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

const RACES = [{ name: '1 km', km: 1 }, { name: '5 km', km: 5 }, { name: '10 km', km: 10 }, { name: 'Half marathon', km: 21.0975 }, { name: 'Marathon', km: 42.195 }]
type Solve = 'pace' | 'time' | 'distance'

export default function PaceCalculator() {
  const [solve, setSolve] = useState<Solve>('pace')
  const [unit, setUnit] = useState<'km' | 'mi'>('km')
  const [dist, setDist] = useState('10')
  const [time, setTime] = useState('55:00')
  const [pace, setPace] = useState('5:30')
  const k = unit === 'km' ? 1 : 1.609344
  const dKm = (+dist || 0) * k, tS = parseDuration(time), pS = parseDuration(pace) / k // pace seconds per km
  const res = useMemo(() => {
    if (solve === 'pace') return { d: dKm, t: tS, p: dKm > 0 ? tS / dKm : NaN }
    if (solve === 'time') return { d: dKm, t: pS * dKm, p: pS }
    return { d: pS > 0 ? tS / pS : NaN, t: tS, p: pS }
  }, [solve, dKm, tS, pS])
  const speed = res.p > 0 ? 3600 / res.p : NaN
  const splits = useMemo(() => { const n = Math.min(100, Math.ceil(res.d / k)); return Array.from({ length: isFinite(n) ? n : 0 }, (_, i) => ({ n: i + 1, at: Math.min(res.d, (i + 1) * k), t: Math.min(res.d, (i + 1) * k) * res.p })) }, [res, k])
  const show = (sPerKm: number) => `${fmtDuration(sPerKm * k)} per ${unit}`
  return (
    <ToolGrid
      main={<>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Pace" value={isFinite(res.p) ? show(res.p) : '-'} /><Stat label="Time" value={fmtDuration(res.t, true)} /><Stat label="Distance" value={isFinite(res.d) ? `${(res.d / k).toFixed(2)} ${unit}` : '-'} /><Stat label="Speed" value={isFinite(speed) ? `${(speed / k).toFixed(2)} ${unit}/h` : '-'} /></div>
        <CopyButton text={`${(res.d / k).toFixed(2)} ${unit} in ${fmtDuration(res.t, true)} = ${show(res.p)}`} label="Copy" />
        {isFinite(res.t) && res.d > 0 && <div className="rounded-2xl border border-border bg-surface p-4"><Label>Race times at this effort</Label>
          <table className="w-full text-sm"><tbody>{RACES.map((r) => { const t = riegel(res.t, res.d, r.km); return <tr key={r.name} className="border-t border-border first:border-0"><td className="py-1.5">{r.name}</td><td className="py-1.5 text-right font-mono">{fmtDuration(t, true)}</td><td className="py-1.5 text-right text-xs text-muted">{show(t / r.km)}</td></tr> })}</tbody></table>
          <p className="mt-2 text-xs text-muted">Predictions use the Riegel formula. They assume you trained for the distance. Marathons are usually slower than this for newer runners.</p></div>}
        {splits.length > 0 && splits.length <= 100 && <div className="max-h-72 overflow-auto rounded-2xl border border-border scrollbar-thin"><table className="w-full text-sm"><thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted"><tr><th className="px-3 py-2">Split</th><th className="px-3 py-2 text-right">At</th><th className="px-3 py-2 text-right">Clock</th></tr></thead><tbody>{splits.map((s) => <tr key={s.n} className="border-t border-border font-mono text-xs"><td className="px-3 py-1">{s.n}</td><td className="px-3 py-1 text-right">{(s.at / k).toFixed(2)} {unit}</td><td className="px-3 py-1 text-right">{fmtDuration(s.t, true)}</td></tr>)}</tbody></table></div>}
      </>}
      side={<>
        <div><Label>Work out</Label><Segmented value={solve} onChange={setSolve} options={[{ value: 'pace', label: 'Pace' }, { value: 'time', label: 'Time' }, { value: 'distance', label: 'Distance' }]} /></div>
        <div><Label>Units</Label><Segmented value={unit} onChange={setUnit} options={[{ value: 'km', label: 'Kilometres' }, { value: 'mi', label: 'Miles' }]} /></div>
        {solve !== 'distance' && <label className="block text-xs text-muted">Distance ({unit})<Input inputMode="decimal" value={dist} onChange={(e) => setDist(e.target.value)} /></label>}
        {solve !== 'distance' && <div className="flex flex-wrap gap-1.5">{RACES.map((r) => <button key={r.name} type="button" className="rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:text-fg cursor-pointer" onClick={() => setDist((r.km / k).toFixed(unit === 'km' ? 4 : 3).replace(/\.?0+$/, ''))}>{r.name}</button>)}</div>}
        {solve !== 'time' && <label className="block text-xs text-muted">Time (h:mm:ss or mm:ss)<Input value={time} onChange={(e) => setTime(e.target.value)} /></label>}
        {solve !== 'pace' && <label className="block text-xs text-muted">Pace per {unit} (mm:ss)<Input value={pace} onChange={(e) => setPace(e.target.value)} /></label>}
        <DlButton className="w-full" disabled={!splits.length} name="splits.csv" mime="text/csv" data={() => toCsv([['split', `at_${unit}`, 'clock'], ...splits.map((s) => [s.n, (s.at / k).toFixed(2), fmtDuration(s.t, true)])])}>Splits CSV</DlButton>
      </>}
    />
  )
}
