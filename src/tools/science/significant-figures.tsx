import { useMemo, useState } from 'react'
import { Card, Input, Label, Segmented, Select, Slider, ErrorNote } from '@/components/ui'
import { countSig, roundSig, sigOp } from '@/lib/cf/sci'
import { Stat, Stats } from '@/lib/cf/ui'

const EXAMPLES = ['0.004050', '1200', '1200.', '6.022 x 10^23', '100.0', '0.0']

export default function SignificantFigures() {
  const [mode, setMode] = useState<'count' | 'round' | 'calc'>('count')
  const [v, setV] = useState('0.004050')
  const [n, setN] = useState(3)
  const [a, setA] = useState('12.11'), [b, setB] = useState('3.4'), [op, setOp] = useState<'+' | '-' | '*' | '/'>('*')
  const info = useMemo(() => { try { return { r: countSig(v), e: null } } catch (e: any) { return { r: null, e: e.message as string } } }, [v])
  const calc = useMemo(() => { try { return { r: sigOp(a, op, b), e: null } } catch (e: any) { return { r: null, e: e.message as string } } }, [a, b, op])
  const digits = info.r ? new Set(info.r.digits) : null
  return (
    <div className="space-y-4">
      <Segmented value={mode} onChange={setMode} options={[{ value: 'count', label: 'Count' }, { value: 'round', label: 'Round' }, { value: 'calc', label: 'Calculate' }]} />
      {mode !== 'calc' ? (
        <Card className="space-y-4">
          <div><Label>Number</Label><Input value={v} onChange={(e) => setV(e.target.value)} className="font-mono text-lg" aria-label="Number" />
            <div className="mt-2 flex flex-wrap gap-1.5">{EXAMPLES.map((x) => <button key={x} onClick={() => setV(x)} className="rounded-lg border border-border px-2 py-0.5 font-mono text-xs text-muted hover:text-fg cursor-pointer">{x}</button>)}</div></div>
          <ErrorNote error={info.e} />
          {info.r && mode === 'count' && <>
            <div className="rounded-xl border border-border bg-surface-2/50 p-4 font-mono text-3xl tracking-wider" aria-label="Digits with significant ones marked">
              {(() => { let started = false, seen = 0; const sig = info.r!.sig; return v.trim().split('').map((ch, i) => { const isD = /\d/.test(ch); if (isD && ch !== '0') started = true; const on = isD && started && seen < sig && (++seen, true); return <span key={i} className={on ? 'text-accent' : 'text-muted/60'}>{ch}</span> }) })()}
            </div>
            <Stats><Stat label="Significant figures" value={info.r.sig} /><Stat label="Decimal places" value={info.r.decimals} /><Stat label="Scientific" value={<span className="text-base">{Number(info.r.normalized).toExponential(Math.max(0, info.r.sig - 1))}</span>} /></Stats>
            {info.r.ambiguous && <p className="text-sm text-warn">Trailing zeros without a decimal point are ambiguous. Write {v.trim()}. or use scientific notation if those zeros were measured.</p>}
            <p className="text-xs text-muted">Rules: non-zero digits always count, zeros between them count, leading zeros never count, trailing zeros count only after a decimal point.</p>
            {digits && null}
          </>}
          {info.r && mode === 'round' && <>
            <Slider label="Round to significant figures" value={n} onChange={setN} min={1} max={12} />
            <Stats cols={2}><Stat label="Rounded" value={roundSig(Number(info.r.normalized), n)} /><Stat label="Scientific" value={<span className="text-base">{Number(info.r.normalized).toExponential(n - 1)}</span>} /></Stats>
          </>}
        </Card>
      ) : (
        <Card className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <div><Label>First value</Label><Input aria-label="First value" value={a} onChange={(e) => setA(e.target.value)} className="font-mono" /></div>
            <label className="block"><Label>Operation</Label><Select value={op} onChange={setOp} options={[{ value: '+', label: '+ add' }, { value: '-', label: '- subtract' }, { value: '*', label: '× multiply' }, { value: '/', label: '÷ divide' }]} /></label>
            <div><Label>Second value</Label><Input aria-label="Second value" value={b} onChange={(e) => setB(e.target.value)} className="font-mono" /></div>
          </div>
          <ErrorNote error={calc.e} />
          {calc.r && <><Stats cols={2}><Stat label="Answer with correct sig figs" value={calc.r.text} tone="good" /><Stat label="Calculator answer" value={<span className="text-base">{calc.r.result}</span>} /></Stats><p className="text-sm text-muted">{calc.r.rule}</p></>}
        </Card>
      )}
    </div>
  )
}
