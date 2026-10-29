import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Printer, StickyNote, Search } from 'lucide-react'
import { Button, Dropzone, Input, Spinner, ErrorNote, cn } from '@/components/ui'
import { TopBar } from '@/lib/b4/ui'
import type { Deck } from '@/lib/b4/pptx'
import { safeUrl, sanitizeMarkup } from '@/lib/safe'

type Kind = 'docx' | 'sheet' | 'pptx' | 'odt' | 'rtf'
const ACCEPT = '.docx,.docm,.dotx,.xlsx,.xlsm,.xls,.xlsb,.ods,.csv,.tsv,.pptx,.ppsx,.odt,.rtf'
const kindOf = (n: string): Kind | null => {
  const e = n.toLowerCase().split('.').pop() || ''
  if (/^(docx|docm|dotx)$/.test(e)) return 'docx'
  if (/^(xlsx|xlsm|xls|xlsb|ods|csv|tsv)$/.test(e)) return 'sheet'
  if (/^(pptx|ppsx)$/.test(e)) return 'pptx'
  if (e === 'odt') return 'odt'
  if (e === 'rtf') return 'rtf'
  return null
}

function SheetView({ file }: { file: File }) {
  const [sheets, setSheets] = useState<{ name: string; rows: any[][] }[] | null>(null)
  const [active, setActive] = useState(0)
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    (async () => {
      try {
        const XLSX = await import('xlsx')
        const wb = /\.(csv|tsv)$/i.test(file.name) ? XLSX.read(await file.text(), { type: 'string', raw: false }) : XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
        setSheets(wb.SheetNames.map((n) => ({ name: n, rows: XLSX.utils.sheet_to_json<any[]>(wb.Sheets[n], { header: 1, raw: false, defval: '' }) as any[][] })))
      } catch { setError('Could not read this spreadsheet.') }
    })()
  }, [file])
  if (error) return <ErrorNote error={error} />
  if (!sheets) return <Spinner label="Reading spreadsheet" />
  const s = sheets[active]
  const cols = Math.max(0, ...s.rows.slice(0, 5000).map((r) => r.length))
  const ql = q.toLowerCase()
  const rows = s.rows.slice(0, 5000).map((r, i) => ({ r, i })).filter(({ r }) => !ql || r.some((c) => String(c).toLowerCase().includes(ql)))
  const colName = (i: number) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26) } return s }
  return (
    <div className="space-y-2">
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find in sheet" className="pl-9" aria-label="Find in sheet" /></div>
      <div className="max-h-[65vh] overflow-auto rounded-xl border border-border bg-surface scrollbar-thin">
        <table className="min-w-full border-collapse font-mono text-xs">
          <thead className="sticky top-0 z-10 bg-surface-2"><tr><th className="sticky left-0 z-20 border border-border bg-surface-2 px-2 py-1 text-muted">#</th>{Array.from({ length: cols }, (_, i) => <th key={i} className="border border-border px-2 py-1 font-medium text-muted">{colName(i)}</th>)}</tr></thead>
          <tbody>{rows.map(({ r, i }) => <tr key={i} className="hover:bg-accent/5"><td className="sticky left-0 border border-border bg-surface-2 px-2 py-1 text-right text-muted">{i + 1}</td>{Array.from({ length: cols }, (_, j) => <td key={j} className="max-w-xs truncate whitespace-nowrap border border-border px-2 py-1" title={String(r[j] ?? '')}>{String(r[j] ?? '')}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {s.rows.length > 5000 && <p className="text-xs text-muted">Showing the first 5,000 of {s.rows.length.toLocaleString()} rows.</p>}
      {sheets.length > 1 && <div className="flex flex-wrap gap-1">{sheets.map((x, i) => <button key={x.name} onClick={() => setActive(i)} className={cn('rounded-lg border px-3 py-1 text-xs font-medium cursor-pointer', i === active ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50')}>{x.name}</button>)}</div>}
    </div>
  )
}

function SlidesView({ file }: { file: File }) {
  const [deck, setDeck] = useState<Deck | null>(null)
  const [i, setI] = useState(0)
  const [notes, setNotes] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [w, setW] = useState(800)
  const box = useRef<HTMLDivElement>(null)
  const [html, setHtml] = useState<(d: Deck, n: number) => string>(() => () => '')
  useEffect(() => {
    (async () => { try { const m = await import('@/lib/b4/pptx'); setHtml(() => (d: Deck, n: number) => m.slideHtml(d, d.slides[n])); setDeck(await m.readPptx(file)) } catch (e: any) { setError(e?.message || 'Could not read this presentation.') } })()
  }, [file])
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth); return () => ro.disconnect() }, [deck])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (!deck || (e.target as HTMLElement).tagName === 'INPUT') return; if (e.key === 'ArrowRight' || e.key === 'PageDown') setI((x) => Math.min(deck.slides.length - 1, x + 1)); if (e.key === 'ArrowLeft' || e.key === 'PageUp') setI((x) => Math.max(0, x - 1)) }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [deck])
  if (error) return <ErrorNote error={error} />
  if (!deck) return <Spinner label="Reading presentation" />
  if (!deck.slides.length) return <ErrorNote error="This presentation has no slides." />
  const scale = w / (deck.width * (96 / 72))
  const s = deck.slides[i]
  return (
    <div className="space-y-3">
      <div ref={box} className="overflow-hidden rounded-xl border border-border shadow-sm" style={{ height: deck.height * (96 / 72) * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }} dangerouslySetInnerHTML={{ __html: html(deck, i) }} />
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" icon={<ChevronLeft className="size-4" />} disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Previous slide" />
        <span className="flex-1 text-center font-mono text-sm">{i + 1} / {deck.slides.length}</span>
        {s.notes && <Button size="sm" variant={notes ? 'secondary' : 'ghost'} icon={<StickyNote className="size-4" />} onClick={() => setNotes(!notes)}>Notes</Button>}
        <Button size="sm" variant="outline" icon={<ChevronRight className="size-4" />} disabled={i === deck.slides.length - 1} onClick={() => setI(i + 1)} aria-label="Next slide" />
      </div>
      {notes && s.notes && <div className="rounded-xl border border-border bg-surface-2/50 p-3 text-sm">{s.notes}</div>}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">{deck.slides.map((x, n) => (
        <button key={n} onClick={() => setI(n)} className={cn('shrink-0 cursor-pointer overflow-hidden rounded-lg border-2', n === i ? 'border-accent' : 'border-border')} style={{ width: 128, height: (128 * deck.height) / deck.width }} aria-label={`Slide ${n + 1}`}>
          <div style={{ transform: `scale(${128 / (deck.width * (96 / 72))})`, transformOrigin: 'top left', pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: html(deck, n) }} />
        </button>))}
      </div>
      <p className="text-xs text-muted">Text, pictures, tables and simple shapes are shown. Charts, SmartArt and animations are not drawn. Use the arrow keys to move between slides.</p>
    </div>
  )
}

