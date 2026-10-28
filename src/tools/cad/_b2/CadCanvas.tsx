import { useCallback, useEffect, useRef, useState } from 'react'
import { Scan, Ruler, ZoomIn, ZoomOut } from 'lucide-react'
import { cn } from '@/components/ui'
import { drawCad, fitView, type CadDoc } from '@/lib/b2/cad'

type Props = { doc: CadDoc; hidden: Set<string>; bg: string; mono: string | null; measure?: boolean; height?: string; onMeasure?: (d: number | null) => void }

export function CadCanvas({ doc, hidden, bg, mono, measure: allowMeasure = true, height = '64vh', onMeasure }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const [view, setView] = useState<{ scale: number; ox: number; oy: number } | null>(null)
  const [measuring, setMeasuring] = useState(false)
  const [pts, setPts] = useState<[number, number][]>([])
  const [cursor, setCursor] = useState<[number, number] | null>(null)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const dpr = Math.min(2, window.devicePixelRatio || 1)

  const fit = useCallback(() => { const c = cv.current; if (c) setView(fitView(doc, c.width, c.height)) }, [doc])
  useEffect(() => {
    const el = box.current!, c = cv.current!
    const ro = new ResizeObserver(() => { c.width = el.clientWidth * dpr; c.height = el.clientHeight * dpr; c.style.width = el.clientWidth + 'px'; c.style.height = el.clientHeight + 'px'; setView((v) => v ?? fitView(doc, c.width, c.height)) })
    ro.observe(el); return () => ro.disconnect()
  }, [doc])
  useEffect(() => { fit() }, [doc])

  const toWorld = (sx: number, sy: number) => { const c = cv.current!; return [sx * dpr / view!.scale + view!.ox, (c.height - sy * dpr) / view!.scale + view!.oy] as [number, number] }
  useEffect(() => {
    const c = cv.current; if (!c || !view) return
    const ctx = c.getContext('2d')!
    drawCad(ctx, doc, view, { hidden, mono, bg, lineWidth: dpr })
    const all = cursor && measuring && pts.length === 1 ? [...pts, cursor] : pts
    if (all.length) {
      const s = (p: [number, number]) => [(p[0] - view.ox) * view.scale, c.height - (p[1] - view.oy) * view.scale]
      ctx.strokeStyle = '#F5A524'; ctx.fillStyle = '#F5A524'; ctx.lineWidth = 2 * dpr; ctx.setLineDash([6 * dpr, 4 * dpr])
      ctx.beginPath(); all.forEach((p, i) => { const [x, y] = s(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }); ctx.stroke(); ctx.setLineDash([])
      all.forEach((p) => { const [x, y] = s(p); ctx.beginPath(); ctx.arc(x, y, 4 * dpr, 0, Math.PI * 2); ctx.fill() })
      if (all.length === 2) {
        const d = Math.hypot(all[1][0] - all[0][0], all[1][1] - all[0][1])
        const [x, y] = s([(all[0][0] + all[1][0]) / 2, (all[0][1] + all[1][1]) / 2])
        ctx.font = `${12 * dpr}px sans-serif`; const label = `${+d.toPrecision(6)} ${doc.units === 'unitless' ? '' : doc.units}`
        const w = ctx.measureText(label).width
        ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(x - w / 2 - 6 * dpr, y - 18 * dpr, w + 12 * dpr, 20 * dpr)
        ctx.fillStyle = '#F5A524'; ctx.fillText(label, x - w / 2, y - 4 * dpr)
      }
    }
  }, [doc, view, hidden, mono, bg, pts, cursor, measuring])

  const zoomAt = (f: number, sx?: number, sy?: number) => setView((v) => {
    if (!v) return v; const c = cv.current!
    const px = (sx ?? c.width / dpr / 2) * dpr, py = c.height - (sy ?? c.height / dpr / 2) * dpr
    const wx = px / v.scale + v.ox, wy = py / v.scale + v.oy, ns = v.scale * f
    return { scale: ns, ox: wx - px / ns, oy: wy - py / ns }
  })
  const local = (e: React.PointerEvent | React.WheelEvent) => { const r = cv.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as [number, number] }
  const down = (e: React.PointerEvent) => {
    const [x, y] = local(e)
    if (measuring && e.button === 0) { const w = toWorld(x, y); setPts((p) => { const n = p.length >= 2 ? [w] : [...p, w]; onMeasure?.(n.length === 2 ? Math.hypot(n[1][0] - n[0][0], n[1][1] - n[0][1]) : null); return n as [number, number][] }); return }
    drag.current = { x: e.clientX, y: e.clientY, ox: view!.ox, oy: view!.oy }; (e.target as Element).setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    if (measuring) { const [x, y] = local(e); setCursor(toWorld(x, y)) }
    const d = drag.current; if (!d || !view) return
    setView({ ...view, ox: d.ox - ((e.clientX - d.x) * dpr) / view.scale, oy: d.oy + ((e.clientY - d.y) * dpr) / view.scale })
  }
  const key = (e: React.KeyboardEvent) => {
    if (!view) return
    const step = (60 * dpr) / view.scale
    const m: Record<string, () => void> = { ArrowLeft: () => setView({ ...view, ox: view.ox - step }), ArrowRight: () => setView({ ...view, ox: view.ox + step }), ArrowUp: () => setView({ ...view, oy: view.oy + step }), ArrowDown: () => setView({ ...view, oy: view.oy - step }), '+': () => zoomAt(1.25), '=': () => zoomAt(1.25), '-': () => zoomAt(0.8), '0': fit, Escape: () => { setPts([]); setMeasuring(false) } }
    if (m[e.key]) { e.preventDefault(); m[e.key]() }
  }
  return (
    <div ref={box} className={cn('relative overflow-hidden rounded-2xl border border-border', bg === 'transparent' && 'checker')} style={{ height }}>
      <canvas ref={cv} tabIndex={0} aria-label="Drawing. Drag to pan, scroll to zoom, arrow keys to move, plus and minus to zoom, 0 to fit." onKeyDown={key}
        onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerLeave={() => setCursor(null)}
        onWheel={(e) => { const [x, y] = local(e); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, x, y) }}
        className={cn('absolute inset-0 touch-none outline-none focus-visible:ring-4 focus-visible:ring-accent/30', measuring ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing')} />
      <div className="absolute left-2 top-2 flex gap-0.5 rounded-xl bg-black/60 p-1 text-white backdrop-blur">
        <button type="button" onClick={fit} title="Fit to view" aria-label="Fit to view" className="grid size-8 place-items-center rounded-lg hover:bg-white/10 cursor-pointer"><Scan className="size-4" /></button>
        <button type="button" onClick={() => zoomAt(1.25)} title="Zoom in" aria-label="Zoom in" className="grid size-8 place-items-center rounded-lg hover:bg-white/10 cursor-pointer"><ZoomIn className="size-4" /></button>
        <button type="button" onClick={() => zoomAt(0.8)} title="Zoom out" aria-label="Zoom out" className="grid size-8 place-items-center rounded-lg hover:bg-white/10 cursor-pointer"><ZoomOut className="size-4" /></button>
        {allowMeasure && <button type="button" onClick={() => { setMeasuring(!measuring); setPts([]); onMeasure?.(null) }} aria-pressed={measuring} title="Measure distance" aria-label="Measure distance" className={cn('grid size-8 place-items-center rounded-lg cursor-pointer', measuring ? 'bg-accent/25 text-accent' : 'hover:bg-white/10')}><Ruler className="size-4" /></button>}
      </div>
      {cursor && <div className="pointer-events-none absolute bottom-2 right-2 rounded-lg bg-black/60 px-2 py-1 font-mono text-[11px] text-white">{cursor[0].toFixed(3)}, {cursor[1].toFixed(3)}</div>}
      {measuring && <div className="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-black/60 px-2 py-1 text-[11px] text-white">Click two points to measure. Esc to stop.</div>}
    </div>
  )
}
