import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Crop, RotateCcw, RotateCw, FlipHorizontal2, FlipVertical2, ZoomIn, ZoomOut, Circle, Maximize } from 'lucide-react'
import { Button, ErrorNote, Field, Input, Label, ResultCard, Segmented, Select, Slider, Switch, ToolGrid, cn, useJob } from '@/components/ui'
import { ImageDrop, SOCIAL_SIZES, canvas, decode, exportCanvas, hqResize, outName, rotatedBounds, useObjectUrl, type Fmt } from './_img/kit'

type Box = { x: number; y: number; w: number; h: number }
type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const RATIOS: { id: string; label: string; r: number | null; out?: [number, number] }[] = [
  { id: 'free', label: 'Free', r: null }, { id: 'orig', label: 'Original', r: -1 }, { id: '1:1', label: '1:1', r: 1 }, { id: '4:3', label: '4:3', r: 4 / 3 }, { id: '3:4', label: '3:4', r: 3 / 4 },
  { id: '16:9', label: '16:9', r: 16 / 9 }, { id: '9:16', label: '9:16', r: 9 / 16 }, { id: '3:2', label: '3:2', r: 3 / 2 }, { id: '2:3', label: '2:3', r: 2 / 3 },
]
const MIN = 8

export default function ImageCropper() {
  const [file, setFile] = useState<File | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [angle, setAngle] = useState(0)
  const [flip, setFlip] = useState({ h: false, v: false })
  const [work, setWork] = useState<HTMLCanvasElement | null>(null)
  const [workBlob, setWorkBlob] = useState<Blob | null>(null)
  const [box, setBox] = useState<Box>({ x: 0, y: 0, w: 100, h: 100 })
  const [ratioId, setRatioId] = useState('free')
  const [social, setSocial] = useState('')
  const [circle, setCircle] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [fmt, setFmt] = useState<'png' | 'jpg' | 'webp'>('png')
  const [exportAtPreset, setExportAtPreset] = useState(true)
  const [result, setResult] = useState<Blob | null>(null)
  const { busy, error, run } = useJob()
  const stageWrap = useRef<HTMLDivElement>(null)
  const [wrapW, setWrapW] = useState(800)
  const drag = useRef<{ h: Handle; sx: number; sy: number; b: Box } | null>(null)
  const workUrl = useObjectUrl(workBlob)
  const resultUrl = useObjectUrl(result)

  const W = work?.width ?? 1, H = work?.height ?? 1
  const socialPreset = SOCIAL_SIZES.find((s) => s.id === social)
  const ratio: number | null = circle ? 1 : socialPreset ? socialPreset.w / socialPreset.h : (() => { const r = RATIOS.find((x) => x.id === ratioId)!.r; return r === -1 ? (img ? img.naturalWidth / img.naturalHeight : null) : r })()

  const onFiles = useCallback(async (f: File[]) => { const im = await decode(f[0]); setFile(f[0]); setImg(im); setAngle(0); setFlip({ h: false, v: false }); setResult(null)
    // keep the photo's own format so a crop of a JPG stays a small JPG
    const t = f[0].type.toLowerCase(), n = f[0].name.toLowerCase()
    setFmt(t === 'image/jpeg' || /\.jpe?g$/.test(n) ? 'jpg' : t === 'image/webp' || n.endsWith('.webp') ? 'webp' : 'png') }, [])

  // rebuild the rotated/flipped working canvas
  useEffect(() => {
    if (!img) return
    const { w, h } = rotatedBounds(img.naturalWidth, img.naturalHeight, angle)
    const { canvas: c, ctx } = canvas(w, h)
    ctx.translate(w / 2, h / 2); ctx.rotate((angle * Math.PI) / 180); ctx.scale(flip.h ? -1 : 1, flip.v ? -1 : 1)
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
    setWork(c)
    c.toBlob((b) => b && setWorkBlob(b), 'image/png')
  }, [img, angle, flip])

  const centered = useCallback((r: number | null, cw: number, ch: number, frac = 0.85): Box => {
    let w = cw * frac, h = ch * frac
    if (r) { if (w / h > r) w = h * r; else h = w / r }
    return { x: Math.round((cw - w) / 2), y: Math.round((ch - h) / 2), w: Math.round(w), h: Math.round(h) }
  }, [])
  useEffect(() => { if (work) setBox(centered(ratio, work.width, work.height)) }, [work?.width, work?.height, ratio])

  useLayoutEffect(() => {
    const el = stageWrap.current; if (!el) return
    const ro = new ResizeObserver(() => setWrapW(el.clientWidth))
    ro.observe(el); setWrapW(el.clientWidth)
    return () => ro.disconnect()
  }, [file])
  const maxH = typeof window !== 'undefined' ? window.innerHeight * 0.62 : 600
  const base = Math.min((wrapW - 16) / W, maxH / H, 1)
  const scale = base * zoom

  const clampBox = (b: Box): Box => {
    const w = Math.max(MIN, Math.min(b.w, W)), h = Math.max(MIN, Math.min(b.h, H))
    return { x: Math.round(Math.max(0, Math.min(b.x, W - w))), y: Math.round(Math.max(0, Math.min(b.y, H - h))), w: Math.round(w), h: Math.round(h) }
  }

  const onDown = (h: Handle) => (e: React.PointerEvent) => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as Element).setPointerCapture(e.pointerId); drag.current = { h, sx: e.clientX, sy: e.clientY, b: box } }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return
    const dx = (e.clientX - d.sx) / scale, dy = (e.clientY - d.sy) / scale, b = d.b
    if (d.h === 'move') { setBox(clampBox({ ...b, x: b.x + dx, y: b.y + dy })); return }
    if (d.h.length === 2) {
      const right = d.h.includes('e'), down = d.h.includes('s')
      const ax = right ? b.x : b.x + b.w, ay = down ? b.y : b.y + b.h
      const px = (right ? b.x + b.w : b.x) + dx, py = (down ? b.y + b.h : b.y) + dy
      let w = Math.max(MIN, right ? px - ax : ax - px), h = Math.max(MIN, down ? py - ay : ay - py)
      const mw = right ? W - ax : ax, mh = down ? H - ay : ay
      if (ratio) { if (w / h > ratio) h = w / ratio; else w = h * ratio; const s = Math.min(1, mw / w, mh / h); w *= s; h *= s }
      else { w = Math.min(w, mw); h = Math.min(h, mh) }
      setBox({ x: Math.round(right ? ax : ax - w), y: Math.round(down ? ay : ay - h), w: Math.round(w), h: Math.round(h) })
      return
    }
    let { x, y, w, h } = b
    if (d.h === 'e') w = Math.min(W - x, Math.max(MIN, b.w + dx))
    if (d.h === 'w') { const nx = Math.max(0, Math.min(b.x + b.w - MIN, b.x + dx)); w = b.x + b.w - nx; x = nx }
    if (d.h === 's') h = Math.min(H - y, Math.max(MIN, b.h + dy))
    if (d.h === 'n') { const ny = Math.max(0, Math.min(b.y + b.h - MIN, b.y + dy)); h = b.y + b.h - ny; y = ny }
    setBox({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) })
  }
  const onUp = () => { drag.current = null; setResult(null) }

  const setNum = (k: keyof Box, v: number) => {
    let b = { ...box, [k]: v }
    if (ratio && k === 'w') b.h = b.w / ratio
    if (ratio && k === 'h') b.w = b.h * ratio
    if (ratio && (b.w > W || b.h > H)) { const s = Math.min(W / b.w, H / b.h); b.w *= s; b.h *= s }
    setBox(clampBox(b)); setResult(null)
  }

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1
    const m: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (m[e.key]) { e.preventDefault(); setBox((b) => clampBox({ ...b, x: b.x + m[e.key][0], y: b.y + m[e.key][1] })) }
  }

  const doCrop = () => run(async () => {
    if (!work) return
    let outW = box.w, outH = box.h
    if (socialPreset && exportAtPreset) { outW = socialPreset.w; outH = socialPreset.h }
    const { canvas: piece, ctx: pctx } = canvas(box.w, box.h)
    pctx.drawImage(work, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h)
    let c = outW !== box.w || outH !== box.h ? hqResize(piece, outW, outH) : piece
    let f: Fmt = fmt
    if (circle) {
      const { canvas: cc, ctx } = canvas(c.width, c.height)
      ctx.beginPath(); ctx.ellipse(c.width / 2, c.height / 2, c.width / 2, c.height / 2, 0, 0, Math.PI * 2); ctx.closePath(); ctx.clip()
      ctx.drawImage(c, 0, 0); c = cc
      if (f === 'jpg') f = 'png'
    }
    setResult(await exportCanvas(c, f, 0.92))
  })

  const reset = () => { setFile(null); setImg(null); setWork(null); setWorkBlob(null); setResult(null); setZoom(1); setCircle(false); setSocial(''); setRatioId('free') }

  if (!file) return <ImageDrop multiple={false} onFiles={onFiles} label="Drop an image to crop" />

  const handles: Handle[] = ratio ? ['nw', 'ne', 'sw', 'se'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
  const hpos: Record<string, string> = { nw: 'left-0 top-0 cursor-nwse-resize', ne: 'left-full top-0 cursor-nesw-resize', sw: 'left-0 top-full cursor-nesw-resize', se: 'left-full top-full cursor-nwse-resize', n: 'left-1/2 top-0 cursor-ns-resize', s: 'left-1/2 top-full cursor-ns-resize', e: 'left-full top-1/2 cursor-ew-resize', w: 'left-0 top-1/2 cursor-ew-resize' }
  const outExt = circle && fmt === 'jpg' ? 'png' : fmt

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => setAngle((a) => ((a - 90 + 540) % 360) - 180)} aria-label="Rotate left" />
              <Button size="sm" variant="secondary" icon={<RotateCw className="size-4" />} onClick={() => setAngle((a) => ((a + 90 + 540) % 360) - 180)} aria-label="Rotate right" />
              <Button size="sm" variant={flip.h ? 'outline' : 'secondary'} icon={<FlipHorizontal2 className="size-4" />} onClick={() => setFlip((f) => ({ ...f, h: !f.h }))} aria-label="Flip horizontal" />
              <Button size="sm" variant={flip.v ? 'outline' : 'secondary'} icon={<FlipVertical2 className="size-4" />} onClick={() => setFlip((f) => ({ ...f, v: !f.v }))} aria-label="Flip vertical" />
              <div className="mx-1 h-6 w-px bg-border" />
              <Button size="sm" variant="secondary" icon={<ZoomOut className="size-4" />} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out" />
              <span className="w-12 text-center font-mono text-xs text-muted">{Math.round(zoom * 100)}%</span>
              <Button size="sm" variant="secondary" icon={<ZoomIn className="size-4" />} onClick={() => setZoom((z) => Math.min(6, +(z + 0.25).toFixed(2)))} aria-label="Zoom in" />
              <Button size="sm" variant="ghost" icon={<Maximize className="size-4" />} onClick={() => { setBox(centered(ratio, W, H, 1)); setResult(null) }}>Max</Button>
              <span className="ml-auto font-mono text-xs text-muted">{box.w}×{box.h}px</span>
            </div>
            <div ref={stageWrap} className="checker max-h-[66vh] overflow-auto rounded-xl scrollbar-thin" tabIndex={0} onKeyDown={onKey}>
              {workUrl && (
                <div className="relative mx-auto my-2 touch-none select-none" style={{ width: W * scale, height: H * scale }} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
                  <img src={workUrl} alt="" draggable={false} className="pointer-events-none block size-full" />
                  <div className="absolute overflow-visible" style={{ left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale }}>
                    <div className={cn('absolute inset-0 cursor-move border-2 border-white/90', circle && 'rounded-full')} style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,.55)' }} onPointerDown={onDown('move')}>
                      <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">{Array.from({ length: 9 }).map((_, i) => <div key={i} className="border border-white/25" />)}</div>
                    </div>
                    {handles.map((h) => <div key={h} onPointerDown={onDown(h)} className={cn('absolute z-10 -ml-2 -mt-2 size-4 rounded-full border-2 border-accent bg-white shadow', hpos[h])} />)}
                  </div>
                </div>
              )}
            </div>
            <p className="mt-2 text-center text-[11px] text-muted">Drag the box or its handles · arrow keys nudge (Shift = 10px)</p>
          </div>
          {result && resultUrl && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <ResultCard blob={result} filename={outName(file.name, outExt, '-cropped')} onReset={reset}>
                <div className="checker grid place-items-center rounded-xl p-3"><img src={resultUrl} alt="Cropped result" className={cn('max-h-72 max-w-full shadow-lg', circle && 'rounded-full')} /></div>
              </ResultCard>
            </motion.div>
          )}
        </>}
        side={<>
          <div>
            <Label>Aspect ratio</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {RATIOS.map((r) => <button key={r.id} disabled={circle} onClick={() => { setRatioId(r.id); setSocial(''); setResult(null) }} className={cn('rounded-lg border px-2 py-1.5 text-xs font-medium transition cursor-pointer disabled:opacity-40', !social && !circle && ratioId === r.id ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:border-accent/50')}>{r.label}</button>)}
            </div>
          </div>
          <Field label="Social preset">
            <Select value={social} onChange={(v) => { setSocial(v); setCircle(false); setResult(null) }} options={[{ value: '', label: '(none)' }, ...SOCIAL_SIZES.map((s) => ({ value: s.id, label: s.label }))]} />
          </Field>
          {socialPreset && <Switch checked={exportAtPreset} onChange={setExportAtPreset} label={`Export at ${socialPreset.w}×${socialPreset.h}`} />}
          <Switch checked={circle} onChange={(v) => { setCircle(v); if (v) setSocial(''); setResult(null) }} label={<span className="flex items-center gap-1.5"><Circle className="size-4" /> Circle avatar (transparent)</span>} />
          <Slider label="Straighten / rotate" value={angle} onChange={(a) => { setAngle(a); setResult(null) }} min={-180} max={180} suffix="°" />
          <div>
            <Label>Position & size (px)</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['x', 'y', 'w', 'h'] as const).map((k) => (
                <label key={k} className="flex items-center gap-2 rounded-xl border border-border bg-surface-2/60 px-2.5"><span className="w-3 text-xs font-bold uppercase text-muted">{k}</span>
                  <input type="number" value={box[k]} onChange={(e) => setNum(k, Number(e.target.value) || 0)} className="h-9 w-full min-w-0 bg-transparent font-mono text-sm outline-none" /></label>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-muted">Canvas {W}×{H}px</p>
          </div>
          <div>
            <Label>Format</Label>
            <Segmented value={fmt} onChange={(f) => { setFmt(f); setResult(null) }} options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WEBP' }]} />
            {circle && fmt === 'jpg' && <p className="mt-1.5 text-[11px] text-muted">Circle crops are saved as PNG to keep transparency.</p>}
          </div>
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} icon={<Crop className="size-4" />} onClick={doCrop}>Crop image</Button>
          <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
        </>}
      />
    </div>
  )
}
