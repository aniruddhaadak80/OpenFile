/* Draggable text-layer engine shared by Add Text to Image and Meme Generator. */
import { useEffect, useRef } from 'react'
import { cn } from '@/components/ui'
import { uid } from './kit'

export type TextLayer = {
  id: string; text: string; x: number; y: number /* centre, as fraction of image */
  size: number /* px at a 1000px-wide reference */; font: string; color: string
  bold: boolean; italic: boolean; upper: boolean; align: 'left' | 'center' | 'right'; lineHeight: number
  strokeW: number; strokeColor: string
  shadow: boolean; shadowColor: string; shadowBlur: number
  box: boolean; boxColor: string; boxOpacity: number; boxPad: number; boxRadius: number
  rotation: number; maxWidth: number /* 0 = no wrap, else fraction of width */; opacity: number
}

export function newLayer(p: Partial<TextLayer> = {}): TextLayer {
  return { id: uid(), text: 'Your text', x: 0.5, y: 0.5, size: 64, font: 'Inter', color: '#ffffff', bold: true, italic: false, upper: false, align: 'center', lineHeight: 1.15, strokeW: 0, strokeColor: '#000000', shadow: true, shadowColor: '#000000', shadowBlur: 12, box: false, boxColor: '#000000', boxOpacity: 60, boxPad: 16, boxRadius: 12, rotation: 0, maxWidth: 0, opacity: 100, ...p }
}

const fontStr = (L: TextLayer, px: number) => `${L.italic ? 'italic ' : ''}${L.bold ? 800 : 400} ${px}px "${L.font}", ${L.font === 'Impact' ? '"Anton", ' : ''}sans-serif`

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = []
  for (const para of text.split('\n')) {
    if (!max) { out.push(para); continue }
    let line = ''
    for (const word of para.split(/\s+/)) {
      const t = line ? line + ' ' + word : word
      if (ctx.measureText(t).width > max && line) { out.push(line); line = word } else line = t
    }
    out.push(line)
  }
  return out
}

export function measure(ctx: CanvasRenderingContext2D, L: TextLayer, W: number) {
  const k = W / 1000, px = L.size * k
  ctx.font = fontStr(L, px)
  const text = L.upper ? L.text.toUpperCase() : L.text
  const lines = wrap(ctx, text, L.maxWidth ? L.maxWidth * W : 0)
  const widths = lines.map((l) => ctx.measureText(l).width)
  const pad = L.box ? L.boxPad * k : 0
  const lh = px * L.lineHeight
  return { px, k, lines, widths, pad, lh, w: Math.max(1, ...widths) + pad * 2, h: lines.length * lh + pad * 2 }
}

export function drawLayer(ctx: CanvasRenderingContext2D, L: TextLayer, W: number, H: number, selected = false) {
  if (!L.text) return
  const m = measure(ctx, L, W)
  ctx.save()
  ctx.globalAlpha = L.opacity / 100
  ctx.translate(L.x * W, L.y * H); ctx.rotate((L.rotation * Math.PI) / 180)
  if (L.box) {
    ctx.save(); ctx.globalAlpha = (L.opacity / 100) * (L.boxOpacity / 100); ctx.fillStyle = L.boxColor
    const r = Math.min(L.boxRadius * m.k, m.h / 2)
    ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(-m.w / 2, -m.h / 2, m.w, m.h, r) : ctx.rect(-m.w / 2, -m.h / 2, m.w, m.h); ctx.fill(); ctx.restore()
  }
  ctx.font = fontStr(L, m.px); ctx.textAlign = L.align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.miterLimit = 2
  const tx = L.align === 'left' ? -m.w / 2 + m.pad : L.align === 'right' ? m.w / 2 - m.pad : 0
  m.lines.forEach((line, i) => {
    const y = -m.h / 2 + m.pad + m.lh * (i + 0.5)
    if (L.shadow) { ctx.shadowColor = L.shadowColor; ctx.shadowBlur = L.shadowBlur * m.k; ctx.shadowOffsetY = Math.max(1, L.shadowBlur * m.k * 0.25) }
    if (L.strokeW > 0) { ctx.lineWidth = L.strokeW * m.k * 2; ctx.strokeStyle = L.strokeColor; ctx.strokeText(line, tx, y); ctx.shadowColor = 'transparent' }
    ctx.fillStyle = L.color; ctx.fillText(line, tx, y)
    ctx.shadowColor = 'transparent'
  })
  if (selected) {
    ctx.globalAlpha = 1; ctx.setLineDash([6, 4]); ctx.lineWidth = Math.max(1.5, 2 * (W / 1000)); ctx.strokeStyle = '#8b6cff'
    ctx.strokeRect(-m.w / 2 - 6, -m.h / 2 - 6, m.w + 12, m.h + 12)
  }
  ctx.restore()
}

