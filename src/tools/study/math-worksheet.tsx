import { useMemo, useState } from 'react'
import { FileDown, RefreshCw } from 'lucide-react'
import { Button, Card, Input, Label, Segmented, Slider, Switch } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { makeProblems, type Op } from '@/lib/cf/study'
import { worksheetPdf } from '@/lib/cf/print'

const LEVELS = [{ id: 'k', label: 'Adding to 10', ops: ['+'] as Op[], min: 0, max: 10 }, { id: 'g1', label: 'Add and take away to 20', ops: ['+', '-'] as Op[], min: 0, max: 20 }, { id: 'g2', label: 'Two digit sums', ops: ['+', '-'] as Op[], min: 10, max: 99 }, { id: 'times', label: 'Times tables', ops: ['×'] as Op[], min: 2, max: 12 }, { id: 'div', label: 'Division facts', ops: ['÷'] as Op[], min: 2, max: 12 }, { id: 'mixed', label: 'All four', ops: ['+', '-', '×', '÷'] as Op[], min: 2, max: 50 }]

export default function MathWorksheet() {
  const [ops, setOps] = useState<Op[]>(['+', '-']), [min, setMin] = useState(0), [max, setMax] = useState(20)
  const [count, setCount] = useState(40), [cols, setCols] = useState(4), [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6))
  const [noNeg, setNoNeg] = useState(true), [vertical, setVertical] = useState(false), [name, setName] = useState(true), [key, setKey] = useState(true)
  const [title, setTitle] = useState('Practice sheet'), [size, setSize] = useState<'a4' | 'letter'>('a4'), [sheets, setSheets] = useState(1)
  const probs = useMemo(() => (ops.length ? makeProblems({ ops, min, max, count, seed, noNegative: noNeg }) : []), [ops, min, max, count, seed, noNeg])
  const toggle = (o: Op) => setOps((x) => (x.includes(o) ? x.filter((y) => y !== o) : [...x, o]))
  const make = async () => {
    const { PDFDocument } = await import('pdf-lib')
    const out = await PDFDocument.create()
    for (let i = 0; i < sheets; i++) { const b = await worksheetPdf({ title: sheets > 1 ? `${title} ${i + 1}` : title, problems: i ? makeProblems({ ops, min, max, count, seed: seed + i * 7919, noNegative: noNeg }) : probs, cols, name, key, size, vertical }); const d = await PDFDocument.load(await b.arrayBuffer()); for (const p of await out.copyPages(d, d.getPageIndices())) out.addPage(p) }
    downloadBlob(new Blob([await out.save() as BlobPart], { type: 'application/pdf' }), 'math-worksheet.pdf')
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card className="min-w-0">
        <div className="mb-3 flex items-baseline justify-between"><div className="font-display text-xl font-bold">{title}</div><div className="text-xs text-muted">Name ________  Date ______</div></div>
        <div className="grid gap-x-6 gap-y-3 font-mono text-sm" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {probs.slice(0, 60).map((p, i) => vertical ? <div key={i} className="text-right"><span className="float-left text-[10px] text-muted">{i + 1}.</span><div>{p.a}</div><div className="border-b border-fg/60">{p.op} {p.b}</div><div className="text-success/70">{key ? p.answer : ''}</div></div> : <div key={i}><span className="mr-1 text-[10px] text-muted">{i + 1}.</span>{p.text} <span className="text-success/70">{key ? p.answer : '____'}</span></div>)}
        </div>
        {probs.length > 60 && <p className="mt-2 text-xs text-muted">Showing 60 of {probs.length} problems.</p>}
      </Card>
      <Card className="space-y-4 self-start">
        <div><Label>Quick levels</Label><div className="flex flex-wrap gap-1.5">{LEVELS.map((l) => <button key={l.id} onClick={() => { setOps(l.ops); setMin(l.min); setMax(l.max) }} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-fg cursor-pointer">{l.label}</button>)}</div></div>
        <div><Label>Operations</Label><div className="flex gap-1.5">{(['+', '-', '×', '÷'] as Op[]).map((o) => <button key={o} aria-pressed={ops.includes(o)} onClick={() => toggle(o)} className={`size-10 rounded-xl border font-mono text-lg cursor-pointer ${ops.includes(o) ? 'border-accent bg-accent/10' : 'border-border text-muted'}`}>{o}</button>)}</div></div>
        <div className="grid grid-cols-2 gap-2"><div><Label>Smallest number</Label><Input aria-label="Smallest number" type="number" value={min} onChange={(e) => setMin(+e.target.value)} /></div><div><Label>Largest number</Label><Input aria-label="Largest number" type="number" value={max} onChange={(e) => setMax(Math.max(+e.target.value, min))} /></div></div>
        <Slider label="Problems" value={count} onChange={setCount} min={5} max={120} /><Slider label="Columns" value={cols} onChange={setCols} min={1} max={5} />
        <Switch checked={noNeg} onChange={setNoNeg} label="No negative answers" /><Switch checked={vertical} onChange={setVertical} label="Stacked (column) layout" /><Switch checked={name} onChange={setName} label="Name and score line" /><Switch checked={key} onChange={setKey} label="Answer key page" />
        <div><Label>Title</Label><Input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <Slider label="Different sheets" value={sheets} onChange={setSheets} min={1} max={20} />
        <div><Label>Paper</Label><Segmented value={size} onChange={setSize} options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }]} /></div>
        <div className="grid grid-cols-[auto_1fr] gap-2"><Button variant="outline" icon={<RefreshCw className="size-4" />} onClick={() => setSeed(Math.floor(Math.random() * 1e6))} aria-label="New problems">New</Button><Button icon={<FileDown className="size-4" />} disabled={!probs.length} onClick={make}>Download PDF</Button></div>
      </Card>
    </div>
  )
}
