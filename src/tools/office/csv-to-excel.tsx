import { useState } from 'react'
import { Sheet } from 'lucide-react'
import { Button, Card, Dropzone, Label, Segmented, Select, Switch, ResultCard, Progress, ErrorNote, useJob, Field } from '@/components/ui'
import { sniffDelimiter, typeCell, type Rows } from '@/lib/cf/sheet'
import { FileBar, RowsTable } from '@/lib/cf/ui'

/** Parse CSV text with quoted newlines. */
function parseCsv(text: string, d: string): string[][] {
  const out: string[][] = []; let row: string[] = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += ch; continue }
    if (ch === '"' && cur === '') q = true
    else if (ch === d) { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); out.push(row); row = []; cur = '' }
    else cur += ch
  }
  if (cur !== '' || row.length) { row.push(cur); out.push(row) }
  return out
}
async function decode(f: File, enc: string) { const buf = await f.arrayBuffer(); if (enc !== 'auto') return new TextDecoder(enc).decode(buf); try { return new TextDecoder('utf-8', { fatal: true }).decode(buf) } catch { return new TextDecoder('windows-1252').decode(buf) } }

export default function CsvToExcel() {
  const [files, setFiles] = useState<File[]>([])
  const [delim, setDelim] = useState('auto'), [enc, setEnc] = useState('auto')
  const [types, setTypes] = useState(true), [freeze, setFreeze] = useState(true), [filter, setFilter] = useState(true), [bold, setBold] = useState(true)
  const [mode, setMode] = useState<'tabs' | 'separate'>('tabs'), [fmt, setFmt] = useState<'xlsx' | 'ods'>('xlsx')
  const [preview, setPreview] = useState<Rows | null>(null)
  const [out, setOut] = useState<{ blob: Blob; name: string } | null>(null)
  const job = useJob()
  const read = async (f: File) => { const t = (await decode(f, enc)).replace(/^\ufeff/, ''); const d = delim === 'auto' ? sniffDelimiter(t) : delim === 'tab' ? '\t' : delim; return parseCsv(t, d).map((r) => (types ? r.map(typeCell) : r)) as Rows }
  const add = async (fs: File[]) => { setFiles((o) => [...o, ...fs]); setOut(null); try { setPreview(await read(fs[0])) } catch { /* later */ } }
  const go = () => job.run(async (setP) => {
    const X = await import('xlsx')
    const build = (sheets: { name: string; rows: Rows }[]) => {
      const wb = X.utils.book_new(); const used = new Set<string>()
      for (const s of sheets) {
        const ws = X.utils.aoa_to_sheet(s.rows)
        const head = s.rows[0] ?? []
        ws['!cols'] = head.map((_, c) => ({ wch: Math.min(60, Math.max(8, ...s.rows.slice(0, 300).map((r) => String(r[c] ?? '').length + 2))) }))
        if (filter && s.rows.length > 1) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: s.rows.length - 1, c: Math.max(0, head.length - 1) } }) }
        if (freeze) { (ws as any)['!freeze'] = { xSplit: 0, ySplit: 1 }; (ws as any)['!views'] = [{ state: 'frozen', ySplit: 1, topLeftCell: 'A2' }] }
        if (bold) head.forEach((_, c) => { const cell = ws[X.utils.encode_cell({ r: 0, c })]; if (cell) cell.s = { font: { bold: true } } })
        let n = s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet', k = 2; while (used.has(n.toLowerCase())) n = `${s.name.slice(0, 28)} ${k++}`; used.add(n.toLowerCase())
        X.utils.book_append_sheet(wb, ws, n)
      }
      return new Blob([X.write(wb, { bookType: fmt, type: 'array', compression: true, cellStyles: true })], { type: fmt === 'ods' ? 'application/vnd.oasis.opendocument.spreadsheet' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    }
    const sheets: { name: string; rows: Rows }[] = []
    for (let i = 0; i < files.length; i++) { sheets.push({ name: files[i].name.replace(/\.[^.]+$/, ''), rows: await read(files[i]) }); setP((i + 1) / files.length * 0.8) }
    if (mode === 'tabs' || sheets.length === 1) setOut({ blob: build(sheets), name: `${sheets.length === 1 ? sheets[0].name : 'combined'}.${fmt}` })
    else { const { zipFiles } = await import('@/lib/files'); setOut({ blob: await zipFiles(sheets.map((s) => ({ name: `${s.name}.${fmt}`, data: build([s]) }))), name: `${fmt}-files.zip` }) }
  })
  if (!files.length) return <Dropzone multiple accept=".csv,.tsv,.txt" onFiles={add} label="Drop CSV or TSV files" sub="Make a real Excel workbook with numbers as numbers, a frozen header and filters. Several files become tabs." />
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-3">
        {files.map((f, i) => <FileBar key={i} name={f.name} size={f.size} onReset={() => { const n = files.filter((_, k) => k !== i); setFiles(n); setOut(null); if (!n.length) setPreview(null) }} />)}
        <Dropzone compact multiple accept=".csv,.tsv,.txt" onFiles={add} label="Add more CSV files" />
        {preview && <RowsTable rows={preview} max={50} />}
        {job.busy && <Progress value={job.progress} label="Building workbook" />}
        <ErrorNote error={job.error} />
        {out && <ResultCard blob={out.blob} filename={out.name} title="Workbook ready" />}
      </div>
      <Card className="space-y-4 self-start">
        <Field label="Separator"><Select value={delim} onChange={(v) => { setDelim(v); setOut(null) }} options={[{ value: 'auto', label: 'Detect' }, { value: ',', label: 'Comma' }, { value: ';', label: 'Semicolon' }, { value: 'tab', label: 'Tab' }, { value: '|', label: 'Pipe' }]} /></Field>
        <Field label="Text encoding"><Select value={enc} onChange={setEnc} options={[{ value: 'auto', label: 'Detect (UTF-8 or Windows)' }, { value: 'utf-8', label: 'UTF-8' }, { value: 'windows-1252', label: 'Windows Western' }, { value: 'iso-8859-1', label: 'Latin-1' }, { value: 'utf-16le', label: 'UTF-16' }, { value: 'shift_jis', label: 'Japanese Shift JIS' }]} /></Field>
        <Switch checked={types} onChange={setTypes} label="Store numbers as numbers (keeps 007 as text)" />
        <Switch checked={bold} onChange={setBold} label="Bold header row" /><Switch checked={freeze} onChange={setFreeze} label="Freeze header row" /><Switch checked={filter} onChange={setFilter} label="Add filter buttons" />
        {files.length > 1 && <div><Label>Several files</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'tabs', label: 'One workbook, a tab each' }, { value: 'separate', label: 'Separate files' }]} /></div>}
        <div><Label>Format</Label><Segmented value={fmt} onChange={setFmt} options={[{ value: 'xlsx', label: 'Excel XLSX' }, { value: 'ods', label: 'ODS' }]} /></div>
        <Button className="w-full" icon={<Sheet className="size-4" />} loading={job.busy} onClick={go}>Make workbook</Button>
      </Card>
    </div>
  )
}
