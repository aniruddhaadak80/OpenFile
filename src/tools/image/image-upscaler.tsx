import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ZoomIn, Sparkles, Zap, AlertTriangle, Cpu, X } from 'lucide-react'
import { Button, ErrorNote, Label, Progress, ResultCard, Segmented, Slider, ToolGrid, cn } from '@/components/ui'
import { BeforeAfter, ImageDrop, canvas, decode, hasAlpha, outName, toCanvas, unsharp, useObjectUrl } from './_img/kit'

type Mode = 'ai' | 'enhanced'
let gpuCheck: Promise<boolean> | null = null

/** True only when WebGPU exists and a real adapter can be obtained. `navigator.gpu` alone is not enough. */
function hasWebGPU(): Promise<boolean> {
  if (!gpuCheck) gpuCheck = (async () => {
    try {
      const gpu = (navigator as any).gpu
      if (!gpu) return false
      const adapter = await Promise.race([gpu.requestAdapter(), new Promise((r) => setTimeout(() => r(null), 3000))])
      return !!adapter
    } catch { return false }
  })()
  return gpuCheck
}

const TILE = 192, PAD = 16
/** Rough seconds per tile, used only for the up-front estimate. */
const SEC_PER_TILE = { gpu: 0.6, cpu: 7 }
const tilesFor = (w: number, h: number, passes: number) => {
  let n = 0
  for (let p = 0; p < passes; p++) { n += Math.ceil(w / TILE) * Math.ceil(h / TILE); w *= 2; h *= 2 }
  return n
}
const fmtTime = (s: number) => (s < 90 ? `${Math.max(5, Math.round(s / 5) * 5)} seconds` : `${Math.round(s / 60)} minutes`)

class Cancelled extends Error { constructor() { super('cancelled') } }

/** Keeps one module worker alive between runs so the model stays loaded. Cancel terminates it. */
let worker: Worker | null = null
let reqId = 0
let pending: { id: number; reject: (e: unknown) => void } | null = null
function getWorker() {
  if (!worker) worker = new Worker(new URL('./upscaler.worker.ts', import.meta.url), { type: 'module' })
  return worker
}
function killWorker(reason: unknown) {
  if (worker) { worker.terminate(); worker = null }
  if (pending) { pending.reject(reason); pending = null }
}

type WorkerMsg = { type: 'load'; loaded: number; total: number } | { type: 'ready'; device: string } | { type: 'tile'; pass: number; passes: number; done: number; total: number; device: string }

/** Sends the pixels to the worker and resolves with the upscaled canvas. */
function aiInWorker(src: HTMLCanvasElement, passes: number, preferGpu: boolean, onMsg: (m: WorkerMsg) => void) {
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const id = ++reqId
    const w = getWorker()
    pending = { id, reject }
    const data = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data
    const finish = () => { w.onmessage = null; w.onerror = null; w.onmessageerror = null; if (pending?.id === id) pending = null }
    w.onmessage = (ev) => {
      const m = ev.data
      if (m.id !== id) return
      if (m.type === 'done') {
        finish()
        try {
          const { canvas: out, ctx } = canvas(m.width, m.height)
          ctx.putImageData(new ImageData(new Uint8ClampedArray(m.rgba), m.width, m.height), 0, 0)
          resolve(out)
        } catch (e) { reject(e) }
      } else if (m.type === 'error') { finish(); reject(new Error(m.message)) }
      else onMsg(m)
    }
    // A crashed or out-of-memory worker fires error; drop it so the next run starts clean.
    w.onerror = (e) => { e.preventDefault?.(); finish(); if (worker === w) { w.terminate(); worker = null } reject(new Error('worker failed')) }
    w.onmessageerror = () => { finish(); reject(new Error('worker message failed')) }
    w.postMessage({ id, rgba: data.buffer, width: src.width, height: src.height, passes, tile: TILE, pad: PAD, preferGpu }, [data.buffer])
  })
}

