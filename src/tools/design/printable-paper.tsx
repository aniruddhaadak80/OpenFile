import { useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { Button, Field, Input, Segmented, Select, Slider, Switch, ToolGrid, cn, useJob } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { PAPER_SIZES, paperPrims, paperSvg, type PaperKind, type PaperOpts } from '@/lib/b14/design'
import { SvgPreview } from '@/lib/b14/ui'

const KINDS: { id: PaperKind; label: string; spacing: number; hint: string }[] = [
  { id: 'graph', label: 'Graph', spacing: 5, hint: 'Square grid' },
  { id: 'dot', label: 'Dot grid', spacing: 5, hint: 'Bullet journal' },
  { id: 'lined', label: 'Lined', spacing: 7.1, hint: 'College ruled' },
  { id: 'engineering', label: 'Engineering', spacing: 2, hint: 'Fine grid, bold every 10' },
  { id: 'isometric', label: 'Isometric', spacing: 6, hint: '3D sketching' },
  { id: 'hex', label: 'Hexagon', spacing: 10, hint: 'Games, chemistry' },
  { id: 'handwriting', label: 'Handwriting', spacing: 6, hint: 'Primary school lines' },
  { id: 'calligraphy', label: 'Calligraphy', spacing: 8, hint: 'Slant guides' },
  { id: 'music', label: 'Music staff', spacing: 10, hint: 'Staff paper' },
  { id: 'polar', label: 'Polar', spacing: 8, hint: 'Circles and angles' },
]
const COLORS = [{ id: '#9BB7D4', label: 'Blue' }, { id: '#A3A3A3', label: 'Grey' }, { id: '#7CC4B8', label: 'Teal' }, { id: '#E6B566', label: 'Gold' }, { id: '#9DC37A', label: 'Green' }, { id: '#404040', label: 'Dark' }]

export default function PrintablePaper() {
  const [kind, setKind] = useState<PaperKind>('graph')
  const [paper, setPaper] = useState('A4')
  const [land, setLand] = useState(false)
  const [spacing, setSpacing] = useState(5)
  const [margin, setMargin] = useState(10)
  const [color, setColor] = useState(COLORS[0].id)
  const [weight, setWeight] = useState(20)
  const [major, setMajor] = useState(5)
  const [header, setHeader] = useState(false)
  const [marginLine, setMarginLine] = useState(true)
  const [pages, setPages] = useState(1)
  const [title, setTitle] = useState('')
  const { busy, run } = useJob()
  const [pw, ph] = PAPER_SIZES[paper]
  const [w, h] = land ? [ph, pw] : [pw, ph]
  const accent = useMemo(() => { const n = parseInt(color.slice(1), 16); const k = 0.62; return '#' + [16, 8, 0].map((s) => Math.round(((n >> s) & 255) * k).toString(16).padStart(2, '0')).join('') }, [color])
  const o: PaperOpts = { kind, w, h, margin, spacing, color, accent, weight: weight / 100, majorEvery: kind === 'engineering' ? 10 : major, header, marginLine }
  const svg = useMemo(() => paperSvg(o), [kind, w, h, margin, spacing, color, weight, major, header, marginLine])

  const pdf = () => run(async () => {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: [pw, ph], orientation: land ? 'landscape' : 'portrait' })
    const prims = paperPrims(o)
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
    for (let p = 0; p < pages; p++) {
      if (p) doc.addPage([pw, ph], land ? 'landscape' : 'portrait')
      for (const q of prims) {
        if (q.t === 'line') { doc.setDrawColor(...rgb(q.c)); doc.setLineWidth(q.w); doc.setLineDashPattern(q.dash ? [1.2, 1.2] : [], 0); doc.line(q.x1, q.y1, q.x2, q.y2) }
        else if (q.t === 'dot') { doc.setFillColor(...rgb(q.c)); doc.circle(q.x, q.y, q.r, 'F') }
        else { doc.setDrawColor(...rgb(q.c)); doc.setLineWidth(q.w); doc.setLineDashPattern([], 0); doc.circle(q.x, q.y, q.r, 'S') }
      }
      if (header && title) { doc.setFontSize(11); doc.setTextColor(...rgb(accent)); doc.text(title, margin, margin + 7) }
    }
    doc.setProperties({ title: `${KINDS.find((k) => k.id === kind)!.label} paper`, creator: 'OpenFile' })
    downloadBlob(doc.output('blob'), `${kind}-paper-${paper.toLowerCase()}${land ? '-landscape' : ''}.pdf`)
  })
  const unit = kind === 'music' ? 'staff height' : kind === 'hex' ? 'hexagon size' : kind === 'handwriting' ? 'line gap' : 'spacing'
  return (
    <ToolGrid
      main={<>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {KINDS.map((k) => (
            <button key={k.id} aria-pressed={kind === k.id} onClick={() => { setKind(k.id); setSpacing(k.spacing) }} className={cn('cursor-pointer rounded-xl border px-2.5 py-2 text-left transition', kind === k.id ? 'border-accent bg-accent/10' : 'border-border bg-surface hover:bg-surface-2')}>
              <div className="text-sm font-medium">{k.label}</div><div className="text-[11px] text-muted">{k.hint}</div>
            </button>
          ))}
        </div>
        <div className="mx-auto w-full max-w-xl"><SvgPreview svg={svg} label={`${kind} paper preview`} className="shadow-lg" /></div>
      </>}
      side={<>
        <Field label="Paper"><Select value={paper} onChange={setPaper} options={Object.keys(PAPER_SIZES).map((k) => ({ value: k, label: `${k} (${PAPER_SIZES[k][0]} x ${PAPER_SIZES[k][1]} mm)` }))} /></Field>
        <Field label="Direction"><Segmented value={land ? 'l' : 'p'} onChange={(v) => setLand(v === 'l')} options={[{ value: 'p', label: 'Portrait' }, { value: 'l', label: 'Landscape' }]} /></Field>
        <Slider label={`Line ${unit}`} value={spacing} onChange={setSpacing} min={kind === 'engineering' ? 1 : 2} max={kind === 'music' ? 20 : kind === 'polar' || kind === 'hex' ? 25 : 15} step={0.1} suffix=" mm" />
        <Slider label="Margin" value={margin} onChange={setMargin} min={0} max={30} suffix=" mm" />
        <Field label="Line colour"><div className="flex flex-wrap gap-1.5">{COLORS.map((c) => <button key={c.id} aria-label={c.label} aria-pressed={color === c.id} onClick={() => setColor(c.id)} className={`size-8 cursor-pointer rounded-full border-2 ${color === c.id ? 'border-accent' : 'border-border'}`} style={{ background: c.id }} />)}</div></Field>
        <Slider label="Line thickness" value={weight} onChange={setWeight} min={5} max={60} suffix="" />
        {kind === 'graph' && <Slider label="Bold line every" value={major} onChange={setMajor} min={0} max={10} suffix=" squares" />}
        {kind === 'lined' && <Switch checked={marginLine} onChange={setMarginLine} label="Margin line on the left" />}
        <Switch checked={header} onChange={setHeader} label="Header strip" />
        {header && <Field label="Header text"><Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 60))} placeholder="Name, date or subject" /></Field>}
        <Slider label="Pages" value={pages} onChange={setPages} min={1} max={50} />
        <Button size="lg" className="w-full" icon={<Printer className="size-5" />} onClick={pdf} loading={busy}>Download PDF</Button>
        <Button variant="outline" size="sm" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${kind}-paper.svg`)}>SVG</Button>
        <p className="text-xs text-muted">Print at 100% (Actual size) so the spacing stays true in millimetres.</p>
      </>}
    />
  )
}
