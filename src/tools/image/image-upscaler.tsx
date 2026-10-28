import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { ZoomIn, Sparkles, Zap, AlertTriangle, Cpu } from 'lucide-react'
import { Button, ErrorNote, Label, Progress, ResultCard, Segmented, Slider, ToolGrid, cn, useJob } from '@/components/ui'
import { BeforeAfter, ImageDrop, canvas, decode, hasAlpha, outName, toCanvas, unsharp, useObjectUrl } from './_img/kit'

type Mode = 'ai' | 'enhanced'
let upscalerPromise: Promise<any> | null = null
let usedDevice = ''

async function getUpscaler(onProgress: (label: string, p: number) => void, forceWasm = false) {
  if (forceWasm && usedDevice === 'webgpu') upscalerPromise = null
  if (!upscalerPromise) {
    upscalerPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers')
      const files: Record<string, { loaded: number; total: number }> = {}
      const cb = (e: any) => {
        if (e.status === 'progress' && e.file) {
          files[e.file] = { loaded: e.loaded ?? 0, total: e.total ?? 0 }
          const l = Object.values(files).reduce((a, f) => a + f.loaded, 0), t = Object.values(files).reduce((a, f) => a + f.total, 0)
          onProgress(`Downloading AI model (first run only) · ${(l / 1048576).toFixed(1)} / ${(t / 1048576).toFixed(1)} MB`, t ? l / t : 0)
        }
      }
      const devices = (navigator as any).gpu && !forceWasm ? ['webgpu', 'wasm'] : ['wasm']
      let lastErr: unknown
      for (const device of devices) {
        try { const p = await pipeline('image-to-image', 'Xenova/swin2SR-classical-sr-x2-64', { device: device as any, progress_callback: cb } as any); usedDevice = device; return p }
        catch (e) { lastErr = e; console.warn('Upscaler init failed on', device, e) }
      }
      throw lastErr
    })()
    upscalerPromise.catch(() => { upscalerPromise = null })
  }
  return upscalerPromise
}

