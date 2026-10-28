import { useState } from 'react'
import { ShieldCheck, Trash2, Check } from 'lucide-react'
import { Button, Dropzone, Switch, ToolGrid, Empty } from '@/components/ui'
import { formatBytes, zipFiles, downloadBlob } from '@/lib/files'
import { stripJpeg, stripPng, stripWebp, stripMp3 } from '@/lib/bcat/privacy'
import { Stat } from '@/tools/dev/_b5/shell'

interface Res { name: string; blob?: Blob; removed: string[]; error?: string; before: number }
const ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.pptx,.odt,.ods,.odp,.mp3,.gif,.bmp,.avif'
const ext = (n: string) => n.split('.').pop()!.toLowerCase()
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', mp3: 'audio/mpeg' }

async function scrubOffice(bytes: Uint8Array, e: string, anonAuthors: boolean) {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(bytes)
  const removed: string[] = []
  if (e.startsWith('od')) {
    if (zip.file('meta.xml')) { zip.file('meta.xml', '<?xml version="1.0" encoding="UTF-8"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.3"><office:meta/></office:document-meta>'); removed.push('Document properties (author, dates, editing time)') }
  } else {
    const core = zip.file('docProps/core.xml')
    if (core) {
      const x = await core.async('string')
      const found = [...x.matchAll(/<(dc:creator|cp:lastModifiedBy|dc:title|dc:subject|dc:description|cp:keywords|cp:category|cp:revision|dcterms:created|dcterms:modified|cp:lastPrinted)\b[^>]*>([^<]+)</g)].map((m) => m[1].split(':')[1])
      zip.file('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"></cp:coreProperties>')
      if (found.length) removed.push(`Core properties: ${[...new Set(found)].join(', ')}`)
    }
    const app = zip.file('docProps/app.xml')
    if (app) {
      const x = await app.async('string'), y = x.replace(/<(Company|Manager|Template|TotalTime|HyperlinkBase)>[^<]*<\/\1>/g, '')
      if (x !== y) { zip.file('docProps/app.xml', y); removed.push('Company, manager, template and editing time') }
    }
    if (zip.file('docProps/custom.xml')) {
      zip.remove('docProps/custom.xml'); removed.push('Custom properties')
      const rels = zip.file('_rels/.rels'); if (rels) zip.file('_rels/.rels', (await rels.async('string')).replace(/<Relationship[^>]*Target="\/?docProps\/custom\.xml"[^>]*\/>/g, ''))
      const ct = zip.file('[Content_Types].xml'); if (ct) zip.file('[Content_Types].xml', (await ct.async('string')).replace(/<Override[^>]*PartName="\/docProps\/custom\.xml"[^>]*\/>/g, ''))
    }
    if (anonAuthors) {
      let n = 0
      for (const p of Object.keys(zip.files).filter((f) => /^(word|xl|ppt)\/.*\.xml$/.test(f))) {
        const x = await zip.file(p)!.async('string')
        const y = x.replace(/\b(w:author|w:initials|author|w15:userId|w15:providerId)="[^"]*"/g, (_m, a) => { n++; return `${a}="${a.includes('initials') ? 'A' : 'Author'}"` }).replace(/<(cp:lastModifiedBy|dc:creator)>[^<]*</g, '<$1><')
        if (x !== y) zip.file(p, y)
      }
      if (zip.file('word/people.xml')) zip.file('word/people.xml', (await zip.file('word/people.xml')!.async('string')).replace(/w15:author="[^"]*"/g, 'w15:author="Author"'))
      if (n) removed.push(`${n} comment and tracked change author names`)
    }
  }
  return { blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/octet-stream' }), removed }
}

async function scrubPdf(bytes: Uint8Array) {
  const { PDFDocument, PDFName, PDFDict } = await import('pdf-lib')
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true })
  const removed: string[] = []
  const infoRef = doc.context.trailerInfo.Info
  const info = infoRef ? doc.context.lookup(infoRef) : undefined
  if (info instanceof PDFDict) { const keys = info.keys().map((k) => k.decodeText()); if (keys.length) removed.push(`Document info: ${keys.join(', ')}`); for (const k of info.keys()) info.delete(k) }
  if (doc.catalog.get(PDFName.of('Metadata'))) { doc.catalog.delete(PDFName.of('Metadata')); removed.push('XMP metadata stream') }
  if (doc.catalog.get(PDFName.of('PieceInfo'))) { doc.catalog.delete(PDFName.of('PieceInfo')); removed.push('Application private data') }
  return { blob: new Blob([(await doc.save({ useObjectStreams: true })) as BlobPart], { type: 'application/pdf' }), removed }
}

