import { useMemo, useState } from 'react'
import { Card, Input, Label, Segmented, ErrorNote } from '@/components/ui'
import { dilution, molarity } from '@/lib/cf/sci'
import { molarMass } from '@/lib/bcat/science'
import { NumBox, Stat, Stats } from '@/lib/cf/ui'

const f = (v: number) => (Math.abs(v) < 1e-3 && v !== 0 ? v.toExponential(3) : Number(v.toPrecision(5)).toString())

export default function SolutionCalculator() {
  const [mode, setMode] = useState<'molarity' | 'dilution' | 'percent'>('molarity')
  const [formula, setFormula] = useState('NaCl')
  const [M, setM] = useState<number | null>(0.5), [g, setG] = useState<number | null>(null), [mL, setML] = useState<number | null>(250)
  const [d, setD] = useState<Record<'c1' | 'v1' | 'c2' | 'v2', number | null>>({ c1: 2, v1: null, c2: 0.5, v2: 100 })
  const [solute, setSolute] = useState<number | null>(5), [total, setTotal] = useState<number | null>(100)
  const mmVal = useMemo(() => { try { const m = molarMass(formula).mass; return m > 0 ? m : null } catch { return null } }, [formula])
  const mol = useMemo(() => { try { if (!mmVal) throw new Error('Type a valid chemical formula, like NaCl or C6H12O6.'); return { r: molarity({ M, g, L: mL == null ? null : mL / 1000, mm: mmVal }), e: null } } catch (e: any) { return { r: null, e: e.message as string } } }, [M, g, mL, mmVal])
  const dil = useMemo(() => { try { return { r: dilution(d), e: null } } catch (e: any) { return { r: null, e: e.message as string } } }, [d])
  return (
    <div className="space-y-4">
      <Segmented value={mode} onChange={setMode} options={[{ value: 'molarity', label: 'Molarity' }, { value: 'dilution', label: 'Dilution C1V1 = C2V2' }, { value: 'percent', label: 'Percent' }]} />
      {mode === 'molarity' && <Card className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2"><div><Label hint={mmVal ? `${mmVal.toFixed(3)} g/mol` : 'unknown'}>Solute formula</Label><Input value={formula} onChange={(e) => setFormula(e.target.value)} className="font-mono" /></div></div>
        <p className="text-sm text-muted">Fill two of the three boxes. Leave the one you want empty.</p>
        <div className="grid gap-3 sm:grid-cols-3"><NumBox label="Molarity" unit="mol/L" value={M} onChange={setM} /><NumBox label="Mass of solute" unit="g" value={g} onChange={setG} /><NumBox label="Volume" unit="mL" value={mL} onChange={setML} /></div>
        <ErrorNote error={mol.e} />
        {mol.r && <Stats><Stat label="Molarity" value={`${f(mol.r.M)} M`} /><Stat label="Mass" value={`${f(mol.r.g)} g`} /><Stat label="Volume" value={`${f(mol.r.L * 1000)} mL`} /></Stats>}
        {mol.r && <p className="text-sm text-muted">Weigh {f(mol.r.g)} g of {formula}, dissolve it, then add water up to {f(mol.r.L * 1000)} mL. That is {f(mol.r.g / mmVal!)} mol.</p>}
      </Card>}
      {mode === 'dilution' && <Card className="space-y-4">
        <p className="text-sm text-muted">Leave exactly one box empty. Any units work, as long as both concentrations and both volumes match.</p>
        <div className="grid gap-3 sm:grid-cols-4">{(['c1', 'v1', 'c2', 'v2'] as const).map((k) => <NumBox key={k} label={{ c1: 'Stock conc. C1', v1: 'Stock volume V1', c2: 'Final conc. C2', v2: 'Final volume V2' }[k]} value={d[k]} onChange={(x) => setD((o) => ({ ...o, [k]: x }))} />)}</div>
        <ErrorNote error={dil.e} />
        {dil.r && <Stat label={dil.r.key.toUpperCase()} value={f(dil.r.value)} tone="good" />}
        {dil.r && dil.r.key === 'v1' && d.v2 != null && <p className="text-sm text-muted">Take {f(dil.r.value)} of the stock and add {f(d.v2 - dil.r.value)} of solvent to reach {f(d.v2)}.</p>}
      </Card>}
      {mode === 'percent' && <Card className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2"><NumBox label="Solute" unit="g or mL" value={solute} onChange={setSolute} /><NumBox label="Total solution" unit="g or mL" value={total} onChange={setTotal} /></div>
        {solute != null && total ? <Stats cols={3}><Stat label="Percent" value={`${f((solute / total) * 100)} %`} /><Stat label="Parts per million" value={f((solute / total) * 1e6)} /><Stat label="Solvent" value={f(total - solute)} /></Stats> : null}
      </Card>}
    </div>
  )
}
