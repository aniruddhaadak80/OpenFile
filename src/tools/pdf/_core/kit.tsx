/* Shared UI building blocks for the core PDF tools (merge, split, organize, …). */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ChevronLeft, ChevronRight, Download, FileText, RefreshCw, RotateCw, Archive, Eye, Loader2 } from 'lucide-react'
import { Button, Input, Spinner, cn, Badge, useOtherStartOver } from '@/components/ui'
import { openPdfJs, renderPage, type PdfJsDoc } from '@/lib/pdf'
import { downloadBlob, formatBytes, parsePageRanges, zipFiles } from '@/lib/files'

export const PDF_ACCEPT = 'application/pdf,.pdf'
export const readBytes = async (f: Blob) => new Uint8Array(await f.arrayBuffer())
export const ops = () => import('./ops')
export function closeDoc(d: PdfJsDoc | null | undefined) { try { const a = d as any; if (!a) return; if (a.loadingTask?.destroy) a.loadingTask.destroy(); else a.destroy?.() } catch { /* ignore */ } }

export function friendly(e: any): string {
  if (e?.name === 'PasswordException') return 'This PDF is password-protected. Unlock it first with Unlock PDF.'
  if (e?.name === 'InvalidPDFException') return 'This file is not a valid PDF (or it is badly damaged). Try Repair PDF.'
  return e?.message || String(e)
}

/** Open a pdf.js document for a file (cached per file) */
export function usePdfDoc(file: Blob | null) {
  const [doc, setDoc] = useState<PdfJsDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancel = false; let d: PdfJsDoc | null = null
    setDoc(null); setError(null)
    if (!file) return
    openPdfJs(file).then((x) => { d = x; if (cancel) closeDoc(x); else setDoc(x) }).catch((e) => !cancel && setError(friendly(e)))
    return () => { cancel = true; closeDoc(d) }
  }, [file])
  return { doc, numPages: doc?.numPages ?? 0, error }
}

/** Render one page of a pdf.js doc to a data URL at a target CSS width */
export function usePageImage(doc: PdfJsDoc | null, page: number, width = 700) {
  const [img, setImg] = useState<{ src: string; w: number; h: number } | null>(null)
  useEffect(() => {
    let cancel = false
    if (!doc || page < 1 || page > doc.numPages) { setImg(null); return }
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

/** File header with page count and "Start over" */
export function FileBar({ file, pages, onReset, extra }: { file: File; pages?: number; onReset: () => void; extra?: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent"><FileText className="size-5" /></div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{file.name}</div>
        <div className="text-xs text-muted">{formatBytes(file.size)}{pages ? ` · ${pages} page${pages > 1 ? 's' : ''}` : ''}</div>
      </div>
      {extra}
      <Button variant="ghost" size="sm" icon={<RefreshCw className="size-3.5" />} onClick={onReset}>Start over</Button>
    </motion.div>
  )
}

/** Thumbnail tile. */
export function Thumb({ src, label, rotation = 0, selected, dim, onClick, badge, children, className, aspect = 'aspect-[3/4]' }: {
  src?: string; label?: React.ReactNode; rotation?: number; selected?: boolean; dim?: boolean; onClick?: (e: React.MouseEvent) => void; badge?: React.ReactNode; children?: React.ReactNode; className?: string; aspect?: string
}) {
  return (
    <div onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(e as any) } }}
      className={cn('group relative select-none rounded-xl border-2 bg-surface-2 p-2 outline-none transition focus-visible:ring-4 focus-visible:ring-accent/30', onClick && 'cursor-pointer',
        selected ? 'border-accent ring-4 ring-accent/20' : 'border-border hover:border-accent/50', className)}>
      <div className={cn('flex items-center justify-center overflow-hidden', aspect)}>
        {src ? <img src={src} alt="" draggable={false} className={cn('max-h-full max-w-full bg-white shadow transition-all duration-300', dim && 'opacity-25 grayscale')} style={{ transform: `rotate(${rotation}deg)`, ...(rotation % 180 ? { maxWidth: '75%', maxHeight: '75%' } : {}) }} />
          : <div className="flex h-full w-full items-center justify-center"><Loader2 className="size-5 animate-spin text-muted" /></div>}
      </div>
      {label !== undefined && <div className="mt-1.5 truncate text-center text-xs font-medium text-muted">{label}</div>}
      {selected && <div className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-accent text-on-accent shadow"><Check className="size-3.5" /></div>}
      {badge}
      {children}
    </div>
  )
}

/** Selectable thumbnail grid with shift-click range selection */
export function SelectGrid({ thumbs, numPages, selected, setSelected, rotations, labels, dimSelected, overlay, mark }: {
  thumbs: string[]; numPages: number; selected: Set<number>; setSelected: (s: Set<number>) => void; rotations?: Record<number, number>
  labels?: (i: number) => React.ReactNode; dimSelected?: boolean; overlay?: (i: number) => React.ReactNode; mark?: (i: number) => string | undefined
}) {
  const last = useRef<number | null>(null)
  const toggle = (i: number, e: React.MouseEvent) => {
    const s = new Set(selected)
    if (e.shiftKey && last.current !== null) {
      const [a, b] = [Math.min(last.current, i), Math.max(last.current, i)]
      const on = !selected.has(i)
      for (let k = a; k <= b; k++) on ? s.add(k) : s.delete(k)
    } else s.has(i) ? s.delete(i) : s.add(i)
    last.current = i
    setSelected(s)
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
      {Array.from({ length: numPages }, (_, i) => (
        <motion.div key={i} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18, delay: Math.min(i, 24) * 0.012 }}>
          <Thumb src={thumbs[i]} rotation={rotations?.[i] ?? 0} selected={selected.has(i)} dim={dimSelected && selected.has(i)} onClick={(e) => toggle(i, e)}
            label={labels ? labels(i) : `Page ${i + 1}`} className={mark?.(i)}>
            {overlay?.(i)}
          </Thumb>
        </motion.div>
      ))}
    </div>
  )
}

