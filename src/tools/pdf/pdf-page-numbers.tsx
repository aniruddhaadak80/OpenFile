import { useState } from 'react'
import { Hash } from 'lucide-react'
import { Button, Dropzone, Field, Input, ResultCard, Select, Slider, Switch, ToolGrid, Progress, ErrorNote, useJob, Label } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { ColorInput, PositionPicker, FileBar, LivePreview, PDF_ACCEPT, PageScope, ops, readBytes, scopePages, usePdfDoc, FONTS_LIST } from './_core/kit'
import type { FontName, NumberFormat, Pos6, PageNumberOpts } from './_core/ops'

const FORMATS: { value: NumberFormat; label: string }[] = [
  { value: 'n', label: '1' }, { value: 'page-n', label: 'Page 1' }, { value: 'page-n-of', label: 'Page 1 of N' },
  { value: 'n-of', label: '1 / N' }, { value: 'dash', label: '- 1 -' }, { value: 'roman', label: 'i, ii, iii' },
]
const POS: Pos6[] = ['tl', 'tc', 'tr', 'bl', 'bc', 'br']

export default function PdfPageNumbers() {
  const [file, setFile] = useState<File | null>(null)
  const { numPages, error } = usePdfDoc(file)
  const [position, setPosition] = useState<Pos6>('bc')
  const [format, setFormat] = useState<NumberFormat>('n')
  const [start, setStart] = useState(1)
  const [size, setSize] = useState(11)
  const [margin, setMargin] = useState(28)
  const [color, setColor] = useState('#333333')
  const [font, setFont] = useState<FontName>('Helvetica')
  const [skipFirst, setSkipFirst] = useState(false)
  const [mirror, setMirror] = useState(false)
  const [scope, setScope] = useState<'all' | 'range'>('all')
  const [range, setRange] = useState('')
  const [preview, setPreview] = useState(0)
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setResult(null); setPreview(0) }

  const opts = (): PageNumberOpts => ({ position, format, start, size, margin, color, font, skipFirst, mirror, pages: scopePages(scope, range, numPages) })
  const deps = [position, format, start, size, margin, color, font, skipFirst, mirror, scope, range, numPages]

  const run = () => job.run(async (setP) => {
    if (!file) return
    const o = await ops()
    setResult(pdfBlob(await o.addPageNumbers(await readBytes(file), opts()))); setP(1); toast('Page numbers added', 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to number its pages" />

  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-numbered.pdf`} title="Page numbers added" onReset={reset} />}
      <ToolGrid
        main={error ? <div className="text-sm text-danger">{error}</div> : numPages ? (
          <LivePreview file={file} pageIndex={preview} setPageIndex={setPreview} total={numPages} deps={deps}
            build={async (b, pi, total) => (await ops()).addPageNumbers(b, { ...opts(), indexBase: pi, totalOverride: total })} />
        ) : null}
        side={<>
          <div className="grid grid-cols-[auto_1fr] items-start gap-4">
            <div><Label>Position</Label><PositionPicker value={position} onChange={(p) => { setPosition(p); setResult(null) }} options={POS} rows={2} /></div>
            <Field label="Format"><Select value={format} onChange={(v) => { setFormat(v); setResult(null) }} options={FORMATS} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start at"><Input type="number" value={start} min={0} onChange={(e) => { setStart(Math.max(0, parseInt(e.target.value) || 0)); setResult(null) }} /></Field>
            <Field label="Font"><Select value={font} onChange={(v) => { setFont(v); setResult(null) }} options={FONTS_LIST} /></Field>
          </div>
          <Slider label="Font size" value={size} min={6} max={36} onChange={(v) => { setSize(v); setResult(null) }} suffix="pt" />
          <Slider label="Margin from edge" value={margin} min={6} max={96} onChange={(v) => { setMargin(v); setResult(null) }} suffix="pt" />
          <Field label="Color"><ColorInput value={color} onChange={(v) => { setColor(v); setResult(null) }} /></Field>
          <div><Label>Pages</Label><PageScope total={numPages} mode={scope} setMode={(m) => { setScope(m); setResult(null) }} range={range} setRange={(r) => { setRange(r); setResult(null) }} /></div>
          <div className="space-y-2.5">
            <Switch checked={skipFirst} onChange={(v) => { setSkipFirst(v); setResult(null) }} label="Skip first page (cover)" />
            <Switch checked={mirror} onChange={(v) => { setMirror(v); setResult(null) }} label="Mirror left/right on even pages" />
          </div>
          {job.busy && <Progress value={job.progress} label="Numbering…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<Hash className="size-5" />} loading={job.busy} disabled={!numPages} onClick={run}>Add page numbers</Button>
        </>}
      />
    </div>
  )
}
