/* Signature / initials creator: draw (signature_pad), type (script fonts) or upload (auto white removal). */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { X, Eraser, Undo2, PenLine, Keyboard, Upload } from 'lucide-react'
import { Button, Input, Slider, Segmented, Label, Dropzone, Switch, cn } from '@/components/ui'
import { loadImage } from '@/lib/files'
import { ColorPicker } from './ui'

export const SCRIPT_FONTS = ['Dancing Script', 'Great Vibes', 'Caveat', 'Pacifico'] as const
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Dancing+Script:wght@600&family=Great+Vibes&family=Pacifico&display=swap'
const INK = ['#111111', '#1e3a8a', '#1d4ed8', '#b91c1c', '#065f46']

export function ensureScriptFonts() {
  if (typeof document === 'undefined' || document.getElementById('openfile-sign-fonts')) return
  const l = document.createElement('link')
  l.id = 'openfile-sign-fonts'; l.rel = 'stylesheet'; l.href = FONT_HREF
  document.head.appendChild(l)
}

/** crop a canvas to its non-transparent pixels */
export function trimCanvas(src: HTMLCanvasElement, pad = 6): HTMLCanvasElement | null {
  const ctx = src.getContext('2d')!
  const { width: w, height: h } = src
  const data = ctx.getImageData(0, 0, w, h).data
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  if (x1 < 0) return null
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad)
  const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1
  out.getContext('2d')!.drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
  return out
}

export async function renderTyped(text: string, font: string, color: string): Promise<string | null> {
  if (!text.trim()) return null
  ensureScriptFonts()
  try { await document.fonts.load(`120px "${font}"`, text) } catch { /* fall back to whatever is available */ }
  const size = 140
  const m = document.createElement('canvas').getContext('2d')!
  m.font = `${size}px "${font}", cursive`
  const w = Math.ceil(m.measureText(text).width + size)
  const c = document.createElement('canvas'); c.width = w; c.height = Math.ceil(size * 2)
  const ctx = c.getContext('2d')!
  ctx.font = `${size}px "${font}", cursive`; ctx.fillStyle = color; ctx.textBaseline = 'middle'
  ctx.fillText(text, size / 2, c.height / 2)
  return trimCanvas(c, 8)?.toDataURL('image/png') ?? null
}

/** turn near-white pixels transparent, with soft edge, then trim */
export async function removeWhite(file: Blob, threshold: number, recolor: string | null): Promise<string | null> {
  const img = await loadImage(file)
  const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s)
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0, c.width, c.height)
  const id = ctx.getImageData(0, 0, c.width, c.height), d = id.data
  const [rr, rg, rb] = recolor ? [parseInt(recolor.slice(1, 3), 16), parseInt(recolor.slice(3, 5), 16), parseInt(recolor.slice(5, 7), 16)] : [0, 0, 0]
  const lo = threshold - 40
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    let a = d[i + 3]
    if (lum >= threshold) a = 0
    else if (lum > lo) a = Math.round(a * (threshold - lum) / 40)
    d[i + 3] = a
    if (recolor && a) { d[i] = rr; d[i + 1] = rg; d[i + 2] = rb }
  }
  ctx.putImageData(id, 0, 0)
  return trimCanvas(c, 4)?.toDataURL('image/png') ?? null
}

type Mode = 'draw' | 'type' | 'upload'