/** Range input + quick selection buttons, kept in sync with a Set of 0-based pages */
export function SelectionBar({ total, selected, setSelected, placeholder = 'e.g. 1-3, 5, 8-' }: { total: number; selected: Set<number>; setSelected: (s: Set<number>) => void; placeholder?: string }) {
  const [text, setText] = useState('')
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) setText(toRanges([...selected])) }, [selected])
  const quick: [string, () => number[]][] = [
    ['All', () => Array.from({ length: total }, (_, i) => i)], ['None', () => []],
    ['Invert', () => Array.from({ length: total }, (_, i) => i).filter((i) => !selected.has(i))],
    ['Odd', () => Array.from({ length: total }, (_, i) => i).filter((i) => i % 2 === 0)], ['Even', () => Array.from({ length: total }, (_, i) => i).filter((i) => i % 2 === 1)],
  ]
  return (
    <div className="space-y-2">
      <Input value={text} placeholder={placeholder} onFocus={() => (focused.current = true)} onBlur={() => { focused.current = false; setText(toRanges([...selected])) }}
        onChange={(e) => { setText(e.target.value); setSelected(new Set(parsePageRanges(e.target.value, total))) }} />
      <div className="flex flex-wrap gap-1.5">
        {quick.map(([l, f]) => <button key={l} type="button" onClick={() => setSelected(new Set(f()))} className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition hover:border-accent hover:text-accent cursor-pointer">{l}</button>)}
      </div>
      <div className="text-xs text-muted">{selected.size} of {total} selected · <span className="opacity-80">Shift-click to select a range</span></div>
    </div>
  )
}

export function toRanges(idx: number[]) {
  const s = [...new Set(idx)].sort((a, b) => a - b)
  const out: string[] = []
  for (let i = 0; i < s.length; i++) {
    let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
    out.push(j > i ? `${s[i] + 1}-${s[j] + 1}` : `${s[i] + 1}`); i = j
  }
  return out.join(', ')
}

/** Debounced live preview: `build(onePageBytes, pageIndex, total)` returns a modified PDF whose first page is shown. */
export function LivePreview({ file, build, deps, pageIndex, setPageIndex, total, note, aspectHint, extractPages }: {
  file: Blob; build: (bytes: Uint8Array, pageIndex: number, total: number) => Promise<Uint8Array>; deps: unknown[]
  pageIndex: number; setPageIndex?: (i: number) => void; total: number; note?: React.ReactNode; aspectHint?: number
  /** which source pages to feed the builder (default: just the current one) */
  extractPages?: (pageIndex: number, total: number) => number[]
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const cache = useRef<{ key: string; bytes: Uint8Array } | null>(null)
  const seq = useRef(0)
  useEffect(() => {
    const my = ++seq.current
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const o = await ops()
        const pagesIdx = extractPages ? extractPages(pageIndex, total) : [pageIndex]
        const key = pagesIdx.join(',')
        if (cache.current?.key !== key) cache.current = { key, bytes: await o.pick(await readBytes(file), pagesIdx) }
        const out = await build(cache.current.bytes, pageIndex, total)
        const d = await openPdfJs(out)
        const p = await d.getPage(1)
        const vp = p.getViewport({ scale: 1 })
        const c = await renderPage(d, 1, Math.min(2.2, 900 / Math.max(vp.width, vp.height)) * Math.min(2, window.devicePixelRatio || 1) / 1.2)
        if (my !== seq.current) { closeDoc(d); return }
        setSrc(c.toDataURL('image/jpeg', 0.9)); setErr(null); closeDoc(d)
      } catch (e: any) { if (my === seq.current) setErr(friendly(e)) } finally { if (my === seq.current) setBusy(false) }
    }, 220)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, pageIndex, ...deps])
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium"><Eye className="size-4 text-accent" /> Live preview {busy && <Loader2 className="size-3.5 animate-spin text-muted" />}</div>
        {setPageIndex && total > 1 && <PageStepper page={pageIndex} total={total} onChange={setPageIndex} />}
      </div>
      <div className="checker relative flex min-h-[320px] items-center justify-center overflow-hidden rounded-xl p-4" style={aspectHint ? { aspectRatio: String(aspectHint) } : undefined}>
        {err ? <div className="max-w-sm text-center text-sm text-danger">{err}</div>
          : src ? <motion.img key={src.length} initial={{ opacity: 0.6 }} animate={{ opacity: 1 }} src={src} alt="Preview" className="max-h-[70vh] max-w-full rounded-sm bg-white shadow-2xl ring-1 ring-black/10" />
            : <Spinner label="Rendering preview…" />}
      </div>
      {note && <div className="mt-2 text-xs text-muted">{note}</div>}
    </div>
  )
}

