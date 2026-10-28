import { useEffect, useRef, useState } from 'react'
import { Bookmark as BookmarkIcon, Plus, Trash2, IndentIncrease, IndentDecrease, ArrowUp, ArrowDown, Wand2, ChevronRight, Save } from 'lucide-react'
import { Button, Dropzone, ResultCard, Switch, ToolGrid, Progress, ErrorNote, Input, Spinner, Empty, cn, useJob } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT, PageStepper, usePdfDoc, usePageImage } from './_core/kit'
import { core, readBytes, Note, uid } from './_b1/ui'

type Item = { id: string; title: string; page: number; level: number; open: boolean }

export default function PdfBookmarks() {
  const [file, setFile] = useState<File | null>(null)
  const { doc, numPages, error } = usePdfDoc(file)
  const [items, setItems] = useState<Item[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [view, setView] = useState(0)
  const img = usePageImage(doc, view + 1, 560)
  const [showPanel, setShowPanel] = useState(true)
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob(), auto = useJob()
  const reset = () => { setFile(null); setItems(null); setResult(null); setSel(null); setView(0) }
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!file) return
    ;(async () => { const C = await core(); const d = await C.open(await readBytes(file)); setItems(C.readOutline(d).map((b) => ({ ...b, id: uid(), open: !!b.open }))) })().catch((e) => job.setError(e.message))
  }, [file]) // eslint-disable-line

  const upd = (fn: (a: Item[]) => Item[]) => { setItems((x) => (x ? fn(x) : x)); setResult(null) }
  const idx = items?.findIndex((i) => i.id === sel) ?? -1
  const add = () => { const it: Item = { id: uid(), title: `Page ${view + 1}`, page: view, level: idx >= 0 ? items![idx].level : 0, open: false }; upd((a) => { const b = [...a]; b.splice(idx >= 0 ? idx + 1 : b.length, 0, it); return b }); setSel(it.id) }
  const shift = (d: number) => { if (idx < 0) return; upd((a) => a.map((x, i) => i !== idx ? x : { ...x, level: Math.max(0, Math.min(d > 0 ? (i > 0 ? a[i - 1].level + 1 : 0) : 9, x.level + d)) })) }
  const move = (d: number) => {
    if (idx < 0) return
    upd((a) => { const j = idx + d; if (j < 0 || j >= a.length) return a; const b = [...a]; [b[idx], b[j]] = [b[j], b[idx]]; if (b[0].level > 0) b[0] = { ...b[0], level: 0 }; return b })
  }
  const remove = () => { if (idx < 0) return; upd((a) => a.filter((_, i) => i !== idx)); setSel(items![idx + 1]?.id ?? items![idx - 1]?.id ?? null) }
  const autoBuild = () => auto.run(async (setP) => {
    if (!file) return
    const { loadLayout, headingOutline } = await import('../convert/_b1/extract')
    const { pages } = await loadLayout(file, (p) => setP(p * 0.95))
    const found = headingOutline(pages)
    if (!found.length) { toast('No headings found. The text may be scanned or all one size.', 'info'); return }
    upd(() => found.map((f) => ({ ...f, id: uid(), open: f.level === 0 })))
    toast(`Found ${found.length} headings`, 'success')
  })
  const save = () => job.run(async (setP) => {
    if (!file || !items) return
    const C = await core(); setP(0.3)
    const d = await C.open(await readBytes(file)); C.assertNotEncrypted(d)
    C.writeOutline(d, items.map((i) => ({ title: i.title.trim() || 'Untitled', page: i.page, level: i.level, open: i.open })), showPanel)
    setResult(pdfBlob(await d.save())); setP(1); toast('Bookmarks saved', 'success')
  })
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && idx >= 0 && e.target instanceof HTMLInputElement && e.target.getAttribute('aria-label') === 'Bookmark title') { e.preventDefault(); shift(e.shiftKey ? -1 : 1) }
  }

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to edit its bookmarks" />
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {error && <ErrorNote error={error} />}
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-bookmarks.pdf`} title="PDF with new bookmarks" onReset={reset} />}
      <ToolGrid
        main={<div className="grid gap-4 xl:grid-cols-[1fr_300px]">
          <div className="rounded-2xl border border-border bg-surface p-3" onKeyDown={onKey} ref={listRef}>
            <div className="mb-2 flex flex-wrap items-center gap-1">
              <Button size="sm" icon={<Plus className="size-3.5" />} onClick={add}>Add</Button>
              <Button size="sm" variant="ghost" icon={<IndentDecrease className="size-3.5" />} disabled={idx < 0} onClick={() => shift(-1)} aria-label="Outdent" />
              <Button size="sm" variant="ghost" icon={<IndentIncrease className="size-3.5" />} disabled={idx < 0} onClick={() => shift(1)} aria-label="Indent" />
              <Button size="sm" variant="ghost" icon={<ArrowUp className="size-3.5" />} disabled={idx <= 0} onClick={() => move(-1)} aria-label="Move up" />
              <Button size="sm" variant="ghost" icon={<ArrowDown className="size-3.5" />} disabled={idx < 0 || idx >= (items?.length ?? 0) - 1} onClick={() => move(1)} aria-label="Move down" />
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} disabled={idx < 0} onClick={remove} aria-label="Delete" />
              <div className="flex-1" />
              <Button size="sm" variant="outline" icon={<Wand2 className="size-3.5" />} loading={auto.busy} onClick={autoBuild}>Build from headings</Button>
            </div>
            {auto.busy && <div className="mb-2"><Progress value={auto.progress} label="Reading headings…" /></div>}
            {!items ? <Spinner label="Reading outline…" /> : !items.length ? <Empty>No bookmarks yet. Add one for the page on the right, or build them from the headings in the text.</Empty> : (
              <div className="max-h-[60vh] space-y-1 overflow-auto pr-1 scrollbar-thin">
                {items.map((it, i) => (
                  <div key={it.id} onClick={() => { setSel(it.id); setView(it.page) }} className={cn('flex items-center gap-2 rounded-lg border px-2 py-1.5 transition', sel === it.id ? 'border-accent bg-accent/5' : 'border-transparent hover:bg-surface-2')} style={{ marginLeft: it.level * 18 }}>
                    <button type="button" aria-label={it.open ? 'Show collapsed' : 'Show expanded'} title="Expanded when the file opens" onClick={(e) => { e.stopPropagation(); upd((a) => a.map((x) => x.id === it.id ? { ...x, open: !x.open } : x)) }} className={cn('rounded p-0.5 text-muted transition cursor-pointer', it.open && 'rotate-90 text-accent', !(items[i + 1]?.level > it.level) && 'invisible')}><ChevronRight className="size-3.5" /></button>
                    <Input value={it.title} onFocus={() => { setSel(it.id); setView(it.page) }} onChange={(e) => upd((a) => a.map((x) => x.id === it.id ? { ...x, title: e.target.value } : x))} className="h-8 flex-1" aria-label="Bookmark title" />
                    <label className="flex items-center gap-1 text-xs text-muted">p.<Input type="number" min={1} max={numPages} value={it.page + 1} onChange={(e) => { const p = Math.max(0, Math.min(numPages - 1, Number(e.target.value) - 1)); upd((a) => a.map((x) => x.id === it.id ? { ...x, page: p } : x)); setView(p) }} className="h-8 w-16" aria-label="Target page" /></label>
                  </div>
                ))}
              </div>)}
            <div className="mt-2 text-xs text-muted">Tip: press Tab or Shift+Tab inside a title to indent or outdent it.</div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium text-muted">Page {view + 1}</span>{numPages > 1 && <PageStepper page={view} total={numPages} onChange={setView} />}</div>
            <div className="checker flex min-h-60 items-center justify-center rounded-xl p-2">{img ? <img src={img.src} alt="" className="max-h-[55vh] max-w-full bg-white shadow-xl" /> : <Spinner />}</div>
            {sel && <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => upd((a) => a.map((x) => x.id === sel ? { ...x, page: view } : x))}>Point selected bookmark here</Button>}
          </div>
        </div>}
        side={<>
          <div className="text-sm"><span className="font-mono text-lg font-bold">{items?.length ?? 0}</span> <span className="text-muted">bookmarks</span></div>
          <Switch checked={showPanel} onChange={(v) => { setShowPanel(v); setResult(null) }} label="Open the bookmarks panel when the file opens" />
          <Note>Saving replaces the whole outline with this list. Each bookmark jumps to the top of its page.</Note>
          {job.busy && <Progress value={job.progress} label="Saving…" />}
          <ErrorNote error={job.error || auto.error} />
          <Button className="w-full" size="lg" icon={<Save className="size-5" />} loading={job.busy} disabled={!items} onClick={save}>Save bookmarks</Button>
        </>}
      />
    </div>
  )
}
