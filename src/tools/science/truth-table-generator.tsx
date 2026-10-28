import { useMemo, useState } from 'react'
import { Input, Label, ToolGrid, ErrorNote, CopyButton, Switch, cn } from '@/components/ui'
import { truthTable, simplifySop } from '@/lib/bcat/science'
import { DlButton, toCsv } from '@/lib/bcat/kit'

const EXAMPLES = ['(A and B) or not C', "AB' + A'B", 'p -> q', '(p -> q) and (q -> p)', 'A xor B xor C', 'not (A or B) <-> (not A and not B)']

export default function TruthTableGenerator() {
  const [expr, setExpr] = useState('(A and B) or not C')
  const [bits, setBits] = useState(true)
  const r = useMemo(() => { try { const t = truthTable(expr); return { t, sop: simplifySop(t.vars, t.minterms) } } catch (e: any) { return { err: e.message as string } } }, [expr])
  const t = r.t
  const kind = t ? (t.minterms.length === t.rows.length ? 'Always true (a tautology)' : !t.minterms.length ? 'Never true (a contradiction)' : `True in ${t.minterms.length} of ${t.rows.length} rows`) : ''
  const v = (b: boolean) => (bits ? (b ? '1' : '0') : b ? 'T' : 'F')
  const maxterms = t ? t.rows.map((_, i) => i).filter((i) => !t.minterms.includes(i)) : []

  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <div><Label>Logic expression</Label><Input value={expr} onChange={(e) => setExpr(e.target.value)} className="h-12 font-mono text-base" spellCheck={false} aria-label="Logic expression" /></div>
          <div className="flex flex-wrap gap-1.5">{EXAMPLES.map((x) => <button key={x} type="button" className="rounded-full border border-border px-2.5 py-1 font-mono text-[11px] text-muted hover:text-fg cursor-pointer" onClick={() => setExpr(x)}>{x}</button>)}</div>
          <ErrorNote error={r.err ?? null} />
          {t && (
            <div className="max-h-[560px] overflow-auto rounded-2xl border border-border">
              <table className="w-full text-center font-mono text-sm">
                <thead className="sticky top-0 bg-surface-2"><tr><th className="px-2 py-1.5 text-xs text-muted">#</th>{t.vars.map((x) => <th key={x} className="px-3 py-1.5">{x}</th>)}<th className="border-l border-border px-3 py-1.5 text-accent">Result</th></tr></thead>
                <tbody>{t.rows.map((row, i) => <tr key={i} className={cn('border-t border-border', row.out && 'bg-accent/10')}><td className="px-2 py-1 text-xs text-muted">{i}</td>{row.vals.map((b, k) => <td key={k} className={cn('px-3 py-1', !b && 'text-muted')}>{v(b)}</td>)}<td className={cn('border-l border-border px-3 py-1 font-bold', row.out ? 'text-success' : 'text-muted')}>{v(row.out)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      }
      side={
        <>
          <Switch checked={bits} onChange={setBits} label="Show 1 and 0 (instead of T and F)" />
          {t && (
            <>
              <div><Label>Verdict</Label><p className="text-sm">{kind}</p></div>
              <div><Label>Simplest form</Label><div className="rounded-xl border border-border bg-surface-2/50 px-3 py-2 font-mono text-sm">{r.sop}</div><div className="mt-1.5"><CopyButton text={r.sop!} /></div></div>
              <div><Label>Minterms</Label><p className="break-all font-mono text-xs">Σm({t.minterms.join(', ') || 'none'})</p></div>
              <div><Label>Maxterms</Label><p className="break-all font-mono text-xs">ΠM({maxterms.join(', ') || 'none'})</p></div>
              <DlButton className="w-full" name="truth-table.csv" mime="text/csv" data={() => toCsv([[...t.vars, expr], ...t.rows.map((row) => [...row.vals.map(v), v(row.out)])])}>Download table (CSV)</DlButton>
            </>
          )}
          <p className="text-xs text-muted">Operators: and (&, ∧, ·), or (|, +, ∨), not (!, ~, ¬, or a ' after a letter), xor (^, ⊕), nand, nor, implies (-&gt;) and if and only if (&lt;-&gt;). Capital letters next to each other, like AB, mean A and B.</p>
        </>
      }
    />
  )
}
