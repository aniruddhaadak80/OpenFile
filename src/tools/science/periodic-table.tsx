import { useMemo, useState } from 'react'
import { Input, Label, cn } from '@/components/ui'
import { ELEMENTS, CAT_NAME, shellCounts, type ElCat, type Element } from '@/lib/bcat/science'
import { pal } from '@/lib/bcat/kit'

const CATS = Object.keys(CAT_NAME) as ElCat[]
const color = (c: ElCat) => pal(CATS.indexOf(c))
const shells = shellCounts

function Atom({ el }: { el: Element }) {
  const sh = shells(el.z)
  return (
    <svg viewBox="-60 -60 120 120" className="size-36" aria-label={`Bohr model of ${el.name}`}>
      <circle r="9" fill={color(el.cat)} />
      {sh.map((n, i) => { const r = 16 + i * 7; return <g key={i}><circle r={r} fill="none" stroke="currentColor" strokeOpacity=".25" />{Array.from({ length: Math.min(n, 32) }, (_, k) => { const a = (k / n) * Math.PI * 2; return <circle key={k} cx={Math.cos(a) * r} cy={Math.sin(a) * r} r="1.6" fill="#F5A524" /> })}</g> })}
    </svg>
  )
}

export default function PeriodicTable() {
  const [sel, setSel] = useState<Element>(ELEMENTS[5])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<ElCat | null>(null)
  const match = useMemo(() => { const t = q.trim().toLowerCase(); return (e: Element) => (!t || e.name.toLowerCase().includes(t) || e.symbol.toLowerCase() === t || String(e.z) === t) && (!cat || e.cat === cat) }, [q, cat])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, symbol or number" aria-label="Search elements" className="max-w-xs" />
        <div className="flex flex-wrap gap-1.5">{CATS.map((c) => <button key={c} type="button" onClick={() => setCat(cat === c ? null : c)} aria-pressed={cat === c} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] cursor-pointer', cat === c ? 'border-accent bg-accent/10' : 'border-border text-muted hover:text-fg')}><span className="size-2 rounded-full" style={{ background: color(c) }} />{CAT_NAME[c]}</button>)}</div>
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[860px] gap-1" style={{ gridTemplateColumns: 'repeat(18, minmax(0, 1fr))', gridTemplateRows: 'repeat(10, auto)' }}>
          {ELEMENTS.map((e) => (
            <button key={e.z} type="button" onClick={() => setSel(e)} title={e.name}
              style={{ gridRow: e.row, gridColumn: e.col, borderColor: sel.z === e.z ? '#F5A524' : undefined, background: `color-mix(in oklab, ${color(e.cat)} ${match(e) ? 22 : 5}%, transparent)`, marginTop: e.row === 9 ? 10 : undefined }}
              className={cn('aspect-square rounded-md border border-border p-0.5 text-left transition hover:scale-110 hover:z-10 cursor-pointer', !match(e) && 'opacity-30', sel.z === e.z && 'ring-2 ring-accent')}>
              <div className="text-[8px] leading-none text-muted">{e.z}</div>
              <div className="text-center text-sm font-bold leading-tight">{e.symbol}</div>
              <div className="truncate text-center text-[7px] leading-none text-muted">{e.mass.toFixed(e.mass < 100 ? 2 : 1)}</div>
            </button>
          ))}
          <div style={{ gridRow: 6, gridColumn: 3 }} className="grid place-items-center text-[9px] text-muted">57-71</div>
          <div style={{ gridRow: 7, gridColumn: 3 }} className="grid place-items-center text-[9px] text-muted">89-103</div>
        </div>
      </div>
      <div className="grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-4">
          <div className="grid size-28 place-items-center rounded-2xl border-2" style={{ borderColor: color(sel.cat), background: `color-mix(in oklab, ${color(sel.cat)} 15%, transparent)` }}>
            <div className="text-center"><div className="text-xs text-muted">{sel.z}</div><div className="font-display text-4xl font-bold">{sel.symbol}</div><div className="text-[11px] text-muted">{sel.mass}</div></div>
          </div>
          <Atom el={sel} />
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div className="col-span-2 font-display text-2xl font-semibold">{sel.name}</div>
          <div><Label>Group</Label>{sel.group ?? (sel.cat === 'lanthanide' ? 'Lanthanides' : 'Actinides')}</div>
          <div><Label>Period</Label>{sel.period}</div>
          <div><Label>Category</Label>{CAT_NAME[sel.cat]}</div>
          <div><Label>Atomic mass</Label>{sel.mass} u</div>
          <div className="col-span-2"><Label>Electron configuration</Label><span className="font-mono">{sel.config.replace(/([spdf])(\d+)/g, (_m, o, n) => o + n.split('').map((c: string) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join(''))}</span></div>
          <div className="col-span-2"><Label>Electrons per shell</Label><span className="font-mono">{shells(sel.z).join(', ')}</span></div>
        </div>
      </div>
      <p className="text-xs text-muted">Masses are standard atomic weights. For radioactive elements without a stable isotope, the mass number of the longest-lived isotope is shown.</p>
    </div>
  )
}
