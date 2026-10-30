/* Inputs: drop files or folders, pick a folder, paste, add a public URL, samples and watch folder.
 * Then a file list with thumbnails, type filter, sort, selection and per-file status. */
import { useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, FolderUp, ClipboardPaste, Link2, Sparkles, FolderSearch, Trash2, X, ImageIcon, FileText, Video, AudioLines, Table, Archive, File, AlertTriangle, Check, Loader2, Radio, ArrowUpDown } from 'lucide-react'
import { Button, Input, Switch, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { formatBytes } from '@/lib/files'
import type { Kind } from '@/pages/workspace/catalog'
import type { FileStatus } from '@/pages/workspace/engine'
import { canWatch, checkUrl, fromClipboardApi, fromDrop, fromPicker, fromUrl, type InFile } from '@/pages/workspace/inputs'
import { ProgressRing, useObjectUrl, useMotion } from './kit'

const KIND_ICON: Record<Kind, React.ComponentType<{ className?: string }>> = { image: ImageIcon, pdf: FileText, video: Video, audio: AudioLines, data: Table, text: FileText, archive: Archive, other: File }
const KIND_LABEL: Record<Kind, string> = { image: 'Images', pdf: 'PDF', video: 'Video', audio: 'Audio', data: 'Data', text: 'Text', archive: 'ZIP', other: 'Other' }
const KIND_COLOR: Record<Kind, string> = { image: '#F5A524', pdf: '#14B8A6', video: '#38BDF8', audio: '#38BDF8', data: '#10B981', text: '#10B981', archive: '#22D3EE', other: '#8B929C' }

function Thumb({ f }: { f: InFile }) {
  const url = useObjectUrl(f.kind === 'image' && f.blob.size < 40 * 1024 * 1024 ? f.blob : null)
  const I = KIND_ICON[f.kind]
  if (url) return <img src={url} alt="" loading="lazy" className="size-10 shrink-0 rounded-lg object-cover" />
  return <span className="grid size-10 shrink-0 place-items-center rounded-lg" style={{ background: KIND_COLOR[f.kind] + '1f', color: KIND_COLOR[f.kind] }}><I className="size-5" /></span>
}

function StatusBadge({ s }: { s?: FileStatus }) {
  if (!s) return null
  if (s.state === 'done') return <span className="grid size-6 place-items-center rounded-full bg-success/15 text-success" title="Done"><Check className="size-3.5" /></span>
  if (s.state === 'error') return <span className="grid size-6 place-items-center rounded-full bg-danger/15 text-danger" title={s.error}><AlertTriangle className="size-3.5" /></span>
  if (s.state === 'running') return <ProgressRing value={s.progress} size={24} stroke={3} spin />
  if (s.state === 'cancelled') return <span className="text-[10px] text-muted">stopped</span>
  return <span className="size-2 rounded-full bg-muted/50" title="Queued" />
}

type Props = {
  files: InFile[]
  status: Record<string, FileStatus>
  selected: Set<string>
  unpack: boolean
  onUnpack: (v: boolean) => void
  onAdd: (f: InFile[]) => void
  onRemove: (ids: string[]) => void
  onSelect: (s: Set<string>) => void
  onSamples: () => void
  watching: string | null
  onWatch: () => void
  busy: boolean
}

export default function FileTray(p: Props) {
  const [over, setOver] = useState(false)
  const [url, setUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const [filter, setFilter] = useState<Kind | 'all'>('all')
  const [sort, setSort] = useState<'added' | 'name' | 'size' | 'type'>('added')
  const [limit, setLimit] = useState(200)
  const fileRef = useRef<HTMLInputElement>(null), dirRef = useRef<HTMLInputElement>(null)
  const m = useMotion()
  const kinds = useMemo(() => { const c = new Map<Kind, number>(); p.files.forEach((f) => c.set(f.kind, (c.get(f.kind) ?? 0) + 1)); return c }, [p.files])
  const list = useMemo(() => {
    const l = p.files.filter((f) => filter === 'all' || f.kind === filter)
    const cmp: Record<typeof sort, (a: InFile, b: InFile) => number> = { added: (a, b) => a.added - b.added, name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }), size: (a, b) => b.blob.size - a.blob.size, type: (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name) }
    return [...l].sort(cmp[sort])
  }, [p.files, filter, sort])
  const total = useMemo(() => p.files.reduce((a, f) => a + f.blob.size, 0), [p.files])
  const allSel = list.length > 0 && list.every((f) => p.selected.has(f.id))

  const addUrl = async () => {
    if (!checkUrl(url)) return toast('Use a full http or https link to a file', 'error')
    setFetching(true)
    try { p.onAdd([await fromUrl(url)]); setUrl(''); toast('File added from the link') }
    catch (e: any) { toast(e?.message || 'Could not fetch that file', 'error') }
    finally { setFetching(false) }
  }

  return (
    <div className="space-y-3" data-tour="inputs">
      <div role="button" tabIndex={0} aria-label="Drop files or folders here, or press Enter to choose files"
        onClick={() => fileRef.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true) } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false) }}
        onDrop={async (e) => { e.preventDefault(); setOver(false); const f = await fromDrop(e.dataTransfer); if (f.length) p.onAdd(f) }}
        className={cn('ws-drop group relative flex cursor-pointer flex-col items-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed p-5 text-center transition outline-none focus-visible:border-accent', over ? 'border-accent bg-accent/10' : 'border-border bg-surface hover:border-accent/60')}>
        {m !== 'off' && <span className={cn('ws-drop-orbit', over && 'ws-drop-orbit-on')} aria-hidden="true" />}
        <span className={cn('relative grid size-11 place-items-center rounded-2xl bg-gradient-brand text-on-accent shadow-lg shadow-accent/25 transition', over && '-translate-y-1 scale-110')}><Upload className="size-5" /></span>
        <div className="relative text-sm font-semibold">Drop files or whole folders</div>
        <div className="relative text-[11px] text-muted">Images, PDFs, video, audio, CSV, JSON, XLSX, text and ZIPs. Nothing leaves your device.</div>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { p.onAdd(fromPicker(e.target.files)); e.target.value = '' }} />
        <input ref={dirRef} type="file" multiple hidden {...({ webkitdirectory: '', directory: '' } as any)} onChange={(e) => { p.onAdd(fromPicker(e.target.files, true)); e.target.value = '' }} />
      </div>
      <div className="grid grid-cols-2 gap-1.5 min-[420px]:grid-cols-4 lg:grid-cols-2">
        <Button size="sm" variant="outline" icon={<FolderUp className="size-3.5" />} onClick={() => dirRef.current?.click()}>Folder</Button>
        <Button size="sm" variant="outline" icon={<ClipboardPaste className="size-3.5" />} onClick={async () => { try { const f = await fromClipboardApi(); f.length ? p.onAdd(f) : toast('The clipboard has no image or text', 'error') } catch { toast('Press Ctrl+V on the page to paste instead', 'error') } }}>Paste</Button>
        <Button size="sm" variant="outline" icon={<Sparkles className="size-3.5" />} onClick={p.onSamples} data-tour="samples">Samples</Button>
        {canWatch() ? <Button size="sm" variant={p.watching ? 'primary' : 'outline'} icon={p.watching ? <Radio className="size-3.5" /> : <FolderSearch className="size-3.5" />} onClick={p.onWatch} title="Watch a folder and add new files as they appear">{p.watching ? 'Watching' : 'Watch'}</Button>
          : <Button size="sm" variant="outline" disabled title="Watch folder needs Chrome or Edge" icon={<FolderSearch className="size-3.5" />}>Watch</Button>}
      </div>
      {p.watching && <div className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-1.5 text-[11px]"><span className="relative flex size-2"><span className={cn('absolute inline-flex size-full rounded-full bg-accent opacity-75', m !== 'off' && 'animate-ping')} /><span className="relative inline-flex size-2 rounded-full bg-accent" /></span>Watching <b className="truncate">{p.watching}</b>, new files are added on their own.</div>}
      <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); addUrl() }}>
        <div className="relative flex-1"><Link2 className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" /><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… public file link" className="h-9 pl-8 text-xs" aria-label="Public file URL" inputMode="url" /></div>
        <Button size="sm" type="submit" loading={fetching} disabled={!url}>Add</Button>
      </form>
      <p className="-mt-1 text-[10px] leading-snug text-muted">Links work when the other site allows cross-site reads (CORS). If it does not, download the file and drop it here.</p>
      <label className="flex items-center justify-between gap-2 text-xs text-muted"><span>Unpack ZIPs when added</span><Switch checked={p.unpack} onChange={p.onUnpack} /></label>

      {p.files.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border p-2">
            <input type="checkbox" aria-label="Select all shown files" checked={allSel} onChange={() => { const s = new Set(p.selected); allSel ? list.forEach((f) => s.delete(f.id)) : list.forEach((f) => s.add(f.id)); p.onSelect(s) }} className="size-4 accent-[var(--accent)]" />
            <span className="text-xs font-medium">{p.files.length} files · {formatBytes(total)}</span>
            <label className="ml-auto flex items-center gap-1 text-[11px] text-muted"><ArrowUpDown className="size-3" /><span className="sr-only">Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="rounded-md border border-border bg-surface px-1 py-0.5 text-[11px]"><option value="added">Added</option><option value="name">Name</option><option value="size">Size</option><option value="type">Type</option></select>
            </label>
          </div>
          <div className="flex flex-wrap gap-1 border-b border-border p-2" role="tablist" aria-label="Filter by type">
            <button role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')} className={cn('rounded-full px-2 py-0.5 text-[11px] cursor-pointer', filter === 'all' ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted')}>All {p.files.length}</button>
            {[...kinds].map(([k, n]) => <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={cn('rounded-full px-2 py-0.5 text-[11px] cursor-pointer', filter === k ? 'text-on-accent' : 'bg-surface-2 text-muted')} style={filter === k ? { background: KIND_COLOR[k] } : undefined}>{KIND_LABEL[k]} {n}</button>)}
          </div>
          <ul className="max-h-[380px] space-y-1 overflow-auto p-2 scrollbar-thin" aria-label="Input files">
            <AnimatePresence initial={false}>
              {list.slice(0, limit).map((f, i) => (
                <motion.li key={f.id} layout={m === 'full'} initial={m === 'off' ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20, height: 0 }} transition={{ delay: m === 'full' ? Math.min(i, 15) * 0.02 : 0 }}
                  className={cn('flex items-center gap-2 rounded-xl border px-2 py-1.5', p.selected.has(f.id) ? 'border-accent/50 bg-accent/5' : 'border-transparent hover:bg-surface-2/60', p.status[f.id]?.state === 'error' && 'border-danger/40')}>
                  <input type="checkbox" aria-label={`Select ${f.name}`} checked={p.selected.has(f.id)} onChange={() => { const s = new Set(p.selected); s.has(f.id) ? s.delete(f.id) : s.add(f.id); p.onSelect(s) }} className="size-4 shrink-0 accent-[var(--accent)]" />
                  <Thumb f={f} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium" title={f.path || f.name}>{f.name}</div>
                    <div className="truncate text-[10px] text-muted">{formatBytes(f.blob.size)} · {f.kind}{f.path && f.path !== f.name ? ` · ${f.path.replace(/[^/]+$/, '')}` : ''}{p.status[f.id]?.state === 'error' ? ` · ${p.status[f.id].error}` : ''}</div>
                  </div>
                  <StatusBadge s={p.status[f.id]} />
                  {!p.busy && <button onClick={() => p.onRemove([f.id])} aria-label={`Remove ${f.name}`} className="rounded p-1 text-muted hover:text-danger cursor-pointer"><X className="size-3.5" /></button>}
                </motion.li>
              ))}
            </AnimatePresence>
            {list.length > limit && <li><Button variant="ghost" size="sm" className="w-full" onClick={() => setLimit((l) => l + 300)}>Show {Math.min(300, list.length - limit)} more</Button></li>}
          </ul>
          <div className="flex items-center gap-2 border-t border-border p-2 text-[11px]">
            <span className="text-muted">{p.selected.size ? `${p.selected.size} selected, Run uses only these` : 'Run uses every file'}</span>
            {p.selected.size > 0 && !p.busy && <button onClick={() => { p.onRemove([...p.selected]); p.onSelect(new Set()) }} className="ml-auto inline-flex items-center gap-1 text-muted hover:text-danger cursor-pointer"><Trash2 className="size-3" /> Remove selected</button>}
            {!p.selected.size && !p.busy && <button onClick={() => p.onRemove(p.files.map((f) => f.id))} className="ml-auto inline-flex items-center gap-1 text-muted hover:text-danger cursor-pointer"><Trash2 className="size-3" /> Clear all</button>}
            {p.busy && <Loader2 className={cn('ml-auto size-3.5 text-accent', m !== 'off' && 'animate-spin')} />}
          </div>
        </div>
      )}
    </div>
  )
}
