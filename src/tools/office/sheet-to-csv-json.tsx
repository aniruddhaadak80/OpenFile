import { useState } from 'react'
import { FileJson } from 'lucide-react'
import { Button, Card, Dropzone, Label, Segmented, Select, Switch, ResultCard, Progress, ErrorNote, useJob } from '@/components/ui'
import { zipFiles, formatBytes } from '@/lib/files'
import { readBook, SHEET_ACCEPT } from '@/lib/bcat/sheets'
import { rowsToJson, toCsvText, type Rows } from '@/lib/cf/sheet'
import { FileBar, RowsTable } from '@/lib/cf/ui'

const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'sheet'

export default function SheetToCsvJson() {
  const [files, setFiles] = useState<File[]>([])
  const [fmt, setFmt] = useState<'csv' | 'tsv' | 'json' | 'ndjson'>('csv')
  const [shape, setShape] = useState<'objects' | 'arrays' | 'columns'>('objects')
  const [delim, setDelim] = useState(','), [bom, setBom] = useState(true), [header, setHeader] = useState(true), [nest, setNest] = useState(false), [pretty, setPretty] = useState(true), [skipEmpty, setSkipEmpty] = useState(true)
  const [preview, setPreview] = useState<Rows | null>(null)
  const [out, setOut] = useState<{ blob: Blob; name: string; n: number } | null>(null)
  const job = useJob()
  const encode = (rows: Rows) => {
    if (fmt === 'csv' || fmt === 'tsv') return (bom ? '\ufeff' : '') + toCsvText(rows, fmt === 'tsv' ? '\t' : delim)
    const data = rowsToJson(rows, { header, shape: fmt === 'ndjson' ? 'objects' : shape, nest })
    if (fmt === 'ndjson') return (Array.isArray(data) ? data : [data]).map((x) => JSON.stringify(x)).join('\n') + '\n'
    return JSON.stringify(data, null, pretty ? 2 : 0) + '\n'
  }
  const go = () => job.run(async (setP) => {
    const parts: { name: string; data: string }[] = []
    for (let i = 0; i < files.length; i++) {
      const b = await readBook(files[i])
      for (const sh of b.sheets) { if (skipEmpty && sh.rows.length === 0) continue; parts.push({ name: `${clean(b.name)}${b.sheets.length > 1 ? ' - ' + clean(sh.name) : ''}.${fmt}`, data: encode(sh.rows as Rows) }) }
      setP((i + 1) / files.length)
    }
    if (!parts.length) throw new Error('No sheets with data were found.')
    if (parts.length === 1) setOut({ blob: new Blob([parts[0].data], { type: fmt === 'json' || fmt === 'ndjson' ? 'application/json' : 'text/csv' }), name: parts[0].name, n: 1 })
    else setOut({ blob: await zipFiles(parts), name: `${fmt}-export.zip`, n: parts.length })
  })
  const add = async (fs: File[]) => { setFiles((o) => [...o, ...fs]); setOut(null); if (!preview) { try { const b = await readBook(fs[0]); setPreview(b.sheets[0]?.rows as Rows) } catch { /* shown on export */ } } }
  if (!files.length) return <Dropzone multiple accept={SHEET_ACCEPT} onFiles={add} label="Drop Excel or ODS workbooks" sub="Every sheet becomes its own CSV, TSV, JSON or NDJSON file. Many workbooks at once is fine." />
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-3">
        {files.map((f, i) => <FileBar key={i} name={f.name} size={f.size} onReset={() => { const n = files.filter((_, k) => k !== i); setFiles(n); setOut(null); if (!n.length) setPreview(null) }} />)}
        <Dropzone compact multiple accept={SHEET_ACCEPT} onFiles={add} label="Add more workbooks" />
        {preview && <><Label>Preview of the first sheet</Label><RowsTable rows={preview} header={header} max={50} /></>}
        {job.busy && <Progress value={job.progress} label="Converting" />}
        <ErrorNote error={job.error} />
        {out && <ResultCard blob={out.blob} filename={out.name} title={`${out.n} file${out.n > 1 ? 's' : ''} ready`}><p className="text-xs text-muted">Total input {formatBytes(files.reduce((s, f) => s + f.size, 0))}</p></ResultCard>}
      </div>
      <Card className="space-y-4 self-start">
        <div><Label>Convert to</Label><Segmented value={fmt} onChange={(v) => { setFmt(v); setOut(null) }} options={[{ value: 'csv', label: 'CSV' }, { value: 'tsv', label: 'TSV' }, { value: 'json', label: 'JSON' }, { value: 'ndjson', label: 'NDJSON' }]} /></div>
        {fmt === 'csv' && <div><Label>Separator</Label><Select value={delim} onChange={setDelim} options={[{ value: ',', label: 'Comma ,' }, { value: ';', label: 'Semicolon ; (Excel in Europe)' }, { value: '|', label: 'Pipe |' }]} /></div>}
        {(fmt === 'csv' || fmt === 'tsv') && <Switch checked={bom} onChange={setBom} label="Add UTF-8 mark so Excel shows accents right" />}
        {(fmt === 'json' || fmt === 'ndjson') && <>
          <Switch checked={header} onChange={setHeader} label="First row holds the keys" />
          {fmt === 'json' && header && <div><Label>JSON shape</Label><Segmented value={shape} onChange={setShape} options={[{ value: 'objects', label: 'Rows as objects' }, { value: 'arrays', label: 'Arrays' }, { value: 'columns', label: 'Columns' }]} /></div>}
          <Switch checked={nest} onChange={setNest} label='Nest keys with dots ("address.city")' />
          {fmt === 'json' && <Switch checked={pretty} onChange={setPretty} label="Pretty print" />}
        </>}
        <Switch checked={skipEmpty} onChange={setSkipEmpty} label="Skip empty sheets" />
        <Button className="w-full" icon={<FileJson className="size-4" />} loading={job.busy} onClick={go}>Convert {files.length} workbook{files.length > 1 ? 's' : ''}</Button>
      </Card>
    </div>
  )
}
