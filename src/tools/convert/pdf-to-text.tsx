import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Download, ChevronUp, ChevronDown, ScanText, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, Dropzone, ToolGrid, Label, Segmented, Switch, Input, Progress, ErrorNote, CopyButton, Badge, useJob } from '@/components/ui'
import { downloadBlob, baseName } from '@/lib/files'
import { FileBar, Stat, useDebounced, pdfError } from './_conv/shared'
import { openPdfRich, pageLayout } from './_conv/pdfOpen'
import { groupLines, bodySize, headingSizesOf, buildBlocks, type Line } from './_conv/pdfText'

type Mode = 'lines' | 'paragraphs' | 'layout'
interface PageData { lines: Line[]; width: number }

function render(p: PageData, mode: Mode, body: number, hs: number[]) {
  if (!p.lines.length) return ''
  if (mode === 'lines') return p.lines.map((l) => l.text).join('\n')
  if (mode === 'paragraphs') return buildBlocks(p.lines, body, hs, p.width).map((b) => (b.kind === 'li' ? '• ' : '') + b.text.replace(/\s+/g, ' ').trim()).join('\n\n')
  // layout: place text on a character grid so columns line up
  const cw = Math.max(3, body * 0.5)
  const out: string[] = []
  let prevY: number | null = null
  for (const l of p.lines) {
    if (prevY !== null && l.y - prevY > body * 2.2) out.push('')
    let row = ''
    for (const it of l.items) {
      if (!it.str) continue
      const col = Math.round(it.x / cw)
      if (row.length < col) row += ' '.repeat(col - row.length)
      else if (row.length && !row.endsWith(' ') && !it.str.startsWith(' ')) row += ' '
      row += it.str
    }
    out.push(row.replace(/\s+$/, ''))
    prevY = l.y
  }
  const indent = Math.min(...out.filter((r) => r.trim()).map((r) => r.match(/^ */)![0].length))
  return out.map((r) => r.slice(Number.isFinite(indent) ? indent : 0)).join('\n')
}

function Highlight({ text, q, base, active }: { text: string; q: string; base: number; active: number }) {
  if (!q) return <>{text}</>
  const parts: React.ReactNode[] = []
  const lower = text.toLowerCase(), ql = q.toLowerCase()
  let i = 0, k = 0, idx: number
  while ((idx = lower.indexOf(ql, i)) !== -1) {
    parts.push(text.slice(i, idx))
    const n = base + k++
    parts.push(<mark key={idx} data-hit={n} className={n === active ? 'rounded bg-accent px-0.5 text-white' : 'rounded bg-warn/40 px-0.5 text-fg'}>{text.slice(idx, idx + q.length)}</mark>)
    i = idx + q.length
  }
  parts.push(text.slice(i))
  return <>{parts}</>
}

