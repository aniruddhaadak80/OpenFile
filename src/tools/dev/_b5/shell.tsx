/* Batch 5 shared UI shell: two-pane transform layout, status line, key/value rows. */
import React from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { Button, CopyButton, cn } from '@/components/ui'
import { CodeArea, CodeView, Pane, OpenFileButton, DownloadButton, useTextDrop, type HlLang } from '../_dev/kit'

export { useLib, useStored, useDebounced, Stat, Pane, CodeArea, CodeView, OpenFileButton, DownloadButton, Chip, randInt, downloadText, esc } from '../_dev/kit'

export function Bar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3', className)}>{children}</div>
}

export function Status({ kind, children }: { kind: 'ok' | 'err' | 'info'; children: React.ReactNode }) {
  const cls = kind === 'ok' ? 'border-success/30 bg-success/5 text-success' : kind === 'err' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-border bg-surface text-muted'
  const Icon = kind === 'ok' ? CheckCircle2 : kind === 'err' ? AlertTriangle : Info
  return (
    <motion.div layout role={kind === 'err' ? 'alert' : 'status'} className={cn('flex items-start gap-2 rounded-xl border px-4 py-2.5 text-sm', cls)}>
      <Icon className="mt-0.5 size-4 shrink-0" /><div className="min-w-0 break-words">{children}</div>
    </motion.div>
  )
}

/** Input pane on the left, read-only output pane on the right. */
export function TwoPane({ inputTitle = 'Input', input, setInput, placeholder, accept, output, outputLang = 'generic', outputTitle = 'Output', outName, outMime, height = 'h-[460px]', inputActions, outputActions, outputNode, wrapOutput }: {
  inputTitle?: React.ReactNode; input: string; setInput: (v: string) => void; placeholder?: string; accept?: string
  output: string; outputLang?: HlLang; outputTitle?: React.ReactNode; outName?: string; outMime?: string; height?: string
  inputActions?: React.ReactNode; outputActions?: React.ReactNode; outputNode?: React.ReactNode; wrapOutput?: boolean
}) {
  const drop = useTextDrop((t) => setInput(t))
  return (
    <div className="grid gap-4 lg:grid-cols-2" {...drop.props}>
      <Pane title={inputTitle} className={cn(height, drop.over && 'ring-2 ring-accent')} actions={<>{inputActions}{accept !== undefined && <OpenFileButton accept={accept} onText={(t) => setInput(t)} />}<Button size="sm" variant="ghost" onClick={() => setInput('')}>Clear</Button></>}>
        <CodeArea value={input} onChange={setInput} placeholder={placeholder} />
      </Pane>
      <Pane title={outputTitle} className={height} actions={output ? <>{outputActions}<CopyButton text={output} variant="ghost" />{outName && <DownloadButton text={output} filename={outName} mime={outMime} />}</> : outputActions}>
        {outputNode ?? (output
          ? (wrapOutput ? <pre className="scrollbar-thin h-full overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[13px] leading-5">{output}</pre> : <CodeView code={output} lang={outputLang} className="h-full" />)
          : <div className="grid h-full place-items-center p-6 text-sm text-muted">Output appears here</div>)}
      </Pane>
    </div>
  )
}

/** A labelled value with a copy button. */
export function KV({ label, value, mono = true, copy = true }: { label: React.ReactNode; value: React.ReactNode; mono?: boolean; copy?: boolean }) {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface-2/50 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
        <div className={cn('break-all text-[13px]', mono && 'font-mono')}>{value === '' || value == null ? <span className="text-muted">n/a</span> : value}</div>
      </div>
      {copy && text && <CopyButton text={text} label="" variant="ghost" />}
    </div>
  )
}

/** Simple data table with sticky header. */
export function DataTable({ columns, rows, max = 500, className }: { columns: string[]; rows: unknown[][]; max?: number; className?: string }) {
  const show = rows.slice(0, max)
  return (
    <div className={cn('scrollbar-thin overflow-auto rounded-xl border border-border', className)}>
      <table className="w-full border-collapse text-left text-[13px]">
        <thead className="sticky top-0 z-10 bg-surface-2">
          <tr>{columns.map((c, i) => <th key={i} className="whitespace-nowrap border-b border-border px-3 py-2 font-semibold">{c}</th>)}</tr>
        </thead>
        <tbody>
          {show.map((r, i) => (
            <tr key={i} className="odd:bg-surface even:bg-surface-2/30 hover:bg-accent/5">
              {columns.map((_, j) => <td key={j} className="max-w-[320px] truncate border-b border-border/60 px-3 py-1.5 font-mono" title={cellText(r[j])}>{cellText(r[j])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > max && <div className="border-t border-border bg-surface-2/40 px-3 py-2 text-xs text-muted">Showing {max.toLocaleString()} of {rows.length.toLocaleString()} rows. Export to get everything.</div>}
    </div>
  )
}

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'bigint') return v.toString()
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString()
  if (v instanceof Uint8Array) return `<${v.length} bytes>`
  if (typeof v === 'object') { try { return JSON.stringify(v, (_k, x) => typeof x === 'bigint' ? x.toString() : x) } catch { return String(v) } }
  return String(v)
}

/** Read a file the user picked into bytes. */
export async function fileBytes(f: Blob) { return new Uint8Array(await f.arrayBuffer()) }
