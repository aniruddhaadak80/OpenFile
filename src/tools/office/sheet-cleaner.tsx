import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button, Card, Label, Segmented, Switch } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { writeBook } from '@/lib/bcat/sheets'
import { cleanRows, type CleanOpts } from '@/lib/cf/sheet'
import { useSheet, SheetDrop, SheetPicker, FileBar, RowsTable, Stat, Stats } from '@/lib/cf/ui'

export default function SheetCleaner() {
  const s = useSheet()
  const [o, setO] = useState<CleanOpts>({ trim: true, collapse: true, blankRows: true, blankCols: true, nbsp: true, caseMode: 'none', numbers: true, dates: false, header: true, transpose: false, fill: false })
  const [view, setView] = useState<'after' | 'before'>('after'), [fmt, setFmt] = useState<'xlsx' | 'csv' | 'ods'>('xlsx')
  const set = (p: Partial<CleanOpts>) => setO((x) => ({ ...x, ...p }))
  const r = useMemo(() => (s.rows.length ? cleanRows(s.rows, o) : null), [s.rows, o])
  if (!s.file) return <SheetDrop s={s} label="Drop a messy spreadsheet or CSV" sub="Trim spaces, remove blank rows and columns, fix number text, change case, fill down and transpose in one go." />
  const sw = (k: keyof CleanOpts, label: string) => <Switch checked={!!o[k]} onChange={(v) => set({ [k]: v } as any)} label={label} />
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-3">
        <FileBar name={s.file.name} size={s.file.size} onReset={s.reset} />
        {r && <Stats cols={4}><Stat label="Cells changed" value={r.changed.toLocaleString()} /><Stat label="Blank rows removed" value={r.blankRowsRemoved} /><Stat label="Blank columns removed" value={r.blankColsRemoved} /><Stat label="Size now" value={`${Math.max(0, r.rows.length)} × ${Math.max(0, ...r.rows.slice(0, 50).map((x) => x.length))}`} /></Stats>}
        <Segmented value={view} onChange={setView} options={[{ value: 'after', label: 'Cleaned' }, { value: 'before', label: 'Original' }]} />
        <RowsTable rows={view === 'after' ? r?.rows ?? [] : s.rows} header={o.header} />
      </div>
      <Card className="space-y-3 self-start">
        <SheetPicker s={s} />
        {sw('header', 'First row is a header (left as it is)')}
        <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted">Text</div>
        {sw('trim', 'Trim spaces at both ends')}{sw('collapse', 'Turn double spaces into one')}{sw('nbsp', 'Remove hidden spaces and zero width characters')}
        <div><Label>Change case</Label><Segmented value={o.caseMode} onChange={(v) => set({ caseMode: v })} options={[{ value: 'none', label: 'Keep' }, { value: 'lower', label: 'lower' }, { value: 'upper', label: 'UPPER' }, { value: 'title', label: 'Title' }]} /></div>
        <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted">Values</div>
        {sw('numbers', 'Turn number text like "1,200" or "15%" into numbers')}{sw('dates', 'Turn dates like 05/11/2026 into 2026-11-05')}{sw('fill', 'Fill empty cells with the value above')}
        <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted">Layout</div>
        {sw('blankRows', 'Remove empty rows')}{sw('blankCols', 'Remove empty columns')}{sw('transpose', 'Swap rows and columns')}
        <div><Label>Save as</Label><Segmented value={fmt} onChange={setFmt} options={[{ value: 'xlsx', label: 'XLSX' }, { value: 'csv', label: 'CSV' }, { value: 'ods', label: 'ODS' }]} /></div>
        <Button className="w-full" icon={<Sparkles className="size-4" />} disabled={!r} onClick={async () => downloadBlob(await writeBook([{ name: s.book!.sheets[s.sheet].name, rows: r!.rows }], fmt), `${s.book!.name}-clean.${fmt}`)}>Download clean file</Button>
      </Card>
    </div>
  )
}
