/* Interactive page overlay: select / move / resize / create annotations on top of a rendered PDF page. */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/components/ui'
import type { PageInfo } from './pages'
import { uid } from './pages'
import { type Item, type ItemType, bbox, moveItem, resizeItem, arrowHead, arrowShaftEnd, smoothPath, FONT_CSS, LINE_H } from './items'

export type Tool = 'select' | 'place' | 'text' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'highlight' | 'pen' | 'whiteout'
type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'p1' | 'p2'

export interface EditorProps {
  page: PageInfo
  items: Item[]
  selectedId: string | null
  editingId?: string | null
  tool: Tool
  /** defaults for newly drawn items */
  style?: Partial<Item>
  onSelect: (id: string | null) => void
  onEdit?: (id: string | null) => void
  update: (fn: (items: Item[]) => Item[]) => void
  commit: () => void
  onPlace?: (x: number, y: number) => void
  /** called after a one-shot tool created an item */
  onCreated?: (item: Item) => void
  className?: string
  /** optional cursor hint for place mode */
  placeHint?: React.ReactNode
}

const BOX_TOOLS: ItemType[] = ['rect', 'ellipse', 'highlight', 'whiteout']

export function PageEditor(p: EditorProps) {
  const { page, items, selectedId, editingId, tool } = p
  const root = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(1)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const latest = useRef(p); latest.current = p
  const kRef = useRef(k); kRef.current = k

  useLayoutEffect(() => {
    const el = root.current; if (!el) return
    const ro = new ResizeObserver(() => setK(el.clientWidth / page.w || 1))
    ro.observe(el); setK(el.clientWidth / page.w || 1)
    return () => ro.disconnect()
  }, [page.w])

  // when text editing ends (blur, Escape, click elsewhere, page change): drop empty boxes and snapshot history
  const prevEdit = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevEdit.current
    prevEdit.current = editingId ?? null
    if (prev && prev !== editingId) {
      const it = latest.current.items.find((i) => i.id === prev)
      if (it && it.type === 'text' && !it.text?.trim()) latest.current.update((l) => l.filter((i) => i.id !== prev))
      latest.current.commit()
    }
  }, [editingId])

  const toPt = (e: { clientX: number; clientY: number }) => {
    const r = root.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / kRef.current, y: (e.clientY - r.top) / kRef.current }
  }
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

  function startDrag(e: React.PointerEvent, onMove: (pt: { x: number; y: number }, ev: PointerEvent) => void, onUp?: (pt: { x: number; y: number }) => void) {
    e.preventDefault()
    const move = (ev: PointerEvent) => onMove(toPt(ev), ev)
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
      onUp?.(toPt(ev)); latest.current.commit()
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  }

  const replace = (id: string, next: Item) => latest.current.update((list) => list.map((i) => (i.id === id ? next : i)))

  function onBackgroundDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    const pt = toPt(e)
    const st = latest.current.style ?? {}
    if (tool === 'select') { p.onSelect(null); p.onEdit?.(null); return }
    if (tool === 'place') { p.onPlace?.(pt.x, pt.y); return }
    if (tool === 'text') {
      e.preventDefault()
      const size = st.size ?? 16
      const it: Item = { id: uid(), type: 'text', x: pt.x, y: pt.y - size * 0.6, w: Math.min(220, page.w - pt.x - 4), h: size * LINE_H, text: '', font: 'Helvetica', size, color: '#111111', ...st }
      it.w = Math.max(40, it.w)
      p.update((l) => [...l, it]); p.commit(); p.onSelect(it.id); p.onEdit?.(it.id); p.onCreated?.(it)
      return
    }
    if (tool === 'pen') {
      const it: Item = { id: uid(), type: 'pen', x: pt.x, y: pt.y, w: 0, h: 0, points: [[pt.x, pt.y]], color: '#e11d48', strokeWidth: 3, opacity: 1, ...st }
      p.update((l) => [...l, it]); p.onSelect(null)
      let pts: [number, number][] = [[pt.x, pt.y]]
      startDrag(e, (q) => {
        const last = pts[pts.length - 1]
        if (Math.hypot(q.x - last[0], q.y - last[1]) < 0.8 / kRef.current) return
        pts = [...pts, [clamp(q.x, 0, page.w), clamp(q.y, 0, page.h)]]
        replace(it.id, { ...it, points: pts })
      }, () => {
        const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
        const x = Math.min(...xs), y = Math.min(...ys)
        replace(it.id, { ...it, points: pts, x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y })
      })
      return
    }
    // box / line creation
    const type = tool as ItemType
    const base: Item = type === 'line' || type === 'arrow'
      ? { id: uid(), type, x: pt.x, y: pt.y, x2: pt.x, y2: pt.y, w: 0, h: 0, color: '#e11d48', strokeWidth: 3, opacity: 1, ...st }
      : { id: uid(), type, x: pt.x, y: pt.y, w: 0, h: 0, color: type === 'highlight' ? '#facc15' : '#e11d48', fill: null, strokeWidth: 2, opacity: type === 'highlight' ? 0.4 : 1, ...st }
    p.update((l) => [...l, base]); p.onSelect(base.id)
    let cur = base
    startDrag(e, (q, ev) => {
      let qx = clamp(q.x, 0, page.w), qy = clamp(q.y, 0, page.h)
      if (type === 'line' || type === 'arrow') {
        if (ev.shiftKey) {
          const ang = Math.round(Math.atan2(qy - pt.y, qx - pt.x) / (Math.PI / 4)) * (Math.PI / 4)
          const d = Math.hypot(qx - pt.x, qy - pt.y)
          qx = pt.x + Math.cos(ang) * d; qy = pt.y + Math.sin(ang) * d
        }
        cur = { ...base, x2: qx, y2: qy }
      } else {
        let w = qx - pt.x, h = qy - pt.y
        if (ev.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m }
        cur = { ...base, x: Math.min(pt.x, pt.x + w), y: Math.min(pt.y, pt.y + h), w: Math.abs(w), h: Math.abs(h) }
      }
      replace(base.id, cur)
    }, () => {
      const b = bbox(cur)
      if (b.w < 3 && b.h < 3) {
        // a simple click: drop a default-sized shape
        if (type === 'line' || type === 'arrow') cur = { ...cur, x2: Math.min(page.w, pt.x + 120), y2: pt.y }
        else if (type === 'highlight') cur = { ...cur, w: 140, h: 18 }
        else cur = { ...cur, w: 120, h: type === 'whiteout' ? 30 : 80 }
        replace(base.id, cur)
      }
      p.onCreated?.(cur)
    })
  }

  function onItemDown(e: React.PointerEvent, it: Item) {
    if (tool !== 'select' || e.button !== 0) return
    e.stopPropagation()
    p.onSelect(it.id)
    if (editingId === it.id) return
    const start = toPt(e)
    const orig = it
    startDrag(e, (q) => {
      const b = bbox(orig)
      const dx = clamp(q.x - start.x, -b.x, page.w - b.x - b.w), dy = clamp(q.y - start.y, -b.y, page.h - b.y - b.h)
      replace(it.id, moveItem(orig, dx, dy))
    })
  }

  function onHandleDown(e: React.PointerEvent, it: Item, h: Handle) {
    e.stopPropagation()
    const orig = it
    startDrag(e, (q, ev) => {
      const qx = clamp(q.x, 0, page.w), qy = clamp(q.y, 0, page.h)
      if (h === 'p1') return replace(it.id, { ...orig, x: qx, y: qy })
      if (h === 'p2') return replace(it.id, { ...orig, x2: qx, y2: qy })
      const b = bbox(orig)
      let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h
      if (h.includes('w')) x1 = Math.min(qx, x2 - 4); else x2 = Math.max(qx, x1 + 4)
      if (h.includes('n')) y1 = Math.min(qy, y2 - 4); else y2 = Math.max(qy, y1 + 4)
      let nb = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
      const lock = orig.type === 'text' || ((orig.lockAspect ?? orig.type === 'image') !== ev.shiftKey)
      if (lock && b.w > 0 && b.h > 0) {
        const r = nb.w / b.w
        const nh = b.h * r
        nb = { x: h.includes('w') ? x2 - nb.w : x1, y: h.includes('n') ? y2 - nh : y1, w: nb.w, h: nh }
      }
      replace(it.id, resizeItem(orig, nb))
    })
  }

  const cursor = tool === 'select' ? 'default' : tool === 'text' ? 'text' : tool === 'place' ? 'copy' : 'crosshair'

  return (
    <div
      ref={root}
      className={cn('relative w-full select-none bg-white shadow-xl ring-1 ring-black/10', tool !== 'select' && 'touch-none', p.className)}
      style={{ aspectRatio: `${page.w} / ${page.h}`, cursor }}
      onPointerDown={onBackgroundDown}
      onPointerMove={tool === 'place' ? (e) => setHover(toPt(e)) : undefined}
      onPointerLeave={() => setHover(null)}
    >
      <img src={page.src} alt={`Page ${page.index + 1}`} draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" />
      {items.map((it) => (
        <ItemView key={it.id} it={it} k={k} page={page} interactive={tool === 'select'} selected={selectedId === it.id} editing={editingId === it.id}
          onDown={(e) => onItemDown(e, it)} onHandle={(e, h) => onHandleDown(e, it, h)}
          onDouble={() => { if (it.type === 'text') { p.onSelect(it.id); p.onEdit?.(it.id) } }}
          onText={(text) => { p.update((l) => l.map((i) => (i.id === it.id ? { ...i, text } : i))) }}
          onTextDone={() => p.onEdit?.(null)} />
      ))}
      {tool === 'place' && hover && p.placeHint && (
        <div className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 opacity-60" style={{ left: hover.x * k, top: hover.y * k }}>{p.placeHint}</div>
      )}
    </div>
  )
}

