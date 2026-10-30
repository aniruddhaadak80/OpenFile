import { useMemo, useState } from 'react'
import { Card, Label, Select, ErrorNote } from '@/components/ui'
import { halfLife, decayConstant } from '@/lib/cf/sci'
import { NumBox, Stat, Stats } from '@/lib/cf/ui'

const ISOTOPES = [{ n: 'Carbon-14', T: 5730, u: 'years' }, { n: 'Iodine-131', T: 8.02, u: 'days' }, { n: 'Uranium-238', T: 4.468e9, u: 'years' }, { n: 'Radon-222', T: 3.8235, u: 'days' }, { n: 'Cobalt-60', T: 5.27, u: 'years' }, { n: 'Technetium-99m', T: 6.01, u: 'hours' }, { n: 'Caffeine in the body', T: 5, u: 'hours' }]
const f = (v: number) => (Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v) ? v.toExponential(3) : Number(v.toPrecision(5)).toString())

export default function HalfLifeCalculator() {
  const [v, setV] = useState<Record<'N0' | 'N' | 't' | 'T', number | null>>({ N0: 100, N: null, t: 11460, T: 5730 })
  const [unit, setUnit] = useState('years')
  const res = useMemo(() => { try { return { r: halfLife(v), e: null } } catch (e: any) { return { r: null, e: e.message as string } } }, [v])
  const all = res.r ? { ...v, [res.r.key]: res.r.value } as Record<string, number> : null
  const pts = all ? Array.from({ length: 61 }, (_, i) => { const t = (i / 60) * Math.max(all.t * 1.5, all.T * 4); return [t, all.N0 * 0.5 ** (t / all.T)] }) : []
  const maxT = pts.at(-1)?.[0] ?? 1
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]"><label className="block"><Label>Presets</Label><Select value="" onChange={(n) => { const p = ISOTOPES.find((x) => x.n === n); if (p) { setV((o) => ({ ...o, T: p.T })); setUnit(p.u) } }} options={[{ value: '', label: 'Pick an isotope or substance' }, ...ISOTOPES.map((x) => ({ value: x.n, label: `${x.n} (${x.T} ${x.u})` }))]} /></label>
          <label className="block"><Label>Time unit</Label><Select value={unit} onChange={setUnit} options={['seconds', 'minutes', 'hours', 'days', 'years']} /></label></div>
        <p className="text-sm text-muted">Leave one box empty to solve for it.</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <NumBox label="Start amount N0" value={v.N0} onChange={(x) => setV((o) => ({ ...o, N0: x }))} />
          <NumBox label="Amount left N" value={v.N} onChange={(x) => setV((o) => ({ ...o, N: x }))} />
          <NumBox label="Time passed t" unit={unit} value={v.t} onChange={(x) => setV((o) => ({ ...o, t: x }))} />
          <NumBox label="Half-life T" unit={unit} value={v.T} onChange={(x) => setV((o) => ({ ...o, T: x }))} />
        </div>
        <ErrorNote error={res.e} />
      </Card>
      {res.r && all && <>
        <Stats cols={4}><Stat label={res.r.key} value={f(res.r.value)} tone="good" /><Stat label="Fraction left" value={`${f((all.N / all.N0) * 100)} %`} /><Stat label="Half-lives passed" value={f(all.t / all.T)} /><Stat label={`Decay constant (1/${unit.replace(/s$/, '')})`} value={<span className="text-base">{f(decayConstant(all.T))}</span>} /></Stats>
        <Card>
          <svg viewBox="0 0 600 220" className="w-full" role="img" aria-label="Decay curve">
            <line x1="40" y1="190" x2="590" y2="190" stroke="currentColor" opacity=".3" /><line x1="40" y1="10" x2="40" y2="190" stroke="currentColor" opacity=".3" />
            {[1, 2, 3, 4].map((k) => k * all.T <= maxT && <g key={k}><line x1={40 + (k * all.T / maxT) * 550} y1="10" x2={40 + (k * all.T / maxT) * 550} y2="190" stroke="#14B8A6" strokeDasharray="3 4" opacity=".5" /><text x={42 + (k * all.T / maxT) * 550} y="22" fontSize="10" fill="#14B8A6">{k}T</text></g>)}
            <polyline fill="none" stroke="#F5A524" strokeWidth="2.5" points={pts.map(([t, n]) => `${40 + (t / maxT) * 550},${190 - (n / all.N0) * 175}`).join(' ')} />
            <circle cx={40 + (all.t / maxT) * 550} cy={190 - (all.N / all.N0) * 175} r="5" fill="#22D3EE" />
            <text x="44" y="206" fontSize="10" fill="currentColor" opacity=".6">0</text><text x="560" y="206" fontSize="10" fill="currentColor" opacity=".6">{f(maxT)}</text>
          </svg>
        </Card>
      </>}
    </div>
  )
}
