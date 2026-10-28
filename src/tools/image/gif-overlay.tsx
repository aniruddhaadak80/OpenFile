import { useEffect, useRef, useState } from 'react'
import { Trash2, Type, ImagePlus, Pencil, Eraser } from 'lucide-react'
import { Button, Input, Label, Segmented, Select, Slider, ToolGrid, ErrorNote, Spinner, cn } from '@/components/ui'
import { type Anim, cropAnim, mapFramesCanvas } from '@/lib/b3/anim'
import { ensureFont, FONT_CHOICES } from '@/tools/image/_img/kit'
import { AnimBar, AnimDrop, AnimPlayer, AnimStats, ColorInput, ExportPanel, Loading, useAnim, usePreview } from './_b3/anim-ui'

type TextL = { id: number; kind: 'text'; text: string; font: string; size: number; color: string; stroke: string; strokeW: number; x: number; y: number; from: number; to: number; anim: 'none' | 'fade' | 'typewriter' | 'bounce' }
type ImgL = { id: number; kind: 'image'; bmp: ImageBitmap; name: string; x: number; y: number; scale: number; opacity: number; from: number; to: number }
type Layer = TextL | ImgL
type Stroke = { color: string; width: number; pts: [number, number][] }
let uid = 1

function drawLayers(ctx: CanvasRenderingContext2D, layers: Layer[], strokes: Stroke[], i: number, n: number, W: number, H: number, oy: number) {
  for (const L of layers) {
    if (i < L.from - 1 || i > L.to - 1) continue
    const local = (i - (L.from - 1)) / Math.max(1, L.to - L.from)
    if (L.kind === 'image') {
      ctx.globalAlpha = L.opacity
      const w = L.bmp.width * L.scale, h = L.bmp.height * L.scale
      ctx.drawImage(L.bmp, (L.x / 100) * W - w / 2, oy + (L.y / 100) * (H - oy) - h / 2, w, h)
      ctx.globalAlpha = 1
      continue
    }
    let text = L.text
    let alpha = 1, dy = 0
    if (L.anim === 'fade') alpha = Math.min(1, local * 3, (1 - local) * 3 + 0.0001)
    if (L.anim === 'typewriter') text = text.slice(0, Math.max(1, Math.ceil(text.length * Math.min(1, local * 1.5))))
    if (L.anim === 'bounce') dy = -Math.abs(Math.sin(local * Math.PI * 3)) * L.size * 0.4
    ctx.globalAlpha = Math.max(0, alpha)
    ctx.font = `bold ${L.size}px "${L.font}", sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'
    const lines = text.split('\n')
    const x = (L.x / 100) * W, y0 = (L.y / 100) * H + dy - ((lines.length - 1) * L.size * 1.15) / 2
    lines.forEach((ln, k) => {
      const y = y0 + k * L.size * 1.15
      if (L.strokeW) { ctx.strokeStyle = L.stroke; ctx.lineWidth = L.strokeW * 2; ctx.strokeText(ln, x, y) }
      ctx.fillStyle = L.color; ctx.fillText(ln, x, y)
    })
    ctx.globalAlpha = 1
  }
  for (const s of strokes) {
    if (s.pts.length < 1) continue
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(s.pts[0][0], s.pts[0][1]); for (const p of s.pts.slice(1)) ctx.lineTo(p[0], p[1]); if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]); ctx.stroke()
  }
  void n
}

function newText(n: number, p: Partial<TextL> = {}): TextL {
  return { id: uid++, kind: 'text', text: 'Your text', font: 'Impact', size: 36, color: '#ffffff', stroke: '#000000', strokeW: 3, x: 50, y: 85, from: 1, to: n, anim: 'none', ...p }
}

export default function GifOverlay() {
  const { file, anim, loading, progress, error, load, reset } = useAnim()
  const [layers, setLayers] = useState<Layer[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [caption, setCaption] = useState('')
  const [capSize, setCapSize] = useState(28)
  const [capPos, setCapPos] = useState<'top' | 'bottom'>('top')
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [pen, setPen] = useState(false)
  const [penColor, setPenColor] = useState('#F5A524')
  const [penW, setPenW] = useState(6)
  const n = anim?.frames.length ?? 1
  useEffect(() => { if (anim && !layers.length) { const t = newText(anim.frames.length, { size: Math.max(14, Math.round(anim.width / 12)) }); setLayers([t]); setSel(t.id) } }, [anim]) // eslint-disable-line react-hooks/exhaustive-deps

  const barH = caption.trim() && anim ? Math.round(capSize * 1.4 * caption.split('\n').length + capSize * 0.6) : 0
  const build = async (a: Anim, onProgress?: (p: number) => void): Promise<Anim> => {
    await Promise.all(layers.filter((l): l is TextL => l.kind === 'text').map((l) => ensureFont(l.font).catch(() => {})))
    let base = a
    if (barH) base = cropAnim(a, 0, capPos === 'top' ? -barH : 0, a.width, a.height + barH, [255, 255, 255, 255])
    const oy = capPos === 'top' ? barH : 0
    return mapFramesCanvas(base, (ctx, fi) => {
      if (barH) {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, capPos === 'top' ? 0 : a.height, a.width, barH)
        ctx.fillStyle = '#000000'; ctx.font = `600 ${capSize}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        const lines = caption.split('\n'); const top = capPos === 'top' ? 0 : a.height
        lines.forEach((ln, k) => ctx.fillText(ln, a.width / 2, top + barH / 2 + (k - (lines.length - 1) / 2) * capSize * 1.3, a.width - 16))
      }
      ctx.save(); ctx.translate(0, oy)
      // layers use the original picture area
      drawLayers(ctx, layers, strokes, fi, a.frames.length, a.width, a.height, 0)
      ctx.restore()
    }, onProgress)
  }
  const preview = usePreview(async () => (anim ? build(anim) : null), [anim, layers, strokes, caption, capSize, capPos], 300)
  const prepare = () => build(anim!)

  const selL = layers.find((l) => l.id === sel) ?? null
  const patch = (p: Partial<TextL> | Partial<ImgL>) => setLayers((ls) => ls.map((l) => (l.id === sel ? ({ ...l, ...p } as Layer) : l)))
  const addImage = async (f: File) => {
    const bmp = await createImageBitmap(f)
    const scale = Math.min(1, (anim!.width * 0.3) / bmp.width)
    const L: ImgL = { id: uid++, kind: 'image', bmp, name: f.name, x: 80, y: 20, scale, opacity: 1, from: 1, to: n }
    setLayers((ls) => [...ls, L]); setSel(L.id)
  }
  const start = () => { reset(); setLayers([]); setStrokes([]); setCaption('') }

  if (!file) return <AnimDrop onFile={load} label="Drop a GIF, APNG or animated WebP to add text, a logo or drawings" />
  if (loading) return <Loading progress={progress} />
  if (!anim) return <div className="space-y-3"><ErrorNote error={error} /><Button variant="outline" onClick={start}>Try another file</Button></div>
  const shown = preview.value ?? anim

  return (
    <ToolGrid
      main={<>
        <AnimBar file={file} onReset={start}>{preview.busy && <Spinner label="Updating preview" />}</AnimBar>
        {pen ? <DrawPad anim={anim} strokes={strokes} setStrokes={setStrokes} color={penColor} width={penW} /> : <AnimPlayer anim={shown} />}
        <AnimStats anim={shown} />
        <ErrorNote error={preview.error} />
      </>}
      side={<>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={<Type className="size-4" />} onClick={() => { const t = newText(n, { y: 15 }); setLayers((l) => [...l, t]); setSel(t.id); setPen(false) }}>Text</Button>
          <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-xl bg-surface-2 px-3 text-xs font-medium hover:bg-border"><ImagePlus className="size-4" />Image<input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addImage(f) }} /></label>
          <Button size="sm" variant={pen ? 'primary' : 'secondary'} icon={<Pencil className="size-4" />} onClick={() => setPen(!pen)}>{pen ? 'Done drawing' : 'Draw'}</Button>
        </div>
        {pen ? (
          <div className="space-y-3">
            <div><Label>Pen colour</Label><ColorInput value={penColor} onChange={setPenColor} /></div>
            <Slider label="Pen size" value={penW} onChange={setPenW} min={1} max={40} suffix="px" />
            <Button size="sm" variant="outline" icon={<Eraser className="size-4" />} onClick={() => setStrokes([])} disabled={!strokes.length}>Clear drawing</Button>
            <p className="text-xs text-muted">Drawings show on every frame.</p>
          </div>
        ) : <>
          {layers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {layers.map((l, k) => <button key={l.id} onClick={() => setSel(l.id)} className={cn('max-w-36 truncate rounded-lg px-2 py-1 text-xs cursor-pointer', sel === l.id ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted hover:text-fg')}>{l.kind === 'text' ? l.text.split('\n')[0] || `Text ${k + 1}` : l.name}</button>)}
            </div>
          )}
          {selL?.kind === 'text' && (
            <div className="space-y-3">
              <textarea value={selL.text} onChange={(e) => patch({ text: e.target.value })} rows={2} aria-label="Text" className="w-full rounded-xl border border-border bg-surface-2/60 px-3 py-2 text-sm text-fg outline-none focus:border-accent" />
              <div className="grid grid-cols-2 gap-2">
                <Select value={selL.font} onChange={(v) => patch({ font: v })} options={FONT_CHOICES} />
                <Select value={selL.anim} onChange={(v) => patch({ anim: v as TextL['anim'] })} options={[{ value: 'none', label: 'No motion' }, { value: 'fade', label: 'Fade' }, { value: 'typewriter', label: 'Typewriter' }, { value: 'bounce', label: 'Bounce' }]} />
              </div>
              <Slider label="Size" value={selL.size} onChange={(v) => patch({ size: v })} min={8} max={200} suffix="px" />
              <div className="grid grid-cols-2 gap-2"><div><Label>Fill</Label><ColorInput value={selL.color} onChange={(v) => patch({ color: v })} /></div><div><Label>Outline</Label><ColorInput value={selL.stroke} onChange={(v) => patch({ stroke: v })} /></div></div>
              <Slider label="Outline width" value={selL.strokeW} onChange={(v) => patch({ strokeW: v })} min={0} max={12} />
              <div className="grid grid-cols-2 gap-2"><Slider label="Left / right" value={selL.x} onChange={(v) => patch({ x: v })} min={0} max={100} suffix="%" /><Slider label="Up / down" value={selL.y} onChange={(v) => patch({ y: v })} min={0} max={100} suffix="%" /></div>
            </div>
          )}
          {selL?.kind === 'image' && (
            <div className="space-y-3">
              <Slider label="Scale" value={Math.round(selL.scale * 100)} onChange={(v) => patch({ scale: v / 100 })} min={5} max={300} suffix="%" />
              <Slider label="Opacity" value={Math.round(selL.opacity * 100)} onChange={(v) => patch({ opacity: v / 100 })} min={5} max={100} suffix="%" />
              <div className="grid grid-cols-2 gap-2"><Slider label="Left / right" value={selL.x} onChange={(v) => patch({ x: v })} min={0} max={100} suffix="%" /><Slider label="Up / down" value={selL.y} onChange={(v) => patch({ y: v })} min={0} max={100} suffix="%" /></div>
            </div>
          )}
          {selL && n > 1 && (
            <div className="grid grid-cols-2 gap-2">
              <Slider label="From frame" value={selL.from} onChange={(v) => patch({ from: Math.min(v, selL.to) })} min={1} max={n} />
              <Slider label="To frame" value={selL.to} onChange={(v) => patch({ to: Math.max(v, selL.from) })} min={1} max={n} />
            </div>
          )}
          {selL && <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => { setLayers((ls) => ls.filter((l) => l.id !== sel)); setSel(null) }}>Remove layer</Button>}
        </>}
        <div className="space-y-2 border-t border-border pt-4">
          <Label>Caption bar</Label>
          <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Text in a white box above the picture" />
          {caption && <div className="grid grid-cols-2 gap-2"><Segmented value={capPos} onChange={setCapPos} options={[{ value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }]} /><Slider value={capSize} onChange={setCapSize} min={10} max={80} /></div>}
        </div>
        <ExportPanel anim={shown} prepare={prepare} name={file.name} suffix="-text" defaultFmt={anim.source === 'WebP' ? 'webp' : 'gif'} originalSize={file.size} onReset={start} />
      </>}
    />
  )
}

function DrawPad({ anim, strokes, setStrokes, color, width }: { anim: Anim; strokes: Stroke[]; setStrokes: (fn: (s: Stroke[]) => Stroke[]) => void; color: string; width: number }) {
  const c = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  useEffect(() => {
    const cv = c.current; if (!cv) return
    cv.width = anim.width; cv.height = anim.height
    const ctx = cv.getContext('2d')!
    ctx.putImageData(new ImageData(new Uint8ClampedArray(anim.frames[0].rgba), anim.width, anim.height), 0, 0)
    drawLayers(ctx, [], strokes, 0, 1, anim.width, anim.height, 0)
  }, [anim, strokes])
  const pt = (e: React.PointerEvent): [number, number] => { const r = c.current!.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * anim.width, ((e.clientY - r.top) / r.height) * anim.height] }
  return (
    <div className="checker grid place-items-center rounded-2xl border border-border p-2">
      <canvas ref={c} aria-label="Drawing area" className="max-h-[60vh] max-w-full cursor-crosshair touch-none"
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drawing.current = true; const p = pt(e); setStrokes((s) => [...s, { color, width, pts: [p] }]) }}
        onPointerMove={(e) => { if (!drawing.current) return; const p = pt(e); setStrokes((s) => { const last = s[s.length - 1]; return [...s.slice(0, -1), { ...last, pts: [...last.pts, p] }] }) }}
        onPointerUp={() => { drawing.current = false }} />
    </div>
  )
}
