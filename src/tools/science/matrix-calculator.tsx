import { useMemo, useState } from 'react'
import { Label, Select, Switch, Textarea, ToolGrid, ErrorNote, CopyButton } from '@/components/ui'
import { useLib } from '@/tools/dev/_b5/shell'
import { rrefDecimal, qStr, qNum } from '@/lib/bcat/science'

type Op = 'det' | 'inv' | 'transpose' | 'rank' | 'rref' | 'eigs' | 'add' | 'sub' | 'mul' | 'solve' | 'pow2'
const OPS: { value: Op; label: string; two?: boolean }[] = [
  { value: 'det', label: 'Determinant of A' }, { value: 'inv', label: 'Inverse of A' }, { value: 'transpose', label: 'Transpose of A' }, { value: 'rank', label: 'Rank of A' }, { value: 'rref', label: 'Row reduce A (RREF)' }, { value: 'eigs', label: 'Eigenvalues of A' }, { value: 'pow2', label: 'A squared' },
  { value: 'add', label: 'A + B', two: true }, { value: 'sub', label: 'A - B', two: true }, { value: 'mul', label: 'A × B', two: true }, { value: 'solve', label: 'Solve A x = B', two: true },
]
export function parseMatrix(s: string): number[][] {
  const rows = s.trim().replace(/[[\]]/g, '\n').split(/\n|;/).map((r) => r.trim()).filter(Boolean).map((r) => r.split(/[\s,]+/).filter(Boolean).map((v) => { const x = v.includes('/') ? +v.split('/')[0] / +v.split('/')[1] : +v; if (!isFinite(x)) throw new Error(`Not a number: ${v}`); return x }))
  if (!rows.length) throw new Error('Type a matrix, one row per line.')
  if (rows.some((r) => r.length !== rows[0].length)) throw new Error('Every row needs the same number of values.')
  return rows
}
const nice = (x: number) => (Math.abs(x) < 1e-10 ? '0' : Number.isInteger(+x.toFixed(10)) ? String(Math.round(x)) : (+x.toPrecision(8)).toString())

// snap float noise first: lusolve gives 1.9999999999999998, which otherwise printed as 4/2 (live, Oct 2026)
export function toFrac(x: number) { const r = Math.round(x); if (Math.abs(x - r) < 1e-9) return String(r === 0 ? 0 : r); for (let d = 2; d <= 1000; d++) { const n = Math.round(x * d); if (Math.abs(n / d - x) < 1e-9) return `${n}/${d}` } return nice(x) }

function MatrixView({ m, frac }: { m: (number | string)[][]; frac: boolean }) {
  return (
    <div className="inline-block border-x-2 border-fg/60 px-2 py-1">
      <table className="font-mono text-sm"><tbody>{m.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className="px-2 py-0.5 text-right">{typeof v === 'number' ? (frac ? toFrac(v) : nice(v)) : v}</td>)}</tr>)}</tbody></table>
    </div>
  )
}

export default function MatrixCalculator() {
  const math = useLib('mathjs', () => import('mathjs'))
  const [a, setA] = useState('2 1 -1\n-3 -1 2\n-2 1 2')
  const [b, setB] = useState('8\n-11\n-3')
  const [op, setOp] = useState<Op>('solve')
  const [frac, setFrac] = useState(true)
  const two = OPS.find((o) => o.value === op)?.two

  const res = useMemo((): { scalar?: string; m?: (number | string)[][]; list?: string[]; err?: string } | null => {
    if (!math) return null
    try {
      const A = parseMatrix(a), B = two ? parseMatrix(b) : null
      const sq = () => { if (A.length !== A[0].length) throw new Error('A must be square for this.') }
      switch (op) {
        case 'det': sq(); return { scalar: nice(math.det(A)) }
        case 'inv': sq(); if (Math.abs(math.det(A)) < 1e-12) throw new Error('A has no inverse (its determinant is 0).'); return { m: math.inv(A) as number[][] }
        case 'transpose': return { m: math.transpose(A) as number[][] }
        case 'rank': { const R = rrefDecimal(A); return { scalar: String(R.filter((r) => r.some((v) => v[0] !== 0n)).length) } }
        case 'rref': { const R = rrefDecimal(A); return { m: R.map((r) => r.map((v) => (frac ? qStr(v) : nice(qNum(v))))) } }
        case 'pow2': sq(); return { m: math.multiply(A, A) as number[][] }
        case 'eigs': {
          sq()
          const e: any = math.eigs(A)
          const vals = (e.values?.toArray?.() ?? e.values) as any[]
          return { list: vals.map((v: any) => (typeof v === 'number' ? nice(v) : math.format(v, { precision: 8 }))) }
        }
        case 'add': case 'sub': if (A.length !== B!.length || A[0].length !== B![0].length) throw new Error('A and B must be the same size.'); return { m: (op === 'add' ? math.add(A, B!) : math.subtract(A, B!)) as number[][] }
        case 'mul': if (A[0].length !== B!.length) throw new Error(`A has ${A[0].length} columns but B has ${B!.length} rows.`); return { m: math.multiply(A, B!) as number[][] }
        case 'solve': { sq(); if (B!.length !== A.length) throw new Error('B needs one row per row of A.'); if (Math.abs(math.det(A)) < 1e-12) throw new Error('No single solution: A is singular.'); return { m: math.lusolve(A, B!) as number[][] } }
      }
    } catch (e: any) { return { err: e.message } }
    return null
  }, [math, a, b, op, frac, two])
  const text = res?.scalar ?? res?.list?.join(', ') ?? res?.m?.map((r) => r.map((v) => (typeof v === 'number' ? (frac ? toFrac(v) : nice(v)) : v)).join('\t')).join('\n') ?? ''

  return (
    <ToolGrid
      main={
        <div className="space-y-4">
          <div className={two ? 'grid gap-3 sm:grid-cols-2' : ''}>
            <div><Label>Matrix A</Label><Textarea value={a} onChange={(e) => setA(e.target.value)} className="min-h-32 font-mono" spellCheck={false} aria-label="Matrix A" /></div>
            {two && <div><Label>Matrix B</Label><Textarea value={b} onChange={(e) => setB(e.target.value)} className="min-h-32 font-mono" spellCheck={false} aria-label="Matrix B" /></div>}
          </div>
          <ErrorNote error={res?.err ?? null} />
          {res && !res.err && (
            <div className="space-y-2 rounded-2xl border border-border bg-surface p-4">
              <Label>{OPS.find((o) => o.value === op)?.label}</Label>
              {res.scalar != null && <div className="font-display text-3xl font-semibold">{res.scalar}</div>}
              {res.list && <div className="font-mono text-lg">{res.list.map((v, i) => <div key={i}>λ{i + 1} = {v}</div>)}</div>}
              {res.m && <div className="overflow-auto"><MatrixView m={res.m} frac={frac} /></div>}
              <CopyButton text={text} />
            </div>
          )}
        </div>
      }
      side={
        <>
          <label className="block"><Label>Operation</Label><Select value={op} onChange={setOp} options={OPS.map((o) => ({ value: o.value, label: o.label }))} /></label>
          <Switch checked={frac} onChange={setFrac} label="Show fractions" />
          <p className="text-xs text-muted">Type one row per line, values separated by spaces or commas. Fractions like 1/3 are fine. Row reduction and rank use exact fractions, so there is no rounding error.</p>
        </>
      }
    />
  )
}
