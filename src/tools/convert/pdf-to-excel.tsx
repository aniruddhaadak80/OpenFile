import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Sheet as SheetIcon, Download, Rows3, Columns3, ScanText } from 'lucide-react'
import { Button, Dropzone, ToolGrid, Label, Segmented, Slider, Switch, Input, Progress, ErrorNote, ResultCard, Badge, Empty, useJob, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { baseName, downloadBlob, parsePageRanges, MIME, zipFiles } from '@/lib/files'
import { FileBar, Pill, Reveal, Stat, pdfError, useDebounced } from './_conv/shared'
import { openPdfRich, pageLayout } from './_conv/pdfOpen'
import { groupLines, toGrid, parseNumberish, type Line } from './_conv/pdfText'

const colName = (i: number): string => (i >= 26 ? colName(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26))
interface PageLines { lines: Line[]; width: number }

export default function PdfToExcel() {
  const [file, setFile] = useState<File | null>(null)
  const [pages, setPages] = useState<PageLines[]>([])
  const [cellGap, setCellGap] = useState(1.2)
  const [numbers, setNumbers] = useState(true)
  const [layout, setLayout] = useState<'per-page' | 'single'>('per-page')
  const [range, setRange] = useState('')
  const [view, setView] = useState(0)
  const [result, setResult] = useState<Blob | null>(null)
  const [format, setFormat] = useState<'xlsx' | 'ods' | 'csv'>('xlsx')
  const [delim, setDelim] = useState<',' | ';' | '\t'>(',')
  const load = useJob()
  const conv = useJob()
  const gap = useDebounced(cellGap, 150)

  useEffect(() => {
    if (!file) return
    setPages([]); setResult(null); setView(0)
    load.run(async (setP) => {
      const doc = await openPdfRich(file).catch((e) => { throw new Error(pdfError(e)) })
      const out: PageLines[] = []
      for (let i = 1; i <= doc.numPages; i++) {
        const lay = await pageLayout(doc, i, false)
        out.push({ lines: groupLines(lay.items), width: lay.width })
        setP(i / doc.numPages)
      }
      setPages(out)
    })
  }, [file]) // eslint-disable-line

  const included = useMemo(() => (range.trim() ? parsePageRanges(range, pages.length) : pages.map((_, i) => i)), [range, pages])
  const grids = useMemo(() => pages.map((p) => toGrid(p.lines, p.width, { cellGap: gap })), [pages, gap])
  useEffect(() => setResult(null), [grids, numbers, layout, range, format, delim])
  const cur = grids[view] ?? []
  const cols = Math.max(0, ...cur.map((r) => r.length))
  const totalRows = included.reduce((s, i) => s + (grids[i]?.length ?? 0), 0)
  const emptyPages = included.filter((i) => !grids[i]?.length).length

  const toCells = (rows: string[][]) => rows.map((r) => r.map((v) => {
    if (!numbers) return v
    const n = parseNumberish(v)
    return n === null ? v : { v: n, t: 'n', z: /%/.test(v) ? '0.00%' : /[$€£₹¥]/.test(v) ? '#,##0.00' : /,\d{3}/.test(v) ? (/\./.test(v) ? '#,##0.00' : '#,##0') : undefined }
  }))

  const exportXlsx = () => conv.run(async () => {
    if (!included.length) throw new Error('No pages selected.')
    if (format === 'csv') {
      const Papa = (await import('papaparse')).default
      const csv = (rows: string[][]) => '\ufeff' + Papa.unparse(rows, { delimiter: delim })
      const used = included.filter((i) => grids[i]?.length)
      if (!used.length) throw new Error('No text found on the selected pages (scanned PDF?). Try OCR PDF first.')
      if (layout === 'single' || used.length === 1) {
        const all: string[][] = []
        for (const i of used) { if (all.length) all.push([]); all.push(...grids[i]) }
        setResult(new Blob([csv(all)], { type: 'text/csv;charset=utf-8' }))
      } else setResult(await zipFiles(used.map((i) => ({ name: `${baseName(file!.name)}-page-${i + 1}.csv`, data: csv(grids[i]) }))))
      toast('CSV ready', 'success'); return
    }
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const mkSheet = (rows: string[][]) => {
      const ws = XLSX.utils.aoa_to_sheet(toCells(rows) as any)
      const n = Math.max(0, ...rows.map((r) => r.length))
      ws['!cols'] = Array.from({ length: n }, (_, i) => ({ wch: Math.min(60, Math.max(6, ...rows.slice(0, 300).map((r) => (r[i] ?? '').length)) + 2) }))
      return ws
    }
    if (layout === 'single') {
      const all: string[][] = []
      for (const i of included) { if (!grids[i]?.length) continue; if (all.length) all.push([]); all.push(...grids[i]) }
      XLSX.utils.book_append_sheet(wb, mkSheet(all), 'Data')
    } else {
      for (const i of included) if (grids[i]?.length) XLSX.utils.book_append_sheet(wb, mkSheet(grids[i]), `Page ${i + 1}`)
    }
    if (!wb.SheetNames.length) throw new Error('No text found on the selected pages (scanned PDF?). Try OCR PDF first.')
    const buf = XLSX.write(wb, { type: 'array', bookType: format })
    setResult(new Blob([buf], { type: format === 'ods' ? 'application/vnd.oasis.opendocument.spreadsheet' : MIME.xlsx }))
    toast('Spreadsheet ready', 'success')
  })

  const downloadCsv = async () => {
    const Papa = (await import('papaparse')).default
    downloadBlob(new Blob([Papa.unparse(cur)], { type: 'text/csv;charset=utf-8' }), `${baseName(file!.name)}-page-${view + 1}.csv`)
  }
  const reset = () => { setFile(null); setPages([]); setResult(null) }

  if (!file) return <Dropzone accept="application/pdf,.pdf" onFiles={(f) => setFile(f[0])} label="Drop a PDF with tables to convert to Excel" />

  return (
    <div className="space-y-5">
      <FileBar name={file.name} size={file.size} sub={pages.length ? `${pages.length} page${pages.length > 1 ? 's' : ''}` : 'reading…'} onReset={reset} />
      <ToolGrid
        main={<>
          {load.busy && <Progress value={load.progress} label="Reading text positions" />}
          <ErrorNote error={load.error} />
          {result && <Reveal k="r"><ResultCard blob={result} filename={`${baseName(file.name)}.${format === 'csv' ? (result.type === 'application/zip' ? 'zip' : 'csv') : format}`} title={format === 'csv' ? 'CSV ready' : format === 'ods' ? 'OpenDocument spreadsheet ready' : 'Excel workbook ready'} onReset={reset} /></Reveal>}
          {pages.length > 0 && <>
            <div className="flex flex-wrap items-center gap-1.5">
              {pages.map((_, i) => <Pill key={i} active={i === view} onClick={() => setView(i)}><span className={cn(!included.includes(i) && 'line-through opacity-50')}>Page {i + 1}</span>{grids[i]?.length ? '' : ' ·∅'}</Pill>)}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <Badge>{cur.length} rows × {cols} cols</Badge>
              <span>Preview of page {view + 1}, columns are detected from text alignment.</span>
              <Button size="sm" variant="ghost" className="ml-auto" icon={<Download className="size-4" />} disabled={!cur.length} onClick={downloadCsv}>CSV</Button>
            </div>
            {cur.length ? (
              <motion.div key={view + '-' + gap} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-h-[62vh] overflow-auto rounded-2xl border border-border bg-surface scrollbar-thin">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-surface-2">
                    <tr><th className="w-8 border-b border-border" />{Array.from({ length: cols }, (_, i) => <th key={i} className="border-b border-l border-border px-2 py-1.5 font-mono text-[10px] text-muted">{colName(i)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {cur.map((r, ri) => (
                      <tr key={ri} className="hover:bg-accent/5">
                        <td className="border-b border-border px-1.5 text-right font-mono text-[10px] text-muted">{ri + 1}</td>
                        {Array.from({ length: cols }, (_, ci) => { const v = r[ci] ?? ''; const num = numbers && parseNumberish(v) !== null; return <td key={ci} className={cn('max-w-72 border-b border-l border-border px-2 py-1', num && 'text-right font-mono text-accent')}>{v}</td> })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            ) : <Empty><ScanText className="mx-auto mb-2 size-6 text-warn" />No text on this page, it may be a scanned image. Run OCR PDF first to make it extractable.</Empty>}
          </>}
        </>}
        side={<>
          <div className="grid grid-cols-3 gap-2"><Stat label="Pages" value={included.length} /><Stat label="Rows" value={totalRows} /><Stat label="Empty" value={emptyPages} /></div>
          <div>
            <Slider label={<span className="inline-flex items-center gap-1.5"><Columns3 className="size-3.5" />Column split sensitivity</span>} ariaLabel="Column split sensitivity" value={cellGap} onChange={setCellGap} min={0.4} max={4} step={0.1} suffix="×" />
            <p className="mt-1 text-[11px] text-muted">Lower = split cells on smaller gaps (more columns). Raise it if words get split into separate columns.</p>
          </div>
          <div><Label>Output format</Label><Segmented value={format} onChange={setFormat} options={[{ value: 'xlsx', label: 'Excel (XLSX)' }, { value: 'csv', label: 'CSV' }, { value: 'ods', label: 'ODS' }]} /></div>
          {format === 'csv' && <div><Label>CSV separator</Label><Segmented value={delim} onChange={setDelim} options={[{ value: ',', label: 'Comma' }, { value: ';', label: 'Semicolon' }, { value: '\t', label: 'Tab' }]} /><p className="mt-1 text-[11px] text-muted">One sheet per page gives a ZIP with one CSV per page.</p></div>}
          <div><Label>Workbook layout</Label><Segmented value={layout} onChange={setLayout} options={[{ value: 'per-page', label: 'One sheet per page' }, { value: 'single', label: 'Single sheet' }]} /></div>
          <div><Label hint={range ? `${included.length} pages` : 'all'}>Pages</Label><Input aria-label="Pages" value={range} onChange={(e) => setRange(e.target.value)} placeholder="e.g. 1-3, 5 (blank = all)" /></div>
          <Switch checked={numbers} onChange={setNumbers} label={<span className="inline-flex items-center gap-1.5"><Rows3 className="size-4 text-muted" />Convert numbers ($1,234.50 → 1234.5)</span>} />
          {conv.busy && <Progress value={0.6} label="Building workbook" />}
          <ErrorNote error={conv.error} />
          <Button size="lg" className="w-full" loading={conv.busy} disabled={!pages.length || load.busy} icon={<SheetIcon className="size-5" />} onClick={exportXlsx}>{format === 'csv' ? 'Export to CSV' : format === 'ods' ? 'Export to ODS' : 'Export to Excel'}</Button>
        </>}
      />
    </div>
  )
}
