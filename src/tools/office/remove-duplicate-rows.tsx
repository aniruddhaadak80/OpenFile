import { useEffect, useMemo, useState } from 'react'
import { CopyMinus, Download } from 'lucide-react'
import { Button, Card, Label, Segmented, Switch } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { writeBook } from '@/lib/bcat/sheets'
import { dedupe } from '@/lib/cf/sheet'
import { useSheet, SheetDrop, SheetPicker, FileBar, RowsTable, useColOptions, Stat, Stats } from '@/lib/cf/ui'

export default function RemoveDuplicateRows() {
  const s = useSheet()
  const [header, setHeader] = useState(true), [keep, setKeep] = useState<'first' | 'last'>('first')
  const [cols, setCols] = useState<string[]>([])
  const [trim, setTrim] = useState(true), [caseless, setCaseless] = useState(true), [spaces, setSpaces] = useState(true)
  const [view, setView] = useState<'kept' | 'removed'>('kept'), [fmt, setFmt] = useState<'xlsx' | 'csv' | 'ods'>('xlsx')
  // Save in the same kind of file that was opened: a CSV in gives a CSV out unless the user picks another format.
  useEffect(() => { const n = s.file?.name.toLowerCase() ?? ''; if (n) setFmt(/\.(csv|tsv|txt)$/.test(n) ? 'csv' : /\.ods$/.test(n) ? 'ods' : 'xlsx') }, [s.file])
  const opts = useColOptions(s.rows, header)
  const r = useMemo(() => s.rows.length ? dedupe(s.rows, { cols: cols.length ? cols.map(Number) : null, header, keep, trim, caseless, spaces }) : null, [s.rows, cols, header, keep, trim, caseless, spaces])
  const save = async (which: 'kept' | 'removed') => { if (!r || !s.book) return; const rows = which === 'kept' ? r.rows : r.removed; downloadBlob(await writeBook([{ name: which === 'kept' ? s.book.sheets[s.sheet].name : 'Duplicates', rows }], fmt), `${s.book.name}-${which === 'kept' ? 'deduped' : 'duplicates'}.${fmt}`) }
  if (!s.file) return <SheetDrop s={s} label="Drop a spreadsheet to remove duplicate rows" sub="Match on every column or only the ones you pick, ignoring case and extra spaces. XLSX, ODS, CSV." />
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-3">
        <FileBar name={s.file.name} size={s.file.size} onReset={s.reset} />
        {s.error && <p className="text-sm text-danger">{s.error}</p>}
        {r && <><Stats><Stat label="Rows" value={(s.rows.length - (header ? 1 : 0)).toLocaleString()} /><Stat label="Duplicates removed" value={r.removedCount.toLocaleString()} tone={r.removedCount ? 'warn' : 'good'} /><Stat label="Rows left" value={(r.rows.length - (header ? 1 : 0)).toLocaleString()} /></Stats>
          <Segmented value={view} onChange={setView} options={[{ value: 'kept', label: 'Clean rows' }, { value: 'removed', label: `Removed (${r.removedCount})` }]} />
          <RowsTable rows={view === 'kept' ? r.rows : r.removed} header={header} /></>}
      </div>
      <Card className="space-y-4 self-start">
        <SheetPicker s={s} />
        <Switch checked={header} onChange={setHeader} label="First row is a header" />
        <div><Label hint={cols.length ? `${cols.length} picked` : 'all columns'}>Rows match when these columns match</Label><div className="flex max-h-40 flex-wrap gap-1.5 overflow-auto">{opts.map((c) => <button key={c.value} aria-pressed={cols.includes(c.value)} onClick={() => setCols((o) => o.includes(c.value) ? o.filter((x) => x !== c.value) : [...o, c.value])} className={`rounded-full border px-2.5 py-1 text-xs cursor-pointer ${cols.includes(c.value) ? 'border-accent text-fg' : 'border-border text-muted'}`}>{c.label}</button>)}</div>
          <p className="mt-1 text-xs text-muted">Pick an email or ID column to keep one row per person.</p></div>
        <div><Label>Keep</Label><Segmented value={keep} onChange={setKeep} options={[{ value: 'first', label: 'First copy' }, { value: 'last', label: 'Last copy' }]} /></div>
        <Switch checked={caseless} onChange={setCaseless} label="Ignore upper and lower case" /><Switch checked={trim} onChange={setTrim} label="Ignore spaces at the ends" /><Switch checked={spaces} onChange={setSpaces} label="Treat double spaces as one" />
        <div><Label>Save as</Label><Segmented value={fmt} onChange={setFmt} options={[{ value: 'xlsx', label: 'XLSX' }, { value: 'csv', label: 'CSV' }, { value: 'ods', label: 'ODS' }]} /></div>
        <Button className="w-full" icon={<CopyMinus className="size-4" />} disabled={!r} onClick={() => save('kept')}>Download clean file</Button>
        <Button className="w-full" variant="outline" icon={<Download className="size-4" />} disabled={!r?.removedCount} onClick={() => save('removed')}>Download removed rows</Button>
      </Card>
    </div>
  )
}
