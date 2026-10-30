import { useRef, useState } from 'react'
import { ListChecks, Download, X, CheckCircle2, XCircle, HelpCircle } from 'lucide-react'
import { Button, Dropzone, Field, Select, Tabs, ToolGrid, Progress, Label, cn } from '@/components/ui'
import { downloadBlob, formatBytes } from '@/lib/files'
import { writeManifest, parseManifest, baseOf, type Algo, type ManifestLine } from '@/lib/b14/archive'
import { hashFile, ALGOS } from '@/lib/b14/hash'
import { OpenButton, Tile } from '@/lib/b14/ui'
import { toast } from '@/components/toast'

const pathOf = (f: File) => (f as any).webkitRelativePath || f.name
const EXT: Record<Algo, string> = { md5: 'md5', sha1: 'sha1', sha256: 'sha256', sha512: 'sha512', crc32: 'sfv' }

export default function ChecksumManifest() {
  const [tab, setTab] = useState<'create' | 'verify'>('create')
  return <div className="space-y-4"><Tabs value={tab} onChange={setTab} tabs={[{ value: 'create', label: 'Create manifest' }, { value: 'verify', label: 'Verify files' }]} />{tab === 'create' ? <Create /> : <Verify />}</div>
}

function useHashRun() {
  const [prog, setProg] = useState(0)
  const [label, setLabel] = useState('')
  const sig = useRef({ aborted: false })
  const run = async (files: File[], algo: Algo, each: (f: File, h: string) => void) => {
    sig.current = { aborted: false }
    const total = files.reduce((a, f) => a + f.size, 0) || 1
    let done = 0
    try {
      for (const f of files) { setLabel(f.name); each(f, await hashFile(f, algo, (p) => setProg(Math.max(0.01, (done + p * f.size) / total)), sig.current)); done += f.size }
    } catch (e: any) { if (e?.name !== 'CancelledError') toast(e?.message || 'Hashing failed', 'error') } finally { setProg(0) }
  }
  return { prog, label, run, cancel: () => (sig.current.aborted = true) }
}

function Create() {
  const [files, setFiles] = useState<File[]>([])
  const [algo, setAlgo] = useState<Algo>('sha256')
  const [style, setStyle] = useState<'gnu' | 'bsd' | 'sfv'>('gnu')
  const [rows, setRows] = useState<{ path: string; hash: string }[]>([])
  const h = useHashRun()
  const go = async () => { setRows([]); const out: { path: string; hash: string }[] = []; await h.run(files, algo, (f, x) => { out.push({ path: pathOf(f), hash: x }); setRows([...out]) }) }
  const text = rows.length ? writeManifest(rows, algo, algo === 'crc32' ? 'sfv' : style) : ''
  if (!files.length) return <Dropzone multiple onFiles={setFiles} label="Drop the files to list" sub="Make a SHA256SUMS, MD5SUMS or SFV file so you or anyone else can check the files later. Large files are read in pieces." />
  return (
    <ToolGrid
      main={<>
        <Label hint={`${files.length} files, ${formatBytes(files.reduce((a, f) => a + f.size, 0))}`}>Files</Label>
        <div className="scrollbar-thin max-h-60 space-y-1 overflow-auto">{files.map((f, i) => <div key={i} className="flex gap-2 rounded-lg bg-surface px-2 py-1 text-xs"><span className="min-w-0 flex-1 truncate font-mono">{pathOf(f)}</span><span className="text-muted">{formatBytes(f.size)}</span></div>)}</div>
        <OpenButton multiple onFiles={(f) => setFiles([...files, ...f])} label="Add files" />
        {text && <><Label>Manifest</Label><pre className="scrollbar-thin max-h-72 overflow-auto rounded-xl border border-border bg-surface p-3 font-mono text-[11px]">{text}</pre></>}
      </>}
      side={<>
        <Field label="Algorithm"><Select value={algo} onChange={setAlgo} options={ALGOS} /></Field>
        {algo !== 'crc32' && <Field label="Style"><Select value={style} onChange={(v) => setStyle(v as 'gnu' | 'bsd')} options={[{ value: 'gnu', label: 'hash  file (sha256sum)' }, { value: 'bsd', label: 'SHA256 (file) = hash (BSD, macOS)' }]} /></Field>}
        <Button className="w-full" icon={<ListChecks className="size-4" />} onClick={go} disabled={h.prog > 0}>Hash {files.length} files</Button>
        {h.prog > 0 && <><Progress value={h.prog} label={h.label} /><Button size="sm" variant="ghost" className="w-full" icon={<X className="size-4" />} onClick={h.cancel}>Cancel</Button></>}
        {text && <Button className="w-full" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([text], { type: 'text/plain' }), algo === 'crc32' ? 'checksums.sfv' : `${algo.toUpperCase()}SUMS.${EXT[algo]}`)}>Download manifest</Button>}
        <Button variant="ghost" size="sm" className="w-full" onClick={() => { setFiles([]); setRows([]) }}>Start over</Button>
      </>}
    />
  )
}

