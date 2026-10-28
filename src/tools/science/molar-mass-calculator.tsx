import { useMemo, useState } from 'react'
import { Input, Label, ToolGrid, ErrorNote, CopyButton } from '@/components/ui'
import { molarMass } from '@/lib/bcat/science'
import { Bars, pal } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

const EXAMPLES = ['H2O', 'C6H12O6', 'NaCl', 'CuSO4·5H2O', 'Ca(OH)2', 'K4[Fe(CN)6]', 'C8H10N4O2', 'H2SO4']
const sub = (f: string) => f.replace(/(\d+)/g, (m, _d, i) => (i > 0 && /[A-Za-z)\]]/.test(f[i - 1]) ? m.split('').map((c) => '₀₁₂₃₄₅₆₇₈₉'[+c]).join('') : m))

export default function MolarMassCalculator() {
  const [f, setF] = useState('C6H12O6')
  const [grams, setGrams] = useState('10')
  const [moles, setMoles] = useState('')
  const r = useMemo(() => { try { return { ok: molarMass(f) } } catch (e: any) { return { err: e.message as string } } }, [f])
  const m = r.ok?.mass ?? 0
  const g = parseFloat(grams), mo = parseFloat(moles)

  return (
    <ToolGrid
      main={
        <div className="space-y-4">
          <div><Label>Chemical formula</Label><Input value={f} onChange={(e) => setF(e.target.value)} className="h-12 font-mono text-lg" aria-label="Chemical formula" spellCheck={false} /></div>
          <div className="flex flex-wrap gap-1.5">{EXAMPLES.map((x) => <button key={x} type="button" className="rounded-full border border-border px-2.5 py-1 font-mono text-xs text-muted hover:text-fg cursor-pointer" onClick={() => setF(x)}>{sub(x)}</button>)}</div>
          <ErrorNote error={r.err ?? null} />
          {r.ok && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><Stat label="Molar mass" value={`${m.toFixed(3)} g/mol`} /><Stat label="Formula" value={<span className="font-mono">{sub(f)}</span>} /><Stat label="Atoms" value={r.ok.parts.reduce((s, p) => s + p.count, 0)} /></div>
              <div className="overflow-hidden rounded-2xl border border-border">
                <table className="w-full text-sm"><thead className="bg-surface-2/60 text-left text-xs text-muted"><tr><th className="px-3 py-2">Element</th><th className="px-3 py-2">Atoms</th><th className="px-3 py-2">Mass</th><th className="px-3 py-2">Share by mass</th></tr></thead>
                  <tbody>{r.ok.parts.map((p, i) => <tr key={p.symbol} className="border-t border-border"><td className="px-3 py-1.5"><span className="mr-2 inline-block size-2 rounded-full" style={{ background: pal(i) }} />{p.name} ({p.symbol})</td><td className="px-3 py-1.5 font-mono">{p.count}</td><td className="px-3 py-1.5 font-mono">{p.mass.toFixed(3)}</td><td className="px-3 py-1.5 font-mono">{p.pct.toFixed(2)}%</td></tr>)}</tbody></table>
              </div>
              <div className="flex h-4 overflow-hidden rounded-full" aria-hidden>{r.ok.parts.map((p, i) => <span key={p.symbol} style={{ width: `${p.pct}%`, background: pal(i) }} />)}</div>
            </>
          )}
        </div>
      }
      side={
        <>
          <Label>Grams and moles</Label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">Grams<Input value={grams} onChange={(e) => { setGrams(e.target.value); setMoles('') }} inputMode="decimal" /></label>
            <label className="text-xs text-muted">Moles<Input value={moles} onChange={(e) => { setMoles(e.target.value); setGrams('') }} inputMode="decimal" /></label>
          </div>
          {m > 0 && (isFinite(g) || isFinite(mo)) && (
            <div className="rounded-xl border border-border bg-surface-2/50 p-3 text-sm">
              {isFinite(g) ? <p>{g} g = <b>{(g / m).toPrecision(5)} mol</b> = {((g / m) * 6.02214076e23).toExponential(4)} molecules</p> : <p>{mo} mol = <b>{(mo * m).toPrecision(6)} g</b> = {(mo * 6.02214076e23).toExponential(4)} molecules</p>}
            </div>
          )}
          {r.ok && <Bars items={r.ok.parts.map((p) => ({ label: p.symbol, value: +p.pct.toFixed(2) }))} max={100} unit="%" />}
          {r.ok && <CopyButton text={`${f}: ${m.toFixed(3)} g/mol`} label="Copy result" />}
          <p className="text-xs text-muted">Brackets, hydrates (· or *), and charges like SO4^2- are understood. Uses IUPAC standard atomic weights.</p>
        </>
      }
    />
  )
}
