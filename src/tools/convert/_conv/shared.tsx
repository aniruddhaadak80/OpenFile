/* Shared bits for the Convert tools (owned by the convert tool set). */
import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RotateCcw, FileIcon } from 'lucide-react'
import { Button, cn } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { safeBlobUrl } from '@/lib/safe'

/** Page sizes in PDF points (1/72 inch), portrait. */
export const PAGE_SIZES = {
  a4: { label: 'A4', w: 595.28, h: 841.89 },
  letter: { label: 'Letter', w: 612, h: 792 },
  legal: { label: 'Legal', w: 612, h: 1008 },
  a3: { label: 'A3', w: 841.89, h: 1190.55 },
  a5: { label: 'A5', w: 419.53, h: 595.28 },
} as const
export type PageSizeKey = keyof typeof PAGE_SIZES
export const pageSizeOptions = (keys: PageSizeKey[] = ['a4', 'letter', 'legal']) => keys.map((k) => ({ value: k, label: PAGE_SIZES[k].label }))

export function pageDims(size: PageSizeKey, orientation: 'portrait' | 'landscape') {
  const { w, h } = PAGE_SIZES[size]
  return orientation === 'landscape' ? { w: h, h: w } : { w, h }
}

/** mm → pt */
export const mm = (v: number) => (v * 72) / 25.4

/** A header strip showing the current file(s) with a Start over action. */
export function FileBar({ name, size, sub, onReset, children }: { name: string; size?: number; sub?: React.ReactNode; onReset: () => void; children?: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent"><FileIcon className="size-5" /></div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{name}</div>
        <div className="text-xs text-muted">{size !== undefined && formatBytes(size)}{sub && <> · {sub}</>}</div>
      </div>
      {children}
      <Button variant="ghost" size="sm" icon={<RotateCcw className="size-4" />} onClick={onReset}>Start over</Button>
    </motion.div>
  )
}

/** Fade/slide-in wrapper */
export function Reveal({ children, className, k }: { children: React.ReactNode; className?: string; k?: React.Key }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div key={k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} className={className}>{children}</motion.div>
    </AnimatePresence>
  )
}

/** Object URL that is revoked automatically */
export function useObjectUrl(blob: Blob | null | undefined) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return url
}

/** Friendly message for pdf.js failures */
export function pdfError(e: any) {
  if (e?.name === 'PasswordException') return 'This PDF is password-protected. Unlock it first with the Unlock PDF tool.'
  if (e?.name === 'InvalidPDFException') return 'This file does not look like a valid PDF.'
  return e?.message || 'Could not read the PDF.'
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-surface-2/50 px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-muted">{label}</div><div className="font-mono text-sm font-semibold">{value}</div></div>
}

export function Pill({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={cn('rounded-lg border px-2.5 py-1 text-xs font-medium transition cursor-pointer', active ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-fg')}>{children}</button>
}

/** Small hook: debounce a value */
export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

/** Full-screen image viewer with prev/next (keyboard ← → Esc). */
export function Lightbox({ items, index, onClose, onIndex, actions }: { items: { src: string; caption?: string }[]; index: number | null; onClose: () => void; onIndex: (i: number) => void; actions?: (i: number) => React.ReactNode }) {
  // fit: whole image inside the viewport. actual: natural size, scroll to pan (tall pages, small text).
  const [zoom, setZoom] = useState<'fit' | 'actual'>('fit')
  const [failed, setFailed] = useState<string | null>(null)
  const src = index !== null ? items[index]?.src : undefined
  useEffect(() => { setZoom('fit'); setFailed(null) }, [src])
  useEffect(() => {
    if (index === null) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onIndex(Math.min(items.length - 1, index + 1))
      if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1))
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [index, items.length, onClose, onIndex])
  return (
    <AnimatePresence>
      {index !== null && items[index] && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} role="dialog" aria-modal="true" aria-label={items[index].caption ?? 'Image preview'} className="fixed inset-0 z-[100] flex flex-col items-center gap-3 bg-black/80 p-3 backdrop-blur-sm sm:p-4">
          <div className={cn('flex min-h-0 w-full flex-1', zoom === 'fit' ? 'items-center justify-center overflow-hidden' : 'items-start justify-start overflow-auto overscroll-contain')}>
            {failed === items[index].src ? (
              <div onClick={(e) => e.stopPropagation()} className="m-auto rounded-xl bg-surface px-5 py-4 text-sm text-fg shadow-2xl">This preview could not be shown. The file itself can still be downloaded.</div>
            ) : (
              <motion.img key={items[index].src} initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} src={safeBlobUrl(items[index].src)} alt={items[index].caption ?? ''}
                onError={() => setFailed(items[index].src)}
                onClick={(e) => { e.stopPropagation(); setZoom((z) => (z === 'fit' ? 'actual' : 'fit')) }}
                className={cn('rounded-lg bg-white shadow-2xl', zoom === 'fit' ? 'max-h-full max-w-full cursor-zoom-in object-contain' : 'm-auto max-w-none cursor-zoom-out')} />
            )}
          </div>
          <div onClick={(e) => e.stopPropagation()} className="flex shrink-0 flex-wrap items-center justify-center gap-2 text-sm text-white/90">
            <Button size="sm" variant="secondary" disabled={index === 0} onClick={() => onIndex(index - 1)}>← Prev</Button>
            <span className="px-2 font-mono">{items[index].caption ?? `${index + 1} / ${items.length}`}</span>
            <Button size="sm" variant="secondary" disabled={index === items.length - 1} onClick={() => onIndex(index + 1)}>Next →</Button>
            <Button size="sm" variant="secondary" onClick={() => setZoom((z) => (z === 'fit' ? 'actual' : 'fit'))}>{zoom === 'fit' ? 'Actual size' : 'Fit to screen'}</Button>
            {actions?.(index)}
            <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Selectable thumbnail grid fed by usePdfThumbs() output (avoids rendering pages twice). */
export function ThumbGrid({ thumbs, numPages, selected, onToggle, label }: { thumbs: string[]; numPages: number; selected?: Set<number>; onToggle?: (i: number) => void; label?: (i: number) => React.ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
      {Array.from({ length: Math.max(numPages, thumbs.length) }, (_, i) => {
        const sel = selected?.has(i)
        const src = thumbs[i]
        return (
          <motion.button key={i} type="button" layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.015, 0.3) }} onClick={() => onToggle?.(i)}
            className={cn('group relative rounded-xl border-2 bg-surface-2 p-2 transition', onToggle && 'cursor-pointer', sel ? 'border-accent ring-4 ring-accent/20' : 'border-border hover:border-accent/50', selected && !sel && 'opacity-60')}>
            <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-md">
              {src ? <img src={src} alt={`Page ${i + 1}`} className="max-h-full max-w-full shadow" /> : <div className="shimmer size-full rounded-md bg-surface" />}
            </div>
            <div className="mt-1.5 text-center text-xs font-medium text-muted">{label ? label(i) : `Page ${i + 1}`}</div>
            {sel && <div className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-accent text-on-accent shadow"><svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5L20 7" /></svg></div>}
          </motion.button>
        )
      })}
    </div>
  )
}

