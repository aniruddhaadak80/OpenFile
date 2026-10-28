import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Download } from 'lucide-react'
import { Button, Dropzone, Field, Label, Segmented, Slider, ToolGrid, ErrorNote, cn } from '@/components/ui'
import { downloadBlob, formatBytes } from '@/lib/files'
import { BeforeAfter } from './_img/kit'
import { decodeAny } from '@/lib/b2/codecs'
import { diffImages, type DiffResult } from '@/lib/b2/diff'

type Side = { name: string; size: number; canvas: HTMLCanvasElement; url: string }
type Mode = 'slider' | 'side' | 'onion' | 'diff'
type Fit = 'stretch' | 'top-left' | 'center'

function align(src: HTMLCanvasElement, w: number, h: number, fit: Fit) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  if (fit === 'stretch') ctx.drawImage(src, 0, 0, w, h)
  else if (fit === 'center') ctx.drawImage(src, (w - src.width) / 2, (h - src.height) / 2)
  else ctx.drawImage(src, 0, 0)
  return c
}

function Pick({ label, side, onPick }: { label: string; side: Side | null; onPick: (f: File) => void }) {
  return side
    ? <button onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*,.tif,.tiff,.jxl,.qoi,.psd,.heic,.tga'; i.onchange = () => i.files?.[0] && onPick(i.files[0]); i.click() }} className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-2/50 p-2 text-left hover:border-accent cursor-pointer">
        <img src={side.url} alt="" className="checker size-12 rounded-lg object-cover" />
        <div className="min-w-0 text-xs"><div className="text-muted">{label}</div><div className="truncate font-medium">{side.name}</div><div className="text-muted">{side.canvas.width}×{side.canvas.height} · {formatBytes(side.size)}</div></div>
      </button>
    : <Dropzone compact accept="image/*,.tif,.tiff,.jxl,.qoi,.psd,.heic,.tga" onFiles={(f) => onPick(f[0])} label={label} sub="Click or drop" />
}

