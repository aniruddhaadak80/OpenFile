import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ZoomIn, ZoomOut, ChevronUp, ChevronDown, Search, X, Download, Maximize, Minimize, PanelLeft, LayoutList, ListTree, MoveHorizontal,
  Expand, RotateCw, Printer, Copy, ChevronRight, Loader2, FileText, MessageSquare, MessageSquareOff,
} from 'lucide-react'
import { Dropzone, Spinner, cn } from '@/components/ui'
import { pdfjs, pageText, openPdfJs, type PdfJsDoc } from '@/lib/pdf'
import { copyText, downloadBlob, formatBytes } from '@/lib/files'
import { toast } from '@/components/toast'
import { PDF_ACCEPT, friendly, closeDoc } from './_core/kit'

type Rect = { x: number; y: number; w: number; h: number } // fractions of the (unrotated-view) page
type Match = { page: number; rects: Rect[] }
type OutlineNode = { title: string; dest: any; url?: string | null; items: OutlineNode[]; bold?: boolean; italic?: boolean }
type Note = { page: number; type: string; author: string; text: string; date: string; color?: string }
const NOTE_TYPES: Record<string, string> = { Text: 'Comment', FreeText: 'Text box', Highlight: 'Highlight', Underline: 'Underline', StrikeOut: 'Strikeout', Squiggly: 'Squiggly', Ink: 'Drawing', Stamp: 'Stamp', Square: 'Rectangle', Circle: 'Ellipse', Line: 'Line', Polygon: 'Polygon', PolyLine: 'Polyline', Caret: 'Insert', FileAttachment: 'Attachment', Sound: 'Sound', Redact: 'Redaction' }
const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]
const GAP = 16

function rotateRect(r: Rect, rot: number): Rect {
  switch (rot) {
    case 90: return { x: 1 - r.y - r.h, y: r.x, w: r.h, h: r.w }
    case 180: return { x: 1 - r.x - r.w, y: 1 - r.y - r.h, w: r.w, h: r.h }
    case 270: return { x: r.y, y: 1 - r.x - r.w, w: r.h, h: r.w }
    default: return r
  }
}

