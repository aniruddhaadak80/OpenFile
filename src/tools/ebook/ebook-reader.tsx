import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ListTree, Search, Type, Maximize2, Minimize2, X, BookOpen } from 'lucide-react'
import { Button, Dropzone, Input, Segmented, Spinner, ErrorNote, cn } from '@/components/ui'
import { TopBar } from '@/lib/b4/ui'

type Theme = 'light' | 'sepia' | 'dark'
const THEMES: Record<Theme, { bg: string; fg: string; link: string }> = { light: { bg: '#ffffff', fg: '#1a1a1a', link: '#0b6bcb' }, sepia: { bg: '#f4ecd8', fg: '#3b2f1e', link: '#8a5a00' }, dark: { bg: '#121212', fg: '#e6e6e6', link: '#7cc4ff' } }
const NATIVE = /\.(epub|mobi|azw3?|kf8|prc|fb2|fbz|cbz)$/i
const ACCEPT = '.epub,.mobi,.azw,.azw3,.kf8,.prc,.fb2,.fbz,.cbz,.txt,.html,.htm,.md,.docx,.rtf,.odt'
const css = (t: Theme, size: number, spacing: number, font: string) => `
  html { color-scheme: ${t === 'dark' ? 'dark' : 'light'}; }
  html, body { background: ${THEMES[t].bg} !important; color: ${THEMES[t].fg} !important; }
  body { font-size: ${size}% !important; ${font !== 'publisher' ? `font-family: ${font === 'serif' ? "Georgia, 'Times New Roman', serif" : "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif"} !important;` : ''} }
  p, li, blockquote, dd { line-height: ${spacing} !important; }
  a:link { color: ${THEMES[t].link} !important; }
  pre { white-space: pre-wrap !important; }
  img, svg { max-width: 100%; }
  aside[epub|type~="footnote"], aside[epub|type~="endnote"] { display: none; }
  @namespace epub "http://www.idpf.org/2007/ops";`

interface TocItem { label: string; href: string; subitems?: TocItem[] }

export default function EbookReader() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
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
  const host = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const view = useRef<any>(null)
  const key = file ? `openfile-reader:${file.name}:${file.size}` : ''

  useEffect(() => {
    if (!file || !host.current) return
    let dead = false
    const el = host.current
    ;(async () => {
      setLoading(true); setError(null)
      try {
        await import('foliate-js/view.js')
        let src: File = file
        if (!NATIVE.test(file.name)) {
          const { loadBook, writeEpub } = await import('@/lib/b4/book')
          const b = await loadBook(file)
          src = new File([await writeEpub(b)], file.name.replace(/\.[^.]+$/, '') + '.epub', { type: 'application/epub+zip' })
        }
        if (dead) return
        const v: any = document.createElement('foliate-view')
        v.style.cssText = 'display:block;width:100%;height:100%'
        el.replaceChildren(v)
        await v.open(src)
        if (dead) return
        view.current = v
        const m = v.book.metadata ?? {}
        const txt = (x: any): string => (!x ? '' : typeof x === 'string' ? x : Array.isArray(x) ? x.map(txt).join(', ') : txt(x.name ?? Object.values(x)[0]))
        setMeta({ title: txt(m.title) || file.name, author: txt(m.author) })
        setToc(v.book.toc ?? [])
        v.addEventListener('relocate', (e: any) => { setFrac(e.detail.fraction ?? 0); setWhere(e.detail.tocItem?.label ?? ''); if (e.detail.cfi) localStorage.setItem(key, e.detail.cfi) })
        v.renderer.setAttribute('flow', flow)
        v.renderer.setStyles?.(css(theme, size, spacing, font))
        const last = localStorage.getItem(key)
        await v.init({ lastLocation: last || undefined, showTextStart: !last })
      } catch (e: any) {
        console.error(e)
        setError(/not supported/i.test(e?.message) ? 'This file type is not supported, or it is protected with DRM.' : e?.message || 'Could not open this book.')
      } finally { if (!dead) setLoading(false) }
    })()
    return () => { dead = true; try { view.current?.close?.() } catch { /* ignore */ } view.current = null; el.replaceChildren() }
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
    setSearching(true); setResults([])
    const found: { cfi: string; excerpt: string; label: string }[] = []
    try {
      for await (const r of view.current.search({ query: query.trim() })) {
        if (r === 'done') break
        if (r.subitems) { for (const s of r.subitems) found.push({ cfi: s.cfi, excerpt: `${s.excerpt.pre}[[${s.excerpt.match}]]${s.excerpt.post}`, label: r.label }); setResults([...found]) }
        if (found.length > 300) break
      }
    } finally { setSearching(false) }
  }
  const tocTree = (items: TocItem[], depth = 0): React.ReactNode => items.map((t, i) => (
    <div key={depth + '-' + i}>
      <button onClick={() => { view.current?.goTo(t.href); if (window.innerWidth < 1024) setPanel('') }} className={cn('block w-full cursor-pointer truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2', where === t.label && 'bg-accent/10 text-accent')} style={{ paddingLeft: 8 + depth * 14 }}>{t.label}</button>
      {t.subitems?.length ? tocTree(t.subitems, depth + 1) : null}
    </div>
  ))

  if (!file) return <Dropzone accept={ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop an e-book to read" sub="EPUB, MOBI, AZW3, FB2, CBZ comics, plus TXT, DOCX, RTF, ODT, HTML and Markdown. Your place is remembered on this device." />

  return (
    <div className="space-y-3">
      <TopBar file={file} onReset={() => { setFile(null); setMeta(null); setToc([]); setResults([]) }} label="Open another" />
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
                {results.length > 0 && <p className="text-xs text-muted">{results.length} match{results.length > 1 ? 'es' : ''}</p>}
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
            {loading && <div className="absolute inset-0 grid place-items-center bg-surface/70"><Spinner label="Opening book" /></div>}
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
