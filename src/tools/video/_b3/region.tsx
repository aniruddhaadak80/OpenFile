/* Draggable rectangle over a picture or video, in the media's own pixel coordinates.
 * Used for cropping, logo removal, blurring, and watermark placement. */
import React, { useRef } from 'react'
import { cn } from '@/components/ui'

export interface Rect { x: number; y: number; w: number; h: number }

export const clampRect = (r: Rect, W: number, H: number, min = 4): Rect => {
  const w = Math.max(min, Math.min(W, Math.round(r.w))), h = Math.max(min, Math.min(H, Math.round(r.h)))
  return { x: Math.max(0, Math.min(W - w, Math.round(r.x))), y: Math.max(0, Math.min(H - h, Math.round(r.y))), w, h }
}

/** Largest centred rect with the given aspect ratio (w/h). */
export function aspectRect(W: number, H: number, ratio: number | null): Rect {
  if (!ratio) return { x: 0, y: 0, w: W, h: H }
  let w = W, h = Math.round(W / ratio)
  if (h > H) { h = H; w = Math.round(H * ratio) }
  return { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h }
}

type Mode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'draw'

export function RegionBox({ width, height, rect, onChange, ratio = null, children, className, shade = true, label }: {
  width: number; height: number; rect: Rect; onChange: (r: Rect) => void; ratio?: number | null; children: React.ReactNode; className?: string; shade?: boolean; label?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ mode: Mode; x0: number; y0: number; r0: Rect } | null>(null)
  const toPx = (cx: number, cy: number) => { const b = box.current!.getBoundingClientRect(); return { x: ((cx - b.left) / b.width) * width, y: ((cy - b.top) / b.height) * height } }
  const down = (mode: Mode) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const p = toPx(e.clientX, e.clientY)
    drag.current = { mode, x0: p.x, y0: p.y, r0: mode === 'draw' ? { x: p.x, y: p.y, w: 1, h: 1 } : rect }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return
    const p = toPx(e.clientX, e.clientY)
    const dx = p.x - d.x0, dy = p.y - d.y0
    let { x, y, w, h } = d.r0
    if (d.mode === 'move') { x += dx; y += dy; return onChange(clampRect({ x, y, w, h }, width, height)) }
    let x2 = x + w, y2 = y + h
    if (d.mode === 'draw') { x = Math.min(d.x0, p.x); y = Math.min(d.y0, p.y); x2 = Math.max(d.x0, p.x); y2 = Math.max(d.y0, p.y) }
    if (d.mode === 'nw' || d.mode === 'sw') x = Math.min(x2 - 4, x + dx)
    if (d.mode === 'ne' || d.mode === 'se') x2 = Math.max(x + 4, x2 + dx)
    if (d.mode === 'nw' || d.mode === 'ne') y = Math.min(y2 - 4, y + dy)
    if (d.mode === 'sw' || d.mode === 'se') y2 = Math.max(y + 4, y2 + dy)
    x = Math.max(0, x); y = Math.max(0, y); x2 = Math.min(width, x2); y2 = Math.min(height, y2)
    w = x2 - x; h = y2 - y
    if (ratio) {
      if (w / h > ratio) { const nw = h * ratio; if (d.mode === 'nw' || d.mode === 'sw') x += w - nw; w = nw } else { const nh = w / ratio; if (d.mode === 'nw' || d.mode === 'ne') y += h - nh; h = nh }
    }
    onChange(clampRect({ x, y, w, h }, width, height))
  }
  const up = () => { drag.current = null }
  const key = (e: React.KeyboardEvent) => {
    const s = e.shiftKey ? 10 : 1
    const m: Record<string, [number, number]> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }
    if (!m[e.key]) return
    e.preventDefault()
    onChange(clampRect({ ...rect, x: rect.x + m[e.key][0], y: rect.y + m[e.key][1] }, width, height))
  }
  const pct = (v: number, of: number) => `${(v / of) * 100}%`
  const corner = (c: Mode, cls: string) => <div onPointerDown={down(c)} onPointerMove={move} onPointerUp={up} className={cn('absolute size-4 rounded-sm border-2 border-white bg-accent shadow touch-none', cls)} />
  return (
    <div className={cn('relative mx-auto w-fit max-w-full select-none', className)}>
      {children}
      <div ref={box} className="absolute inset-0 touch-none cursor-crosshair" onPointerDown={down('draw')} onPointerMove={move} onPointerUp={up}>
        {shade && <>
          <div className="pointer-events-none absolute left-0 right-0 top-0 bg-black/50" style={{ height: pct(rect.y, height) }} />
          <div className="pointer-events-none absolute left-0 right-0 bottom-0 bg-black/50" style={{ height: pct(height - rect.y - rect.h, height) }} />
          <div className="pointer-events-none absolute left-0 bg-black/50" style={{ top: pct(rect.y, height), height: pct(rect.h, height), width: pct(rect.x, width) }} />
          <div className="pointer-events-none absolute right-0 bg-black/50" style={{ top: pct(rect.y, height), height: pct(rect.h, height), width: pct(width - rect.x - rect.w, width) }} />
        </>}
        <div role="slider" tabIndex={0} aria-label={label ?? 'Selected area. Arrow keys move it.'} aria-valuenow={rect.x} onKeyDown={key}
          onPointerDown={down('move')} onPointerMove={move} onPointerUp={up}
          className="absolute cursor-move border-2 border-accent outline-none focus-visible:ring-2 focus-visible:ring-white touch-none"
          style={{ left: pct(rect.x, width), top: pct(rect.y, height), width: pct(rect.w, width), height: pct(rect.h, height) }}>
          <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,transparent_33%,rgba(255,255,255,.35)_33%,rgba(255,255,255,.35)_calc(33%+1px),transparent_calc(33%+1px),transparent_66%,rgba(255,255,255,.35)_66%,rgba(255,255,255,.35)_calc(66%+1px),transparent_calc(66%+1px))]" />
          {corner('nw', '-left-2 -top-2 cursor-nwse-resize')}{corner('ne', '-right-2 -top-2 cursor-nesw-resize')}
          {corner('sw', '-left-2 -bottom-2 cursor-nesw-resize')}{corner('se', '-right-2 -bottom-2 cursor-nwse-resize')}
          <div className="pointer-events-none absolute -top-6 left-0 whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">{rect.w}×{rect.h}</div>
        </div>
      </div>
    </div>
  )
}

