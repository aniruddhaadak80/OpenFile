import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Copy, ClipboardPaste, ImagePlus, Monitor, Shuffle } from 'lucide-react'
import { Button, ErrorNote, Field, Input, Label, Segmented, Select, Slider, Tabs, ToolGrid, cn, useJob } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob, baseName } from '@/lib/files'
import { ColorInput, ImageDrop, canvas, decode, rrect, useDebounced, usePasteImages, type Drawable } from './_img/kit'

const GRADIENTS: { name: string; a: number; s: string[] }[] = [
  { name: 'Hyper', a: 135, s: ['#ec4899', '#ef4444', '#eab308'] }, { name: 'Ocean', a: 135, s: ['#06b6d4', '#3b82f6', '#6366f1'] },
  { name: 'Aurora', a: 120, s: ['#22d3ee', '#a855f7', '#ec4899'] }, { name: 'Sunset', a: 160, s: ['#f97316', '#db2777', '#7c3aed'] },
  { name: 'Mint', a: 135, s: ['#a7f3d0', '#34d399', '#059669'] }, { name: 'Peach', a: 135, s: ['#fecaca', '#fdba74', '#fde68a'] },
  { name: 'Midnight', a: 135, s: ['#0f172a', '#312e81', '#1e1b4b'] }, { name: 'Candy', a: 45, s: ['#f9a8d4', '#c4b5fd', '#93c5fd'] },
  { name: 'Lime', a: 135, s: ['#d9f99d', '#4ade80', '#14b8a6'] }, { name: 'Royal', a: 135, s: ['#4f46e5', '#7c3aed', '#c026d3'] },
  { name: 'Fire', a: 180, s: ['#fde047', '#f97316', '#dc2626'] }, { name: 'Steel', a: 135, s: ['#e2e8f0', '#94a3b8', '#475569'] },
  { name: 'Lagoon', a: 200, s: ['#2dd4bf', '#0ea5e9', '#1e3a8a'] }, { name: 'Berry', a: 135, s: ['#be185d', '#7e22ce', '#312e81'] },
  { name: 'Cotton', a: 90, s: ['#fbcfe8', '#e9d5ff', '#bfdbfe'] }, { name: 'Forest', a: 150, s: ['#14532d', '#166534', '#4d7c0f'] },
  { name: 'Gold', a: 135, s: ['#fef3c7', '#fbbf24', '#b45309'] }, { name: 'Neon', a: 120, s: ['#00f5a0', '#00d9f5', '#7f5af0'] },
]
const ASPECTS: { id: string; label: string; r: number | null }[] = [
  { id: 'auto', label: 'Auto', r: null }, { id: '16:9', label: '16:9', r: 16 / 9 }, { id: '4:3', label: '4:3', r: 4 / 3 }, { id: '1:1', label: '1:1', r: 1 },
  { id: '4:5', label: '4:5', r: 4 / 5 }, { id: '9:16', label: '9:16', r: 9 / 16 }, { id: '3:1', label: 'X header 3:1', r: 3 },
]
type Bg = 'gradient' | 'solid' | 'image' | 'none'
type Frame = 'none' | 'mac-light' | 'mac-dark'
type O = { bg: Bg; grad: number; solid: string; padding: number; radius: number; shadow: number; frame: Frame; url: string; aspect: string; inset: number; insetColor: string; rotate: number; tiltX: number; tiltY: number; watermark: string }

