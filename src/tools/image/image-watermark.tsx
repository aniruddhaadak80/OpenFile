import { useCallback, useEffect, useRef, useState } from 'react'
import { Droplets, ImagePlus, Type, Grid3x3 } from 'lucide-react'
import { Button, ErrorNote, Field, Input, Label, Progress, Segmented, Select, Slider, Switch, ToolGrid, cn, useJob } from '@/components/ui'
import { BatchResults, ColorInput, FONT_CHOICES, ImageDrop, StatusPill, ThumbGrid, canvas, decode, ensureFont, exportCanvas, fmtFromMime, outName, useImageList, type Fmt, type Result } from './_img/kit'

type Pos = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br' | 'tile'
type O = { kind: 'text' | 'logo'; text: string; font: string; bold: boolean; color: string; outline: boolean; pos: Pos; opacity: number; rotation: number; size: number; margin: number; gap: number }
const GRID: Pos[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br']

function drawMark(ctx: CanvasRenderingContext2D, W: number, H: number, o: O, logo: HTMLImageElement | null) {
  const markW = (W * o.size) / 100
  let mw: number, mh: number, fontPx = 0
  if (o.kind === 'text') {
    if (!o.text.trim()) return
    ctx.font = `${o.bold ? 700 : 400} 100px "${o.font}", sans-serif`
    const m = ctx.measureText(o.text)
    fontPx = (100 * markW) / Math.max(1, m.width)
    mw = markW; mh = fontPx * 1.15
  } else {
    if (!logo) return
    mw = markW; mh = (logo.naturalHeight / logo.naturalWidth) * markW
  }
  const drawOne = (cx: number, cy: number) => {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate((o.rotation * Math.PI) / 180)
    if (o.kind === 'text') {
      ctx.font = `${o.bold ? 700 : 400} ${fontPx}px "${o.font}", sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      if (o.outline) { ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1, fontPx / 14); ctx.strokeStyle = isLight(o.color) ? 'rgba(0,0,0,.6)' : 'rgba(255,255,255,.7)'; ctx.strokeText(o.text, 0, 0) }
      ctx.fillStyle = o.color; ctx.fillText(o.text, 0, 0)
    } else ctx.drawImage(logo!, -mw / 2, -mh / 2, mw, mh)
    ctx.restore()
  }
  ctx.save(); ctx.globalAlpha = o.opacity / 100
  if (o.pos === 'tile') {
    const gx = mw * (1 + o.gap / 50), gy = mh * (1.6 + o.gap / 25)
    const diag = Math.hypot(W, H)
    ctx.translate(W / 2, H / 2)
    let row = 0
    for (let y = -diag / 2; y < diag / 2 + gy; y += gy, row++) for (let x = -diag / 2 - (row % 2 ? gx / 2 : 0); x < diag / 2 + gx; x += gx) drawOne(x, y)
  } else {
    const m = (Math.min(W, H) * o.margin) / 100
    const col = o.pos[1] === 'l' ? 0 : o.pos[1] === 'c' ? 1 : 2, r = o.pos[0] === 't' ? 0 : o.pos[0] === 'm' ? 1 : 2
    const cx = col === 0 ? m + mw / 2 : col === 1 ? W / 2 : W - m - mw / 2
    const cy = r === 0 ? m + mh / 2 : r === 1 ? H / 2 : H - m - mh / 2
    drawOne(cx, cy)
  }
  ctx.restore()
}
function isLight(hex: string) { const n = parseInt(hex.slice(1), 16); return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 150 }

export default function ImageWatermark() {
  const { items, add, remove, clear } = useImageList()
  const [sel, setSel] = useState<string | null>(null)
  const [o, setO] = useState<O>({ kind: 'text', text: '© OpenFile', font: 'Inter', bold: true, color: '#ffffff', outline: true, pos: 'br', opacity: 70, rotation: 0, size: 25, margin: 4, gap: 40 })
  const [logo, setLogo] = useState<HTMLImageElement | null>(null)
  const [logoName, setLogoName] = useState('')
  const [fmt, setFmt] = useState<'keep' | 'png' | 'jpg' | 'webp'>('keep')
  const [status, setStatus] = useState<Record<string, 'run' | 'done' | 'err'>>({})
  const [results, setResults] = useState<Result[] | null>(null)
  const [fontTick, setFontTick] = useState(0)
  const { busy, progress, error, run } = useJob()
  const prev = useRef<HTMLCanvasElement>(null)
  const logoIn = useRef<HTMLInputElement>(null)
  const set = (p: Partial<O>) => { setO((s) => ({ ...s, ...p })); setResults(null) }
  const onFiles = useCallback(async (f: File[]) => { const a = await add(f); setResults(null); if (a[0]) setSel((s) => s ?? a[0].id) }, [add])
  const reset = () => { clear(); setResults(null); setStatus({}); setSel(null) }
  const cur = items.find((i) => i.id === sel) ?? items[0]
  const [curImg, setCurImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => { if (cur) decode(cur.file).then(setCurImg).catch(() => {}) }, [cur?.id])
  useEffect(() => { ensureFont(o.font).then(() => setFontTick((t) => t + 1)) }, [o.font])

  useEffect(() => {
    const c = prev.current; if (!c || !curImg || !cur) return
    const s = Math.min(1, 1000 / Math.max(cur.w, cur.h))
    c.width = Math.round(cur.w * s); c.height = Math.round(cur.h * s)
    const ctx = c.getContext('2d')!
    ctx.drawImage(curImg, 0, 0, c.width, c.height)
    drawMark(ctx, c.width, c.height, o, logo)
  }, [curImg, o, logo, fontTick])

  const go = () => run(async (setP) => {
    if (o.kind === 'logo' && !logo) throw new Error('Choose a logo image first')
    await ensureFont(o.font)
    const out: Result[] = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      setStatus((s) => ({ ...s, [it.id]: 'run' }))
      try {
        const { canvas: c, ctx } = canvas(it.w, it.h)
        ctx.drawImage(await decode(it.file), 0, 0)
        drawMark(ctx, it.w, it.h, o, logo)
        let f: Fmt = fmt === 'keep' ? fmtFromMime(it.file.type, it.file.name) : fmt
        if (!['png', 'jpg', 'webp'].includes(f)) f = 'png'
        const blob = await exportCanvas(c, f, 0.93)
        out.push({ id: it.id, name: outName(it.file.name, f, '-watermarked'), blob, originalSize: it.file.size, url: URL.createObjectURL(blob) })
        setStatus((s) => ({ ...s, [it.id]: 'done' }))
      } catch (e) { setStatus((s) => ({ ...s, [it.id]: 'err' })); if (items.length === 1) throw e }
      setP((i + 1) / items.length)
    }
    setResults(out)
  })

  if (!items.length) return <ImageDrop onFiles={onFiles} label="Drop images to watermark" />

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="checker grid min-h-64 place-items-center overflow-hidden rounded-xl p-2"><canvas ref={prev} className="max-h-[60vh] max-w-full shadow-lg" /></div>
            <p className="mt-2 text-center text-[11px] text-muted">Live preview{items.length > 1 ? ' · click a thumbnail to preview another image' : ''}</p>
          </div>
          {items.length > 1 ? <ThumbGrid items={items} selected={cur?.id} onSelect={setSel} onRemove={(id) => { remove(id); setResults(null) }} onAdd={onFiles} extra={(it) => <StatusPill state={status[it.id]} />} /> : <ThumbGrid items={[]} onAdd={onFiles} />}
        </>}
        side={<>
          <Segmented value={o.kind} onChange={(kind) => set({ kind })} options={[{ value: 'text', label: <span className="flex items-center gap-1.5"><Type className="size-3.5" />Text</span> }, { value: 'logo', label: <span className="flex items-center gap-1.5"><ImagePlus className="size-3.5" />Logo</span> }]} />
          {o.kind === 'text' ? (<>
            <Field label="Text"><Input value={o.text} onChange={(e) => set({ text: e.target.value })} placeholder="© Your name" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Font"><Select value={o.font} onChange={(font) => set({ font })} options={FONT_CHOICES} /></Field>
              <Field label="Color"><ColorInput value={o.color} onChange={(color) => set({ color })} /></Field>
            </div>
            <div className="flex flex-wrap gap-4"><Switch checked={o.bold} onChange={(bold) => set({ bold })} label="Bold" /><Switch checked={o.outline} onChange={(outline) => set({ outline })} label="Outline" /></div>
          </>) : (
            <div>
              <input ref={logoIn} type="file" hidden accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setLogo(await decode(f)); setLogoName(f.name); setResults(null) } }} />
              <Button variant="outline" className="w-full" icon={<ImagePlus className="size-4" />} onClick={() => logoIn.current?.click()}>{logo ? 'Change logo' : 'Choose logo (PNG with transparency works best)'}</Button>
              {logoName && <p className="mt-1.5 truncate text-[11px] text-muted">{logoName}</p>}
            </div>
          )}
          <div>
            <Label>Position</Label>
            <div className="flex items-start gap-3">
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface-2/60 p-1">
                {GRID.map((p) => <button key={p} onClick={() => set({ pos: p })} className={cn('grid size-8 place-items-center rounded-lg cursor-pointer', o.pos === p ? 'bg-accent text-white' : 'hover:bg-surface')} aria-label={`Position ${p}`}><span className={cn('size-2 rounded-full', o.pos === p ? 'bg-white' : 'bg-muted/50')} /></button>)}
              </div>
              <button onClick={() => set({ pos: 'tile' })} className={cn('flex h-[106px] flex-1 flex-col items-center justify-center gap-1 rounded-xl border text-xs cursor-pointer', o.pos === 'tile' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-fg')}><Grid3x3 className="size-5" />Tiled</button>
            </div>
          </div>
          <Slider label="Size" value={o.size} onChange={(size) => set({ size })} min={3} max={90} suffix="% width" />
          <Slider label="Opacity" value={o.opacity} onChange={(opacity) => set({ opacity })} min={5} max={100} suffix="%" />
          <Slider label="Rotation" value={o.rotation} onChange={(rotation) => set({ rotation })} min={-90} max={90} suffix="°" />
          {o.pos === 'tile' ? <Slider label="Spacing" value={o.gap} onChange={(gap) => set({ gap })} min={0} max={150} /> : <Slider label="Margin" value={o.margin} onChange={(margin) => set({ margin })} min={0} max={20} suffix="%" />}
          <div><Label>Format</Label><Segmented value={fmt} onChange={(f) => { setFmt(f); setResults(null) }} options={[{ value: 'keep', label: 'Original' }, { value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WEBP' }]} /></div>
          {busy && <Progress value={progress} label="Watermarking" />}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} icon={<Droplets className="size-4" />} onClick={go}>Watermark {items.length} image{items.length > 1 ? 's' : ''}</Button>
          <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
        </>}
      />
      {results && <BatchResults results={results} zipName="watermarked-images.zip" onReset={reset} />}
    </div>
  )
}