/** Classic "enhanced" upscale: gradual high-quality resampling steps + unsharp mask. */
function enhanced(src: HTMLCanvasElement, factor: number, sharp: number) {
  let cur: HTMLCanvasElement = src
  const tw = Math.round(src.width * factor), th = Math.round(src.height * factor)
  while (cur.width < tw) {
    const nw = Math.min(tw, Math.round(cur.width * 1.5)), nh = Math.round((nw / src.width) * src.height)
    const { canvas: c, ctx } = canvas(nw, Math.min(th, nh))
    ctx.drawImage(cur, 0, 0, c.width, c.height)
    if (sharp > 0) unsharp(c, (sharp / 100) * 0.5, 1, 2)
    cur = c
  }
  if (sharp > 0) unsharp(cur, (sharp / 100) * 0.9, 1.2, 1)
  return cur
}

export default function ImageUpscaler() {
  const [file, setFile] = useState<File | null>(null)
  const [srcUrl, setSrcUrl] = useState<string | null>(null)
  const [dim, setDim] = useState({ w: 0, h: 0 })
  const [mode, setMode] = useState<Mode>('enhanced')
  const modeTouched = useRef(false)
  const [factor, setFactor] = useState<'2' | '3' | '4'>('2')
  const [sharp, setSharp] = useState(55)
  const [label, setLabel] = useState('')
  const [result, setResult] = useState<Blob | null>(null)
  const [beforeUp, setBeforeUp] = useState<Blob | null>(null)
  const [compat, setCompat] = useState(false)
  const [gpu, setGpu] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const cancelled = useRef(false)
  // AI is the default only when a real GPU adapter exists; on CPU, Enhanced (fast) is selected.
  useEffect(() => { hasWebGPU().then((g) => { setGpu(g); if (g && !modeTouched.current) setMode('ai') }) }, [])
  useEffect(() => () => killWorker(new Cancelled()), [])
  const resultUrl = useObjectUrl(result)
  const beforeUrl = useObjectUrl(beforeUp)

  const onFiles = useCallback(async (f: File[]) => {
    const img = await decode(f[0])
    if (srcUrl) URL.revokeObjectURL(srcUrl)
    setFile(f[0]); setSrcUrl(URL.createObjectURL(f[0])); setDim({ w: img.naturalWidth, h: img.naturalHeight }); setResult(null); setCompat(false); setError(null)
  }, [srcUrl])
  const reset = () => { if (busy) cancel(); setFile(null); setResult(null); setBeforeUp(null); setCompat(false); setError(null) }

  const fac = mode === 'ai' ? (factor === '3' ? 4 : Number(factor)) : Number(factor)
  const outW = dim.w * fac, outH = dim.h * fac
  const mp = (dim.w * dim.h) / 1e6
  const tooBig = outW > 16384 || outH > 16384 || outW * outH > 120e6
  const passes = fac === 4 ? 2 : 1
  const tiles = tilesFor(dim.w, dim.h, passes)
  const estSec = tiles * (gpu ? SEC_PER_TILE.gpu : SEC_PER_TILE.cpu)
  const cpuWarn = mode === 'ai' && gpu === false && mp * passes > 0.5
  const slowWarn = mode === 'ai' && gpu !== false && mp * (fac === 4 ? 5 : 1) > 1

  const cancel = () => { cancelled.current = true; killWorker(new Cancelled()); setBusy(false); setProgress(0); setLabel('') }

  const go = async () => {
    if (!file || busy) return
    cancelled.current = false
    setBusy(true); setError(null); setProgress(0); setResult(null); setCompat(false)
    try {
      const img = await decode(file)
      const src = toCanvas(img)
      let out: HTMLCanvasElement
      if (mode === 'ai') {
        setLabel('Loading AI engine…')
        let ai: HTMLCanvasElement | null = null
        const t0 = performance.now()
        let firstTileAt = 0
        try {
          ai = await aiInWorker(src, passes, gpu !== false, (m) => {
            if (m.type === 'load') { setLabel(`Downloading AI model (first run only) · ${(m.loaded / 1048576).toFixed(1)} / ${(m.total / 1048576).toFixed(1)} MB`); setProgress(m.total ? (m.loaded / m.total) * 0.1 : 0) }
            else if (m.type === 'ready') { setLabel(`Upscaling on ${m.device === 'webgpu' ? 'GPU' : 'CPU'}…`); setProgress(0.1) }
            else {
              if (!firstTileAt) firstTileAt = performance.now()
              const doneAll = (m.pass ? tilesFor(dim.w, dim.h, 1) : 0) + m.done
              const per = (performance.now() - (firstTileAt || t0)) / Math.max(1, doneAll - 1)
              const left = doneAll > 1 ? ` · about ${fmtTime(((tiles - doneAll) * per) / 1000)} left` : ''
              setLabel(`Upscaling${m.passes > 1 ? ` (pass ${m.pass + 1}/2)` : ''} · tile ${m.done}/${m.total} · ${m.device === 'webgpu' ? 'GPU' : 'CPU'}${left}`)
              setProgress(0.1 + (doneAll / tiles) * 0.85)
            }
          })
        } catch (e) {
          if (e instanceof Cancelled || cancelled.current) return
          console.warn('AI upscale failed, using compatibility mode', e)
          killWorker(new Cancelled())
        }
        if (cancelled.current) return
        if (!ai) {
          // Compatibility mode: high quality multi-step resampling with sharpening. Never surface the raw engine error.
          setCompat(true); setLabel('Running in compatibility mode'); setProgress(0.5)
          await new Promise((r) => setTimeout(r, 30))
          ai = enhanced(src, fac, 60)
        }
        out = ai
        if (hasAlpha(src)) { // restore transparency from a smooth upscale of the alpha
          const { canvas: a, ctx } = canvas(out.width, out.height)
          ctx.drawImage(src, 0, 0, out.width, out.height)
          const octx = out.getContext('2d')!; octx.globalCompositeOperation = 'destination-in'; octx.drawImage(a, 0, 0); octx.globalCompositeOperation = 'source-over'
          a.width = a.height = 0
        }
      } else {
        setLabel('Enhancing…'); setProgress(0.3)
        await new Promise((r) => setTimeout(r, 30))
        out = enhanced(src, fac, sharp)
      }
      if (cancelled.current) return
      setLabel('Encoding PNG…'); setProgress(0.98)
      // nearest-neighbour "before" at the same size, so the comparison is fair
      const { canvas: b, ctx: bctx } = canvas(Math.min(out.width, 2400), Math.round(Math.min(out.width, 2400) * out.height / out.width))
      bctx.imageSmoothingEnabled = false; bctx.drawImage(src, 0, 0, b.width, b.height)
      const before = await new Promise<Blob>((r) => b.toBlob((x) => r(x!), 'image/png'))
      const res = await new Promise<Blob>((r, j) => out.toBlob((x) => (x ? r(x) : j(new Error('Image too large to encode'))), 'image/png'))
      b.width = b.height = 0; out.width = out.height = 0; src.width = src.height = 0
      if (cancelled.current) return
      setBeforeUp(before); setResult(res)
    } catch (e: any) {
      if (e instanceof Cancelled || cancelled.current) return
      console.error(e)
      setError(/too large|memory/i.test(String(e?.message || e)) ? 'This image is too large for the browser to hold. Choose a smaller scale or resize it first.' : 'Upscaling did not finish. Try Enhanced mode or a smaller image.')
    } finally {
      if (!cancelled.current) setBusy(false)
    }
  }

  if (!file || !srcUrl) return <ImageDrop multiple={false} onFiles={onFiles} label="Drop an image to upscale" sub="AI super-resolution runs on your device in a background worker (WebGPU when available). Works best on images under 1000px." />

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <div className="rounded-2xl border border-border bg-surface p-4">
            {result && resultUrl && beforeUrl ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}><BeforeAfter before={beforeUrl} after={resultUrl} labels={['Original (pixel-scaled)', `Upscaled ${fac}×`]} maxH="62vh" /></motion.div>
            ) : (
              <div className="relative mx-auto w-fit overflow-hidden rounded-xl checker">
                <img src={srcUrl} alt="" className="max-h-[62vh] max-w-full" style={{ imageRendering: dim.w < 600 ? 'pixelated' : 'auto' }} />
                {busy && <><div className="shimmer absolute inset-0" /><div className="glass absolute inset-x-4 bottom-4 rounded-xl p-3"><Progress value={progress} label={label} /></div></>}
              </div>
            )}
            <div className="mt-3 flex justify-center gap-6 text-xs text-muted"><span>Input <b className="font-mono text-fg">{dim.w}×{dim.h}</b></span><span>Output <b className="font-mono text-accent">{outW}×{outH}</b></span></div>
          </div>
          {result && <ResultCard blob={result} filename={outName(file.name, 'png', `-${fac}x`)} originalSize={file.size} title={`Upscaled ${fac}×, ${outW}×${outH}${compat ? ' (compatibility mode)' : ''}`} onReset={reset} />}
        </>}
        side={<>
          <div>
            <Label>Method</Label>
            <div className="grid gap-2">
              {([['ai', <Sparkles className="size-4" />, 'AI super-resolution', gpu === false ? 'Swin2SR neural network · best detail · slow without a GPU' : 'Swin2SR neural network · best detail · slower'], ['enhanced', <Zap className="size-4" />, 'Enhanced (fast)', 'Multi-step resampling + sharpening · instant']] as const).map(([m, ic, t, d]) => (
                <button key={m} disabled={busy} onClick={() => { modeTouched.current = true; setMode(m); setResult(null); setCompat(false); if (m === 'ai' && factor === '3') setFactor('4') }} className={cn('flex gap-3 rounded-xl border p-3 text-left transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-60', mode === m ? 'border-accent bg-accent/10 ring-2 ring-accent/20' : 'border-border hover:border-accent/50')}>
                  <span className="mt-0.5 text-accent">{ic}</span><span><span className="block text-sm font-semibold">{t}</span><span className="text-[11px] text-muted">{d}</span></span>
                </button>
              ))}
            </div>
            {gpu === false && <p className="mt-2 flex gap-2 text-[11px] text-muted"><Cpu className="size-3.5 shrink-0" /> No GPU is available in this browser, so Enhanced (fast) is selected. AI mode still works, but it is slow on the CPU.</p>}
          </div>
          <div>
            <Label>Scale</Label>
            <Segmented value={factor} onChange={(f) => { setFactor(f); setResult(null) }} options={mode === 'ai' ? [{ value: '2', label: '2×' }, { value: '4', label: '4× (2 passes)' }] : [{ value: '2', label: '2×' }, { value: '3', label: '3×' }, { value: '4', label: '4×' }]} />
          </div>
          {mode === 'enhanced' && <Slider label="Sharpening" value={sharp} onChange={(v) => { setSharp(v); setResult(null) }} min={0} max={100} suffix="%" />}
          {cpuWarn && !tooBig && <div className="flex gap-2 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-warn"><AlertTriangle className="size-4 shrink-0" /> AI mode on the CPU is slow. This {mp.toFixed(1)} MP image needs {tiles} tiles, roughly {fmtTime(estSec)} on a typical computer. The page stays usable while it runs and you can cancel at any time. Enhanced (fast) finishes in seconds.</div>}
          {slowWarn && !tooBig && <div className="flex gap-2 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-warn"><AlertTriangle className="size-4 shrink-0" /> This is a large image ({mp.toFixed(1)} MP). AI upscaling may take a few minutes. Try Enhanced mode or crop first for faster results.</div>}
          {tooBig && <div className="flex gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger"><AlertTriangle className="size-4 shrink-0" /> Output would be {outW}×{outH}, beyond what browsers can hold in memory. Choose a smaller scale or resize the image first.</div>}
          {compat && <p role="status" className="flex gap-2 rounded-xl border border-border bg-surface p-3 text-xs text-muted"><Cpu className="size-4 shrink-0" /> Running in compatibility mode. The AI engine could not finish in this browser, so the image was upscaled with high quality resampling and sharpening instead.</p>}
          <ErrorNote error={error} />
          {busy
            ? <Button size="lg" variant="outline" className="w-full" icon={<X className="size-4" />} onClick={cancel}>Cancel</Button>
            : <Button size="lg" className="w-full" disabled={tooBig} icon={<ZoomIn className="size-4" />} onClick={go}>Upscale {fac}×</Button>}
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted"><Cpu className="size-3" /> {gpu ? 'WebGPU acceleration available' : gpu === false ? 'Runs on CPU (WebAssembly) in a background worker' : 'Checking for GPU'}</p>
          <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
        </>}
      />
    </div>
  )
}
