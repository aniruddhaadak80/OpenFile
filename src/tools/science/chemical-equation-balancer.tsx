import { useMemo, useState } from 'react'
import { Input, Label, ErrorNote, CopyButton, Card } from '@/components/ui'
import { balance, molarMass, parseFormula } from '@/lib/bcat/science'

const EXAMPLES = ['H2 + O2 -> H2O', 'Fe + O2 -> Fe2O3', 'C3H8 + O2 -> CO2 + H2O', 'Al + HCl -> AlCl3 + H2', 'KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2', 'Cu + NO3^- + H^+ -> Cu^2+ + NO + H2O', 'C6H12O6 + O2 -> CO2 + H2O']
const sub = (f: string) => f.replace(/\^?(\d*[+-])$/, (_m, c) => c.split('').map((x: string) => '⁰¹²³⁴⁵⁶⁷⁸⁹'['0123456789'.indexOf(x)] ?? (x === '+' ? '⁺' : '⁻')).join('')).replace(/(?<=[A-Za-z)\]])(\d+)/g, (m) => m.split('').map((c) => '₀₁₂₃₄₅₆₇₈₉'[+c]).join(''))

export default function ChemicalEquationBalancer() {
  const [eq, setEq] = useState(EXAMPLES[2])
  const r = useMemo(() => { try { return { ok: balance(eq) } } catch (e: any) { return { err: e.message as string } } }, [eq])
  const check = useMemo(() => {
    if (!r.ok) return []
    const count = (side: { f: string; n: number }[]) => { const m = new Map<string, number>(); side.forEach((t) => parseFormula(t.f).forEach((v, k) => m.set(k, (m.get(k) ?? 0) + v * t.n))); return m }
    const L = count(r.ok.left), R = count(r.ok.right)
    return [...L.keys()].map((k) => ({ el: k, l: L.get(k) ?? 0, r: R.get(k) ?? 0 }))
  }, [r])
  const mass = (side: { f: string; n: number }[]) => side.reduce((s, t) => { try { return s + molarMass(t.f).mass * t.n } catch { return s } }, 0)

  return (
    <div className="space-y-4">
      <div><Label>Unbalanced equation</Label><Input value={eq} onChange={(e) => setEq(e.target.value)} className="h-12 font-mono text-base" spellCheck={false} aria-label="Chemical equation" /></div>
      <div className="flex flex-wrap gap-1.5">{EXAMPLES.map((x) => <button key={x} type="button" onClick={() => setEq(x)} className="rounded-full border border-border px-2.5 py-1 font-mono text-[11px] text-muted hover:text-fg cursor-pointer">{x}</button>)}</div>
      <ErrorNote error={r.err ?? null} />
      {r.ok && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-center gap-2 text-center font-display text-2xl sm:text-3xl">
            {r.ok.left.map((t, i) => <span key={'l' + i}>{i > 0 && <span className="mx-2 text-muted">+</span>}{t.n > 1 && <span className="text-accent">{t.n}</span>}{sub(t.f)}</span>)}
            <span className="mx-3 text-accent">→</span>
            {r.ok.right.map((t, i) => <span key={'r' + i}>{i > 0 && <span className="mx-2 text-muted">+</span>}{t.n > 1 && <span className="text-accent">{t.n}</span>}{sub(t.f)}</span>)}
          </div>
          <div className="flex justify-center"><CopyButton text={r.ok.text} label="Copy balanced equation" /></div>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm"><thead className="bg-surface-2/60 text-xs text-muted"><tr><th className="px-3 py-1.5 text-left">Element</th><th className="px-3 py-1.5">Left</th><th className="px-3 py-1.5">Right</th><th /></tr></thead>
              <tbody>{check.map((c) => <tr key={c.el} className="border-t border-border text-center"><td className="px-3 py-1 text-left font-mono">{c.el}</td><td className="font-mono">{c.l}</td><td className="font-mono">{c.r}</td><td className={c.l === c.r ? 'text-success' : 'text-danger'}>{c.l === c.r ? 'balanced' : 'off'}</td></tr>)}</tbody></table>
          </div>
          <p className="text-center text-xs text-muted">Mass check: {mass(r.ok.left).toFixed(3)} g on the left, {mass(r.ok.right).toFixed(3)} g on the right (per the coefficients in moles).</p>
        </Card>
      )}
      <p className="text-xs text-muted">Separate compounds with + and the two sides with an arrow (-&gt;, = or →). Write ions with a caret, like Fe^3+ or SO4^2-. The tool solves the atom and charge counts exactly with fractions, then gives the smallest whole numbers.</p>
    </div>
  )
}
