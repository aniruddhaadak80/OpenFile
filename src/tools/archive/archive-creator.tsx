import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Archive, FolderPlus, Plus, X, Lock, File as FileIcon } from 'lucide-react'
import { Button, Dropzone, Input, Label, Select, Slider, Switch, ToolGrid, ResultCard, ErrorNote } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { createArchive, cancelArchive, ARC_EXT, type ArcFormat } from '@/lib/b4/archive'
import { StatusLine } from '@/lib/b4/ui'
import { Note } from '@/tools/video/_media/ui'

type Entry = { id: string; path: string; file: File }
const FORMATS: { value: ArcFormat; label: string }[] = [
  { value: 'zip', label: 'ZIP (works everywhere)' }, { value: '7z', label: '7Z (smallest)' }, { value: 'tar.gz', label: 'TAR.GZ' },
  { value: 'tar.xz', label: 'TAR.XZ' }, { value: 'tar.bz2', label: 'TAR.BZ2' }, { value: 'tar.zst', label: 'TAR.ZST' }, { value: 'tar', label: 'TAR (no compression)' },
]

/** Pick a unique path in a set ("a.txt" -> "a (2).txt"). */
export function uniquePath(p: string, taken: Set<string>) {
  if (!taken.has(p)) return p
  const m = p.match(/^(.*?)(\.[^./]+)?$/)!
  for (let i = 2; ; i++) { const c = `${m[1]} (${i})${m[2] ?? ''}`; if (!taken.has(c)) return c }
}

export default function ArchiveCreator() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [fmt, setFmt] = useState<ArcFormat>('zip')
  const [level, setLevel] = useState(6)
  const [name, setName] = useState('archive')
  const [pw, setPw] = useState('')
  const [aes, setAes] = useState(true)
  const [hideNames, setHideNames] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Blob | null>(null)
  const dirInput = useRef<HTMLInputElement>(null)

  const add = (files: File[]) => setEntries((cur) => {
    const taken = new Set(cur.map((e) => e.path))
    const next = [...cur]
    for (const f of files) { const p = uniquePath(((f as any).webkitRelativePath || f.name).replace(/^\/+/, ''), taken); taken.add(p); next.push({ id: Math.random().toString(36).slice(2), path: p, file: f }) }
    return next
  })
  const total = entries.reduce((a, e) => a + e.file.size, 0)
  const canPw = fmt === 'zip' || fmt === '7z'

  const make = async () => {
    setBusy(true); setError(null); setResult(null); setStatus('Reading files')
    try {
      const files = await Promise.all(entries.map(async (e) => ({ path: e.path, data: new Uint8Array(await e.file.arrayBuffer()) })))
      setStatus('Compressing')
      const blob = await createArchive(files, fmt, { level, password: canPw && pw ? pw : undefined, zipAes: aes, encryptNames: hideNames, onStatus: setStatus })
      setResult(blob)
    } catch (e: any) { if (e?.name !== 'CancelledError') setError(e?.message || 'Could not create the archive.') } finally { setBusy(false) }
  }

  const folderPicker = <input ref={dirInput} type="file" hidden multiple {...({ webkitdirectory: '', directory: '' } as any)} onChange={(e) => { add(Array.from(e.target.files ?? [])); e.target.value = '' }} />

  if (!entries.length) return (
    <div className="space-y-3">
      <Dropzone multiple onFiles={add} label="Drop files to pack into an archive" sub="Make ZIP (with AES-256 password), 7Z, TAR, TAR.GZ, TAR.XZ, TAR.BZ2 or TAR.ZST. Nothing is uploaded." />
      <div className="text-center">{folderPicker}<Button variant="outline" icon={<FolderPlus className="size-4" />} onClick={() => dirInput.current?.click()}>Or choose a whole folder</Button></div>
    </div>
  )

  return (
    <ToolGrid
      main={<>
        <div className="flex items-center justify-between"><Label className="mb-0">{entries.length} item{entries.length > 1 ? 's' : ''} · {formatBytes(total)}</Label><Button variant="ghost" size="sm" onClick={() => { if (busy) cancelArchive(); setEntries([]); setResult(null) }}>Start over</Button></div>
        <div className="max-h-[50vh] space-y-1 overflow-auto rounded-xl border border-border bg-surface p-1 scrollbar-thin">
          <AnimatePresence initial={false}>
            {entries.map((e) => (
              <motion.div key={e.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                <FileIcon className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate">{e.path}</span>
                <span className="font-mono text-xs text-muted">{formatBytes(e.file.size)}</span>
                {!busy && <button onClick={() => setEntries((l) => l.filter((x) => x.id !== e.id))} className="cursor-pointer rounded p-1 text-muted hover:text-danger" aria-label={`Remove ${e.path}`}><X className="size-3.5" /></button>}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex-1"><Dropzone compact multiple onFiles={add} label={<span className="inline-flex items-center gap-1.5"><Plus className="size-4" />Add files</span>} /></div>
          {folderPicker}<Button variant="outline" className="self-center" icon={<FolderPlus className="size-4" />} onClick={() => dirInput.current?.click()}>Add folder</Button>
        </div>
        {busy && <StatusLine text={status} />}
        <ErrorNote error={error} />
        {result && <ResultCard blob={result} filename={`${name || 'archive'}.${ARC_EXT[fmt]}`} originalSize={total} onReset={() => setResult(null)} />}
      </>}
      side={<>
        <div><Label>Archive name</Label><Input value={name} onChange={(e) => setName(e.target.value.replace(/[\\/:*?"<>|]/g, ''))} aria-label="Archive name" /></div>
        <div><Label>Format</Label><Select value={fmt} onChange={setFmt} options={FORMATS} /></div>
        {fmt !== 'tar' && <Slider label="Compression level" value={level} onChange={setLevel} min={fmt === 'zip' || fmt === '7z' ? 0 : 1} max={9} suffix={level === 0 ? ' (store)' : level >= 8 ? ' (max)' : ''} />}
        {canPw ? (
          <div className="space-y-2">
            <Label>Password (optional)</Label>
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Leave empty for no password" aria-label="Password" autoComplete="new-password" />
            {pw && fmt === 'zip' && <Switch checked={aes} onChange={setAes} label="AES-256 encryption" />}
            {pw && fmt === 'zip' && !aes && <Note tone="warn">Classic ZIP encryption opens in every app but is weak. Use AES-256 when you can.</Note>}
            {pw && fmt === '7z' && <Switch checked={hideNames} onChange={setHideNames} label="Also hide file names" />}
          </div>
        ) : <p className="text-xs text-muted">TAR formats cannot hold a password. Pick ZIP or 7Z for that.</p>}
        <Button size="lg" className="w-full" icon={pw && canPw ? <Lock className="size-5" /> : <Archive className="size-5" />} onClick={make} loading={busy}>Create .{ARC_EXT[fmt]}</Button>
        {busy && <Button variant="outline" className="w-full" onClick={() => { cancelArchive(); setBusy(false) }}>Cancel</Button>}
        <p className="text-xs text-muted">Packed with the 7-Zip engine in your browser (about 1.6 MB, downloaded once).</p>
      </>}
    />
  )
}
