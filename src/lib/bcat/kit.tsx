/* Small shared helpers for the new-category tools (AI, privacy, maps, office, science, creator). */
import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, cn } from '@/components/ui'
import { downloadBlob } from '@/lib/files'

export function useObjectUrl(blob: Blob | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) { setUrl(null); return }
    const u = URL.createObjectURL(blob); setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

/** Decode an image and return its pixels, scaled so the longest side is at most `max`. */
export async function imagePixels(blob: Blob, max = 512) {
  const bmp = await createImageBitmap(blob)
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0, w, h)
  const out = { data: ctx.getImageData(0, 0, w, h).data, w, h, fullW: bmp.width, fullH: bmp.height }
  bmp.close()
  return out
}

export async function imageSize(blob: Blob) { const b = await createImageBitmap(blob); const r = { w: b.width, h: b.height }; b.close(); return r }

export const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n')

export function DlButton({ data, name, mime = 'text/plain', children, variant = 'outline', size = 'sm', className, disabled }: { data: () => Blob | string | Promise<Blob | string>; name: string | (() => string); mime?: string; children: React.ReactNode; variant?: 'outline' | 'primary' | 'secondary'; size?: 'sm' | 'md'; className?: string; disabled?: boolean }) {
  return <Button variant={variant} size={size} className={className} disabled={disabled} icon={<Download className="size-4" />} onClick={async () => { const d = await data(); downloadBlob(typeof d === 'string' ? new Blob([d], { type: mime + ';charset=utf-8' }) : d, typeof name === 'function' ? name() : name) }}>{children}</Button>
}

export function Bars({ items, max, unit = '', color = '#F5A524' }: { items: { label: string; value: number }[]; max?: number; unit?: string; color?: string }) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="space-y-1.5">
      {items.map((i) => (
        <div key={i.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs">
          <span className="truncate" title={i.label}>{i.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full" style={{ width: `${Math.max(2, (i.value / m) * 100)}%`, background: color }} /></span>
          <span className="font-mono tabular-nums text-muted">{Number.isInteger(i.value) ? i.value : i.value.toFixed(2)}{unit}</span>
        </div>
      ))}
    </div>
  )
}

export function Pill({ children, active, onClick, color }: { children: React.ReactNode; active?: boolean; onClick?: () => void; color?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition cursor-pointer', active ? 'border-accent bg-accent/10 text-fg' : 'border-border text-muted hover:text-fg')}>
      {color && <span className="size-2.5 rounded-full" style={{ background: color }} />}{children}
    </button>
  )
}

/** Palette for charts and overlays: gold, teal, cyan, emerald, sky, orange, lime and warm tones only. */
export const PALETTE = ['#F5A524', '#14B8A6', '#22D3EE', '#10B981', '#38BDF8', '#F97316', '#84CC16', '#FBBF24', '#2DD4BF', '#0EA5E9', '#FB923C', '#A3E635', '#FDE68A', '#67E8F9', '#4ADE80', '#FACC15']
export const pal = (i: number) => PALETTE[i % PALETTE.length]
export const hexRgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
