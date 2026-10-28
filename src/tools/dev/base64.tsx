import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowDownUp, Type, FileUp, FileDown, Sparkles, Download, AlertTriangle } from 'lucide-react'
import { Button, Card, Segmented, Switch, Tabs, CopyButton, Dropzone, FileChip, Field, Input, Textarea, cn } from '@/components/ui'
import { formatBytes, downloadBlob, readDataUrl } from '@/lib/files'
import { CodeArea, Pane, Stat, DownloadButton } from './_dev/kit'

const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true })
function bytesToB64(u: Uint8Array) { let s = ''; const C = 0x8000; for (let i = 0; i < u.length; i += C) s += String.fromCharCode(...u.subarray(i, i + C)); return btoa(s) }
function b64ToBytes(b: string) {
  let s = b.replace(/^data:[^,]*,/, '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (/[^A-Za-z0-9+/=]/.test(s)) throw new Error('Contains characters that are not valid Base64.')
  s = s.replace(/=+$/, ''); if (s.length % 4 === 1) throw new Error('Invalid Base64 length.')
  s += '==='.slice((s.length + 3) % 4)
  const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u
}
const toUrlSafe = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const wrap = (s: string, n: number) => (n ? s.replace(new RegExp(`(.{${n}})`, 'g'), '$1\n').trimEnd() : s)
const looksB64 = (s: string) => {
  const t = s.trim().replace(/^data:[^,]*,/, '').replace(/\s/g, '')
  if (t.length < 4 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(t) || t.length % 4 === 1) return false
  if (/^data:/.test(s.trim())) return true
  try { const txt = new TextDecoder('utf-8', { fatal: true }).decode(b64ToBytes(t)); const bad = [...txt].filter((c) => { const k = c.charCodeAt(0); return k < 32 && k !== 9 && k !== 10 && k !== 13 }).length; return bad / Math.max(1, txt.length) < 0.05 && (t.length % 4 === 0 || t.length > 12) }
  catch { return t.length % 4 === 0 && t.length >= 16 }
}

const MAGIC: [number[], string, string][] = [
  [[0x89, 0x50, 0x4e, 0x47], 'image/png', 'png'], [[0xff, 0xd8, 0xff], 'image/jpeg', 'jpg'], [[0x47, 0x49, 0x46, 0x38], 'image/gif', 'gif'],
  [[0x25, 0x50, 0x44, 0x46], 'application/pdf', 'pdf'], [[0x50, 0x4b, 0x03, 0x04], 'application/zip', 'zip'], [[0x52, 0x49, 0x46, 0x46], 'image/webp', 'webp'],
  [[0x49, 0x44, 0x33], 'audio/mpeg', 'mp3'], [[0x1f, 0x8b], 'application/gzip', 'gz'], [[0x42, 0x4d], 'image/bmp', 'bmp'], [[0x00, 0x00, 0x01, 0x00], 'image/x-icon', 'ico'],
  [[0x4f, 0x67, 0x67, 0x53], 'audio/ogg', 'ogg'], [[0x1a, 0x45, 0xdf, 0xa3], 'video/webm', 'webm'], [[0x3c, 0x73, 0x76, 0x67], 'image/svg+xml', 'svg'], [[0x3c, 0x3f, 0x78, 0x6d, 0x6c], 'application/xml', 'xml'],
]
function sniff(u: Uint8Array, hint?: string): { mime: string; ext: string } {
  if (hint) { const ext = hint.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg').replace('plain', 'txt') ?? 'bin'; return { mime: hint, ext } }
  for (const [sig, mime, ext] of MAGIC) if (sig.every((b, i) => u[i] === b)) return { mime, ext }
  if (u.length > 8 && u[4] === 0x66 && u[5] === 0x74 && u[6] === 0x79 && u[7] === 0x70) return { mime: 'video/mp4', ext: 'mp4' }
  try { dec.decode(u.subarray(0, 4096)); return { mime: 'text/plain', ext: 'txt' } } catch { return { mime: 'application/octet-stream', ext: 'bin' } }
}

export default function Base64Tool() {
  const [tab, setTab] = useState<'text' | 'file'>('text')
  return (
    <div className="space-y-5">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'text', label: <span className="flex items-center gap-2"><Type className="size-4" />Text</span> }, { value: 'file', label: <span className="flex items-center gap-2"><FileUp className="size-4" />Files</span> }]} />
      {tab === 'text' ? <TextMode /> : <FileMode />}
    </div>
  )
}

