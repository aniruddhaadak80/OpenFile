import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { PenLine, Download, Columns2 } from 'lucide-react'
import { Button, CopyButton, ErrorNote, Label, Progress, Slider, Switch, ToolGrid, cn, useJob } from '@/components/ui'
import { downloadBlob, formatBytes, baseName } from '@/lib/files'
import { ImageDrop, decode, hqResize, toCanvas, useObjectUrl } from './_img/kit'

type PresetId = 'default' | 'posterized' | 'sharp' | 'smooth' | 'detailed' | 'grayscale'
const PRESETS: { id: PresetId; label: string; sub: string; base: string; colors: number; blur: number }[] = [
  { id: 'default', label: 'Default', sub: 'Balanced', base: 'default', colors: 16, blur: 0 },
  { id: 'posterized', label: 'Posterized', sub: 'Few flat colors', base: 'posterized2', colors: 4, blur: 3 },
  { id: 'sharp', label: 'Sharp', sub: 'Logos & icons', base: 'sharp', colors: 12, blur: 0 },
  { id: 'smooth', label: 'Smooth', sub: 'Soft curves', base: 'smoothed', colors: 16, blur: 4 },
  { id: 'detailed', label: 'Detailed', sub: 'Photos · large', base: 'detailed', colors: 64, blur: 0 },
  { id: 'grayscale', label: 'Grayscale', sub: 'Shades of gray', base: 'grayscale', colors: 7, blur: 0 },
]