export default function PdfReader() {
  const [file, setFile] = useState<File | null>(null)
  const [doc, setDoc] = useState<PdfJsDoc | null>(null)
  const [sizes, setSizes] = useState<[number, number][]>([]) // unrotated-view size at scale 1
  const [err, setErr] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [fit, setFit] = useState<'width' | 'page' | null>('width')
  const [rot, setRot] = useState(0)
  const [current, setCurrent] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [side, setSide] = useState<'thumbs' | 'outline' | 'notes' | null>(typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'thumbs' : null)
  const [outline, setOutline] = useState<OutlineNode[] | null>(null)
  const [visible, setVisible] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [matches, setMatches] = useState<Match[]>([])
  const [active, setActive] = useState(0)
  const [searching, setSearching] = useState<number | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [full, setFull] = useState(false)
  const [showAnnots, setShowAnnots] = useState(true)
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [printing, setPrinting] = useState<number | null>(null)
  // read comments and markups when the Notes tab is opened
  useEffect(() => {
    if (side !== 'notes' || !doc || notes !== null) return
    let off = false
    ;(async () => {
      const out: Note[] = []
      for (let i = 1; i <= doc.numPages && !off; i++) {
        try {
          const ann = await (await doc.getPage(i)).getAnnotations({ intent: 'display' })
          for (const a of ann as any[]) {
            if (!NOTE_TYPES[a.subtype]) continue
            const c = a.color ? `rgb(${a.color[0]}, ${a.color[1]}, ${a.color[2]})` : undefined
            const d = a.modificationDate ? (pdfjs as any).PDFDateString?.toDateObject?.(a.modificationDate) : null
            out.push({ page: i, type: NOTE_TYPES[a.subtype], author: a.titleObj?.str ?? '', text: a.contentsObj?.str ?? (a.subtype === 'FreeText' ? a.textContent?.join(' ') ?? '' : ''), date: d ? d.toLocaleDateString() : '', color: c })
          }
        } catch { /* skip page */ }
      }
      if (!off) setNotes(out)
    })()
    return () => { off = true }
  }, [side, doc, notes])
  const shell = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const pageEls = useRef(new Map<number, HTMLDivElement>())
  const revealed = useRef(false)
  const textCache = useRef(new Map<number, { str: string; items: { start: number; end: number; tx: number[]; width: number }[] }>())

  /* ---------- load */
  useEffect(() => {
    if (!file) return
    let cancel = false; let d: PdfJsDoc | null = null
    setDoc(null); setErr(null); setSizes([]); setOutline(null); setNotes(null); setMatches([]); textCache.current.clear(); setCurrent(1); setRot(0)
    ;(async () => {
      try {
        d = await openPdfJs(file)
        if (cancel) return
        const s: [number, number][] = []
        for (let i = 1; i <= d.numPages; i++) { const p = await d.getPage(i); const v = p.getViewport({ scale: 1 }); s.push([v.width, v.height]) }
        if (cancel) return
        setSizes(s); setDoc(d)
        d.getOutline().then((o: any) => !cancel && setOutline(o ?? [])).catch(() => setOutline([]))
      } catch (e) { if (!cancel) setErr(friendly(e)) }
    })()
    return () => { cancel = true; closeDoc(d) }
  }, [file])

  const viewSize = useCallback((i: number): [number, number] => { const s = sizes[i] ?? [612, 792]; return rot % 180 ? [s[1], s[0]] : s }, [sizes, rot])
  const maxW = useMemo(() => Math.max(1, ...sizes.map((_, i) => viewSize(i)[0])), [sizes, viewSize])

  /* ---------- fit */
  const computeFit = useCallback((mode: 'width' | 'page') => {
    const el = scroller.current; if (!el || !sizes.length) return 1
    const availW = el.clientWidth - 48, availH = el.clientHeight - 32
    const [w, h] = viewSize(current - 1)
    return mode === 'width' ? availW / maxW : Math.min(availW / w, availH / h)
  }, [sizes, viewSize, current, maxW])

  useEffect(() => {
    if (!fit || !scroller.current) return
    const apply = () => setZoom(Math.max(0.1, Math.min(6, computeFit(fit))))
    apply()
    const ro = new ResizeObserver(apply); ro.observe(scroller.current)
    return () => ro.disconnect()
  }, [fit, computeFit, doc, full, side])

  /* ---------- keep scroll anchored when zoom/rotation changes */
  const anchor = useRef<{ page: number; offset: number } | null>(null)
  const captureAnchor = () => {
    const el = scroller.current; if (!el) return
    const pe = pageEls.current.get(current)
    if (pe) anchor.current = { page: current, offset: (el.scrollTop - pe.offsetTop) / Math.max(1, pe.offsetHeight) }
  }
  const zoomTo = (z: number, keepFit = false) => { captureAnchor(); if (!keepFit) setFit(null); setZoom(Math.max(0.1, Math.min(6, z))) }
  useLayoutEffect(() => {
    const a = anchor.current, el = scroller.current
    if (!a || !el) return
    const pe = pageEls.current.get(a.page)
    if (pe) el.scrollTop = pe.offsetTop + a.offset * pe.offsetHeight
    anchor.current = null
  }, [zoom, rot])

  /* ---------- visibility + current page */
  useEffect(() => {
    const root = scroller.current; if (!root || !doc) return
    const io = new IntersectionObserver((entries) => {
      setVisible((prev) => {
        const n = new Set(prev)
        entries.forEach((e) => { const p = Number((e.target as HTMLElement).dataset.page); e.isIntersecting ? n.add(p) : n.delete(p) })
        return n
      })
    }, { root, rootMargin: '600px 0px' })
    pageEls.current.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [doc, sizes])

  const onScroll = () => {
    const el = scroller.current; if (!el) return
    const mid = el.scrollTop + el.clientHeight * 0.35
    let best = 1
    for (const [p, pe] of pageEls.current) if (pe.offsetTop <= mid) best = Math.max(best, p)
    if (best !== current) { setCurrent(best); setPageInput(String(best)) }
  }

  const goTo = useCallback((p: number, yFrac = 0, smooth = true) => {
    const el = scroller.current, pe = pageEls.current.get(p)
    if (!el || !pe) return
    el.scrollTo({ top: pe.offsetTop + yFrac * pe.offsetHeight - (yFrac ? el.clientHeight * 0.3 : 8), behavior: smooth ? 'smooth' : 'auto' })
    setCurrent(p); setPageInput(String(p))
  }, [])

  /* ---------- search */
  const getText = useCallback(async (p: number) => {
    const c = textCache.current.get(p); if (c) return c
    const page = await doc!.getPage(p)
    const vp = page.getViewport({ scale: 1 })
    const tc = await page.getTextContent()
    let str = ''
    const items: { start: number; end: number; tx: number[]; width: number }[] = []
    for (const it of tc.items as any[]) {
      if (!('str' in it)) continue
      const start = str.length
      str += it.str
      items.push({ start, end: str.length, tx: pdfjs.Util.transform(vp.transform, it.transform), width: it.width })
      str += it.hasEOL ? '\n' : ''
    }
    const v = { str, items, vw: vp.width, vh: vp.height }
    textCache.current.set(p, v as any)
    return v as typeof v
  }, [doc])

  useEffect(() => {
    if (!doc) return
    const q = query.trim()
    setMatches([]); setActive(0); revealed.current = false
    if (q.length < 2) { setSearching(null); return }
    let cancel = false
    const t = setTimeout(async () => {
      const found: Match[] = []
      const needle = matchCase ? q : q.toLowerCase()
      for (let p = 1; p <= doc.numPages; p++) {
        if (cancel) return
        setSearching(p)
        const t = (await getText(p)) as any
        const hay = matchCase ? t.str : t.str.toLowerCase()
        let idx = hay.indexOf(needle)
        while (idx >= 0) {
          const end = idx + needle.length
          const rects: Rect[] = []
          for (const it of t.items) {
            if (it.end <= idx || it.start >= end) continue
            const len = Math.max(1, it.end - it.start)
            const a = (Math.max(idx, it.start) - it.start) / len, b = (Math.min(end, it.end) - it.start) / len
            const tx = it.tx
            const fh = Math.hypot(tx[2], tx[3])
            const ux = tx[0] / Math.hypot(tx[0], tx[1]) || 1, uy = tx[1] / Math.hypot(tx[0], tx[1]) || 0
            const upx = tx[2], upy = tx[3]
            const ox = tx[4], oy = tx[5]
            const pts = [[ox + ux * it.width * a, oy + uy * it.width * a], [ox + ux * it.width * b, oy + uy * it.width * b]]
            const all = [...pts, ...pts.map(([x, y]) => [x + upx, y + upy])]
            const xs = all.map((q) => q[0]), ys = all.map((q) => q[1])
            const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys)
            rects.push({ x: x0 / t.vw, y: (y0 - fh * 0.1) / t.vh, w: (x1 - x0) / t.vw, h: (y1 - y0 + fh * 0.25) / t.vh })
          }
          if (rects.length) found.push({ page: p, rects })
          idx = hay.indexOf(needle, end)
        }
        if (p % 5 === 0 || p === doc.numPages) { if (cancel) return; setMatches([...found]) }
      }
      if (!cancel) { setMatches(found); setSearching(null) }
    }, 250)
    return () => { cancel = true; clearTimeout(t) }
  }, [query, matchCase, doc, getText])

  const jumpMatch = (i: number) => {
    if (!matches.length) return
    revealed.current = true
    const k = (i + matches.length) % matches.length
    setActive(k)
    const m = matches[k]
    const r = rotateRect(m.rects[0], rot)
    goTo(m.page, r.y)
  }

  /* ---------- keyboard */
  useEffect(() => {
    if (!doc) return
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const inField = (e.target as HTMLElement)?.closest('input,textarea')
      if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); setSearchOpen(true); setTimeout(() => searchInput.current?.select(), 0) }
      else if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomTo(ZOOMS.find((z) => z > zoom + 0.001) ?? zoom) }
      else if (mod && e.key === '-') { e.preventDefault(); zoomTo([...ZOOMS].reverse().find((z) => z < zoom - 0.001) ?? zoom) }
      else if (mod && e.key === '0') { e.preventDefault(); setFit('width') }
      else if (inField) return
      else if (e.key === 'Home') { e.preventDefault(); goTo(1) }
      else if (e.key === 'End') { e.preventDefault(); goTo(doc.numPages) }
      else if (e.key === 'ArrowRight' || e.key === 'n') goTo(Math.min(doc.numPages, current + 1))
      else if (e.key === 'ArrowLeft' || e.key === 'p') goTo(Math.max(1, current - 1))
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  /* ---------- fullscreen */
  useEffect(() => { const h = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', h); return () => document.removeEventListener('fullscreenchange', h) }, [])
  const toggleFull = () => { if (document.fullscreenElement) document.exitFullscreen(); else shell.current?.requestFullscreen?.().catch(() => toast('Fullscreen is not available here', 'error')) }

  // print by rendering pages to images: works in every browser, including phones, and respects the annotation toggle
  const print = async () => {
    if (!doc || printing !== null) return
    if (doc.numPages > 300) { printNative(); return }
    setPrinting(0)
    const urls: string[] = []
    try {
      for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i)
        const vp = pg.getViewport({ scale: 150 / 72 })
        const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height)
        const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
        await pg.render({ canvasContext: ctx, viewport: vp, canvas: c, annotationMode: showAnnots ? (pdfjs as any).AnnotationMode.ENABLE_FORMS : (pdfjs as any).AnnotationMode.DISABLE, intent: 'print' } as any).promise
        const b: Blob = await new Promise((r) => c.toBlob((x) => r(x!), 'image/jpeg', 0.9))
        urls.push(URL.createObjectURL(b)); c.width = c.height = 0
        setPrinting(i / doc.numPages)
      }
      const f = document.createElement('iframe')
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
      document.body.appendChild(f)
      const d = f.contentDocument!
      d.open(); d.write(`<!doctype html><html><head><title>${(file?.name ?? 'Print').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}</title><style>@page{margin:0}html,body{margin:0}img{display:block;width:100%;height:auto;break-after:page;page-break-after:always}img:last-child{break-after:auto;page-break-after:auto}</style></head><body>${urls.map((u) => `<img src="${u}">`).join('')}</body></html>`); d.close()
      await Promise.all([...d.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = r; im.onerror = r }))))
      f.contentWindow?.focus(); f.contentWindow?.print()
      setTimeout(() => { f.remove(); urls.forEach((u) => URL.revokeObjectURL(u)) }, 60000)
    } catch { urls.forEach((u) => URL.revokeObjectURL(u)); printNative() } finally { setPrinting(null) }
  }
  const printNative = () => {
    if (!file) return
    // Always typed as PDF, so a renamed HTML file can never be rendered as a page on this origin.
    const url = URL.createObjectURL(new Blob([file], { type: 'application/pdf' }))
    const f = document.createElement('iframe')
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
    f.src = url
    f.onload = () => { try { f.contentWindow?.focus(); f.contentWindow?.print() } catch { window.open(url, '_blank', 'noopener') } setTimeout(() => { f.remove(); URL.revokeObjectURL(url) }, 60000) }
    document.body.appendChild(f)
  }
  const copyPage = async () => { if (!doc) return; const t = await pageText(doc, current); if (!t.trim()) toast('No text on this page (it may be a scan, try OCR PDF)', 'info'); else if (await copyText(t)) toast(`Copied text of page ${current}`, 'success') }

  const resolveDest = async (dest: any): Promise<number | null> => {
    if (!doc || !dest) return null
    try {
      const d = typeof dest === 'string' ? await doc.getDestination(dest) : dest
      if (!Array.isArray(d)) return null
      const ref = d[0]
      return typeof ref === 'number' ? ref + 1 : (await doc.getPageIndex(ref)) + 1
    } catch { return null }
  }
  const openOutline = async (n: OutlineNode) => {
    if (n.url) { window.open(n.url, '_blank', 'noopener'); return }
    const p = await resolveDest(n.dest); if (p) { goTo(p); if (window.innerWidth < 768) setSide(null) }
  }

  const reset = () => { setFile(null); setDoc(null); setQuery(''); setSearchOpen(false) }

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to read" sub="Fast, private viewer with search, zoom, thumbnails and bookmarks." />
  if (err) return <div className="space-y-3"><div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{err}</div><button onClick={reset} className="text-sm text-accent hover:underline cursor-pointer">Open another file</button></div>

  const n = doc?.numPages ?? 0
  const pageMatches = (p: number) => matches.map((m, i) => ({ m, i })).filter((x) => x.m.page === p)
  const tb = 'grid size-9 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-fg disabled:opacity-30 cursor-pointer'

  return (
    <div ref={shell} className={cn('flex flex-col overflow-hidden rounded-2xl border border-border bg-surface', full ? 'h-screen rounded-none border-0' : 'h-[calc(100vh-180px)] min-h-[520px]')}>
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
        <button className={cn(tb, side && 'bg-surface-2 text-fg')} onClick={() => setSide(side ? null : 'thumbs')} title="Toggle sidebar"><PanelLeft className="size-4" /></button>
        <div className="mx-0.5 hidden min-w-0 max-w-48 items-center gap-1.5 truncate text-sm font-medium sm:flex" title={file.name}><FileText className="size-4 shrink-0 text-accent" /><span className="truncate">{file.name}</span></div>
        <div className="mx-1 h-5 w-px bg-border max-sm:hidden" />
        <button className={tb} disabled={current <= 1} onClick={() => goTo(current - 1)} title="Previous page"><ChevronUp className="size-4" /></button>
        <form onSubmit={(e) => { e.preventDefault(); const p = parseInt(pageInput); if (p >= 1 && p <= n) goTo(p); else setPageInput(String(current)) }} className="flex items-center gap-1 text-sm">
          <input value={pageInput} onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))} onBlur={() => setPageInput(String(current))} className="h-8 w-11 rounded-lg border border-border bg-surface-2/60 text-center font-mono text-xs outline-none focus:border-accent" aria-label="Page number" />
          <span className="text-xs text-muted">/ {n || '…'}</span>
        </form>
        <button className={tb} disabled={current >= n} onClick={() => goTo(current + 1)} title="Next page"><ChevronDown className="size-4" /></button>
        <div className="mx-1 h-5 w-px bg-border" />
        <button className={tb} onClick={() => zoomTo([...ZOOMS].reverse().find((z) => z < zoom - 0.001) ?? zoom)} title="Zoom out (Ctrl -)"><ZoomOut className="size-4" /></button>
        <select value={fit ?? String(zoom)} onChange={(e) => { const v = e.target.value; if (v === 'width' || v === 'page') { captureAnchor(); setFit(v) } else zoomTo(+v) }} className="h-8 rounded-lg border border-border bg-surface-2/60 px-1.5 text-xs outline-none focus:border-accent cursor-pointer" aria-label="Zoom">
          <option value="width">Fit width</option><option value="page">Fit page</option>
          {!fit && !ZOOMS.includes(zoom) && <option value={String(zoom)}>{Math.round(zoom * 100)}%</option>}
          {ZOOMS.map((z) => <option key={z} value={String(z)}>{Math.round(z * 100)}%</option>)}
        </select>
        <button className={tb} onClick={() => zoomTo(ZOOMS.find((z) => z > zoom + 0.001) ?? zoom)} title="Zoom in (Ctrl +)"><ZoomIn className="size-4" /></button>
        <button className={cn(tb, 'max-md:hidden', fit === 'width' && 'text-accent')} onClick={() => { captureAnchor(); setFit('width') }} title="Fit width"><MoveHorizontal className="size-4" /></button>
        <button className={cn(tb, 'max-md:hidden', fit === 'page' && 'text-accent')} onClick={() => { captureAnchor(); setFit('page') }} title="Fit page"><Expand className="size-4" /></button>
        <button className={tb} onClick={() => { captureAnchor(); setRot((r) => (r + 90) % 360) }} title="Rotate view"><RotateCw className="size-4" /></button>
        <div className="ml-auto flex items-center gap-1">
          <button className={cn(tb, searchOpen && 'bg-surface-2 text-fg')} onClick={() => { setSearchOpen((s) => !s); setTimeout(() => searchInput.current?.focus(), 0) }} title="Search (Ctrl F)"><Search className="size-4" /></button>
          <button className={cn(tb, 'max-sm:hidden')} onClick={copyPage} title="Copy text of this page"><Copy className="size-4" /></button>
          <button className={cn(tb, !showAnnots && 'text-muted', showAnnots && 'text-fg')} onClick={() => setShowAnnots((v) => !v)} title={showAnnots ? 'Hide comments and markups' : 'Show comments and markups'} aria-pressed={showAnnots}>{showAnnots ? <MessageSquare className="size-4" /> : <MessageSquareOff className="size-4" />}</button>
          <button className={tb} onClick={print} disabled={printing !== null} title="Print">{printing !== null ? <span className="font-mono text-[10px]">{Math.round(printing * 100)}%</span> : <Printer className="size-4" />}</button>
          <button className={tb} onClick={() => downloadBlob(file, file.name)} title={`Download (${formatBytes(file.size)})`}><Download className="size-4" /></button>
          <button className={tb} onClick={toggleFull} title="Fullscreen">{full ? <Minimize className="size-4" /> : <Maximize className="size-4" />}</button>
          <button className={tb} onClick={reset} title="Close file"><X className="size-4" /></button>
        </div>
      </div>
      {searchOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2/40 px-3 py-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input ref={searchInput} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search in document…" autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); jumpMatch(e.shiftKey ? active - 1 : active + (revealed.current ? 1 : 0)); revealed.current = true } if (e.key === 'Escape') setSearchOpen(false) }}
              className="h-9 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-sm outline-none focus:border-accent" />
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} className="accent-[var(--accent)]" />Match case</label>
          <span className="min-w-24 text-right font-mono text-xs text-muted">
            {searching ? <span className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" />p{searching}/{n}</span> : null}
            {!searching && query.trim().length >= 2 ? (matches.length ? `${active + 1} / ${matches.length}` : 'No matches') : null}
          </span>
          <button className={tb} disabled={!matches.length} onClick={() => jumpMatch(active - 1)} title="Previous match (Shift+Enter)"><ChevronUp className="size-4" /></button>
          <button className={tb} disabled={!matches.length} onClick={() => jumpMatch(active + 1)} title="Next match (Enter)"><ChevronDown className="size-4" /></button>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        {side && (
          <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-surface max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-20 max-md:shadow-2xl">
            <div className="flex gap-1 border-b border-border p-1.5">
              {([['thumbs', LayoutList, 'Pages'], ['outline', ListTree, 'Outline'], ['notes', MessageSquare, 'Notes']] as const).map(([k, I, l]) => (
                <button key={k} onClick={() => setSide(k)} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition cursor-pointer', side === k ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg')}><I className="size-3.5" />{l}</button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-auto scrollbar-thin p-2">
              {side === 'notes' ? (notes === null ? <Spinner label="Reading comments…" /> : notes.length === 0 ? <div className="p-3 text-center text-xs text-muted">No comments or markups in this document.</div>
                : <div className="space-y-1.5">{notes.map((nt, k) => (
                  <button key={k} type="button" onClick={() => { goTo(nt.page); if (window.innerWidth < 768) setSide(null) }} className={cn('block w-full rounded-lg border border-border p-2 text-left text-xs transition hover:border-accent cursor-pointer', nt.page === current && 'bg-surface-2')}>
                    <div className="flex items-center gap-1.5"><span className="size-2 shrink-0 rounded-full" style={{ background: nt.color ?? 'var(--accent)' }} /><span className="font-medium">{nt.type}</span><span className="ml-auto text-muted">p. {nt.page}</span></div>
                    {nt.text && <div className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-fg/90">{nt.text}</div>}
                    {(nt.author || nt.date) && <div className="mt-1 truncate text-[10px] text-muted">{[nt.author, nt.date].filter(Boolean).join(' · ')}</div>}
                  </button>))}</div>)
                : side === 'thumbs' ? (doc ? <ThumbList doc={doc} current={current} onPick={(p) => { goTo(p, 0, false); if (window.innerWidth < 768) setSide(null) }} matchPages={new Set(matches.map((m) => m.page))} /> : <Spinner />)
                : outline === null ? <Spinner label="Loading…" /> : outline.length === 0 ? <div className="p-3 text-center text-xs text-muted">This document has no bookmarks.</div>
                  : <OutlineTree nodes={outline} onPick={openOutline} />}
            </div>
          </aside>
        )}
        <div ref={scroller} onScroll={onScroll} className="relative min-w-0 flex-1 overflow-auto bg-surface-2 scrollbar-thin" tabIndex={0}>
          {!doc ? <div className="grid h-full place-items-center"><Spinner label="Opening document…" /></div> : (
            <div className="flex min-w-max flex-col items-center px-6 py-4" style={{ gap: GAP }}>
              {sizes.map((_, i) => {
                const p = i + 1
                const [w, h] = viewSize(i)
                return (
                  <div key={p} data-page={p} ref={(el) => { if (el) pageEls.current.set(p, el); else pageEls.current.delete(p) }}
                    className="relative shrink-0 bg-white shadow-lg ring-1 ring-black/5" style={{ width: Math.round(w * zoom), height: Math.round(h * zoom) }}>
                    <PageCanvas doc={doc} page={p} zoom={zoom} rot={rot} visible={visible.has(p)} annots={showAnnots} />
                    {visible.has(p) && <LinkLayer doc={doc} page={p} rot={rot} onDest={async (dest) => { const t = await resolveDest(dest); if (t) goTo(t) }} />}
                    {pageMatches(p).map(({ m, i: mi }) => m.rects.map((r0, k) => {
                      const r = rotateRect(r0, rot)
                      return <div key={`${mi}-${k}`} className={cn('pointer-events-none absolute rounded-[2px] mix-blend-multiply transition-colors', mi === active ? 'bg-orange-400/70 ring-2 ring-orange-500' : 'bg-yellow-300/60')}
                        style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }} />
                    }))}
                    <div className="pointer-events-none absolute -bottom-0.5 right-1 translate-y-full pt-0.5 text-[10px] text-muted">{p}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PageCanvas({ doc, page, zoom, rot, visible, annots }: { doc: PdfJsDoc; page: number; zoom: number; rot: number; visible: boolean; annots: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const done = useRef<{ zoom: number; rot: number; annots: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!visible) {
      // free memory for far-away pages
      if (ref.current && done.current) { ref.current.width = 0; ref.current.height = 0; done.current = null }
      return
    }
    if (done.current && done.current.zoom === zoom && done.current.rot === rot && done.current.annots === annots) return
    let task: any = null, cancelled = false
    const t = setTimeout(async () => {
      try {
        setBusy(!done.current)
        const p = await doc.getPage(page)
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const scale = Math.min(zoom * dpr, 4096 / Math.max(p.view[2], p.view[3]))
        const vp = p.getViewport({ scale, rotation: (p.rotate + rot) % 360 })
        const off = document.createElement('canvas')
        off.width = Math.ceil(vp.width); off.height = Math.ceil(vp.height)
        const ctx = off.getContext('2d')!
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, off.width, off.height)
        task = p.render({ canvasContext: ctx, viewport: vp, canvas: off, annotationMode: annots ? (pdfjs as any).AnnotationMode.ENABLE_FORMS : (pdfjs as any).AnnotationMode.DISABLE } as any)
        await task.promise
        if (cancelled || !ref.current) return
        const c = ref.current
        c.width = off.width; c.height = off.height
        c.getContext('2d')!.drawImage(off, 0, 0)
        done.current = { zoom, rot, annots }
      } catch { /* cancelled */ } finally { if (!cancelled) setBusy(false) }
    }, done.current ? 140 : 0)
    return () => { cancelled = true; clearTimeout(t); try { task?.cancel() } catch { /* ignore */ } }
  }, [doc, page, zoom, rot, visible, annots])
  return <>
    <canvas ref={ref} className="absolute inset-0 h-full w-full" />
    {busy && <div className="absolute inset-0 grid place-items-center"><Loader2 className="size-6 animate-spin text-neutral-300" /></div>}
  </>
}

/** Clickable areas for links: web links open in a new tab, internal links jump to their page. */
function LinkLayer({ doc, page, rot, onDest }: { doc: PdfJsDoc; page: number; rot: number; onDest: (dest: any) => void }) {
  const [links, setLinks] = useState<{ r: Rect; url?: string; dest?: any }[]>([])
  useEffect(() => {
    let off = false
    doc.getPage(page).then(async (p) => {
      const vp = p.getViewport({ scale: 1, rotation: p.rotate })
      const ann = await p.getAnnotations({ intent: 'display' })
      const out = ann.filter((a: any) => a.subtype === 'Link' && (a.url || a.dest || a.unsafeUrl)).map((a: any) => {
        const [x1, y1] = vp.convertToViewportPoint(a.rect[0], a.rect[1]), [x2, y2] = vp.convertToViewportPoint(a.rect[2], a.rect[3])
        return { r: { x: Math.min(x1, x2) / vp.width, y: Math.min(y1, y2) / vp.height, w: Math.abs(x2 - x1) / vp.width, h: Math.abs(y2 - y1) / vp.height }, url: a.url || a.unsafeUrl, dest: a.dest }
      })
      if (!off) setLinks(out)
    }).catch(() => {})
    return () => { off = true }
  }, [doc, page])
  return <>{links.map((l, i) => { const r = rotateRect(l.r, rot); const safe = l.url && /^(https?:|mailto:)/i.test(l.url); return (
    <a key={i} href={safe ? l.url : undefined} target={safe ? '_blank' : undefined} rel="noopener noreferrer" title={l.url ?? 'Go to linked page'} aria-label={l.url ? `Link to ${l.url}` : 'Link to another page'}
      onClick={(e) => { if (!safe) { e.preventDefault(); if (l.dest) onDest(l.dest) } }}
      className="absolute cursor-pointer rounded-sm transition hover:bg-sky-400/20 focus-visible:outline-2 focus-visible:outline-sky-500"
      style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }} />) })}</>
}

function ThumbList({ doc, current, onPick, matchPages }: { doc: PdfJsDoc; current: number; onPick: (p: number) => void; matchPages: Set<number> }) {
  const [thumbs, setThumbs] = useState<Record<number, string>>({})
  const root = useRef<HTMLDivElement>(null)
  const queue = useRef(new Set<number>())
  const running = useRef(false)
  const pump = useCallback(async () => {
    if (running.current) return
    running.current = true
    while (queue.current.size) {
      const p = queue.current.values().next().value as number
      queue.current.delete(p)
      try {
        const page = await doc.getPage(p)
        const v = page.getViewport({ scale: 1 })
        const vp = page.getViewport({ scale: 160 / v.width })
        const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height)
        const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
        await page.render({ canvasContext: ctx, viewport: vp, canvas: c } as any).promise
        const url = c.toDataURL('image/jpeg', 0.7)
        setThumbs((t) => ({ ...t, [p]: url }))
      } catch { /* ignore */ }
    }
    running.current = false
  }, [doc])
  useEffect(() => {
    const el = root.current; if (!el) return
    const sc = el.closest('.overflow-auto') as HTMLElement | null
    const io = new IntersectionObserver((es) => { es.forEach((e) => { const p = Number((e.target as HTMLElement).dataset.thumb); if (e.isIntersecting) queue.current.add(p); else queue.current.delete(p) }); pump() }, { root: sc, rootMargin: '300px 0px' })
    el.querySelectorAll('[data-thumb]').forEach((x) => io.observe(x))
    return () => io.disconnect()
  }, [doc, pump])
  useEffect(() => { root.current?.querySelector(`[data-thumb="${current}"]`)?.scrollIntoView({ block: 'nearest' }) }, [current])
  return (
    <div ref={root} className="space-y-2">
      {Array.from({ length: doc.numPages }, (_, i) => i + 1).map((p) => (
        <button key={p} data-thumb={p} onClick={() => onPick(p)} className={cn('relative block w-full rounded-lg border-2 p-1.5 transition cursor-pointer', p === current ? 'border-accent bg-accent/5' : 'border-transparent hover:bg-surface-2')}>
          <div className="mx-auto flex min-h-24 items-center justify-center">{thumbs[p] ? <img src={thumbs[p]} alt={`Page ${p}`} className="max-h-48 max-w-full bg-white shadow" /> : <div className="aspect-[3/4] w-3/4 animate-pulse rounded bg-border/60" />}</div>
          <div className={cn('mt-1 text-center text-[11px]', p === current ? 'font-semibold text-accent' : 'text-muted')}>{p}</div>
          {matchPages.has(p) && <span className="absolute right-2 top-2 size-2 rounded-full bg-orange-500" title="Has search matches" />}
        </button>
      ))}
    </div>
  )
}

function OutlineTree({ nodes, onPick, depth = 0 }: { nodes: OutlineNode[]; onPick: (n: OutlineNode) => void; depth?: number }) {
  return <ul className="space-y-0.5">{nodes.map((n, i) => <OutlineItem key={i} node={n} onPick={onPick} depth={depth} />)}</ul>
}
function OutlineItem({ node, onPick, depth }: { node: OutlineNode; onPick: (n: OutlineNode) => void; depth: number }) {
  const [open, setOpen] = useState(depth < 1)
  const has = node.items?.length > 0
  return (
    <li>
      <div className="flex items-start gap-0.5" style={{ paddingLeft: depth * 10 }}>
        {has ? <button onClick={() => setOpen(!open)} className="mt-1 rounded p-0.5 text-muted hover:text-fg cursor-pointer" aria-label={open ? 'Collapse' : 'Expand'}><ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} /></button> : <span className="w-4 shrink-0" />}
        <button onClick={() => onPick(node)} className={cn('flex-1 rounded-md px-1.5 py-1 text-left text-xs leading-snug text-fg/90 hover:bg-surface-2 hover:text-accent cursor-pointer', node.bold && 'font-semibold', node.italic && 'italic')}>{node.title || 'Untitled'}</button>
      </div>
      {has && open && <OutlineTree nodes={node.items} onPick={onPick} depth={depth + 1} />}
    </li>
  )
}

