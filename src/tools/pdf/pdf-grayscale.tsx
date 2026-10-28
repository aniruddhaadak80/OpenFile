import { useEffect, useMemo, useRef, useState } from 'react'
import { Contrast } from 'lucide-react'
import { Button, Dropzone, Field, ResultCard, Segmented, Slider, ToolGrid, Progress, ErrorNote, Spinner, useJob, Label } from '@/components/ui'
import { pdfBlob, rasterizePdf, renderPage } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT, PageStepper, readBytes, usePdfDoc, motion } from './_core/kit'

type Mode = 'gray' | 'bw'
/** In-place pixel transform shared by preview and export */
function transform(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, mode: Mode, threshold: number, contrast: number, brightness: number) {
  const img = ctx.getImageData(0, 0, c.width, c.height)
  const d = img.data
  const k = (259 * (contrast + 255)) / (255 * (259 - contrast))
  for (let i = 0; i < d.length; i += 4) {
    let g = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
    g = k * (g - 128) + 128 + brightness
    if (mode === 'bw') g = g >= threshold ? 255 : 0
    g = g < 0 ? 0 : g > 255 ? 255 : g
    d[i] = d[i + 1] = d[i + 2] = g
  }
  ctx.putImageData(img, 0, 0)
}

export default function PdfGrayscale() {
  const [file, setFile] = useState<File | null>(null)
  const { doc, numPages, error } = usePdfDoc(file)
  const [mode, setMode] = useState<Mode>('gray')
  const [threshold, setThreshold] = useState(160)
  const [contrast, setContrast] = useState(0)
  const [brightness, setBrightness] = useState(0)
  const [dpi, setDpi] = useState(150)
  const [quality, setQuality] = useState(80)
  const [page, setPage] = useState(0)
  const [before, setBefore] = useState<HTMLCanvasElement | null>(null)
  const [after, setAfter] = useState<string | null>(null)
  const [split, setSplit] = useState(50)
  const beforeUrl = useMemo(() => before?.toDataURL('image/jpeg', 0.85) ?? '', [before])
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setResult(null); setBefore(null); setAfter(null); setPage(0) }
  const d = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setResult(null) }

  // render the original page once per page
  useEffect(() => {
    if (!doc) return
    let cancel = false
    ;(async () => {
      const p = await doc.getPage(page + 1); const vp = p.getViewport({ scale: 1 })
      const c = await renderPage(doc, page + 1, Math.min(2, 1100 / Math.max(vp.width, vp.height)))
      if (!cancel) setBefore(c)
    })().catch(() => {})
    return () => { cancel = true }
  }, [doc, page])

  // apply the filter to a copy (debounced)
  const tm = useRef<number>(0)
  useEffect(() => {
    if (!before) return
    clearTimeout(tm.current)
    tm.current = window.setTimeout(() => {
      const c = document.createElement('canvas'); c.width = before.width; c.height = before.height
      const ctx = c.getContext('2d')!; ctx.drawImage(before, 0, 0)
      transform(ctx, c, mode, threshold, contrast, brightness)
      setAfter(c.toDataURL('image/jpeg', 0.9))
    }, 60)
  }, [before, mode, threshold, contrast, brightness])

  const run = () => job.run(async (setP) => {
    if (!file) return
    const out = await rasterizePdf(await readBytes(file), {
      scale: dpi / 72, type: mode === 'bw' ? 'image/png' : 'image/jpeg', quality: quality / 100,
      transform: (ctx, c) => transform(ctx, c, mode, threshold, contrast, brightness), onProgress: setP,
    })
    setResult(pdfBlob(out)); toast('Converted to ' + (mode === 'bw' ? 'black & white' : 'grayscale'), 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a color PDF" />

  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-${mode === 'bw' ? 'bw' : 'grayscale'}.pdf`} originalSize={file.size} title="Conversion complete" onReset={reset} />}
      <ToolGrid
        main={<div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-medium">Before / after <span className="text-xs font-normal text-muted">— drag the slider</span></div>
            {numPages > 1 && <PageStepper page={page} total={numPages} onChange={setPage} />}
          </div>
          {error ? <div className="text-sm text-danger">{error}</div> : before && after ? (
            <div className="checker flex justify-center rounded-xl p-4">
              <div className="relative inline-block max-w-full select-none overflow-hidden shadow-2xl" style={{ aspectRatio: `${before.width}/${before.height}`, width: `min(100%, calc(70vh * ${before.width / before.height}))` }}>
                <img src={beforeUrl} alt="Original" className="absolute inset-0 h-full w-full bg-white" draggable={false} />
                <motion.img src={after} alt="Converted" initial={{ opacity: 0.7 }} animate={{ opacity: 1 }} className="absolute inset-0 h-full w-full bg-white" style={{ clipPath: `inset(0 0 0 ${split}%)` }} draggable={false} />
                <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent shadow" style={{ left: `${split}%` }}><div className="absolute top-1/2 left-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-accent text-white shadow-lg"><Contrast className="size-4" /></div></div>
                <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(+e.target.value)} aria-label="Compare" className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" />
                <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">ORIGINAL</span>
                <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{mode === 'bw' ? 'B&W' : 'GRAY'}</span>
              </div>
            </div>
          ) : <div className="grid min-h-80 place-items-center"><Spinner label="Rendering preview…" /></div>}
        </div>}
        side={<>
          <Field label="Output"><Segmented value={mode} onChange={d(setMode)} className="w-full" options={[{ value: 'gray', label: 'Grayscale' }, { value: 'bw', label: 'Black & white' }]} /></Field>
          {mode === 'bw' && <Slider label="Threshold" value={threshold} min={30} max={240} onChange={d(setThreshold)} />}
          <Slider label="Contrast" value={contrast} min={-100} max={100} onChange={d(setContrast)} />
          <Slider label="Brightness" value={brightness} min={-80} max={80} onChange={d(setBrightness)} />
          <div className="flex gap-1.5">
            {[['Document', 'bw', 165, 20, 0], ['Photo', 'gray', 160, 0, 0], ['Faded scan', 'gray', 160, 45, 10], ['Ink saver', 'gray', 160, -30, 40]].map(([l, m, t, c, b]: any) => (
              <button key={l} type="button" onClick={() => { setMode(m); setThreshold(t); setContrast(c); setBrightness(b); setResult(null) }} className="flex-1 rounded-lg border border-border px-1.5 py-1 text-[11px] text-muted hover:border-accent hover:text-accent cursor-pointer">{l}</button>
            ))}
          </div>
          <div><Label>Quality</Label>
            <Slider label="Resolution" value={dpi} min={72} max={300} step={6} onChange={d(setDpi)} suffix=" DPI" />
            {mode === 'gray' && <Slider className="mt-3" label="JPEG quality" value={quality} min={40} max={95} onChange={d(setQuality)} suffix="%" />}
          </div>
          <div className="text-xs text-muted">Pages are re-rendered as images, so text won't be selectable afterwards. Use OCR PDF to restore searchability.</div>
          {job.busy && <Progress value={job.progress} label="Converting…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<Contrast className="size-5" />} loading={job.busy} disabled={!numPages} onClick={run}>Convert {numPages} page{numPages === 1 ? '' : 's'}</Button>
        </>}
      />
    </div>
  )
}
