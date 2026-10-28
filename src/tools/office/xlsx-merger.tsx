import { useState } from 'react'
import { Combine, Trash2 } from 'lucide-react'
import { Button, Dropzone, Field, Input, Label, Segmented, Switch, ToolGrid, ErrorNote, ResultCard } from '@/components/ui'
import { readBook, writeBook, stack, SHEET_ACCEPT, type Book } from '@/lib/bcat/sheets'
import { DataTable } from '@/tools/dev/_b5/shell'

export default function XlsxMerger() {
  const [books, setBooks] = useState<Book[]>([])
  const [off, setOff] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<'tabs' | 'stack'>('tabs')
  const [source, setSource] = useState(true)
  const [fmt, setFmt] = useState<'xlsx' | 'ods' | 'csv'>('xlsx')
  const [name, setName] = useState('merged')
  const [out, setOut] = useState<Blob | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const add = async (fs: File[]) => { setErr(null); setOut(null); for (const f of fs) { try { const b = await readBook(f); setBooks((p) => [...p, b]) } catch (e: any) { setErr(`${f.name}: ${e?.message}`) } } }
  const parts = books.flatMap((b, bi) => b.sheets.map((s, si) => ({ id: `${bi}:${si}`, book: b.name, sheet: s.name, rows: s.rows }))).filter((p) => !off.has(p.id))
  const label = (p: { book: string; sheet: string }) => (books.length > 1 ? `${p.book} ${p.sheet}` : p.sheet)
  const preview = mode === 'stack' ? stack(parts.map((p) => ({ label: label(p), rows: p.rows })), source) : null
  const effFmt = mode === 'tabs' && fmt === 'csv' ? 'xlsx' : fmt

  const go = async () => {
    setErr(null)
    try { setOut(mode === 'tabs' ? await writeBook(parts.map((p) => ({ name: label(p), rows: p.rows })), effFmt) : await writeBook([{ name: 'Merged', rows: preview! }], effFmt)) } catch (e: any) { setErr(e?.message) }
  }

  if (!books.length) return <><Dropzone multiple accept={SHEET_ACCEPT} onFiles={add} label="Drop Excel, ODS or CSV files to merge" sub="Combine every sheet into one workbook, or stack rows into a single table." /><ErrorNote error={err} /></>
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {books.map((b, bi) => (
              <div key={bi} className="px-3 py-2">
                <div className="flex items-center gap-2 text-sm font-medium"><span className="flex-1 truncate">{b.name}</span><button aria-label={`Remove ${b.name}`} className="text-muted hover:text-danger cursor-pointer" onClick={() => setBooks((p) => p.filter((_, j) => j !== bi))}><Trash2 className="size-4" /></button></div>
                <div className="mt-1 flex flex-wrap gap-2">{b.sheets.map((s, si) => { const id = `${bi}:${si}`; return <label key={si} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"><input type="checkbox" checked={!off.has(id)} onChange={() => setOff((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })} />{s.name} <span className="text-muted">{Math.max(0, s.rows.length - 1)} rows</span></label> })}</div>
              </div>
            ))}
          </div>
          <Dropzone compact multiple accept={SHEET_ACCEPT} onFiles={add} label="Add more files" />
          {preview && <><Label hint={`${preview.length - 1} rows, ${preview[0].length} columns`}>Preview</Label><DataTable columns={preview[0].map(String)} rows={preview.slice(1, 101)} /></>}
          {out && <ResultCard blob={out} filename={`${name || 'merged'}.${effFmt}`} title="Merged file ready" />}
        </div>
      }
      side={
        <>
          <div><Label>How to merge</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'tabs', label: 'One tab per sheet' }, { value: 'stack', label: 'Stack rows' }]} /></div>
          {mode === 'stack' && <Switch checked={source} onChange={setSource} label="Add a Source column" />}
          {mode === 'stack' && <p className="text-xs text-muted">Columns are matched by the header in the first row, in any order. Missing columns are left empty.</p>}
          <div><Label>Format</Label><Segmented value={fmt} onChange={setFmt} options={[{ value: 'xlsx', label: 'XLSX' }, { value: 'ods', label: 'ODS' }, ...(mode === 'stack' ? [{ value: 'csv' as const, label: 'CSV' }] : [])]} /></div>
          <Field label="File name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <ErrorNote error={err} />
          <Button className="w-full" icon={<Combine className="size-4" />} disabled={!parts.length} onClick={go}>Merge {parts.length} sheet{parts.length === 1 ? '' : 's'}</Button>
          <Button variant="ghost" className="w-full" onClick={() => { setBooks([]); setOut(null); setOff(new Set()) }}>Start over</Button>
        </>
      }
    />
  )
}
