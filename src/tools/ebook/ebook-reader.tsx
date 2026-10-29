import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ListTree, Search, Type, Maximize2, Minimize2, X, BookOpen } from 'lucide-react'
import { Button, Dropzone, Input, Segmented, Spinner, ErrorNote, cn } from '@/components/ui'
import { TopBar } from '@/lib/b4/ui'
import { sanitizeMarkup } from '@/lib/safe'

type Theme = 'light' | 'sepia' | 'dark'
const THEMES: Record<Theme, { bg: string; fg: string; link: string }> = { light: { bg: '#ffffff', fg: '#1a1a1a', link: '#0b6bcb' }, sepia: { bg: '#f4ecd8', fg: '#3b2f1e', link: '#8a5a00' }, dark: { bg: '#121212', fg: '#e6e6e6', link: '#7cc4ff' } }
const NATIVE = /\.(epub|mobi|azw3?|kf8|prc|fb2|fbz|cbz)$/i
const ACCEPT = '.epub,.mobi,.azw,.azw3,.kf8,.prc,.fb2,.fbz,.cbz,.txt,.html,.htm,.md,.docx,.rtf,.odt'
const css = (t: Theme, size: number, spacing: number, font: string) => `
  @namespace epub "http://www.idpf.org/2007/ops";
  html { color-scheme: ${t === 'dark' ? 'dark' : 'light'}; }
  html, body { background: ${THEMES[t].bg} !important; color: ${THEMES[t].fg} !important; }
  body { font-size: ${size}% !important; ${font !== 'publisher' ? `font-family: ${font === 'serif' ? "Georgia, 'Times New Roman', serif" : "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif"} !important;` : ''} }
  p, li, blockquote, dd { line-height: ${spacing} !important; }
  a:link { color: ${THEMES[t].link} !important; }
  pre { white-space: pre-wrap !important; }
  img, svg { max-width: 100%; }
  aside[epub|type~="footnote"], aside[epub|type~="endnote"] { display: none; }`

interface TocItem { label: string; href: string; subitems?: TocItem[] }

const MAX_BYTES = 500 * 1024 * 1024 // bigger files are refused instead of exhausting memory
const PART_CHARS = 120_000 // converted documents are cut into sections of about this size so no page lays out a whole book
const OPEN_SLOW_MS = 20_000
const BIG_SECTION = 600_000 // bytes of one EPUB content file above which it is split before display
const CANCELLED = 'cancelled'
const tick = () => new Promise<void>((r) => setTimeout(r, 0))

