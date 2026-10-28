import { useEffect, useRef, useState } from 'react'
import { Bold, Italic, Heading2, Link2, Code2, List, ListOrdered, Table, Quote, Scissors, Upload, FileDown, FileCode2, FileText, Sparkles } from 'lucide-react'
import { Button, Label, Select, Segmented, Slider, Switch, Progress, ErrorNote, ResultCard, Card, useJob, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob } from '@/lib/files'
import { LiveFrame, PdfPreview, Pill, Reveal, pageDims, mm, useDebounced, type PageSizeKey } from './_conv/shared'
import { renderHtmlToPdf, addPageNumbers, htmlDoc, pdfToBlob } from './_conv/htmlPdf'
import { renderMarkdown, THEMES, SAMPLE_MD, type ThemeKey } from './_conv/markdown'

const STORE = 'openfile:md2pdf'

export default function MarkdownToPdf() {
  const [md, setMd] = useState(() => { try { return localStorage.getItem(STORE) || SAMPLE_MD } catch { return SAMPLE_MD } })
  const [html, setHtml] = useState('')
  const [theme, setTheme] = useState<ThemeKey>('github')
  const [size, setSize] = useState<PageSizeKey>('a4')
  const [orient, setOrient] = useState<'portrait' | 'landscape'>('portrait')
  const [marginMm, setMarginMm] = useState(18)
  const [numbers, setNumbers] = useState(true)
  const [fontScale, setFontScale] = useState(100)
  const [title, setTitle] = useState('document')
  const [pane, setPane] = useState<'edit' | 'preview'>('edit')
  const [result, setResult] = useState<{ blob: Blob; pages: number } | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dmd = useDebounced(md, 180)
  const { busy, progress, error, run } = useJob()

  useEffect(() => { let off = false; renderMarkdown(dmd).then((h) => { if (!off) setHtml(h) }); try { localStorage.setItem(STORE, dmd) } catch { /* quota */ } return () => { off = true } }, [dmd])
  useEffect(() => { const m = dmd.match(/^#\s+(.+)$/m); if (m) setTitle(m[1].replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 60) || 'document') }, [dmd])
  useEffect(() => setResult(null), [dmd, theme, size, orient, marginMm, numbers, fontScale])

  const th = THEMES[theme]
  const basePt = parseFloat(/body\{[^}]*?font-size:([\d.]+)pt/.exec(th.css)?.[1] ?? '11')
  const css = th.css + (fontScale !== 100 ? `body{font-size:${((fontScale / 100) * basePt).toFixed(2)}pt!important;}` : '')
  const dims = pageDims(size, orient)
  const marginPt = mm(marginMm)

  const wrap = (before: string, after = before, placeholder = 'text') => {
    const el = ta.current; if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    const sel = md.slice(s, e) || placeholder
    const next = md.slice(0, s) + before + sel + after + md.slice(e)
    setMd(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + sel.length) })
  }
  const linePrefix = (prefix: string) => {
    const el = ta.current; if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    const ls = md.lastIndexOf('\n', s - 1) + 1
    const block = md.slice(ls, e)
    const replaced = block.split('\n').map((l, i) => (prefix === '1. ' ? `${i + 1}. ` : prefix) + l).join('\n')
    setMd(md.slice(0, ls) + replaced + md.slice(e))
    requestAnimationFrame(() => el.focus())
  }
  const insert = (text: string) => {
    const el = ta.current; if (!el) return
    const s = el.selectionStart
    setMd(md.slice(0, s) + text + md.slice(el.selectionEnd))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + text.length, s + text.length) })
  }
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') { e.preventDefault(); insert('  ') }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); wrap('**') }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); wrap('_') }
  }

  const exportPdf = () => run(async (setP) => {
    const body = await renderMarkdown(md)
    const bottom = numbers ? Math.max(marginPt, 34) : marginPt
    const { pdf, pages } = await renderHtmlToPdf(htmlDoc(body, css, title), { pageWidth: dims.w, pageHeight: dims.h, margin: { top: marginPt, right: marginPt, bottom, left: marginPt }, pageBackground: th.page !== '#ffffff' ? th.page : undefined, onProgress: (p) => setP(p) })
    if (numbers) addPageNumbers(pdf, { bottom: Math.min(bottom / 2, 22), color: theme === 'dark' ? '#8b949e' : '#8a8f9c' })
    pdf.setProperties({ title, creator: 'OpenFile' })
    setResult({ blob: pdfToBlob(pdf), pages })
    toast('PDF exported', 'success')
  })
  const downloadHtml = async () => {
    const body = await renderMarkdown(md)
    const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${th.css}body{max-width:820px;margin:40px auto;padding:0 24px;}</style></head><body>${body}</body></html>`
    downloadBlob(new Blob([doc], { type: 'text/html;charset=utf-8' }), `${title}.html`)
  }
  const onUpload = async (f?: File) => { if (!f) return; setMd(await f.text()); toast(`Loaded ${f.name}`, 'success') }

  const tools: [React.ReactNode, string, () => void][] = [
    [<Bold className="size-4" />, 'Bold (Ctrl+B)', () => wrap('**')], [<Italic className="size-4" />, 'Italic (Ctrl+I)', () => wrap('_')], [<Heading2 className="size-4" />, 'Heading', () => linePrefix('## ')],
    [<Link2 className="size-4" />, 'Link', () => wrap('[', '](https://)', 'link text')], [<Code2 className="size-4" />, 'Code block', () => wrap('\n```js\n', '\n```\n', 'code')], [<Quote className="size-4" />, 'Quote', () => linePrefix('> ')],
    [<List className="size-4" />, 'Bullet list', () => linePrefix('- ')], [<ListOrdered className="size-4" />, 'Numbered list', () => linePrefix('1. ')],
    [<Table className="size-4" />, 'Table', () => insert('\n| Column A | Column B |\n| -------- | -------- |\n| Value    | Value    |\n')], [<Scissors className="size-4" />, 'Page break', () => insert('\n\n\\pagebreak\n\n')],
  ]

  return (
    <div className="space-y-4">
      {/* options bar */}
      <Card className="flex flex-wrap items-end gap-x-5 gap-y-3 p-4">
        <div><Label>Theme</Label><div className="flex flex-wrap gap-1.5">{(Object.keys(THEMES) as ThemeKey[]).map((k) => <Pill key={k} active={theme === k} onClick={() => setTheme(k)}>{THEMES[k].label}</Pill>)}</div></div>
        <div className="w-28"><Label>Page</Label><Select value={size} onChange={setSize} options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }, { value: 'legal', label: 'Legal' }, { value: 'a5', label: 'A5' }]} /></div>
        <div><Label>Orientation</Label><Segmented value={orient} onChange={setOrient} options={[{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} /></div>
        <Slider className="w-36" label="Margins" value={marginMm} onChange={setMarginMm} min={5} max={35} suffix=" mm" />
        <Slider className="w-32" label="Text size" value={fontScale} onChange={setFontScale} min={80} max={130} step={5} suffix="%" />
        <div className="pb-2"><Switch checked={numbers} onChange={setNumbers} label="Page numbers" /></div>
      </Card>

      <div className="flex gap-1 lg:hidden"><Segmented value={pane} onChange={setPane} options={[{ value: 'edit', label: 'Editor' }, { value: 'preview', label: 'Preview' }]} /></div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={cn('flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface', pane !== 'edit' && 'hidden lg:flex')}>
          <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface-2/40 px-2 py-1.5">
            {tools.map(([icon, label, fn]) => <button key={label} title={label} aria-label={label} onClick={fn} className="rounded-lg p-1.5 text-muted transition hover:bg-surface hover:text-fg cursor-pointer">{icon}</button>)}
            <div className="ml-auto flex gap-1">
              <input ref={fileRef} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = '' }} />
              <Button size="sm" variant="ghost" icon={<Upload className="size-3.5" />} onClick={() => fileRef.current?.click()}>Open</Button>
              <Button size="sm" variant="ghost" icon={<Sparkles className="size-3.5" />} onClick={() => setMd(SAMPLE_MD)}>Sample</Button>
            </div>
          </div>
          <textarea ref={ta} value={md} onChange={(e) => setMd(e.target.value)} onKeyDown={onKey} spellCheck={false} placeholder="# Start writing Markdown…"
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const f = e.dataTransfer.files[0]; if (f) { e.preventDefault(); onUpload(f) } }}
            className="h-[72vh] w-full resize-none bg-transparent p-4 font-mono text-[13px] leading-relaxed text-fg outline-none scrollbar-thin" />
          <div className="flex justify-between border-t border-border px-3 py-1.5 font-mono text-[10px] text-muted"><span>{md.length.toLocaleString()} chars · {(md.match(/\S+/g) ?? []).length.toLocaleString()} words</span><span>autosaved locally</span></div>
        </div>
        <div className={cn('min-w-0', pane !== 'preview' && 'hidden lg:block')}>
          <LiveFrame css={css} body={html} pageWidthPt={dims.w} marginPt={marginPt} pageBg={th.page} desk={theme === 'dark' ? '#1c2128' : undefined} height="calc(72vh + 82px)" />
        </div>
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <Button size="lg" loading={busy} icon={<FileDown className="size-5" />} onClick={exportPdf} disabled={!md.trim()}>Export PDF</Button>
        <Button variant="outline" icon={<FileCode2 className="size-4" />} onClick={downloadHtml} disabled={!md.trim()}>Download .html</Button>
        <Button variant="outline" icon={<FileText className="size-4" />} onClick={() => downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${title}.md`)} disabled={!md.trim()}>Download .md</Button>
        {busy && <div className="min-w-48 flex-1"><Progress value={progress} label="Rendering pages" /></div>}
        <ErrorNote error={error} />
      </Card>
      {result && <Reveal k="res" className="space-y-3"><ResultCard blob={result.blob} filename={`${title}.pdf`} title={`PDF ready · ${result.pages} page${result.pages > 1 ? 's' : ''}`} /><PdfPreview blob={result.blob} height={600} /></Reveal>}
    </div>
  )
}
