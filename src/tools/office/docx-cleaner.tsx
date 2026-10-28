import { useState } from 'react'
import { BrushCleaning } from 'lucide-react'
import { Button, Dropzone, Label, Segmented, Switch, ToolGrid, ErrorNote, ResultCard } from '@/components/ui'
import { baseName } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { acceptChanges, rejectChanges, removeComments, removeHighlights, removeHidden } from '@/lib/bcat/office'

const BODY = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/

export default function DocxCleaner() {
  const [file, setFile] = useState<File | null>(null)
  const [changes, setChanges] = useState<'accept' | 'reject' | 'keep'>('accept')
  const [comments, setComments] = useState(true)
  const [highlights, setHighlights] = useState(false)
  const [hidden, setHidden] = useState(true)
  const [props, setProps] = useState(true)
  const [report, setReport] = useState<string[] | null>(null)
  const [out, setOut] = useState<Blob | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const go = async () => {
    setErr(null); setBusy(true)
    try {
      const JSZip = (await import('jszip')).default
      const z = await JSZip.loadAsync(await file!.arrayBuffer())
      if (!z.file('word/document.xml')) throw new Error('This is not a Word DOCX file.')
      const tally = { changes: 0, comments: 0, highlights: 0, hidden: 0 }
      for (const p of Object.keys(z.files).filter((x) => BODY.test(x))) {
        let x = await z.file(p)!.async('string')
        if (changes !== 'keep') { const r = changes === 'accept' ? acceptChanges(x) : rejectChanges(x); x = r.xml; tally.changes += r.count }
        if (comments) { const r = removeComments(x); x = r.xml; tally.comments += r.count }
        if (highlights) { const r = removeHighlights(x); x = r.xml; tally.highlights += r.count }
        if (hidden) { const r = removeHidden(x); x = r.xml; tally.hidden += r.count }
        z.file(p, x)
      }
      if (comments) {
        for (const p of ['word/comments.xml', 'word/commentsExtended.xml', 'word/commentsIds.xml', 'word/commentsExtensible.xml', 'word/people.xml']) z.remove(p)
        const rels = z.file('word/_rels/document.xml.rels'); if (rels) z.file('word/_rels/document.xml.rels', (await rels.async('string')).replace(/<Relationship[^>]*Target="(comments|commentsExtended|commentsIds|commentsExtensible|people)\.xml"[^>]*\/>/g, ''))
        const ct = z.file('[Content_Types].xml'); if (ct) z.file('[Content_Types].xml', (await ct.async('string')).replace(/<Override[^>]*PartName="\/word\/(comments|commentsExtended|commentsIds|commentsExtensible|people)\.xml"[^>]*\/>/g, ''))
      }
      let propsDone = false
      if (props && z.file('docProps/core.xml')) { z.file('docProps/core.xml', (await z.file('docProps/core.xml')!.async('string')).replace(/<(dc:creator|cp:lastModifiedBy|cp:revision|cp:lastPrinted)\b([^>]*)>[^<]*<\/\1>/g, '<$1$2></$1>')); propsDone = true }
      const settings = z.file('word/settings.xml'); if (settings && changes !== 'keep') z.file('word/settings.xml', (await settings.async('string')).replace(/<w:trackRevisions\b[^>]*\/>/g, ''))
      setReport([
        changes !== 'keep' ? `${tally.changes} tracked changes ${changes === 'accept' ? 'accepted' : 'rejected'}` : '',
        comments ? `${tally.comments} comments removed` : '',
        highlights ? `${tally.highlights} highlights removed` : '',
        hidden ? `${tally.hidden} hidden text runs removed` : '',
        propsDone ? 'Author, last editor and revision number cleared' : '',
      ].filter(Boolean))
      setOut(await z.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))
    } catch (e: any) { setErr(e?.message || String(e)) } finally { setBusy(false) }
  }

  if (!file) return <Dropzone accept=".docx" onFiles={(f) => { setFile(f[0]); setOut(null) }} label="Drop a Word document (DOCX)" sub="Accept or reject all tracked changes, delete comments and hidden text, and make a clean final copy." />
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <TopBar file={file} onReset={() => { setFile(null); setOut(null); setReport(null) }} />
          <ErrorNote error={err} />
          {out && <ResultCard blob={out} filename={`${baseName(file.name)}-clean.docx`} originalSize={file.size} title="Clean copy ready"><ul className="list-disc pl-5 text-sm text-muted">{report?.map((r) => <li key={r}>{r}</li>)}</ul></ResultCard>}
        </div>
      }
      side={
        <>
          <div><Label>Tracked changes</Label><Segmented value={changes} onChange={setChanges} options={[{ value: 'accept', label: 'Accept all' }, { value: 'reject', label: 'Reject all' }, { value: 'keep', label: 'Leave' }]} /></div>
          <Switch checked={comments} onChange={setComments} label="Delete all comments" />
          <Switch checked={hidden} onChange={setHidden} label="Delete hidden text" />
          <Switch checked={highlights} onChange={setHighlights} label="Remove highlighter marks" />
          <Switch checked={props} onChange={setProps} label="Clear author and last editor" />
          <Button className="w-full" icon={<BrushCleaning className="size-4" />} loading={busy} onClick={go}>Make clean copy</Button>
          <p className="text-xs text-muted">Your original file is not changed. Check the clean copy before you send it.</p>
        </>
      }
    />
  )
}
