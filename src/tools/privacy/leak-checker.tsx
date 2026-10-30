import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import { Card, Dropzone, Progress, useJob } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { findPii, PII_LABEL } from '@/lib/bcat/privacy'
import { OutBox } from '@/lib/cf/ui'

type Level = 'high' | 'medium' | 'low'
interface Finding { level: Level; what: string; value: string }
interface Report { file: File; kind: string; findings: Finding[]; fix?: { slug: string; label: string } }

/* Token shapes of common cloud and code host credentials, assembled from parts. */
const TOKEN_RE = new RegExp(['-----BEGIN [A-Z ]*PRI' + 'VATE KEY-----', 'AK' + 'IA[0-9A-Z]{16}', 'gh' + 'p_[A-Za-z0-9]{36}', 'AI' + 'za[0-9A-Za-z_-]{35}', 'xox' + '[baprs]-[A-Za-z0-9-]{10,}'].join('|'), 'g')
const TEXT_EXT = /\.(txt|csv|md|json|log|html?|xml|ya?ml|ini|tsv|conf|cfg|properties)$/

const strip = (s: string) => { let p: string; do { p = s; s = s.replace(/<[^>]*>/g, '') } while (s !== p); return s.replace(/</g, '').trim() }
async function officeLeaks(f: File, findings: Finding[]) {
  const JSZip = (await import('jszip')).default
  const z = await JSZip.loadAsync(await f.arrayBuffer())
  const read = async (n: string) => (await z.file(n)?.async('string')) ?? ''
  const core = await read('docProps/core.xml'), app = await read('docProps/app.xml'), custom = await read('docProps/custom.xml')
  const get = (x: string, t: string) => strip(x.match(new RegExp(`<(?:\\w+:)?${t}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${t}>`))?.[1] ?? '')
  for (const [t, label, lvl] of [['creator', 'Author', 'high'], ['lastModifiedBy', 'Last edited by', 'high'], ['created', 'Created', 'low'], ['modified', 'Last saved', 'low'], ['revision', 'Revision number', 'low'], ['title', 'Title', 'low'], ['keywords', 'Keywords', 'low'], ['description', 'Comments field', 'medium']] as const) { const v = get(core, t); if (v) findings.push({ level: lvl, what: label, value: v }) }
  for (const [t, label, lvl] of [['Company', 'Company', 'medium'], ['Manager', 'Manager', 'medium'], ['Template', 'Template', 'low'], ['Application', 'Made with', 'low'], ['TotalTime', 'Minutes spent editing', 'low']] as const) { const v = get(app, t); if (v && v !== 'Normal.dotm' && v !== '0') findings.push({ level: lvl, what: label, value: v }) }
  const props = [...custom.matchAll(/<property\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/property>/g)]
  if (props.length) findings.push({ level: 'medium', what: 'Custom properties', value: props.map((p) => `${p[1]}=${strip(p[2])}`).join(', ').slice(0, 200) })
  const doc = await read('word/document.xml')
  const ins = (doc.match(/<w:ins\b/g) ?? []).length, del = (doc.match(/<w:del\b/g) ?? []).length
  if (ins + del) { const who = [...new Set([...doc.matchAll(/<w:(?:ins|del)\b[^>]*w:author="([^"]+)"/g)].map((m) => m[1]))]; findings.push({ level: 'high', what: 'Tracked changes (deleted text can still be read)', value: `${ins} insertions, ${del} deletions by ${who.join(', ') || 'unknown'}` }) }
  const commentFiles = Object.keys(z.files).filter((n) => /comments\d*\.xml$|\/comments\/|threadedComments/.test(n))
  let nComments = 0; const who = new Set<string>()
  for (const c of commentFiles) { const x = await read(c); nComments += (x.match(/<w:comment\b|<comment\b|<p:cm\b|<threadedComment\b/g) ?? []).length; for (const m of x.matchAll(/(?:w:author|author)="([^"]+)"/g)) who.add(m[1]) }
  if (nComments) findings.push({ level: 'high', what: 'Comments', value: `${nComments} comments${who.size ? ` by ${[...who].slice(0, 5).join(', ')}` : ''}` })
  if (/<w:vanish\/>/.test(doc)) findings.push({ level: 'high', what: 'Hidden text', value: 'Some text is formatted as hidden' })
  const wb = await read('xl/workbook.xml')
  const hidden = [...wb.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*state="(hidden|veryHidden)"/g)].map((m) => m[1])
  if (hidden.length) findings.push({ level: 'high', what: 'Hidden sheets', value: hidden.join(', ') })
  const notes = Object.keys(z.files).filter((n) => /ppt\/notesSlides\/.*\.xml$/.test(n)).length
  if (notes) findings.push({ level: 'medium', what: 'Speaker notes', value: `${notes} slides have notes` })
  let links = 0
  for (const n of Object.keys(z.files).filter((x) => x.endsWith('.rels'))) links += ((await read(n)).match(/Target="file:[^"]*"/g) ?? []).length
  if (links) findings.push({ level: 'medium', what: 'Links to files on your computer', value: `${links} local file paths` })
  const media = Object.keys(z.files).filter((n) => /\/media\//.test(n)).length
  if (media) findings.push({ level: 'low', what: 'Embedded images', value: `${media} (each can carry its own camera data)` })
  if (z.file('docProps/thumbnail.jpeg') || z.file('docProps/thumbnail.wmf')) findings.push({ level: 'low', what: 'Preview thumbnail', value: 'A picture of the first page is stored inside' })
}
async function pdfLeaks(f: File, findings: Finding[]) {
  const { PDFDocument } = await import('pdf-lib')
  const bytes = new Uint8Array(await f.arrayBuffer())
  const d = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const meta: [string, string | undefined, Level][] = [['Author', d.getAuthor(), 'high'], ['Made with', d.getCreator(), 'low'], ['PDF producer', d.getProducer(), 'low'], ['Title', d.getTitle(), 'low'], ['Subject', d.getSubject(), 'low'], ['Keywords', d.getKeywords(), 'low'], ['Created', d.getCreationDate()?.toISOString(), 'low'], ['Modified', d.getModificationDate()?.toISOString(), 'low']]
  for (const [label, v, lvl] of meta) if (v) findings.push({ level: lvl, what: label, value: String(v) })
  const raw = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 30e6)))
  if (/<x:xmpmeta/.test(raw)) findings.push({ level: 'medium', what: 'XMP metadata block', value: 'Extra hidden metadata that can include edit history and names' })
  const ann = (raw.match(/\/Subtype\s*\/(Text|Highlight|FreeText|Ink|StrikeOut|Popup)/g) ?? []).length
  if (ann) findings.push({ level: 'medium', what: 'Annotations and comments', value: `${ann}` })
  if (/\/JavaScript|\/JS\s/.test(raw)) findings.push({ level: 'high', what: 'Scripts inside', value: 'The PDF contains JavaScript' })
  if (/\/EmbeddedFile/.test(raw)) findings.push({ level: 'high', what: 'Attached files', value: 'Other files are embedded inside the PDF' })
  const saves = (raw.match(/%%EOF/g) ?? []).length
  if (saves > 1) findings.push({ level: 'medium', what: 'Earlier versions kept', value: `Saved ${saves} times; older text may still be inside` })
  try { const n = d.getForm().getFields().length; if (n) findings.push({ level: 'medium', what: 'Form fields', value: `${n} fields, may hold typed answers` }) } catch { /* no form */ }
}
async function imageLeaks(f: File, findings: Finding[]) {
  const exifr: any = (await import('exifr')).default
  const t = await exifr.parse(f, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, icc: false, translateValues: true }).catch(() => null)
  if (!t) return
  if (t.latitude != null) findings.push({ level: 'high', what: 'GPS location', value: `${t.latitude.toFixed(5)}, ${t.longitude.toFixed(5)}${t.GPSAltitude ? `, ${Math.round(t.GPSAltitude)} m` : ''}` })
  const fields: [string, string, Level][] = [['Make', 'Camera maker', 'low'], ['Model', 'Camera or phone', 'medium'], ['BodySerialNumber', 'Camera serial number', 'high'], ['SerialNumber', 'Serial number', 'high'], ['LensModel', 'Lens', 'low'], ['OwnerName', 'Owner', 'high'], ['CameraOwnerName', 'Owner', 'high'], ['Artist', 'Artist', 'high'], ['Copyright', 'Copyright', 'medium'], ['Software', 'Edited with', 'low'], ['DateTimeOriginal', 'Taken at', 'medium'], ['HostComputer', 'Computer name', 'medium'], ['creator', 'Creator (XMP)', 'high'], ['City', 'City', 'high'], ['Country', 'Country', 'medium']]
  for (const [k, label, lvl] of fields) { const v = t[k]; if (v != null && v !== '') findings.push({ level: lvl, what: label, value: Array.isArray(v) ? v.join(', ') : v instanceof Date ? v.toISOString() : String(v) }) }
}
function textLeaks(text: string, findings: Finding[]) {
  const hits = findPii(text, ['email', 'phone', 'card', 'iban', 'ip', 'ssn', 'aadhaar', 'pan'])
  const by = new Map<string, Set<string>>()
  for (const h of hits) { if (!by.has(h.kind)) by.set(h.kind, new Set()); by.get(h.kind)!.add(h.text) }
  for (const [k, v] of by) findings.push({ level: ['card', 'iban', 'ssn', 'aadhaar', 'pan'].includes(k) ? 'high' : 'medium', what: `${PII_LABEL[k as keyof typeof PII_LABEL]} in the text`, value: `${v.size}: ${[...v].slice(0, 3).join(', ')}${v.size > 3 ? ' ...' : ''}` })
  const keys = text.match(TOKEN_RE)
  if (keys) findings.push({ level: 'high', what: 'Keys or access tokens', value: `${keys.length} found` })
}
async function check(f: File): Promise<Report> {
  const n = f.name.toLowerCase(), findings: Finding[] = []
  let kind = 'File', fix: Report['fix']
  try {
    if (/\.(docx|xlsx|pptx|docm|xlsm|pptm)$/.test(n)) { kind = 'Office document'; await officeLeaks(f, findings); fix = n.endsWith('.docx') ? { slug: 'docx-cleaner', label: 'Word Document Cleaner' } : { slug: 'metadata-scrubber', label: 'Metadata Scrubber' } }
    else if (n.endsWith('.pdf')) { kind = 'PDF'; await pdfLeaks(f, findings); fix = { slug: 'sanitize-pdf', label: 'Sanitize PDF' } }
    else if (f.type.startsWith('image') || /\.(jpe?g|png|webp|heic|heif|tiff?|avif|dng)$/.test(n)) { kind = 'Image'; await imageLeaks(f, findings); fix = { slug: 'metadata-scrubber', label: 'Metadata Scrubber' } }
    else if (f.type.startsWith('video') || f.type.startsWith('audio') || /\.(mp4|mov|m4a|mp3|mkv|webm|wav|flac)$/.test(n)) { kind = 'Media'; fix = { slug: 'media-metadata-remover', label: 'Media Metadata Remover' }; findings.push({ level: 'medium', what: 'Media tags', value: 'Phone videos usually hold the filming place and device. Open the remover to see the exact tags.' }) }
    if (TEXT_EXT.test(n) || f.type.startsWith('text')) { if (kind === 'File') kind = 'Text'; textLeaks(await f.slice(0, 20e6).text(), findings); fix ??= { slug: 'pii-redactor', label: 'PII Redactor' } }
    if (n.endsWith('.docx')) { const mammoth = await import('mammoth'); const { value } = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() }); textLeaks(value, findings) }
  } catch (e: any) { findings.push({ level: 'low', what: 'Could not read everything', value: e?.message?.slice(0, 120) ?? 'unknown error' }) }
  return { file: f, kind, findings, fix }
}
const ORDER: Record<Level, number> = { high: 0, medium: 1, low: 2 }

