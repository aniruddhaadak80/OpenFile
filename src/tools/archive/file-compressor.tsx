import { useState } from 'react'
import { Minimize2, Maximize2, Download, Trophy } from 'lucide-react'
import { Button, Dropzone, Label, Slider, ToolGrid, ErrorNote, Segmented, cn } from '@/components/ui'
import { downloadBlob, formatBytes } from '@/lib/files'
import { compressStream, decompressStream, type StreamFormat } from '@/lib/b4/archive'
import { TopBar, StatusLine } from '@/lib/b4/ui'

type Fmt = StreamFormat | 'br' | 'deflate'
const ALL: { id: Fmt; label: string; ext: string; note: string }[] = [
  { id: 'gz', label: 'Gzip', ext: 'gz', note: 'Universal, fast' },
  { id: 'br', label: 'Brotli', ext: 'br', note: 'Web servers, small' },
  { id: 'zst', label: 'Zstandard', ext: 'zst', note: 'Very fast, modern' },
  { id: 'xz', label: 'XZ (LZMA2)', ext: 'xz', note: 'Smallest, slow' },
  { id: 'bz2', label: 'Bzip2', ext: 'bz2', note: 'Classic Unix' },
  { id: 'deflate', label: 'Zlib', ext: 'zz', note: 'Raw zlib stream' },
]
const DECOMP = /\.(gz|tgz|br|zst|zstd|xz|txz|bz2|tbz2?|zz|zlib)$/i

async function compress(data: Uint8Array, f: Fmt, level: number, name: string, onStatus: (s: string) => void): Promise<Uint8Array> {
  if (f === 'br') { const b = await (await import('brotli-wasm')).default; return b.compress(data, { quality: Math.round((level / 9) * 11) }) }
  if (f === 'deflate') { const { zlibSync } = await import('fflate'); return zlibSync(data, { level: level as any }) }
  return compressStream(data.slice(), f, { level, name, onStatus })
}
async function decompress(data: Uint8Array, name: string, onStatus: (s: string) => void): Promise<Uint8Array> {
  const e = name.toLowerCase().split('.').pop()!
  if (e === 'br') { const b = await (await import('brotli-wasm')).default; return b.decompress(data) }
  if (e === 'zz' || e === 'zlib') { const { unzlibSync } = await import('fflate'); return unzlibSync(data) }
  const map: Record<string, StreamFormat> = { gz: 'gz', tgz: 'gz', zst: 'zst', zstd: 'zst', xz: 'xz', txz: 'xz', bz2: 'bz2', tbz: 'bz2', tbz2: 'bz2' }
  return decompressStream(data, map[e], { onStatus })
}
const outName = (n: string) => n.replace(/\.(tgz|txz|tbz2?)$/i, '.tar').replace(DECOMP, '') || 'file'

