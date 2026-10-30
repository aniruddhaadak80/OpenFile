import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PenTool, Plus, CalendarDays, Type, Trash2, Copy, Files, Undo2, Redo2, Download, MousePointer2, X, Signature as SigIcon } from 'lucide-react'
import { Button, Dropzone, FileChip, Label, Input, Select, Slider, Spinner, ErrorNote, ResultCard, Progress, useJob, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { pdfBlob } from '@/lib/pdf'
import { renameExt } from '@/lib/files'
import { usePdfPages, uid } from './_adv/pages'
import { useHistory } from './_adv/history'
import { PageEditor } from './_adv/Editor'
import { burnItems, type Item, type PageItems, type FontKey } from './_adv/items'
import { SignatureModal, ensureScriptFonts } from './_adv/signature'
import { PageNav, ToolBtn, ColorPicker } from './_adv/ui'

type Saved = { id: string; kind: 'signature' | 'initials'; src: string; w: number; h: number }
const LS = 'openfile.sign.saved.v1'
const loadSaved = (): Saved[] => { try { return JSON.parse(localStorage.getItem(LS) || '[]') } catch { return [] } }
const storeSaved = (s: Saved[]) => { try { localStorage.setItem(LS, JSON.stringify(s)) } catch { toast('Could not save to this device (storage full?)', 'error') } }

// Labels are only fallbacks; the picker shows each format with today's date, the same text the Date button stamps.
const DATE_FORMATS = [
  { value: 'dmy', label: '28/10/2026' }, { value: 'mdy', label: '10/28/2026' }, { value: 'iso', label: '2026-10-28' },
  { value: 'long', label: '28 October 2026' }, { value: 'us-long', label: 'October 28, 2026' },
] as const
type DateFmt = typeof DATE_FORMATS[number]['value']
function fmtDate(d: Date, f: DateFmt) {
  const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0'), y = d.getFullYear()
  if (f === 'dmy') return `${dd}/${mm}/${y}`
  if (f === 'mdy') return `${mm}/${dd}/${y}`
  if (f === 'iso') return `${y}-${mm}-${dd}`
  if (f === 'long') return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
const imgSize = (src: string) => new Promise<{ w: number; h: number }>((r) => { const i = new Image(); i.onload = () => r({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => r({ w: 300, h: 100 }); i.src = src })

type Pending = { label: string; make: (x: number, y: number, pageW: number) => Item; preview: React.ReactNode }

export default function SignPdf() {
  const [file, setFile] = useState<File | null>(null)
  const { pages, total, error: loadErr, loading } = usePdfPages(file)
  const hist = useHistory<PageItems>({})
  const items = hist.state
  const [cur, setCur] = useState(0)
  const [sel, setSel] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [saved, setSaved] = useState<Saved[]>(loadSaved)
  const [modal, setModal] = useState<null | 'signature' | 'initials'>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [dateFmt, setDateFmt] = useState<DateFmt>('dmy')
  const [freeText, setFreeText] = useState('')
  const [stampColor, setStampColor] = useState('#111111')
  const [stampFont, setStampFont] = useState<FontKey>('Helvetica')
  const [zoom, setZoom] = useState(1)
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()

  useEffect(() => { ensureScriptFonts() }, [])
  const page = pages[cur]
  const pageItems = items[cur] ?? []
  const selected = pageItems.find((i) => i.id === sel) ?? null
  const count = useMemo(() => Object.values(items).reduce((n, l) => n + l.length, 0), [items])

  const reset = () => { setFile(null); hist.reset({}); setCur(0); setSel(null); setResult(null); setPending(null) }
  const updatePage = useCallback((fn: (l: Item[]) => Item[]) => hist.update((all) => ({ ...all, [cur]: fn(all[cur] ?? []) })), [cur, hist.update])
  const patchSel = (patch: Partial<Item>) => sel && hist.apply((all) => ({ ...all, [cur]: (all[cur] ?? []).map((i) => (i.id === sel ? { ...i, ...patch } : i)) }))
  const removeSel = () => { if (!sel) return; hist.apply((all) => ({ ...all, [cur]: (all[cur] ?? []).filter((i) => i.id !== sel) })); setSel(null) }

  // ---- pending placements ----
  function armImage(s: Saved) {
    const baseW = s.kind === 'initials' ? 64 : 150
    const ratio = s.h / s.w
    setPending({
      label: s.kind === 'initials' ? 'initials' : 'signature',
      preview: <img src={s.src} alt="" style={{ width: 120 * (s.kind === 'initials' ? 0.5 : 1) }} />,
      make: (x, y, pw) => { const w = Math.min(baseW, pw * 0.5), h = w * ratio; return { id: uid(), type: 'image', src: s.src, x: x - w / 2, y: y - h / 2, w, h, lockAspect: true, label: s.kind } },
    })
    setSel(null)
  }
  function armText(text: string, label: string) {
    if (!text.trim()) return
    const size = 12
    setPending({
      label,
      preview: <span className="whitespace-nowrap rounded bg-white/80 px-1 text-sm text-black">{text}</span>,
      make: (x, y) => {
        const m = document.createElement('canvas').getContext('2d')!
        m.font = `${size}px ${stampFont === 'Times' ? 'Times New Roman' : stampFont === 'Courier' ? 'Courier New' : 'Arial'}`
        const w = Math.ceil(Math.max(...text.split('\n').map((l) => m.measureText(l).width)) + 4)
        return { id: uid(), type: 'text', text, x: x - w / 2, y: y - size * 0.6, w, h: size * 1.2, size, font: stampFont, color: stampColor, label }
      },
    })
    setSel(null)
  }
  function place(x: number, y: number) {
    if (!pending || !page) return
    const it = pending.make(x, y, page.w)
    it.x = Math.max(0, Math.min(page.w - it.w, it.x)); it.y = Math.max(0, Math.min(page.h - it.h, it.y))
    hist.apply((all) => ({ ...all, [cur]: [...(all[cur] ?? []), it] }))
    setSel(it.id); setPending(null)
  }

  function onSaveSignature(src: string, remember: boolean) {
    const kind = modal!
    setModal(null)
    imgSize(src).then(({ w, h }) => {
      const s: Saved = { id: uid(), kind, src, w, h }
      if (remember) { const seen: Record<string, number> = {}; const next = [s, ...saved].filter((x) => (seen[x.kind] = (seen[x.kind] ?? 0) + 1) <= 6); setSaved(next); storeSaved(next) }
      armImage(s)
      toast(`Click on the page to place your ${kind}`, 'info')
    })
  }
  const deleteSaved = (id: string) => { const next = saved.filter((s) => s.id !== id); setSaved(next); storeSaved(next) }

  function applyToAll() {
    if (!selected || !page) return
    hist.apply((all) => {
      const next: PageItems = { ...all }
      pages.forEach((pg, i) => {
        if (i === cur) return
        const sx = pg.w / page.w, sy = pg.h / page.h
        const copy: Item = { ...selected, id: uid(), x: selected.x * sx, y: selected.y * sy }
        next[i] = [...(next[i] ?? []), copy]
      })
      return next
    })
    toast(`Copied to ${pages.length - 1} other page${pages.length - 1 === 1 ? '' : 's'}`)
  }
  function duplicate() {
    if (!selected) return
    const c = { ...selected, id: uid(), x: selected.x + 10, y: selected.y + 10 }
    hist.apply((all) => ({ ...all, [cur]: [...(all[cur] ?? []), c] })); setSel(c.id)
  }

  useEffect(() => {
    if (!file) return
    const h = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT') || modal) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? hist.redo() : hist.undo() }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); hist.redo() }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeSel() }
      else if (e.key === 'Escape') { setPending(null); setSel(null) }
      else if (sel && e.key.startsWith('Arrow')) {
        e.preventDefault(); const d = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0
        hist.apply((all) => ({ ...all, [cur]: (all[cur] ?? []).map((i) => (i.id === sel ? { ...i, x: i.x + dx, y: i.y + dy } : i)) }))
      }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })

  async function exportPdf() {
    if (!file) return
    setSel(null); setEditing(null)
    const bytes = await job.run((p) => burnItems(file, hist.get(), pages, p))
    if (bytes) { setResult(pdfBlob(bytes)); toast('Document signed') }
  }

  if (!file) return <Dropzone accept="application/pdf,.pdf" onFiles={(f) => setFile(f[0])} label="Drop the PDF you need to sign" sub="Your document and signature never leave this device." />

  const sigs = saved.filter((s) => s.kind === 'signature'), inits = saved.filter((s) => s.kind === 'initials')

  return (
    <div className="space-y-4">
      <AnimatePresence>{modal && <SignatureModal kind={modal} onClose={() => setModal(null)} onSave={onSaveSignature} />}</AnimatePresence>
      <AnimatePresence>{result && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          <ResultCard blob={result} filename={renameExt(file.name, 'pdf', '-signed')} title="Your signed PDF is ready" onReset={reset}>
            <button className="text-xs text-muted hover:text-fg hover:underline cursor-pointer" onClick={() => setResult(null)}>Keep editing</button>
          </ResultCard>
        </motion.div>
      )}</AnimatePresence>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-3">
          <div className="sticky top-16 z-20 flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-surface/90 p-1.5 shadow-sm backdrop-blur">
            <ToolBtn title="Select & move" active={!pending} onClick={() => setPending(null)}><MousePointer2 className="size-4" /></ToolBtn>
            <AnimatePresence>{pending && (
              <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 rounded-lg bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent">
                <span className="relative flex size-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-accent" /></span>
                Click on the page to place {pending.label}
                <button onClick={() => setPending(null)} className="rounded p-0.5 hover:bg-accent/20 cursor-pointer" aria-label="Cancel placement"><X className="size-3.5" /></button>
              </motion.div>
            )}</AnimatePresence>
            <div className="ml-auto flex items-center gap-1">
              <ToolBtn title="Undo" disabled={!hist.canUndo} onClick={hist.undo}><Undo2 className="size-4" /></ToolBtn>
              <ToolBtn title="Redo" disabled={!hist.canRedo} onClick={hist.redo}><Redo2 className="size-4" /></ToolBtn>
              <ToolBtn title="Delete selected" disabled={!sel} onClick={removeSel} className="hover:!text-danger"><Trash2 className="size-4" /></ToolBtn>
            </div>
          </div>
          <ErrorNote error={loadErr} />
          {page ? (
            <div className="overflow-auto rounded-2xl border border-border bg-surface-2/50 p-3 sm:p-6 checker">
              <div className="mx-auto transition-[max-width] duration-200" style={{ maxWidth: Math.round(Math.min(820, page.w * 1.35) * zoom) }}>
                <PageEditor page={page} items={pageItems} selectedId={sel} editingId={editing} tool={pending ? 'place' : 'select'}
                  onSelect={setSel} onEdit={setEditing} update={updatePage} commit={hist.commit} onPlace={place} placeHint={pending?.preview} />
              </div>
            </div>
          ) : !loadErr && <div className="grid h-96 place-items-center rounded-2xl border border-border bg-surface-2/40"><Spinner label="Rendering pages…" /></div>}
          {total > 0 && <PageNav pages={pages} total={total} current={cur} onChange={(i) => { setCur(i); setSel(null) }} zoom={zoom} onZoom={setZoom}
            badge={(i) => items[i]?.length ? <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-success text-[9px] font-bold text-white">✓</span> : null} />}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-5 rounded-2xl border border-border bg-surface p-5">
            <FileChip file={file} onRemove={reset} extra={loading ? <Spinner /> : undefined} />

            <SavedGroup title="Signature" items={sigs} onAdd={() => setModal('signature')} onUse={armImage} onDelete={deleteSaved} active={pending?.label === 'signature'} big />
            <SavedGroup title="Initials" items={inits} onAdd={() => setModal('initials')} onUse={armImage} onDelete={deleteSaved} active={pending?.label === 'initials'} />

            <div className="space-y-2">
              <Label>Date & text stamps</Label>
              <div className="flex gap-2">
                <Select value={dateFmt} onChange={setDateFmt} options={DATE_FORMATS.map((d) => ({ value: d.value, label: fmtDate(new Date(), d.value) }))} className="flex-1" />
                <Button variant="outline" icon={<CalendarDays className="size-4" />} onClick={() => armText(fmtDate(new Date(), dateFmt), 'date')}>Date</Button>
              </div>
              <div className="flex gap-2">
                <Input value={freeText} onChange={(e) => setFreeText(e.target.value)} placeholder="Name, title, place…" onKeyDown={(e) => { if (e.key === 'Enter') armText(freeText, 'text') }} />
                <Button variant="outline" icon={<Type className="size-4" />} disabled={!freeText.trim()} onClick={() => armText(freeText, 'text')}>Add</Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <ColorPicker colors={['#111111', '#1e3a8a', '#b91c1c']} value={stampColor} onChange={(c) => c && setStampColor(c)} />
                <Select value={stampFont} onChange={setStampFont} options={['Helvetica', 'Times', 'Courier']} className="w-32" />
              </div>
            </div>

            <AnimatePresence>{selected && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-3 overflow-hidden rounded-xl border border-accent/30 bg-accent/5 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-accent">Selected {selected.label ?? selected.type}</div>
                {selected.type === 'text' && (<>
                  <Input value={selected.text ?? ''} onChange={(e) => patchSel({ text: e.target.value })} />
                  <Slider label="Size" value={Math.round(selected.size ?? 12)} min={6} max={48} onChange={(v) => patchSel({ size: v })} suffix=" pt" />
                  <ColorPicker colors={['#111111', '#1e3a8a', '#b91c1c']} value={selected.color} onChange={(c) => c && patchSel({ color: c })} />
                </>)}
                {selected.type === 'image' && <Slider label="Width" value={Math.round(selected.w)} min={20} max={Math.round(page?.w ?? 600)} onChange={(v) => patchSel({ w: v, h: selected.h * (v / selected.w) })} suffix=" pt" />}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" icon={<Copy className="size-3.5" />} onClick={duplicate}>Duplicate</Button>
                  {total > 1 && <Button size="sm" variant="outline" icon={<Files className="size-3.5" />} onClick={applyToAll}>All pages</Button>}
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={removeSel} className="hover:!text-danger">Remove</Button>
                </div>
              </motion.div>
            )}</AnimatePresence>

            {job.busy && <Progress value={job.progress} label="Embedding signature…" />}
            <ErrorNote error={job.error} />
            <Button size="lg" className="w-full" icon={<Download className="size-4" />} loading={job.busy} disabled={!count || loading} onClick={exportPdf}>
              {count ? `Finish & download (${count})` : 'Place a signature first'}
            </Button>
            <p className="text-[11px] leading-relaxed text-muted">This adds a visual e-signature. It is not a certificate-based digital signature.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function SavedGroup({ title, items, onAdd, onUse, onDelete, active, big }: { title: string; items: Saved[]; onAdd: () => void; onUse: (s: Saved) => void; onDelete: (id: string) => void; active?: boolean; big?: boolean }) {
  return (
    <div>
      <Label hint={items.length ? 'click to place' : undefined}>{title}</Label>
      <div className={cn('grid gap-2', big ? 'grid-cols-2' : 'grid-cols-3')}>
        {items.map((s) => (
          <motion.div layout key={s.id} className="group relative">
            <button type="button" onClick={() => onUse(s)} className={cn('grid w-full place-items-center rounded-xl border-2 bg-white p-2 transition cursor-pointer hover:border-accent hover:shadow-md', big ? 'h-16' : 'h-12', active ? 'border-accent/40' : 'border-border')} title={`Place ${title.toLowerCase()}`}>
              <img src={s.src} alt={title} className="max-h-full max-w-full object-contain" />
            </button>
            <button type="button" onClick={() => onDelete(s.id)} title="Delete saved" className="absolute -right-1.5 -top-1.5 hidden size-5 place-items-center rounded-full bg-danger text-white shadow group-hover:grid cursor-pointer"><X className="size-3" /></button>
          </motion.div>
        ))}
        <button type="button" onClick={onAdd} className={cn('flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-border text-xs text-muted transition hover:border-accent hover:text-accent cursor-pointer', big ? 'h-16' : 'h-12')}>
          {big ? <PenTool className="size-4" /> : <SigIcon className="size-4" />}<span className="inline-flex items-center gap-0.5"><Plus className="size-3" />New</span>
        </button>
      </div>
    </div>
  )
}
