/* Shared UI for the categories-fill tools (privacy, maps, office, science, creator, study, web, time). */
import { useEffect, useMemo, useState } from 'react'
import { Download, RotateCcw } from 'lucide-react'
import { Button, CopyButton, Dropzone, Input, Label, Select, cn } from '@/components/ui'
import { downloadBlob, formatBytes } from '@/lib/files'
import { readBook, SHEET_ACCEPT, type Book } from '@/lib/bcat/sheets'
import type { Rows } from './sheet'

export { SHEET_ACCEPT }

/** Text output with copy and download. */
export function OutBox({ title, text, filename, mime = 'text/plain', rows = 12, className, extra }: { title?: React.ReactNode; text: string; filename?: string; mime?: string; rows?: number; className?: string; extra?: React.ReactNode }) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {title && <div className="mr-auto text-sm font-semibold">{title}</div>}
        {extra}
        <CopyButton text={text} />
        {filename && <Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([text], { type: mime + ';charset=utf-8' }), filename)}>Download</Button>}
      </div>
      <pre className="max-h-[28rem] overflow-auto rounded-xl border border-border bg-surface-2/60 p-3 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap break-all scrollbar-thin" style={{ minHeight: `${Math.min(rows, 6) * 1.25}rem` }} tabIndex={0}>{text || ' '}</pre>
    </div>
  )
}

/** A number box that allows being empty (null). */
export function NumBox({ label, value, onChange, unit, placeholder, className }: { label: React.ReactNode; value: number | null; onChange: (v: number | null) => void; unit?: string; placeholder?: string; className?: string }) {
  const [raw, setRaw] = useState(value == null ? '' : String(value))
  const parse = (s: string) => { const t = s.trim().replace(/,/g, '').replace(/\s*[×x*]\s*10\^?/i, 'e'); return t === '' || !isFinite(Number(t)) ? null : Number(t) }
  useEffect(() => { if (parse(raw) !== value) setRaw(value == null ? '' : String(value)) }, [value])
  return (
    <label className={cn('block', className)}>
      <Label hint={unit}>{label}</Label>
      <Input inputMode="decimal" type="text" value={raw} placeholder={placeholder} onChange={(e) => { setRaw(e.target.value); onChange(parse(e.target.value)) }} />
    </label>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/50 px-3 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={cn('mt-0.5 font-display text-xl font-bold tabular-nums', tone === 'good' && 'text-success', tone === 'warn' && 'text-warn', tone === 'bad' && 'text-danger')}>{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  )
}
export function Stats({ children, cols = 3 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  return <div className={cn('grid gap-2', cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4')}>{children}</div>
}

/** Table preview of rows, header row styled, capped for speed. */
export function RowsTable({ rows, header = true, max = 200, highlight, className }: { rows: Rows; header?: boolean; max?: number; highlight?: (r: number) => boolean; className?: string }) {
  if (!rows.length) return <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">No rows</div>
  const w = Math.min(40, Math.max(...rows.slice(0, max).map((r) => r.length)))
  const body = header ? rows.slice(1, max + 1) : rows.slice(0, max)
  return (
    <div className={cn('max-h-[26rem] overflow-auto rounded-xl border border-border scrollbar-thin', className)}>
      <table className="w-full border-collapse text-left text-xs">
        {header && <thead className="sticky top-0 bg-surface-2"><tr>{Array.from({ length: w }, (_, c) => <th key={c} className="border-b border-border px-2 py-1.5 font-semibold whitespace-nowrap">{String(rows[0][c] ?? '')}</th>)}</tr></thead>}
        <tbody>{body.map((r, i) => <tr key={i} className={cn('odd:bg-surface-2/30', highlight?.(i) && 'bg-accent/10')}>{Array.from({ length: w }, (_, c) => <td key={c} className="max-w-[16rem] truncate border-b border-border/60 px-2 py-1 font-mono" title={String(r[c] ?? '')}>{String(r[c] ?? '')}</td>)}</tr>)}</tbody>
      </table>
      {(header ? rows.length - 1 : rows.length) > max && <div className="bg-surface-2/50 px-2 py-1 text-[11px] text-muted">Showing {max} of {(header ? rows.length - 1 : rows.length).toLocaleString()} rows</div>}
    </div>
  )
}

/** Load a workbook or CSV and pick a sheet. */
export function useSheet() {
  const [file, setFile] = useState<File | null>(null)
  const [book, setBook] = useState<Book | null>(null)
  const [sheet, setSheet] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const open = async (f: File) => {
    setFile(f); setError(null); setBusy(true); setSheet(0)
    try { const b = await readBook(f); if (!b.sheets.length) throw new Error('This file has no sheets.'); setBook(b) }
    catch (e: any) { setBook(null); setError(e?.message ? `Could not read this file: ${e.message}` : 'Could not read this file.') }
    finally { setBusy(false) }
  }
  const reset = () => { setFile(null); setBook(null); setError(null) }
  const rows = (book?.sheets[sheet]?.rows ?? []) as Rows
  return { file, book, sheet, setSheet, rows, error, busy, open, reset }
}
export type SheetState = ReturnType<typeof useSheet>

export function SheetPicker({ s }: { s: SheetState }) {
  if (!s.book || s.book.sheets.length < 2) return null
  return <div><Label>Sheet</Label><Select aria-label="Sheet" value={String(s.sheet)} onChange={(v) => s.setSheet(+v)} options={s.book.sheets.map((x, i) => ({ value: String(i), label: `${x.name} (${Math.max(0, x.rows.length - 1)} rows)` }))} /></div>
}

export function SheetDrop({ s, label, sub }: { s: SheetState; label: string; sub?: string }) {
  return <Dropzone accept={SHEET_ACCEPT} onFiles={(f) => s.open(f[0])} label={label} sub={sub ?? 'XLSX, XLS, ODS, CSV, TSV or Numbers. Nothing is uploaded.'} />
}

export function FileBar({ name, size, onReset, extra }: { name: string; size?: number; onReset: () => void; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-2/50 px-3 py-2">
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{name}</div>{size != null && <div className="text-xs text-muted">{formatBytes(size)}</div>}</div>
      {extra}
      <Button variant="ghost" size="sm" icon={<RotateCcw className="size-4" />} onClick={onReset}>Start over</Button>
    </div>
  )
}

/** Column choice options from a header row. */
export function useColOptions(rows: Rows, header: boolean) {
  return useMemo(() => {
    const w = Math.max(0, ...rows.slice(0, 50).map((r) => r.length))
    return Array.from({ length: w }, (_, i) => ({ value: String(i), label: header ? String(rows[0]?.[i] ?? '').trim() || `Column ${i + 1}` : `Column ${i + 1}` }))
  }, [rows, header])
}

/** Small A4/Letter PDF helper on jsPDF for printable sheets. */
export async function newPdf(o: { landscape?: boolean; size?: 'a4' | 'letter' } = {}) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: o.size ?? 'a4', orientation: o.landscape ? 'landscape' : 'portrait' })
  return { doc, W: doc.internal.pageSize.getWidth(), H: doc.internal.pageSize.getHeight() }
}
export const PAPER = [{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'US Letter' }] as const

export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** Render a citation string where *text* marks italics, without any HTML injection. */
export function CiteText({ text }: { text: string }) {
  const parts = text.split(/\*([^*]+)\*/g)
  return <>{parts.map((p, i) => (i % 2 ? <i key={i}>{p}</i> : <span key={i}>{p}</span>))}</>
}
