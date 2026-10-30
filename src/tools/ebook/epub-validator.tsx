import { useState } from 'react'
import { BookCheck, AlertTriangle, XCircle, Info } from 'lucide-react'
import { Dropzone, ToolGrid, ErrorNote, Spinner, Segmented, cn } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { checkEpub, type EpubReport, type Level } from '@/lib/b14/epubcheck'
import { Tile } from '@/lib/b14/ui'
import { toCsv, DlButton } from '@/lib/bcat/kit'

const ICON = { error: XCircle, warning: AlertTriangle, info: Info }
const TONE = { error: 'text-danger', warning: 'text-warn', info: 'text-muted' }

export default function EpubValidator() {
  const [file, setFile] = useState<File | null>(null)
  const [rep, setRep] = useState<EpubReport | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState<'all' | Level>('all')
  const open = async (f: File) => { setFile(f); setErr(null); setRep(null); setBusy(true); try { setRep(await checkEpub(new Uint8Array(await f.arrayBuffer()))) } catch (e: any) { setErr(e?.message || 'Could not check this file.') } finally { setBusy(false) } }
  if (!file) return <Dropzone accept=".epub,application/epub+zip" onFiles={(f) => open(f[0])} label="Drop an EPUB to check" sub="Finds the problems that make stores reject a book or readers show it wrong: mimetype, container, metadata, manifest, spine, navigation, broken XHTML and links." />
  const n = (l: Level) => rep?.findings.filter((x) => x.level === l).length ?? 0
  const list = rep?.findings.filter((x) => show === 'all' || x.level === show) ?? []
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); setRep(null) }} />
        {busy && <Spinner label="Checking the book" />}
        <ErrorNote error={err} />
        {rep && <>
          <div className={cn('rounded-2xl border p-4', n('error') ? 'border-danger/30 bg-danger/5' : n('warning') ? 'border-warn/40 bg-warn/5' : 'border-success/30 bg-success/5')}>
            <div className="font-display text-lg font-semibold">{n('error') ? `${n('error')} error${n('error') === 1 ? '' : 's'} to fix` : n('warning') ? 'No errors, a few warnings' : 'Looks good'}</div>
            <div className="text-sm text-muted">{rep.title || 'Untitled'} | EPUB {rep.version} | {rep.chapters} XHTML files | {rep.images} images | {formatBytes(rep.bytes)}</div>
          </div>
          <Segmented value={show} onChange={setShow} options={[{ value: 'all', label: `All (${rep.findings.length})` }, { value: 'error', label: `Errors (${n('error')})` }, { value: 'warning', label: `Warnings (${n('warning')})` }, { value: 'info', label: `Notes (${n('info')})` }]} />
          <div className="space-y-1.5">{list.map((x, i) => { const I = ICON[x.level]; return <div key={i} className="flex gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm"><I className={cn('mt-0.5 size-4 shrink-0', TONE[x.level])} /><div className="min-w-0"><div>{x.message}</div><div className="truncate font-mono text-[11px] text-muted">{x.where}</div></div></div> })}</div>
        </>}
      </>}
      side={<>
        {rep && <div className="grid grid-cols-3 gap-2"><Tile label="Errors" value={n('error')} /><Tile label="Warnings" value={n('warning')} /><Tile label="Notes" value={n('info')} /></div>}
        {rep && <DlButton name={file.name.replace(/\.epub$/i, '') + '-check.csv'} mime="text/csv" data={() => toCsv([['level', 'file', 'message'], ...rep.findings.map((x) => [x.level, x.where, x.message])])}>Download report (CSV)</DlButton>}
        <p className="flex gap-1.5 text-xs text-muted"><BookCheck className="size-4 shrink-0" />A quick structural check that runs in your browser. Stores may run the full EPUBCheck, which tests even more rules.</p>
        <p className="text-xs text-muted">Fix metadata and covers with the EPUB Editor.</p>
      </>}
    />
  )
}
