import { useEffect, useMemo, useState } from 'react'
import { FileText, Trash2 } from 'lucide-react'
import { Button, CopyButton, Dropzone, Progress, Segmented, Switch, ToolGrid, cn, useJob } from '@/components/ui'
import { baseName, formatBytes, zipFiles } from '@/lib/files'
import { DlButton } from '@/lib/bcat/kit'
import { Tile } from '@/lib/b14/ui'
import { fence, jsonToMd, notebookToMd, parseNotebook, slideParagraphs, slidesToMd, tableToMd } from '@/lib/b14/convert'

const ACCEPT = '.pdf,.docx,.odt,.rtf,.html,.htm,.xhtml,.md,.markdown,.txt,.epub,.mobi,.azw3,.fb2,.xlsx,.xls,.ods,.csv,.tsv,.pptx,.json,.yaml,.yml,.xml,.toml,.eml,.ipynb,.js,.ts,.py,.java,.c,.cpp,.go,.rs,.rb,.php,.sh,.sql,.css'
const CODE: Record<string, string> = { js: 'javascript', ts: 'typescript', py: 'python', java: 'java', c: 'c', cpp: 'cpp', go: 'go', rs: 'rust', rb: 'ruby', php: 'php', sh: 'bash', sql: 'sql', css: 'css', yaml: 'yaml', yml: 'yaml', xml: 'xml', toml: 'toml' }
const ext = (n: string) => n.toLowerCase().split('.').pop() || ''

interface Item { file: File; md: string; status: 'wait' | 'ok' | 'error'; note?: string }