export default function FileCompressor() {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'compress' | 'decompress'>('compress')
  const [pick, setPick] = useState<Set<Fmt>>(new Set(['gz', 'br', 'zst', 'xz']))
  const [level, setLevel] = useState(6)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<{ f: Fmt; blob: Blob; ms: number }[]>([])
  const [plain, setPlain] = useState<Blob | null>(null)

  const choose = (f: File) => { setFile(f); setMode(DECOMP.test(f.name) ? 'decompress' : 'compress'); setRows([]); setPlain(null); setError(null) }
  const run = async () => {
    if (!file) return
    setBusy(true); setError(null); setRows([]); setPlain(null)
    try {
      const data = new Uint8Array(await file.arrayBuffer())
      if (mode === 'decompress') { setStatus('Decompressing'); setPlain(new Blob([(await decompress(data, file.name, setStatus)) as BlobPart])); return }
      const out: { f: Fmt; blob: Blob; ms: number }[] = []
      for (const f of ALL.filter((x) => pick.has(x.id))) {
        setStatus(`Compressing with ${f.label}`)
        const t0 = performance.now()
        const r = await compress(data, f.id, level, file.name, setStatus)
        out.push({ f: f.id, blob: new Blob([r as BlobPart]), ms: performance.now() - t0 }); setRows([...out])
      }
    } catch (e: any) { setError(e?.message || 'Failed. The file may not be in the format its name suggests.') } finally { setBusy(false) }
  }
  const best = rows.length ? rows.reduce((a, b) => (b.blob.size < a.blob.size ? b : a)) : null

  if (!file) return <Dropzone onFiles={(f) => choose(f[0])} label="Drop a file to compress or decompress" sub="Compare Gzip, Brotli, Zstandard, XZ and Bzip2 side by side, or unpack .gz .br .zst .xz .bz2 files." />
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => setFile(null)} />
        {busy && <StatusLine text={status} />}
        <ErrorNote error={error} />
        {rows.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-2/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-3 py-2">Format</th><th className="px-3 py-2">Size</th><th className="hidden px-3 py-2 sm:table-cell">Saved</th><th className="hidden px-3 py-2 sm:table-cell">Time</th><th /></tr></thead>
              <tbody>{rows.map((r) => {
                const meta = ALL.find((x) => x.id === r.f)!; const saved = 1 - r.blob.size / Math.max(1, file.size)
                return (
                  <tr key={r.f} className={cn('border-t border-border', best?.f === r.f && 'bg-success/5')}>
                    <td className="px-3 py-2 font-medium">{meta.label}{best?.f === r.f && <Trophy className="ml-1.5 inline size-3.5 text-success" />}<div className="text-xs font-normal text-muted">{meta.note}</div></td>
                    <td className="px-3 py-2 font-mono">{formatBytes(r.blob.size)}<div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (r.blob.size / Math.max(...rows.map((x) => x.blob.size))) * 100)}%` }} /></div></td>
                    <td className="hidden px-3 py-2 font-mono sm:table-cell">{(saved * 100).toFixed(1)}%</td>
                    <td className="hidden px-3 py-2 font-mono text-muted sm:table-cell">{r.ms < 1000 ? `${Math.round(r.ms)} ms` : `${(r.ms / 1000).toFixed(1)} s`}</td>
                    <td className="px-3 py-2 text-right"><Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(r.blob, `${file.name}.${meta.ext}`)}>.{meta.ext}</Button></td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        )}
        {plain && <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-success/30 bg-success/5 p-4"><div className="min-w-0 flex-1"><div className="font-semibold">Decompressed</div><div className="truncate text-sm text-muted">{outName(file.name)} · {formatBytes(plain.size)} (from {formatBytes(file.size)})</div></div><Button icon={<Download className="size-4" />} onClick={() => downloadBlob(plain, outName(file.name))}>Download</Button></div>}
      </>}
      side={<>
        <div><Label>Mode</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'compress', label: 'Compress' }, { value: 'decompress', label: 'Decompress' }]} /></div>
        {mode === 'compress' ? <>
          <div><Label>Formats to try</Label><div className="grid grid-cols-2 gap-2">{ALL.map((f) => (
            <label key={f.id} className={cn('flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-sm', pick.has(f.id) ? 'border-accent bg-accent/10' : 'border-border')}>
              <input type="checkbox" className="accent-[var(--accent)]" checked={pick.has(f.id)} onChange={(e) => setPick((s) => { const x = new Set(s); e.target.checked ? x.add(f.id) : x.delete(f.id); return x })} />{f.label}
            </label>))}</div></div>
          <Slider label="Level" value={level} onChange={setLevel} min={1} max={9} suffix={level >= 8 ? ' (max)' : level <= 2 ? ' (fast)' : ''} />
        </> : <p className="text-sm text-muted">The format is picked from the file extension: .gz, .br, .zst, .xz, .bz2 or .zz.</p>}
        <Button size="lg" className="w-full" icon={mode === 'compress' ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />} onClick={run} loading={busy} disabled={mode === 'compress' && !pick.size}>{mode === 'compress' ? 'Compress and compare' : 'Decompress'}</Button>
        <p className="text-xs text-muted">For several files or folders, use Create Archive instead. These formats hold a single file.</p>
      </>}
    />
  )
}
