import { useEffect, useMemo, useState } from 'react'
import { ArrowDownUp, Plus, X } from 'lucide-react'
import { Button, Card, Input, Label, Segmented, Select, Switch } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { writeBook } from '@/lib/bcat/sheets'
import { sortFilter, type Filter, type FilterOp, type SortKey } from '@/lib/cf/sheet'
import { useSheet, SheetDrop, SheetPicker, FileBar, RowsTable, useColOptions } from '@/lib/cf/ui'

const OPS: { value: FilterOp; label: string }[] = [{ value: 'contains', label: 'contains' }, { value: 'not-contains', label: 'does not contain' }, { value: 'equals', label: 'equals' }, { value: 'not-equals', label: 'is not' }, { value: 'starts', label: 'starts with' }, { value: 'ends', label: 'ends with' }, { value: 'gt', label: '>' }, { value: 'gte', label: '≥' }, { value: 'lt', label: '<' }, { value: 'lte', label: '≤' }, { value: 'empty', label: 'is empty' }, { value: 'not-empty', label: 'is not empty' }, { value: 'regex', label: 'matches pattern' }]

export default function SortFilterRows() {
  const s = useSheet()
  const [header, setHeader] = useState(true)
  const [filters, setFilters] = useState<Filter[]>([])
  const [match, setMatch] = useState<'all' | 'any'>('all')
  const [sort, setSort] = useState<SortKey[]>([{ col: 0, dir: 'asc', as: 'auto' }])
  const [fmt, setFmt] = useState<'xlsx' | 'csv' | 'ods'>('xlsx')
  // Save in the same kind of file that was opened: a CSV in gives a CSV out unless the user picks another format.
  useEffect(() => { const n = s.file?.name.toLowerCase() ?? ''; if (n) setFmt(/\.(csv|tsv|txt)$/.test(n) ? 'csv' : /\.ods$/.test(n) ? 'ods' : 'xlsx') }, [s.file])
  const opts = useColOptions(s.rows, header)
  const out = useMemo(() => (s.rows.length ? sortFilter(s.rows, { header, filters, match, sort }) : []), [s.rows, header, filters, match, sort])
  const upd = <T,>(arr: T[], i: number, p: Partial<T>) => arr.map((x, k) => (k === i ? { ...x, ...p } : x))
  if (!s.file) return <SheetDrop s={s} label="Drop a spreadsheet to sort and filter" sub="Sort by several columns, keep rows that match your rules, and save a new file." />
  const n = Math.max(0, out.length - (header ? 1 : 0)), total = Math.max(0, s.rows.length - (header ? 1 : 0))
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-3">
        <FileBar name={s.file.name} size={s.file.size} onReset={s.reset} extra={<span className="text-xs text-muted">{n.toLocaleString()} of {total.toLocaleString()} rows</span>} />
        <RowsTable rows={out} header={header} />
      </div>
      <Card className="space-y-4 self-start">
        <SheetPicker s={s} />
        <Switch checked={header} onChange={setHeader} label="First row is a header" />
        <div className="space-y-2"><Label>Keep rows where</Label>
          {filters.map((f, i) => <div key={i} className="grid grid-cols-[1fr_auto] gap-1.5 rounded-xl border border-border p-2">
            <div className="grid gap-1.5"><Select value={String(f.col)} onChange={(v) => setFilters(upd(filters, i, { col: +v }))} options={opts} /><Select value={f.op} onChange={(v) => setFilters(upd(filters, i, { op: v }))} options={OPS} />{!['empty', 'not-empty'].includes(f.op) && <Input value={f.value} onChange={(e) => setFilters(upd(filters, i, { value: e.target.value }))} placeholder="value" />}</div>
            <button aria-label="Remove rule" onClick={() => setFilters(filters.filter((_, k) => k !== i))} className="self-start rounded-lg p-1 text-muted hover:text-danger cursor-pointer"><X className="size-4" /></button></div>)}
          {filters.length > 1 && <Segmented value={match} onChange={setMatch} options={[{ value: 'all', label: 'Match all rules' }, { value: 'any', label: 'Match any rule' }]} />}
          <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={() => setFilters([...filters, { col: 0, op: 'contains', value: '' }])}>Add filter</Button></div>
        <div className="space-y-2"><Label>Sort by</Label>
          {sort.map((k, i) => <div key={i} className="grid grid-cols-[1fr_auto] gap-1.5 rounded-xl border border-border p-2">
            <div className="grid gap-1.5"><Select value={String(k.col)} onChange={(v) => setSort(upd(sort, i, { col: +v }))} options={opts} />
              <div className="flex gap-1.5"><Segmented value={k.dir} onChange={(v) => setSort(upd(sort, i, { dir: v }))} options={[{ value: 'asc', label: 'A to Z' }, { value: 'desc', label: 'Z to A' }]} /><Select className="h-8 text-xs" value={k.as} onChange={(v) => setSort(upd(sort, i, { as: v }))} options={[{ value: 'auto', label: 'Auto' }, { value: 'number', label: 'Numbers' }, { value: 'date', label: 'Dates' }, { value: 'text', label: 'Text' }]} /></div></div>
            <button aria-label="Remove sort" onClick={() => setSort(sort.filter((_, x) => x !== i))} className="self-start rounded-lg p-1 text-muted hover:text-danger cursor-pointer"><X className="size-4" /></button></div>)}
          <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={() => setSort([...sort, { col: 0, dir: 'asc', as: 'auto' }])}>{sort.length ? 'Then by' : 'Add sort'}</Button></div>
        <div><Label>Save as</Label><Segmented value={fmt} onChange={setFmt} options={[{ value: 'xlsx', label: 'XLSX' }, { value: 'csv', label: 'CSV' }, { value: 'ods', label: 'ODS' }]} /></div>
        <Button className="w-full" icon={<ArrowDownUp className="size-4" />} disabled={!s.book} onClick={async () => downloadBlob(await writeBook([{ name: s.book!.sheets[s.sheet].name, rows: out }], fmt), `${s.book!.name}-sorted.${fmt}`)}>Download {n.toLocaleString()} rows</Button>
      </Card>
    </div>
  )
}
