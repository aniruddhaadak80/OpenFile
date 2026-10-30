import { useMemo, useState } from 'react'
import { Dices, Download, ImageDown } from 'lucide-react'
import { Button, CopyButton, Field, Input, Segmented, Select, Slider, Switch, ToolGrid } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { shapeSvg, type ShapeOpts } from '@/lib/b14/design'
import { SvgPreview } from '@/lib/b14/ui'

type Kind = ShapeOpts['kind']
const PAIRS = [['#F5A524', '#F97316'], ['#14B8A6', '#38BDF8'], ['#84CC16', '#10B981'], ['#22D3EE', '#0EA5E9'], ['#FBBF24', '#EF4444'], ['#F5F3EE', '#9CA3AF']]
const SIZES: Record<Kind, string[]> = { blob: ['600x600', '1000x1000'], 'layered-blob': ['600x600', '1000x1000'], wave: ['1440x320', '1920x400', '1440x560', '900x1600'], scatter: ['1600x900', '1080x1080', '1920x1080'] }

export default function SvgBlobWave() {
  const [kind, setKind] = useState<Kind>('blob')
  const [seed, setSeed] = useState(7)
  const [size, setSize] = useState('600x600')
  const [pair, setPair] = useState(0)
  const [c1, setC1] = useState(PAIRS[0][0])
  const [c2, setC2] = useState(PAIRS[0][1])
  const [bg, setBg] = useState('none')
  const [gradient, setGradient] = useState(true)
  const [edges, setEdges] = useState(7)
  const [growth, setGrowth] = useState(55)
  const [layers, setLayers] = useState(3)
  const [peaks, setPeaks] = useState(4)
  const [amp, setAmp] = useState(60)
  const [top, setTop] = useState(false)
  const [count, setCount] = useState(8)
  const [stroke, setStroke] = useState(false)
  const [w, h] = size.split('x').map(Number)
  const svg = useMemo(() => shapeSvg({ kind, seed, w, h, c1, c2, bg, gradient, edges, growth: growth / 100, layers, peaks, amp: amp / 100, top, count, stroke }), [kind, seed, w, h, c1, c2, bg, gradient, edges, growth, layers, peaks, amp, top, count, stroke])
  const setK = (k: Kind) => { setKind(k); setSize(SIZES[k][0]) }
  const png = async () => {
    const u = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    try { const img = new Image(); img.src = u; await img.decode(); const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); c.toBlob((b) => b && downloadBlob(b, `${kind}-${seed}.png`), 'image/png') } finally { setTimeout(() => URL.revokeObjectURL(u), 1000) }
  }
  const css = `background-image: url("data:image/svg+xml,${encodeURIComponent(svg)}");\nbackground-size: cover;`
  return (
    <ToolGrid
      main={<>
        <SvgPreview svg={svg} dark={bg === 'none'} className={bg === 'none' ? 'checker' : ''} label={`${kind} shape`} />
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<Dices className="size-4" />} onClick={() => setSeed(Math.floor(Math.random() * 1e6))}>New shape</Button>
          <span className="text-xs text-muted">Seed {seed}. The same seed and settings always give the same shape.</span>
        </div>
      </>}
      side={<>
        <Field label="Shape"><Segmented value={kind} onChange={setK} options={[{ value: 'blob', label: 'Blob' }, { value: 'layered-blob', label: 'Rings' }, { value: 'wave', label: 'Waves' }, { value: 'scatter', label: 'Scatter' }]} /></Field>
        <Field label="Size"><Select value={size} onChange={setSize} options={SIZES[kind].map((s) => ({ value: s, label: s.replace('x', ' x ') + ' px' }))} /></Field>
        <Field label="Colours"><div className="flex flex-wrap gap-1.5">{PAIRS.map((p, i) => <button key={i} aria-label={`Colour pair ${i + 1}`} aria-pressed={pair === i} onClick={() => { setPair(i); setC1(p[0]); setC2(p[1]) }} className={`size-8 cursor-pointer rounded-lg border-2 ${pair === i ? 'border-accent' : 'border-border'}`} style={{ background: `linear-gradient(135deg,${p[0]},${p[1]})` }} />)}</div></Field>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted">From<Input type="color" value={c1} onChange={(e) => setC1(e.target.value)} className="h-9 p-1" /></label>
          <label className="text-xs text-muted">To<Input type="color" value={c2} onChange={(e) => setC2(e.target.value)} className="h-9 p-1" /></label>
        </div>
        {(kind === 'blob' || kind === 'scatter') && <Switch checked={gradient} onChange={setGradient} label="Gradient fill" />}
        <Field label="Background"><Segmented value={bg} onChange={setBg} options={[{ value: 'none', label: 'None' }, { value: '#0B0D10', label: 'Black' }, { value: '#FFFFFF', label: 'White' }, { value: '#F5F1E8', label: 'Cream' }]} /></Field>
        {kind !== 'wave' && <><Slider label="Points" value={edges} onChange={setEdges} min={3} max={16} /><Slider label="Wobble" value={growth} onChange={setGrowth} min={0} max={100} suffix="%" /></>}
        {(kind === 'wave' || kind === 'layered-blob') && <Slider label="Layers" value={layers} onChange={setLayers} min={1} max={6} />}
        {kind === 'wave' && <><Slider label="Peaks" value={peaks} onChange={setPeaks} min={1} max={10} /><Slider label="Height" value={amp} onChange={setAmp} min={0} max={100} suffix="%" /><Switch checked={top} onChange={setTop} label="Wave at the top" /></>}
        {kind === 'scatter' && <Slider label="How many" value={count} onChange={setCount} min={2} max={30} />}
        {kind === 'blob' && <Switch checked={stroke} onChange={setStroke} label="Outline only" />}
        <Button size="lg" className="w-full" icon={<Download className="size-5" />} onClick={() => downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${kind}-${seed}.svg`)}>Download SVG</Button>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" icon={<ImageDown className="size-4" />} onClick={png}>PNG (2x)</Button>
          <CopyButton text={svg} label="Copy SVG" />
          <CopyButton text={css} label="Copy CSS" />
        </div>
        <p className="text-xs text-muted">SVG size: {(svg.length / 1024).toFixed(1)} KB</p>
      </>}
    />
  )
}