function Handles({ onHandle, color = 'var(--accent)' }: { onHandle: (e: React.PointerEvent, h: Handle) => void; color?: string }) {
  const pos: Record<string, string> = { nw: '-left-1.5 -top-1.5 cursor-nwse-resize', ne: '-right-1.5 -top-1.5 cursor-nesw-resize', sw: '-left-1.5 -bottom-1.5 cursor-nesw-resize', se: '-right-1.5 -bottom-1.5 cursor-nwse-resize' }
  return <>{(['nw', 'ne', 'sw', 'se'] as Handle[]).map((h) => (
    <span key={h} onPointerDown={(e) => onHandle(e, h)} className={cn('absolute z-10 size-3 rounded-full border-2 bg-white shadow', pos[h])} style={{ borderColor: color, pointerEvents: 'auto' }} />
  ))}</>
}

function ItemView({ it, k, page, interactive, selected, editing, onDown, onHandle, onDouble, onText, onTextDone }: {
  it: Item; k: number; page: PageInfo; interactive: boolean; selected: boolean; editing: boolean
  onDown: (e: React.PointerEvent) => void; onHandle: (e: React.PointerEvent, h: Handle) => void; onDouble: () => void
  onText: (t: string) => void; onTextDone: () => void
}) {
  const pe = interactive ? 'auto' : 'none'
  const op = it.opacity ?? 1
  const ring = selected ? 'outline outline-2 outline-offset-2 outline-[var(--accent)]' : interactive ? 'hover:outline hover:outline-1 hover:outline-offset-2 hover:outline-[var(--accent)]/60' : ''

  if (it.type === 'line' || it.type === 'arrow' || it.type === 'pen') {
    const sw = it.strokeWidth ?? 2
    let d = ''
    let head = ''
    if (it.type === 'pen') d = smoothPath(it.points ?? [])
    else {
      const x2 = it.x2 ?? it.x, y2 = it.y2 ?? it.y
      const end = it.type === 'arrow' ? arrowShaftEnd(it.x, it.y, x2, y2, sw) : [x2, y2]
      d = `M ${it.x} ${it.y} L ${end[0]} ${end[1]}`
      if (it.type === 'arrow') head = arrowHead(it.x, it.y, x2, y2, sw).map((q) => q.join(',')).join(' ')
    }
    const b = bbox(it)
    return (
      <>
        <svg className="absolute inset-0 h-full w-full touch-none overflow-visible" viewBox={`0 0 ${page.w} ${page.h}`} preserveAspectRatio="none" style={{ pointerEvents: 'none' }}>
          <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(sw, 12 / k)} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: interactive ? 'stroke' : 'none', cursor: 'move' }} onPointerDown={onDown} />
          <path d={d} fill="none" stroke={it.color} strokeOpacity={op} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          {head && <polygon points={head} fill={it.color} fillOpacity={op} style={{ pointerEvents: interactive ? 'all' : 'none', cursor: 'move' }} onPointerDown={onDown} />}
        </svg>
        {selected && it.type === 'pen' && (
          <div className="pointer-events-none absolute border border-dashed border-[var(--accent)]" style={{ left: b.x * k - 4, top: b.y * k - 4, width: b.w * k + 8, height: b.h * k + 8 }}>
            <Handles onHandle={onHandle} />
          </div>
        )}
        {selected && it.type !== 'pen' && (['p1', 'p2'] as Handle[]).map((h) => (
          <span key={h} onPointerDown={(e) => onHandle(e, h)} className="absolute z-10 size-3.5 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-[var(--accent)] bg-white shadow"
            style={{ left: (h === 'p1' ? it.x : it.x2 ?? it.x) * k, top: (h === 'p1' ? it.y : it.y2 ?? it.y) * k }} />
        ))}
      </>
    )
  }

  const style: React.CSSProperties = { left: it.x * k, top: it.y * k, width: it.w * k, pointerEvents: pe }
  if (it.type !== 'text') style.height = it.h * k

  let content: React.ReactNode = null
  if (it.type === 'image') content = <img src={it.src} alt="" draggable={false} className="pointer-events-none h-full w-full" style={{ opacity: op }} />
  else if (it.type === 'rect' || it.type === 'ellipse') content = <div className="h-full w-full" style={{ border: `${(it.strokeWidth ?? 2) * k}px solid ${it.strokeWidth ? it.color : 'transparent'}`, background: it.fill ?? 'transparent', borderRadius: it.type === 'ellipse' ? '50%' : 0, opacity: op }} />
  else if (it.type === 'highlight') content = <div className="h-full w-full" style={{ background: it.color ?? '#facc15', opacity: it.opacity ?? 0.4, mixBlendMode: 'multiply' }} />
  else if (it.type === 'whiteout') content = <div className="h-full w-full bg-white" style={{ boxShadow: selected ? undefined : '0 0 0 0.5px rgba(0,0,0,.08)' }} />
  else if (it.type === 'text') {
    const ts: React.CSSProperties = { fontFamily: FONT_CSS[it.font ?? 'Helvetica'], fontSize: (it.size ?? 16) * k, lineHeight: LINE_H, color: it.color, fontWeight: it.bold ? 700 : 400, fontStyle: it.italic ? 'italic' : 'normal', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', opacity: op, minHeight: (it.size ?? 16) * k * LINE_H }
    content = editing ? <AutoTextarea value={it.text ?? ''} style={ts} onChange={onText} onDone={onTextDone} />
      : <div style={ts} className={cn(!it.text && 'text-black/30')}>{it.text || 'Type here…'}</div>
  }

  return (
    <div className={cn('absolute touch-none', interactive && !editing && 'cursor-move', ring)} style={style} onPointerDown={onDown} onDoubleClick={onDouble}>
      {content}
      {selected && !editing && <Handles onHandle={onHandle} />}
    </div>
  )
}

function AutoTextarea({ value, style, onChange, onDone }: { value: string; style: React.CSSProperties; onChange: (v: string) => void; onDone: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const el = ref.current; if (el) { el.focus(); el.select() } }, [])
  useLayoutEffect(() => { const el = ref.current; if (el) { el.style.height = '0px'; el.style.height = el.scrollHeight + 'px' } }, [value, style.fontSize])
  return (
    <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onDone}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur() }}
      onPointerDown={(e) => e.stopPropagation()}
      className="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none" style={{ ...style, cursor: 'text' }} placeholder="Type here…" />
  )
}
