import { useEffect, useMemo, useState } from 'react'
import { Input, Label, ToolGrid, Empty } from '@/components/ui'
import { Stat, Stats, RowsTable } from '@/lib/cf/ui'
import { findRecordLists, flatRow, guessService, type RecordList } from '@/lib/r15/exports'
import { useExport, ExportDrop, plainError, readJson, Panel, fmtNum, LocalNote, type Entry } from '@/lib/r15/ui'
import { formatBytes } from '@/lib/files'
import { Bars, DlButton, toCsv } from '@/lib/bcat/kit'

interface Found { entry: Entry; lists: RecordList[]; error?: string }
const at = (v: any, path: string): any => path.replace(/^\$/, '').split(/\.|\[(\d+)\]/).filter(Boolean).reduce((o, k) => (o == null ? o : o[k]), v)
export default function DataExportExplorer() {
  const ex = useExport()
  const [found, setFound] = useState<Found[]>([]), [scan, setScan] = useState(''), [q, setQ] = useState('')
  const [open, setOpen] = useState<{ path: string; list: string; rows: string[][] } | null>(null)
  useEffect(() => { (async () => {
    setFound([]); setOpen(null)
    const out: Found[] = []
    const json = ex.entries.filter((e) => /\.(json|js)$/i.test(e.path) && e.size < 150 * 1024 * 1024)
    for (const [i, e] of json.entries()) {
      setScan(`Looking inside ${i + 1} of ${json.length}: ${e.path}`)
      try { out.push({ entry: e, lists: findRecordLists(await readJson(e)) }) } catch (x: any) { out.push({ entry: e, lists: [], error: plainError(x) }) }
      if (i % 20 === 0) await new Promise((r) => setTimeout(r))
    }
    setScan(''); setFound(out)
  })() }, [ex.entries])
  const service = useMemo(() => guessService(ex.entries.map((e) => e.path)), [ex.entries])
  const folders = useMemo(() => { const m = new Map<string, number>(); for (const e of ex.entries) { const p = e.path.split('/'); const k = p.length > 1 ? p.slice(0, Math.min(2, p.length - 1)).join('/') : '(top level)'; m.set(k, (m.get(k) ?? 0) + e.size) } return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([label, v]) => ({ label, value: Math.round(v / 1024) })) }, [ex.entries])
  const types = useMemo(() => { const m = new Map<string, number>(); for (const e of ex.entries) { const k = (e.path.match(/\.([a-z0-9]{1,6})$/i)?.[1] ?? 'none').toLowerCase(); m.set(k, (m.get(k) ?? 0) + 1) } return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value })) }, [ex.entries])
  const ql = q.toLowerCase()
  const lists = found.flatMap((f) => f.lists.map((l) => ({ f, l }))).filter(({ f, l }) => !ql || f.entry.path.toLowerCase().includes(ql) || l.keys.some((k) => k.toLowerCase().includes(ql))).sort((a, b) => b.l.count - a.l.count)
  const show = async (f: Found, l: RecordList) => {
    const v = at(await readJson(f.entry), l.path)
    const recs: any[] = Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []
    const flat = recs.map((r) => flatRow(r)), cols = [...new Set(flat.slice(0, 500).flatMap((r) => Object.keys(r)))].slice(0, 30)
    setOpen({ path: f.entry.path, list: l.path, rows: [cols, ...flat.map((r) => cols.map((c) => r[c] ?? ''))] })
  }
  const total = ex.entries.reduce((a, e) => a + e.size, 0)
  return (
    <ToolGrid
      main={<>
        <ExportDrop st={ex} accept=".zip,.json,.js,.csv,.html,.txt" label="Drop any data export ZIP, or JSON files from one" sub="Instagram, Facebook, TikTok, Google, Discord, LinkedIn, Snapchat and others. Read in your browser, never uploaded." />
        {scan && <p className="text-sm text-muted" role="status">{scan}</p>}
        {ex.entries.length > 0 && <>
          <Stats cols={4}><Stat label="Looks like" value={<span className="text-base">{service}</span>} /><Stat label="Files" value={fmtNum(ex.entries.length)} sub={formatBytes(total)} /><Stat label="Data files read" value={fmtNum(found.length)} sub="JSON and JS" /><Stat label="Lists of records" value={fmtNum(found.reduce((a, f) => a + f.lists.length, 0))} /></Stats>
          <div className="grid gap-4 md:grid-cols-2"><Panel title="Biggest folders" hint="KB"><Bars items={folders} color="#6EE7B7" /></Panel><Panel title="File types"><Bars items={types} color="#F5A524" /></Panel></div>
          <Panel title="What is inside" hint="every list of records found, largest first. Open one to see it as a table.">
            <Input aria-label="Filter lists" className="mb-2 max-w-sm" placeholder="Filter by file or field name" value={q} onChange={(e) => setQ(e.target.value)} />
            <ul className="max-h-[26rem] divide-y divide-border overflow-auto text-sm scrollbar-thin">{lists.slice(0, 400).map(({ f, l }) => <li key={f.entry.path + l.path} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5"><button type="button" className="min-w-0 flex-1 text-left hover:text-accent" onClick={() => show(f, l)}><span className="font-mono text-xs break-all">{f.entry.path}</span>{l.path !== '$' && <span className="font-mono text-xs text-muted"> {l.path.replace(/^\$\.?/, '')}</span>}<span className="block text-xs text-muted">{l.keys.slice(0, 8).join(', ')}</span></button><span className="font-mono text-xs">{fmtNum(l.count)} records</span>{l.first && <span className="text-xs text-muted">{l.first} to {l.last}</span>}</li>)}</ul>
            {!lists.length && !scan && <p className="text-sm text-muted">No lists of records were found in the JSON files.</p>}
          </Panel>
          {open && <Panel title={open.path} hint={`${open.list.replace(/^\$\.?/, '') || 'whole file'}, ${fmtNum(open.rows.length - 1)} rows`}><RowsTable rows={open.rows} /><div className="mt-2"><DlButton name={`${open.path.split('/').pop()?.replace(/\.[^.]+$/, '')}.csv`} mime="text/csv" data={() => toCsv(open.rows)}>Download as CSV</DlButton></div></Panel>}
        </>}
        {!ex.entries.length && <Empty>See what a company keeps about you: every file, every list of records and its date range.</Empty>}
      </>}
      side={<>
        <Label>File list</Label>
        <DlButton className="w-full" disabled={!ex.entries.length} name="export-files.csv" mime="text/csv" data={() => toCsv([['path', 'bytes', 'records'], ...ex.entries.map((e) => [e.path, e.size, found.find((f) => f.entry === e)?.lists.reduce((a, l) => a + l.count, 0) ?? ''])])}>All files CSV</DlButton>
        <p className="text-xs text-muted">Most services let you ask for a copy of your data under Settings, Privacy or Your information. When they send JSON, this tool finds every list in it, such as messages, logins, ad interests or searches, and turns each into a table.</p>
        <p className="text-xs text-muted">For a closer look at one service, use the Spotify, Instagram, WhatsApp, YouTube, Netflix, X or AI chat tools in this category.</p>
        <LocalNote />
      </>}
    />
  )
}