function DocView({ file, kind }: { file: File; kind: 'docx' | 'odt' | 'rtf' }) {
  const host = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const el = host.current; if (!el) return
    setBusy(true); setError(null)
    ;(async () => {
      try {
        if (kind === 'docx') {
          // Same as docx-preview's renderAsync, but the nodes are made inert before they reach the page:
          // embedded HTML chunks (altChunk) render in a sandboxed frame and only safe link targets are kept.
          const { parseAsync, renderDocument } = await import('docx-preview')
          const opts = { className: 'docx', inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true, renderHeaders: true, renderFooters: true, renderFootnotes: true, experimental: true, useBase64URL: true }
          const nodes = await renderDocument(await parseAsync(file, opts), opts)
          el.innerHTML = ''
          for (const n of nodes) {
            if (n instanceof Element) {
              for (const f of [n, ...Array.from(n.querySelectorAll('iframe'))]) if (f.tagName === 'IFRAME') f.setAttribute('sandbox', '')
              for (const a of [n, ...Array.from(n.querySelectorAll('[href]'))]) { const h = a.getAttribute('href'); if (h && !safeUrl(h)) a.removeAttribute('href') }
            }
            el.appendChild(n)
          }
        } else {
          const html = kind === 'odt' ? await (await import('@/lib/b4/odt')).odtToHtml(file) : await (await import('@/lib/b4/rtf')).rtfToHtml(await file.arrayBuffer())
          const { DOC_CSS } = await import('@/lib/b4/office')
          el.innerHTML = `<style>${DOC_CSS}</style><div style="max-width:794px;margin:0 auto;padding:56px;background:#fff;color:#111;box-shadow:0 1px 6px #0002">${sanitizeMarkup(html)}</div>`
        }
      } catch (e: any) { setError(e?.message || 'Could not render this document.') } finally { setBusy(false) }
    })()
  }, [file, kind])
  return (
    <div className="relative">
      {busy && <Spinner label="Rendering document" />}
      <ErrorNote error={error} />
      <div ref={host} className="max-h-[75vh] overflow-auto rounded-xl border border-border bg-surface-2 p-2 scrollbar-thin [&_.docx-wrapper]:bg-transparent [&_.docx-wrapper]:p-2" />
    </div>
  )
}

export default function OfficeViewer() {
  const [file, setFile] = useState<File | null>(null)
  const kind = file ? kindOf(file.name) : null
  if (!file) return <Dropzone accept={ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop an Office file to view it" sub="Word (DOCX), Excel (XLSX, XLS, ODS, CSV), PowerPoint (PPTX), ODT and RTF. Opened right in your browser, nothing is uploaded." />
  return (
    <div className="space-y-3">
      <TopBar file={file} onReset={() => setFile(null)} label="Open another" extra={kind === 'docx' || kind === 'odt' || kind === 'rtf' ? <Button size="sm" variant="ghost" icon={<Printer className="size-4" />} onClick={() => window.print()} aria-label="Print">Print</Button> : undefined} />
      {kind === 'sheet' && <SheetView file={file} />}
      {kind === 'pptx' && <SlidesView file={file} />}
      {(kind === 'docx' || kind === 'odt' || kind === 'rtf') && <DocView file={file} kind={kind} />}
      {!kind && <ErrorNote error="This file type is not supported." />}
    </div>
  )
}
