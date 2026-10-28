import { useEffect, useMemo, useState } from 'react'
import { Globe, Code2, FileDown, Link2, AlertTriangle, Sparkles, Upload, Monitor, Smartphone, FileText } from 'lucide-react'
import { Button, ToolGrid, Label, Select, Segmented, Slider, Switch, Input, Textarea, Progress, ErrorNote, ResultCard, Tabs, Dropzone, useJob, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { FramePreview, PdfPreview, Reveal, pageDims, mm, useDebounced, type PageSizeKey } from './_conv/shared'
import { renderHtmlToPdf, addPageNumbers, pdfToBlob } from './_conv/htmlPdf'

const SAMPLE = `<!doctype html>
<html>
<head>
<style>
  body { font-family: Georgia, serif; color: #1f2937; line-height: 1.6; margin: 0; }
  header { background: linear-gradient(120deg, #6d4aff, #06b6d4); color: #fff; padding: 48px 40px; }
  header h1 { margin: 0; font-size: 40px; }
  main { padding: 32px 40px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 8px; text-align: left; }
</style>
</head>
<body>
  <header><h1>Quarterly Update</h1><p>Generated with OpenFile — HTML to PDF</p></header>
  <main>
    <div class="grid">
      <div class="card"><h3>Revenue</h3><p>$1.2M (+18%)</p></div>
      <div class="card"><h3>Users</h3><p>48,210 (+9%)</p></div>
      <div class="card"><h3>NPS</h3><p>67</p></div>
    </div>
    <table><tr><th>Region</th><th>Q1</th><th>Q2</th></tr><tr><td>EMEA</td><td>410k</td><td>482k</td></tr><tr><td>Americas</td><td>530k</td><td>601k</td></tr><tr><td>APAC</td><td>120k</td><td>164k</td></tr></table>
  </main>
</body>
</html>`

const VIEWPORTS = { page: { label: 'Fit page', w: 0 }, tablet: { label: 'Tablet 820px', w: 820 }, desktop: { label: 'Desktop 1280px', w: 1280 } }
type Vp = keyof typeof VIEWPORTS

async function sanitize(html: string, base?: string) {
  const DOMPurify: any = (await import('dompurify')).default
  let clean: string = DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true, ADD_TAGS: ['link', 'style', 'meta', 'base', 'link'], ADD_ATTR: ['target', 'media', 'rel', 'charset'], FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'noscript'], FORCE_BODY: false })
  if (!/^<!doctype/i.test(clean.trim())) clean = '<!doctype html>' + clean
  if (base && !/<base\s/i.test(clean)) clean = clean.replace(/<head([^>]*)>/i, `<head$1><base href="${base}">`)
  if (!/<meta[^>]+charset/i.test(clean)) clean = clean.replace(/<head([^>]*)>/i, '<head$1><meta charset="utf-8">')
  return clean
}

