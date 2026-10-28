import { useMemo, useState } from 'react'
import { Dropzone, Label, Select, Switch, ToolGrid, ErrorNote, Empty, FileChip, cn } from '@/components/ui'
import { readBook, SHEET_ACCEPT, type Book } from '@/lib/bcat/sheets'
import { diffSheets, colName } from '@/lib/bcat/office'
import { DlButton, toCsv } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

function Side({ label, book, onFile, sheet, setSheet, file }: { label: string; book: Book | null; file: File | null; onFile: (f: File) => void; sheet: string; setSheet: (s: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {!file ? <Dropzone compact accept={SHEET_ACCEPT} onFiles={(f) => onFile(f[0])} label={`Drop the ${label.toLowerCase()}`} /> : <FileChip file={file} onRemove={() => onFile(null as any)} />}
      {book && book.sheets.length > 1 && <Select value={sheet} onChange={setSheet} options={book.sheets.map((s, i) => ({ value: String(i), label: s.name }))} />}
    </div>
  )
}

export default function SpreadsheetCompare() {
  const [fa, setFa] = useState<File | null>(null), [fb, setFb] = useState<File | null>(null)
  const [a, setA] = useState<Book | null>(null), [b, setB] = useState<Book | null>(null)
  const [sa, setSa] = useState('0'), [sb, setSb] = useState('0')
  const [key, setKey] = useState('-1')
  const [only, setOnly] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const load = (set: (b: Book | null) => void, setF: (f: File | null) => void) => async (f: File | null) => { setF(f); set(null); setErr(null); if (f) try { set(await readBook(f)) } catch (e: any) { setErr(e?.message) } }

  const A = a?.sheets[+sa]?.rows ?? [], B = b?.sheets[+sb]?.rows ?? []
  const d = useMemo(() => (a && b ? diffSheets(A, B, +key) : null), [a, b, sa, sb, key])
  const changedAt = useMemo(() => new Map((d?.changed ?? []).map((c) => [`${c.row}:${c.col}`, c])), [d])
  const rowsWithChanges = useMemo(() => new Set((d?.changed ?? []).map((c) => c.row)), [d])
  const head = (B[0] ?? A[0] ?? []) as unknown[]
  const width = Math.max(...[A, B].flatMap((g) => g.slice(0, 1000).map((r) => r.length)), 0)
  const viewRows = B.map((r, i) => ({ r, i })).filter(({ i }) => i === 0 || !only || rowsWithChanges.has(i) || d?.addedRows.includes(i)).slice(0, 500)

  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Side label="Old file" file={fa} book={a} onFile={load(setA, setFa)} sheet={sa} setSheet={setSa} />
            <Side label="New file" file={fb} book={b} onFile={load(setB, setFb)} sheet={sb} setSheet={setSb} />
          </div>
          <ErrorNote error={err} />
          {d && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Changed cells" value={d.changed.length} /><Stat label="Changed rows" value={rowsWithChanges.size} /><Stat label="Added rows" value={d.addedRows.length} /><Stat label="Removed rows" value={d.removedRows.length} /></div>
              {!d.changed.length && !d.addedRows.length && !d.removedRows.length ? <Empty>The two sheets have the same values.</Empty> : (
                <div className="max-h-[520px] overflow-auto rounded-2xl border border-border">
                  <table className="text-xs">
                    <thead className="sticky top-0 bg-surface-2"><tr><th className="px-2 py-1 text-muted">#</th>{Array.from({ length: width }, (_, c) => <th key={c} className="px-2 py-1 text-left font-medium">{String(head[c] ?? colName(c))}</th>)}</tr></thead>
                    <tbody>{viewRows.slice(1).map(({ r, i }) => (
                      <tr key={i} className={cn('border-t border-border', d.addedRows.includes(i) && 'bg-success/10')}>
                        <td className="px-2 py-1 font-mono text-muted">{i + 1}</td>
                        {Array.from({ length: width }, (_, c) => { const ch = changedAt.get(`${i}:${c}`); return <td key={c} className={cn('max-w-56 px-2 py-1 align-top', ch && 'bg-accent/15')} title={ch ? `Was: ${ch.a}` : undefined}>{ch ? <><span className="block text-muted line-through">{ch.a || '(empty)'}</span><span className="font-medium">{ch.b || '(empty)'}</span></> : String(r[c] ?? '')}</td> })}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              {d.removedRows.length > 0 && <p className="text-xs text-muted">Rows only in the old file: {d.removedRows.slice(0, 50).map((r) => (d.keyed ? String(A[r][+key] ?? r + 1) : r + 1)).join(', ')}{d.removedRows.length > 50 ? '...' : ''}</p>}
            </>
          )}
        </div>
      }
      side={
        <>
          <div><Label>Match rows by</Label><Select value={key} onChange={setKey} options={[{ value: '-1', label: 'Row position' }, ...head.map((h, i) => ({ value: String(i), label: `Key column: ${String(h ?? colName(i))}` }))]} /></div>
          <p className="text-xs text-muted">Pick a key column (like an ID or email) when rows may have moved, been sorted or inserted.</p>
          <Switch checked={only} onChange={setOnly} label="Show changed rows only" />
          {d && <DlButton className="w-full" name="sheet-differences.csv" mime="text/csv" data={() => toCsv([['change', 'row', 'column', 'old value', 'new value'], ...d.changed.map((c) => ['changed', c.row + 1, String(head[c.col] ?? colName(c.col)), c.a, c.b]), ...d.addedRows.map((r) => ['added row', r + 1, '', '', B[r].join(' | ')]), ...d.removedRows.map((r) => ['removed row', r + 1, '', A[r].join(' | '), ''])])}>Download report (CSV)</DlButton>}
        </>
      }
    />
  )
}
