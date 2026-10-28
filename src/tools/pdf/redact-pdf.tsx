import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MousePointer2, SquareDashed, ScanSearch, Undo2, Redo2, Trash2, EyeOff, Eye, ShieldCheck, X, Search } from 'lucide-react'
import { Button, Dropzone, FileChip, Label, Input, Textarea, Switch, Select, Spinner, ErrorNote, ResultCard, Progress, Tabs, useJob, cn, Empty } from '@/components/ui'
import { toast } from '@/components/toast'
import { openPdfJs, renderPage, pdfBlob } from '@/lib/pdf'
import { renameExt } from '@/lib/files'
import { usePdfPages, uid } from './_adv/pages'
import { useHistory } from './_adv/history'
import { PageEditor, type Tool } from './_adv/Editor'
import type { Item, PageItems } from './_adv/items'
import { PRESETS, findMatches, buildCustom, type PresetId } from './_adv/find'
import { PageNav, ToolBtn } from './_adv/ui'
import { plainBytes } from './_adv/decrypt'

type Dpi = '150' | '200' | '300'

export default function RedactPdf() {
  const [file, setFile] = useState<File | null>(null)
  const { pages, total, doc, error: loadErr, loading } = usePdfPages(file)
  const hist = useHistory<PageItems>({})
  const items = hist.state
  const [cur, setCur] = useState(0)
  const [tool, setTool] = useState<Tool>('rect')
  const [sel, setSel] = useState<string | null>(null)
  const [tab, setTab] = useState<'auto' | 'options'>('auto')
  const [presets, setPresets] = useState<Set<PresetId>>(new Set(['email', 'phone', 'card']))
  const [words, setWords] = useState('')
  const [regex, setRegex] = useState('')
  const [whole, setWhole] = useState(true)
  const [caseSens, setCaseSens] = useState(false)
  const [found, setFound] = useState<number | null>(null)
  const [preview, setPreview] = useState(false)
  const [color, setColor] = useState<'black' | 'white'>('black')
  const [stamp, setStamp] = useState(false)
  const [dpi, setDpi] = useState<Dpi>('200')
  const [onlyMarked, setOnlyMarked] = useState(true)
  const [result, setResult] = useState<Blob | null>(null)
  const finder = useJob()
  const job = useJob()

  const pageItems = items[cur] ?? []
  const all = useMemo(() => Object.entries(items).flatMap(([p, l]) => l.map((it) => ({ ...it, page: +p }))), [items])
  const fill = color === 'black' ? '#000000' : '#ffffff'
  const shown = (l: Item[]) => l.map((it) => ({ ...it, fill, color: color === 'black' ? '#000000' : '#64748b', strokeWidth: color === 'white' && !preview ? 1 : 0, opacity: preview ? 1 : 0.72 }))
  const custom = buildCustom(regex, words, whole, caseSens)

  const reset = () => { setFile(null); hist.reset({}); setCur(0); setSel(null); setResult(null); setFound(null) }
  const updatePage = useCallback((fn: (l: Item[]) => Item[]) => hist.update((a) => ({ ...a, [cur]: fn(a[cur] ?? []) })), [cur, hist.update])
  const removeItem = (page: number, id: string) => hist.apply((a) => ({ ...a, [page]: (a[page] ?? []).filter((i) => i.id !== id) }))

  useEffect(() => {
    if (!file) return
    const h = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT')) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? hist.redo() : hist.undo() }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); hist.redo() }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeItem(cur, sel); setSel(null) }
      else if (!mod && e.key.toLowerCase() === 'r') setTool('rect')
      else if (!mod && e.key.toLowerCase() === 'v') setTool('select')
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })

  async function autoFind() {
    if (!doc) return
    if (custom.error) return
    if (!presets.size && !custom.res.length) { toast('Pick at least one thing to find', 'info'); return }
    const matches = await finder.run((p) => findMatches(doc, [...presets], custom.res, p))
    if (!matches) return
    let added = 0
    hist.apply((a) => {
      const next: PageItems = { ...a }
      for (const m of matches) {
        const existing = next[m.page] ?? []
        const newOnes: Item[] = m.boxes
          .filter((b) => !existing.some((e) => Math.abs(e.x - b.x) < 1 && Math.abs(e.y - b.y) < 1 && Math.abs(e.w - b.w) < 1))
          .map((b) => ({ id: uid(), type: 'rect', ...b, label: `${m.kind}: ${m.text}`, fill: '#000', strokeWidth: 0 }))
        added += newOnes.length
        next[m.page] = [...existing, ...newOnes]
      }
      return next
    })
    setFound(matches.length)
    if (!matches.length) toast(pages.length && !(await hasText(doc)) ? 'No selectable text found, this looks like a scanned PDF. Run OCR PDF first or draw boxes manually.' : 'No matches found', 'info')
    else toast(`Marked ${matches.length} match${matches.length === 1 ? '' : 'es'} for redaction`)
    if (matches.length && !(items[cur]?.length)) { const first = matches[0].page; setCur(first) }
    void added
  }

  async function apply() {
    if (!file) return
    const out = await job.run(async (p) => {
      const { PDFDocument } = await import('pdf-lib')
      const src = await openPdfJs(file)
      const srcLib = onlyMarked ? await PDFDocument.load(await plainBytes(file), { ignoreEncryption: true }) : null
      const outDoc = await PDFDocument.create()
      const scale = +dpi / 72
      const n = src.numPages
      for (let i = 0; i < n; i++) {
        const boxes = items[i] ?? []
        if (onlyMarked && !boxes.length && srcLib) {
          const [cp] = await outDoc.copyPages(srcLib, [i]); outDoc.addPage(cp)
        } else {
          const page = await src.getPage(i + 1)
          const vp = page.getViewport({ scale: 1 })
          const c = await renderPage(src, i + 1, scale)
          const ctx = c.getContext('2d')!
          for (const b of boxes) {
            ctx.fillStyle = fill
            ctx.fillRect(Math.floor(b.x * scale), Math.floor(b.y * scale), Math.ceil(b.w * scale) + 1, Math.ceil(b.h * scale) + 1)
            if (stamp && b.h * scale > 14) {
              const fs = Math.min(b.h * scale * 0.6, 28 * scale / 2)
              ctx.font = `bold ${fs}px Helvetica, Arial, sans-serif`
              const txt = 'REDACTED'
              if (ctx.measureText(txt).width < b.w * scale - 4) {
                ctx.fillStyle = color === 'black' ? '#ffffff' : '#94a3b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
                ctx.fillText(txt, (b.x + b.w / 2) * scale, (b.y + b.h / 2) * scale)
              }
            }
          }
          const blob: Blob = await new Promise((r, j) => c.toBlob((bb) => (bb ? r(bb) : j(new Error('Render failed'))), 'image/jpeg', 0.92))
          const img = await outDoc.embedJpg(new Uint8Array(await blob.arrayBuffer()))
          outDoc.addPage([vp.width, vp.height]).drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height })
          c.width = c.height = 0
        }
        p((i + 1) / n)
      }
      void src.loadingTask.destroy()
      outDoc.setProducer('OpenFile'); outDoc.setCreator('OpenFile Redact')
      return pdfBlob(await outDoc.save())
    })
    if (out) { setResult(out); toast('Redactions applied permanently') }
  }

  if (!file) return <Dropzone accept="application/pdf,.pdf" onFiles={(f) => setFile(f[0])} label="Drop a PDF to redact" sub="Hidden text is truly removed, pages are flattened, not just covered." />

  if (result) return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <ResultCard blob={result} filename={renameExt(file.name, 'pdf', '-redacted')} originalSize={file.size} title={`${all.length} redaction${all.length === 1 ? '' : 's'} applied`} onReset={reset}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4 text-success" />Redacted pages were flattened to images, so the hidden text can't be copied or recovered.</span>
          <button className="text-xs hover:text-fg hover:underline cursor-pointer" onClick={() => setResult(null)}>Back to editing</button>
        </div>
      </ResultCard>
    </motion.div>
  )

  const page = pages[cur]
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-3">
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-surface/90 p-1.5 shadow-sm backdrop-blur">
          <ToolBtn title="Draw redaction box (R)" active={tool === 'rect'} onClick={() => { setTool('rect'); setSel(null) }}><SquareDashed className="size-4" /></ToolBtn>
          <ToolBtn title="Select / move boxes (V)" active={tool === 'select'} onClick={() => setTool('select')}><MousePointer2 className="size-4" /></ToolBtn>
          <div className="mx-1 h-6 w-px bg-border" />
          <ToolBtn title="Undo" disabled={!hist.canUndo} onClick={hist.undo}><Undo2 className="size-4" /></ToolBtn>
          <ToolBtn title="Redo" disabled={!hist.canRedo} onClick={hist.redo}><Redo2 className="size-4" /></ToolBtn>
          <ToolBtn title="Delete selected box" disabled={!sel} onClick={() => { if (sel) { removeItem(cur, sel); setSel(null) } }} className="hover:!text-danger"><Trash2 className="size-4" /></ToolBtn>
          <div className="ml-auto flex items-center gap-2 pr-1">
            <button type="button" onClick={() => setPreview((v) => !v)} className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition cursor-pointer', preview ? 'bg-fg text-bg' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
              {preview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}{preview ? 'Final preview' : 'Preview'}
            </button>
          </div>
        </div>
        <ErrorNote error={loadErr} />
        {page ? (
          <div className="overflow-auto rounded-2xl border border-border bg-surface-2/50 p-3 sm:p-6 checker">
            <div className="mx-auto" style={{ maxWidth: Math.round(Math.min(820, page.w * 1.35)) }}>
              <PageEditor page={page} items={shown(pageItems)} selectedId={sel} tool={preview ? 'select' : tool} style={{ fill: '#000', strokeWidth: 0, color: '#000' }}
                onSelect={setSel} update={(fn) => updatePage((l) => fn(l).map((it) => ({ ...it, type: 'rect' })))} commit={hist.commit} />
            </div>
          </div>
        ) : !loadErr && <div className="grid h-96 place-items-center rounded-2xl border border-border bg-surface-2/40"><Spinner label="Rendering pages…" /></div>}
        {total > 0 && <PageNav pages={pages} total={total} current={cur} onChange={(i) => { setCur(i); setSel(null) }}
          badge={(i) => items[i]?.length ? <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-fg px-1 text-[9px] font-bold text-bg">{items[i].length}</span> : null} />}
        <p className="text-xs text-muted">Drag on the page to cover anything, text, images, signatures. Switch to select to move or resize boxes; press <b>Delete</b> to remove one.</p>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          <FileChip file={file} onRemove={reset} extra={loading ? <Spinner /> : undefined} />
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'auto', label: 'Auto-find' }, { value: 'options', label: `Marked (${all.length})` }]} />
          <AnimatePresence mode="wait">
            {tab === 'auto' ? (
              <motion.div key="auto" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                <div className="grid grid-cols-2 gap-1.5">
                  {PRESETS.map((p) => {
                    const on = presets.has(p.id)
                    return (
                      <button key={p.id} type="button" title={p.example} onClick={() => setPresets((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}
                        className={cn('rounded-lg border px-2 py-1.5 text-left text-xs transition cursor-pointer', on ? 'border-accent bg-accent/10 text-fg' : 'border-border text-muted hover:border-accent/40')}>
                        <span className="block font-medium">{p.label}</span><span className="block truncate font-mono text-[10px] opacity-70">{p.example}</span>
                      </button>
                    )
                  })}
                </div>
                <div>
                  <Label>Custom words or names</Label>
                  <Textarea value={words} onChange={(e) => setWords(e.target.value)} placeholder={'John Smith, Acme Corp\nProject Falcon'} className="min-h-16 font-sans" />
                </div>
                <div>
                  <Label>Custom regex</Label>
                  <Input value={regex} onChange={(e) => setRegex(e.target.value)} placeholder="e.g. INV-\d{6}" className="font-mono" />
                  {custom.error && <div className="mt-1 text-xs text-danger">{custom.error}</div>}
                </div>
                <div className="flex flex-wrap gap-4">
                  <Switch checked={whole} onChange={setWhole} label={<span className="text-xs">Whole words</span>} />
                  <Switch checked={caseSens} onChange={setCaseSens} label={<span className="text-xs">Match case</span>} />
                </div>
                {finder.busy && <Progress value={finder.progress} label="Scanning text…" />}
                <ErrorNote error={finder.error} />
                <Button variant="outline" className="w-full" icon={<ScanSearch className="size-4" />} loading={finder.busy} disabled={!doc || !!custom.error} onClick={autoFind}>Find & mark</Button>
                {found !== null && <div className="text-center text-xs text-muted">{found ? `${found} match${found === 1 ? '' : 'es'} marked, review them on each page.` : 'Nothing found with these settings.'}</div>}
              </motion.div>
            ) : (
              <motion.div key="list" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-2">
                {all.length === 0 ? <Empty>No redactions yet. Draw boxes or use Auto-find.</Empty> : (
                  <>
                    <ul className="max-h-72 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
                      {all.map((it) => (
                        <li key={it.id} className={cn('group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition cursor-pointer', sel === it.id ? 'bg-accent/10' : 'hover:bg-surface-2')} onClick={() => { setCur(it.page); setTool('select'); setSel(it.id) }}>
                          <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">p{it.page + 1}</span>
                          <span className="min-w-0 flex-1 truncate">{it.label ?? 'Manual box'}</span>
                          <button onClick={(e) => { e.stopPropagation(); removeItem(it.page, it.id) }} className="rounded p-0.5 text-muted hover:text-danger cursor-pointer" aria-label="Remove"><X className="size-3.5" /></button>
                        </li>
                      ))}
                    </ul>
                    <Button size="sm" variant="ghost" className="w-full" icon={<Trash2 className="size-3.5" />} onClick={() => { hist.apply({}); setSel(null) }}>Clear all</Button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-3 border-t border-border pt-4">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Fill</Label><Select value={color} onChange={setColor} options={[{ value: 'black', label: 'Black bars' }, { value: 'white', label: 'White (blank)' }]} /></div>
              <div><Label>Quality</Label><Select value={dpi} onChange={setDpi} options={[{ value: '150', label: '150 DPI' }, { value: '200', label: '200 DPI' }, { value: '300', label: '300 DPI' }]} /></div>
            </div>
            <Switch checked={stamp} onChange={setStamp} label={<span className="text-sm">Label boxes “REDACTED”</span>} />
            <Switch checked={onlyMarked} onChange={setOnlyMarked} label={<span className="text-sm">Keep unmarked pages as-is</span>} />
            <p className="text-xs text-muted">Pages with redactions are flattened to images so the covered text is gone for good.{!onlyMarked && ' All pages will be flattened.'}</p>
          </div>
          {job.busy && <Progress value={job.progress} label="Flattening pages…" />}
          <ErrorNote error={job.error} />
          <Button size="lg" className="w-full" icon={<EyeOff className="size-4" />} loading={job.busy} disabled={!all.length || loading} onClick={apply}>
            {all.length ? `Apply ${all.length} redaction${all.length === 1 ? '' : 's'}` : 'Mark something to redact'}
          </Button>
          {!all.length && <div className="flex items-center justify-center gap-1.5 text-xs text-muted"><Search className="size-3" />Tip: Auto-find catches emails, phones, cards & IDs.</div>}
        </div>
      </aside>
    </div>
  )
}

async function hasText(doc: any) {
  for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
    const tc = await (await doc.getPage(i)).getTextContent()
    if ((tc.items as any[]).some((x) => x.str?.trim())) return true
  }
  return false
}
