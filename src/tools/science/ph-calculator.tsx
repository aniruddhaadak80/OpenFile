import { useMemo, useState } from 'react'
import { Card, Label, Segmented, Select, ErrorNote } from '@/components/ui'
import { phBuffer, phFrom, phStrong, phWeak, type PhResult } from '@/lib/cf/sci'
import { NumBox, Stat, Stats } from '@/lib/cf/ui'

const WEAK = [{ v: '1.8e-5', l: 'Acetic acid, Ka 1.8e-5' }, { v: '6.8e-4', l: 'Hydrofluoric acid, Ka 6.8e-4' }, { v: '4.5e-7', l: 'Carbonic acid, Ka1 4.5e-7' }, { v: '7.1e-4', l: 'Citric acid, Ka1 7.1e-4' }, { v: '1.8e-5', l: 'Ammonia, Kb 1.8e-5 (base)' }]
const sci = (x: number) => (x === 0 ? '0' : x < 1e-3 || x >= 1e4 ? x.toExponential(3) : x.toPrecision(4))
const hue = (ph: number) => ['#EF4444', '#F97316', '#F59E0B', '#FBBF24', '#FACC15', '#A3E635', '#84CC16', '#10B981', '#14B8A6', '#22D3EE', '#38BDF8', '#0EA5E9', '#0284C7', '#0369A1', '#075985'][Math.max(0, Math.min(14, Math.round(ph)))]

export default function PhCalculator() {
  const [mode, setMode] = useState<'convert' | 'strong' | 'weak' | 'buffer'>('convert')
  const [kind, setKind] = useState<'pH' | 'pOH' | 'H' | 'OH'>('H')
  const [val, setVal] = useState<number | null>(0.001)
  const [c, setC] = useState<number | null>(0.1), [base, setBase] = useState<'acid' | 'base'>('acid'), [nH, setNH] = useState<number | null>(1)
  const [k, setK] = useState<number | null>(1.8e-5)
  const [pKa, setPKa] = useState<number | null>(4.76), [ha, setHa] = useState<number | null>(0.1), [a, setA] = useState<number | null>(0.15)
  const res = useMemo((): { r: PhResult | null; e: string | null } => {
    try {
      if (mode === 'convert') { if (val == null) return { r: null, e: null }; return { r: phFrom(kind, val), e: null } }
      if (mode === 'strong') { if (!c) return { r: null, e: null }; return { r: phStrong(c, base === 'base', nH ?? 1), e: null } }
      if (mode === 'weak') { if (!c || !k) return { r: null, e: null }; return { r: phWeak(c, k, base === 'base'), e: null } }
      if (pKa == null || !ha || !a) return { r: null, e: null }
      return { r: phBuffer(pKa, ha, a), e: null }
    } catch (e: any) { return { r: null, e: e.message } }
  }, [mode, kind, val, c, base, nH, k, pKa, ha, a])
  return (
    <div className="space-y-4">
      <Segmented value={mode} onChange={setMode} options={[{ value: 'convert', label: 'pH, pOH, [H+], [OH-]' }, { value: 'strong', label: 'Strong acid or base' }, { value: 'weak', label: 'Weak acid or base' }, { value: 'buffer', label: 'Buffer' }]} />
      <Card className="grid gap-3 sm:grid-cols-3">
        {mode === 'convert' && <><div><Label>I know</Label><Select value={kind} onChange={setKind} options={[{ value: 'H', label: '[H+] in mol/L' }, { value: 'OH', label: '[OH-] in mol/L' }, { value: 'pH', label: 'pH' }, { value: 'pOH', label: 'pOH' }]} /></div><NumBox label="Value" value={val} onChange={setVal} /></>}
        {(mode === 'strong' || mode === 'weak') && <><div><Label>Type</Label><Segmented value={base} onChange={setBase} options={[{ value: 'acid', label: 'Acid' }, { value: 'base', label: 'Base' }]} /></div><NumBox label="Concentration" unit="mol/L" value={c} onChange={setC} /></>}
        {mode === 'strong' && <NumBox label={base === 'acid' ? 'H+ per molecule (H2SO4 = 2)' : 'OH- per unit (Ca(OH)2 = 2)'} value={nH} onChange={setNH} />}
        {mode === 'weak' && <><NumBox label={base === 'acid' ? 'Ka' : 'Kb'} value={k} onChange={setK} /><div className="sm:col-span-3"><Label>Common values</Label><div className="flex flex-wrap gap-1.5">{WEAK.map((w) => <button key={w.l} onClick={() => { setK(Number(w.v)); setBase(w.l.includes('base') ? 'base' : 'acid') }} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-fg cursor-pointer">{w.l}</button>)}</div></div></>}
        {mode === 'buffer' && <><NumBox label="pKa" value={pKa} onChange={setPKa} /><NumBox label="Acid [HA]" unit="mol/L" value={ha} onChange={setHa} /><NumBox label="Conjugate base [A-]" unit="mol/L" value={a} onChange={setA} /></>}
      </Card>
      <ErrorNote error={res.e} />
      {res.r && <>
        <div className="relative h-10 overflow-hidden rounded-xl" style={{ background: `linear-gradient(90deg, ${Array.from({ length: 15 }, (_, i) => hue(i)).join(',')})` }}>
          <div className="absolute top-0 h-full w-1 rounded bg-white shadow" style={{ left: `calc(${Math.max(0, Math.min(14, res.r.pH)) / 14 * 100}% - 2px)` }} aria-hidden="true" />
          <div className="absolute inset-x-2 bottom-0.5 flex justify-between text-[10px] font-bold text-black/70">{Array.from({ length: 15 }, (_, i) => <span key={i}>{i}</span>)}</div>
        </div>
        <Stats cols={4}><Stat label="pH" value={res.r.pH.toFixed(2)} /><Stat label="pOH" value={res.r.pOH.toFixed(2)} /><Stat label="[H+] mol/L" value={<span className="text-base">{sci(res.r.h)}</span>} /><Stat label="[OH-] mol/L" value={<span className="text-base">{sci(res.r.oh)}</span>} /></Stats>
        <p className="text-sm">The solution is <b className={res.r.kind === 'acidic' ? 'text-warn' : res.r.kind === 'basic' ? 'text-accent' : 'text-success'}>{res.r.kind}</b>. Values assume 25 °C (Kw = 1.0e-14).{mode === 'weak' ? ' Solved exactly with the quadratic, not the small x shortcut.' : ''}</p>
      </>}
    </div>
  )
}
