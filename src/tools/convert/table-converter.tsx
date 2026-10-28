import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Plus, Trash2, Upload, Sparkles, ArrowLeftRight, X, Table2 } from 'lucide-react'
import { Button, Dropzone, Card, Label, Select, Segmented, Switch, Input, Textarea, ErrorNote, CopyButton, Badge, Tabs, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob, baseName } from '@/lib/files'
import { useDebounced, Pill } from './_conv/shared'
import { detectFormat, parseText, serialize, normalize, fromMatrix, OUT_EXT, OUT_MIME, type TableData, type InFormat, type OutFormat } from './_conv/tables'

const IN_OPTS: { value: InFormat | 'auto'; label: string }[] = [
  { value: 'auto', label: 'Auto-detect' }, { value: 'csv', label: 'CSV' }, { value: 'tsv', label: 'TSV' }, { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown table' }, { value: 'html', label: 'HTML table' }, { value: 'sql', label: 'SQL INSERT' },
]
const OUT_OPTS: { value: OutFormat; label: string }[] = [
  { value: 'csv', label: 'CSV' }, { value: 'tsv', label: 'TSV' }, { value: 'xlsx', label: 'Excel' }, { value: 'json', label: 'JSON' }, { value: 'json-arrays', label: 'JSON arrays' },
  { value: 'markdown', label: 'Markdown' }, { value: 'html', label: 'HTML' }, { value: 'sql', label: 'SQL' }, { value: 'yaml', label: 'YAML' },
]
const SAMPLE = `id,name,email,city,signup_date,plan,mrr
1,Ada Lovelace,ada@example.com,London,2024-01-14,Pro,49
2,Alan Turing,alan@example.com,Manchester,2024-02-03,Team,199
3,Grace Hopper,grace@example.com,"New York, NY",2024-03-22,Pro,49
4,Linus Torvalds,linus@example.com,Portland,2024-04-09,Free,0
5,Margaret Hamilton,margaret@example.com,Boston,2024-05-30,Enterprise,999`
const PAGE = 200

export default function TableConverter() {
  const [mode, setMode] = useState<'paste' | 'file'>('paste')
  const [text, setText] = useState('')
  const [inFmt, setInFmt] = useState<InFormat | 'auto'>('auto')
  const [header, setHeader] = useState(true)
  const [table, setTable] = useState<TableData | null>(null)
  const [parseErr, setParseErr] = useState<string | null>(null)
  const [fileName, setFileName] = useState('table')
  const [wb, setWb] = useState<any>(null)
  const [sheet, setSheet] = useState('')
  const [out, setOut] = useState<OutFormat>('json')
  const [tableName, setTableName] = useState('my_table')
  const [createTable, setCreateTable] = useState(false)
  const [inferTypes, setInferTypes] = useState(true)
  const [pretty, setPretty] = useState(true)
  const [output, setOutput] = useState('')
  const [shown, setShown] = useState(PAGE)
  const dText = useDebounced(text, 250)
  const detected = useMemo(() => (dText.trim() ? detectFormat(dText) : null), [dText])

  // parse pasted text
  useEffect(() => {
    if (mode !== 'paste' || wb) return
    if (!dText.trim()) { setTable(null); setParseErr(null); return }
    try {
      const fmt = inFmt === 'auto' ? detected! : inFmt
      const t = parseText(dText, fmt, header)
      if (fmt === 'sql' && (t as any).table) setTableName((t as any).table)
      setTable(t); setParseErr(t.headers.length ? null : 'No rows found.'); setShown(PAGE)
    } catch (e: any) { setParseErr(e?.message || 'Could not parse input'); setTable(null) }
  }, [dText, inFmt, header, detected, mode, wb])

  // load a sheet from the workbook
  useEffect(() => {
    if (!wb || !sheet) return
    ;(async () => {
      const XLSX = await import('xlsx')
      const m = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: false, defval: '' }) as unknown[][]
      setTable(fromMatrix(m, header)); setParseErr(null); setShown(PAGE)
    })()
  }, [wb, sheet, header])

  // generate output
  useEffect(() => {
    if (!table || out === 'xlsx') { setOutput(''); return }
    let off = false
    serialize(table, out, { tableName, createTable, inferTypes, pretty }).then((s) => { if (!off) setOutput(s) }).catch((e) => setOutput('Error: ' + e.message))
    return () => { off = true }
  }, [table, out, tableName, createTable, inferTypes, pretty])

  const onFile = async (files: File[]) => {
    const f = files[0]
    setFileName(baseName(f.name))
    if (/\.(xlsx|xls|xlsm|ods)$/i.test(f.name)) {
      const XLSX = await import('xlsx')
      try {
        const book = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true })
        setWb(book); setSheet(book.SheetNames[0]); setText('')
      } catch { setParseErr('Could not read that spreadsheet.') }
    } else {
      setWb(null)
      const t = await f.text()
      const ext = f.name.split('.').pop()?.toLowerCase()
      setInFmt(ext === 'csv' ? 'csv' : ext === 'tsv' ? 'tsv' : ext === 'json' ? 'json' : ext === 'md' ? 'markdown' : ext === 'html' || ext === 'htm' ? 'html' : ext === 'sql' ? 'sql' : 'auto')
      setText(t); setMode('paste')
    }
  }

  const edit = (r: number, c: number, v: string) => setTable((t) => t && { ...t, rows: t.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) })
  const editHeader = (c: number, v: string) => setTable((t) => t && { ...t, headers: t.headers.map((h, j) => (j === c ? v : h)) })
  const addRow = () => setTable((t) => t && { ...t, rows: [...t.rows, t.headers.map(() => '')] })
  const delRow = (r: number) => setTable((t) => t && { ...t, rows: t.rows.filter((_, i) => i !== r) })
  const addCol = () => setTable((t) => t && normalize({ headers: [...t.headers, `column_${t.headers.length + 1}`], rows: t.rows.map((r) => [...r, '']) }))
  const delCol = (c: number) => setTable((t) => t && { headers: t.headers.filter((_, j) => j !== c), rows: t.rows.map((r) => r.filter((_, j) => j !== c)) })
  const transpose = () => setTable((t) => t && fromMatrix(t.headers.map((h, i) => [h, ...t.rows.map((r) => r[i])]), true))

  const download = async () => {
    if (!table) return
    if (out === 'xlsx') {
      const XLSX = await import('xlsx')
      const data = [table.headers, ...table.rows.map((r) => (inferTypes ? r.map((v) => { const n = Number(v); return v.trim() !== '' && Number.isFinite(n) && /^-?\d/.test(v.trim()) ? n : v }) : r))]
      const ws = XLSX.utils.aoa_to_sheet(data)
      ws['!cols'] = table.headers.map((h, i) => ({ wch: Math.min(50, Math.max(h.length, ...table.rows.slice(0, 200).map((r) => (r[i] ?? '').length)) + 2) }))
      const book = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(book, ws, (sheet || 'Sheet1').slice(0, 31))
      const buf = XLSX.write(book, { type: 'array', bookType: 'xlsx' })
      downloadBlob(new Blob([buf], { type: OUT_MIME.xlsx }), `${fileName}.xlsx`)
    } else downloadBlob(new Blob([output], { type: OUT_MIME[out] + ';charset=utf-8' }), `${fileName}.${OUT_EXT[out]}`)
    toast('Downloaded', 'success')
  }

  const reset = () => { setText(''); setTable(null); setWb(null); setSheet(''); setParseErr(null); setFileName('table') }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        {/* INPUT */}
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tabs value={mode} onChange={(v) => setMode(v)} tabs={[{ value: 'paste', label: 'Paste' }, { value: 'file', label: 'Upload file' }]} />
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" icon={<Sparkles className="size-4" />} onClick={() => { setWb(null); setMode('paste'); setInFmt('auto'); setText(SAMPLE); setFileName('customers') }}>Sample</Button>
              {(text || table) && <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={reset}>Clear</Button>}
            </div>
          </div>
          {mode === 'file' && !wb ? (
            <Dropzone compact accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods,.json,.md,.html,.htm,.sql" onFiles={onFile} label="Drop CSV, TSV, Excel, JSON, Markdown, HTML or SQL" />
          ) : wb ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2/50 px-3 py-2 text-sm"><Table2 className="size-4 text-accent" /><span className="flex-1 truncate font-medium">{fileName}.xlsx</span><Button size="sm" variant="ghost" onClick={() => { setWb(null); setTable(null) }}>Remove</Button></div>
              {wb.SheetNames.length > 1 && <div><Label>Sheet</Label><div className="flex flex-wrap gap-1.5">{wb.SheetNames.map((s: string) => <Pill key={s} active={s === sheet} onClick={() => setSheet(s)}>{s}</Pill>)}</div></div>}
            </div>
          ) : (
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={'Paste CSV, TSV, JSON, a Markdown or HTML table, or SQL INSERT statements…'} className="h-64" spellCheck={false} />
          )}
          <div className="flex flex-wrap items-center gap-3">
            {!wb && <div className="w-48"><Select value={inFmt} onChange={setInFmt} options={IN_OPTS} /></div>}
            {inFmt === 'auto' && detected && !wb && <Badge>Detected: {detected.toUpperCase()}</Badge>}
            <Switch checked={header} onChange={setHeader} label="First row is header" />
          </div>
          <ErrorNote error={parseErr} />
        </Card>

        {/* OUTPUT */}
        <Card className="space-y-3">
          <div className="flex items-center gap-2"><ArrowLeftRight className="size-4 text-accent" /><span className="text-sm font-semibold">Convert to</span></div>
          <div className="flex flex-wrap gap-1.5">{OUT_OPTS.map((o) => <Pill key={o.value} active={out === o.value} onClick={() => setOut(o.value)}>{o.label}</Pill>)}</div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {out === 'sql' && <><div className="flex items-center gap-2"><span className="text-xs text-muted">Table</span><Input value={tableName} onChange={(e) => setTableName(e.target.value)} className="h-8 w-36 text-xs" /></div><Switch checked={createTable} onChange={setCreateTable} label="CREATE TABLE" /></>}
            {['json', 'json-arrays', 'sql', 'yaml', 'xlsx'].includes(out) && <Switch checked={inferTypes} onChange={setInferTypes} label="Detect numbers & booleans" />}
            {['json', 'json-arrays', 'html'].includes(out) && <Switch checked={pretty} onChange={setPretty} label="Pretty" />}
          </div>
          {out === 'xlsx' ? (
            <div className="grid h-64 place-items-center rounded-xl border border-dashed border-border text-center text-sm text-muted">
              <div className="space-y-2"><Table2 className="mx-auto size-8 text-accent" /><div>{table ? `${table.rows.length} rows × ${table.headers.length} columns → .xlsx` : 'Add data on the left'}</div></div>
            </div>
          ) : (
            <Textarea readOnly value={output} placeholder="Output appears here…" className="h-64" spellCheck={false} />
          )}
          <div className="flex flex-wrap gap-2">
            <Button icon={<Download className="size-4" />} disabled={!table} onClick={download}>Download .{OUT_EXT[out]}</Button>
            {out !== 'xlsx' && <CopyButton text={output} size="md" />}
          </div>
        </Card>
      </div>

      {/* EDITABLE GRID */}
      {table && table.headers.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="space-y-3 p-0">
            <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
              <span className="text-sm font-semibold">Edit data</span>
              <Badge>{table.rows.length} rows × {table.headers.length} cols</Badge>
              <div className="ml-auto flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={addRow}>Row</Button>
                <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={addCol}>Column</Button>
                <Button size="sm" variant="outline" icon={<ArrowLeftRight className="size-4" />} onClick={transpose}>Transpose</Button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-auto border-t border-border scrollbar-thin">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-surface-2">
                  <tr>
                    <th className="w-10 border-b border-border px-2 text-[10px] text-muted">#</th>
                    {table.headers.map((h, c) => (
                      <th key={c} className="group min-w-32 border-b border-l border-border p-0">
                        <div className="flex items-center">
                          <input value={h} onChange={(e) => editHeader(c, e.target.value)} className="w-full bg-transparent px-2 py-2 text-xs font-semibold text-fg outline-none focus:bg-accent/10" />
                          <button onClick={() => delCol(c)} className="mr-1 rounded p-1 text-muted opacity-0 hover:text-danger group-hover:opacity-100 cursor-pointer" aria-label="Delete column"><Trash2 className="size-3" /></button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.slice(0, shown).map((r, ri) => (
                    <tr key={ri} className="group hover:bg-surface-2/40">
                      <td className="border-b border-border px-1 text-center font-mono text-[10px] text-muted">
                        <span className="group-hover:hidden">{ri + 1}</span>
                        <button onClick={() => delRow(ri)} className="hidden rounded p-0.5 text-muted hover:text-danger group-hover:inline cursor-pointer" aria-label="Delete row"><Trash2 className="size-3" /></button>
                      </td>
                      {r.map((v, ci) => (
                        <td key={ci} className="border-b border-l border-border p-0">
                          <input value={v} onChange={(e) => edit(ri, ci, e.target.value)} className={cn('w-full bg-transparent px-2 py-1.5 text-[13px] text-fg outline-none focus:bg-accent/10', /^-?[\d.,]+$/.test(v) && 'text-right font-mono')} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {table.rows.length > shown && <div className="px-4 pb-4 text-center"><Button size="sm" variant="ghost" onClick={() => setShown((s) => s + PAGE * 5)}>Show more ({table.rows.length - shown} hidden — all rows are still converted)</Button></div>}
            {table.rows.length <= shown && <div className="h-2" />}
          </Card>
        </motion.div>
      )}
      {!table && !parseErr && (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          <div className="space-y-2"><Upload className="mx-auto size-6 text-accent" /><div>Paste data or upload a file — the editable grid and converted output appear instantly.</div></div>
        </div>
      )}
    </div>
  )
}
