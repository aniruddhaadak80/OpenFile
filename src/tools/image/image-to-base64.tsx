import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, ArrowLeftRight, Image as ImageIcon, AlertTriangle } from 'lucide-react'
import { Button, Card, CopyButton, Empty, Label, Segmented, Tabs, Textarea, cn } from '@/components/ui'
import { downloadBlob, formatBytes, readDataUrl, baseName } from '@/lib/files'
import { ImageDrop, decode, useObjectUrl } from './_img/kit'

type Snip = 'datauri' | 'raw' | 'css' | 'html' | 'md' | 'json'
const SNIPS: { value: Snip; label: string }[] = [{ value: 'datauri', label: 'Data URI' }, { value: 'raw', label: 'Base64' }, { value: 'css', label: 'CSS' }, { value: 'html', label: 'HTML <img>' }, { value: 'md', label: 'Markdown' }, { value: 'json', label: 'JSON' }]

function snippet(kind: Snip, uri: string, name: string, w: number, h: number) {
  const raw = uri.slice(uri.indexOf(',') + 1)
  switch (kind) {
    case 'raw': return raw
    case 'css': return `.image {\n  width: ${w}px;\n  height: ${h}px;\n  background-image: url("${uri}");\n  background-size: cover;\n}`
    case 'html': return `<img src="${uri}" width="${w}" height="${h}" alt="${name.replace(/"/g, '')}" />`
    case 'md': return `![${name}](${uri})`
    case 'json': return JSON.stringify({ name, mime: uri.slice(5, uri.indexOf(';')), width: w, height: h, data: raw }, null, 2)
    default: return uri
  }
}

function sniffMime(b: Uint8Array): string | null {
  const s = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n))
  if (b[0] === 0x89 && s(1, 3) === 'PNG') return 'image/png'
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg'
  if (s(0, 3) === 'GIF') return 'image/gif'
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return 'image/webp'
  if (s(0, 2) === 'BM') return 'image/bmp'
  if (s(4, 8) === 'ftypavif' || s(4, 8) === 'ftypavis') return 'image/avif'
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'image/x-icon'
  const head = new TextDecoder().decode(b.subarray(0, 300)).trimStart()
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml'
  return null
}
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/avif': 'avif', 'image/x-icon': 'ico', 'image/svg+xml': 'svg' }

