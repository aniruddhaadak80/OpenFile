/* Shared UI for batch 1 PDF tools. */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react'
import { cn } from '@/components/ui'
import { renderPage, type PdfJsDoc } from '@/lib/pdf'

export const readBytes = async (f: Blob) => new Uint8Array(await f.arrayBuffer())
export const core = () => import('./core')

/** One row in a check report */
export type CheckLevel = 'pass' | 'warn' | 'fail' | 'info'
export interface Check { level: CheckLevel; title: string; detail?: React.ReactNode; fix?: React.ReactNode }
const ICON = { pass: CheckCircle2, warn: AlertTriangle, fail: XCircle, info: Info }
const COLOR = { pass: 'text-success', warn: 'text-warn', fail: 'text-danger', info: 'text-accent' }
export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {checks.map((c, i) => {
        const I = ICON[c.level]
        return (
          <li key={i} className="flex gap-3 px-4 py-3">
            <I className={cn('mt-0.5 size-5 shrink-0', COLOR[c.level])} aria-label={c.level} />
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-medium">{c.title}</div>
              {c.detail && <div className="mt-0.5 break-words text-muted">{c.detail}</div>}
              {c.fix && <div className="mt-1 text-xs text-fg/80"><span className="font-semibold">How to fix: </span>{c.fix}</div>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
export function Score({ checks, label = 'Score' }: { checks: Check[]; label?: string }) {
  const scored = checks.filter((c) => c.level !== 'info')
  const pts = scored.reduce((s, c) => s + (c.level === 'pass' ? 1 : c.level === 'warn' ? 0.5 : 0), 0)
  const pct = scored.length ? Math.round((pts / scored.length) * 100) : 0
  const fails = checks.filter((c) => c.level === 'fail').length, warns = checks.filter((c) => c.level === 'warn').length
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4">
      <div className="relative grid size-16 place-items-center">
        <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-border)" strokeWidth="3" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={fails ? 'var(--color-danger)' : warns ? 'var(--color-warn)' : 'var(--color-success)'} strokeWidth="3" strokeDasharray={`${pct * 0.974} 100`} strokeLinecap="round" /></svg>
        <span className="font-mono text-sm font-bold">{pct}</span>
      </div>
      <div className="text-sm"><div className="font-semibold">{label}</div><div className="text-muted">{fails} problem{fails === 1 ? '' : 's'}, {warns} warning{warns === 1 ? '' : 's'}, {checks.filter((c) => c.level === 'pass').length} passed</div></div>
    </div>
  )
}

/** Renders a page of a pdf.js doc to a data URL sized for a given CSS width. Returns page size in points too. */
export function usePage(doc: PdfJsDoc | null, page: number, width = 760) {
  const [img, setImg] = useState<{ src: string; w: number; h: number } | null>(null)
  useEffect(() => {
    let cancel = false
    setImg(null)
    if (!doc || page < 1 || page > doc.numPages) return
    ;(async () => {
      const p = await doc.getPage(page)
      const vp = p.getViewport({ scale: 1 })
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const c = await renderPage(doc, page, (width / vp.width) * dpr)
      if (!cancel) setImg({ src: c.toDataURL('image/jpeg', 0.88), w: vp.width, h: vp.height })
    })().catch(() => {})
    return () => { cancel = true }
  }, [doc, page, width])
  return img
}

/** Rectangle editor over a rendered page. Rects are in PDF user space of an upright viewport (pdf.js viewport coords → we convert). */
export interface ERect { id: string; x0: number; y0: number; x1: number; y1: number; label?: string; color?: string }
export function RectEditor({ src, pageW, pageH, rects, selected, onSelect, onChange, onCreate, drawEnabled, minSize = 6 }: {
  src: string; pageW: number; pageH: number; rects: ERect[]; selected: string | null; onSelect: (id: string | null) => void
  onChange: (id: string, r: { x0: number; y0: number; x1: number; y1: number }) => void; onCreate?: (r: { x0: number; y0: number; x1: number; y1: number }) => void; drawEnabled?: boolean; minSize?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const drag = useRef<{ mode: 'new' | 'move' | 'resize'; id?: string; sx: number; sy: number; orig?: ERect } | null>(null)
  // viewport coords: x right, y down, in points. Our rect values are stored in these viewport units (top-left origin).
  const toPt = useCallback((e: React.PointerEvent | PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return { x: Math.max(0, Math.min(pageW, ((e.clientX - r.left) / r.width) * pageW)), y: Math.max(0, Math.min(pageH, ((e.clientY - r.top) / r.height) * pageH)) }
  }, [pageW, pageH])
  const down = (e: React.PointerEvent, mode: 'new' | 'move' | 'resize', rect?: ERect) => {
    if (mode === 'new' && !drawEnabled) { onSelect(null); return }
    e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId)
    const p = toPt(e)
    drag.current = { mode, id: rect?.id, sx: p.x, sy: p.y, orig: rect }
    if (rect) onSelect(rect.id)
    if (mode === 'new') setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return
    const p = toPt(e)
    if (d.mode === 'new') setDraft({ x0: Math.min(d.sx, p.x), y0: Math.min(d.sy, p.y), x1: Math.max(d.sx, p.x), y1: Math.max(d.sy, p.y) })
    else if (d.orig && d.id) {
      const dx = p.x - d.sx, dy = p.y - d.sy, o = d.orig
      if (d.mode === 'move') {
        const w = o.x1 - o.x0, h = o.y1 - o.y0
        const x0 = Math.max(0, Math.min(pageW - w, o.x0 + dx)), y0 = Math.max(0, Math.min(pageH - h, o.y0 + dy))
        onChange(d.id, { x0, y0, x1: x0 + w, y1: y0 + h })
      } else onChange(d.id, { x0: o.x0, y0: o.y0, x1: Math.max(o.x0 + minSize, Math.min(pageW, o.x1 + dx)), y1: Math.max(o.y0 + minSize, Math.min(pageH, o.y1 + dy)) })
    }
  }
  const up = () => {
    const d = drag.current; drag.current = null
    if (d?.mode === 'new' && draft) {
      if (draft.x1 - draft.x0 >= minSize && draft.y1 - draft.y0 >= minSize) onCreate?.(draft)
      setDraft(null)
    }
  }
  const keys = (e: React.KeyboardEvent, r: ERect) => {
    const step = e.shiftKey ? 10 : 1
    const mv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (mv[e.key]) {
      e.preventDefault(); const [dx, dy] = mv[e.key]
      if (e.altKey) onChange(r.id, { ...r, x1: Math.max(r.x0 + minSize, r.x1 + dx), y1: Math.max(r.y0 + minSize, r.y1 + dy) })
      else onChange(r.id, { x0: r.x0 + dx, y0: r.y0 + dy, x1: r.x1 + dx, y1: r.y1 + dy })
    }
  }
  const pct = (v: number, t: number) => `${(v / t) * 100}%`
  return (
    <div ref={ref} className={cn('relative mx-auto w-full touch-none select-none bg-white shadow-2xl ring-1 ring-black/10', drawEnabled && 'cursor-crosshair')} style={{ aspectRatio: `${pageW} / ${pageH}` }}
      onPointerDown={(e) => down(e, 'new')} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <img src={src} alt="Page" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" />
      {rects.map((r) => (
        <div key={r.id} role="button" tabIndex={0} aria-label={r.label ?? 'Area'} onKeyDown={(e) => keys(e, r)} onFocus={() => onSelect(r.id)}
          onPointerDown={(e) => down(e, 'move', r)}
          className={cn('absolute cursor-move border-2 outline-none', selected === r.id ? 'z-10 ring-2 ring-accent/40' : '')}
          style={{ left: pct(r.x0, pageW), top: pct(r.y0, pageH), width: pct(r.x1 - r.x0, pageW), height: pct(r.y1 - r.y0, pageH), borderColor: r.color ?? 'var(--accent)', background: (r.color ?? '#F5A524') + '22' }}>
          {r.label && <span className="pointer-events-none absolute -top-5 left-0 max-w-[16rem] truncate rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-white">{r.label}</span>}
          {selected === r.id && <span onPointerDown={(e) => down(e, 'resize', r)} className="absolute -bottom-1.5 -right-1.5 size-3.5 cursor-se-resize rounded-sm border-2 border-white bg-accent shadow" />}
        </div>
      ))}
      {draft && <div className="pointer-events-none absolute border-2 border-dashed border-accent bg-accent/10" style={{ left: pct(draft.x0, pageW), top: pct(draft.y0, pageH), width: pct(draft.x1 - draft.x0, pageW), height: pct(draft.y1 - draft.y0, pageH) }} />}
    </div>
  )
}

/** Convert between pdf.js viewport (top-left origin, rotation applied) and PDF user space using the page's viewport. */
export async function viewportOf(doc: PdfJsDoc, page: number) {
  const p = await doc.getPage(page)
  return p.getViewport({ scale: 1 })
}
export function vpToPdf(vp: any, r: { x0: number; y0: number; x1: number; y1: number }): [number, number, number, number] {
  const [ax, ay] = vp.convertToPdfPoint(r.x0, r.y0), [bx, by] = vp.convertToPdfPoint(r.x1, r.y1)
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)]
}
export function pdfToVp(vp: any, rect: number[]) {
  const [ax, ay, bx, by] = vp.convertToViewportRectangle(rect)
  return { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) }
}

export const uid = () => Math.random().toString(36).slice(2, 9)

export function Section({ title, children, className }: { title: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <div className={cn('space-y-2.5', className)}><div className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>{children}</div>
}
export function Note({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl bg-surface-2/60 p-3 text-xs leading-relaxed text-muted">{children}</div>
}
