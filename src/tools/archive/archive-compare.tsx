import { useMemo, useState } from 'react'
import { GitCompare, Download } from 'lucide-react'
import { Button, Dropzone, Switch, ToolGrid, Label, FileChip, Spinner, cn } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { Tile } from '@/lib/b14/ui'
import { toCsv, DlButton } from '@/lib/bcat/kit'
import { toast } from '@/components/toast'
import { diffLines } from 'diff'

interface Entry { path: string; size: number; hash: string; data: Uint8Array }
interface Side { label: string; entries: Map<string, Entry> }
type Status = 'same' | 'changed' | 'added' | 'removed'

async function sha1(d: Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', d as BufferSource)), (x) => x.toString(16).padStart(2, '0')).join('') }
async function load(files: File[]): Promise<Side> {
  const m = new Map<string, Entry>()
  if (files.length === 1 && /\.(zip|jar|apk|docx|xlsx|pptx|epub|odt|cbz)$/i.test(files[0].name)) {
    const { unzipSync } = await import('fflate')
    const z = unzipSync(new Uint8Array(await files[0].arrayBuffer()))
    for (const [p, d] of Object.entries(z)) if (!p.endsWith('/')) m.set(p, { path: p, size: d.length, hash: await sha1(d), data: d })
    return { label: files[0].name, entries: m }
  }
  const strip = (p: string) => p.split('/').slice(1).join('/') || p
  const rel = files.every((f) => (f as any).webkitRelativePath)
  for (const f of files) { const d = new Uint8Array(await f.arrayBuffer()); const p = rel ? strip((f as any).webkitRelativePath) : f.name; m.set(p, { path: p, size: d.length, hash: await sha1(d), data: d }) }
  return { label: `${files.length} files`, entries: m }
}
const isText = (d: Uint8Array) => { const n = Math.min(d.length, 4000); for (let i = 0; i < n; i++) if (d[i] === 0) return false; return true }

export default function ArchiveCompare() {
  const [a, setA] = useState<Side | null>(null)
  const [b, setB] = useState<Side | null>(null)
  const [busy, setBusy] = useState(false)
  const [hideSame, setHideSame] = useState(true)
  const [sel, setSel] = useState<string | null>(null)
  const pick = async (files: File[], which: 'a' | 'b') => { setBusy(true); try { (which === 'a' ? setA : setB)(await load(files)) } catch (e: any) { toast(e?.message || 'Could not read this archive', 'error') } finally { setBusy(false) } }
  const rows = useMemo(() => {
    if (!a || !b) return []
    const keys = [...new Set([...a.entries.keys(), ...b.entries.keys()])].sort()
    return keys.map((k) => { const x = a.entries.get(k), y = b.entries.get(k); const s: Status = !x ? 'added' : !y ? 'removed' : x.hash === y.hash ? 'same' : 'changed'; return { path: k, s, sa: x?.size, sb: y?.size } })
  }, [a, b])
  const count = (s: Status) => rows.filter((r) => r.s === s).length
  const shown = rows.filter((r) => !hideSame || r.s !== 'same')
  const cur = sel && a && b ? { x: a.entries.get(sel), y: b.entries.get(sel) } : null
  const diff = useMemo(() => (cur?.x && cur?.y && isText(cur.x.data) && isText(cur.y.data) && cur.x.size + cur.y.size < 4e6 ? diffLines(new TextDecoder().decode(cur.x.data), new TextDecoder().decode(cur.y.data)) : null), [sel, a, b])
  const color: Record<Status, string> = { same: 'text-muted', changed: 'text-warn', added: 'text-success', removed: 'text-danger' }
  const slot = (v: Side | null, which: 'a' | 'b') => v ? <FileChip file={{ name: `${which === 'a' ? 'Old' : 'New'}: ${v.label}`, size: [...v.entries.values()].reduce((s, e) => s + e.size, 0) }} onRemove={() => (which === 'a' ? setA : setB)(null)} /> : <Dropzone compact multiple onFiles={(f) => pick(f, which)} label={which === 'a' ? 'Old version (ZIP or files)' : 'New version (ZIP or files)'} sub="ZIP, JAR, APK, DOCX, EPUB, or loose files" />
  return (
    <ToolGrid
      main={<>
        <div className="grid gap-3 sm:grid-cols-2">{slot(a, 'a')}{slot(b, 'b')}</div>
        {busy && <Spinner label="Reading and hashing files" />}
        {a && b && <>
          <div className="grid grid-cols-4 gap-2"><Tile label="Changed" value={count('changed')} /><Tile label="Added" value={count('added')} /><Tile label="Removed" value={count('removed')} /><Tile label="Same" value={count('same')} /></div>
          <div className="scrollbar-thin max-h-80 overflow-auto rounded-xl border border-border bg-surface">
            {shown.map((r) => <button key={r.path} type="button" onClick={() => setSel(r.path)} className={cn('flex w-full cursor-pointer items-center gap-3 border-b border-border/60 px-3 py-1.5 text-left text-xs', sel === r.path && 'bg-accent/10')}><span className={cn('w-16 shrink-0 font-semibold capitalize', color[r.s])}>{r.s}</span><span className="min-w-0 flex-1 truncate font-mono">{r.path}</span><span className="text-muted">{r.sa != null ? formatBytes(r.sa) : '-'} to {r.sb != null ? formatBytes(r.sb) : '-'}</span></button>)}
            {!shown.length && <div className="p-4 text-sm text-success">Both versions have exactly the same files.</div>}
          </div>
          {sel && <div><Label>{sel}</Label>{diff ? <div className="scrollbar-thin max-h-80 overflow-auto rounded-xl border border-border bg-surface font-mono text-xs">{diff.map((p, i) => <div key={i} className={cn('whitespace-pre-wrap break-all px-2', p.added ? 'bg-success/10' : p.removed ? 'bg-danger/10' : 'text-muted')}>{(p.added || p.removed) ? p.value : p.value.split('\n').length > 6 ? `... ${p.value.split('\n').length - 1} same lines ...\n` : p.value}</div>)}</div> : <p className="text-xs text-muted">{cur?.x && cur?.y ? 'Binary file, contents differ.' : 'Only in one version.'}</p>}</div>}
        </>}
      </>}
      side={<>
        <Switch checked={hideSame} onChange={setHideSame} label="Hide files that are the same" />
        {rows.length > 0 && <DlButton name="archive-compare.csv" mime="text/csv" data={() => toCsv([['status', 'path', 'old bytes', 'new bytes'], ...rows.map((r) => [r.s, r.path, r.sa ?? '', r.sb ?? ''])])}>Download report (CSV)</DlButton>}
        <Button variant="ghost" size="sm" className="w-full" icon={<Download className="size-4 rotate-180" />} onClick={() => { setA(null); setB(null); setSel(null) }}>Start over</Button>
        <p className="flex gap-1.5 text-xs text-muted"><GitCompare className="size-4 shrink-0" />Files are compared by SHA-1 of their contents. Click a changed text file to see a line diff.</p>
      </>}
    />
  )
}