/* ---------- perspective mesh warp (canvas 2D has no 3D transforms) ---------- */
function tri(ctx: CanvasRenderingContext2D, img: Drawable, s: number[], d: number[]) {
  const [x0, y0, x1, y1, x2, y2] = s, [u0, v0, u1, v1, u2, v2] = d
  const den = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1)
  if (!den) return
  const a = (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / den
  const b = (v0 * (y1 - y2) + v1 * (y2 - y0) + v2 * (y0 - y1)) / den
  const c = (u0 * (x2 - x1) + u1 * (x0 - x2) + u2 * (x1 - x0)) / den
  const dd = (v0 * (x2 - x1) + v1 * (x0 - x2) + v2 * (x1 - x0)) / den
  const e = (u0 * (x1 * y2 - x2 * y1) + u1 * (x2 * y0 - x0 * y2) + u2 * (x0 * y1 - x1 * y0)) / den
  const f = (v0 * (x1 * y2 - x2 * y1) + v1 * (x2 * y0 - x0 * y2) + v2 * (x0 * y1 - x1 * y0)) / den
  const cx = (u0 + u1 + u2) / 3, cy = (v0 + v1 + v2) / 3, grow = (x: number, y: number): [number, number] => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [x + (dx / l) * 0.8, y + (dy / l) * 0.8] }
  ctx.save(); ctx.beginPath()
  ctx.moveTo(...grow(u0, v0)); ctx.lineTo(...grow(u1, v1)); ctx.lineTo(...grow(u2, v2)); ctx.closePath(); ctx.clip()
  ctx.transform(a, b, c, dd, e, f); ctx.drawImage(img, 0, 0); ctx.restore()
}
function warp3d(src: HTMLCanvasElement, rx: number, ry: number) {
  const w = src.width, h = src.height, f = Math.max(w, h) * 2.2
  const ax = (rx * Math.PI) / 180, ay = (ry * Math.PI) / 180
  const P = (x: number, y: number): [number, number] => {
    let X = x - w / 2, Y = y - h / 2, Z = 0
    const X1 = X * Math.cos(ay) + Z * Math.sin(ay); Z = -X * Math.sin(ay) + Z * Math.cos(ay); X = X1
    const Y1 = Y * Math.cos(ax) - Z * Math.sin(ax); Z = Y * Math.sin(ax) + Z * Math.cos(ax); Y = Y1
    const k = f / (f + Z); return [X * k, Y * k]
  }
  const N = 18
  const pts: [number, number][][] = []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let j = 0; j <= N; j++) { pts.push([]); for (let i = 0; i <= N; i++) { const p = P((i / N) * w, (j / N) * h); pts[j].push(p); minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]) } }
  const { canvas: out, ctx } = canvas(maxX - minX + 2, maxY - minY + 2)
  ctx.translate(-minX + 1, -minY + 1)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const sx0 = (i / N) * w, sx1 = ((i + 1) / N) * w, sy0 = (j / N) * h, sy1 = ((j + 1) / N) * h
    const p00 = pts[j][i], p10 = pts[j][i + 1], p01 = pts[j + 1][i], p11 = pts[j + 1][i + 1]
    tri(ctx, src, [sx0, sy0, sx1, sy0, sx0, sy1], [...p00, ...p10, ...p01])
    tri(ctx, src, [sx1, sy0, sx1, sy1, sx0, sy1], [...p10, ...p11, ...p01])
  }
  return out
}

