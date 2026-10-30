import { useEffect, useMemo, useState } from 'react'
import { Download, FolderOpen, ArrowRight, Trash2, AlertTriangle } from 'lucide-react'
import { Button, Dropzone, Input, Label, Select, Switch, Progress, Badge, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob, formatBytes } from '@/lib/files'
import { Bar, Status, Chip } from './_b5/shell'
import { renameAll, dedupeNames, type RenameOpts, type Item } from '@/lib/b5/rename'

type Entry = Item & { file?: File; handle?: any }
const TOKENS: [string, string][] = [['{name}', 'Original name'], ['{ext}', 'Extension'], ['{n}', 'Number'], ['{n:3}', 'Number, 3 digits'], ['{n:auto}', 'Number, auto width'], ['{date}', 'Photo date (EXIF) or file date'], ['{date:YYYYMMDD_HHmmss}', 'Custom date'], ['{mdate}', 'File modified date'], ['{size:kb}', 'Size in KB'], ['{folder}', 'Folder name']]
const INIT: RenameOpts = { pattern: '{name}.{ext}', find: '', replace: '', regex: false, matchCase: false, caseMode: 'keep', start: 1, step: 1, spaces: 'keep' }
const canFolder = typeof window !== 'undefined' && 'showDirectoryPicker' in window

