import { useState } from 'react'
import { Magnet, FileDown } from 'lucide-react'
import { Dropzone, Field, Input, ToolGrid, ErrorNote, CopyButton, Label, Button } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { parseTorrent, parseMagnet, type TorrentInfo } from '@/lib/b14/dev'
import { KV, DataTable } from './_b5/shell'
import { toCsv, DlButton } from '@/lib/bcat/kit'

export default function TorrentInspector() {
  const [file, setFile] = useState<File | null>(null)
  const [t, setT] = useState<TorrentInfo | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [mag, setMag] = useState('')
  const open = async (f: File) => { setErr(null); try { setT(await parseTorrent(new Uint8Array(await f.arrayBuffer()))); setFile(f) } catch (e: any) { setErr(e?.message || 'Could not read this torrent file.') } }
  const m = (() => { try { return mag.trim() ? parseMagnet(mag.trim()) : null } catch (e: any) { return { error: e.message } as any } })()
  if (!t || !file) return (
    <div className="space-y-4">
      <Dropzone accept=".torrent,application/x-bittorrent" onFiles={(f) => open(f[0])} label="Drop a .torrent file" sub="See the files, sizes, trackers and info hash, and copy a magnet link. Nothing is downloaded or shared." />
      <ErrorNote error={err} />
      <div className="rounded-2xl border border-border bg-surface p-4">
        <Field label="Or paste a magnet link"><Input value={mag} onChange={(e) => setMag(e.target.value)} placeholder="magnet:?xt=urn:btih:..." className="font-mono text-xs" /></Field>
        {m && (m.error ? <p className="mt-2 text-sm text-danger">{m.error}</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2"><KV label="Info hash" value={m.infoHash} /><KV label="Name" value={m.name} mono={false} /><KV label="Trackers" value={String(m.trackers.length)} copy={false} />{m.size != null && <KV label="Size" value={formatBytes(m.size)} copy={false} />}{m.trackers.map((u: string, i: number) => <KV key={i} label={`Tracker ${i + 1}`} value={u} />)}</div>)}
      </div>
    </div>
  )
  const files = [...t.files].sort((a, b) => b.size - a.size)
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setT(null); setFile(null) }} />
        <div className="grid gap-2 sm:grid-cols-2">
          <KV label="Name" value={t.name} mono={false} />
          <KV label="Total size" value={`${formatBytes(t.total)} in ${t.files.length} file${t.files.length === 1 ? '' : 's'}`} copy={false} />
          <KV label="Info hash (v1)" value={t.infoHash} />
          <KV label="Pieces" value={`${t.pieces.toLocaleString()} x ${formatBytes(t.pieceLength)}`} copy={false} />
          {t.created && <KV label="Created" value={t.created.toLocaleString()} copy={false} />}
          {t.createdBy && <KV label="Created by" value={t.createdBy} mono={false} copy={false} />}
          {t.comment && <KV label="Comment" value={t.comment} mono={false} />}
          <KV label="Private" value={t.private ? 'Yes (DHT and peer exchange off)' : 'No'} copy={false} mono={false} />
        </div>
        <Label hint={`${files.length} files`}>Files</Label>
        <DataTable columns={['Path', 'Size']} rows={files.map((f) => [f.path, formatBytes(f.size)])} className="max-h-96" />
      </>}
      side={<>
        <Label>Magnet link</Label>
        <textarea readOnly value={t.magnet} className="h-28 w-full resize-none rounded-xl border border-border bg-surface-2/50 p-2 font-mono text-[11px]" aria-label="Magnet link" />
        <div className="flex flex-wrap gap-2"><CopyButton text={t.magnet} label="Copy magnet" /><DlButton name={`${t.name}-files.csv`} mime="text/csv" data={() => toCsv([['path', 'bytes'], ...t.files.map((f) => [f.path, f.size])])}>Files CSV</DlButton></div>
        <Label hint={String(t.trackers.length)}>Trackers</Label>
        <div className="scrollbar-thin max-h-48 space-y-1 overflow-auto">{t.trackers.map((u) => <div key={u} className="truncate rounded-lg bg-surface-2/50 px-2 py-1 font-mono text-[11px]" title={u}>{u}</div>)}{!t.trackers.length && <p className="text-xs text-muted">No trackers, the file relies on DHT.</p>}</div>
        {t.webSeeds.length > 0 && <><Label>Web seeds</Label>{t.webSeeds.map((u) => <div key={u} className="truncate font-mono text-[11px]">{u}</div>)}</>}
        <Button variant="ghost" size="sm" icon={<FileDown className="size-4" />} onClick={() => { setT(null); setFile(null) }}>Open another</Button>
        <p className="flex gap-1.5 text-xs text-muted"><Magnet className="size-4 shrink-0" />The file is only read. This tool never connects to trackers or peers.</p>
      </>}
    />
  )
}
