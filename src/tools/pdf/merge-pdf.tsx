import { useCallback, useState } from 'react'
import { GripVertical, X, RotateCw, ArrowDownAZ, ArrowUpDown, Combine, Plus, AlertTriangle } from 'lucide-react'
import { Button, Dropzone, Field, Input, ResultCard, Switch, ToolGrid, Progress, ErrorNote, useJob, cn } from '@/components/ui'
import { openPdfJs, renderPage, pdfBlob } from '@/lib/pdf'
import { formatBytes, parsePageRanges } from '@/lib/files'
import { toast } from '@/components/toast'
import { PDF_ACCEPT, friendly, closeDoc, ops, readBytes, motion, AnimatePresence } from './_core/kit'
import { SortableArea, SortableItem } from './_core/sortable'

type Item = { id: string; file: File; pages: number; thumb?: string; range: string; rotate: number; error?: string }
let uid = 0

export default function MergePdf() {
  const [items, setItems] = useState<Item[]>([])
  const [bookmarks, setBookmarks] = useState(true)
  const [name, setName] = useState('merged.pdf')
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()

  const add = useCallback(async (files: File[]) => {
    setResult(null)
    const fresh: Item[] = files.map((f) => ({ id: `m${++uid}`, file: f, pages: 0, range: '', rotate: 0 }))
    setItems((s) => [...s, ...fresh])
    for (const it of fresh) {
      try {
        const d = await openPdfJs(it.file)
        const c = await renderPage(d, 1, 0.45)
        const patch = { pages: d.numPages, thumb: c.toDataURL('image/jpeg', 0.75) }
        closeDoc(d)
        setItems((s) => s.map((x) => (x.id === it.id ? { ...x, ...patch } : x)))
      } catch (e) {
        setItems((s) => s.map((x) => (x.id === it.id ? { ...x, error: friendly(e) } : x)))
      }
    }
  }, [])

  const update = (id: string, p: Partial<Item>) => { setResult(null); setItems((s) => s.map((x) => (x.id === id ? { ...x, ...p } : x))) }
  const remove = (id: string) => { setResult(null); setItems((s) => s.filter((x) => x.id !== id)) }
  const reset = () => { setItems([]); setResult(null); job.setError(null) }

  const valid = items.filter((i) => !i.error)
  const countFor = (i: Item) => (i.range.trim() ? parsePageRanges(i.range, i.pages).length : i.pages)
  const totalPages = valid.reduce((a, i) => a + countFor(i), 0)
  const totalSize = items.reduce((a, i) => a + i.file.size, 0)

  const merge = () => job.run(async (setP) => {
    if (valid.length < 1) throw new Error('Add at least one readable PDF.')
    const o = await ops()
    const inputs = []
    for (const it of valid) {
      const idx = it.range.trim() ? parsePageRanges(it.range, it.pages) : undefined
      if (idx && !idx.length) throw new Error(`"${it.file.name}": the range "${it.range}" matches no pages (it has ${it.pages}).`)
      inputs.push({ name: it.file.name, bytes: await readBytes(it.file), indices: idx, rotate: it.rotate })
    }
    const out = await o.merge(inputs, { bookmarks, onProgress: (p) => setP(p * 0.95) })
    setResult(pdfBlob(out)); setP(1)
    toast(`Merged ${valid.length} file${valid.length > 1 ? 's' : ''} · ${totalPages} pages`, 'success')
  })

  if (!items.length) return <Dropzone accept={PDF_ACCEPT} multiple onFiles={add} label="Drop PDFs to merge, or click to browse" sub="Add as many as you like, reorder them by dragging. Files never leave your device." />

  const fileName = /\.pdf$/i.test(name) ? name : `${name || 'merged'}.pdf`

  return (
    <div className="space-y-4">
      <ToolGrid
        main={<>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-muted"><span className="font-semibold text-fg">{items.length}</span> file{items.length > 1 ? 's' : ''} · {totalPages} pages · {formatBytes(totalSize)}</div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" icon={<ArrowDownAZ className="size-4" />} onClick={() => setItems((s) => [...s].sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true })))}>Sort A–Z</Button>
              <Button size="sm" variant="ghost" icon={<ArrowUpDown className="size-4" />} onClick={() => setItems((s) => [...s].reverse())}>Reverse</Button>
            </div>
          </div>
          <SortableArea items={items} getId={(i) => i.id} onReorder={(n) => { setItems(n); setResult(null) }} layout="list" className="space-y-2"
            renderOverlay={(it) => <Row it={it} index={items.indexOf(it)} overlay />}>
            <AnimatePresence initial={false}>
              {items.map((it, idx) => (
                <motion.div key={it.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.18 }}>
                  <SortableItem id={it.id} handle>
                    {({ handleProps }) => <Row it={it} index={idx} handleProps={handleProps} onRemove={() => remove(it.id)} onChange={(p) => update(it.id, p)} count={countFor(it)} />}
                  </SortableItem>
                </motion.div>
              ))}
            </AnimatePresence>
          </SortableArea>
          <Dropzone compact accept={PDF_ACCEPT} multiple onFiles={add} label={<span className="inline-flex items-center gap-1.5"><Plus className="size-4" />Add more PDFs</span>} sub="Drop here or click" />
        </>}
        side={<>
          <Field label="Output filename"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Switch checked={bookmarks} onChange={setBookmarks} label="Add a bookmark for each file" />
          <div className="rounded-xl bg-surface-2/60 p-3 text-xs leading-relaxed text-muted">
            Drag the <GripVertical className="inline size-3.5" /> handle to reorder. Leave a page range empty to include every page, or type e.g. <span className="font-mono text-fg">1-3, 7</span>.
          </div>
          {job.busy && <Progress value={job.progress} label="Merging…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<Combine className="size-5" />} loading={job.busy} disabled={!valid.length || !totalPages} onClick={merge}>
            Merge {valid.length > 1 ? `${valid.length} PDFs` : 'PDF'}
          </Button>
        </>}
      />
      {result && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><ResultCard blob={result} filename={fileName} title={`Merged ${totalPages} pages`} onReset={reset} /></motion.div>}
    </div>
  )
}