/** One 2× AI pass, processed in overlapping tiles for memory safety and real progress. */
async function ai2x(src: HTMLCanvasElement, up: any, onTile: (done: number, total: number) => void) {
  const { RawImage } = await import('@huggingface/transformers')
  const T = 192, P = 12
  const W = src.width, H = src.height
  const { canvas: out, ctx } = canvas(W * 2, H * 2)
  const cols = Math.ceil(W / T), rows = Math.ceil(H / T), total = cols * rows
  let n = 0
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const x = tx * T, y = ty * T, w = Math.min(T, W - x), h = Math.min(T, H - y)
    const px = Math.max(0, x - P), py = Math.max(0, y - P)
    const pw = Math.min(W, x + w + P) - px, ph = Math.min(H, y + h + P) - py
    const { canvas: tile, ctx: tctx } = canvas(pw, ph)
    tctx.drawImage(src, px, py, pw, ph, 0, 0, pw, ph)
    const res = await up(RawImage.fromCanvas(tile).rgb())
    const img = Array.isArray(res) ? res[0] : res
    const tc = img.toCanvas()
    ctx.drawImage(tc, (x - px) * 2, (y - py) * 2, w * 2, h * 2, x * 2, y * 2, w * 2, h * 2)
    onTile(++n, total)
    await new Promise((r) => setTimeout(r, 0))
  }
  return out
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
  const [mode, setMode] = useState<Mode>('ai')
  const [factor, setFactor] = useState<'2' | '3' | '4'>('2')
  const [sharp, setSharp] = useState(55)
  const [label, setLabel] = useState('')
  const [result, setResult] = useState<Blob | null>(null)
  const [beforeUp, setBeforeUp] = useState<Blob | null>(null)
  const { busy, progress, error, run, setProgress } = useJob()
  const resultUrl = useObjectUrl(result)
  const beforeUrl = useObjectUrl(beforeUp)

  const onFiles = useCallback(async (f: File[]) => {
    const img = await decode(f[0])
    if (srcUrl) URL.revokeObjectURL(srcUrl)
    setFile(f[0]); setSrcUrl(URL.createObjectURL(f[0])); setDim({ w: img.naturalWidth, h: img.naturalHeight }); setResult(null)
  }, [srcUrl])
  const reset = () => { setFile(null); setResult(null); setBeforeUp(null) }

  const fac = mode === 'ai' ? (factor === '3' ? 4 : Number(factor)) : Number(factor)
  const outW = dim.w * fac, outH = dim.h * fac
  const mp = (dim.w * dim.h) / 1e6
  const tooBig = outW > 16384 || outH > 16384 || outW * outH > 120e6
  const slowWarn = mode === 'ai' && mp * (fac === 4 ? 5 : 1) > 1

  const go = () => run(async () => {
    if (!file) return
    setResult(null)
    const img = await decode(file)
    const src = toCanvas(img)
    let out: HTMLCanvasElement
    if (mode === 'ai') {
      setLabel('Loading AI engine…')
      const passes = fac === 4 ? 2 : 1
      const runAll = async (forceWasm: boolean) => {
        const up = await getUpscaler((l, p) => { setLabel(l); setProgress(p * 0.3) }, forceWasm)
        let o = src
        for (let pass = 0; pass < passes; pass++) {
          const base = 0.3 + (pass / passes) * 0.7
          o = await ai2x(o, up, (d, t) => { setLabel(`Upscaling${passes > 1 ? ` (pass ${pass + 1}/2)` : ''} · tile ${d}/${t} · ${usedDevice === 'webgpu' ? 'GPU' : 'CPU'}`); setProgress(base + (d / t) * (0.7 / passes)) })
        }
        return o
      }
      try { out = await runAll(false) }
      catch (e) { if (usedDevice !== 'webgpu') throw e; console.warn('WebGPU inference failed, retrying on CPU', e); out = await runAll(true) }
      if (hasAlpha(src)) { // restore transparency from a smooth upscale of the alpha
        const { canvas: a, ctx } = canvas(out.width, out.height)
        ctx.drawImage(src, 0, 0, out.width, out.height)
        const octx = out.getContext('2d')!; octx.globalCompositeOperation = 'destination-in'; octx.drawImage(a, 0, 0); octx.globalCompositeOperation = 'source-over'
      }
    } else {
      setLabel('Enhancing…'); setProgress(0.3)
      await new Promise((r) => setTimeout(r, 30))
      out = enhanced(src, fac, sharp)
    }
    setLabel('Encoding PNG…'); setProgress(0.98)
    // nearest-neighbour "before" at the same size, so the comparison is fair
    const { canvas: b, ctx: bctx } = canvas(Math.min(out.width, 2400), Math.round(Math.min(out.width, 2400) * out.height / out.width))
    bctx.imageSmoothingEnabled = false; bctx.drawImage(src, 0, 0, b.width, b.height)
    setBeforeUp(await new Promise<Blob>((r) => b.toBlob((x) => r(x!), 'image/png')))
    setResult(await new Promise<Blob>((r, j) => out.toBlob((x) => (x ? r(x) : j(new Error('Image too large to encode'))), 'image/png')))
  })

  if (!file || !srcUrl) return <ImageDrop multiple={false} onFiles={onFiles} label="Drop an image to upscale" sub="AI super-resolution runs on your device (WebGPU when available). Works best on images under 1000px." />

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
          {result && <ResultCard blob={result} filename={outName(file.name, 'png', `-${fac}x`)} originalSize={file.size} title={`Upscaled ${fac}×, ${outW}×${outH}`} onReset={reset} />}
        </>}
        side={<>
          <div>
            <Label>Method</Label>
            <div className="grid gap-2">
              {([['ai', <Sparkles className="size-4" />, 'AI super-resolution', 'Swin2SR neural network · best detail · slower'], ['enhanced', <Zap className="size-4" />, 'Enhanced (fast)', 'Multi-step resampling + sharpening · instant']] as const).map(([m, ic, t, d]) => (
                <button key={m} onClick={() => { setMode(m); setResult(null); if (m === 'ai' && factor === '3') setFactor('4') }} className={cn('flex gap-3 rounded-xl border p-3 text-left transition cursor-pointer', mode === m ? 'border-accent bg-accent/10 ring-2 ring-accent/20' : 'border-border hover:border-accent/50')}>
                  <span className="mt-0.5 text-accent">{ic}</span><span><span className="block text-sm font-semibold">{t}</span><span className="text-[11px] text-muted">{d}</span></span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Scale</Label>
            <Segmented value={factor} onChange={(f) => { setFactor(f); setResult(null) }} options={mode === 'ai' ? [{ value: '2', label: '2×' }, { value: '4', label: '4× (2 passes)' }] : [{ value: '2', label: '2×' }, { value: '3', label: '3×' }, { value: '4', label: '4×' }]} />
          </div>
          {mode === 'enhanced' && <Slider label="Sharpening" value={sharp} onChange={(v) => { setSharp(v); setResult(null) }} min={0} max={100} suffix="%" />}
          {slowWarn && !tooBig && <div className="flex gap-2 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-warn"><AlertTriangle className="size-4 shrink-0" /> This is a large image ({mp.toFixed(1)} MP). AI upscaling may take several minutes{!(navigator as any).gpu ? ' without WebGPU' : ''}. Try Enhanced mode or crop first for faster results.</div>}
          {tooBig && <div className="flex gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger"><AlertTriangle className="size-4 shrink-0" /> Output would be {outW}×{outH}, beyond what browsers can hold in memory. Choose a smaller scale or resize the image first.</div>}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} disabled={tooBig} icon={<ZoomIn className="size-4" />} onClick={go}>Upscale {fac}×</Button>
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted"><Cpu className="size-3" /> {(navigator as any).gpu ? 'WebGPU acceleration available' : 'Runs on CPU (WebAssembly)'}</p>
          <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
        </>}
      />
    </div>
  )
}
