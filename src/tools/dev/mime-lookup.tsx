import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Input, Segmented, Badge, CopyButton, Dropzone } from '@/components/ui'
import { Status, DataTable } from './_b5/shell'

type MimeLib = { getType: (p: string) => string | null; getExtension: (t: string) => string | null; getAllExtensions: (t: string) => Set<string> | null }
type Row = [string, string]

export default function MimeLookup() {
  const [mime, setMime] = useState<MimeLib | null>(null)
  const [table, setTable] = useState<Row[]>([])
  const [mode, setMode] = useState<'ext' | 'type' | 'browse'>('ext')
  const [q, setQ] = useState('')
  const [files, setFiles] = useState<{ name: string; browser: string; lib: string | null }[]>([])
  useEffect(() => {
    Promise.all([import('mime'), import('mime/types/standard.js'), import('mime/types/other.js')]).then(([m, std, other]) => {
      setMime(m.default as unknown as MimeLib)
      const rows: Row[] = []
      for (const src of [std.default, other.default] as Record<string, string[]>[]) for (const [t, exts] of Object.entries(src)) for (const e of exts) rows.push([e.replace(/^\*/, ''), t])
      setTable(rows.sort((a, b) => a[0].localeCompare(b[0])))
    })
  }, [])
  const ql = q.trim().toLowerCase().replace(/^\./, '')
  const byExt = mime && ql && mode === 'ext' ? mime.getType(ql) : null
  const byType = mime && ql && mode === 'type' ? [...(mime.getAllExtensions(ql) ?? [])] : []
  const browse = useMemo(() => (ql ? table.filter(([e, t]) => e.includes(ql) || t.includes(ql)) : table), [table, ql])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'ext', label: 'Extension → MIME' }, { value: 'type', label: 'MIME → extensions' }, { value: 'browse', label: 'Browse all' }]} />
        <div className="relative w-full sm:w-80"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={mode === 'type' ? 'image/webp' : mode === 'ext' ? 'webp or photo.webp' : 'Filter'} className="h-10 pl-9 font-mono" aria-label="Lookup" /></div>
      </div>
      {!mime ? <Status kind="info">Loading the MIME database…</Status> : mode === 'ext' && ql ? (byExt ? <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-5"><Badge>.{ql.split('.').pop()}</Badge><span className="font-mono text-2xl font-semibold text-accent">{byExt}</span><CopyButton text={byExt} /></div> : <Status kind="err">No MIME type is registered for “{ql}”. Unknown files are usually sent as application/octet-stream.</Status>)
        : mode === 'type' && ql ? (byType.length ? <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-5">{byType.map((e) => <span key={e} className="rounded-lg bg-accent/15 px-3 py-1.5 font-mono text-lg text-accent">.{e}</span>)}<span className="ml-auto"><CopyButton text={byType.map((e) => '.' + e).join(', ')} /></span></div> : <Status kind="err">No extensions found for “{ql}”.</Status>)
          : mode === 'browse' ? <DataTable columns={['Extension', 'MIME type']} rows={browse.map(([e, t]) => ['.' + e, t])} max={800} className="max-h-[560px]" /> : null}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Check your files</div>
        <Dropzone compact multiple onFiles={(fs) => setFiles(fs.map((f) => ({ name: f.name, browser: f.type || '(none)', lib: mime?.getType(f.name) ?? null })))} label="Drop files to see the MIME type for each" sub="Compares what your browser reports with the standard type for the extension." />
        {files.length > 0 && <DataTable columns={['File', 'Browser says', 'Standard type']} rows={files.map((f) => [f.name, f.browser, f.lib ?? 'unknown'])} />}
      </div>
    </div>
  )
}