function render(shot: Drawable, sw: number, sh: number, o: O, bgImg: HTMLImageElement | null, scale: number) {
  const k = scale
  const w = sw * k, h = sh * k
  const unit = Math.max(w, h) / 1000
  const bar = o.frame === 'none' ? 0 : Math.max(22 * k, Math.round(w * 0.034))
  const inset = (o.inset / 100) * Math.min(w, h) * 0.15
  const ww = w + inset * 2, wh = h + inset * 2 + bar
  const rad = (o.radius / 100) * Math.min(ww, wh) * 0.12
  // window layer
  const { canvas: win, ctx: wctx } = canvas(ww, wh)
  rrect(wctx, 0, 0, ww, wh, rad); wctx.clip()
  if (inset > 0) { wctx.fillStyle = o.insetColor; wctx.fillRect(0, 0, ww, wh) }
  if (bar) {
    const dark = o.frame === 'mac-dark'
    wctx.fillStyle = dark ? '#2a2b30' : '#ececef'; wctx.fillRect(0, 0, ww, bar)
    wctx.fillStyle = dark ? '#1c1d21' : '#d9d9de'; wctx.fillRect(0, bar - Math.max(1, k), ww, Math.max(1, k))
    const r = bar * 0.17, cy = bar / 2
    ;['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { wctx.beginPath(); wctx.arc(bar * 0.55 + i * r * 3.2, cy, r, 0, Math.PI * 2); wctx.fillStyle = c; wctx.fill() })
    if (o.url) {
      const pw = Math.min(ww * 0.5, Math.max(ww * 0.25, o.url.length * bar * 0.32)), ph = bar * 0.56
      rrect(wctx, (ww - pw) / 2, (bar - ph) / 2, pw, ph, ph * 0.3); wctx.fillStyle = dark ? '#3a3b41' : '#ffffff'; wctx.fill()
      wctx.fillStyle = dark ? '#c9cad1' : '#55575f'; wctx.font = `500 ${bar * 0.3}px Inter, system-ui, sans-serif`; wctx.textAlign = 'center'; wctx.textBaseline = 'middle'
      wctx.fillText(o.url, ww / 2, bar / 2, pw - bar * 0.4)
    }
  }
  const innerR = inset > 0 ? Math.max(0, rad - inset * 0.6) : 0
  wctx.save(); if (inset > 0) { rrect(wctx, inset, bar + inset, w, h, innerR); wctx.clip() }
  wctx.drawImage(shot, inset, bar + inset, w, h); wctx.restore()

  // transform (rotate / 3D tilt)
  let layer: HTMLCanvasElement = win
  if (o.tiltX || o.tiltY) layer = warp3d(win, o.tiltX, o.tiltY)
  if (o.rotate) {
    const a = (o.rotate * Math.PI) / 180, bw = Math.abs(layer.width * Math.cos(a)) + Math.abs(layer.height * Math.sin(a)), bh = Math.abs(layer.width * Math.sin(a)) + Math.abs(layer.height * Math.cos(a))
    const { canvas: r, ctx } = canvas(bw, bh); ctx.translate(bw / 2, bh / 2); ctx.rotate(a); ctx.drawImage(layer, -layer.width / 2, -layer.height / 2); layer = r
  }
  // canvas size
  const pad = (o.padding / 100) * Math.max(ww, wh) * 0.5
  let W = layer.width + pad * 2, H = layer.height + pad * 2
  const ar = ASPECTS.find((a) => a.id === o.aspect)?.r
  if (ar) { if (W / H > ar) H = W / ar; else W = H * ar }
  const { canvas: out, ctx } = canvas(W, H)
  if (o.bg === 'gradient') {
    const g = GRADIENTS[o.grad], a = ((g.a - 90) * Math.PI) / 180, len = Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a))
    const gr = ctx.createLinearGradient(W / 2 - (Math.cos(a) * len) / 2, H / 2 - (Math.sin(a) * len) / 2, W / 2 + (Math.cos(a) * len) / 2, H / 2 + (Math.sin(a) * len) / 2)
    g.s.forEach((c, i) => gr.addColorStop(i / (g.s.length - 1), c)); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H)
  } else if (o.bg === 'solid') { ctx.fillStyle = o.solid; ctx.fillRect(0, 0, W, H) }
  else if (o.bg === 'image' && bgImg) { const s = Math.max(W / bgImg.naturalWidth, H / bgImg.naturalHeight); ctx.drawImage(bgImg, (W - bgImg.naturalWidth * s) / 2, (H - bgImg.naturalHeight * s) / 2, bgImg.naturalWidth * s, bgImg.naturalHeight * s) }
  const x = (W - layer.width) / 2, y = (H - layer.height) / 2
  if (o.shadow > 0) { ctx.save(); ctx.shadowColor = `rgba(0,0,0,${0.15 + o.shadow / 180})`; ctx.shadowBlur = (o.shadow / 100) * 90 * unit; ctx.shadowOffsetY = (o.shadow / 100) * 30 * unit; ctx.drawImage(layer, x, y); ctx.restore() }
  else ctx.drawImage(layer, x, y)
  if (o.watermark) {
    const fs = Math.max(11 * k, Math.min(W, H) * 0.022)
    ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = fs * 0.4
    ctx.fillText(o.watermark, W - fs * 1.2, H - fs * 0.9)
  }
  return out
}

const DEFAULT: O = { bg: 'gradient', grad: 2, solid: '#111827', padding: 14, radius: 18, shadow: 55, frame: 'mac-light', url: '', aspect: 'auto', inset: 0, insetColor: '#ffffff', rotate: 0, tiltX: 0, tiltY: 0, watermark: '' }