export function hitTest(ctx: CanvasRenderingContext2D, layers: TextLayer[], W: number, H: number, px: number, py: number) {
  for (let i = layers.length - 1; i >= 0; i--) {
    const L = layers[i]; const m = measure(ctx, L, W)
    const dx = px - L.x * W, dy = py - L.y * H, a = (-L.rotation * Math.PI) / 180
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a)
    if (Math.abs(lx) <= m.w / 2 + 8 && Math.abs(ly) <= m.h / 2 + 8) return L.id
  }
  return null
}

/** Canvas that renders a background image plus text layers; layers can be dragged. */
export function TextStage({ img, layers, onChange, selected, onSelect, maxSide = 1100, className, background }: { img: CanvasImageSource & { width: number; height: number } | null; layers: TextLayer[]; onChange: (id: string, p: Partial<TextLayer>) => void; selected: string | null; onSelect: (id: string | null) => void; maxSide?: number; className?: string; background?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ id: string; ox: number; oy: number } | null>(null)
  const iw = img ? ((img as HTMLImageElement).naturalWidth || img.width) : 1000, ih = img ? ((img as HTMLImageElement).naturalHeight || img.height) : 1000
  const s = Math.min(1, maxSide / Math.max(iw, ih))
  const W = Math.round(iw * s), H = Math.round(ih * s)

  useEffect(() => {
    const c = ref.current; if (!c) return
    c.width = W; c.height = H
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, W, H) }
    if (img) ctx.drawImage(img, 0, 0, W, H)
    layers.forEach((L) => drawLayer(ctx, L, W, H, L.id === selected))
  })

  const pt = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H } }
  return (
    <canvas ref={ref} className={cn('max-h-[64vh] max-w-full touch-none shadow-xl', drag.current ? 'cursor-grabbing' : 'cursor-pointer', className)}
      onPointerDown={(e) => {
        const p = pt(e); const id = hitTest(ref.current!.getContext('2d')!, layers, W, H, p.x, p.y)
        onSelect(id)
        if (id) { const L = layers.find((l) => l.id === id)!; drag.current = { id, ox: p.x - L.x * W, oy: p.y - L.y * H }; ref.current!.setPointerCapture(e.pointerId) }
      }}
      onPointerMove={(e) => { const d = drag.current; if (!d) return; const p = pt(e); onChange(d.id, { x: Math.max(0, Math.min(1, (p.x - d.ox) / W)), y: Math.max(0, Math.min(1, (p.y - d.oy) / H)) }) }}
      onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}
    />
  )
}

/** Render image + layers at full resolution. */
export function renderFull(img: CanvasImageSource & { width: number; height: number }, layers: TextLayer[], background?: string) {
  const iw = (img as HTMLImageElement).naturalWidth || img.width, ih = (img as HTMLImageElement).naturalHeight || img.height
  const c = document.createElement('canvas'); c.width = iw; c.height = ih
  const ctx = c.getContext('2d')!
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, iw, ih) }
  ctx.drawImage(img, 0, 0)
  layers.forEach((L) => drawLayer(ctx, L, iw, ih))
  return c
}
