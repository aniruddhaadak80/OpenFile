import { useState } from 'react'
import { Wrench, Download, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button, Dropzone, ToolGrid, ResultCard, ErrorNote, cn } from '@/components/ui'
import { baseName, downloadBlob, formatBytes } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { salvageZip, rebuildZip, type Salvaged } from '@/lib/b14/archive'
import { Tile } from '@/lib/b14/ui'

export default function ZipRepair() {
  const [file, setFile] = useState<File | null>(null)
  const [items, setItems] = useState<Salvaged[] | null>(null)
  const [out, setOut] = useState<Blob | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const open = async (f: File) => {
    setErr(null); setFile(f); setItems(null); setOut(null)
    await new Promise((r) => setTimeout(r, 30))
    try {
      const list = salvageZip(new Uint8Array(await f.arrayBuffer()))
      if (!list.length) throw new Error('No ZIP entries were found in this file. It may not be a ZIP, or the start of the file is missing.')
      setItems(list)
      if (list.some((i) => i.data)) setOut(new Blob([rebuildZip(list) as BlobPart], { type: 'application/zip' }))
    } catch (e: any) { setErr(e?.message || 'Could not read this file.') }
  }
  if (!file) return <Dropzone accept=".zip,.jar,.apk,.docx,.xlsx,.pptx,.epub,.cbz,.odt,application/zip" onFiles={(f) => open(f[0])} label="Drop a broken ZIP" sub="Rescues files from ZIPs that will not open: cut short downloads, damaged central directory, bad sectors. Also works on DOCX, XLSX, EPUB and APK, which are ZIPs inside." />
  const good = items?.filter((i) => i.ok).length ?? 0, part = items?.filter((i) => i.data && !i.ok).length ?? 0, lost = items?.filter((i) => !i.data).length ?? 0
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); setItems(null); setOut(null) }} />
        <ErrorNote error={err} />
        {items && <>
          <div className="grid grid-cols-3 gap-2"><Tile label="Recovered" value={good} /><Tile label="Partly" value={part} /><Tile label="Lost" value={lost} /></div>
          <div className="scrollbar-thin max-h-[460px] space-y-1 overflow-auto rounded-2xl border border-border bg-surface p-2">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2/40">
                {it.ok ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : <AlertTriangle className={cn('size-4 shrink-0', it.data ? 'text-warn' : 'text-danger')} />}
                <span className="min-w-0 flex-1 truncate font-mono text-xs" title={it.name}>{it.name}</span>
                <span className="hidden text-xs text-muted sm:inline">{it.note}</span>
                <span className="text-xs text-muted">{it.data ? formatBytes(it.size) : ''}</span>
                {it.data && <Button size="sm" variant="ghost" aria-label={`Download ${it.name}`} onClick={() => downloadBlob(new Blob([it.data as BlobPart]), it.name.split('/').pop() || 'file')}><Download className="size-4" /></Button>}
              </div>
            ))}
          </div>
        </>}
      </>}
      side={<>
        <p className="text-sm">The tool ignores the damaged index at the end of the ZIP and reads each file from its own header, then builds a fresh, valid ZIP from everything it could save.</p>
        {out && <ResultCard blob={out} filename={`${baseName(file.name)}-repaired.zip`} title="Repaired ZIP ready" />}
        <p className="flex gap-1.5 text-xs text-muted"><Wrench className="size-4 shrink-0" />Encrypted entries and methods other than Store and Deflate cannot be rescued here.</p>
      </>}
    />
  )
}
