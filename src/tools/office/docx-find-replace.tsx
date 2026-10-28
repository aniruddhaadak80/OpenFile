import { useState } from 'react'
import { Plus, Trash2, Replace } from 'lucide-react'
import { Button, Dropzone, Input, Label, Switch, ToolGrid, ErrorNote, ResultCard } from '@/components/ui'
import { zipFiles } from '@/lib/files'
import { docxReplace } from '@/lib/bcat/office'

interface Pair { find: string; replace: string }
interface Done { name: string; blob: Blob; counts: number[] }
const PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/

export default function DocxFindReplace() {
  const [files, setFiles] = useState<File[]>([])
  const [pairs, setPairs] = useState<Pair[]>([{ find: '', replace: '' }])
  const [cs, setCs] = useState(false)
  const [whole, setWhole] = useState(false)
  const [regex, setRegex] = useState(false)
  const [done, setDone] = useState<Done[] | null>(null)
  const [zip, setZip] = useState<Blob | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const go = async () => {
    setErr(null); setBusy(true)
    try {
      const active = pairs.filter((p) => p.find)
      if (!active.length) throw new Error('Type at least one word to find.')
      if (regex) active.forEach((p) => { try { new RegExp(p.find) } catch { throw new Error(`Not a valid pattern: ${p.find}`) } })
      const JSZip = (await import('jszip')).default
      const out: Done[] = []
      for (const f of files) {
        const z = await JSZip.loadAsync(await f.arrayBuffer())
        const counts = active.map(() => 0)
        for (const path of Object.keys(z.files).filter((p) => PARTS.test(p))) {
          let xml = await z.file(path)!.async('string')
          active.forEach((p, i) => { const r = docxReplace(xml, regex ? new RegExp(p.find) : p.find, p.replace, { caseSensitive: cs, wholeWord: whole }); xml = r.xml; counts[i] += r.count })
          z.file(path, xml)
        }
        out.push({ name: f.name, counts, blob: await z.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) })
      }
      setDone(out)
      setZip(out.length > 1 ? await zipFiles(out.map((d) => ({ name: d.name, data: d.blob }))) : null)
    } catch (e: any) { setErr(e?.message || String(e)) } finally { setBusy(false) }
  }

  if (!files.length) return <Dropzone multiple accept=".docx" onFiles={setFiles} label="Drop one or more Word files (DOCX)" sub="Find and replace words in the body, headers, footers, footnotes and comments, keeping the formatting." />
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <Label>Replace</Label>
          {pairs.map((p, i) => (
            <div key={i} className="flex gap-2">
              <Input value={p.find} onChange={(e) => setPairs((x) => x.map((q, j) => (j === i ? { ...q, find: e.target.value } : q)))} placeholder={regex ? 'Pattern, like \\d{4}' : 'Find'} aria-label={`Find ${i + 1}`} />
              <Input value={p.replace} onChange={(e) => setPairs((x) => x.map((q, j) => (j === i ? { ...q, replace: e.target.value } : q)))} placeholder="Replace with" aria-label={`Replace ${i + 1}`} />
              <Button variant="ghost" aria-label="Remove pair" disabled={pairs.length === 1} onClick={() => setPairs((x) => x.filter((_, j) => j !== i))} icon={<Trash2 className="size-4" />} />
            </div>
          ))}
          <Button variant="outline" size="sm" icon={<Plus className="size-4" />} onClick={() => setPairs((x) => [...x, { find: '', replace: '' }])}>Add another</Button>
          {done && (
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {done.map((d, i) => <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate">{d.name}</span><span className="text-xs text-muted">{d.counts.reduce((a, b) => a + b, 0)} replaced</span><Button size="sm" variant="outline" onClick={async () => (await import('@/lib/files')).downloadBlob(d.blob, d.name)}>Download</Button></div>)}
            </div>
          )}
          {zip && <ResultCard blob={zip} filename="replaced-documents.zip" title={`${done!.length} documents ready`} />}
        </div>
      }
      side={
        <>
          <p className="text-sm">{files.length} document{files.length > 1 ? 's' : ''}</p>
          <Switch checked={cs} onChange={setCs} label="Match case" />
          <Switch checked={whole} onChange={setWhole} label="Whole words only" />
          <Switch checked={regex} onChange={setRegex} label="Use patterns (regular expressions)" />
          {regex && <p className="text-xs text-muted">Use $1, $2 in the replacement to reuse groups.</p>}
          <ErrorNote error={err} />
          <Button className="w-full" icon={<Replace className="size-4" />} loading={busy} onClick={go}>Replace in {files.length} file{files.length > 1 ? 's' : ''}</Button>
          <Button variant="ghost" className="w-full" onClick={() => { setFiles([]); setDone(null); setZip(null) }}>Start over</Button>
          <p className="text-xs text-muted">Word often splits a word across several pieces of formatting. This tool joins them before searching, so matches are not missed. The replaced text takes the formatting of its first letter.</p>
        </>
      }
    />
  )
}