export default function ScreenshotStudio() {
  const [file, setFile] = useState<File | null>(null)
  const [shot, setShot] = useState<HTMLImageElement | null>(null)
  const [o, setO] = useState<O>(DEFAULT)
  const [bgImg, setBgImg] = useState<HTMLImageElement | null>(null)
  const [tab, setTab] = useState<'bg' | 'frame' | 'effects'>('bg')
  const [scale, setScale] = useState<'1' | '2'>('2')
  const { busy, error, run } = useJob()
  const prev = useRef<HTMLCanvasElement>(null)
  const bgIn = useRef<HTMLInputElement>(null)
  const set = (p: Partial<O>) => setO((s) => ({ ...s, ...p }))

  const onFiles = useCallback(async (f: File[]) => { const im = await decode(f[0]); setFile(f[0]); setShot(im) }, [])
  usePasteImages(onFiles, !!file) // replace screenshot by pasting once loaded (ImageDrop handles the empty state)
  const pasteBtn = async () => {
    try {
      const items = await navigator.clipboard.read()
      for (const it of items) { const t = it.types.find((x) => x.startsWith('image/')); if (t) { const b = await it.getType(t); return onFiles([new File([b], 'screenshot.png', { type: t })]) } }
      toast('No image on the clipboard', 'info')
    } catch { toast('Clipboard access was blocked — press Ctrl/⌘ V instead', 'info') }
  }

  const dO = useDebounced(o, 30)
  useEffect(() => {
    const c = prev.current; if (!c || !shot) return
    const s = Math.min(1, 1000 / Math.max(shot.naturalWidth, shot.naturalHeight))
    const r = render(shot, shot.naturalWidth, shot.naturalHeight, dO, bgImg, s)
    c.width = r.width; c.height = r.height; c.getContext('2d')!.drawImage(r, 0, 0)
  }, [shot, dO, bgImg])

  const full = () => render(shot!, shot!.naturalWidth, shot!.naturalHeight, o, bgImg, Number(scale))
  const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('Image too large to export — try 1×'))), 'image/png'))
  const download = () => run(async () => { downloadBlob(await toBlob(full()), `${baseName(file!.name)}-studio@${scale}x.png`) })
  const copy = () => run(async () => {
    if (!('ClipboardItem' in window)) throw new Error('Copying images is not supported in this browser — use Download.')
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob(full()) })])
    toast('Copied image to clipboard')
  })

  if (!file || !shot) return (
    <div className="space-y-3">
      <ImageDrop multiple={false} onFiles={onFiles} label="Drop or paste a screenshot" sub="Tip: take a screenshot, then press Ctrl/⌘ V right here." />
      <div className="text-center"><Button variant="outline" icon={<ClipboardPaste className="size-4" />} onClick={pasteBtn}>Paste from clipboard</Button></div>
    </div>
  )

  return (
    <ToolGrid
      main={<>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="checker grid min-h-72 place-items-center overflow-hidden rounded-xl p-3"><canvas ref={prev} className="max-h-[66vh] max-w-full rounded-md" /></div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" variant="ghost" icon={<Shuffle className="size-4" />} onClick={() => set({ bg: 'gradient', grad: Math.floor(Math.random() * GRADIENTS.length) })}>Random gradient</Button>
            <Button size="sm" variant="ghost" icon={<ClipboardPaste className="size-4" />} onClick={pasteBtn}>Paste new</Button>
            <Button size="sm" variant="ghost" onClick={() => setO(DEFAULT)}>Reset style</Button>
          </div>
        </div>
      </>}
      side={<>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'bg', label: 'Background' }, { value: 'frame', label: 'Frame' }, { value: 'effects', label: '3D & extras' }]} />
        {tab === 'bg' && (<>
          <Segmented value={o.bg} onChange={(bg) => set({ bg })} options={[{ value: 'gradient', label: 'Gradient' }, { value: 'solid', label: 'Solid' }, { value: 'image', label: 'Image' }, { value: 'none', label: 'None' }]} />
          {o.bg === 'gradient' && <div className="grid grid-cols-6 gap-1.5">{GRADIENTS.map((g, i) => <button key={g.name} title={g.name} onClick={() => set({ grad: i })} className={cn('aspect-square rounded-lg cursor-pointer transition hover:scale-105', o.grad === i && 'ring-2 ring-accent ring-offset-2 ring-offset-surface')} style={{ background: `linear-gradient(${g.a}deg, ${g.s.join(',')})` }} aria-label={g.name} />)}</div>}
          {o.bg === 'solid' && <ColorInput value={o.solid} onChange={(solid) => set({ solid })} />}
          {o.bg === 'image' && <>
            <input ref={bgIn} type="file" hidden accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setBgImg(await decode(f)) }} />
            <Button variant="outline" className="w-full" icon={<ImagePlus className="size-4" />} onClick={() => bgIn.current?.click()}>{bgImg ? 'Change background image' : 'Choose background image'}</Button>
          </>}
          <Slider label="Padding" value={o.padding} onChange={(padding) => set({ padding })} min={0} max={50} />
          <div><Label>Canvas aspect</Label><div className="flex flex-wrap gap-1.5">{ASPECTS.map((a) => <button key={a.id} onClick={() => set({ aspect: a.id })} className={cn('rounded-lg border px-2.5 py-1 text-xs cursor-pointer', o.aspect === a.id ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-fg')}>{a.label}</button>)}</div></div>
        </>)}
        {tab === 'frame' && (<>
          <div><Label>Window frame</Label><Segmented value={o.frame} onChange={(frame) => set({ frame })} options={[{ value: 'none', label: 'None' }, { value: 'mac-light', label: 'macOS light' }, { value: 'mac-dark', label: 'macOS dark' }]} /></div>
          {o.frame !== 'none' && <Field label="Address bar text (optional)"><Input value={o.url} onChange={(e) => set({ url: e.target.value })} placeholder="openfile.app" /></Field>}
          <Slider label="Corner radius" value={o.radius} onChange={(radius) => set({ radius })} min={0} max={100} />
          <Slider label="Shadow" value={o.shadow} onChange={(shadow) => set({ shadow })} min={0} max={100} />
          <Slider label="Inset" value={o.inset} onChange={(inset) => set({ inset })} min={0} max={100} />
          {o.inset > 0 && <ColorInput value={o.insetColor} onChange={(insetColor) => set({ insetColor })} />}
        </>)}
        {tab === 'effects' && (<>
          <Slider label="Rotate" value={o.rotate} onChange={(rotate) => set({ rotate })} min={-30} max={30} suffix="°" />
          <Slider label="3D tilt — vertical" value={o.tiltX} onChange={(tiltX) => set({ tiltX })} min={-40} max={40} suffix="°" />
          <Slider label="3D tilt — horizontal" value={o.tiltY} onChange={(tiltY) => set({ tiltY })} min={-40} max={40} suffix="°" />
          <div className="flex flex-wrap gap-1.5">
            {[['Flat', 0, 0], ['Left', 0, 25], ['Right', 0, -25], ['Top', 25, 0], ['Iso', 20, -20]].map(([n, x, y]) => <Button key={n as string} size="sm" variant="secondary" onClick={() => set({ tiltX: x as number, tiltY: y as number })}>{n}</Button>)}
          </div>
          <Field label="Watermark text"><Input value={o.watermark} onChange={(e) => set({ watermark: e.target.value })} placeholder="@yourhandle" /></Field>
        </>)}
        <div className="border-t border-border pt-4"><Label>Export size</Label><Segmented value={scale} onChange={setScale} options={[{ value: '1', label: '1× (original)' }, { value: '2', label: '2× (retina)' }]} /></div>
        <ErrorNote error={error} />
        <div className="grid grid-cols-2 gap-2">
          <Button loading={busy} icon={<Download className="size-4" />} onClick={download}>PNG</Button>
          <Button variant="outline" disabled={busy} icon={<Copy className="size-4" />} onClick={copy}>Copy</Button>
        </div>
        <Button variant="ghost" className="w-full" icon={<Monitor className="size-4" />} onClick={() => { setFile(null); setShot(null) }}>Start over</Button>
      </>}
    />
  )
}