export default function PdfToText() {
  const [file, setFile] = useState<File | null>(null)
  const [pages, setPages] = useState<PageData[]>([])
  const [mode, setMode] = useState<Mode>('paragraphs')
  const [markers, setMarkers] = useState(true)
  const [query, setQuery] = useState('')
  const [hit, setHit] = useState(0)
  const q = useDebounced(query.trim(), 200)
  const { busy, progress, error, run } = useJob()
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!file) return
    setPages([])
    run(async (setP) => {
      const doc = await openPdfRich(file).catch((e) => { throw new Error(pdfError(e)) })
      const out: PageData[] = []
      for (let i = 1; i <= doc.numPages; i++) {
        const lay = await pageLayout(doc, i, false)
        out.push({ lines: groupLines(lay.items), width: lay.width })
        setP(i / doc.numPages)
        if (i % 5 === 0 || i === doc.numPages) setPages([...out])
      }
    })
  }, [file, run])

  const { body, hs } = useMemo(() => { const all = pages.flatMap((p) => p.lines); const b = bodySize(all); return { body: b, hs: headingSizesOf(all, b) } }, [pages])
  const texts = useMemo(() => pages.map((p) => render(p, mode, body, hs)), [pages, mode, body, hs])
  const full = useMemo(() => texts.map((t, i) => (markers ? `===== Page ${i + 1} =====\n` : '') + t).join('\n\n'), [texts, markers])
  const words = useMemo(() => (full.match(/\S+/g) ?? []).length, [full])
  const empty = texts.filter((t) => !t.trim()).length

  const counts = useMemo(() => texts.map((t) => { if (!q) return 0; let c = 0, i = 0; const l = t.toLowerCase(), ql = q.toLowerCase(); while ((i = l.indexOf(ql, i)) !== -1) { c++; i += ql.length } return c }), [texts, q])
  const totalHits = counts.reduce((a, b) => a + b, 0)
  const bases = counts.reduce<number[]>((acc, _c, i) => { acc.push(i ? acc[i - 1] + counts[i - 1] : 0); return acc }, [])
  useEffect(() => setHit(0), [q, mode])
  useEffect(() => { if (!q || !totalHits) return; listRef.current?.querySelector(`[data-hit="${hit}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, [hit, q, totalHits])

  const reset = () => { setFile(null); setPages([]); setQuery('') }
  const download = () => downloadBlob(new Blob([full.replace(/\f/g, '')], { type: 'text/plain;charset=utf-8' }), `${baseName(file!.name)}.txt`)

  if (!file) return <Dropzone accept="application/pdf,.pdf" onFiles={(f) => setFile(f[0])} label="Drop a PDF to extract its text" />

  return (
    <div className="space-y-5">
      <FileBar name={file.name} size={file.size} sub={pages.length ? `${pages.length} page${pages.length > 1 ? 's' : ''}` : 'reading…'} onReset={reset} />
      <ToolGrid
        main={<>
          <div className="sticky top-16 z-10 flex items-center gap-2 rounded-xl border border-border bg-surface/90 p-2 backdrop-blur">
            <Search className="ml-1 size-4 shrink-0 text-muted" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && totalHits) setHit((h) => (e.shiftKey ? (h - 1 + totalHits) % totalHits : (h + 1) % totalHits)) }} placeholder="Search the document…" className="h-8 border-0 bg-transparent focus:ring-0" />
            {q && <span className="shrink-0 font-mono text-xs text-muted">{totalHits ? `${hit + 1}/${totalHits}` : '0 results'}</span>}
            <Button size="sm" variant="ghost" disabled={!totalHits} onClick={() => setHit((h) => (h - 1 + totalHits) % totalHits)} aria-label="Previous"><ChevronUp className="size-4" /></Button>
            <Button size="sm" variant="ghost" disabled={!totalHits} onClick={() => setHit((h) => (h + 1) % totalHits)} aria-label="Next"><ChevronDown className="size-4" /></Button>
            {query && <Button size="sm" variant="ghost" onClick={() => setQuery('')} aria-label="Clear"><X className="size-4" /></Button>}
          </div>
          {busy && <Progress value={progress} label="Extracting text" />}
          <ErrorNote error={error} />
          {empty > 0 && !busy && pages.length > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm">
              <ScanText className="mt-0.5 size-4 shrink-0 text-warn" />
              <div>{empty === pages.length ? 'No text layer found — this looks like a scanned PDF.' : `${empty} page${empty > 1 ? 's have' : ' has'} no text layer (probably scanned).`} Try <Link to="/ocr-pdf" className="font-medium text-accent underline">OCR PDF</Link> to recognise it.</div>
            </div>
          )}
          <div ref={listRef} className="space-y-3">
            {texts.map((t, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }} className="overflow-hidden rounded-2xl border border-border bg-surface">
                <div className="flex items-center gap-2 border-b border-border bg-surface-2/40 px-4 py-2">
                  <span className="text-sm font-semibold">Page {i + 1}</span>
                  <span className="font-mono text-[11px] text-muted">{t.length.toLocaleString()} chars</span>
                  {q && counts[i] > 0 && <Badge>{counts[i]} match{counts[i] > 1 ? 'es' : ''}</Badge>}
                  <div className="ml-auto"><CopyButton text={t} variant="ghost" /></div>
                </div>
                {t.trim()
                  ? <pre className={`max-h-[480px] overflow-auto whitespace-pre-wrap break-words px-4 py-3 text-[13px] leading-relaxed scrollbar-thin ${mode === 'layout' ? 'font-mono whitespace-pre' : 'font-sans'}`}><Highlight text={t} q={q} base={bases[i] ?? 0} active={hit} /></pre>
                  : <div className="px-4 py-6 text-center text-sm text-muted">No extractable text on this page.</div>}
              </motion.div>
            ))}
          </div>
        </>}
        side={<>
          <div>
            <Label>Text layout</Label>
            <Segmented value={mode} onChange={setMode} options={[{ value: 'paragraphs', label: 'Paragraphs' }, { value: 'lines', label: 'Lines' }, { value: 'layout', label: 'Keep layout' }]} />
            <p className="mt-1.5 text-[11px] text-muted">{mode === 'paragraphs' ? 'Reflows wrapped lines into clean paragraphs (de-hyphenated).' : mode === 'lines' ? 'One line of output per visual line, in reading order.' : 'Monospace output that keeps columns and tables aligned.'}</p>
          </div>
          <Switch checked={markers} onChange={setMarkers} label="Page markers (===== Page N =====)" />
          <div className="grid grid-cols-3 gap-2"><Stat label="Pages" value={pages.length} /><Stat label="Words" value={words.toLocaleString()} /><Stat label="Chars" value={full.length.toLocaleString()} /></div>
          <div className="grid gap-2">
            <Button size="lg" icon={<Download className="size-5" />} disabled={!pages.length || busy} onClick={download}>Download .txt</Button>
            <CopyButton text={() => full.replace(/\f/g, '')} label="Copy all text" size="md" />
          </div>
        </>}
      />
    </div>
  )
}
