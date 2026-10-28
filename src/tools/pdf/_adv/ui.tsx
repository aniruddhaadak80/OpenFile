/* Small shared UI bits for the pdf-adv tools */
import React from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'
import { cn } from '@/components/ui'
import type { PageInfo } from './pages'

export function ToolBtn({ active, onClick, title, children, disabled, className }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode; disabled?: boolean; className?: string }) {
  return (
    <button type="button" title={title} aria-label={title} aria-pressed={active} disabled={disabled} onClick={onClick}
      className={cn('grid size-9 shrink-0 place-items-center rounded-lg transition cursor-pointer disabled:opacity-40 disabled:pointer-events-none', active ? 'bg-accent text-white shadow-md shadow-accent/30' : 'text-muted hover:bg-surface-2 hover:text-fg', className)}>
      {children}
    </button>
  )
}

export const SWATCHES = ['#111111', '#1d4ed8', '#e11d48', '#16a34a', '#f59e0b', '#7c3aed', '#ffffff']

export function ColorPicker({ value, onChange, colors = SWATCHES, allowNone, label }: { value: string | null | undefined; onChange: (c: string | null) => void; colors?: string[]; allowNone?: boolean; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={label}>
      {allowNone && (
        <button type="button" title="None" onClick={() => onChange(null)} className={cn('relative size-6 rounded-full border border-border bg-surface cursor-pointer overflow-hidden', !value && 'ring-2 ring-accent ring-offset-2 ring-offset-surface')}>
          <span className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 rotate-45 bg-danger" />
        </button>
      )}
      {colors.map((c) => (
        <button key={c} type="button" title={c} onClick={() => onChange(c)} className={cn('size-6 rounded-full border border-black/15 cursor-pointer transition hover:scale-110', value?.toLowerCase() === c.toLowerCase() && 'ring-2 ring-accent ring-offset-2 ring-offset-surface')} style={{ background: c }} />
      ))}
      <label className="relative size-6 cursor-pointer overflow-hidden rounded-full border border-border" title="Custom colour" style={{ background: 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' }}>
        <input type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  )
}

/** Horizontal thumbnail strip + prev/next + zoom */
export function PageNav({ pages, total, current, onChange, zoom, onZoom, badge }: { pages: PageInfo[]; total: number; current: number; onChange: (i: number) => void; zoom?: number; onZoom?: (z: number) => void; badge?: (i: number) => React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <ToolBtn title="Previous page" disabled={current <= 0} onClick={() => onChange(current - 1)}><ChevronLeft className="size-4" /></ToolBtn>
          <span className="min-w-20 text-center font-mono text-xs text-muted">Page {current + 1} / {total || '…'}</span>
          <ToolBtn title="Next page" disabled={current >= total - 1} onClick={() => onChange(current + 1)}><ChevronRight className="size-4" /></ToolBtn>
        </div>
        {onZoom && zoom !== undefined && (
          <div className="flex items-center gap-1">
            <ToolBtn title="Zoom out" disabled={zoom <= 0.5} onClick={() => onZoom(Math.max(0.5, +(zoom - 0.25).toFixed(2)))}><ZoomOut className="size-4" /></ToolBtn>
            <button type="button" onClick={() => onZoom(1)} className="min-w-12 rounded-md px-1 font-mono text-xs text-muted hover:text-fg cursor-pointer" title="Reset zoom">{Math.round(zoom * 100)}%</button>
            <ToolBtn title="Zoom in" disabled={zoom >= 2.5} onClick={() => onZoom(Math.min(2.5, +(zoom + 0.25).toFixed(2)))}><ZoomIn className="size-4" /></ToolBtn>
          </div>
        )}
      </div>
      {total > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {Array.from({ length: total }, (_, i) => {
            const pg = pages[i]
            return (
              <button key={i} type="button" onClick={() => onChange(i)} className={cn('relative shrink-0 rounded-lg border-2 bg-surface-2 p-1 transition cursor-pointer', i === current ? 'border-accent ring-2 ring-accent/20' : 'border-border hover:border-accent/50')}>
                {pg ? <img src={pg.src} alt="" className="h-16 w-auto rounded-sm" /> : <div className="h-16 w-12 animate-pulse rounded-sm bg-border/50" />}
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] font-semibold text-white">{i + 1}</span>
                {badge?.(i)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-surface-2 px-1 py-0.5 font-mono text-[10px] text-muted">{children}</kbd>
}
