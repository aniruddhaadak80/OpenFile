import { useMemo, useState } from 'react'
import { Scaling } from 'lucide-react'
import { Button, Dropzone, ResultCard, Select, Segmented, Slider, ToolGrid, Progress, ErrorNote, Input, Field, useJob } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, LivePreview, PDF_ACCEPT, PageScope, scopePages, usePdfDoc } from './_core/kit'
import { core, readBytes, Note } from './_b1/ui'

const SIZES = [
  { value: 'a4', label: 'A4 (210 × 297 mm)' }, { value: 'letter', label: 'US Letter (8.5 × 11 in)' }, { value: 'legal', label: 'US Legal (8.5 × 14 in)' },
  { value: 'a3', label: 'A3 (297 × 420 mm)' }, { value: 'a5', label: 'A5 (148 × 210 mm)' }, { value: 'a6', label: 'A6 (105 × 148 mm)' },
  { value: 'b5', label: 'B5 (176 × 250 mm)' }, { value: 'tabloid', label: 'Tabloid (11 × 17 in)' }, { value: 'executive', label: 'Executive (7.25 × 10.5 in)' }, { value: 'custom', label: 'Custom size' },
]
const MM = 72 / 25.4

export default function ResizePdfPages() {
  const [file, setFile] = useState<File | null>(null)
  const { numPages, error } = usePdfDoc(file)
  const [size, setSize] = useState('a4')
  const [cw, setCw] = useState(210), [ch, setCh] = useState(297)
  const [orientation, setOrientation] = useState<'auto' | 'portrait' | 'landscape'>('auto')
  const [fit, setFit] = useState<'fit' | 'fill' | 'stretch' | 'none'>('fit')
  const [margin, setMargin] = useState(0)
  const [align, setAlign] = useState<'center' | 'top'>('center')
  const [mode, setMode] = useState<'all' | 'range'>('all'), [range, setRange] = useState('')
  const [page, setPage] = useState(0)
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setResult(null); setPage(0) }

  const opts = useMemo(() => {
    return async () => {
      const C = await core()
      const dims: [number, number] = size === 'custom' ? [Math.max(20, cw) * MM, Math.max(20, ch) * MM] : C.SHEETS[size]
      return { size: dims, orientation, fit, margin: margin * MM, align }
    }
  }, [size, cw, ch, orientation, fit, margin, align])

  const run = () => job.run(async (setP) => {
    if (!file) return
    const C = await core()
    setP(0.2)
    const out = await C.resizePages(await readBytes(file), { ...(await opts()), pages: scopePages(mode, range, numPages) })
    setResult(pdfBlob(out)); setP(1); toast('Pages resized', 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to change its page size" />
  const change = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setResult(null) }

  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {error && <ErrorNote error={error} />}
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-resized.pdf`} originalSize={file.size} title="Resized PDF ready" onReset={reset} />}
      <ToolGrid
        main={numPages ? <LivePreview file={file} total={numPages} pageIndex={page} setPageIndex={setPage} deps={[opts]}
          build={async (bytes) => { const C = await core(); return C.resizePages(bytes, await opts()) }}
          note="The preview shows the selected page on its new sheet. Text and vector graphics stay sharp." /> : null}
        side={<>
          <Field label="Page size"><Select value={size} onChange={change(setSize)} options={SIZES} /></Field>
          {size === 'custom' && <div className="grid grid-cols-2 gap-2">
            <Field label="Width (mm)"><Input type="number" min={20} value={cw} onChange={(e) => { setCw(Number(e.target.value)); setResult(null) }} /></Field>
            <Field label="Height (mm)"><Input type="number" min={20} value={ch} onChange={(e) => { setCh(Number(e.target.value)); setResult(null) }} /></Field>
          </div>}
          <Field label="Orientation"><Segmented value={orientation} onChange={change(setOrientation)} options={[{ value: 'auto', label: 'Match page' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} /></Field>
          <Field label="How content fits"><Segmented value={fit} onChange={change(setFit)} options={[{ value: 'fit', label: 'Fit' }, { value: 'fill', label: 'Fill' }, { value: 'stretch', label: 'Stretch' }, { value: 'none', label: 'Actual size' }]} /></Field>
          <Slider label="Margin" value={margin} min={0} max={40} onChange={change(setMargin)} suffix=" mm" />
          <Field label="Vertical position"><Segmented value={align} onChange={change(setAlign)} options={[{ value: 'center', label: 'Centered' }, { value: 'top', label: 'Top' }]} /></Field>
          <div><div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Pages</div><PageScope total={numPages} mode={mode} setMode={change(setMode)} range={range} setRange={change(setRange)} /></div>
          <Note>Fit keeps the whole page visible. Fill covers the sheet and trims what spills over. Links and form fields are not carried over to resized pages.</Note>
          {job.busy && <Progress value={job.progress} label="Resizing…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<Scaling className="size-5" />} loading={job.busy} disabled={!numPages} onClick={run}>Resize pages</Button>
        </>}
      />
    </div>
  )
}
