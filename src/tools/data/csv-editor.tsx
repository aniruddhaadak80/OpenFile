import { useCallback, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Columns3, Copy, Download, Eraser, Plus, Replace, Rows3, Scissors, Search, Trash2, Undo2, Combine, Sigma } from 'lucide-react'
import { Button, Dropzone, Input, Select, Switch, Label, Badge, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob, baseName, zipFiles } from '@/lib/files'
import { Bar, Status, Stat } from '../dev/_b5/shell'
import { dedupe, sortRows, filterRows, findReplace, splitRows, splitByColumn, mergeGrids, fromMatrix, columnStats, type Grid } from '@/lib/b5/table'

const ROW_H = 34
const VIEW_H = 520

async function readGrid(f: File, header: boolean): Promise<Grid> {
  if (/\.(xlsx|xls|xlsm|ods|numbers)$/i.test(f.name)) {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    return fromMatrix(XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as unknown[][], header)
  }
  const Papa = (await import('papaparse')).default
  const r = Papa.parse<string[]>((await f.text()).replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy', delimiter: /\.tsv$/i.test(f.name) ? '\t' : '' })
  if (!r.data.length) throw new Error('No rows found in this file.')
  return fromMatrix(r.data, header)
}

async function gridToBlob(g: Grid, fmt: 'csv' | 'tsv' | 'xlsx' | 'json'): Promise<Blob> {
  if (fmt === 'xlsx') {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([g.headers, ...g.rows]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  }
  if (fmt === 'json') return new Blob([JSON.stringify(g.rows.map((r) => Object.fromEntries(g.headers.map((h, i) => [h, r[i] ?? '']))), null, 2)], { type: 'application/json' })
  const Papa = (await import('papaparse')).default
  return new Blob(['\uFEFF' + Papa.unparse({ fields: g.headers, data: g.rows }, { delimiter: fmt === 'tsv' ? '\t' : ',' })], { type: fmt === 'tsv' ? 'text/tab-separated-values' : 'text/csv' })
}

export default function CsvEditor() {
  const [grid, setGridRaw] = useState<Grid | null>(null)
  const [hist, setHist] = useState<Grid[]>([])
  const [name, setName] = useState('table')
  const [header, setHeader] = useState(true)
  const [q, setQ] = useState('')
  const [qCol, setQCol] = useState<string>('all')
  const [sel, setSel] = useState<number>(0)
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null)
  const [find, setFind] = useState(''); const [repl, setRepl] = useState(''); const [rx, setRx] = useState(false)
  const [chunk, setChunk] = useState(1000)
  const [fmt, setFmt] = useState<'csv' | 'tsv' | 'xlsx' | 'json'>('csv')
  const [err, setErr] = useState<string | null>(null)
  const [scroll, setScroll] = useState(0)
  const mergeRef = useRef<HTMLInputElement>(null)

  const setGrid = useCallback((g: Grid, keep = true) => { setGridRaw((cur) => { if (cur && keep) setHist((h) => [...h.slice(-30), cur]); return g }) }, [])
  const undo = () => { const p = hist[hist.length - 1]; if (p) { setGridRaw(p); setHist((h) => h.slice(0, -1)) } }

  const open = async (files: File[]) => {
    setErr(null)
    try {
      const gs = await Promise.all(files.map((f) => readGrid(f, header)))
      setName(baseName(files[0].name)); setHist([]); setSort(null); setSel(0)
      setGridRaw(gs.length > 1 ? mergeGrids(gs) : gs[0])
      if (gs.length > 1) toast(`Merged ${gs.length} files`)
    } catch (e: any) { setErr(e.message) }
  }

  const visibleIdx = useMemo(() => grid ? filterRows(grid.rows, q, qCol === 'all' ? null : Number(qCol)) : [], [grid, q, qCol])
  const stats = useMemo(() => grid && grid.headers.length ? columnStats(grid.rows, Math.min(sel, grid.headers.length - 1)) : null, [grid, sel])

  if (!grid) return (
    <div className="space-y-4">
      <Dropzone multiple accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods" onFiles={open} label="Drop CSV, TSV or Excel files" sub="Drop several CSV files to merge them into one table. Everything stays on your device." />
      <div className="flex flex-wrap items-center gap-4">
        <Switch checked={header} onChange={setHeader} label="First row is the header" />
        <Button variant="outline" size="sm" icon={<Plus className="size-4" />} onClick={() => setGridRaw({ headers: ['A', 'B', 'C'], rows: Array.from({ length: 5 }, () => ['', '', '']) })}>Start with a blank sheet</Button>
      </div>
      {err && <Status kind="err">{err}</Status>}
    </div>
  )

  const cols = grid.headers.length
  const editCell = (ri: number, ci: number, v: string) => { const rows = grid.rows.slice(); rows[ri] = rows[ri].slice(); rows[ri][ci] = v; setGrid({ headers: grid.headers, rows }, false) }
  const editHeader = (ci: number, v: string) => { const h = grid.headers.slice(); h[ci] = v; setGrid({ headers: h, rows: grid.rows }, false) }
  const addRow = () => setGrid({ headers: grid.headers, rows: [...grid.rows, Array(cols).fill('')] })
  const addCol = () => setGrid({ headers: [...grid.headers, `Column ${cols + 1}`], rows: grid.rows.map((r) => [...r, '']) })
  const delCol = (ci: number) => { setGrid({ headers: grid.headers.filter((_, i) => i !== ci), rows: grid.rows.map((r) => r.filter((_, i) => i !== ci)) }); setSel(0) }
  const delRow = (ri: number) => setGrid({ headers: grid.headers, rows: grid.rows.filter((_, i) => i !== ri) })
  const doSort = (ci: number) => { const dir: 1 | -1 = sort?.col === ci && sort.dir === 1 ? -1 : 1; setSort({ col: ci, dir }); setGrid({ headers: grid.headers, rows: sortRows(grid.rows, ci, dir) }) }
  const doDedupe = (onlyCol: boolean) => { const r = dedupe(grid, onlyCol ? [sel] : undefined); setGrid(r.grid); toast(r.removed ? `Removed ${r.removed} duplicate row${r.removed > 1 ? 's' : ''}` : 'No duplicates found', r.removed ? 'success' : 'info') }
  const doReplace = () => { try { const r = findReplace(grid, find, repl, { regex: rx, matchCase: false, col: qCol === 'all' ? null : Number(qCol) }); setGrid(r.grid); toast(`Replaced ${r.count} match${r.count === 1 ? '' : 'es'}`, r.count ? 'success' : 'info') } catch (e: any) { toast(e.message, 'error') } }
  const removeEmptyRows = () => { const rows = grid.rows.filter((r) => r.some((c) => c.trim() !== '')); setGrid({ headers: grid.headers, rows }); toast(`Removed ${grid.rows.length - rows.length} empty rows`) }
  const trimAll = () => setGrid({ headers: grid.headers.map((h) => h.trim()), rows: grid.rows.map((r) => r.map((c) => c.trim())) })
  const keepFiltered = () => setGrid({ headers: grid.headers, rows: visibleIdx.map((i) => grid.rows[i]) })
  const exportAll = async () => downloadBlob(await gridToBlob(grid, fmt), `${name}.${fmt}`)
  const exportColumn = () => { const vals = grid.rows.map((r) => r[sel] ?? ''); downloadBlob(new Blob([vals.join('\n')], { type: 'text/plain' }), `${name}-${grid.headers[sel] || 'column'}.txt`) }
  const exportSplit = async (byCol: boolean) => {
    const parts = byCol ? [...splitByColumn(grid, sel)].map(([k, g]) => ({ k: k.replace(/[^\w.-]+/g, '_').slice(0, 60), g })) : splitRows(grid, chunk).map((g, i) => ({ k: String(i + 1).padStart(3, '0'), g }))
    if (parts.length > 2000) return toast('That would make more than 2000 files. Pick a bigger chunk or another column.', 'error')
    const files = await Promise.all(parts.map(async (p) => ({ name: `${name}-${p.k}.${fmt}`, data: await gridToBlob(p.g, fmt) })))
    downloadBlob(await zipFiles(files), `${name}-split.zip`); toast(`Split into ${files.length} files`)
  }

  const start = Math.max(0, Math.floor(scroll / ROW_H) - 5)
  const end = Math.min(visibleIdx.length, start + Math.ceil(VIEW_H / ROW_H) + 10)

  return (
    <div className="space-y-4">
      <Bar>
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter rows" className="w-52 pl-8" aria-label="Filter rows" /></div>
        <Select value={qCol} onChange={setQCol} options={[{ value: 'all', label: 'All columns' }, ...grid.headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }))]} className="w-44" />
        {q && <Button size="sm" variant="outline" onClick={keepFiltered}>Keep {visibleIdx.length} matching rows</Button>}
        <div className="ml-auto flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />} onClick={undo} disabled={!hist.length}>Undo</Button>
          <Button size="sm" variant="ghost" icon={<Rows3 className="size-4" />} onClick={addRow}>Row</Button>
          <Button size="sm" variant="ghost" icon={<Columns3 className="size-4" />} onClick={addCol}>Column</Button>
          <Button size="sm" variant="ghost" icon={<Combine className="size-4" />} onClick={() => mergeRef.current?.click()}>Append file</Button>
          <input ref={mergeRef} type="file" hidden multiple accept=".csv,.tsv,.txt,.xlsx,.xls,.ods" onChange={async (e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; if (!fs.length) return; try { const gs = await Promise.all(fs.map((f) => readGrid(f, header))); setGrid(mergeGrids([grid, ...gs])); toast(`Appended ${gs.reduce((a, g) => a + g.rows.length, 0)} rows`) } catch (er: any) { toast(er.message, 'error') } }} />
          <Button size="sm" variant="ghost" onClick={() => { setGridRaw(null); setHist([]) }}>Close</Button>
        </div>
      </Bar>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            <Badge>{grid.rows.length.toLocaleString()} rows</Badge><Badge color="#14B8A6">{cols} columns</Badge>
            {q && <Badge color="#38BDF8">{visibleIdx.length.toLocaleString()} shown</Badge>}
            <span>Click a header to select the column, the arrow to sort. Cells are editable.</span>
          </div>
          <div className="scrollbar-thin overflow-auto rounded-xl border border-border bg-surface" style={{ height: VIEW_H }} onScroll={(e) => setScroll(e.currentTarget.scrollTop)}>
            <table className="border-collapse text-[13px]" style={{ minWidth: '100%' }}>
              <thead className="sticky top-0 z-20 bg-surface-2">
                <tr>
                  <th className="sticky left-0 z-30 w-12 border-b border-r border-border bg-surface-2 px-2 text-right text-[11px] text-muted">#</th>
                  {grid.headers.map((h, ci) => (
                    <th key={ci} className={cn('min-w-[140px] border-b border-r border-border p-0', sel === ci && 'bg-accent/10')}>
                      <div className="flex items-center gap-0.5 px-1">
                        <input value={h} onChange={(e) => editHeader(ci, e.target.value)} onFocus={() => setSel(ci)} className="h-8 min-w-0 flex-1 bg-transparent px-1 font-semibold outline-none focus:text-accent" aria-label={`Header ${ci + 1}`} />
                        <button onClick={() => doSort(ci)} className="rounded p-1 text-muted hover:text-fg" aria-label={`Sort by ${h}`}>{sort?.col === ci && sort.dir === -1 ? <ArrowUp className="size-3.5" /> : <ArrowDown className={cn('size-3.5', sort?.col === ci && 'text-accent')} />}</button>
                        <button onClick={() => delCol(ci)} className="rounded p-1 text-muted hover:text-danger" aria-label={`Delete column ${h}`}><Trash2 className="size-3.5" /></button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {start > 0 && <tr style={{ height: start * ROW_H }}><td colSpan={cols + 1} /></tr>}
                {visibleIdx.slice(start, end).map((ri) => (
                  <tr key={ri} className="group" style={{ height: ROW_H }}>
                    <td className="sticky left-0 z-10 border-b border-r border-border bg-surface px-1 text-right text-[11px] text-muted">
                      <span className="group-hover:hidden">{ri + 1}</span>
                      <button onClick={() => delRow(ri)} className="hidden text-muted hover:text-danger group-hover:inline" aria-label={`Delete row ${ri + 1}`}><Trash2 className="size-3.5" /></button>
                    </td>
                    {grid.headers.map((_, ci) => (
                      <td key={ci} className={cn('border-b border-r border-border/60 p-0', sel === ci && 'bg-accent/5')}>
                        <input value={grid.rows[ri][ci] ?? ''} onChange={(e) => editCell(ri, ci, e.target.value)} onFocus={() => setSel(ci)} className="h-[33px] w-full bg-transparent px-2 font-mono outline-none focus:bg-accent/10" aria-label={`Row ${ri + 1} ${grid.headers[ci]}`} />
                      </td>
                    ))}
                  </tr>
                ))}
                {end < visibleIdx.length && <tr style={{ height: (visibleIdx.length - end) * ROW_H }}><td colSpan={cols + 1} /></tr>}
              </tbody>
            </table>
          </div>
          {stats && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label={`Column: ${grid.headers[sel] ?? ''}`} value={stats.unique.toLocaleString()} sub="unique values" />
              <Stat label="Filled" value={stats.filled.toLocaleString()} sub={`${stats.empty} empty`} />
              <Stat label="Sum" value={stats.numeric ? +stats.sum.toFixed(4) : 'n/a'} sub={stats.numeric ? `${stats.numeric} numbers` : 'no numbers'} />
              <Stat label="Min / Max" value={stats.min != null ? `${+stats.min.toFixed(3)} / ${+stats.max!.toFixed(3)}` : 'n/a'} sub={stats.mean != null ? `mean ${+stats.mean.toFixed(3)}` : ''} />
            </div>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
            <div><Label>Clean up</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" icon={<Copy className="size-4" />} onClick={() => doDedupe(false)}>Dedupe rows</Button>
                <Button size="sm" variant="outline" onClick={() => doDedupe(true)}>Dedupe by column</Button>
                <Button size="sm" variant="outline" icon={<Eraser className="size-4" />} onClick={removeEmptyRows}>Empty rows</Button>
                <Button size="sm" variant="outline" onClick={trimAll}>Trim spaces</Button>
              </div>
            </div>
            <div className="space-y-2"><Label>Find and replace</Label>
              <Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find" aria-label="Find" />
              <Input value={repl} onChange={(e) => setRepl(e.target.value)} placeholder="Replace with" aria-label="Replace with" />
              <div className="flex items-center justify-between"><Switch checked={rx} onChange={setRx} label="Regex" /><Button size="sm" icon={<Replace className="size-4" />} onClick={doReplace} disabled={!find}>Replace all</Button></div>
              <p className="text-[11px] text-muted">Uses the column picked in the filter bar, or all columns.</p>
            </div>
            <div className="space-y-2"><Label>Export</Label>
              <Select value={fmt} onChange={setFmt} options={[{ value: 'csv', label: 'CSV' }, { value: 'tsv', label: 'TSV' }, { value: 'xlsx', label: 'Excel (XLSX)' }, { value: 'json', label: 'JSON' }]} />
              <Button className="w-full" icon={<Download className="size-4" />} onClick={exportAll}>Download table</Button>
              <Button className="w-full" size="sm" variant="outline" icon={<Sigma className="size-4" />} onClick={exportColumn}>Extract selected column</Button>
            </div>
            <div className="space-y-2"><Label>Split into files (ZIP)</Label>
              <div className="flex gap-2"><Input type="number" min={1} value={chunk} onChange={(e) => setChunk(Math.max(1, Number(e.target.value) || 1))} aria-label="Rows per file" /><Button size="sm" variant="outline" icon={<Scissors className="size-4" />} onClick={() => exportSplit(false)}>By rows</Button></div>
              <Button size="sm" variant="outline" className="w-full" onClick={() => exportSplit(true)}>One file per value of “{grid.headers[sel]}”</Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
