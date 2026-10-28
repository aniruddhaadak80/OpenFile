import { useEffect, useMemo, useState } from 'react'
import { FileDown, Table2, Eye, Loader2 } from 'lucide-react'
import { Button, Dropzone, ToolGrid, Label, Select, Segmented, Slider, Switch, ErrorNote, ResultCard, Tabs, Badge, useJob } from '@/components/ui'
import { toast } from '@/components/toast'
import { baseName } from '@/lib/files'
import { FileBar, PdfPreview, Pill, Reveal, Stat, pageDims, mm, useDebounced, type PageSizeKey } from './_conv/shared'
import { drawTable } from './_conv/pdfTable'

interface Sheet { name: string; rows: string[][] }

export default function ExcelToPdf() {
  const [file, setFile] = useState<File | null>(null)
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [active, setActive] = useState(0)
  const [allSheets, setAllSheets] = useState(false)
  const [size, setSize] = useState<PageSizeKey>('a4')
  const [orient, setOrient] = useState<'portrait' | 'landscape'>('landscape')
  const [fontSize, setFontSize] = useState(9)
  const [gridlines, setGridlines] = useState(true)
  const [header, setHeader] = useState(true)
  const [repeat, setRepeat] = useState(true)
  const [zebra, setZebra] = useState(true)
  const [fit, setFit] = useState<'width' | 'shrink' | 'none'>('width')
  const [marginMm, setMarginMm] = useState(12)
  const [font, setFont] = useState<'helvetica' | 'times' | 'courier'>('helvetica')
  const [title, setTitle] = useState(true)
  const [numbers, setNumbers] = useState(true)
  const [tab, setTab] = useState<'data' | 'pdf'>('pdf')
  const [pdf, setPdf] = useState<{ blob: Blob; pages: number; fs: number } | null>(null)
  const [building, setBuilding] = useState(false)
  const load = useJob()

  useEffect(() => {
    if (!file) return
    setSheets([]); setPdf(null); setActive(0)
    load.run(async () => {
      const XLSX = await import('xlsx')
      const isCsv = /\.(csv|tsv|txt)$/i.test(file.name)
      const wb = isCsv ? XLSX.read(await file.text(), { type: 'string', raw: false }) : XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const out: Sheet[] = wb.SheetNames.map((name) => {
        const m = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false }) as unknown[][]
        // trim fully-empty trailing columns
        let width = 0
        for (const r of m) for (let i = r.length - 1; i >= 0; i--) if (String(r[i] ?? '').trim()) { width = Math.max(width, i + 1); break }
        return { name, rows: m.map((r) => Array.from({ length: width }, (_, i) => String(r[i] ?? ''))).filter((r) => r.some((c) => c.trim())) }
      })
      if (!out.some((s) => s.rows.length)) throw new Error('No data found in this file.')
      setSheets(out)
      setActive(Math.max(0, out.findIndex((s) => s.rows.length)))
    })
  }, [file]) // eslint-disable-line

  const opts = useDebounced(JSON.stringify({ active, allSheets, size, orient, fontSize, gridlines, header, repeat, zebra, fit, marginMm, font, title, numbers }), 350)

  // regenerate the real PDF on every change (fast — vector text)
  useEffect(() => {
    if (!sheets.length) return
    let off = false
    setBuilding(true)
    const t = setTimeout(async () => {
      try {
        const { jsPDF } = await import('jspdf')
        const d = pageDims(size, orient)
        const doc = new jsPDF({ unit: 'pt', format: [d.w, d.h], orientation: orient, compress: true })
        const list = allSheets ? sheets.filter((s) => s.rows.length) : [sheets[active]]
        let first = true, fsUsed = fontSize
        for (const s of list) {
          const r = drawTable(doc, s.rows, { fontSize, header, repeatHeader: repeat, gridlines, zebra, fit, margin: mm(marginMm), title: title ? s.name : undefined, font, usePage: first })
          fsUsed = Math.min(fsUsed, r.fontSize); first = false
        }
        if (numbers) {
          const n = doc.getNumberOfPages()
          for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor('#8a8f9c'); doc.text(`${i} / ${n}`, d.w - mm(marginMm), d.h - mm(marginMm) / 2, { align: 'right' }) }
        }
        doc.setProperties({ title: baseName(file!.name), creator: 'OpenFile' })
        if (!off) setPdf({ blob: doc.output('blob'), pages: doc.getNumberOfPages(), fs: fsUsed })
      } catch (e: any) { if (!off) toast(e?.message || 'Could not render PDF', 'error') }
      finally { if (!off) setBuilding(false) }
    }, 10)
    return () => { off = true; clearTimeout(t) }
  }, [opts, sheets]) // eslint-disable-line

  const sheet = sheets[active]
  const preview = useMemo(() => sheet?.rows.slice(0, 101) ?? [], [sheet])
  const reset = () => { setFile(null); setSheets([]); setPdf(null) }

  if (!file) return <Dropzone accept=".xlsx,.xls,.xlsm,.ods,.csv,.tsv" onFiles={(f) => setFile(f[0])} label="Drop an Excel or CSV file" sub="XLSX, XLS, ODS, CSV — converted 100% in your browser." />

  return (
    <div className="space-y-5">
      <FileBar name={file.name} size={file.size} sub={sheets.length ? `${sheets.length} sheet${sheets.length > 1 ? 's' : ''}` : 'reading…'} onReset={reset} />
      <ToolGrid
        main={<>
          <ErrorNote error={load.error} />
          {sheets.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted">Sheet</span>
              {sheets.map((s, i) => <Pill key={s.name} active={!allSheets && i === active} onClick={() => { setActive(i); setAllSheets(false) }}>{s.name} <span className="opacity-60">({Math.max(0, s.rows.length - (header ? 1 : 0))})</span></Pill>)}
              <Pill active={allSheets} onClick={() => setAllSheets(true)}>All sheets</Pill>
            </div>
          )}
          {sheets.length > 0 && <>
            <div className="flex items-center justify-between gap-2">
              <Tabs value={tab} onChange={setTab} tabs={[{ value: 'pdf', label: <span className="inline-flex items-center gap-1.5"><Eye className="size-4" />PDF preview</span> }, { value: 'data', label: <span className="inline-flex items-center gap-1.5"><Table2 className="size-4" />Data</span> }]} />
              {building && <span className="inline-flex items-center gap-1.5 text-xs text-muted"><Loader2 className="size-3.5 animate-spin" />Updating…</span>}
            </div>
            {tab === 'pdf' ? (pdf ? <PdfPreview blob={pdf.blob} height={640} /> : <div className="grid h-80 place-items-center text-sm text-muted">Rendering…</div>) : (
              <div className="max-h-[640px] overflow-auto rounded-2xl border border-border scrollbar-thin">
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {preview.map((r, ri) => (
                      <tr key={ri} className={ri === 0 && header ? 'sticky top-0 bg-surface-2 font-semibold' : 'odd:bg-surface-2/30'}>
                        <td className="border-b border-border px-2 py-1 text-right font-mono text-[10px] text-muted">{ri + 1}</td>
                        {r.map((c, ci) => <td key={ci} className="max-w-64 truncate border-b border-l border-border px-2 py-1" title={c}>{c}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sheet && sheet.rows.length > 101 && <div className="p-3 text-center text-xs text-muted">Showing first 100 rows of {sheet.rows.length.toLocaleString()} — the PDF includes all of them.</div>}
              </div>
            )}
          </>}
        </>}
        side={<>
          <div className="grid grid-cols-3 gap-2"><Stat label="Rows" value={(sheet?.rows.length ?? 0).toLocaleString()} /><Stat label="Cols" value={sheet?.rows[0]?.length ?? 0} /><Stat label="Pages" value={pdf?.pages ?? '…'} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Page</Label><Select value={size} onChange={setSize} options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }, { value: 'legal', label: 'Legal' }, { value: 'a3', label: 'A3' }]} /></div>
            <div><Label>Orientation</Label><Segmented value={orient} onChange={setOrient} options={[{ value: 'portrait', label: 'Port.' }, { value: 'landscape', label: 'Land.' }]} /></div>
          </div>
          <div>
            <Label>Wide tables</Label>
            <Segmented value={fit} onChange={setFit} options={[{ value: 'width', label: 'Fit width' }, { value: 'shrink', label: 'Shrink font' }, { value: 'none', label: 'Split pages' }]} />
            {fit === 'shrink' && pdf && pdf.fs < fontSize && <p className="mt-1 text-[11px] text-muted">Font reduced to {pdf.fs.toFixed(1)} pt to fit.</p>}
          </div>
          <Slider label="Font size" value={fontSize} onChange={setFontSize} min={5} max={16} step={0.5} suffix=" pt" />
          <div><Label>Font</Label><Segmented value={font} onChange={setFont} options={[{ value: 'helvetica', label: 'Helvetica' }, { value: 'times', label: 'Times' }, { value: 'courier', label: 'Courier' }]} /></div>
          <Slider label="Margins" value={marginMm} onChange={setMarginMm} min={5} max={30} suffix=" mm" />
          <div className="space-y-2.5">
            <Switch checked={header} onChange={setHeader} label="First row is a header" />
            {header && <Switch checked={repeat} onChange={setRepeat} label="Repeat header on every page" />}
            <Switch checked={gridlines} onChange={setGridlines} label="Gridlines" />
            <Switch checked={zebra} onChange={setZebra} label="Striped rows" />
            <Switch checked={title} onChange={setTitle} label="Sheet name as title" />
            <Switch checked={numbers} onChange={setNumbers} label="Page numbers" />
          </div>
          {pdf && <ResultCard blob={pdf.blob} filename={`${baseName(file.name)}${allSheets || sheets.length < 2 ? '' : '-' + sheet?.name}.pdf`} title={`${pdf.pages} page${pdf.pages > 1 ? 's' : ''}`} />}
          {!pdf && <Button size="lg" className="w-full" disabled icon={<FileDown className="size-5" />}>Preparing PDF…</Button>}
          <p className="text-[11px] text-muted">Real vector text — selectable and searchable. <Badge>Live</Badge> Preview updates as you change options.</p>
        </>}
      />
    </div>
  )
}