function Row({ it, index, handleProps, onRemove, onChange, count, overlay }: { it: Item; index: number; handleProps?: Record<string, any>; onRemove?: () => void; onChange?: (p: Partial<Item>) => void; count?: number; overlay?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl border bg-surface p-2.5 pr-3 transition', it.error ? 'border-danger/40' : 'border-border hover:border-accent/40', overlay && 'ring-2 ring-accent')}>
      <button type="button" {...handleProps} className="cursor-grab touch-none rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg active:cursor-grabbing" aria-label="Drag to reorder"><GripVertical className="size-4" /></button>
      <div className="relative grid h-[72px] w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-2">
        {it.thumb ? <img src={it.thumb} alt="" className="max-h-full max-w-full bg-white shadow transition-transform duration-300" style={{ transform: `rotate(${it.rotate}deg)` }} />
          : it.error ? <AlertTriangle className="size-5 text-danger" /> : <div className="size-5 animate-pulse rounded bg-border" />}
        <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 text-[10px] font-bold text-white">{index + 1}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-baseline gap-2"><div className="truncate text-sm font-medium">{it.file.name}</div></div>
        {it.error ? <div className="text-xs text-danger">{it.error}</div> : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">{formatBytes(it.file.size)} · {it.pages ? `${it.pages} page${it.pages > 1 ? 's' : ''}` : '…'}</span>
            {onChange && <input value={it.range} onChange={(e) => onChange({ range: e.target.value })} placeholder="All pages" aria-label="Page range"
              className="h-7 w-32 rounded-lg border border-border bg-surface-2/60 px-2 font-mono text-xs outline-none focus:border-accent" />}
            {it.range.trim() && count !== undefined && <span className={cn('text-xs', count ? 'text-accent' : 'text-danger')}>{count} selected</span>}
          </div>
        )}
      </div>
      {onChange && !it.error && <button type="button" onClick={() => onChange({ rotate: (it.rotate + 90) % 360 })} title="Rotate this file" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-accent cursor-pointer"><RotateCw className="size-4" /></button>}
      {onRemove && <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger cursor-pointer" aria-label="Remove"><X className="size-4" /></button>}
    </div>
  )
}