export default function BulkFileRenamer() {
  const [items, setItems] = useState<Entry[]>([])
  const [o, setO] = useState<RenameOpts>(INIT)
  const [sort, setSort] = useState<'added' | 'name' | 'date' | 'size'>('added')
  const [useExif, setUseExif] = useState(true)
  const [busy, setBusy] = useState(false); const [prog, setProg] = useState(0)
  const [folderMode, setFolderMode] = useState(false)
  const set = <K extends keyof RenameOpts>(k: K, v: RenameOpts[K]) => setO((x) => ({ ...x, [k]: v }))

  const readExif = async (list: Entry[]) => {
    const exifr = (await import('exifr')).default
    const out = await Promise.all(list.map(async (it) => { if (!it.file || !/\.(jpe?g|heic|heif|tiff?|png|webp|dng|cr2|nef|arw)$/i.test(it.name)) return it; try { const t = await exifr.parse(it.file, ['DateTimeOriginal', 'CreateDate']); return { ...it, exifDate: t?.DateTimeOriginal ?? t?.CreateDate ?? null } } catch { return it } }))
    return out
  }
  const addFiles = async (fs: File[]) => {
    const list: Entry[] = fs.map((f) => ({ name: f.name, size: f.size, date: new Date(f.lastModified), file: f, folder: (f as any).webkitRelativePath?.split('/').slice(-2, -1)[0] }))
    setItems((s) => [...s, ...list]); setFolderMode(false)
    if (useExif) { const withExif = await readExif(list); setItems((s) => s.map((x) => withExif.find((w) => w.file === x.file) ?? x)) }
  }
  const pickFolder = async () => {
    try {
      const dir = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
      const list: Entry[] = []
      for await (const [name, h] of dir.entries()) if (h.kind === 'file') { const f: File = await h.getFile(); list.push({ name, size: f.size, date: new Date(f.lastModified), file: f, handle: h, folder: dir.name }) }
      if (!list.length) return toast('That folder has no files', 'info')
      setItems(useExif ? await readExif(list) : list); setFolderMode(true)
    } catch (e: any) { if (e?.name !== 'AbortError') toast(e?.message || 'Could not open the folder', 'error') }
  }

  const sorted = useMemo(() => {
    const a = items.slice()
    if (sort === 'name') a.sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }))
    if (sort === 'date') a.sort((x, y) => ((x.exifDate ?? x.date).getTime() - (y.exifDate ?? y.date).getTime()))
    if (sort === 'size') a.sort((x, y) => x.size - y.size)
    return a
  }, [items, sort])
  const res = useMemo(() => renameAll(sorted.map((x) => (useExif ? x : { ...x, exifDate: null })), o), [sorted, o, useExif])
  const changed = res.names.filter((n, i) => n !== sorted[i].name).length

  const saveZip = async () => {
    setBusy(true); setProg(0)
    try {
      const { zip } = await import('fflate')
      const names = dedupeNames(res.names); const entries: Record<string, Uint8Array> = {}
      for (let i = 0; i < sorted.length; i++) { entries[names[i]] = new Uint8Array(await sorted[i].file!.arrayBuffer()); setProg((i + 1) / sorted.length * 0.8) }
      const data = await new Promise<Uint8Array>((ok, bad) => zip(entries, { level: 0 }, (e, d) => (e ? bad(e) : ok(d))))
      downloadBlob(new Blob([data as BlobPart], { type: 'application/zip' }), 'renamed-files.zip'); setProg(1); toast(`Packed ${names.length} renamed files`)
    } catch (e: any) { toast(e?.message || String(e), 'error') } finally { setBusy(false) }
  }
  const renameInPlace = async () => {
    if (res.dup.size) return toast('Fix the duplicate names first', 'error')
    setBusy(true); setProg(0); let ok = 0, fail = 0
    for (let i = 0; i < sorted.length; i++) {
      const it = sorted[i], nn = res.names[i]
      if (nn !== it.name) { try { await it.handle.move(nn); ok++ } catch { fail++ } }
      setProg((i + 1) / sorted.length)
    }
    setBusy(false)
    if (fail) toast(`Renamed ${ok}. ${fail} could not be renamed; your browser may not allow renaming here. Use the ZIP option instead.`, 'error'); else toast(`Renamed ${ok} file${ok === 1 ? '' : 's'} in the folder`)
    setItems((s) => s.map((x) => { const i = sorted.indexOf(x); return i >= 0 && res.names[i] !== x.name && !fail ? { ...x, name: res.names[i] } : x }))
  }

  if (!items.length) return (
    <div className="space-y-3">
      <Dropzone multiple onFiles={addFiles} label="Drop the files you want to rename" sub="Preview every new name before saving. Files stay on your device." />
      <div className="flex flex-wrap items-center gap-4">
        {canFolder && <Button variant="outline" icon={<FolderOpen className="size-4" />} onClick={pickFolder}>Open a folder to rename in place</Button>}
        <Switch checked={useExif} onChange={setUseExif} label="Read photo dates (EXIF)" />
      </div>
    </div>
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-3">
        <Bar>
          <Badge>{items.length} files</Badge><Badge color="#14B8A6">{changed} will change</Badge>{res.dup.size > 0 && <Badge color="#EF4444">{res.dup.size} clash</Badge>}
          <span className="text-xs text-muted">Order</span><Select value={sort} onChange={setSort} options={[{ value: 'added', label: 'As added' }, { value: 'name', label: 'By name' }, { value: 'date', label: 'By date' }, { value: 'size', label: 'By size' }]} className="h-8 w-32 text-xs" />
          <Button size="sm" variant="ghost" className="ml-auto" icon={<Trash2 className="size-4" />} onClick={() => setItems([])}>Clear</Button>
        </Bar>
        {res.dup.size > 0 && <Status kind="err">Some new names are the same. Add {'{n}'} to the pattern, or they will get (2), (3) added in the ZIP.</Status>}
        <div className="scrollbar-thin max-h-[560px] overflow-auto rounded-xl border border-border bg-surface">
          {sorted.map((it, i) => (
            <div key={i} className={cn('grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border/60 px-3 py-1.5 text-[13px]', res.dup.has(i) && 'bg-danger/5')}>
              <span className="truncate font-mono text-muted" title={it.name}>{it.name}</span>
              <ArrowRight className="size-3.5 text-muted" />
              <span className={cn('truncate font-mono', res.names[i] !== it.name ? 'text-accent' : 'text-muted', res.dup.has(i) && 'text-danger')} title={res.names[i]}>{res.dup.has(i) && <AlertTriangle className="mr-1 inline size-3" />}{res.names[i]}</span>
            </div>
          ))}
        </div>
        {busy && <Progress value={prog} label="Working" />}
      </div>
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-5">
          <div><Label>Name pattern</Label><Input value={o.pattern} onChange={(e) => set('pattern', e.target.value)} className="font-mono" aria-label="Name pattern" /></div>
          <div className="flex flex-wrap gap-1">{TOKENS.map(([t, l]) => <Chip key={t} title={l} onClick={() => set('pattern', o.pattern.replace(/(\.\{ext\})?$/, (m) => (o.pattern.includes(t) ? m : `-${t}${m}`)).replace(/^-/, ''))}>{t}</Chip>)}</div>
          <div className="grid grid-cols-2 gap-2"><div><Label>Start at</Label><Input aria-label="Start at" type="number" value={o.start} onChange={(e) => set('start', Number(e.target.value) || 0)} /></div><div><Label>Step</Label><Input aria-label="Step" type="number" value={o.step} onChange={(e) => set('step', Number(e.target.value) || 1)} /></div></div>
          <div className="grid grid-cols-2 gap-2"><div><Label>Find</Label><Input aria-label="Find" value={o.find} onChange={(e) => set('find', e.target.value)} className="font-mono" /></div><div><Label>Replace</Label><Input aria-label="Replace" value={o.replace} onChange={(e) => set('replace', e.target.value)} className="font-mono" /></div></div>
          <div className="flex flex-wrap gap-4"><Switch checked={o.regex} onChange={(v) => set('regex', v)} label="Regex" /><Switch checked={o.matchCase} onChange={(v) => set('matchCase', v)} label="Match case" /></div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><Label>Case</Label><Select value={o.caseMode} onChange={(v) => set('caseMode', v)} options={[{ value: 'keep', label: 'Keep' }, { value: 'lower', label: 'lower' }, { value: 'upper', label: 'UPPER' }, { value: 'title', label: 'Title' }, { value: 'kebab', label: 'kebab-case' }, { value: 'snake', label: 'snake_case' }]} /></label>
            <label className="block"><Label>Spaces</Label><Select value={o.spaces} onChange={(v) => set('spaces', v)} options={[{ value: 'keep', label: 'Keep' }, { value: 'dash', label: 'To -' }, { value: 'underscore', label: 'To _' }, { value: 'remove', label: 'Remove' }]} /></label>
          </div>
          <Switch checked={useExif} onChange={setUseExif} label="Use photo dates for {date}" />
          {folderMode ? <Button className="w-full" size="lg" loading={busy} icon={<FolderOpen className="size-4" />} onClick={renameInPlace} disabled={!changed}>Rename in the folder</Button> : null}
          {sorted.every((x) => x.file) && <Button className="w-full" size={folderMode ? 'md' : 'lg'} variant={folderMode ? 'outline' : 'primary'} loading={busy && !folderMode} icon={<Download className="size-4" />} onClick={saveZip}>Download as ZIP</Button>}
          <p className="text-xs text-muted">{folderMode ? 'Renaming in place needs a recent Chromium browser. If it is not allowed, the ZIP keeps your originals untouched.' : `The ZIP holds renamed copies (${formatBytes(items.reduce((a, x) => a + x.size, 0))}, no recompression). Your original files are not changed.`}</p>
        </div>
      </aside>
    </div>
  )
}