export function PageStepper({ page, total, onChange }: { page: number; total: number; onChange: (i: number) => void }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <button type="button" disabled={page <= 0} onClick={() => onChange(page - 1)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30 cursor-pointer" aria-label="Previous page"><ChevronLeft className="size-4" /></button>
      <span className="min-w-16 text-center font-mono">{page + 1} / {total}</span>
      <button type="button" disabled={page >= total - 1} onClick={() => onChange(page + 1)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30 cursor-pointer" aria-label="Next page"><ChevronRight className="size-4" /></button>
    </div>
  )
}

/** Result list for multi-file outputs (download individually or all as ZIP) */
export type OutFile = { name: string; blob: Blob; pages?: number; note?: string }
export function MultiResult({ files, zipName, onReset, originalSize, title }: { files: OutFile[]; zipName: string; onReset: () => void; originalSize?: number; title?: string }) {
  const [zipping, setZipping] = useState(false)
  const total = files.reduce((a, f) => a + f.blob.size, 0)
  const box = useRef<HTMLDivElement>(null)
  const other = useOtherStartOver(box)
  return (
    <motion.div ref={box} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-success/30 bg-success/5 p-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid size-12 place-items-center rounded-xl bg-success/15 text-success"><Check className="size-6" /></div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{title ?? `${files.length} files ready`}</div>
          <div className="text-sm text-muted">{formatBytes(total)} total{originalSize ? ` · from ${formatBytes(originalSize)}` : ''}</div>
        </div>
        <div className="flex gap-2">
          {!other && <Button variant="ghost" data-card-reset="" onClick={onReset}>Start over</Button>}
          <Button icon={<Archive className="size-4" />} loading={zipping} onClick={async () => { setZipping(true); try { downloadBlob(await zipFiles(files.map((f) => ({ name: f.name, data: f.blob }))), zipName) } finally { setZipping(false) } }}>Download ZIP</Button>
        </div>
      </div>
      <div className="mt-4 max-h-80 space-y-1.5 overflow-auto pr-1 scrollbar-thin">
        {files.map((f, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2">
            <FileText className="size-4 shrink-0 text-accent" />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{f.name}</div><div className="text-xs text-muted">{formatBytes(f.blob.size)}{f.pages ? ` · ${f.pages} page${f.pages > 1 ? 's' : ''}` : ''}{f.note ? ` · ${f.note}` : ''}</div></div>
            <button onClick={() => downloadBlob(f.blob, f.name)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-accent cursor-pointer" aria-label={`Download ${f.name}`}><Download className="size-4" /></button>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

/** Small rotate button used on thumbnails */
export function ThumbAction({ onClick, title, children, className }: { onClick: () => void; title: string; children: React.ReactNode; className?: string }) {
  return <button type="button" title={title} aria-label={title} onClick={(e) => { e.stopPropagation(); onClick() }} onPointerDown={(e) => e.stopPropagation()}
    className={cn('grid size-7 place-items-center rounded-lg bg-surface/95 text-fg shadow ring-1 ring-border backdrop-blur transition hover:bg-accent hover:text-white cursor-pointer', className)}>{children}</button>
}

export { AnimatePresence, motion, Badge, RotateCw }

/** Common options: target page range */
export function PageScope({ total, mode, setMode, range, setRange }: { total: number; mode: 'all' | 'range'; setMode: (m: 'all' | 'range') => void; range: string; setRange: (s: string) => void }) {
  const n = useMemo(() => (mode === 'all' ? total : parsePageRanges(range, total).length), [mode, range, total])
  return (
    <div className="space-y-2">
      <div className="flex gap-1 rounded-xl border border-border bg-surface-2/60 p-1">
        {(['all', 'range'] as const).map((m) => <button key={m} type="button" onClick={() => setMode(m)} className={cn('flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer', mode === m ? 'bg-surface text-fg shadow-sm ring-1 ring-border' : 'text-muted hover:text-fg')}>{m === 'all' ? 'All pages' : 'Page range'}</button>)}
      </div>
      {mode === 'range' && <Input aria-label="Page range" value={range} onChange={(e) => setRange(e.target.value)} placeholder="e.g. 1-3, 5, 8-" />}
      <div className="text-xs text-muted">Applies to {n} of {total} page{total === 1 ? '' : 's'}</div>
    </div>
  )
}

export function scopePages(mode: 'all' | 'range', range: string, total: number) {
  return mode === 'all' ? undefined : parsePageRanges(range, total)
}

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" aria-label="Pick a colour" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-transparent p-1" />
      <Input aria-label="Colour hex code" value={value} onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && onChange(e.target.value)} className="font-mono" />
    </div>
  )
}

export const useStable = <T,>(fn: T) => { const r = useRef(fn); r.current = fn; return useCallback((...a: any[]) => (r.current as any)(...a), []) as unknown as T }

export function PositionPicker<T extends string>({ value, onChange, options, rows }: { value: T; onChange: (v: T) => void; options: T[]; rows: number }) {
  return (
    <div className="mx-auto grid aspect-[3/4] w-28 gap-1 rounded-lg border border-border bg-surface-2/60 p-1.5" style={{ gridTemplateRows: `repeat(${rows}, 1fr)`, gridTemplateColumns: 'repeat(3, 1fr)' }}>
      {options.map((p) => (
        <button key={p} type="button" onClick={() => onChange(p)} aria-label={p} className={cn('grid place-items-center rounded-md transition cursor-pointer', rows === 2 && (p[0] === 't' ? 'items-start' : 'items-end'), value === p ? 'bg-accent/15' : 'hover:bg-surface')}>
          <span className={cn('block h-1.5 w-5 rounded-full transition', value === p ? 'bg-accent' : 'bg-border')} />
        </button>
      ))}
    </div>
  )
}


export const FONTS_LIST: { value: import('./ops').FontName; label: string }[] = [
  { value: 'Helvetica', label: 'Helvetica' }, { value: 'Helvetica-Bold', label: 'Helvetica Bold' }, { value: 'Times-Roman', label: 'Times' },
  { value: 'Times-Bold', label: 'Times Bold' }, { value: 'Courier', label: 'Courier' }, { value: 'Courier-Bold', label: 'Courier Bold' },
]