async function convert(file: File, opts: { pdfBreaks: boolean }): Promise<string> {
  const e = ext(file.name), title = baseName(file.name)
  if (e === 'pdf') {
    const { loadLayout, buildModel } = await import('@/tools/convert/_b1/extract')
    const { toMarkdown } = await import('@/tools/convert/_b1/writers')
    const { pages } = await loadLayout(file)
    const model = buildModel(pages, { headings: true, tables: true, scanImages: false, minChars: 20, dropRepeating: true })
    const md = toMarkdown(model, { title, images: new Map(), pageBreaks: opts.pdfBreaks })
    if (!md.replace(/[#\s-]/g, '').length) throw new Error('This PDF has no text layer (it is a scan). Run OCR first, then convert.')
    return md
  }
  if (['xlsx', 'xls', 'ods', 'csv', 'tsv'].includes(e)) {
    const XLSX = await import('xlsx')
    const wb = e === 'csv' || e === 'tsv' ? XLSX.read(await file.text(), { type: 'string', FS: e === 'tsv' ? '\t' : undefined }) : XLSX.read(await file.arrayBuffer())
    return wb.SheetNames.map((n) => { const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: false, defval: '' }); return (wb.SheetNames.length > 1 ? `## ${n}\n\n` : '') + (tableToMd(rows) || '_Empty sheet_') }).join('\n\n') + '\n'
  }
  if (e === 'pptx') {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => +a.match(/\d+/)![0] - +b.match(/\d+/)![0])
    if (!names.length) throw new Error('No slides found in this PowerPoint file.')
    const slides = []
    for (const n of names) {
      const num = n.match(/\d+/)![0]
      const notesFile = zip.file(`ppt/notesSlides/notesSlide${num}.xml`)
      const notes = notesFile ? slideParagraphs(await notesFile.async('string')).filter((p) => !/^\d+$/.test(p)) : []
      slides.push({ paras: slideParagraphs(await zip.file(n)!.async('string')), notes })
    }
    return slidesToMd(slides, title)
  }
  if (e === 'ipynb') return notebookToMd(parseNotebook(await file.text()), { outputs: true })
  if (e === 'json') { const t = await file.text(); try { return `# ${title}\n\n${jsonToMd(JSON.parse(t))}\n` } catch { return fence(t, 'json') + '\n' } }
  if (e === 'eml') {
    const PostalMime = (await import('postal-mime')).default
    const m: any = await new PostalMime().parse(await file.arrayBuffer())
    const { htmlToMarkdown } = await import('@/lib/b4/office')
    const { sanitizeMarkup } = await import('@/lib/safe')
    const body = m.html ? await htmlToMarkdown(sanitizeMarkup(m.html)) : (m.text || '')
    const who = (a: any) => (a ? (a.name ? `${a.name} <${a.address}>` : a.address) : '')
    return [`# ${m.subject || title}`, '', `- **From**: ${who(m.from)}`, `- **To**: ${(m.to ?? []).map(who).join(', ')}`, m.date ? `- **Date**: ${m.date}` : '', (m.attachments?.length ? `- **Attachments**: ${m.attachments.map((a: any) => a.filename).join(', ')}` : ''), '', body.trim(), ''].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n')
  }
  if (CODE[e]) return `# ${file.name}\n\n${fence(await file.text(), CODE[e])}\n`
  if (e === 'md' || e === 'markdown') return await file.text()
  if (e === 'txt') return (await file.text()).replace(/\r\n?/g, '\n')
  const { toHtml, htmlToMarkdown } = await import('@/lib/b4/office')
  const { sanitizeMarkup } = await import('@/lib/safe')
  const r = await toHtml(file)
  const md = await htmlToMarkdown(sanitizeMarkup(r.html.replace(/<img[^>]+src="data:[^"]{20000,}"[^>]*>/g, '')))
  return (r.title && !/^#\s/.test(md) ? `# ${r.title}\n\n` : '') + md.trim() + '\n'
}

export default function AnyToMarkdown() {
  const [items, setItems] = useState<Item[]>([])
  const [sel, setSel] = useState(0)
  const [view, setView] = useState<'md' | 'rendered'>('md')
  const [joined, setJoined] = useState(true)
  const [pdfBreaks, setPdfBreaks] = useState(false)
  const { busy, progress, run } = useJob()

  const add = (fs: File[]) => run(async (setP) => {
    const start = items.length
    const next = [...items, ...fs.map((file) => ({ file, md: '', status: 'wait' as const }))]
    setItems(next)
    for (let i = 0; i < fs.length; i++) {
      setP(i / fs.length)
      try { const md = await convert(fs[i], { pdfBreaks }); next[start + i] = { file: fs[i], md, status: 'ok' } }
      catch (e: any) { next[start + i] = { file: fs[i], md: '', status: 'error', note: e?.message || 'Could not read this file.' } }
      setItems([...next])
    }
    if (!items.length) setSel(0)
  })
  const ok = items.filter((i) => i.status === 'ok')
  const combined = useMemo(() => ok.map((i) => (ok.length > 1 ? `<!-- ${i.file.name} -->\n\n` : '') + i.md.trim()).join('\n\n---\n\n') + '\n', [items])
  const cur = items[sel]
  const shown = joined && ok.length > 1 ? combined : cur?.md ?? ''
  const words = shown.trim() ? shown.trim().split(/\s+/).length : 0
  const [html, setHtml] = useState('')
  useEffect(() => { if (view === 'rendered') import('marked').then(async ({ marked }) => { const { sanitizeMarkup } = await import('@/lib/safe'); setHtml(sanitizeMarkup(await marked.parse(shown, { gfm: true }))) }) }, [view, shown])

  if (!items.length) return <Dropzone multiple accept={ACCEPT} onFiles={add} label="Drop files to turn into Markdown" sub="PDF, Word, PowerPoint, Excel, CSV, HTML, EPUB, RTF, ODT, email (.eml), notebooks, JSON and code. Many at once is fine. Clean Markdown for notes apps, wikis or AI chats." />
  return (
    <ToolGrid
      main={<>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={view} onChange={setView} options={[{ value: 'md', label: 'Markdown' }, { value: 'rendered', label: 'Preview' }]} />
          <span className="ml-auto text-xs text-muted">{words.toLocaleString()} words · about {Math.ceil(shown.length / 4).toLocaleString()} AI tokens</span>
        </div>
        {busy && <Progress value={progress} label="Converting" />}
        {view === 'md'
          ? <pre className="scrollbar-thin max-h-[62vh] min-h-60 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-border bg-surface p-4 font-mono text-[12.5px] leading-relaxed">{shown.length > 120000 ? shown.slice(0, 120000) + '\n\n(preview cut short, the download has everything)' : shown || (cur?.status === 'error' ? cur.note : 'Working')}</pre>
          : <iframe title="Rendered Markdown" sandbox="" srcDoc={`<!doctype html><meta charset="utf-8"><style>body{font:14px/1.6 system-ui,sans-serif;color:#1a1c20;background:#fff;padding:18px;max-width:860px;margin:auto}pre{background:#f3f1ec;padding:10px;border-radius:8px;overflow:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:3px 8px}img{max-width:100%}blockquote{border-left:3px solid #F5A524;margin:0;padding-left:12px;color:#555}</style>${html}`} className="h-[62vh] w-full rounded-2xl border border-border bg-white" />}
      </>}
      side={<>
        <div className="grid grid-cols-2 gap-2"><Tile label="Files" value={items.length} /><Tile label="Converted" value={ok.length} /></div>
        <div className="scrollbar-thin max-h-64 space-y-1 overflow-auto">
          {items.map((it, i) => (
            <button key={i} onClick={() => { setSel(i); setJoined(false) }} className={cn('flex w-full cursor-pointer items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-left text-sm', sel === i && !joined ? 'bg-accent/10' : 'bg-surface hover:bg-surface-2')}>
              <FileText className={cn('size-4 shrink-0', it.status === 'error' ? 'text-danger' : it.status === 'ok' ? 'text-accent' : 'text-muted')} />
              <span className="min-w-0 flex-1 truncate">{it.file.name}</span>
              <span className="shrink-0 text-[11px] text-muted">{it.status === 'error' ? 'failed' : it.status === 'wait' ? '...' : formatBytes(it.md.length)}</span>
            </button>
          ))}
        </div>
        {cur?.status === 'error' && !joined && <p className="text-xs text-danger">{cur.note}</p>}
        {ok.length > 1 && <Switch checked={joined} onChange={setJoined} label="Show all files as one document" />}
        <Switch checked={pdfBreaks} onChange={setPdfBreaks} label="Mark PDF page breaks (for files added next)" />
        <div className="flex flex-wrap gap-2">
          <CopyButton text={shown} label="Copy" />
          <DlButton variant="primary" name={joined && ok.length > 1 ? 'combined.md' : `${baseName(cur?.file.name || 'document')}.md`} mime="text/markdown" data={() => shown}>Download .md</DlButton>
          {ok.length > 1 && <DlButton name="markdown.zip" mime="application/zip" data={() => zipFiles(ok.map((i) => ({ name: `${baseName(i.file.name)}.md`, data: i.md })))}>All as ZIP</DlButton>}
        </div>
        <Dropzone compact multiple accept={ACCEPT} onFiles={add} label="Add more files" />
        <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => { setItems([]); setSel(0) }}>Start over</Button>
      </>}
    />
  )
}
