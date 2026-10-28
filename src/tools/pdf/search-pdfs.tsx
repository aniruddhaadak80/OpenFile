import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, FileText, ChevronLeft } from 'lucide-react'
import { Button, Dropzone, ToolGrid, Progress, Input, Switch, Empty, Spinner, cn, useJob } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { openPdfJs, renderPage, type PdfJsDoc } from '@/lib/pdf'
import { PDF_ACCEPT } from './_core/kit'
import { Note } from './_b1/ui'

type Item = { str: string; x: number; y: number; w: number; h: number; start: number }
type Page = { text: string; items: Item[] }
type Doc = { id: string; file: File; pages: Page[]; error?: string; doc?: PdfJsDoc }
type Hit = { doc: number; page: number; start: number; end: number; before: string; match: string; after: string }

export default function SearchPdfs() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [q, setQ] = useState('')
  const [caseSens, setCase] = useState(false), [whole, setWhole] = useState(false), [regex, setRegex] = useState(false)
  const [open, setOpen] = useState<Hit | null>(null)
  const job = useJob()
  const inputRef = useRef<HTMLInputElement>(null)

  const add = (files: File[]) => job.run(async (setP) => {
    const out: Doc[] = []
    for (let f = 0; f < files.length; f++) {
      const file = files[f]
      const d: Doc = { id: Math.random().toString(36).slice(2), file, pages: [] }
      try {
        const pdf = await openPdfJs(file)
        d.doc = pdf
        for (let i = 1; i <= pdf.numPages; i++) {
          const pg = await pdf.getPage(i); const vp = pg.getViewport({ scale: 1 })
          const tc = await pg.getTextContent()
          let text = ''; const items: Item[] = []
          let lastY: number | null = null
          for (const it of tc.items as any[]) {
            if (!('str' in it)) continue
            const y = it.transform[5]
            if (lastY !== null && Math.abs(y - lastY) > 2 && !text.endsWith('\n')) text += '\n'
            else if (text && !/[\s\n]$/.test(text) && it.str && !it.str.startsWith(' ')) text += ' '
            const [x0, y0] = vp.convertToViewportPoint(it.transform[4], it.transform[5])
            const h = Math.hypot(it.transform[2], it.transform[3]) || 10
            items.push({ str: it.str, x: x0 / vp.width, y: (y0 - h) / vp.height, w: (it.width || 0) / vp.width, h: (h * 1.2) / vp.height, start: text.length })
            text += it.str
            if (it.hasEOL) text += '\n'
            lastY = y
          }
          d.pages.push({ text, items })
          setP((f + i / pdf.numPages) / files.length)
        }
      } catch (e: any) { d.error = e?.name === 'PasswordException' ? 'Password protected' : 'Could not read' }
      out.push(d)
    }
    setDocs((x) => [...x, ...out])
    setTimeout(() => inputRef.current?.focus(), 50)
  })

  const re = useMemo(() => {
    if (!q.trim()) return null
    try {
      const src = regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
      return new RegExp(whole ? `\\b(?:${src})\\b` : src, caseSens ? 'g' : 'gi')
    } catch { return 'bad' as const }
  }, [q, caseSens, whole, regex])

  const hits = useMemo(() => {
    const out: Hit[] = []
    if (!re || re === 'bad') return out
    docs.forEach((d, di) => d.pages.forEach((p, pi) => {
      re.lastIndex = 0; let m: RegExpExecArray | null; let guard = 0
      while ((m = re.exec(p.text)) && guard++ < 2000) {
        if (!m[0].length) { re.lastIndex++; continue }
        out.push({ doc: di, page: pi, start: m.index, end: m.index + m[0].length, before: p.text.slice(Math.max(0, m.index - 60), m.index).replace(/\s+/g, ' '), match: m[0], after: p.text.slice(m.index + m[0].length, m.index + m[0].length + 60).replace(/\s+/g, ' ') })
        if (out.length > 5000) return
      }
    }))
    return out
  }, [docs, re])
  const perDoc = useMemo(() => { const m = new Map<number, number>(); for (const h of hits) m.set(h.doc, (m.get(h.doc) ?? 0) + 1); return m }, [hits])

  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [])

  if (!docs.length && !job.busy) return <Dropzone multiple accept={PDF_ACCEPT} onFiles={add} label="Drop one or more PDFs to search through" sub="Search many files at once. Text is read in your browser and never uploaded." />
  return (
    <ToolGrid
      main={<div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setOpen(null) }} placeholder="Search for a word, phrase or pattern…" className="h-12 pl-10 text-base" aria-label="Search text" />
        </div>
        {job.busy && <Progress value={job.progress} label="Reading text…" />}
        {re === 'bad' && <div className="text-sm text-danger">That pattern is not a valid regular expression.</div>}
        {open ? <HitView hit={open} docs={docs} onBack={() => setOpen(null)} /> : q && re !== 'bad' ? (
          hits.length ? <div className="space-y-1.5">
            <div className="text-sm text-muted">{hits.length >= 5000 ? '5000+' : hits.length} match{hits.length === 1 ? '' : 'es'} in {perDoc.size} file{perDoc.size === 1 ? '' : 's'}</div>
            {hits.slice(0, 500).map((h, i) => (
              <button key={i} type="button" onClick={() => setOpen(h)} className="block w-full rounded-xl border border-border bg-surface px-3 py-2 text-left transition hover:border-accent cursor-pointer">
                <div className="mb-0.5 flex items-center gap-2 text-xs text-muted"><FileText className="size-3.5 text-accent" /><span className="truncate">{docs[h.doc].file.name}</span><span>· page {h.page + 1}</span></div>
                <div className="text-sm"><span className="text-muted">…{h.before}</span><mark className="rounded bg-accent/30 px-0.5 text-fg">{h.match}</mark><span className="text-muted">{h.after}…</span></div>
              </button>
            ))}
            {hits.length > 500 && <div className="text-xs text-muted">Showing the first 500 matches. Narrow your search to see more.</div>}
          </div> : <Empty>No matches. Scanned PDFs have no text layer; run OCR PDF on them first.</Empty>
        ) : <Empty>Type above to search across {docs.length} file{docs.length === 1 ? '' : 's'}.</Empty>}
      </div>}
      side={<>
        <div className="space-y-3"><Switch checked={caseSens} onChange={setCase} label="Match case" /><Switch checked={whole} onChange={setWhole} label="Whole words only" /><Switch checked={regex} onChange={setRegex} label="Regular expression" /></div>
        <div className="space-y-1.5">
          {docs.map((d, i) => (
            <div key={d.id} className="flex items-center gap-2 rounded-xl border border-border bg-surface-2/50 px-3 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-accent" />
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{d.file.name}</div><div className="text-xs text-muted">{d.error ?? `${d.pages.length} pages · ${formatBytes(d.file.size)}`}</div></div>
              {perDoc.get(i) ? <span className="rounded-md bg-accent/15 px-1.5 font-mono text-xs text-accent">{perDoc.get(i)}</span> : null}
              <button type="button" aria-label="Remove file" onClick={() => { setDocs((x) => x.filter((y) => y.id !== d.id)); setOpen(null) }} className="text-muted hover:text-danger cursor-pointer"><X className="size-4" /></button>
            </div>
          ))}
        </div>
        <Dropzone compact multiple accept={PDF_ACCEPT} onFiles={add} label="Add more PDFs" />
        <Note>Click a result to see the page with the match highlighted.</Note>
      </>}
    />
  )
}