export function SignatureModal({ kind, defaultName, onClose, onSave }: { kind: 'signature' | 'initials'; defaultName?: string; onClose: () => void; onSave: (dataUrl: string, remember: boolean) => void }) {
  const [mode, setMode] = useState<Mode>('draw')
  const [color, setColor] = useState('#1e3a8a')
  const [width, setWidth] = useState(3)
  const [text, setText] = useState(defaultName ?? '')
  const [font, setFont] = useState<string>(SCRIPT_FONTS[0])
  const [up, setUp] = useState<File | null>(null)
  const [thr, setThr] = useState(200)
  const [recolor, setRecolor] = useState(false)
  const [upPreview, setUpPreview] = useState<string | null>(null)
  const [remember, setRemember] = useState(true)
  const [empty, setEmpty] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const padRef = useRef<any>(null)
  const [, setFontsReady] = useState(0)

  useEffect(() => { ensureScriptFonts(); document.fonts?.ready.then(() => setFontsReady((n) => n + 1)) }, [])
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onClose])

  // signature_pad setup
  useLayoutEffect(() => {
    if (mode !== 'draw') return
    let pad: any, ro: ResizeObserver | null = null, alive = true
    ;(async () => {
      const { default: SignaturePad } = await import('signature_pad')
      const c = canvasRef.current; if (!c || !alive) return
      const fit = () => {
        const ratio = Math.max(window.devicePixelRatio || 1, 1)
        const data = pad?.toData()
        c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio
        c.getContext('2d')!.scale(ratio, ratio)
        if (pad) { pad.clear(); if (data?.length) pad.fromData(data) }
      }
      fit()
      pad = new SignaturePad(c, { penColor: color, minWidth: width * 0.35, maxWidth: width * 1.15, velocityFilterWeight: 0.6 })
      pad.addEventListener('endStroke', () => setEmpty(pad.isEmpty()))
      padRef.current = pad
      ro = new ResizeObserver(fit); ro.observe(c)
    })()
    return () => { alive = false; ro?.disconnect(); pad?.off(); padRef.current = null }
  }, [mode])
  useEffect(() => { const p = padRef.current; if (p) { p.penColor = color; p.minWidth = width * 0.35; p.maxWidth = width * 1.15 } }, [color, width])

  useEffect(() => {
    if (!up) { setUpPreview(null); return }
    let alive = true
    const t = setTimeout(() => { removeWhite(up, thr, recolor ? color : null).then((u) => { if (alive) setUpPreview(u) }) }, 120)
    return () => { alive = false; clearTimeout(t) }
  }, [up, thr, recolor, color])

  async function save() {
    let url: string | null = null
    if (mode === 'draw') {
      const c = canvasRef.current; if (!c || padRef.current?.isEmpty()) return
      url = trimCanvas(c, 6)?.toDataURL('image/png') ?? null
    } else if (mode === 'type') url = await renderTyped(text, font, color)
    else url = upPreview
    if (url) onSave(url, remember)
  }

  const canSave = mode === 'draw' ? !empty : mode === 'type' ? !!text.trim() : !!upPreview
  const title = kind === 'initials' ? 'Create your initials' : 'Create your signature'

  return (
    <motion.div className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-3 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <motion.div role="dialog" aria-modal="true" aria-label={title} initial={{ y: 20, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, opacity: 0 }} className="w-full max-w-xl space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg cursor-pointer" aria-label="Close"><X className="size-5" /></button>
        </div>
        <Segmented value={mode} onChange={setMode} options={[
          { value: 'draw', label: <span className="inline-flex items-center gap-1.5"><PenLine className="size-3.5" />Draw</span> },
          { value: 'type', label: <span className="inline-flex items-center gap-1.5"><Keyboard className="size-3.5" />Type</span> },
          { value: 'upload', label: <span className="inline-flex items-center gap-1.5"><Upload className="size-3.5" />Upload</span> },
        ]} />

        {mode === 'draw' && (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-border bg-white">
              <canvas ref={canvasRef} className={cn('block w-full touch-none cursor-crosshair', kind === 'initials' ? 'h-40' : 'h-48')} />
              <div className="pointer-events-none absolute inset-x-8 bottom-10 border-b border-slate-300" />
              {empty && <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-slate-400">Sign here with mouse, finger or stylus</div>}
              <div className="absolute right-2 top-2 flex gap-1">
                <button type="button" title="Undo stroke" onClick={() => { const p = padRef.current; if (!p) return; const d = p.toData(); d.pop(); p.fromData(d); setEmpty(p.isEmpty()) }} className="rounded-lg bg-slate-100 p-1.5 text-slate-600 hover:bg-slate-200 cursor-pointer"><Undo2 className="size-4" /></button>
                <button type="button" title="Clear" onClick={() => { padRef.current?.clear(); setEmpty(true) }} className="rounded-lg bg-slate-100 p-1.5 text-slate-600 hover:bg-slate-200 cursor-pointer"><Eraser className="size-4" /></button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Ink colour</Label><ColorPicker colors={INK} value={color} onChange={(c) => c && setColor(c)} /></div>
              <Slider label="Pen width" value={width} min={1} max={8} step={0.5} onChange={setWidth} />
            </div>
          </div>
        )}

        {mode === 'type' && (
          <div className="space-y-3">
            <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} onInput={(e) => setText((e.target as HTMLInputElement).value)} placeholder={kind === 'initials' ? 'Your initials, e.g. A.A.' : 'Your full name'} maxLength={60} />
            <div className="grid grid-cols-2 gap-2">
              {SCRIPT_FONTS.map((f) => (
                <button key={f} type="button" onClick={() => setFont(f)} className={cn('h-20 truncate rounded-xl border-2 bg-white px-3 text-3xl transition cursor-pointer', font === f ? 'border-accent ring-4 ring-accent/15' : 'border-border hover:border-accent/50')} style={{ fontFamily: `"${f}", cursive`, color }} title={f}>
                  {text || (kind === 'initials' ? 'AA' : 'Your Name')}
                </button>
              ))}
            </div>
            <div><Label>Ink colour</Label><ColorPicker colors={INK} value={color} onChange={(c) => c && setColor(c)} /></div>
          </div>
        )}

        {mode === 'upload' && (
          <div className="space-y-3">
            {!up ? <Dropzone compact accept="image/*" onFiles={(f) => setUp(f[0])} label="Upload a photo or scan of your signature" sub="White paper is removed automatically." /> : (
              <>
                <div className="checker grid h-44 place-items-center overflow-hidden rounded-xl border border-border p-3">
                  {upPreview ? <img src={upPreview} alt="Signature preview" className="max-h-full max-w-full" /> : <span className="text-sm text-muted">Processing…</span>}
                </div>
                <Slider label="Background removal" value={thr} min={120} max={250} onChange={setThr} />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Switch checked={recolor} onChange={setRecolor} label="Recolour ink" />
                  {recolor && <ColorPicker colors={INK} value={color} onChange={(c) => c && setColor(c)} />}
                  <Button size="sm" variant="ghost" onClick={() => setUp(null)}>Choose another</Button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <Switch checked={remember} onChange={setRemember} label={<span className="text-sm text-muted">Save on this device</span>} />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button disabled={!canSave} aria-disabled={!canSave} title={canSave ? undefined : mode === 'type' ? 'Type your name first' : mode === 'draw' ? 'Draw your signature first' : 'Upload an image first'} onClick={save} style={canSave ? undefined : { background: 'var(--surface-2)', color: 'var(--muted)', boxShadow: 'none', opacity: 1, cursor: 'not-allowed' }}>Use {kind}</Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
