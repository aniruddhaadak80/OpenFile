import { useEffect, useRef, useState } from 'react'
import { Palette, Plus, X } from 'lucide-react'
import { Button, Dropzone, ResultCard, Segmented, Slider, ToolGrid, Progress, ErrorNote, Field, Spinner, useJob } from '@/components/ui'
import { pdfBlob, rasterizePdf, renderPage } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT, PageStepper, usePdfDoc } from './_core/kit'
import { Note } from './_b1/ui'
import { adjustPixels, hexRgb, type ColorOpts } from './_b1/pixels'

type Rep = { from: string; to: string; tolerance: number }
const MODES = [
  { value: 'none', label: 'Original' }, { value: 'dark', label: 'Dark mode' }, { value: 'invert', label: 'Invert' },
  { value: 'grayscale', label: 'Grayscale' }, { value: 'sepia', label: 'Sepia' }, { value: 'bw', label: 'Black & white' },
] as const

export default function PdfAdjustColors() {
  const [file, setFile] = useState<File | null>(null)
  const { doc, numPages, error } = usePdfDoc(file)
  const [page, setPage] = useState(0)
  const [mode, setMode] = useState<ColorOpts['mode']>('dark')
  const [brightness, setBrightness] = useState(0), [contrast, setContrast] = useState(0), [saturation, setSaturation] = useState(0)
  const [threshold, setThreshold] = useState(160)
  const [reps, setReps] = useState<Rep[]>([])
  const [dpi, setDpi] = useState(150)
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const base = useRef<ImageData | null>(null)
  const [ready, setReady] = useState(false)
  const reset = () => { setFile(null); setResult(null); setPage(0); setReps([]) }
  const opts = (): ColorOpts => ({ mode, brightness, contrast, saturation, threshold, replace: reps.map((r) => ({ from: hexRgb(r.from), to: hexRgb(r.to), tolerance: r.tolerance })) })

  useEffect(() => {
    if (!doc) return
    let c = false; setReady(false)
    ;(async () => { const p = await doc.getPage(page + 1); const vp = p.getViewport({ scale: 1 }); const cv = await renderPage(doc, page + 1, Math.min(2, 900 / vp.width)); if (c) return; base.current = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height); setReady(true) })()
    return () => { c = true }
  }, [doc, page])
  useEffect(() => {
    const cv = canvasRef.current, b = base.current
    if (!cv || !b || !ready) return
    const t = setTimeout(() => {
      cv.width = b.width; cv.height = b.height
      const copy = new ImageData(new Uint8ClampedArray(b.data), b.width, b.height)
      adjustPixels(copy.data, opts())
      cv.getContext('2d')!.putImageData(copy, 0, 0)
    }, 60)
    return () => clearTimeout(t)
  }, [ready, mode, brightness, contrast, saturation, threshold, reps]) // eslint-disable-line
  useEffect(() => setResult(null), [mode, brightness, contrast, saturation, threshold, reps, dpi])

  const run = () => job.run(async (setP) => {
    if (!file) return
    const o = opts()
    const out = await rasterizePdf(file, { scale: dpi / 72, quality: 0.88, onProgress: setP, transform: (ctx, c) => { const d = ctx.getImageData(0, 0, c.width, c.height); adjustPixels(d.data, o); ctx.putImageData(d, 0, 0) } })
    setResult(pdfBlob(out)); toast('Colors adjusted', 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to invert, darken or recolor it" />
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {error && <ErrorNote error={error} />}
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-${mode === 'none' ? 'adjusted' : mode}.pdf`} originalSize={file.size} title="Recolored PDF ready" onReset={reset} />}
      <ToolGrid
        main={<div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between"><div className="text-sm font-medium">Live preview</div>{numPages > 1 && <PageStepper page={page} total={numPages} onChange={setPage} />}</div>
          <div className="checker flex min-h-80 items-center justify-center rounded-xl p-4">
            <canvas ref={canvasRef} className="max-h-[70vh] max-w-full shadow-2xl" style={{ display: ready ? 'block' : 'none' }} />
            {!ready && <Spinner label="Rendering…" />}
          </div>
        </div>}
        side={<>
          <Field label="Look"><Segmented value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m.value, label: m.label }))} /></Field>
          {mode === 'bw' && <Slider label="Black and white cut-off" value={threshold} min={40} max={240} onChange={setThreshold} />}
          <Slider label="Brightness" value={brightness} min={-100} max={100} onChange={setBrightness} />
          <Slider label="Contrast" value={contrast} min={-100} max={100} onChange={setContrast} />
          {mode !== 'grayscale' && mode !== 'bw' && <Slider label="Color strength" value={saturation} min={-100} max={100} onChange={setSaturation} />}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted"><span>Replace colors</span><button type="button" onClick={() => setReps([...reps, { from: '#ffffff', to: '#fff7e0', tolerance: 10 }])} className="inline-flex items-center gap-1 normal-case text-accent cursor-pointer"><Plus className="size-3.5" />Add</button></div>
            {reps.map((r, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl border border-border p-2">
                <input type="color" aria-label="Find color" value={r.from} onChange={(e) => setReps(reps.map((x, j) => j === i ? { ...x, from: e.target.value } : x))} className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent" />
                <span className="text-xs text-muted">to</span>
                <input type="color" aria-label="New color" value={r.to} onChange={(e) => setReps(reps.map((x, j) => j === i ? { ...x, to: e.target.value } : x))} className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent" />
                <input type="range" aria-label="Tolerance" min={0} max={60} value={r.tolerance} onChange={(e) => setReps(reps.map((x, j) => j === i ? { ...x, tolerance: Number(e.target.value) } : x))} className="min-w-0 flex-1 accent-[var(--accent)]" />
                <button type="button" aria-label="Remove" onClick={() => setReps(reps.filter((_, j) => j !== i))} className="text-muted hover:text-danger cursor-pointer"><X className="size-4" /></button>
              </div>
            ))}
            {!reps.length && <div className="text-xs text-muted">For example turn a white background cream, or a red stamp black.</div>}
          </div>
          <Slider label="Output resolution" value={dpi} min={72} max={300} step={6} onChange={setDpi} suffix=" DPI" />
          <Note>Pages are re-drawn as images to apply the colors, so text is no longer selectable. Run OCR PDF afterwards if you need searchable text.</Note>
          {job.busy && <Progress value={job.progress} label="Recoloring pages…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<Palette className="size-5" />} loading={job.busy} disabled={!numPages} onClick={run}>Apply to all pages</Button>
        </>}
      />
    </div>
  )
}