async function scrubCanvas(file: File) {
  const bmp = await createImageBitmap(file)
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
  c.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close()
  return { blob: await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png')), removed: ['All embedded data (image re-drawn as PNG)'] }
}

export default function MetadataScrubber() {
  const [files, setFiles] = useState<File[]>([])
  const [keepIcc, setKeepIcc] = useState(true)
  const [anon, setAnon] = useState(true)
  const [res, setRes] = useState<Res[] | null>(null)
  const [busy, setBusy] = useState(false)

  const go = async () => {
    setBusy(true)
    const out: Res[] = []
    for (const f of files) {
      const e = ext(f.name), bytes = new Uint8Array(await f.arrayBuffer())
      try {
        let r: { blob: Blob; removed: string[] }
        if (e === 'jpg' || e === 'jpeg') { const s = stripJpeg(bytes, keepIcc); r = { blob: new Blob([s.out as BlobPart], { type: MIME.jpg }), removed: s.removed } }
        else if (e === 'png') { const s = stripPng(bytes, keepIcc); r = { blob: new Blob([s.out as BlobPart], { type: MIME.png }), removed: s.removed } }
        else if (e === 'webp') { const s = stripWebp(bytes); r = { blob: new Blob([s.out as BlobPart], { type: MIME.webp }), removed: s.removed } }
        else if (e === 'mp3') { const s = stripMp3(bytes); r = { blob: new Blob([s.out as BlobPart], { type: MIME.mp3 }), removed: s.removed } }
        else if (e === 'pdf') r = await scrubPdf(bytes)
        else if (['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp'].includes(e)) r = await scrubOffice(bytes, e, anon)
        else r = await scrubCanvas(f)
        out.push({ name: e === 'gif' || e === 'bmp' || e === 'avif' ? f.name.replace(/\.[^.]+$/, '.png') : f.name, before: f.size, ...r })
      } catch (err: any) { out.push({ name: f.name, before: f.size, removed: [], error: err?.message || 'Could not read this file' }) }
    }
    setRes(out); setBusy(false)
  }

  if (!files.length) return <Dropzone multiple accept={ACCEPT} onFiles={setFiles} label="Drop files to remove hidden data" sub="Photos (JPG, PNG, WEBP), PDF, Word, Excel, PowerPoint, OpenDocument and MP3. Batch friendly." />
  const ok = res?.filter((r) => r.blob) ?? []
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          {res && <div className="grid grid-cols-3 gap-2"><Stat label="Files" value={res.length} /><Stat label="Cleaned" value={ok.length} /><Stat label="Items removed" value={ok.reduce((s, r) => s + r.removed.length, 0)} /></div>}
          {(res ?? files.map((f) => ({ name: f.name, before: f.size, removed: [] as string[] } as Res))).map((r, i) => (
            <div key={i} className="rounded-2xl border border-border bg-surface p-3">
              <div className="flex items-center gap-2 text-sm">
                {r.blob ? <Check className="size-4 text-success" /> : null}
                <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                <span className="text-xs text-muted">{formatBytes(r.before)}{r.blob ? ` to ${formatBytes(r.blob.size)}` : ''}</span>
                {r.blob ? <Button size="sm" variant="outline" onClick={() => downloadBlob(r.blob!, r.name)}>Download</Button>
                  : !res && <button aria-label="Remove" className="text-muted hover:text-danger cursor-pointer" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>}
              </div>
              {r.error && <p className="mt-1 text-xs text-danger">{r.error}</p>}
              {r.blob && <ul className="mt-1.5 list-disc pl-5 text-xs text-muted">{r.removed.length ? r.removed.map((x, k) => <li key={k}>{x}</li>) : <li>No hidden data found. The file is unchanged.</li>}</ul>}
            </div>
          ))}
          {!res && <Dropzone compact multiple accept={ACCEPT} onFiles={(f) => setFiles((p) => [...p, ...f])} label="Add more files" />}
          {res && !ok.length && <Empty>Nothing could be cleaned.</Empty>}
        </div>
      }
      side={
        <>
          <Switch checked={keepIcc} onChange={setKeepIcc} label="Keep colour profiles in photos" />
          <Switch checked={anon} onChange={setAnon} label="Anonymise comment and change authors in Office files" />
          {!res ? <Button className="w-full" icon={<ShieldCheck className="size-4" />} loading={busy} onClick={go}>Clean {files.length} file{files.length > 1 ? 's' : ''}</Button>
            : <>
              {ok.length > 1 && <Button className="w-full" onClick={async () => downloadBlob(await zipFiles(ok.map((r) => ({ name: r.name, data: r.blob! }))), 'cleaned-files.zip')}>Download all (ZIP)</Button>}
              <Button variant="ghost" className="w-full" onClick={() => { setFiles([]); setRes(null) }}>Start over</Button>
            </>}
          <p className="text-xs text-muted">Photos lose camera details, GPS location, dates and comments without being re-compressed. PDFs lose author, producer and XMP data. Office files lose author, company, dates and custom properties.</p>
        </>
      }
    />
  )
}
