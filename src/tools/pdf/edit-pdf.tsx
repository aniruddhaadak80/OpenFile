import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MousePointer2, Type, Square, Circle, Minus, MoveUpRight, Highlighter, Pencil, ImagePlus, Eraser, Undo2, Redo2, Trash2, Copy, ArrowUp, ArrowDown, Bold, Italic, Layers, Download, FileText } from 'lucide-react'
import { Button, Dropzone, FileChip, Label, Select, Slider, Spinner, ErrorNote, ResultCard, Progress, useJob, cn, Empty } from '@/components/ui'
import { toast } from '@/components/toast'
import { pdfBlob } from '@/lib/pdf'
import { renameExt, loadImage } from '@/lib/files'
import { usePdfPages, uid } from './_adv/pages'
import { useHistory } from './_adv/history'
import { PageEditor, type Tool } from './_adv/Editor'
import { burnItems, type Item, type PageItems, type FontKey } from './_adv/items'
import { ToolBtn, ColorPicker, PageNav, Kbd } from './_adv/ui'

const TOOLS: { id: Tool | 'image'; icon: React.ElementType; label: string; key: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select / move', key: 'v' },
  { id: 'text', icon: Type, label: 'Text box', key: 't' },
  { id: 'rect', icon: Square, label: 'Rectangle', key: 'r' },
  { id: 'ellipse', icon: Circle, label: 'Ellipse', key: 'e' },
  { id: 'line', icon: Minus, label: 'Line', key: 'l' },
  { id: 'arrow', icon: MoveUpRight, label: 'Arrow', key: 'a' },
  { id: 'highlight', icon: Highlighter, label: 'Highlight', key: 'h' },
  { id: 'pen', icon: Pencil, label: 'Freehand pen', key: 'p' },
  { id: 'image', icon: ImagePlus, label: 'Insert image', key: 'i' },
  { id: 'whiteout', icon: Eraser, label: 'Whiteout eraser', key: 'w' },
]
const STICKY: Tool[] = ['pen', 'highlight', 'whiteout']
const TYPE_LABEL: Record<string, string> = { text: 'Text', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow', highlight: 'Highlight', pen: 'Drawing', image: 'Image', whiteout: 'Whiteout' }

type Style = { color: string; fill: string | null; strokeWidth: number; opacity: number; font: FontKey; size: number; bold: boolean; italic: boolean; highlight: string }
const DEFAULT_STYLE: Style = { color: '#ef4444', fill: null, strokeWidth: 3, opacity: 1, font: 'Helvetica', size: 16, bold: false, italic: false, highlight: '#facc15' }

export default function EditPdf() {
  const [file, setFile] = useState<File | null>(null)
  const { pages, total, error: loadErr, loading } = usePdfPages(file)
  const hist = useHistory<PageItems>({})
  const items = hist.state
  const [cur, setCur] = useState(0)
  const [tool, setTool] = useState<Tool>('select')
  const [sel, setSel] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [style, setStyle] = useState<Style>(DEFAULT_STYLE)
  const [textColor, setTextColor] = useState('#111111')
  const [zoom, setZoom] = useState(1)
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()
  const imgInput = useRef<HTMLInputElement>(null)

  const page = pages[cur]
  const pageItems = items[cur] ?? []
  const selected = pageItems.find((i) => i.id === sel) ?? null
  const count = useMemo(() => Object.values(items).reduce((n, l) => n + l.length, 0), [items])

  const reset = () => { setFile(null); hist.reset({}); setCur(0); setSel(null); setEditing(null); setResult(null); setTool('select') }

  const updatePage = useCallback((fn: (l: Item[]) => Item[]) => hist.update((all) => ({ ...all, [cur]: fn(all[cur] ?? []) })), [cur, hist.update])
  const patchSelected = (patch: Partial<Item>) => { if (!sel) return; hist.apply((all) => ({ ...all, [cur]: (all[cur] ?? []).map((i) => (i.id === sel ? { ...i, ...patch } : i)) })) }
  const removeSelected = () => { if (!sel) return; hist.apply((all) => ({ ...all, [cur]: (all[cur] ?? []).filter((i) => i.id !== sel) })); setSel(null); setEditing(null) }
  const duplicate = () => {
    if (!selected) return
    const c: Item = { ...selected, id: uid(), x: selected.x + 12, y: selected.y + 12, x2: selected.x2 !== undefined ? selected.x2 + 12 : undefined, y2: selected.y2 !== undefined ? selected.y2 + 12 : undefined, points: selected.points?.map(([a, b]) => [a + 12, b + 12]) }
    hist.apply((all) => ({ ...all, [cur]: [...(all[cur] ?? []), c] })); setSel(c.id)
  }
  const reorder = (id: string, dir: 1 | -1) => hist.apply((all) => {
    const l = [...(all[cur] ?? [])]; const i = l.findIndex((x) => x.id === id); const j = i + dir
    if (i < 0 || j < 0 || j >= l.length) return all
    ;[l[i], l[j]] = [l[j], l[i]]; return { ...all, [cur]: l }
  })

  // what the side panel edits: the selection, or the defaults for the active tool
  const kind: string = selected?.type ?? (tool === 'select' || tool === 'place' ? '' : tool)
  const val = <K extends keyof Item>(k: K, fallback: any) => (selected ? (selected[k] ?? fallback) : fallback)
  const setProp = (patch: Partial<Item> & Partial<Style>) => {
    const { color, ...rest } = patch
    setStyle((s) => ({ ...s, ...(rest as any), ...(color ? (kind === 'highlight' ? { highlight: color } : kind === 'text' ? {} : { color }) : {}) }))
    if (kind === 'text' && color) setTextColor(color)
    if (selected) patchSelected(patch)
  }
  const newStyle: Partial<Item> = useMemo(() => {
    if (tool === 'text') return { font: style.font, size: style.size, bold: style.bold, italic: style.italic, color: textColor }
    if (tool === 'highlight') return { color: style.highlight, opacity: 0.4 }
    if (tool === 'whiteout') return {}
    return { color: style.color, fill: style.fill, strokeWidth: style.strokeWidth, opacity: style.opacity }
  }, [tool, style, textColor])

  const pickTool = (t: Tool | 'image') => {
    if (t === 'image') { imgInput.current?.click(); return }
    setTool(t); setEditing(null); if (t !== 'select') setSel(null)
  }

  async function insertImage(f: File) {
    if (!page) return
    try {
      const img = await loadImage(f)
      const max = 1800, s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      const jpeg = f.type === 'image/jpeg'
      const src = c.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.92)
      const w = Math.min(220, page.w * 0.45), h = w * (c.height / c.width)
      const it: Item = { id: uid(), type: 'image', x: (page.w - w) / 2, y: (page.h - h) / 2, w, h, src, opacity: 1, lockAspect: true }
      hist.apply((all) => ({ ...all, [cur]: [...(all[cur] ?? []), it] })); setTool('select'); setSel(it.id)
    } catch { toast('Could not read that image', 'error') }
  }

  // keyboard shortcuts
  useEffect(() => {
    if (!file) return
    const h = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable)) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? hist.redo() : hist.undo(); return }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); hist.redo(); return }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeSelected(); return }
      if (e.key === 'Escape') { setSel(null); setTool('select'); return }
      if (sel && e.key.startsWith('Arrow')) {
        e.preventDefault(); const d = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0
        hist.apply((all) => ({ ...all, [cur]: (all[cur] ?? []).map((i) => i.id === sel ? { ...i, x: i.x + dx, y: i.y + dy, x2: i.x2 !== undefined ? i.x2 + dx : undefined, y2: i.y2 !== undefined ? i.y2 + dy : undefined, points: i.points?.map(([a, b]) => [a + dx, b + dy]) } : i) }))
        return
      }
      if (!mod && !e.altKey) { const t = TOOLS.find((x) => x.key === e.key.toLowerCase()); if (t) pickTool(t.id) }
      if (e.key === 'PageDown') setCur((c) => Math.min(total - 1, c + 1))
      if (e.key === 'PageUp') setCur((c) => Math.max(0, c - 1))
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })

  async function exportPdf() {
    if (!file) return
    setSel(null); setEditing(null)
    const bytes = await job.run((p) => burnItems(file, hist.get(), pages, p))
    if (bytes) { setResult(pdfBlob(bytes)); toast('Edits burned into your PDF') }
  }

  if (!file) return <Dropzone accept="application/pdf,.pdf" onFiles={(f) => setFile(f[0])} label="Drop a PDF to edit" sub="Add text, shapes, highlights, images and drawings: 100% in your browser." />

  return (
    <div className="space-y-4">
      <input ref={imgInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) insertImage(f); e.target.value = '' }} />
      <AnimatePresence>{result && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          <ResultCard blob={result} filename={renameExt(file.name, 'pdf', '-edited')} title={`Exported with ${count} edit${count === 1 ? '' : 's'}`} onReset={reset}>
            <button className="text-xs text-muted underline-offset-2 hover:text-fg hover:underline cursor-pointer" onClick={() => setResult(null)}>Keep editing</button>
          </ResultCard>
        </motion.div>
      )}</AnimatePresence>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-3">
          {/* toolbar */}
          <div className="sticky top-16 z-20 flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-surface/90 p-1.5 shadow-sm backdrop-blur">
            {TOOLS.map((t) => (
              <ToolBtn key={t.id} title={`${t.label} (${t.key.toUpperCase()})`} active={tool === t.id} onClick={() => pickTool(t.id)}><t.icon className="size-4" /></ToolBtn>
            ))}
            <div className="mx-1 h-6 w-px bg-border" />
            <ToolBtn title="Undo (Ctrl+Z)" disabled={!hist.canUndo} onClick={hist.undo}><Undo2 className="size-4" /></ToolBtn>
            <ToolBtn title="Redo (Ctrl+Shift+Z)" disabled={!hist.canRedo} onClick={hist.redo}><Redo2 className="size-4" /></ToolBtn>
            <ToolBtn title="Duplicate (Ctrl+D)" disabled={!sel} onClick={duplicate}><Copy className="size-4" /></ToolBtn>
            <ToolBtn title="Delete (Del)" disabled={!sel} onClick={removeSelected} className="hover:!text-danger"><Trash2 className="size-4" /></ToolBtn>
          </div>
          <ErrorNote error={loadErr} />
          {page ? (
            <div className="overflow-auto rounded-2xl border border-border bg-surface-2/50 p-3 sm:p-6 checker">
              <div className="mx-auto transition-[max-width] duration-200" style={{ maxWidth: Math.round(Math.min(820, page.w * 1.35) * zoom) }}>
                <PageEditor page={page} items={pageItems} selectedId={sel} editingId={editing} tool={tool} style={newStyle}
                  onSelect={setSel} onEdit={setEditing} update={updatePage} commit={hist.commit}
                  onCreated={() => { if (!STICKY.includes(tool)) setTool('select') }} />
              </div>
            </div>
          ) : !loadErr && <div className="grid h-96 place-items-center rounded-2xl border border-border bg-surface-2/40"><Spinner label="Rendering pages…" /></div>}
          {total > 0 && <PageNav pages={pages} total={total} current={cur} onChange={(i) => { setCur(i); setSel(null); setEditing(null) }} zoom={zoom} onZoom={setZoom}
            badge={(i) => items[i]?.length ? <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-accent text-[9px] font-bold text-on-accent">{items[i].length}</span> : null} />}
          <p className="hidden text-xs text-muted sm:block">Tips: click a tool then draw on the page · double-click text to edit · <Kbd>Shift</Kbd> keeps lines straight & shapes square · arrows nudge · <Kbd>Del</Kbd> removes.</p>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-5 rounded-2xl border border-border bg-surface p-5">
            <FileChip file={file} onRemove={reset} extra={loading ? <Spinner /> : undefined} />
            <AnimatePresence mode="wait">
              <motion.div key={kind || 'none'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-4">
                {!kind && <div className="rounded-xl bg-surface-2/60 p-3 text-sm text-muted">Pick a tool from the toolbar, or select an item on the page to change its style.</div>}
                {kind && <div className="text-sm font-semibold">{selected ? `Selected: ${TYPE_LABEL[kind]}` : `New ${TYPE_LABEL[kind]?.toLowerCase()}`}</div>}
                {kind === 'text' && (<>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Select value={val('font', style.font) as FontKey} onChange={(v) => setProp({ font: v })} options={[{ value: 'Helvetica', label: 'Helvetica (sans)' }, { value: 'Times', label: 'Times (serif)' }, { value: 'Courier', label: 'Courier (mono)' }]} />
                    <div className="flex gap-1">
                      <ToolBtn title="Bold" active={!!val('bold', style.bold)} onClick={() => setProp({ bold: !val('bold', style.bold) })}><Bold className="size-4" /></ToolBtn>
                      <ToolBtn title="Italic" active={!!val('italic', style.italic)} onClick={() => setProp({ italic: !val('italic', style.italic) })}><Italic className="size-4" /></ToolBtn>
                    </div>
                  </div>
                  <Slider label="Size" value={Math.round(val('size', style.size))} min={6} max={96} onChange={(v) => setProp({ size: v })} suffix=" pt" />
                  <div><Label>Colour</Label><ColorPicker value={val('color', textColor)} onChange={(c) => c && setProp({ color: c })} /></div>
                </>)}
                {(kind === 'rect' || kind === 'ellipse') && (<>
                  <div><Label>Stroke</Label><ColorPicker value={val('color', style.color)} onChange={(c) => c && setProp({ color: c })} /></div>
                  <div><Label>Fill</Label><ColorPicker allowNone value={val('fill', style.fill)} onChange={(c) => setProp({ fill: c })} /></div>
                  <Slider label="Stroke width" value={val('strokeWidth', style.strokeWidth)} min={0} max={20} onChange={(v) => setProp({ strokeWidth: v })} suffix=" pt" />
                  <Slider label="Opacity" value={Math.round(val('opacity', style.opacity) * 100)} min={10} max={100} onChange={(v) => setProp({ opacity: v / 100 })} suffix="%" />
                </>)}
                {(kind === 'line' || kind === 'arrow' || kind === 'pen') && (<>
                  <div><Label>Colour</Label><ColorPicker value={val('color', style.color)} onChange={(c) => c && setProp({ color: c })} /></div>
                  <Slider label="Thickness" value={val('strokeWidth', style.strokeWidth)} min={1} max={24} onChange={(v) => setProp({ strokeWidth: v })} suffix=" pt" />
                  <Slider label="Opacity" value={Math.round(val('opacity', style.opacity) * 100)} min={10} max={100} onChange={(v) => setProp({ opacity: v / 100 })} suffix="%" />
                </>)}
                {kind === 'highlight' && (<>
                  <div><Label>Highlighter</Label><ColorPicker colors={['#facc15', '#4ade80', '#60a5fa', '#fdba74', '#fb923c']} value={val('color', style.highlight)} onChange={(c) => c && setProp({ color: c })} /></div>
                  {selected && <Slider label="Strength" value={Math.round(val('opacity', 0.4) * 100)} min={15} max={80} onChange={(v) => patchSelected({ opacity: v / 100 })} suffix="%" />}
                </>)}
                {kind === 'image' && selected && <Slider label="Opacity" value={Math.round(val('opacity', 1) * 100)} min={10} max={100} onChange={(v) => patchSelected({ opacity: v / 100 })} suffix="%" />}
                {kind === 'whiteout' && <p className="text-xs text-muted">Whiteout paints opaque white over content. It hides it visually but the original text stays in the file, use <b>Redact PDF</b> to remove sensitive text for real.</p>}
                {selected && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" icon={<Copy className="size-3.5" />} onClick={duplicate}>Duplicate</Button>
                    <Button size="sm" variant="outline" icon={<Trash2 className="size-3.5" />} onClick={removeSelected} className="hover:!border-danger hover:!text-danger">Delete</Button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <div>
              <Label hint={`${pageItems.length}`}><span className="inline-flex items-center gap-1.5"><Layers className="size-3.5" />Layers · page {cur + 1}</span></Label>
              {pageItems.length === 0 ? <Empty>No edits on this page yet.</Empty> : (
                <ul className="max-h-56 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
                  {[...pageItems].reverse().map((it, ri) => {
                    const idx = pageItems.length - 1 - ri
                    return (
                      <li key={it.id} className={cn('group flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition cursor-pointer', sel === it.id ? 'border-accent bg-accent/10' : 'border-transparent hover:bg-surface-2')} onClick={() => { setTool('select'); setSel(it.id) }}>
                        <span className="size-3 shrink-0 rounded-sm border border-black/10" style={{ background: it.type === 'whiteout' ? '#fff' : it.type === 'image' ? 'var(--accent)' : it.color }} />
                        <span className="min-w-0 flex-1 truncate">{TYPE_LABEL[it.type]}{it.type === 'text' && it.text ? ` · “${it.text.slice(0, 24)}”` : ''}</span>
                        <button title="Bring forward" disabled={idx === pageItems.length - 1} onClick={(e) => { e.stopPropagation(); reorder(it.id, 1) }} className="rounded p-0.5 text-muted opacity-0 hover:text-fg group-hover:opacity-100 disabled:opacity-20 cursor-pointer"><ArrowUp className="size-3.5" /></button>
                        <button title="Send backward" disabled={idx === 0} onClick={(e) => { e.stopPropagation(); reorder(it.id, -1) }} className="rounded p-0.5 text-muted opacity-0 hover:text-fg group-hover:opacity-100 disabled:opacity-20 cursor-pointer"><ArrowDown className="size-3.5" /></button>
                        <button title="Delete" onClick={(e) => { e.stopPropagation(); hist.apply((all) => ({ ...all, [cur]: (all[cur] ?? []).filter((x) => x.id !== it.id) })); if (sel === it.id) setSel(null) }} className="rounded p-0.5 text-muted opacity-0 hover:text-danger group-hover:opacity-100 cursor-pointer"><Trash2 className="size-3.5" /></button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {job.busy && <Progress value={job.progress} label="Burning edits into PDF…" />}
            <ErrorNote error={job.error} />
            <Button size="lg" className="w-full" icon={<Download className="size-4" />} loading={job.busy} disabled={!count || loading} onClick={exportPdf}>
              {count ? `Export PDF (${count} edit${count === 1 ? '' : 's'})` : 'Add an edit to export'}
            </Button>
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted"><FileText className="mt-0.5 size-3.5 shrink-0" />Text is written as real, selectable PDF text; shapes and drawings stay vector.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
