import { useRef, useState } from 'react'
import { PanelTop, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { Button, Dropzone, Field, Input, ResultCard, Select, Slider, Switch, ToolGrid, Progress, ErrorNote, useJob, Label } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { ColorInput, FileBar, LivePreview, PDF_ACCEPT, PageScope, ops, readBytes, scopePages, usePdfDoc, FONTS_LIST } from './_core/kit'
import type { FontName, HFOpts } from './_core/ops'

type Trio = [string, string, string]
const TOKENS = ['{page}', '{total}', '{date}', '{time}', '{filename}', '{title}']
const PRESETS: { label: string; header: Trio; footer: Trio }[] = [
  { label: 'Title + page', header: ['{title}', '', '{date}'], footer: ['', 'Page {page} of {total}', ''] },
  { label: 'Confidential', header: ['', 'CONFIDENTIAL', ''], footer: ['{filename}', '', '{page} / {total}'] },
  { label: 'Minimal', header: ['', '', ''], footer: ['', '{page}', ''] },
  { label: 'Report', header: ['{title}', '', ''], footer: ['{date}', '', 'Page {page}'] },
]

export default function PdfHeaderFooter() {
  const [file, setFile] = useState<File | null>(null)
  const { numPages, error } = usePdfDoc(file)
  const [header, setHeader] = useState<Trio>(['{title}', '', '{date}'])
  const [footer, setFooter] = useState<Trio>(['', 'Page {page} of {total}', ''])
  const [size, setSize] = useState(9)
  const [color, setColor] = useState('#555555')
  const [font, setFont] = useState<FontName>('Helvetica')
  const [mx, setMx] = useState(40)
  const [my, setMy] = useState(24)
  const [start, setStart] = useState(1)
  const [skipFirst, setSkipFirst] = useState(false)
  const [line, setLine] = useState(false)
  const [title, setTitle] = useState('')
  const [dateFmt, setDateFmt] = useState<'locale' | 'iso' | 'long'>('locale')
  const [scope, setScope] = useState<'all' | 'range'>('all')
  const [range, setRange] = useState('')
  const [preview, setPreview] = useState(0)
  const [result, setResult] = useState<Blob | null>(null)
  const lastFocus = useRef<{ row: 'h' | 'f'; col: number; el: HTMLInputElement } | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setResult(null); setPreview(0) }
  const d = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setResult(null) }

  const now = new Date()
  const date = dateFmt === 'iso' ? now.toISOString().slice(0, 10) : dateFmt === 'long' ? now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : now.toLocaleDateString()
  const opts = (): HFOpts => ({ header, footer, size, color, font, marginX: mx, marginY: my, filename: file?.name ?? '', title: title.trim() || undefined, date, start, skipFirst, line, pages: scopePages(scope, range, numPages) })
  const deps = [header.join('|'), footer.join('|'), size, color, font, mx, my, start, skipFirst, line, title, dateFmt, scope, range, numPages]
  const any = [...header, ...footer].some((s) => s.trim())

  const setCell = (row: 'h' | 'f', col: number, v: string) => {
    const f = row === 'h' ? setHeader : setFooter
    f((t) => { const n = [...t] as Trio; n[col] = v; return n }); setResult(null)
  }
  const insertToken = (tok: string) => {
    const lf = lastFocus.current
    if (!lf) { setCell('f', 1, footer[1] + tok); return }
    const el = lf.el, s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? s
    const v = el.value.slice(0, s) + tok + el.value.slice(e)
    setCell(lf.row, lf.col, v)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + tok.length, s + tok.length) })
  }

  const run = () => job.run(async (setP) => {
    if (!file) return
    if (!any) throw new Error('Type something in at least one header or footer box.')
    const o = await ops()
    setResult(pdfBlob(await o.addHeaderFooter(await readBytes(file), opts()))); setP(1); toast('Header & footer added', 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to add headers & footers" />

  const rowInputs = (row: 'h' | 'f', vals: Trio) => (
    <div className="grid grid-cols-3 gap-1.5">
      {vals.map((v, col) => (
        <div key={col} className="relative">
          <Input value={v} placeholder={['Left', 'Center', 'Right'][col]} className={col === 1 ? 'text-center' : col === 2 ? 'text-right' : ''}
            onFocus={(e) => (lastFocus.current = { row, col, el: e.currentTarget })} onChange={(e) => setCell(row, col, e.target.value)} />
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-header-footer.pdf`} title="Header & footer added" onReset={reset} />}
      <ToolGrid
        main={<>
          <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 text-muted"><AlignLeft className="size-3.5" /><AlignCenter className="size-3.5" /><AlignRight className="size-3.5" /><span className="ml-1 text-xs">Click a box, then a token to insert it</span></div>
              <div className="flex flex-wrap gap-1">{TOKENS.map((t) => <button key={t} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertToken(t)} className="rounded-md bg-accent/10 px-1.5 py-0.5 font-mono text-[11px] text-accent hover:bg-accent/20 cursor-pointer">{t}</button>)}</div>
            </div>
            <div><Label>Header</Label>{rowInputs('h', header)}</div>
            <div><Label>Footer</Label>{rowInputs('f', footer)}</div>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-muted">Presets:</span>
              {PRESETS.map((p) => <button key={p.label} type="button" onClick={() => { setHeader(p.header); setFooter(p.footer); setResult(null) }} className="rounded-lg border border-border px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent cursor-pointer">{p.label}</button>)}
            </div>
          </div>
          {error ? <div className="text-sm text-danger">{error}</div> : numPages ? (
            <LivePreview file={file} pageIndex={preview} setPageIndex={setPreview} total={numPages} deps={deps}
              build={async (b, pi, total) => (await ops()).addHeaderFooter(b, { ...opts(), indexBase: pi, totalOverride: total })} />
          ) : null}
        </>}
        side={<>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Font"><Select value={font} onChange={d(setFont)} options={FONTS_LIST} /></Field>
            <Field label="Date format"><Select value={dateFmt} onChange={d(setDateFmt)} options={[{ value: 'locale', label: now.toLocaleDateString() }, { value: 'iso', label: now.toISOString().slice(0, 10) }, { value: 'long', label: 'Long' }]} /></Field>
          </div>
          <Slider label="Font size" value={size} min={6} max={24} onChange={d(setSize)} suffix="pt" />
          <Field label="Color"><ColorInput value={color} onChange={d(setColor)} /></Field>
          <Slider label="Side margin" value={mx} min={6} max={120} onChange={d(setMx)} suffix="pt" />
          <Slider label="Top / bottom margin" value={my} min={6} max={96} onChange={d(setMy)} suffix="pt" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="{page} starts at"><Input type="number" value={start} onChange={(e) => { setStart(parseInt(e.target.value) || 1); setResult(null) }} /></Field>
            <Field label="{title}"><Input value={title} placeholder="From file" onChange={(e) => { setTitle(e.target.value); setResult(null) }} /></Field>
          </div>
          <div><Label>Pages</Label><PageScope total={numPages} mode={scope} setMode={d(setScope)} range={range} setRange={d(setRange)} /></div>
          <div className="space-y-2.5">
            <Switch checked={skipFirst} onChange={d(setSkipFirst)} label="Skip first page" />
            <Switch checked={line} onChange={d(setLine)} label="Divider lines" />
          </div>
          {job.busy && <Progress value={job.progress} label="Adding…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<PanelTop className="size-5" />} loading={job.busy} disabled={!numPages || !any} onClick={run}>Apply header & footer</Button>
        </>}
      />
    </div>
  )
}