/** Inline preview of a generated PDF using the browser's built-in viewer. */
export function PdfPreview({ blob, height = 520 }: { blob: Blob; height?: number }) {
  const url = useObjectUrl(blob)
  if (!url) return null
  return <iframe title="PDF preview" src={url + '#view=FitH'} className="w-full rounded-xl border border-border bg-surface-2" style={{ height }} />
}

export const isHeic = (f: File) => /\.(heic|heif)$/i.test(f.name) || /image\/hei[cf]/i.test(f.type)

/** Convert a HEIC/HEIF file into a browser-decodable blob (first frame). */
export async function heicToBlob(file: Blob, toType: 'image/jpeg' | 'image/png' | 'image/gif' = 'image/jpeg', quality = 0.92): Promise<Blob> {
  const heic2any = (await import('heic2any')).default as any
  const out = await heic2any({ blob: file, toType, quality })
  return Array.isArray(out) ? out[0] : out
}

/** Sandboxed iframe preview (scripts disabled). */
export function FramePreview({ srcDoc, height = '70vh', className }: { srcDoc: string; height?: number | string; className?: string }) {
  return <iframe title="Preview" sandbox="allow-same-origin" srcDoc={srcDoc} className={cn('w-full rounded-2xl border border-border bg-surface-2', className)} style={{ height }} />
}

/** Live iframe preview that patches its content in place (keeps scroll position while typing). */
export function LiveFrame({ css, body, pageWidthPt, marginPt, pageBg, desk, height = '72vh', className }: { css: string; body: string; pageWidthPt: number; marginPt: number; pageBg?: string; desk?: string; height?: number | string; className?: string }) {
  const ref = React.useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const shell = useMemo(() => '<!doctype html><html><head><meta charset="utf-8"><style id="of-css"></style><style id="of-shell"></style></head><body><div class="of-page"></div></body></html>', [])
  useEffect(() => {
    const d = ref.current?.contentDocument
    if (!ready || !d) return
    const px = (pt: number) => (pt * 96) / 72
    const sh = d.getElementById('of-shell'), c = d.getElementById('of-css'), page = d.querySelector('.of-page')
    if (c) c.textContent = '*{box-sizing:border-box;}img{max-width:100%;}' + css
    if (sh) sh.textContent = `html{background:${desk ?? '#d9dce3'}!important;}body{margin:0;padding:24px 12px;background:transparent!important;}.of-page{width:${px(pageWidthPt)}px;max-width:100%;margin:0 auto;padding:${px(marginPt)}px;background:${pageBg ?? '#fff'};box-shadow:0 10px 30px rgba(0,0,0,.18);min-height:${px(pageWidthPt * 1.3)}px;}.of-page .page-break{border-top:2px dashed #9aa0ad;margin:22px -${px(marginPt)}px;}`
    if (page) page.innerHTML = body
  }, [ready, css, body, pageWidthPt, marginPt, pageBg, desk])
  return <iframe ref={ref} title="Preview" sandbox="allow-same-origin" srcDoc={shell} onLoad={() => setReady(true)} className={cn('w-full rounded-2xl border border-border bg-surface-2', className)} style={{ height }} />
}