export default function HtmlToPdf() {
  const [mode, setMode] = useState<'paste' | 'url'>('paste')
  const [html, setHtml] = useState('')
  const [url, setUrl] = useState('')
  const [fetched, setFetched] = useState<{ html: string; url: string } | null>(null)
  const [urlErr, setUrlErr] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [clean, setClean] = useState('')
  const [size, setSize] = useState<PageSizeKey>('a4')
  const [orient, setOrient] = useState<'portrait' | 'landscape'>('portrait')
  const [marginMm, setMarginMm] = useState(10)
  const [vp, setVp] = useState<Vp>('page')
  const [numbers, setNumbers] = useState(false)
  const [result, setResult] = useState<{ blob: Blob; pages: number } | null>(null)
  const dHtml = useDebounced(html, 300)
  const { busy, progress, error, run } = useJob()

  const source = mode === 'paste' ? dHtml : fetched?.html ?? ''
  useEffect(() => { let off = false; if (!source.trim()) { setClean(''); return } sanitize(source, mode === 'url' ? fetched?.url : undefined).then((c) => { if (!off) setClean(c) }); return () => { off = true } }, [source, mode, fetched])
  useEffect(() => setResult(null), [clean, size, orient, marginMm, vp, numbers])

  const fetchUrl = async () => {
    let u = url.trim()
    if (!u) return
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u
    setFetching(true); setUrlErr(null); setFetched(null)
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/fetch-page?url=${encodeURIComponent(u)}`)
      const type = r.headers.get('content-type') || ''
      if (!type.includes('json')) throw new Error('deployment')
      const j = await r.json()
      if (!r.ok || !j.html) throw new Error(j.error || `Request failed (${r.status})`)
      setFetched({ html: j.html, url: j.url || u })
      toast('Page loaded', 'success')
    } catch (e: any) {
      setUrlErr(e?.message === 'deployment' || e instanceof TypeError
        ? 'URL mode needs the OpenFile server function (available on the Vercel deployment). It is not reachable here — open the page in your browser, use "View source", copy the HTML and use Paste mode instead.'
        : e?.message || 'Could not fetch that page.')
    } finally { setFetching(false) }
  }

  const dims = pageDims(size, orient)
  const marginPt = mm(marginMm)
  const previewWidth = VIEWPORTS[vp].w || Math.round((dims.w - marginPt * 2) * 96 / 72)

  const exportPdf = () => run(async (setP) => {
    if (!clean) throw new Error('Add some HTML first.')
    const bottom = numbers ? Math.max(marginPt, 30) : marginPt
    const { pdf, pages } = await renderHtmlToPdf(clean, { pageWidth: dims.w, pageHeight: dims.h, margin: { top: marginPt, right: marginPt, bottom, left: marginPt }, viewportWidth: VIEWPORTS[vp].w || undefined, settle: mode === 'url' ? 800 : 100, onProgress: (p) => setP(p) })
    if (numbers) addPageNumbers(pdf, { bottom: Math.min(bottom / 2, 20) })
    const t = /<title>([^<]*)<\/title>/i.exec(clean)?.[1]?.trim()
    pdf.setProperties({ title: t || 'page', creator: 'OpenFile' })
    setResult({ blob: pdfToBlob(pdf), pages })
    toast('PDF ready', 'success')
  })

  const fileName = useMemo(() => {
    const t = /<title>([^<]*)<\/title>/i.exec(clean)?.[1]?.trim()
    const base = t || (mode === 'url' && fetched ? new URL(fetched.url).hostname : 'page')
    return base.replace(/[^\w\- .]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) + '.pdf'
  }, [clean, mode, fetched])

  return (
    <ToolGrid
      main={<>
        <Tabs value={mode} onChange={setMode} tabs={[{ value: 'paste', label: <span className="inline-flex items-center gap-1.5"><Code2 className="size-4" />Paste HTML</span> }, { value: 'url', label: <span className="inline-flex items-center gap-1.5"><Globe className="size-4" />From URL</span> }]} />
        {mode === 'paste' ? (
          <div className="space-y-2">
            <Textarea value={html} onChange={(e) => setHtml(e.target.value)} placeholder="<html>…</html>  — paste a full page or a fragment. Scripts are removed for safety." className="h-56" spellCheck={false} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" icon={<Sparkles className="size-4" />} onClick={() => setHtml(SAMPLE)}>Load sample</Button>
              <label className="inline-flex"><input type="file" accept=".html,.htm,text/html" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setHtml(await f.text()); e.target.value = '' }} /><span className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-xl px-3 text-xs font-medium text-muted hover:bg-surface-2 hover:text-fg"><Upload className="size-4" />Open .html file</span></label>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); fetchUrl() }}>
              <div className="relative flex-1"><Link2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/article" className="pl-9" /></div>
              <Button type="submit" loading={fetching} disabled={!url.trim()}>Load</Button>
            </form>
            {urlErr && <div className="flex gap-2 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" /><div>{urlErr} <button className="font-medium text-accent underline cursor-pointer" onClick={() => setMode('paste')}>Switch to Paste mode</button></div></div>}
            <p className="text-[11px] text-muted">Only the URL is sent to fetch the page's HTML; rendering and PDF creation happen in your browser. Some images may be skipped if their server blocks cross-origin access.</p>
          </div>
        )}
        {clean ? (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border bg-surface-2/60 px-3 py-2">
              <div className="flex gap-1.5"><span className="size-2.5 rounded-full bg-danger/70" /><span className="size-2.5 rounded-full bg-warn/70" /><span className="size-2.5 rounded-full bg-success/70" /></div>
              <div className="mx-2 min-w-0 flex-1 truncate rounded-md bg-surface px-2 py-0.5 font-mono text-[11px] text-muted">{mode === 'url' && fetched ? fetched.url : 'local HTML'} · {previewWidth}px wide</div>
              <span className="text-[10px] text-muted">sandboxed preview</span>
            </div>
            <div className="max-h-[65vh] overflow-auto bg-surface-2 p-3 scrollbar-thin">
              <div className="mx-auto origin-top bg-white shadow" style={{ width: previewWidth }}>
                <FramePreview srcDoc={clean} height="60vh" className="rounded-none border-0" />
              </div>
            </div>
          </div>
        ) : mode === 'paste' ? <Dropzone compact accept=".html,.htm,text/html" onFiles={async (f) => setHtml(await f[0].text())} label="…or drop an .html file" /> : null}
        {result && <Reveal k="r" className="space-y-3"><ResultCard blob={result.blob} filename={fileName} title={`PDF ready · ${result.pages} page${result.pages > 1 ? 's' : ''}`} /><PdfPreview blob={result.blob} height={600} /></Reveal>}
      </>}
      side={<>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Page</Label><Select value={size} onChange={setSize} options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }, { value: 'legal', label: 'Legal' }, { value: 'a3', label: 'A3' }]} /></div>
          <div><Label>Orientation</Label><Segmented value={orient} onChange={setOrient} options={[{ value: 'portrait', label: 'Port.' }, { value: 'landscape', label: 'Land.' }]} /></div>
        </div>
        <div>
          <Label>Layout width</Label>
          <div className="grid gap-1.5">
            {(Object.keys(VIEWPORTS) as Vp[]).map((k) => (
              <button key={k} onClick={() => setVp(k)} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition cursor-pointer', vp === k ? 'border-accent bg-accent/10 text-fg' : 'border-border text-muted hover:text-fg')}>
                {k === 'page' ? <FileText className="size-4" /> : k === 'tablet' ? <Smartphone className="size-4" /> : <Monitor className="size-4" />}
                <span className="font-medium">{VIEWPORTS[k].label}</span>
                <span className="ml-auto text-[10px] opacity-70">{k === 'page' ? 'text at print size' : 'scaled to page'}</span>
              </button>
            ))}
          </div>
        </div>
        <Slider label="Margins" value={marginMm} onChange={setMarginMm} min={0} max={30} suffix=" mm" />
        <Switch checked={numbers} onChange={setNumbers} label="Page numbers" />
        {busy && <Progress value={progress} label="Rendering pages" />}
        <ErrorNote error={error} />
        <Button size="lg" className="w-full" loading={busy} disabled={!clean} icon={<FileDown className="size-5" />} onClick={exportPdf}>Convert to PDF</Button>
        <p className="text-[11px] text-muted">Smart page breaks keep lines, images and table rows intact. Scripts never run.</p>
      </>}
    />
  )
}