export default function ImageCompare() {
  const [a, setA] = useState<Side | null>(null)
  const [b, setB] = useState<Side | null>(null)
  const [mode, setMode] = useState<Mode>('slider')
  const [fit, setFit] = useState<Fit>('stretch')
  const [opacity, setOpacity] = useState(50)
  const [threshold, setThreshold] = useState(10)
  const [diffMode, setDiffMode] = useState<'highlight' | 'heatmap' | 'abs'>('highlight')
  const [error, setError] = useState<string | null>(null)

  const load = (set: (s: Side) => void) => async (f: File) => {
    try { setError(null); const { canvas } = await decodeAny(f); set({ name: f.name, size: f.size, canvas, url: canvas.toDataURL() }) } catch (e: any) { setError(e.message) }
  }
  const W = a && b ? Math.max(a.canvas.width, b.canvas.width) : 0, H = a && b ? Math.max(a.canvas.height, b.canvas.height) : 0
  const aligned = useMemo(() => {
    if (!a || !b) return null
    const ww = fit === 'stretch' ? a.canvas.width : W, hh = fit === 'stretch' ? a.canvas.height : H
    const ca = align(a.canvas, ww, hh, fit === 'stretch' ? 'top-left' : fit), cb = align(b.canvas, ww, hh, fit)
    return { ca, cb, w: ww, h: hh, ua: ca.toDataURL(), ub: cb.toDataURL() }
  }, [a, b, fit, W, H])

  const [diff, setDiff] = useState<(DiffResult & { url: string }) | null>(null)
  useEffect(() => {
    if (!aligned) { setDiff(null); return }
    const t = setTimeout(() => {
      const scale = Math.min(1, 2000 / Math.max(aligned.w, aligned.h))
      const w = Math.max(1, Math.round(aligned.w * scale)), h = Math.max(1, Math.round(aligned.h * scale))
      const get = (c: HTMLCanvasElement) => { const t = document.createElement('canvas'); t.width = w; t.height = h; const x = t.getContext('2d')!; x.drawImage(c, 0, 0, w, h); return x.getImageData(0, 0, w, h).data }
      const r = diffImages(get(aligned.ca), get(aligned.cb), w, h, { threshold: threshold / 100, mode: diffMode })
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.putImageData(new ImageData(r.out, w, h), 0, 0)
      setDiff({ ...r, url: c.toDataURL() })
    }, 120)
    return () => clearTimeout(t)
  }, [aligned, threshold, diffMode])

  const sizeMismatch = a && b && (a.canvas.width !== b.canvas.width || a.canvas.height !== b.canvas.height)
  return (
    <ToolGrid
      main={!aligned
        ? <div className="grid gap-4 sm:grid-cols-2"><Pick label="First image (before)" side={a} onPick={load(setA)} /><Pick label="Second image (after)" side={b} onPick={load(setB)} /></div>
        : <div className="space-y-4">
            <Segmented value={mode} onChange={setMode} options={[{ value: 'slider', label: 'Slider' }, { value: 'side', label: 'Side by side' }, { value: 'onion', label: 'Onion skin' }, { value: 'diff', label: 'Difference' }]} />
            {mode === 'slider' && <BeforeAfter before={aligned.ua} after={aligned.ub} labels={['A', 'B']} />}
            {mode === 'side' && <div className="grid gap-3 sm:grid-cols-2">{[aligned.ua, aligned.ub].map((u, i) => <div key={i} className="checker relative overflow-hidden rounded-xl border border-border"><img src={u} alt={i ? 'B' : 'A'} className="w-full" /><span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[11px] text-white">{i ? 'B' : 'A'}</span></div>)}</div>}
            {mode === 'onion' && <div className="checker relative mx-auto w-fit max-w-full overflow-hidden rounded-xl border border-border"><img src={aligned.ua} alt="A" className="block max-h-[70vh] max-w-full" /><img src={aligned.ub} alt="B" className="absolute inset-0 size-full" style={{ opacity: opacity / 100 }} /></div>}
            {mode === 'diff' && diff && <div className="mx-auto w-fit max-w-full overflow-hidden rounded-xl border border-border"><img src={diff.url} alt="Difference" className="block max-h-[70vh] max-w-full" /></div>}
          </div>}
      side={<>
        {aligned && <div className="space-y-2"><Pick label="A" side={a} onPick={load(setA)} /><Pick label="B" side={b} onPick={load(setB)} /><Button variant="ghost" size="sm" icon={<ArrowLeftRight className="size-4" />} onClick={() => { setA(b); setB(a) }}>Swap A and B</Button></div>}
        {diff && <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-border bg-surface-2/50 p-2"><div className="text-muted">Different pixels</div><div className={cn('text-lg font-semibold', diff.diffCount ? 'text-warn' : 'text-success')}>{diff.percent < 0.01 && diff.diffCount ? '<0.01' : diff.percent.toFixed(2)}%</div></div>
          <div className="rounded-xl border border-border bg-surface-2/50 p-2"><div className="text-muted">PSNR</div><div className="text-lg font-semibold">{Number.isFinite(diff.psnr) ? `${diff.psnr.toFixed(1)} dB` : 'Identical'}</div></div>
        </div>}
        {sizeMismatch && <Field label="Different sizes"><Segmented value={fit} onChange={setFit} options={[{ value: 'stretch', label: 'Stretch B' }, { value: 'top-left', label: 'Top left' }, { value: 'center', label: 'Centre' }]} /></Field>}
        {mode === 'onion' && <Slider label="B opacity" value={opacity} onChange={setOpacity} suffix="%" />}
        {mode === 'diff' && <>
          <Field label="Show"><Segmented value={diffMode} onChange={setDiffMode} options={[{ value: 'highlight', label: 'Highlight' }, { value: 'heatmap', label: 'Heatmap' }, { value: 'abs', label: 'Raw' }]} /></Field>
          <Slider label="Sensitivity threshold" value={threshold} onChange={setThreshold} min={0} max={50} suffix="%" />
          {diff && <Button variant="outline" className="w-full" icon={<Download className="size-4" />} onClick={async () => downloadBlob(await (await fetch(diff.url)).blob(), 'difference.png')}>Download difference image</Button>}
        </>}
        {!aligned && <Label>Add two images to compare them</Label>}
        <ErrorNote error={error} />
        {aligned && <Button variant="ghost" className="w-full" onClick={() => { setA(null); setB(null) }}>Start over</Button>}
      </>}
    />
  )
}
