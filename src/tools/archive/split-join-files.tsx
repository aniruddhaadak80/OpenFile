import { useMemo, useRef, useState } from 'react'
import { Scissors, Combine, Download, X, ShieldCheck } from 'lucide-react'
import { Button, Dropzone, Field, Input, Select, Switch, Tabs, ToolGrid, Progress, Label, FileChip } from '@/components/ui'
import { downloadBlob, formatBytes } from '@/lib/files'
import { partSizes, partName, orderParts, writeManifest } from '@/lib/b14/archive'
import { hashFile } from '@/lib/b14/hash'
import { OpenButton } from '@/lib/b14/ui'
import { toast } from '@/components/toast'

const MB = 1024 * 1024
const PRESETS = [{ value: '10', label: '10 MB' }, { value: '25', label: '25 MB (email)' }, { value: '100', label: '100 MB' }, { value: '700', label: '700 MB (CD)' }, { value: '2000', label: '2 GB' }, { value: '4095', label: '4 GB (FAT32 limit)' }, { value: 'custom', label: 'Custom size' }, { value: 'count', label: 'Number of parts' }]

export default function SplitJoinFiles() {
  const [tab, setTab] = useState<'split' | 'join'>('split')
  return <div className="space-y-4"><Tabs value={tab} onChange={setTab} tabs={[{ value: 'split', label: <span className="inline-flex items-center gap-1.5"><Scissors className="size-4" />Split a file</span> }, { value: 'join', label: <span className="inline-flex items-center gap-1.5"><Combine className="size-4" />Join parts</span> }]} />{tab === 'split' ? <Split /> : <Join />}</div>
}

