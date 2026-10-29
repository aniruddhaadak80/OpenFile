import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { Button, Dropzone, Label, Progress, Segmented, ToolGrid, ErrorNote, Empty } from '@/components/ui'
import { baseName, formatBytes } from '@/lib/files'
import { pdfStatementRows, type Txn, type TextItem } from '@/lib/r13/finance'
import { exportTxns } from '@/lib/r13/export'
import { TxnTable } from '@/lib/r13/ui'
import { DlButton } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

export default function PdfStatementToCsv() {
  const [file, setFile] = useState<File | null>(null)
  const [txns, setTxns] = useState<Txn[] | null>(null)
  const [pages, setPages] = useState(0)
  const [prog, setProg] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dayFirst, setDayFirst] = useState<'d' | 'm'>('d')
  const read = async (f: File, df = dayFirst) => {
    setFile(f); setError(null); setTxns(null); setProg(0)
    try {
      const { openPdfJs } = await import('@/lib/pdf')
      const pdf = await openPdfJs(f)
      setPages(pdf.numPages)
      const all: Txn[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const tc: any = await page.getTextContent()
        const items: TextItem[] = tc.items.filter((x: any) => 'str' in x).map((x: any) => ({ str: x.str, x: x.transform[4], y: x.transform[5] }))
        all.push(...pdfStatementRows(items, df === 'd'))
        setProg(i / pdf.numPages)
        await new Promise((r) => setTimeout(r, 0))
      }
      setTxns(all)
      if (!all.length) setError('No transaction rows were found. This works on text PDFs from online banking. For a scanned statement, run OCR PDF first.')
    } catch (e: any) { setError(e?.message || String(e)) } finally { setProg(null) }
  }
  if (!file) return <Dropzone accept="application/pdf,.pdf" onFiles={(f) => f[0] && read(f[0])} label="Drop a PDF bank statement" sub="Text PDFs downloaded from online banking work best. Each line that starts with a date and has an amount becomes a row." />
  const inn = txns?.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0) ?? 0, out = txns?.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0) ?? 0
  return (
    <ToolGrid
      main={<>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate font-medium">{file.name}</span><span className="text-xs text-muted">{formatBytes(file.size)} · {pages} pages</span></div>
        {prog != null && <Progress value={prog} label="Reading pages" />}
        <ErrorNote error={error} />
        {txns && txns.length > 0 && <>
          <div className="grid grid-cols-3 gap-2"><Stat label="Rows" value={txns.length} /><Stat label="Money in" value={inn.toFixed(2)} /><Stat label="Money out" value={out.toFixed(2)} /></div>
          <TxnTable txns={txns} />
        </>}
        {txns && !txns.length && !error && <Empty>No rows found.</Empty>}
      </>}
      side={<>
        <div><Label>Dates in this statement</Label><Segmented value={dayFirst} onChange={(v) => { setDayFirst(v); void read(file, v) }} options={[{ value: 'd', label: 'Day first' }, { value: 'm', label: 'Month first' }]} /></div>
        <div className="grid grid-cols-2 gap-2">
          {(['csv', 'xlsx', 'ofx', 'qif'] as const).map((o) => <DlButton key={o} disabled={!txns?.length} name={() => `${baseName(file.name)}.${o}`} data={() => exportTxns(txns ?? [], o)}>{o === 'xlsx' ? 'Excel' : o.toUpperCase()}</DlButton>)}
        </div>
        <Button variant="ghost" className="w-full" icon={<FileSpreadsheet className="size-4" />} onClick={() => { setFile(null); setTxns(null) }}>Another statement</Button>
        <p className="text-xs text-muted">Money in or out is worked out from the running balance column when there is one, or from DR and CR marks. Always check the totals against the statement.</p>
      </>}
    />
  )
}