export const RATIOS: { value: string; label: string; r: number | null }[] = [
  { value: 'free', label: 'Free', r: null }, { value: '1:1', label: '1:1', r: 1 }, { value: '9:16', label: '9:16', r: 9 / 16 }, { value: '16:9', label: '16:9', r: 16 / 9 },
  { value: '4:5', label: '4:5', r: 4 / 5 }, { value: '4:3', label: '4:3', r: 4 / 3 }, { value: '3:2', label: '3:2', r: 3 / 2 }, { value: '21:9', label: '21:9', r: 21 / 9 },
]

/** Rect input row for exact numbers. */
export function RectInputs({ rect, onChange, W, H }: { rect: Rect; onChange: (r: Rect) => void; W: number; H: number }) {
  const f = (k: keyof Rect) => (
    <label key={k} className="block text-[10px] font-medium uppercase tracking-wide text-muted">{k}
      <input type="number" value={rect[k]} onChange={(e) => onChange(clampRect({ ...rect, [k]: +e.target.value || 0 }, W, H))} className="mt-1 h-9 w-full rounded-lg border border-border bg-surface-2/60 px-2 font-mono text-xs text-fg outline-none focus:border-accent" />
    </label>
  )
  return <div className="grid grid-cols-4 gap-2">{(['x', 'y', 'w', 'h'] as const).map(f)}</div>
}
