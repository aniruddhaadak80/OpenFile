import { useMemo, useState } from 'react'
import { Card, CopyButton, Input, Label, Slider, ErrorNote } from '@/components/ui'
import { parseNumberLoose, sciForms } from '@/lib/cf/sci'

const PREFIX: [number, string, string][] = [[24, 'Y', 'yotta'], [21, 'Z', 'zetta'], [18, 'E', 'exa'], [15, 'P', 'peta'], [12, 'T', 'tera'], [9, 'G', 'giga'], [6, 'M', 'mega'], [3, 'k', 'kilo'], [0, '', ''], [-3, 'm', 'milli'], [-6, 'µ', 'micro'], [-9, 'n', 'nano'], [-12, 'p', 'pico'], [-15, 'f', 'femto'], [-18, 'a', 'atto']]

export default function ScientificNotation() {
  const [v, setV] = useState('0.000045600')
  const [sig, setSig] = useState(4)
  const r = useMemo(() => { try { const x = parseNumberLoose(v); return { x, f: sciForms(x, sig), e: null } } catch (e: any) { return { x: 0, f: null, e: e.message as string } } }, [v, sig])
  const pre = r.f ? PREFIX.find(([p]) => p === Math.floor(r.f!.exponent / 3) * 3) : null
  const rows = r.f ? [['Scientific', r.f.sci], ['E notation', r.f.e], ['Engineering', r.f.eng], ['Standard form', r.f.plain], ['LaTeX', r.f.latex], ...(pre && pre[1] ? [['SI prefix', `${(r.x / 10 ** pre[0]).toPrecision(sig)} ${pre[1]} (${pre[2]})`]] : [])] : []
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div><Label>Number (any form: 45600000, 4.56e7, 4.56 x 10^7, 0.0000123)</Label><Input value={v} onChange={(e) => setV(e.target.value)} className="font-mono text-lg" aria-label="Number" /></div>
        <Slider label="Significant figures" value={sig} onChange={setSig} min={1} max={15} />
        <ErrorNote error={r.e} />
      </Card>
      {r.f && <Card className="divide-y divide-border p-0">
        {rows.map(([k, val]) => <div key={k} className="flex items-center gap-3 px-4 py-3"><div className="w-36 shrink-0 text-xs font-medium uppercase tracking-wide text-muted">{k}</div><div className="min-w-0 flex-1 break-all font-mono text-lg">{val}</div><CopyButton text={val} /></div>)}
        <div className="px-4 py-3 text-sm text-muted">Mantissa {r.f.mantissa}, exponent {r.f.exponent}. The decimal point moved {Math.abs(r.f.exponent)} place{Math.abs(r.f.exponent) === 1 ? '' : 's'} to the {r.f.exponent >= 0 ? 'left' : 'right'}.</div>
      </Card>}
    </div>
  )
}