function Encoder() {
  const [list, setList] = useState<{ name: string; size: number; uri: string; w: number; h: number }[]>([])
  const [idx, setIdx] = useState(0)
  const [kind, setKind] = useState<Snip>('datauri')
  const onFiles = useCallback(async (fs: File[]) => {
    const out: { name: string; size: number; uri: string; w: number; h: number }[] = []
    for (const f of fs) { const uri = await readDataUrl(f); let w = 0, h = 0; try { const im = await decode(f); w = im.naturalWidth; h = im.naturalHeight } catch { /* svg w/o size etc. */ } out.push({ name: f.name, size: f.size, uri, w, h }) }
    setList((l) => [...l, ...out]); setIdx((i) => (list.length ? i : 0))
  }, [list.length])
  const cur = list[idx]
  const text = useMemo(() => (cur ? snippet(kind, cur.uri, cur.name, cur.w, cur.h) : ''), [cur, kind])
  if (!cur) return <ImageDrop onFiles={onFiles} label="Drop images to encode as Base64" />
  const big = text.length > 2_000_000
  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <div className="space-y-3">
        {list.map((f, i) => (
          <button key={i} onClick={() => setIdx(i)} className={cn('flex w-full items-center gap-3 rounded-xl border p-2 text-left transition cursor-pointer', i === idx ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50')}>
            <img src={f.uri} alt="" className="checker size-12 rounded-lg object-contain" />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{f.name}</div><div className="text-xs text-muted">{f.w ? `${f.w}×${f.h} · ` : ''}{formatBytes(f.size)}</div></div>
          </button>
        ))}
        <ImageDrop onFiles={onFiles} label="Add more" sub="Drop or click" />
      </div>
      <Card className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented value={kind} onChange={setKind} options={SNIPS} />
          <CopyButton text={text} size="md" variant="secondary" />
        </div>
        <Textarea readOnly value={big ? text.slice(0, 200000) + '\n\n… (truncated in preview — Copy/Download include everything)' : text} className="h-72 break-all" onFocus={(e) => e.currentTarget.select()} />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>Original {formatBytes(cur.size)} → Base64 {formatBytes(text.length)} <span className="text-warn">(+{((text.length / cur.size - 1) * 100).toFixed(0)}%)</span></span>
          <Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={() => downloadBlob(text, `${baseName(cur.name)}.${kind === 'css' ? 'css' : kind === 'html' ? 'html' : kind === 'md' ? 'md' : kind === 'json' ? 'json' : 'txt'}`, 'text/plain')}>Save as file</Button>
        </div>
        {cur.size > 100 * 1024 && <div className="flex gap-2 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-warn"><AlertTriangle className="size-4 shrink-0" />Inlining images over ~100 KB slows page loads. Consider compressing first or serving as a file.</div>}
      </Card>
    </div>
  )
}

function Decoder() {
  const [input, setInput] = useState('')
  const [blob, setBlob] = useState<Blob | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [dimsS, setDims] = useState('')
  const url = useObjectUrl(blob)
  useEffect(() => {
    setErr(null); setBlob(null); setDims('')
    const t = input.trim()
    if (!t) return
    try {
      let b64 = t, mime: string | null = null
      const m = t.match(/^data:([^;,]+)?(;[^,]*)?,/)
      if (m) { mime = m[1] ?? null; b64 = t.slice(m[0].length); if (!/base64/.test(m[2] ?? '')) { const txt = decodeURIComponent(b64); setBlob(new Blob([txt], { type: mime ?? 'image/svg+xml' })); return } }
      b64 = b64.replace(/^url\((['"]?)data:[^,]+,/, '').replace(/['")]+$/, '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
      while (b64.length % 4) b64 += '='
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const sniffed = sniffMime(bytes)
      if (!sniffed && !mime?.startsWith('image/')) throw new Error("Decoded fine, but it doesn't look like an image (unknown file signature).")
      setBlob(new Blob([bytes], { type: sniffed ?? mime! }))
    } catch (e: any) { setErr(e?.name === 'InvalidCharacterError' ? 'This is not valid Base64 — check for missing or extra characters.' : e?.message || String(e)) }
  }, [input])
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-3">
        <Label hint={input ? formatBytes(input.length) : undefined}>Base64 or data URI</Label>
        <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste data:image/png;base64,iVBORw0… or raw Base64" className="h-80 break-all" />
        {input && <Button size="sm" variant="ghost" onClick={() => setInput('')}>Clear</Button>}
      </Card>
      <Card className="space-y-3">
        <Label>Preview</Label>
        {err ? <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{err}</div> : url && blob ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <div className="checker grid min-h-48 place-items-center rounded-xl p-3"><img src={url} alt="Decoded" className="max-h-80 max-w-full" onLoad={(e) => setDims(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)} onError={() => setErr('The data decoded but the browser could not display it as an image.')} /></div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-muted">{blob.type} · {dimsS} · {formatBytes(blob.size)}</span>
              <Button icon={<Download className="size-4" />} onClick={() => downloadBlob(blob, `decoded.${EXT[blob.type] ?? 'bin'}`)}>Download</Button></div>
          </motion.div>
        ) : <Empty><ImageIcon className="mx-auto mb-2 size-6" />Paste Base64 on the left to see the image.</Empty>}
      </Card>
    </div>
  )
}

export default function ImageToBase64() {
  const [tab, setTab] = useState<'enc' | 'dec'>('enc')
  return (
    <div className="space-y-6">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'enc', label: 'Image → Base64' }, { value: 'dec', label: <span className="flex items-center gap-1.5"><ArrowLeftRight className="size-3.5" />Base64 → Image</span> }]} />
      {tab === 'enc' ? <Encoder /> : <Decoder />}
    </div>
  )
}