function TextMode() {
  const [input, setInput] = useState('Hello, OpenFile 👋 नमस्ते')
  const [mode, setMode] = useState<'auto' | 'encode' | 'decode'>('auto')
  const [urlSafe, setUrlSafe] = useState(false)
  const [lineWrap, setLineWrap] = useState(false)

  const dir = mode === 'auto' ? (looksB64(input) ? 'decode' : 'encode') : mode
  const res = useMemo(() => {
    if (!input) return { out: '', err: null as string | null, binary: false }
    try {
      if (dir === 'encode') { let o = bytesToB64(enc.encode(input)); if (urlSafe) o = toUrlSafe(o); return { out: wrap(o, lineWrap ? 76 : 0), err: null, binary: false } }
      const u = b64ToBytes(input)
      try { return { out: dec.decode(u), err: null, binary: false } }
      catch { return { out: Array.from(u.subarray(0, 2048), (b) => b.toString(16).padStart(2, '0')).join(' ') + (u.length > 2048 ? ' …' : ''), err: null, binary: true } }
    } catch (e: any) { return { out: '', err: e.message, binary: false } }
  }, [input, dir, urlSafe, lineWrap])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'auto', label: <span className="flex items-center gap-1"><Sparkles className="size-3.5" />Auto</span> }, { value: 'encode', label: 'Encode' }, { value: 'decode', label: 'Decode' }]} />
        {mode === 'auto' && input && <motion.span key={dir} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg bg-accent/10 px-2 py-1 text-xs font-medium text-accent">Detected: {dir === 'decode' ? 'Base64 → text' : 'text → Base64'}</motion.span>}
        <div className="ml-auto flex flex-wrap gap-4">
          <Switch checked={urlSafe} onChange={setUrlSafe} label="URL-safe (- _ no padding)" />
          <Switch checked={lineWrap} onChange={setLineWrap} label="Wrap at 76 (MIME)" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <Pane title={dir === 'encode' ? 'Text (UTF-8)' : 'Base64'} className="h-[380px]" actions={<Button size="sm" variant="ghost" onClick={() => setInput('')}>Clear</Button>}>
          <CodeArea value={input} onChange={setInput} lineNumbers={false} placeholder="Type or paste…" />
        </Pane>
        <div className="flex items-center justify-center">
          <Button variant="outline" size="sm" icon={<ArrowDownUp className="size-4 lg:-rotate-90" />} onClick={() => { if (res.out && !res.binary) { setInput(res.out.replace(/\n/g, '')); setMode(dir === 'encode' ? 'decode' : 'encode') } }} title="Swap">Swap</Button>
        </div>
        <Pane title={dir === 'encode' ? 'Base64' : res.binary ? 'Binary data (hex preview)' : 'Text (UTF-8)'} className="h-[380px]" actions={res.out ? <><CopyButton text={res.out} variant="ghost" /><DownloadButton text={res.out} filename={dir === 'encode' ? 'encoded.txt' : 'decoded.txt'} /></> : null}>
          {res.err ? <div className="flex items-start gap-2 p-4 text-sm text-danger"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{res.err}</div>
            : <CodeArea value={res.out} readOnly lineNumbers={false} />}
        </Pane>
      </div>
      {res.binary && <p className="text-xs text-warn">The decoded bytes aren't valid UTF-8 text, use the Files tab to save them as a file.</p>}
      {input && !res.err && <div className="grid grid-cols-3 gap-2 sm:max-w-md"><Stat label="Input" value={formatBytes(enc.encode(input).length)} /><Stat label="Output" value={formatBytes(enc.encode(res.out).length)} /><Stat label="Ratio" value={input.length ? (res.out.length / input.length).toFixed(2) + '×' : '-'} /></div>}
    </div>
  )
}