function Verify() {
  const [list, setList] = useState<ManifestLine[]>([])
  const [mname, setMname] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [res, setRes] = useState<Record<string, 'ok' | 'bad' | 'missing'>>({})
  const h = useHashRun()
  const openManifest = async (f: File) => { const l = parseManifest(await f.text()); if (!l.length) { toast('No checksum lines found in this file', 'error'); return } setList(l); setMname(f.name); setRes({}) }
  const find = (l: ManifestLine) => files.find((f) => pathOf(f) === l.path) ?? files.find((f) => f.name === baseOf(l.path))
  const go = async () => {
    const out: Record<string, 'ok' | 'bad' | 'missing'> = {}
    for (const l of list) if (!find(l)) out[l.path] = 'missing'
    setRes({ ...out })
    for (const l of list) { const f = find(l); if (!f) continue; await h.run([f], l.algo ?? 'sha256', (_f, x) => { out[l.path] = x.toLowerCase() === l.hash ? 'ok' : 'bad'; setRes({ ...out }) }) }
  }
  const n = (k: string) => Object.values(res).filter((v) => v === k).length
  return (
    <ToolGrid
      main={<>
        {!list.length ? <Dropzone accept=".sha256,.sha1,.md5,.sha512,.sfv,.txt,.sum,.sums,SHA256SUMS,MD5SUMS" onFiles={(f) => openManifest(f[0])} label="1. Drop the checksum file" sub="SHA256SUMS, MD5SUMS, .sha256, .md5, .sfv or BSD style lines." compact />
          : <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm"><ListChecks className="size-4 text-accent" /><span className="flex-1 truncate">{mname}: {list.length} entries</span><Button size="sm" variant="ghost" onClick={() => { setList([]); setRes({}) }}>Change</Button></div>}
        {list.length > 0 && <Dropzone multiple compact onFiles={(f) => setFiles([...files, ...f])} label={files.length ? `${files.length} files added, drop more` : '2. Drop the files to check'} sub="Matched by name." />}
        {list.length > 0 && <div className="scrollbar-thin max-h-[420px] space-y-1 overflow-auto">{list.map((l) => { const r = res[l.path]; return <div key={l.path} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs">{r === 'ok' ? <CheckCircle2 className="size-4 text-success" /> : r === 'bad' ? <XCircle className="size-4 text-danger" /> : <HelpCircle className={cn('size-4', r === 'missing' ? 'text-warn' : 'text-muted')} />}<span className="min-w-0 flex-1 truncate font-mono">{l.path}</span><span className={cn(r === 'ok' ? 'text-success' : r === 'bad' ? 'text-danger' : 'text-muted')}>{r === 'ok' ? 'Match' : r === 'bad' ? 'Does not match' : r === 'missing' ? 'File not added' : find(l) ? 'Ready' : 'Waiting for file'}</span></div> })}</div>}
      </>}
      side={<>
        <div className="grid grid-cols-3 gap-2"><Tile label="Match" value={n('ok')} /><Tile label="Bad" value={n('bad')} /><Tile label="Missing" value={n('missing')} /></div>
        <Button className="w-full" icon={<ListChecks className="size-4" />} onClick={go} disabled={!list.length || !files.length || h.prog > 0}>Verify</Button>
        {h.prog > 0 && <><Progress value={h.prog} label={h.label} /><Button size="sm" variant="ghost" className="w-full" onClick={h.cancel}>Cancel</Button></>}
        <p className="text-xs text-muted">The algorithm is picked from each line (MD5, SHA-1, SHA-256, SHA-512 or CRC32). A mismatch means the file changed or was damaged in transfer.</p>
      </>}
    />
  )
}
