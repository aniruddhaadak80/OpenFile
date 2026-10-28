import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCw, RotateCcw, Copy, Trash2, FilePlus2, Undo2, Redo2, Plus, LayoutGrid, MousePointerClick, FileStack } from 'lucide-react'
import { Button, Dropzone, ResultCard, ToolGrid, Progress, ErrorNote, Spinner, useJob, cn } from '@/components/ui'
import { openPdfJs, renderPage, pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT, Thumb, ThumbAction, friendly, ops, readBytes, closeDoc, motion } from './_core/kit'
import { SortableArea, SortableItem } from './_core/sortable'

type Item = { id: string; kind: 'page'; src: number; page: number; rotate: number } | { id: string; kind: 'blank'; w: number; h: number; rotate: number }
type Source = { file: File; thumbs: string[]; sizes: [number, number][]; pages: number; hue: number }
let uid = 0
const nid = () => `o${++uid}`

export default function OrganizePdf() {
  const [sources, setSources] = useState<Source[]>([])
  const [hist, setHist] = useState<{ items: Item[]; past: Item[][]; future: Item[][] }>({ items: [], past: [], future: [] })
  const { items, past, future } = hist
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<string | null>(null)
  const [result, setResult] = useState<Blob | null>(null)
  const srcCount = useRef(0)
  const job = useJob()

  const commit = useCallback((next: Item[] | ((cur: Item[]) => Item[])) => {
    setHist((h) => ({ items: typeof next === 'function' ? next(h.items) : next, past: [...h.past.slice(-80), h.items], future: [] }))
    setResult(null)
  }, [])
  const undo = useCallback(() => { setHist((h) => (h.past.length ? { items: h.past[h.past.length - 1], past: h.past.slice(0, -1), future: [h.items, ...h.future] } : h)); setResult(null) }, [])
  const redo = useCallback(() => { setHist((h) => (h.future.length ? { items: h.future[0], past: [...h.past, h.items], future: h.future.slice(1) } : h)); setResult(null) }, [])

  const addFile = useCallback(async (files: File[]) => {
    for (const file of files) {
      setLoading(`Reading ${file.name}…`)
      try {
        const d = await openPdfJs(file)
        const srcIdx = srcCount.current++
        setSources((s) => [...s, { file, thumbs: [], sizes: [], pages: d.numPages, hue: [40, 199, 152, 20, 175][srcIdx % 5] }])
        const newItems: Item[] = Array.from({ length: d.numPages }, (_, i) => ({ id: nid(), kind: 'page', src: srcIdx, page: i, rotate: 0 }))
        if (srcIdx === 0) setHist({ items: newItems, past: [], future: [] }); else commit((cur) => [...cur, ...newItems])
        const thumbs: string[] = [], sizes: [number, number][] = []
        for (let i = 1; i <= d.numPages; i++) {
          const p = await d.getPage(i); const vp = p.getViewport({ scale: 1 })
          sizes.push([vp.width, vp.height])
          const c = await renderPage(d, i, Math.min(0.5, 220 / vp.width))
          thumbs.push(c.toDataURL('image/jpeg', 0.72))
          if (i % 4 === 0 || i === d.numPages) { const t = [...thumbs], z = [...sizes]; setSources((s) => s.map((x, k) => (k === srcIdx ? { ...x, thumbs: t, sizes: z } : x))) }
        }
        closeDoc(d)
      } catch (e) { toast(`${file.name}: ${friendly(e)}`, 'error') }
    }
    setLoading(null)
  }, [commit])

  const reset = () => { srcCount.current = 0; setSources([]); setHist({ items: [], past: [], future: [] }); setSel(new Set()); setResult(null) }

  const targets = (id?: string) => (id ? [id] : [...sel])
  const rotate = (deg: number, id?: string) => { const t = new Set(targets(id)); if (!t.size) return; commit((cur) => cur.map((x) => (t.has(x.id) ? { ...x, rotate: (x.rotate + deg + 360) % 360 } : x))) }
  const remove = (id?: string) => { const t = new Set(targets(id)); if (!t.size) return; commit((cur) => cur.filter((x) => !t.has(x.id))); setSel((s) => { const n = new Set(s); t.forEach((i) => n.delete(i)); return n }) }
  const duplicate = (id?: string) => { const t = new Set(targets(id)); if (!t.size) return; commit((cur) => cur.flatMap((x) => (t.has(x.id) ? [x, { ...x, id: nid() }] : [x]))) }
  const sizeOf = (it?: Item): [number, number] => {
    if (!it) return [595.28, 841.89]
    if (it.kind === 'blank') return [it.w, it.h]
    const s = sources[it.src]?.sizes[it.page] ?? [595.28, 841.89]
    return it.rotate % 180 ? [s[1], s[0]] : s
  }
  const insertBlank = (id?: string) => commit((cur) => {
    const t = id ? [id] : [...sel]
    if (!t.length) { const [w, h] = sizeOf(cur[cur.length - 1]); return [...cur, { id: nid(), kind: 'blank', w, h, rotate: 0 }] }
    const ts = new Set(t)
    return cur.flatMap((x) => { if (!ts.has(x.id)) return [x]; const [w, h] = sizeOf(x); return [x, { id: nid(), kind: 'blank' as const, w, h, rotate: 0 }] })
  })
  const toggle = (id: string, _e?: React.MouseEvent) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea')) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
      else if (mod && e.key.toLowerCase() === 'a' && items.length) { e.preventDefault(); setSel(new Set(items.map((i) => i.id))) }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) { e.preventDefault(); remove() }
      else if (e.key === 'Escape') setSel(new Set())
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })

  const save = () => job.run(async (setP) => {
    if (!items.length) throw new Error('There are no pages left, undo or add a PDF.')
    const o = await ops()
    const bytes = await Promise.all(sources.map((s) => readBytes(s.file)))
    setP(0.3)
    const out = await o.organize(bytes, items.map((it) => (it.kind === 'blank' ? { kind: 'blank' as const, w: it.w, h: it.h, rotate: it.rotate } : { kind: 'page' as const, src: it.src, page: it.page, rotate: it.rotate })))
    setResult(pdfBlob(out)); setP(1); toast('Document saved', 'success')
  })

  if (!sources.length) return loading ? <div className="grid min-h-60 place-items-center"><Spinner label={loading} /></div> : <Dropzone accept={PDF_ACCEPT} onFiles={addFile} label="Drop a PDF to organize" />

  const renderTile = (it: Item, idx: number, dragging = false) => {
    const src = it.kind === 'page' ? sources[it.src] : null
    const label = it.kind === 'blank' ? 'Blank' : sources.length > 1 ? `${String.fromCharCode(65 + it.src)}·${it.page + 1}` : `Page ${it.page + 1}`
    return (
      <Thumb src={it.kind === 'page' ? src?.thumbs[it.page] : undefined} rotation={it.rotate} selected={sel.has(it.id)} onClick={(e) => toggle(it.id, e)} className={cn(dragging && 'ring-4 ring-accent/40')}
        label={<span className="inline-flex items-center gap-1"><span className="font-mono text-fg/70">{idx + 1}</span><span className="opacity-60">·</span>{label}</span>}
        badge={src && sources.length > 1 ? <span className="absolute left-1.5 top-1.5 size-2.5 rounded-full" style={{ background: `hsl(${src.hue} 75% 55%)` }} /> : null}>
        {it.kind === 'blank' && <div className="pointer-events-none absolute inset-2 bottom-7 grid place-items-center"><div className="grid h-full max-h-[85%] aspect-[3/4] place-items-center rounded-sm bg-white text-[10px] text-neutral-400 shadow" style={{ transform: `rotate(${it.rotate}deg)` }}>blank</div></div>}
        <div className="absolute inset-x-0 bottom-8 flex justify-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100">
          <ThumbAction title="Rotate left" onClick={() => rotate(-90, it.id)}><RotateCcw className="size-3.5" /></ThumbAction>
          <ThumbAction title="Rotate right" onClick={() => rotate(90, it.id)}><RotateCw className="size-3.5" /></ThumbAction>
          <ThumbAction title="Duplicate" onClick={() => duplicate(it.id)}><Copy className="size-3.5" /></ThumbAction>
          <ThumbAction title="Insert blank after" onClick={() => insertBlank(it.id)}><FilePlus2 className="size-3.5" /></ThumbAction>
          <ThumbAction title="Delete" onClick={() => remove(it.id)} className="hover:!bg-danger"><Trash2 className="size-3.5" /></ThumbAction>
        </div>
      </Thumb>
    )
  }

  const n = sel.size
  return (
    <div className="space-y-4">
      <FileBar file={sources[0].file} pages={items.length} onReset={reset} extra={sources.length > 1 ? <span className="text-xs text-muted">+{sources.length - 1} more file{sources.length > 2 ? 's' : ''}</span> : null} />
      {result && <ResultCard blob={result} filename={`${baseName(sources[0].file.name)}-organized.pdf`} title={`Saved ${items.length} pages`} onReset={reset} />}
      <ToolGrid
        main={<>
          <div className="sticky top-16 z-10 flex flex-wrap items-center gap-1.5 rounded-2xl border border-border glass px-3 py-2">
            <Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />} disabled={!past.length} onClick={undo} title="Undo (Ctrl+Z)">Undo</Button>
            <Button size="sm" variant="ghost" icon={<Redo2 className="size-4" />} disabled={!future.length} onClick={redo} title="Redo (Ctrl+Shift+Z)">Redo</Button>
            <div className="mx-1 h-5 w-px bg-border" />
            <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} disabled={!n} onClick={() => rotate(-90)}><span className="max-sm:hidden">Left</span></Button>
            <Button size="sm" variant="ghost" icon={<RotateCw className="size-4" />} disabled={!n} onClick={() => rotate(90)}><span className="max-sm:hidden">Right</span></Button>
            <Button size="sm" variant="ghost" icon={<Copy className="size-4" />} disabled={!n} onClick={() => duplicate()}><span className="max-sm:hidden">Duplicate</span></Button>
            <Button size="sm" variant="ghost" icon={<FilePlus2 className="size-4" />} onClick={() => insertBlank()} title={n ? 'Insert a blank page after each selected page' : 'Append a blank page'}><span className="max-sm:hidden">Blank</span></Button>
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} disabled={!n} onClick={() => remove()} className="hover:!text-danger"><span className="max-sm:hidden">Delete</span></Button>
            <div className="ml-auto text-xs text-muted">{n ? <button className="cursor-pointer hover:text-fg" onClick={() => setSel(new Set())}>{n} selected · clear</button> : <button className="cursor-pointer hover:text-fg" onClick={() => setSel(new Set(items.map((i) => i.id)))}>Select all</button>}</div>
          </div>
          {loading && <Spinner label={loading} />}
          {items.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">All pages removed. Press <b>Undo</b> or add another PDF.</div> : (
            <SortableArea items={items} getId={(i) => i.id} onReorder={(nx) => commit(nx)} className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3"
              renderOverlay={(it) => <div className="w-[130px]">{renderTile(it, items.indexOf(it), true)}</div>}>
              {items.map((it, idx) => (
                <SortableItem key={it.id} id={it.id}>
                  {() => <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.16 }}>{renderTile(it, idx)}</motion.div>}
                </SortableItem>
              ))}
            </SortableArea>
          )}
        </>}
        side={<>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 font-medium"><LayoutGrid className="size-4 text-accent" />{items.length} page{items.length === 1 ? '' : 's'}</div>
            <ul className="space-y-1.5 text-xs text-muted">
              <li className="flex gap-2"><MousePointerClick className="size-3.5 shrink-0" />Drag to reorder · click pages to select, then use the toolbar</li>
              <li className="flex gap-2"><Undo2 className="size-3.5 shrink-0" />Ctrl+Z undo · Delete removes selected · Esc clears</li>
            </ul>
          </div>
          {sources.length > 1 && <div className="space-y-1">{sources.map((s, i) => <div key={i} className="flex items-center gap-2 text-xs text-muted"><span className="size-2.5 rounded-full" style={{ background: `hsl(${s.hue} 75% 55%)` }} /><span className="font-mono">{String.fromCharCode(65 + i)}</span><span className="truncate">{s.file.name}</span></div>)}</div>}
          <Dropzone compact accept={PDF_ACCEPT} onFiles={addFile} label={<span className="inline-flex items-center gap-1.5"><Plus className="size-4" />Add pages from a PDF</span>} sub="Appended at the end" />
          {job.busy && <Progress value={job.progress} label="Building PDF…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<FileStack className="size-5" />} loading={job.busy} disabled={!items.length || !!loading} onClick={save}>Save PDF</Button>
        </>}
      />
    </div>
  )
}
