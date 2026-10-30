/* Node canvas for the pipeline: pan, zoom (Ctrl + wheel, pinch, buttons), drag nodes with snap, connect ports,
 * flowing particles on links, a minimap and full keyboard control. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, Maximize2, Magnet, X, Power } from 'lucide-react'
import { cn } from '@/components/ui'
import { IN, OUT, type Graph, type GNode } from '@/pages/workspace/recipe'
import { metaOf } from '@/pages/workspace/catalog'
import type { NodeState } from '@/pages/workspace/engine'
import { ProgressRing, StepIcon, catColor, useMotion } from './kit'

export const NW = 188, NH = 66, GRID = 24
export type NodeRun = Record<string, { state: NodeState; frac: number }>
type View = { x: number; y: number; k: number }

export type CanvasProps = {
  graph: Graph
  selected: string | null
  selectedEdge: number | null
  run: NodeRun
  running: boolean
  snap: boolean
  onSnap: (v: boolean) => void
  onSelect: (id: string | null) => void
  onSelectEdge: (i: number | null) => void
  onBegin: () => void
  onMove: (id: string, x: number, y: number) => void
  onConnect: (a: string, b: string) => void
  onDeleteEdge: (i: number) => void
  onDeleteNode: (id: string) => void
  onDropStep: (step: string, x: number, y: number) => void
  onOpen: (id: string) => void
}

const summary = (n: GNode) => {
  if (n.step === IN) return 'Your files'
  if (n.step === OUT) return 'Results and ZIP'
  const m = metaOf(n.step)
  if (!m) return ''
  const vals = m.params.slice(0, 2).map((p) => (p.type === 'bool' ? (n.params[p.key] ? p.label : '') : String(n.params[p.key] ?? ''))).filter(Boolean)
  return vals.length ? vals.join(' · ') : m.desc
}

export function edgePath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2
  const dx = Math.max(50, Math.abs(x2 - x1) / 2)
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`
}

export default function NodeCanvas(p: CanvasProps) {
  const { graph, selected, run } = p
  const motion = useMotion()
  const box = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: 40, y: 40, k: 1 })
  const [size, setSize] = useState({ w: 800, h: 460 })
  const [link, setLink] = useState<{ from: string; x: number; y: number; sx?: number; sy?: number; pending?: boolean } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const lastTap = useRef<{ id: string; t: number } | null>(null)
  const gesture = useRef<{ kind: 'pan' | 'node' | 'pinch' | null; id?: string; sx: number; sy: number; ox: number; oy: number; d?: number; k?: number; moved?: boolean }>({ kind: null, sx: 0, sy: 0, ox: 0, oy: 0 })
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes])

  useLayoutEffect(() => {
    const el = box.current; if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const bounds = useMemo(() => {
    const xs = graph.nodes.map((n) => n.x), ys = graph.nodes.map((n) => n.y)
    return { x0: Math.min(...xs, 0), y0: Math.min(...ys, 0), x1: Math.max(...xs, 0) + NW, y1: Math.max(...ys, 0) + NH }
  }, [graph.nodes])

  const fit = useCallback(() => {
    const pad = 40, w = bounds.x1 - bounds.x0, h = bounds.y1 - bounds.y0
    // never shrink below 60 percent so labels stay readable; a wider pipeline starts at the left and pans
    const k = Math.max(0.6, Math.min(1.1, (size.w - pad * 2) / w, (size.h - pad * 2) / h))
    const x = w * k > size.w - pad * 2 ? pad - bounds.x0 * k : (size.w - w * k) / 2 - bounds.x0 * k
    setView({ k, x, y: (size.h - h * k) / 2 - bounds.y0 * k })
  }, [bounds, size])
  // fit when the canvas first gets a size and whenever a different recipe is loaded (node count jumps)
  const fitKey = graph.nodes.length + ':' + graph.nodes.map((n) => n.id).slice(0, 3).join(',')
  useEffect(() => { fit() }, [fitKey, size.w > 0 && size.h > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAt = useCallback((factor: number, cx = size.w / 2, cy = size.h / 2) => {
    setView((v) => { const k = Math.max(0.3, Math.min(2.2, v.k * factor)); const f = k / v.k; return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f } })
  }, [size])

  useEffect(() => {
    const el = box.current; if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const toWorld = (cx: number, cy: number) => { const r = box.current!.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k } }
  const snapV = (v: number) => (p.snap ? Math.round(v / GRID) * GRID : Math.round(v))

  const onDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = { kind: 'pinch', sx: 0, sy: 0, ox: 0, oy: 0, d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k }
      return
    }
    // second click of tap-to-link: a pending link connects to the step clicked next
    if (link?.pending) {
      const to = t.closest('[data-node-id]')?.getAttribute('data-node-id')
      if (to && to !== link.from) p.onConnect(link.from, to)
      setLink(null); e.preventDefault(); return
    }
    if (t.closest('[data-port-out]')) {
      const id = t.closest('[data-node-id]')!.getAttribute('data-node-id')!
      const w = toWorld(e.clientX, e.clientY)
      setLink({ from: id, x: w.x, y: w.y, sx: e.clientX, sy: e.clientY }); box.current!.setPointerCapture(e.pointerId); e.preventDefault(); return
    }
    const nodeEl = t.closest('[data-node-id]')
    if (nodeEl && !t.closest('button')) {
      const id = nodeEl.getAttribute('data-node-id')!
      const n = byId.get(id)!
      gesture.current = { kind: 'node', id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false }
      p.onSelect(id); box.current!.setPointerCapture(e.pointerId); return
    }
    if (t.closest('[data-edge]') || t.closest('button') || t.closest('[data-minimap]')) return
    gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y }
    p.onSelect(null); p.onSelectEdge(null)
    box.current!.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (link) { const w = toWorld(e.clientX, e.clientY); setLink({ ...link, x: w.x, y: w.y }); if (!link.pending) return }
    if (g.kind === 'pinch' && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y); const r = box.current!.getBoundingClientRect()
      const target = Math.max(0.3, Math.min(2.2, g.k! * (d / g.d!)))
      zoomAt(target / view.k, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); return
    }
    if (g.kind === 'pan') setView((v) => ({ ...v, x: g.ox + e.clientX - g.sx, y: g.oy + e.clientY - g.sy }))
    if (g.kind === 'node' && g.id) {
      const dx = (e.clientX - g.sx) / view.k, dy = (e.clientY - g.sy) / view.k
      if (!g.moved && Math.hypot(dx, dy) < 3) return
      if (!g.moved) { g.moved = true; p.onBegin() }
      p.onMove(g.id, snapV(g.ox + dx), snapV(g.oy + dy))
    }
  }
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (link && !link.pending && Math.hypot(e.clientX - (link.sx ?? 0), e.clientY - (link.sy ?? 0)) < 5) {
      // a click on a port (no drag): keep the link open and connect on the next click
      setLink({ ...link, pending: true }); gesture.current = { kind: null, sx: 0, sy: 0, ox: 0, oy: 0 }; return
    }
    if (link && !link.pending) {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-node-id]')
      const to = el?.getAttribute('data-node-id')
      if (to && to !== link.from) p.onConnect(link.from, to)
      setLink(null)
    }
    const g = gesture.current
    // pointer capture swallows dblclick on the node, so detect a double tap here
    if (g.kind === 'node' && g.id && !g.moved) {
      const now = performance.now()
      if (lastTap.current && lastTap.current.id === g.id && now - lastTap.current.t < 380) { lastTap.current = null; p.onOpen(g.id) }
      else lastTap.current = { id: g.id, t: now }
    }
    gesture.current = { kind: null, sx: 0, sy: 0, ox: 0, oy: 0 }
  }

  const onKeyNode = (e: React.KeyboardEvent, n: GNode) => {
    const step = (e.shiftKey ? 4 : 1) * GRID
    const mv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (mv[e.key] && !e.altKey) { e.preventDefault(); p.onBegin(); p.onMove(n.id, n.x + mv[e.key][0], n.y + mv[e.key][1]); return }
    if ((e.key === 'Delete' || e.key === 'Backspace') && n.id !== IN && n.id !== OUT) { e.preventDefault(); p.onDeleteNode(n.id); return }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onOpen(n.id) }
  }

  const edgeLive = (a: string) => p.running && (run[a]?.state === 'run' || run[a]?.state === 'done' || a === IN)
  const mm = { w: 150, h: 90 }
  const mmK = Math.min(mm.w / (bounds.x1 - bounds.x0 + 200), mm.h / (bounds.y1 - bounds.y0 + 200))

  return (
    <div className="relative">
      <div ref={box} data-tour="canvas" className={cn('ws-canvas relative h-[440px] touch-none overflow-hidden rounded-2xl border border-border bg-surface sm:h-[520px]', link && 'cursor-crosshair')}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-of-step')) e.preventDefault() }}
        onDrop={(e) => { const s = e.dataTransfer.getData('application/x-of-step'); if (!s) return; e.preventDefault(); const w = toWorld(e.clientX, e.clientY); p.onDropStep(s, snapV(w.x - NW / 2), snapV(w.y - NH / 2)) }}
        role="application" aria-label="Pipeline canvas. Tab to a step, arrows move it, Enter opens its settings, Delete removes it.">
        <div className="ws-grid pointer-events-none absolute inset-0" style={{ backgroundSize: `${GRID * view.k}px ${GRID * view.k}px`, backgroundPosition: `${view.x}px ${view.y}px` }} />
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <svg className="absolute overflow-visible" width="1" height="1" aria-hidden="true">
            <defs>
              <linearGradient id="ws-edge" x1="0" x2="1"><stop offset="0" stopColor="var(--accent)" /><stop offset="1" stopColor="var(--accent-2)" /></linearGradient>
            </defs>
            {graph.edges.map(([a, b], i) => {
              const na = byId.get(a), nb = byId.get(b); if (!na || !nb) return null
              const d = edgePath(na, nb), live = edgeLive(a), sel = p.selectedEdge === i
              const off = !na.enabled || !nb.enabled
              return (
                <g key={a + '>' + b} data-edge>
                  <path d={d} fill="none" stroke="transparent" strokeWidth={16} className="cursor-pointer" onPointerDown={(e) => { e.stopPropagation(); p.onSelectEdge(i); p.onSelect(null) }} />
                  <path d={d} fill="none" stroke={sel ? 'var(--accent)' : 'url(#ws-edge)'} strokeOpacity={off ? 0.25 : sel ? 1 : 0.55} strokeWidth={sel ? 3 : 2} className={cn(motion !== 'off' && 'ws-flow', live && 'ws-flow-fast')} strokeDasharray={motion === 'off' ? undefined : '6 8'} />
                  {motion === 'full' && !off && [0, 1, 2].map((k) => (
                    <circle key={k} r={live ? 3.2 : 2.4} fill={k === 1 ? 'var(--accent-2)' : 'var(--accent)'} opacity={live ? 1 : 0.7}>
                      <animateMotion dur={live ? '1.1s' : '3.2s'} begin={`${(k * (live ? 1.1 : 3.2)) / 3}s`} repeatCount="indefinite" path={d} />
                    </circle>
                  ))}
                </g>
              )
            })}
            {link && (() => { const na = byId.get(link.from); return na ? <path d={edgePath(na, { x: link.x, y: link.y - NH / 2 })} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="4 6" /> : null })()}
          </svg>
          {p.selectedEdge != null && graph.edges[p.selectedEdge] && (() => {
            const [a, b] = graph.edges[p.selectedEdge]; const na = byId.get(a), nb = byId.get(b); if (!na || !nb) return null
            const mx = (na.x + NW + nb.x) / 2, my = (na.y + nb.y) / 2 + NH / 2
            return <button aria-label="Remove link" onClick={() => p.onDeleteEdge(p.selectedEdge!)} className="absolute z-10 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-danger text-white shadow-lg ring-4 ring-danger/25 cursor-pointer" style={{ left: mx, top: my }}><X className="size-4" /></button>
          })()}
          {link && link.pending && <div className="pointer-events-none absolute rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-on-accent" style={{ left: link.x + 12, top: link.y + 12 }}>Click a step to link</div>}
          {graph.nodes.map((n) => {
            const r = run[n.id], st = r?.state ?? 'idle', col = catColor(n.step), special = n.id === IN || n.id === OUT
            const name = n.id === IN ? 'Input' : n.id === OUT ? 'Output' : metaOf(n.step)?.name ?? n.step
            return (
              <div key={n.id} data-node-id={n.id} tabIndex={0} role="button" aria-pressed={selected === n.id}
                aria-label={`${name} step${n.enabled ? '' : ', turned off'}${st !== 'idle' ? ', ' + st : ''}`}
                onKeyDown={(e) => onKeyNode(e, n)} onFocus={() => p.onSelect(n.id)}
                className={cn('ws-node group absolute flex items-center gap-2.5 rounded-2xl border bg-surface/95 px-3 shadow-lg backdrop-blur outline-none transition-[box-shadow,border-color,opacity] cursor-grab active:cursor-grabbing',
                  selected === n.id ? 'border-accent ring-4 ring-accent/20' : 'border-border hover:border-accent/50', !n.enabled && 'opacity-45', st === 'run' && 'ws-node-run', st === 'error' && 'border-danger')}
                style={{ left: n.x, top: n.y, width: NW, height: NH, ['--c' as any]: col }}>
                {n.id !== IN && <span data-port-in className="absolute -left-1.5 top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-surface" style={{ background: col }} />}
                {st === 'run' || st === 'done' ? <ProgressRing value={st === 'done' ? 1 : r.frac} size={34} stroke={3} color={st === 'done' ? 'var(--color-success, #10B981)' : col} spin label={<StepIcon step={n.step} className="size-3.5" />} />
                  : <span className="grid size-[34px] shrink-0 place-items-center rounded-xl" style={{ background: col + '22', color: col }}><StepIcon step={n.step} className="size-4" /></span>}
                <div className="min-w-0 flex-1 select-none">
                  <div className="truncate text-[13px] font-semibold leading-tight">{name}</div>
                  <div className="truncate text-[11px] text-muted">{summary(n)}</div>
                </div>
                {!special && !n.enabled && <Power className="size-3.5 shrink-0 text-muted" aria-hidden="true" />}
                {n.id !== OUT && <span data-port-out title="Drag to another step to link" className="absolute -right-2 top-1/2 grid size-4 -translate-y-1/2 cursor-crosshair place-items-center rounded-full border-2 border-surface transition group-hover:scale-125" style={{ background: col }} />}
              </div>
            )
          })}
        </div>

        {/* controls */}
        <div className="absolute left-3 top-3 flex gap-1 rounded-xl border border-border bg-surface/90 p-1 backdrop-blur">
          <button onClick={() => zoomAt(1.2)} aria-label="Zoom in" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg cursor-pointer"><ZoomIn className="size-4" /></button>
          <button onClick={() => zoomAt(1 / 1.2)} aria-label="Zoom out" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg cursor-pointer"><ZoomOut className="size-4" /></button>
          <button onClick={fit} aria-label="Fit to view (F)" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg cursor-pointer"><Maximize2 className="size-4" /></button>
          <button onClick={() => p.onSnap(!p.snap)} aria-pressed={p.snap} aria-label="Snap to grid" className={cn('rounded-lg p-1.5 cursor-pointer', p.snap ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg')}><Magnet className="size-4" /></button>
          <span className="hidden items-center px-1.5 font-mono text-[11px] text-muted sm:flex">{Math.round(view.k * 100)}%</span>
        </div>

        {/* minimap */}
        <svg data-minimap width={mm.w} height={mm.h} className="absolute bottom-3 right-3 hidden cursor-pointer rounded-xl border border-border bg-surface/90 backdrop-blur sm:block" aria-label="Minimap, click to move the view" role="img"
          onPointerDown={(e) => { e.stopPropagation(); const r = (e.currentTarget as SVGElement).getBoundingClientRect(); const wx = (e.clientX - r.left) / mmK + bounds.x0 - 100, wy = (e.clientY - r.top) / mmK + bounds.y0 - 100; setView((v) => ({ ...v, x: size.w / 2 - wx * v.k, y: size.h / 2 - wy * v.k })) }}>
          <g transform={`scale(${mmK}) translate(${-bounds.x0 + 100}, ${-bounds.y0 + 100})`}>
            {graph.edges.map(([a, b]) => { const na = byId.get(a), nb = byId.get(b); return na && nb ? <path key={a + b} d={edgePath(na, nb)} stroke="var(--accent)" strokeOpacity={0.5} strokeWidth={6} fill="none" /> : null })}
            {graph.nodes.map((n) => <rect key={n.id} x={n.x} y={n.y} width={NW} height={NH} rx={14} fill={catColor(n.step)} opacity={selected === n.id ? 1 : 0.6} />)}
            <rect x={-view.x / view.k} y={-view.y / view.k} width={size.w / view.k} height={size.h / view.k} fill="none" stroke="var(--fg)" strokeOpacity={0.6} strokeWidth={8} rx={10} />
          </g>
        </svg>
      </div>
      <p className="mt-2 hidden text-[11px] text-muted sm:block">Drag the empty space to pan, Ctrl + wheel or pinch to zoom. To link, drag the dot on the right of a step onto another step, or click the dot and then click the step. Double click a step for its settings.</p>
    </div>
  )
}
