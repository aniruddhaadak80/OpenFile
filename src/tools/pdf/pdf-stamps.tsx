import { useState } from 'react'
import { Stamp } from 'lucide-react'
import { Button, Dropzone, Field, Input, ResultCard, Select, Slider, Switch, ToolGrid, Progress, ErrorNote, useJob, Label, cn } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { ColorInput, PositionPicker, LivePreview, FileBar, PDF_ACCEPT, PageScope, readBytes, scopePages, usePdfDoc, FONTS_LIST } from './_core/kit'
import { stampPdf, STAMP_PRESETS, type Pos9, type Font } from '@/lib/b14/pdf'

const POS: Pos9[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br']
const today = () => new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export default function PdfStamps() {
  const [file, setFile] = useState<File | null>(null)
  const { numPages, error } = usePdfDoc(file)
  const [text, setText] = useState('APPROVED')
  const [color, setColor] = useState('#0F9F6E')
  const [sub, setSub] = useState(today())
  const [subOn, setSubOn] = useState(true)
  const [position, setPosition] = useState<Pos9>('tr')
  const [size, setSize] = useState(36)
  const [angle, setAngle] = useState(-12)
  const [opacity, setOpacity] = useState(85)
  const [margin, setMargin] = useState(48)
  const [dbl, setDbl] = useState(true)
  const [font, setFont] = useState<Font>('Helvetica-Bold')
  const [scope, setScope] = useState<'all' | 'range'>('range')
  const [range, setRange] = useState('1')
  const [preview, setPreview] = useState(0)
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()
  const o = () => ({ text: text || 'STAMP', sub: subOn ? sub : '', color, position, size, angle, opacity: opacity / 100, margin, double: dbl, font, pages: scopePages(scope, range, numPages) })
  const deps = [text, sub, subOn, color, position, size, angle, opacity, margin, dbl, font]
  const run = () => job.run(async (setP) => { if (!file) return; setResult(pdfBlob(await stampPdf(await readBytes(file), o()))); setP(1) })
  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to stamp" sub="Approved, Paid, Draft, Confidential or your own words, with today's date, like a real rubber stamp." />
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={() => { setFile(null); setResult(null) }} />
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-stamped.pdf`} title="Stamp added" onReset={() => setResult(null)} />}
      <ToolGrid
        main={error ? <div className="text-sm text-danger">{error}</div> : numPages ? <LivePreview file={file} pageIndex={preview} setPageIndex={setPreview} total={numPages} deps={deps} build={async (b) => stampPdf(b, { ...o(), pages: [0] })} note="The preview shows the stamp on this page. Use Pages to choose where it really goes." /> : null}
        side={<>
          <div><Label>Quick stamps</Label><div className="flex flex-wrap gap-1.5">{STAMP_PRESETS.map((p) => <button key={p.text} type="button" onClick={() => { setText(p.text); setColor(p.color); setResult(null) }} className={cn('cursor-pointer rounded-md border-2 px-2 py-0.5 text-[11px] font-bold tracking-wider', text === p.text ? 'bg-surface-2' : 'opacity-80 hover:opacity-100')} style={{ borderColor: p.color, color: p.color }}>{p.text}</button>)}</div></div>
          <Field label="Stamp text"><Input value={text} onChange={(e) => { setText(e.target.value.toUpperCase()); setResult(null) }} /></Field>
          <Switch checked={subOn} onChange={setSubOn} label="Small line under it" />
          {subOn && <Field label="Small line"><Input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Date, name or reference" /></Field>}
          <div className="grid grid-cols-[auto_1fr] items-start gap-4"><div><Label>Position</Label><PositionPicker value={position} onChange={setPosition} options={POS} rows={3} /></div><div className="space-y-3"><Field label="Colour"><ColorInput value={color} onChange={setColor} /></Field><Field label="Font"><Select value={font} onChange={setFont} options={FONTS_LIST} /></Field></div></div>
          <Slider label="Size" value={size} onChange={setSize} min={12} max={96} suffix="pt" />
          <Slider label="Angle" value={angle} onChange={setAngle} min={-45} max={45} suffix="°" />
          <Slider label="Opacity" value={opacity} onChange={setOpacity} min={20} max={100} suffix="%" />
          <Slider label="Margin" value={margin} onChange={setMargin} min={10} max={200} suffix="pt" />
          <Switch checked={dbl} onChange={setDbl} label="Double border" />
          <div><Label>Pages</Label><PageScope total={numPages} mode={scope} setMode={setScope} range={range} setRange={setRange} /></div>
          {job.busy && <Progress value={job.progress} label="Stamping" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<Stamp className="size-5" />} loading={job.busy} disabled={!numPages} onClick={run}>Stamp PDF</Button>
        </>}
      />
    </div>
  )
}
