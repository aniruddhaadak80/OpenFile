import { useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { Button, Dropzone, Select, Input, Badge, Switch, Progress } from '@/components/ui'
import { downloadBlob, baseName } from '@/lib/files'
import { Bar, Status, DataTable, Stat } from './_b5/shell'
import { parsePo, writePo, writeMo, parseMo, toRows, fromRows, toJsonMap, stats, type Catalog } from '@/lib/b5/gettext'

type Out = 'po' | 'mo' | 'csv' | 'xlsx' | 'json'
const OUTS: { value: Out; label: string }[] = [{ value: 'mo', label: 'MO (compiled)' }, { value: 'po', label: 'PO (text)' }, { value: 'csv', label: 'CSV' }, { value: 'xlsx', label: 'Excel (XLSX)' }, { value: 'json', label: 'JSON (key to text)' }]

async function read(f: File): Promise<{ cat: Catalog; kind: string }> {
  const n = f.name.toLowerCase()
  if (n.endsWith('.mo')) return { cat: parseMo(new Uint8Array(await f.arrayBuffer())), kind: 'MO' }
  if (n.endsWith('.csv') || n.endsWith('.tsv')) { const Papa = (await import('papaparse')).default; const r = Papa.parse<string[]>(await f.text(), { skipEmptyLines: true }); return { cat: fromRows(r.data), kind: 'CSV' } }
  if (/\.xlsx?$|\.ods$/.test(n)) { const XLSX = await import('xlsx'); const wb = XLSX.read(await f.arrayBuffer()); return { cat: fromRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false }) as string[][]), kind: 'Spreadsheet' } }
  if (n.endsWith('.json')) { const o = JSON.parse(await f.text()) as Record<string, string | string[]>; return { cat: { headers: { 'Content-Type': 'text/plain; charset=UTF-8' }, entries: Object.entries(o).map(([k, v]) => ({ id: k, str: Array.isArray(v) ? v : [String(v)] })) }, kind: 'JSON' } }
  return { cat: parsePo(await f.text()), kind: n.endsWith('.pot') ? 'POT' : 'PO' }
}

export default function GettextConverter() {
  const [file, setFile] = useState<File | null>(null)
  const [data, setData] = useState<{ cat: Catalog; kind: string } | null>(null)
  const [out, setOut] = useState<Out>('mo')
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [onlyEmpty, setOnlyEmpty] = useState(false)

  const open = async (fs: File[]) => { setErr(null); setFile(fs[0]); try { const d = await read(fs[0]); setData(d); setOut(d.kind === 'MO' ? 'po' : d.kind === 'CSV' || d.kind === 'Spreadsheet' || d.kind === 'JSON' ? 'po' : 'mo') } catch (e: any) { setErr(e.message); setData(null) } }
  const st = useMemo(() => (data ? stats(data.cat) : null), [data])
  const shown = useMemo(() => !data ? [] : data.cat.entries.filter((e) => (!onlyEmpty || !e.str.every((s) => s)) && (!q || (e.id + ' ' + e.str.join(' ') + ' ' + (e.ctx ?? '')).toLowerCase().includes(q.toLowerCase()))), [data, q, onlyEmpty])

  const save = async () => {
    if (!data || !file) return
    const name = baseName(file.name)
    if (out === 'po') return downloadBlob(new Blob([writePo(data.cat)], { type: 'text/x-gettext-translation' }), `${name}.po`)
    if (out === 'mo') return downloadBlob(new Blob([writeMo(data.cat) as BlobPart], { type: 'application/x-gettext-translation' }), `${name}.mo`)
    if (out === 'json') return downloadBlob(new Blob([JSON.stringify(toJsonMap(data.cat), null, 2)], { type: 'application/json' }), `${name}.json`)
    const rows = toRows(data.cat)
    if (out === 'csv') { const Papa = (await import('papaparse')).default; return downloadBlob(new Blob(['\uFEFF' + Papa.unparse(rows)], { type: 'text/csv' }), `${name}.csv`) }
    const XLSX = await import('xlsx'); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'translations')
    downloadBlob(new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })]), `${name}.xlsx`)
  }

  if (!data) return (
    <div className="space-y-3">
      <Dropzone onFiles={open} accept=".po,.pot,.mo,.csv,.tsv,.xlsx,.xls,.ods,.json" label="Drop a .po, .pot, .mo, CSV, Excel or JSON file" sub="Compile PO to MO, decompile MO back to PO, or move translations to a spreadsheet for translators." />
      {err && <Status kind="err">{err}</Status>}
    </div>
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <Bar><span className="truncate font-medium">{file?.name}</span><Badge>{data.kind}</Badge>{data.cat.headers.Language && <Badge color="#14B8A6">{data.cat.headers.Language}</Badge>}<Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setData(null); setFile(null) }}>Open another</Button></Bar>
        {st && <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Strings" value={st.total} /><Stat label="Translated" value={st.done} /><Stat label="Missing" value={st.empty} /><Stat label="Fuzzy" value={st.fuzzy} /></div>
          <Progress value={st.total ? st.done / st.total : 0} label="Translated" />
        </>}
        <div className="flex flex-wrap items-center gap-3"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search strings" className="w-64 pl-8" aria-label="Search strings" /></div><Switch checked={onlyEmpty} onChange={setOnlyEmpty} label="Only missing" /></div>
        <DataTable columns={['Context', 'Source', 'Translation', 'Flags']} rows={shown.map((e) => [e.ctx ?? '', e.plural ? `${e.id} / ${e.plural}` : e.id, e.str.join(' | '), (e.flags ?? []).join(', ')])} max={800} className="max-h-[520px]" />
      </div>
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          <div><div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Convert to</div><Select value={out} onChange={setOut} options={OUTS} /></div>
          <Button className="w-full" size="lg" icon={<Download className="size-4" />} onClick={() => save().catch((e) => setErr(e.message))}>Download</Button>
          {err && <Status kind="err">{err}</Status>}
          <div className="space-y-1 text-xs text-muted">
            {out === 'mo' && <p>Like msgfmt, empty translations are left out of the MO file. Fuzzy entries are kept.</p>}
            {(out === 'csv' || out === 'xlsx') && <p>Columns: context, msgid, msgid_plural, msgstr, msgstr[1]... Edit the msgstr columns and drop the file back here to make a PO or MO.</p>}
            <p>Headers such as Language and Plural-Forms are kept when converting between PO and MO.</p>
          </div>
        </div>
      </aside>
    </div>
  )
}