function HitView({ hit, docs, onBack }: { hit: Hit; docs: Doc[]; onBack: () => void }) {
  const d = docs[hit.doc]
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => { let c = false; setSrc(null); if (d.doc) renderPage(d.doc, hit.page + 1, 1.4).then((cv) => !c && setSrc(cv.toDataURL('image/jpeg', 0.85))); return () => { c = true } }, [d, hit.page])
  const boxes = d.pages[hit.page].items.filter((it) => it.start < hit.end && it.start + it.str.length > hit.start)
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2"><Button size="sm" variant="ghost" icon={<ChevronLeft className="size-4" />} onClick={onBack}>Back to results</Button><span className="truncate text-sm text-muted">{d.file.name} · page {hit.page + 1}</span></div>
      <div className="checker flex min-h-80 items-center justify-center rounded-xl p-4">
        {src ? <div className="relative inline-block"><img src={src} alt="" className="max-h-[70vh] max-w-full bg-white shadow-2xl" />
          {boxes.map((b, i) => {
            const len = Math.max(1, b.str.length)
            const s = Math.max(0, hit.start - b.start), e = Math.min(len, hit.end - b.start)
            return <div key={i} className={cn('absolute rounded-sm bg-accent/40 ring-2 ring-accent')} style={{ left: `${(b.x + (b.w * s) / len) * 100}%`, top: `${b.y * 100}%`, width: `${(b.w * (e - s)) / len * 100}%`, height: `${b.h * 100}%` }} />
          })}</div> : <Spinner label="Rendering…" />}
      </div>
    </div>
  )
}
