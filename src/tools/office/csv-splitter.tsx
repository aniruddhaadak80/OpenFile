import { useEffect, useState } from 'react'
import { Scissors } from 'lucide-react'
import { Button, Card, Dropzone, Label, Segmented, Select, Slider, Switch, ResultCard, Progress, ErrorNote, useJob } from '@/components/ui'
import { formatBytes, zipFiles } from '@/lib/files'
import { csvSplit } from '@/lib/cf/study'
import { sniffDelimiter } from '@/lib/cf/sheet'
import { FileBar, RowsTable } from '@/lib/cf/ui'

/** Stream a CSV file record by record (quoted newlines stay inside a record), without loading it all. */
async function* records(file: File, onBytes: (n: number) => void) {
  const CH = 4 * 1024 * 1024, dec = new TextDecoder()
  let carry = '', q = false, pos = 0
  while (pos < file.size) {
    const text = carry + dec.decode(await file.slice(pos, pos + CH).arrayBuffer(), { stream: pos + CH < file.size })
    pos += CH; onBytes(Math.min(pos, file.size))
    let start = 0
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); if (c === 34) q = !q; else if (c === 10 && !q) { yield text.slice(start, i).replace(/\r$/, ''); start = i + 1 } }
    carry = text.slice(start)
    // the quote state for the carried part is recomputed next round, so undo it here
    for (let i = 0; i < carry.length; i++) if (carry.charCodeAt(i) === 34) q = !q
  }
  if (carry.length) yield carry.replace(/\r$/, '')
}

export default function CsvSplitter() {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'rows' | 'size' | 'parts' | 'value'>('rows')
  const [rows, setRows] = useState(10000), [mb, setMb] = useState(10), [parts, setParts] = useState(4)
  const [header, setHeader] = useState(true), [col, setCol] = useState('0')
  const [head, setHead] = useState<string[][]>([])
  const [out, setOut] = useState<{ blob: Blob; name: string; n: number } | null>(null)
  const job = useJob()
  useEffect(() => { if (!file) return; file.slice(0, 64 * 1024).text().then((t) => { const d = sniffDelimiter(t); setHead(t.split(/\r?\n/).slice(0, 30).filter(Boolean).map((l) => csvSplit(l, d))) }) }, [file])
  const go = () => job.run(async (setP) => {
    if (!file) return
    const base = file.name.replace(/\.[^.]+$/, ''), ext = file.name.match(/\.(tsv|txt)$/i)?.[1] ?? 'csv'
    const d = sniffDelimiter(await file.slice(0, 64 * 1024).text())
    const enc = new TextEncoder()
    const out: { name: string; data: Blob }[] = []
    let hdr: string | null = null, buf: string[] = [], bytes = 0, count = 0
    // parts mode: count records first (fast pass) so parts are even
    let per = rows
    if (mode === 'parts') { let n = 0; for await (const _ of records(file, (b) => setP((b / file.size) * 0.3))) n++; per = Math.max(1, Math.ceil((n - (header ? 1 : 0)) / parts)) }
    const flush = (label?: string) => { if (!buf.length) return; out.push({ name: `${base}-${label ?? String(out.length + 1).padStart(3, '0')}.${ext}`, data: new Blob([(hdr ? hdr + '\n' : '') + buf.join('\n') + '\n'], { type: 'text/csv' }) }); buf = []; bytes = 0 }
    const groups = new Map<string, string[]>()
    for await (const rec of records(file, (b) => setP((mode === 'parts' ? 0.3 : 0) + (b / file.size) * (mode === 'parts' ? 0.6 : 0.9)))) {
      if (header && hdr == null) { hdr = rec; continue }
      if (!rec.trim()) continue
      if (mode === 'value') { const k = (csvSplit(rec, d)[+col] ?? '').trim() || 'blank'; if (!groups.has(k)) { if (groups.size >= 2000) throw new Error('More than 2,000 different values in that column. Pick a column with fewer groups.'); groups.set(k, []) } groups.get(k)!.push(rec); continue }
      const b = enc.encode(rec).length + 1
      if ((mode === 'size' && bytes + b > mb * 1024 * 1024 && buf.length) || ((mode === 'rows' || mode === 'parts') && count >= per)) { flush(); count = 0 }
      buf.push(rec); bytes += b; count++
    }
    if (mode === 'value') for (const [k, v] of groups) { buf = v; flush(k.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 60)) } else flush()
    if (!out.length) throw new Error('No rows found to split.')
    setOut({ blob: out.length === 1 ? out[0].data : await zipFiles(out), name: out.length === 1 ? out[0].name : `${base}-split.zip`, n: out.length }); setP(1)
  })
  if (!file) return <Dropzone accept=".csv,.tsv,.txt" onFiles={(f) => { setFile(f[0]); setOut(null) }} label="Drop a large CSV to split" sub="Works on files of hundreds of MB: it reads in small pieces, so your browser does not run out of memory." />
  const headRow = head[0] ?? []
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-3">
        <FileBar name={file.name} size={file.size} onReset={() => { setFile(null); setOut(null) }} />
        <RowsTable rows={head} header={header} max={25} />
        {job.busy && <Progress value={job.progress} label="Splitting" />}
        <ErrorNote error={job.error} />
        {out && <ResultCard blob={out.blob} filename={out.name} title={`${out.n} part${out.n > 1 ? 's' : ''} ready`} />}
      </div>
      <Card className="space-y-4 self-start">
        <div><Label>Split by</Label><Segmented value={mode} onChange={(v) => { setMode(v); setOut(null) }} options={[{ value: 'rows', label: 'Rows' }, { value: 'size', label: 'File size' }, { value: 'parts', label: 'Equal parts' }, { value: 'value', label: 'Column value' }]} /></div>
        {mode === 'rows' && <Slider label="Rows per file" value={rows} onChange={setRows} min={100} max={1000000} step={100} />}
        {mode === 'size' && <Slider label="Max size per file" value={mb} onChange={setMb} min={1} max={500} suffix=" MB" />}
        {mode === 'parts' && <Slider label="Number of files" value={parts} onChange={setParts} min={2} max={100} />}
        {mode === 'value' && <div><Label>Column</Label><Select value={col} onChange={setCol} options={headRow.map((h, i) => ({ value: String(i), label: header ? h || `Column ${i + 1}` : `Column ${i + 1}` }))} /></div>}
        <Switch checked={header} onChange={setHeader} label="First row is a header (copied to every file)" />
        <p className="text-xs text-muted">{formatBytes(file.size)}. Quoted fields with line breaks stay together.</p>
        <Button className="w-full" icon={<Scissors className="size-4" />} loading={job.busy} onClick={go}>Split file</Button>
      </Card>
    </div>
  )
}