export default function ImageToSvg() {
  const [file, setFile] = useState<File | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [srcUrl, setSrcUrl] = useState<string | null>(null)
  const [preset, setPreset] = useState<PresetId>('default')
  const [colors, setColors] = useState(16)
  const [blur, setBlur] = useState(0)
  const [detail, setDetail] = useState(8)
  const [maxSide, setMaxSide] = useState(800)
  const [optimize, setOptimize] = useState(true)
  const [svg, setSvg] = useState<string | null>(null)
  const [view, setView] = useState<'side' | 'svg'>('side')
  const { busy, progress, error, run, setProgress } = useJob()
  const svgBlob = useMemo(() => (svg ? new Blob([svg], { type: 'image/svg+xml' }) : null), [svg])
  const svgUrl = useObjectUrl(svgBlob)
  const runId = useRef(0)

  const onFiles = useCallback(async (f: File[]) => { const im = await decode(f[0]); setFile(f[0]); setImg(im); setSrcUrl(URL.createObjectURL(f[0])); setSvg(null) }, [])

  const trace = useCallback(() => run(async () => {
    if (!img) return
    const id = ++runId.current
    setProgress(0.1)
    await new Promise((r) => setTimeout(r, 30))
    // @ts-ignore, imagetracerjs ships without types
    const { default: tracer }: any = await import('imagetracerjs')
    const w = img.naturalWidth, h = img.naturalHeight
    const s = Math.min(1, maxSide / Math.max(w, h))
    const c = s < 1 ? hqResize(img, w * s, h * s) : toCanvas(img)
    const ctx = c.getContext('2d')!
    const imgd = ctx.getImageData(0, 0, c.width, c.height)
    if (preset === 'grayscale') { const d = imgd.data; for (let i = 0; i < d.length; i += 4) { const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; d[i] = d[i + 1] = d[i + 2] = g } }
    setProgress(0.3)
    await new Promise((r) => setTimeout(r, 30))
    const p = PRESETS.find((x) => x.id === preset)!
    const opts = { ...tracer.optionpresets[p.base], numberofcolors: colors, blurradius: blur, blurdelta: blur ? 40 : 20, pathomit: detail, viewbox: false, desc: false, scale: 1 / s, roundcoords: 1 }
    let out: string = tracer.imagedataToSVG(imgd, tracer.checkoptions ? tracer.checkoptions(opts) : opts)
    out = out.replace(/<svg ([^>]*?)width="([\d.]+)" height="([\d.]+)"/, (_m: string, pre: string, sw: string, sh: string) => `<svg ${pre}width="${Math.round(+sw)}" height="${Math.round(+sh)}" viewBox="0 0 ${Math.round(+sw)} ${Math.round(+sh)}"`)
    setProgress(0.85)
    if (optimize) {
      try { const { optimize: opt } = await import('svgo/browser'); out = opt(out, { multipass: true, floatPrecision: 1 } as any).data } catch (e) { console.warn('svgo failed', e) }
    }
    if (id === runId.current) setSvg(out)
  }), [img, preset, colors, blur, detail, maxSide, optimize])

  useEffect(() => { if (img) { const t = setTimeout(trace, 250); return () => clearTimeout(t) } }, [img, preset, colors, blur, detail, maxSide, optimize])

  const reset = () => { setFile(null); setImg(null); setSvg(null) }
  if (!file || !img || !srcUrl) return <ImageDrop multiple={false} onFiles={onFiles} label="Drop a PNG or JPG to vectorize" sub="Logos, icons, illustrations and simple graphics trace best." />
  const paths = svg ? (svg.match(/<path/g) ?? []).length : 0

  return (
    <ToolGrid
      main={<>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex gap-1">
              <Button size="sm" variant={view === 'side' ? 'secondary' : 'ghost'} icon={<Columns2 className="size-4" />} onClick={() => setView('side')}>Side by side</Button>
              <Button size="sm" variant={view === 'svg' ? 'secondary' : 'ghost'} onClick={() => setView('svg')}>SVG only</Button>
            </div>
            {svg && <span className="text-xs text-muted">{paths} paths · <b className="text-fg">{formatBytes(svgBlob!.size)}</b></span>}
          </div>
          <div className={cn('grid gap-3', view === 'side' && 'sm:grid-cols-2')}>
            {view === 'side' && <div><div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Original · {formatBytes(file.size)}</div><div className="checker grid aspect-square place-items-center overflow-hidden rounded-xl border border-border"><img src={srcUrl} alt="Original" className="max-h-full max-w-full" /></div></div>}
            <div>
              {view === 'side' && <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Vector SVG</div>}
              <div className={cn('checker relative grid place-items-center overflow-hidden rounded-xl border border-border', view === 'side' ? 'aspect-square' : 'min-h-[50vh]')}>
                {svgUrl && <motion.img key={svgUrl} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} src={svgUrl} alt="SVG result" className={cn('max-w-full', view === 'side' ? 'max-h-full' : 'max-h-[64vh]')} />}
                {busy && <div className="glass absolute inset-x-3 bottom-3 rounded-lg p-2"><Progress value={progress} label="Tracing…" /></div>}
              </div>
            </div>
          </div>
        </div>
      </>}
      side={<>
        <div>
          <Label>Preset</Label>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => <button key={p.id} onClick={() => { setPreset(p.id); setColors(p.colors); setBlur(p.blur) }} className={cn('rounded-xl border px-3 py-2 text-left transition cursor-pointer', preset === p.id ? 'border-accent bg-accent/10 ring-2 ring-accent/20' : 'border-border hover:border-accent/50')}><div className="text-sm font-semibold">{p.label}</div><div className="text-[11px] text-muted">{p.sub}</div></button>)}
          </div>
        </div>
        <Slider label="Colors" value={colors} onChange={setColors} min={2} max={64} />
        <Slider label="Smoothing blur" value={blur} onChange={setBlur} min={0} max={5} />
        <Slider label="Ignore specks smaller than" value={detail} onChange={setDetail} min={0} max={40} suffix="px" />
        <Slider label="Trace resolution" value={maxSide} onChange={setMaxSide} min={200} max={2000} step={50} suffix="px" />
        <Switch checked={optimize} onChange={setOptimize} label="Optimize SVG (SVGO)" />
        <ErrorNote error={error} />
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={!svg} icon={<Download className="size-4" />} onClick={() => svgBlob && downloadBlob(svgBlob, `${baseName(file.name)}.svg`)}>Download</Button>
          <CopyButton text={() => svg ?? ''} label="Copy SVG" size="md" />
        </div>
        <Button variant="ghost" className="w-full" icon={<PenLine className="size-4" />} onClick={reset}>Start over</Button>
      </>}
    />
  )
}
