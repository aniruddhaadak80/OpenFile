import { useMemo, useState } from 'react'
import { Button, Card, Label, Select, ErrorNote } from '@/components/ui'
import { FORMULAS, solveFormula } from '@/lib/cf/sci'
import { NumBox, Stat } from '@/lib/cf/ui'

const fmt = (v: number) => { const a = Math.abs(v); return a !== 0 && (a < 1e-3 || a >= 1e7) ? v.toExponential(4) : Number(v.toPrecision(6)).toString() }

export default function PhysicsFormulaSolver() {
  const [id, setId] = useState('ohm')
  const f = FORMULAS.find((x) => x.id === id)!
  const [vals, setVals] = useState<Record<string, number | null>>({ V: null, I: 2, R: 5 })
  const pick = (nid: string) => { setId(nid); const nf = FORMULAS.find((x) => x.id === nid)!; setVals(Object.fromEntries(nf.vars.map((v, i) => [v.k, i === 0 ? null : v.k === 'g' ? 9.81 : null]))) }
  const res = useMemo(() => { try { return { r: solveFormula(f, vals), e: null } } catch (e: any) { return { r: null, e: e.message as string } } }, [f, vals])
  const groups = [...new Set(FORMULAS.map((x) => x.group))]
  const target = res.r ? f.vars.find((v) => v.k === res.r!.key)! : null
  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <Card className="space-y-3">
        <Label>Formula</Label>
        <Select value={id} onChange={pick} options={FORMULAS.map((x) => ({ value: x.id, label: `${x.group}: ${x.name}` }))} />
        <div className="space-y-2 pt-2">{groups.map((g) => <div key={g}><div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{g}</div><div className="mt-1 flex flex-wrap gap-1">{FORMULAS.filter((x) => x.group === g).map((x) => <button key={x.id} onClick={() => pick(x.id)} className={`rounded-lg border px-2 py-1 font-mono text-[11px] cursor-pointer ${x.id === id ? 'border-accent text-fg' : 'border-border text-muted hover:text-fg'}`}>{x.expr}</button>)}</div></div>)}</div>
      </Card>
      <Card className="space-y-4">
        <div><div className="text-sm text-muted">{f.name}</div><div className="font-display text-3xl font-bold">{f.expr}</div></div>
        <p className="text-sm text-muted">Fill every box except the one you want to find. Use SI units as shown.</p>
        <div className="grid gap-3 sm:grid-cols-2">{f.vars.map((v) => <NumBox key={id + v.k} label={v.label} unit={v.unit} value={vals[v.k] ?? null} onChange={(x) => setVals((o) => ({ ...o, [v.k]: x }))} placeholder={res.r?.key === v.k ? 'answer' : ''} />)}</div>
        <ErrorNote error={res.e} />
        {res.r && target && <Stat label={`${target.label} (${target.k})`} value={<>{fmt(res.r.value)} <span className="text-base text-muted">{target.unit}</span></>} tone="good" />}
        <Button variant="ghost" size="sm" onClick={() => setVals(Object.fromEntries(f.vars.map((v) => [v.k, null])))}>Clear all</Button>
      </Card>
    </div>
  )
}
