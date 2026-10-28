import { useMemo, useState } from 'react'
import { Split } from 'lucide-react'
import { Button, Dropzone, Label, Segmented, Select, Slider, Switch, ToolGrid, ErrorNote, ResultCard } from '@/components/ui'
import { zipFiles } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { readBook, writeBook, SHEET_ACCEPT, type Book, type Grid } from '@/lib/bcat/sheets'

const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'blank'

export default function XlsxSplitter() {
  const [file, setFile] = useState<File | null>(null)
  const [book, setBook] = useState<Book | null>(null)
  const [mode, setMode] = useState<'sheets' | 'rows' | 'value'>('sheets')
  const [sheet, setSheet] = useState('0')
  const [rows, setRows] = useState(1000)
  const [col, setCol] = useState('0')
  const [header, setHeader] = useState(true)
  const [fmt, setFmt] = useState<'xlsx' | 'csv'>('xlsx')
  const [asTabs, setAsTabs] = useState(false)
  const [out, setOut] = useState<{ blob: Blob; name: string; n: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const open = async (f: File) => { setFile(f); setOut(null); setErr(null); try { const b = await readBook(f); setBook(b); if (b.sheets.length === 1) setMode('rows') } catch (e: any) { setErr(e?.message) } }
  const s = book?.sheets[+sheet]
  const head = s?.rows[0] ?? []
  const pieces = useMemo((): { name: string; rows: Grid }[] => {
    if (!book || !s) return []
    if (mode === 'sheets') return book.sheets.map((x) => ({ name: x.name, rows: x.rows }))
    const h = header ? [s.rows[0]] : [], body = header ? s.rows.slice(1) : s.rows
    if (mode === 'rows') { const out = []; for (let i = 0; i < body.length; i += rows) out.push({ name: `${s.name} ${i / rows + 1}`, rows: [...h, ...body.slice(i, i + rows)] }); return out }
    const g = new Map<string, Grid>(); for (const r of body) { const k = String(r[+col] ?? '') || 'blank'; if (!g.has(k)) g.set(k, []); g.get(k)!.push(r) }
    return [...g.entries()].map(([k, v]) => ({ name: k, rows: [...h, ...v] }))
  }, [book, s, mode, rows, col, header])

  const go = async () => {
    setErr(null)
    try {
      if (asTabs && mode !== 'sheets') { setOut({ blob: await writeBook(pieces, 'xlsx'), name: `${book!.name}-split.xlsx`, n: pieces.length }); return }
      const files = []; for (const p of pieces) files.push({ name: `${clean(book!.name)} - ${clean(p.name)}.${fmt}`, data: await writeBook([p], fmt) })
      setOut({ blob: await zipFiles(files), name: `${book!.name}-split.zip`, n: files.length })
    } catch (e: any) { setErr(e?.message) }
  }

  if (!file) return <Dropzone accept={SHEET_ACCEPT} onFiles={(f) => open(f[0])} label="Drop a workbook to split" sub="Save each sheet as its own file, cut a long sheet every N rows, or split by the values in a column." />
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <TopBar file={file} onReset={() => { setFile(null); setBook(null); setOut(null) }} />
          <ErrorNote error={err} />
          {book && <div className="max-h-96 divide-y divide-border overflow-auto rounded-2xl border border-border bg-surface">{pieces.slice(0, 300).map((p, i) => <div key={i} className="flex justify-between px-3 py-1.5 text-sm"><span className="truncate">{p.name}</span><span className="text-xs text-muted">{Math.max(0, p.rows.length - (header || mode === 'sheets' ? 1 : 0))} rows</span></div>)}</div>}
          {pieces.length > 300 && <p className="text-xs text-muted">Showing 300 of {pieces.length} parts.</p>}
          {out && <ResultCard blob={out.blob} filename={out.name} title={`${out.n} parts ready`} />}
        </div>
      }
      side={
        <>
          <div><Label>Split</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'sheets', label: 'Each sheet' }, { value: 'rows', label: 'Every N rows' }, { value: 'value', label: 'By column value' }]} /></div>
          {mode !== 'sheets' && book && book.sheets.length > 1 && <div><Label>Sheet</Label><Select value={sheet} onChange={setSheet} options={book.sheets.map((x, i) => ({ value: String(i), label: x.name }))} /></div>}
          {mode === 'rows' && <Slider label="Rows per part" value={rows} onChange={setRows} min={10} max={100000} step={10} />}
          {mode === 'value' && <div><Label>Column</Label><Select value={col} onChange={setCol} options={head.map((h, i) => ({ value: String(i), label: String(h ?? `Column ${i + 1}`) }))} /></div>}
          {mode !== 'sheets' && <Switch checked={header} onChange={setHeader} label="First row is a header (repeat it in every part)" />}
          {mode !== 'sheets' && <Switch checked={asTabs} onChange={setAsTabs} label="One workbook with a tab per part" />}
          {!(asTabs && mode !== 'sheets') && <div><Label>Each part as</Label><Segmented value={fmt} onChange={setFmt} options={[{ value: 'xlsx', label: 'XLSX' }, { value: 'csv', label: 'CSV' }]} /></div>}
          <Button className="w-full" icon={<Split className="size-4" />} disabled={!pieces.length} onClick={go}>Split into {pieces.length} part{pieces.length === 1 ? '' : 's'}</Button>
        </>
      }
    />
  )
}