function FileMode() {
  const [file, setFile] = useState<File | null>(null)
  const [b64, setB64] = useState('')
  const [dataUrl, setDataUrl] = useState(true)
  const [urlSafe, setUrlSafe] = useState(false)
  const [paste, setPaste] = useState('')
  const [name, setName] = useState('')

  const onFile = async (f: File) => { setFile(f); const d = await readDataUrl(f); setB64(d) }
  const out = useMemo(() => { if (!b64) return ''; if (dataUrl && !urlSafe) return b64; const raw = b64.replace(/^data:[^,]*,/, ''); return urlSafe ? toUrlSafe(raw) : raw }, [b64, dataUrl, urlSafe])

  const decoded = useMemo(() => {
    if (!paste.trim()) return null
    try {
      const hint = /^data:([^;,]+)/.exec(paste.trim())?.[1]
      const u = b64ToBytes(paste); const s = sniff(u, hint)
      return { u, ...s, url: s.mime.startsWith('image/') ? URL.createObjectURL(new Blob([u as BlobPart], { type: s.mime })) : null }
    } catch (e: any) { return { err: e.message as string } }
  }, [paste])

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4">
        <div className="flex items-center gap-2 font-semibold"><FileUp className="size-4 text-accent" />File → Base64</div>
        {!file ? <Dropzone onFiles={(f) => onFile(f[0])} compact label="Drop any file to encode" /> : <FileChip file={file} onRemove={() => { setFile(null); setB64('') }} extra={<span className="text-xs text-muted">→ {formatBytes(out.length)}</span>} />}
        <div className="flex flex-wrap gap-4"><Switch checked={dataUrl} onChange={setDataUrl} label="Include data: URL prefix" /><Switch checked={urlSafe} onChange={setUrlSafe} label="URL-safe" /></div>
        {out && <>
          {file?.type.startsWith('image/') && <img src={b64} alt="" className="checker max-h-40 rounded-lg border border-border object-contain" />}
          <Textarea value={out.length > 200000 ? out.slice(0, 200000) + '\n… (truncated preview, use Copy or Download for the full string)' : out} readOnly className="min-h-40 break-all text-xs" />
          <div className="flex flex-wrap gap-2"><CopyButton text={out} /><DownloadButton text={out} filename={(file?.name ?? 'file') + '.b64.txt'} variant="outline" />
            {file?.type.startsWith('image/') && <CopyButton text={`<img src="${b64}" alt="" />`} label="Copy <img>" />}
            {file?.type.startsWith('image/') && <CopyButton text={`background-image: url("${b64}");`} label="Copy CSS" />}</div>
        </>}
      </Card>
      <Card className="space-y-4">
        <div className="flex items-center gap-2 font-semibold"><FileDown className="size-4 text-accent" />Base64 → File</div>
        <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste Base64 or a data: URL…" className="min-h-40 break-all text-xs" />
        {decoded && ('err' in decoded ? <div className="text-sm text-danger">{decoded.err}</div> : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <div className="grid grid-cols-2 gap-2"><Stat label="Detected type" value={<span className="text-sm">{decoded.mime}</span>} /><Stat label="Size" value={formatBytes(decoded.u.length)} /></div>
            {decoded.url && <img src={decoded.url} alt="" className="checker max-h-56 rounded-lg border border-border object-contain" />}
            {decoded.mime === 'text/plain' && <pre className={cn('max-h-40 overflow-auto rounded-lg bg-surface-2 p-2 text-xs')}>{new TextDecoder().decode(decoded.u.subarray(0, 4000))}</pre>}
            <Field label="Filename"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`decoded.${decoded.ext}`} /></Field>
            <Button icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([decoded.u as BlobPart], { type: decoded.mime }), name || `decoded.${decoded.ext}`)}>Download file</Button>
          </motion.div>
        ))}
      </Card>
    </div>
  )
}