function Split() {
  const [file, setFile] = useState<File | null>(null)
  const [preset, setPreset] = useState('25')
  const [custom, setCustom] = useState(50)
  const [count, setCount] = useState(3)
  const [style, setStyle] = useState<'num' | 'part'>('num')
  const [sums, setSums] = useState(true)
  const [busy, setBusy] = useState(0)
  const sizes = useMemo(() => (file ? (preset === 'count' ? partSizes(file.size, { mode: 'count', count }) : partSizes(file.size, { mode: 'size', size: (preset === 'custom' ? custom : +preset) * MB })) : []), [file, preset, custom, count])
  const part = (i: number) => { const at = sizes.slice(0, i).reduce((a, b) => a + b, 0); return file!.slice(at, at + sizes[i]) }
  const one = (i: number) => downloadBlob(part(i), partName(file!.name, i, sizes.length, style))
  const all = async () => {
    for (let i = 0; i < sizes.length; i++) { one(i); await new Promise((r) => setTimeout(r, 450)) }
    if (sums) {
      setBusy(0.01)
      const rows: { path: string; hash: string }[] = [{ path: file!.name, hash: await hashFile(file!, 'sha256', (p) => setBusy(Math.max(0.01, p))) }]
      setBusy(0)
      downloadBlob(new Blob([writeManifest(rows, 'sha256', 'gnu')], { type: 'text/plain' }), `${file!.name}.sha256`)
    }
  }
  if (!file) return <Dropzone onFiles={(f) => setFile(f[0])} label="Drop any file to split" sub="Cut a big video, backup or archive into parts that fit email, chat apps, FAT32 drives or upload limits. Even multi GB files, nothing is loaded at once." />
  return (
    <ToolGrid
      main={<>
        <FileChip file={file} onRemove={() => setFile(null)} />
        <Label hint={`${sizes.length} parts`}>Parts</Label>
        <div className="scrollbar-thin max-h-[440px] space-y-1.5 overflow-auto">{sizes.map((s, i) => <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate font-mono text-xs">{partName(file.name, i, sizes.length, style)}</span><span className="text-xs text-muted">{formatBytes(s)}</span><Button size="sm" variant="ghost" aria-label={`Download part ${i + 1}`} onClick={() => one(i)}><Download className="size-4" /></Button></div>)}</div>
      </>}
      side={<>
        <Field label="Part size"><Select value={preset} onChange={setPreset} options={PRESETS} /></Field>
        {preset === 'custom' && <Field label="Size of each part (MB)"><Input type="number" min={1} value={custom} onChange={(e) => setCustom(Math.max(1, +e.target.value || 1))} /></Field>}
        {preset === 'count' && <Field label="Number of parts"><Input type="number" min={2} max={999} value={count} onChange={(e) => setCount(Math.min(999, Math.max(2, Math.round(+e.target.value || 2))))} /></Field>}
        <Field label="Part names"><Select value={style} onChange={(v) => setStyle(v as 'num' | 'part')} options={[{ value: 'num', label: 'name.001, name.002 (7-Zip style)' }, { value: 'part', label: 'name.part1, name.part2' }]} /></Field>
        <Switch checked={sums} onChange={setSums} label="Also save a SHA-256 checksum" />
        <Button className="w-full" icon={<Download className="size-4" />} onClick={all}>Download all {sizes.length} parts</Button>
        {busy > 0 && <Progress value={busy} label="Hashing the original" />}
        <p className="text-xs text-muted">Your browser may ask once to allow several downloads. Parts are plain byte slices, so they join back with this tool, 7-Zip, or copy /b on Windows and cat on macOS and Linux.</p>
      </>}
    />
  )
}

function Join() {
  const [parts, setParts] = useState<File[]>([])
  const [hash, setHash] = useState<string | null>(null)
  const [prog, setProg] = useState(0)
  const abort = useRef({ aborted: false })
  const ord = useMemo(() => orderParts(parts.map((p) => p.name)), [parts])
  const ordered = ord.order.map((i) => parts[i])
  const [name, setName] = useState('')
  const outName = name || ord.joined
  const total = parts.reduce((a, p) => a + p.size, 0)
  const join = () => downloadBlob(new Blob(ordered), outName)
  const verify = async () => {
    abort.current = { aborted: false }; setHash(null); setProg(0.01)
    try { setHash(await hashFile(new Blob(ordered), 'sha256', setProg, abort.current)) } catch (e: any) { if (e?.name !== 'CancelledError') toast(e?.message || 'Hashing failed', 'error') } finally { setProg(0) }
  }
  if (!parts.length) return <Dropzone multiple onFiles={(f) => setParts(f)} label="Drop all the parts" sub="Files like movie.mkv.001, .002 or backup.part1, .part2. They are put in order for you." />
  return (
    <ToolGrid
      main={<>
        <Label hint={`${parts.length} parts, ${formatBytes(total)}`}>In this order</Label>
        <div className="scrollbar-thin max-h-[440px] space-y-1.5 overflow-auto">{ordered.map((p, i) => <div key={p.name + i} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm"><span className="w-8 text-xs text-muted">{i + 1}</span><span className="min-w-0 flex-1 truncate font-mono text-xs">{p.name}</span><span className="text-xs text-muted">{formatBytes(p.size)}</span><Button size="sm" variant="ghost" aria-label="Remove" onClick={() => setParts(parts.filter((x) => x !== p))}><X className="size-4" /></Button></div>)}</div>
        {ord.gaps.length > 0 && <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">Part {ord.gaps.join(', ')} seems to be missing. The joined file will be broken without it.</p>}
        <OpenButton multiple onFiles={(f) => setParts([...parts, ...f])} label="Add parts" />
      </>}
      side={<>
        <Field label="Joined file name"><Input value={outName} onChange={(e) => setName(e.target.value)} /></Field>
        <Button className="w-full" icon={<Combine className="size-4" />} onClick={join}>Join and download ({formatBytes(total)})</Button>
        <Button className="w-full" variant="outline" icon={<ShieldCheck className="size-4" />} onClick={verify} disabled={prog > 0}>Compute SHA-256</Button>
        {prog > 0 && <><Progress value={prog} label="Hashing" /><Button size="sm" variant="ghost" className="w-full" onClick={() => (abort.current.aborted = true)}>Cancel</Button></>}
        {hash && <div className="break-all rounded-xl bg-surface-2/50 p-2 font-mono text-[11px]">{hash}</div>}
        <p className="text-xs text-muted">Compare the hash with the .sha256 file saved when you split, to be sure nothing changed.</p>
        <Button variant="ghost" size="sm" className="w-full" onClick={() => { setParts([]); setHash(null) }}>Start over</Button>
      </>}
    />
  )
}