/** Cut very long chapters (a TXT or DOCX without headings becomes one chapter) at top-level block boundaries. */
async function splitLong(chapters: { title: string; html: string }[]) {
  const out: { title: string; html: string }[] = []
  for (const c of chapters) {
    if (c.html.length <= PART_CHARS * 1.5) { out.push(c); continue }
    const body = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${c.html}</body></html>`, 'text/html').body
    let buf = '', part = 1
    const push = () => { if (buf.trim()) out.push({ title: part === 1 ? c.title : `${c.title} (${part})`, html: buf }); part++; buf = '' }
    for (const n of Array.from(body.childNodes)) {
      buf += n.nodeType === 1 ? (n as Element).outerHTML : (n.textContent ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      if (buf.length >= PART_CHARS) { push(); await tick() }
    }
    push()
  }
  return out
}

export default function EbookReader() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState('')
  const [slow, setSlow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ title: string; author: string } | null>(null)
  const [toc, setToc] = useState<TocItem[]>([])
  const [frac, setFrac] = useState(0)
  const [where, setWhere] = useState('')
  const [panel, setPanel] = useState<'' | 'toc' | 'search' | 'style'>('')
  const [theme, setTheme] = useState<Theme>('light')
  const [size, setSize] = useState(100)
  const [spacing, setSpacing] = useState(1.5)
  const [font, setFont] = useState<'publisher' | 'serif' | 'sans'>('publisher')
  const [flow, setFlow] = useState<'paginated' | 'scrolled'>('paginated')
  const [full, setFull] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ cfi: string; excerpt: string; label: string }[]>([])
  const [searching, setSearching] = useState(false)
  const searchTok = useRef(0)
  const host = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const view = useRef<any>(null)
  const key = file ? `openfile-reader:${file.name}:${file.size}` : ''

  useEffect(() => {
    if (!file || !host.current) return
    let dead = false
    let raf = 0
    let slowTimer = 0
    const el = host.current
    const inert = new Map<string, string>()
    // every await is followed by a yield and a cancel check, so the page keeps painting and Cancel always works
    const step = async (label: string) => { if (dead) throw new Error(CANCELLED); setStage(label); await tick(); if (dead) throw new Error(CANCELLED) }
    ;(async () => {
      setLoading(true); setError(null); setSlow(false); setFrac(0); setWhere('')
      slowTimer = window.setTimeout(() => { if (!dead) setSlow(true) }, OPEN_SLOW_MS)
      try {
        if (file.size > MAX_BYTES) throw new Error(`This file is ${Math.round(file.size / 1048576)} MB. The reader opens books up to ${MAX_BYTES / 1048576} MB.`)
        await step('Loading the reader')
        const { makeBook } = await import('foliate-js/view.js')
        let src: File = file
        if (!NATIVE.test(file.name)) {
          await step('Converting the document')
          const { loadBook, writeEpub } = await import('@/lib/b4/book')
          const b = await loadBook(file, (p, label) => { if (!dead) setStage(`${label || 'Converting the document'} ${Math.round(p * 100)}%`) })
          await step('Splitting long chapters')
          b.chapters = await splitLong(b.chapters)
          await step('Building the book')
          src = new File([await writeEpub(b)], file.name.replace(/\.[^.]+$/, '') + '.epub', { type: 'application/epub+zip' })
        }
        await step('Reading the book')
        // foliate-js renders book pages in same-origin frames that allow scripts (a WebKit requirement), so
        // every page (EPUB, MOBI, KF8, FB2, comics) is made inert before it is shown: no scripts, event handlers or script URLs.
        // Only the section on screen is loaded; its sanitized copy is released again when foliate unloads it.
        let book = await makeBook(src)
        // A native EPUB that keeps the whole book in one or two huge files would be laid out in one go and can stall
        // the tab, so it is rebuilt with its long chapters cut into sections first, the same way converted documents are.
        const biggest = Math.max(0, ...((book.sections ?? []) as { size?: number }[]).map((x) => x.size ?? 0))
        if (src === file && biggest > BIG_SECTION && /\.epub$/i.test(file.name)) {
          await step('Splitting a very long chapter')
          const { loadBook, writeEpub } = await import('@/lib/b4/book')
          const b = await loadBook(file, (p, label) => { if (!dead) setStage(`${label || 'Reading the book'} ${Math.round(p * 100)}%`) })
          b.chapters = await splitLong(b.chapters)
          await step('Building the book')
          src = new File([await writeEpub(b)], file.name, { type: 'application/epub+zip' })
          book = await makeBook(src)
        }
        await step('Preparing pages')
        for (const s of book.sections ?? []) {
          if (typeof s.load !== 'function') continue
          const load = s.load.bind(s)
          const unload = typeof s.unload === 'function' ? s.unload.bind(s) : null
          let last = ''
          s.load = async () => {
            const u = await load()
            if (typeof u !== 'string' || !u.startsWith('blob:')) return u
            const hit = inert.get(u); if (hit) return hit
            const b = await (await fetch(u)).blob()
            const type: DOMParserSupportedType = /svg/i.test(b.type) ? 'image/svg+xml' : /xml/i.test(b.type) ? 'application/xhtml+xml' : 'text/html'
            const mime = (b.type || type).split(';')[0]
            const out = URL.createObjectURL(new Blob([sanitizeMarkup(await b.text(), type)], { type: `${mime};charset=utf-8` }))
            inert.set(u, out); last = u
            return out
          }
          s.unload = () => {
            const o = last && inert.get(last)
            if (o) { URL.revokeObjectURL(o); inert.delete(last) }
            last = ''
            unload?.()
          }
        }
        await step('Opening the book')
        const v: any = document.createElement('foliate-view')
        v.style.cssText = 'display:block;width:100%;height:100%'
        el.replaceChildren(v)
        await v.open(book)
        if (dead) throw new Error(CANCELLED)
        view.current = v
        const m = v.book.metadata ?? {}
        const txt = (x: any): string => (!x ? '' : typeof x === 'string' ? x : Array.isArray(x) ? x.map(txt).join(', ') : txt(x.name ?? Object.values(x)[0]))
        setMeta({ title: txt(m.title) || file.name, author: txt(m.author) })
        setToc(v.book.toc ?? [])
        // relocate can fire many times while a page settles; update React and storage at most once per frame
        let pending: any = null
        v.addEventListener('relocate', (e: any) => {
          pending = e.detail
          if (raf) return
          raf = requestAnimationFrame(() => {
            raf = 0
            if (dead || !pending) return
            setFrac(pending.fraction ?? 0); setWhere(pending.tocItem?.label ?? '')
            if (pending.cfi) try { localStorage.setItem(key, pending.cfi) } catch { /* storage full or blocked */ }
          })
        })
        v.renderer.setAttribute('flow', flow)
        v.renderer.setStyles?.(css(theme, size, spacing, font))
        await step('Laying out the first page')
        let saved: string | null = null
        try { saved = localStorage.getItem(key) } catch { /* blocked */ }
        try { await v.init({ lastLocation: saved || undefined, showTextStart: !saved }) } catch (e) {
          if (!saved || dead) throw e
          // a saved place that no longer resolves: forget it and start at the beginning
          try { localStorage.removeItem(key) } catch { /* ignore */ }
          await v.init({ showTextStart: true })
        }
      } catch (e: any) {
        if (e?.message === CANCELLED || dead) return
        console.error(e)
        setError(/not supported/i.test(e?.message) ? 'This file type is not supported, or it is protected with DRM.' : e?.message || 'Could not open this book.')
      } finally { clearTimeout(slowTimer); if (!dead) { setLoading(false); setSlow(false); setStage('') } }
    })()
    return () => {
      dead = true
      clearTimeout(slowTimer)
      if (raf) cancelAnimationFrame(raf)
      try { view.current?.close?.() } catch { /* ignore */ }
      view.current = null
      el.replaceChildren()
      for (const u of inert.values()) URL.revokeObjectURL(u)
      inert.clear()
    }
  }, [file]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { view.current?.renderer?.setStyles?.(css(theme, size, spacing, font)) }, [theme, size, spacing, font])
  useEffect(() => { view.current?.renderer?.setAttribute('flow', flow) }, [flow])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!view.current || (e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); view.current.goLeft() }
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); view.current.goRight() }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])
  useEffect(() => { const h = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', h); return () => document.removeEventListener('fullscreenchange', h) }, [])

  const runSearch = async () => {
    if (!view.current || !query.trim()) return
    const tok = ++searchTok.current
    setSearching(true); setResults([])
    const found: { cfi: string; excerpt: string; label: string }[] = []
    let shown = 0
    try {
      for await (const r of view.current.search({ query: query.trim() })) {
        if (tok !== searchTok.current) break
        if (r === 'done') break
        if (r.subitems) for (const s of r.subitems) found.push({ cfi: s.cfi, excerpt: `${s.excerpt.pre}[[${s.excerpt.match}]]${s.excerpt.post}`, label: r.label })
        if (found.length - shown >= 25 || (r.subitems && !shown)) { shown = found.length; setResults(found.slice(0, 300)) }
        if (found.length >= 300) break
        await tick()
      }
      if (tok === searchTok.current) setResults(found.slice(0, 300))
    } finally { if (tok === searchTok.current) setSearching(false) }
  }
  const stopSearch = () => { searchTok.current++; setSearching(false); try { view.current?.clearSearch?.() } catch { /* ignore */ } }
  const reset = () => { searchTok.current++; setFile(null); setMeta(null); setToc([]); setResults([]); setError(null); setLoading(false) }
  const tocTree = (items: TocItem[], depth = 0): React.ReactNode => items.map((t, i) => (
    <div key={depth + '-' + i}>
      <button onClick={() => { view.current?.goTo(t.href); if (window.innerWidth < 1024) setPanel('') }} className={cn('block w-full cursor-pointer truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2', where === t.label && 'bg-accent/10 text-accent')} style={{ paddingLeft: 8 + depth * 14 }}>{t.label}</button>
      {t.subitems?.length ? tocTree(t.subitems, depth + 1) : null}
    </div>
  ))

  if (!file) return <Dropzone accept={ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop an e-book to read" sub="EPUB, MOBI, AZW3, FB2, CBZ comics, plus TXT, DOCX, RTF, ODT, HTML and Markdown. Your place is remembered on this device." />

  return (
    <div className="space-y-3">
      <TopBar file={file} onReset={reset} label="Open another" />
      <ErrorNote error={error} />
      <div ref={wrap} className={cn('overflow-hidden rounded-2xl border border-border', full && 'rounded-none border-0')} style={{ background: THEMES[theme].bg }}>
        <div className="flex flex-wrap items-center gap-1 border-b border-border bg-surface px-2 py-1.5">
          <Button size="sm" variant={panel === 'toc' ? 'secondary' : 'ghost'} icon={<ListTree className="size-4" />} onClick={() => setPanel(panel === 'toc' ? '' : 'toc')} aria-label="Contents">Contents</Button>
          <Button size="sm" variant={panel === 'search' ? 'secondary' : 'ghost'} icon={<Search className="size-4" />} onClick={() => setPanel(panel === 'search' ? '' : 'search')} aria-label="Search">Search</Button>
          <Button size="sm" variant={panel === 'style' ? 'secondary' : 'ghost'} icon={<Type className="size-4" />} onClick={() => setPanel(panel === 'style' ? '' : 'style')} aria-label="Text settings">Aa</Button>
          <div className="min-w-0 flex-1 truncate px-2 text-center text-sm"><span className="font-medium">{meta?.title}</span>{meta?.author && <span className="text-muted"> · {meta.author}</span>}</div>
          <Button size="sm" variant="ghost" icon={full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />} aria-label="Full screen" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen())} />
        </div>
        <div className="relative flex" style={{ height: full ? 'calc(100vh - 92px)' : '72vh' }}>
          {panel && (
            <div className="absolute inset-y-0 left-0 z-10 w-72 max-w-[85%] overflow-auto border-r border-border bg-surface p-3 shadow-xl scrollbar-thin lg:static lg:shadow-none">
              <div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-wide text-muted">{panel === 'toc' ? 'Contents' : panel === 'search' ? 'Search' : 'Text settings'}</span><button className="cursor-pointer rounded p-1 text-muted hover:text-fg" onClick={() => setPanel('')} aria-label="Close panel"><X className="size-4" /></button></div>
              {panel === 'toc' && (toc.length ? tocTree(toc) : <p className="text-sm text-muted">This book has no table of contents.</p>)}
              {panel === 'search' && <div className="space-y-2">
                <form onSubmit={(e) => { e.preventDefault(); runSearch() }} className="flex gap-1.5"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find in book" aria-label="Find in book" /><Button type="submit" size="md" loading={searching} icon={<Search className="size-4" />} aria-label="Search" /></form>
                {searching && <button className="cursor-pointer text-xs text-muted underline" onClick={stopSearch}>Stop searching</button>}
                {results.length > 0 && <p className="text-xs text-muted">{results.length}{results.length >= 300 ? '+' : ''} match{results.length > 1 ? 'es' : ''}</p>}
                {results.map((r, i) => {
                  const [pre, rest] = r.excerpt.split('[['); const [m, post] = (rest ?? '').split(']]')
                  return <button key={i} onClick={() => view.current?.goTo(r.cfi)} className="block w-full cursor-pointer rounded-lg px-2 py-1.5 text-left text-xs hover:bg-surface-2"><div className="truncate text-[10px] uppercase text-muted">{r.label}</div>{pre}<mark className="rounded bg-accent/30 px-0.5 text-fg">{m}</mark>{post}</button>
                })}
              </div>}
              {panel === 'style' && <div className="space-y-4">
                <div><div className="mb-1 text-xs text-muted">Theme</div><Segmented value={theme} onChange={setTheme} options={[{ value: 'light', label: 'Light' }, { value: 'sepia', label: 'Sepia' }, { value: 'dark', label: 'Dark' }]} /></div>
                <div><div className="mb-1 flex justify-between text-xs text-muted"><span>Text size</span><span>{size}%</span></div><input type="range" min={70} max={200} step={5} value={size} onChange={(e) => setSize(+e.target.value)} className="w-full accent-[var(--accent)]" aria-label="Text size" /></div>
                <div><div className="mb-1 flex justify-between text-xs text-muted"><span>Line spacing</span><span>{spacing}</span></div><input type="range" min={1} max={2.2} step={0.1} value={spacing} onChange={(e) => setSpacing(+e.target.value)} className="w-full accent-[var(--accent)]" aria-label="Line spacing" /></div>
                <div><div className="mb-1 text-xs text-muted">Font</div><Segmented value={font} onChange={setFont} options={[{ value: 'publisher', label: 'Book' }, { value: 'serif', label: 'Serif' }, { value: 'sans', label: 'Sans' }]} /></div>
                <div><div className="mb-1 text-xs text-muted">Layout</div><Segmented value={flow} onChange={setFlow} options={[{ value: 'paginated', label: 'Pages' }, { value: 'scrolled', label: 'Scroll' }]} /></div>
              </div>}
            </div>
          )}
          <div className="relative min-w-0 flex-1">
            <div ref={host} className="h-full w-full" />
            {loading && (
              <div className="absolute inset-0 grid place-items-center bg-surface/80" role="status" aria-live="polite">
                <div className="flex flex-col items-center gap-3 px-4 text-center">
                  <Spinner label={stage || 'Opening book'} />
                  {slow && <p className="max-w-xs text-xs text-muted">This book is taking a while. Very long chapters take longer to lay out.</p>}
                  <Button size="sm" variant="secondary" icon={<X className="size-4" />} onClick={reset}>Cancel</Button>
                </div>
              </div>
            )}
            {!loading && !error && <>
              <button aria-label="Previous page" onClick={() => view.current?.goLeft()} className="absolute inset-y-0 left-0 hidden w-12 cursor-pointer items-center justify-center text-muted opacity-0 transition hover:opacity-100 sm:flex"><ChevronLeft className="size-7" /></button>
              <button aria-label="Next page" onClick={() => view.current?.goRight()} className="absolute inset-y-0 right-0 hidden w-12 cursor-pointer items-center justify-center text-muted opacity-0 transition hover:opacity-100 sm:flex"><ChevronRight className="size-7" /></button>
            </>}
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-border bg-surface px-3 py-2">
          <Button size="sm" variant="ghost" icon={<ChevronLeft className="size-4" />} onClick={() => view.current?.goLeft()} aria-label="Previous page" />
          <input type="range" min={0} max={1} step={0.001} value={frac} onChange={(e) => { const f = +e.target.value; setFrac(f); view.current?.goToFraction(f) }} className="flex-1 cursor-pointer accent-[var(--accent)]" aria-label="Reading position" />
          <span className="w-12 text-right font-mono text-xs text-muted">{Math.round(frac * 100)}%</span>
          <Button size="sm" variant="ghost" icon={<ChevronRight className="size-4" />} onClick={() => view.current?.goRight()} aria-label="Next page" />
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted"><BookOpen className="size-3.5" />Use the arrow keys or Page Up and Page Down to turn pages. Books with DRM cannot be opened.</p>
    </div>
  )
}
