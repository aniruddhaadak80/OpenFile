import { useEffect, useRef, useState } from 'react'
import { ScanLine } from 'lucide-react'
import { Button, Dropzone, Slider, Switch, ToolGrid, Progress, ErrorNote, useJob, ResultCard, Spinner } from '@/components/ui'
import { openPdfJs, renderPage, rasterizePdf, pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { FileBar, PDF_ACCEPT, readBytes, usePdfDoc } from './_core/kit'

interface Fx { gray: boolean; tilt: number; noise: number; blur: number; contrast: number; tone: number; edges: boolean }
function rnd(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296 } }

/** Apply the scanned look to a rendered page canvas in place. */
function scanify(c: HTMLCanvasElement, fx: Fx, seed: number) {
  const r = rnd(seed + 11)
  const w = c.width, h = c.height
  const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h
  const t = tmp.getContext('2d')!
  t.fillStyle = '#fff'; t.fillRect(0, 0, w, h)
  t.filter = `${fx.gray ? 'grayscale(1) ' : ''}contrast(${1 + fx.contrast / 100}) blur(${(fx.blur / 100) * 1.2}px)`
  const ang = ((r() - 0.5) * 2 * fx.tilt * Math.PI) / 180
  t.translate(w / 2 + (r() - 0.5) * w * 0.006, h / 2 + (r() - 0.5) * h * 0.004); t.rotate(ang); t.drawImage(c, -w / 2, -h / 2); t.setTransform(1, 0, 0, 1, 0, 0); t.filter = 'none'
  const img = t.getImageData(0, 0, w, h), d = img.data
  const n = fx.noise * 0.9, tone = fx.tone / 100
  for (let i = 0; i < d.length; i += 4) {
    const g = (r() - 0.5) * n
    let R = d[i] + g, G = d[i + 1] + g, B = d[i + 2] + g
    // warm paper tone on light pixels
    const light = (R + G + B) / 765
    R += 10 * tone * light; G += 6 * tone * light; B -= 14 * tone * light
    if (fx.gray) { const y = 0.299 * R + 0.587 * G + 0.114 * B; R = G = B = y + 6 * tone * light }
    d[i] = R; d[i + 1] = G; d[i + 2] = B
  }
  t.putImageData(img, 0, 0)
  if (fx.edges) { const gr = t.createLinearGradient(0, 0, w * 0.04, 0); gr.addColorStop(0, 'rgba(0,0,0,0.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); t.fillStyle = gr; t.fillRect(0, 0, w * 0.04, h); const gt = t.createLinearGradient(0, 0, 0, h * 0.025); gt.addColorStop(0, 'rgba(0,0,0,0.18)'); gt.addColorStop(1, 'rgba(0,0,0,0)'); t.fillStyle = gt; t.fillRect(0, 0, w, h * 0.025) }
  const ctx = c.getContext('2d')!; ctx.drawImage(tmp, 0, 0)
}

export default function PdfScanEffect() {
  const [file, setFile] = useState<File | null>(null)
  const { numPages, error } = usePdfDoc(file)
  const [fx, setFx] = useState<Fx>({ gray: true, tilt: 0.8, noise: 18, blur: 25, contrast: 12, tone: 40, edges: true })
  const [dpi, setDpi] = useState(150)
  const [result, setResult] = useState<Blob | null>(null)
  const [prev, setPrev] = useState<string | null>(null)
  const page1 = useRef<HTMLCanvasElement | null>(null)
  const job = useJob()
  const set = <K extends keyof Fx>(k: K, v: Fx[K]) => { setFx((p) => ({ ...p, [k]: v })); setResult(null) }
  useEffect(() => { page1.current = null; if (!file) return; (async () => { const d = await openPdfJs(await readBytes(file)); page1.current = await renderPage(d, 1, 1.2); setFx((p) => ({ ...p })) })() }, [file])
  useEffect(() => { const src = page1.current; if (!src) return; const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d')!.drawImage(src, 0, 0); scanify(c, fx, 1); setPrev(c.toDataURL('image/jpeg', 0.85)) }, [fx])
  const run = () => job.run(async (setP) => { if (!file) return; setResult(pdfBlob(await rasterizePdf(await readBytes(file), { scale: dpi / 72, quality: 0.78, transform: (_ctx, c, i) => scanify(c, fx, i + 1), onProgress: setP }))) })
  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF" sub="Make a digital PDF look like it was printed and scanned: slight tilt, grain, soft focus and paper tone." />
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={() => { setFile(null); setResult(null); setPrev(null) }} />
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-scanned.pdf`} originalSize={file.size} title="Scanned look applied" onReset={() => setResult(null)} />}
      <ToolGrid
        main={error ? <div className="text-sm text-danger">{error}</div> : <div className="grid place-items-center rounded-2xl border border-border bg-surface-2/40 p-4">{prev ? <img src={prev} alt="Page 1 preview" className="max-h-[70vh] shadow-xl" /> : <Spinner label="Rendering page 1" />}</div>}
        side={<>
          <Switch checked={fx.gray} onChange={(v) => set('gray', v)} label="Black and white" />
          <Slider label="Tilt" value={fx.tilt} onChange={(v) => set('tilt', v)} min={0} max={3} step={0.1} suffix="°" />
          <Slider label="Grain" value={fx.noise} onChange={(v) => set('noise', v)} min={0} max={60} />
          <Slider label="Soft focus" value={fx.blur} onChange={(v) => set('blur', v)} min={0} max={100} />
          <Slider label="Contrast" value={fx.contrast} onChange={(v) => set('contrast', v)} min={0} max={60} />
          <Slider label="Paper tone" value={fx.tone} onChange={(v) => set('tone', v)} min={0} max={100} />
          <Switch checked={fx.edges} onChange={(v) => set('edges', v)} label="Scanner shadow on the edge" />
          <Slider label="Resolution" value={dpi} onChange={setDpi} min={100} max={300} step={50} suffix=" dpi" />
          {job.busy && <Progress value={job.progress} label="Scanning pages" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<ScanLine className="size-5" />} loading={job.busy} disabled={!numPages} onClick={run}>Make it look scanned</Button>
          <p className="text-xs text-muted">Pages become images, so the text can no longer be selected. Use it honestly, where a scan is truly what is asked for.</p>
        </>}
      />
    </div>
  )
}