export default function LeakChecker() {
  const [reports, setReports] = useState<Report[]>([])
  const job = useJob()
  const add = (fs: File[]) => job.run(async (setP) => { const out = [...reports]; for (let i = 0; i < fs.length; i++) { out.push(await check(fs[i])); setP((i + 1) / fs.length); setReports([...out]) } })
  const text = reports.map((r) => `${r.file.name} (${r.kind})\n` + (r.findings.length ? [...r.findings].sort((a, b) => ORDER[a.level] - ORDER[b.level]).map((x) => `  [${x.level}] ${x.what}: ${x.value}`).join('\n') : '  nothing found')).join('\n\n')
  return (
    <div className="space-y-4">
      <Dropzone multiple onFiles={add} compact={reports.length > 0} label={reports.length ? 'Check more files' : 'Drop files you are about to share'} sub="Word, Excel, PowerPoint, PDF, photos, videos and text. See names, places, comments and hidden data before anyone else does." />
      {job.busy && <Progress value={job.progress} label="Checking" />}
      {reports.map((r, i) => {
        const hi = r.findings.filter((f) => f.level === 'high').length
        return (
          <Card key={i} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {hi ? <ShieldAlert className="size-5 text-danger" /> : r.findings.length ? <AlertTriangle className="size-5 text-warn" /> : <CheckCircle2 className="size-5 text-success" />}
              <div className="min-w-0 flex-1"><div className="truncate font-semibold">{r.file.name}</div><div className="text-xs text-muted">{r.kind} · {formatBytes(r.file.size)} · {hi ? `${hi} serious` : r.findings.length ? 'minor items' : 'looks clean'}</div></div>
              {r.fix && r.findings.length > 0 && <Link to={`/${r.fix.slug}`} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-accent hover:text-accent">Clean it with {r.fix.label}</Link>}
            </div>
            {r.findings.length > 0 && <ul className="divide-y divide-border rounded-xl border border-border">{[...r.findings].sort((a, b) => ORDER[a.level] - ORDER[b.level]).map((x, j) => <li key={j} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[5rem_12rem_1fr]"><span className={`text-xs font-bold uppercase ${x.level === 'high' ? 'text-danger' : x.level === 'medium' ? 'text-warn' : 'text-muted'}`}>{x.level}</span><span>{x.what}</span><span className="break-all font-mono text-xs text-muted">{x.value}</span></li>)}</ul>}
          </Card>
        )
      })}
      {reports.length > 0 && <OutBox title="Report" text={text} filename="leak-report.txt" />}
    </div>
  )
}
