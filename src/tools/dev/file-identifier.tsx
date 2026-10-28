import { useState } from 'react'
import { AlertTriangle, CheckCircle2, FileQuestion, X } from 'lucide-react'
import { Dropzone, Button, Badge, Spinner, cn } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { KV } from './_b5/shell'
import { entropy, entropyBlocks, entropyLabel } from '@/lib/b5/bytes'
import { hexdump } from '@/lib/b5/encoding'

type Res = { file: File; ext?: string; mime?: string; how: string; claimed: string; mismatch: boolean; entropy: number; blocks: number[]; head: Uint8Array }

function textGuess(b: Uint8Array): { ext: string; mime: string } | null {
  let s: string
  try { s = new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(0, 65536)) } catch { return null }
  if (/[\x00-\x08\x0e-\x1f]/.test(s.slice(0, 4096))) return null
  const t = s.trimStart()
  if (/^<\?xml|^<svg/i.test(t)) return /<svg/i.test(t.slice(0, 2000)) ? { ext: 'svg', mime: 'image/svg+xml' } : { ext: 'xml', mime: 'application/xml' }
  if (/^<!doctype html|^<html/i.test(t)) return { ext: 'html', mime: 'text/html' }
  if (/^[{[]/.test(t)) { try { JSON.parse(s); return { ext: 'json', mime: 'application/json' } } catch { /* maybe ndjson */ } }
  if (/^#!/.test(t)) return { ext: 'sh', mime: 'text/x-shellscript' }
  if (/^%!PS/.test(t)) return { ext: 'ps', mime: 'application/postscript' }
  if (/^WEBVTT/.test(t)) return { ext: 'vtt', mime: 'text/vtt' }
  if (/^\d+\r?\n\d\d:\d\d:\d\d,\d{3} -->/.test(t)) return { ext: 'srt', mime: 'application/x-subrip' }
  if (/^BEGIN:VCALENDAR/.test(t)) return { ext: 'ics', mime: 'text/calendar' }
  if (/^BEGIN:VCARD/.test(t)) return { ext: 'vcf', mime: 'text/vcard' }
  if (/^-----BEGIN [A-Z ]+-----/.test(t)) return { ext: 'pem', mime: 'application/x-pem-file' }
  const lines = t.split('\n').slice(0, 5)
  if (lines.length > 1 && lines.every((l) => l.split(',').length === lines[0].split(',').length && l.includes(','))) return { ext: 'csv', mime: 'text/csv' }
  return { ext: 'txt', mime: 'text/plain' }
}

const ALIASES: Record<string, string[]> = { jpg: ['jpeg', 'jpe', 'jfif'], tif: ['tiff'], mp4: ['m4v', 'm4a', 'mov'], zip: ['docx', 'xlsx', 'pptx', 'jar', 'apk', 'epub', 'odt', 'ods', 'odp', 'cbz', 'xpi', 'ipa'], txt: ['md', 'log', 'ini', 'cfg', 'conf', 'csv', 'tsv', 'js', 'ts', 'tsx', 'jsx', 'css', 'py', 'c', 'h', 'cpp', 'java', 'go', 'rs', 'yml', 'yaml', 'toml', 'sql', 'env'], xml: ['svg', 'kml', 'gpx', 'plist', 'rss', 'xsd', 'xsl'], cfb: ['doc', 'xls', 'ppt', 'msg', 'msi'], ogg: ['oga', 'ogv', 'opus'], html: ['htm'], mkv: ['webm'], webm: ['mkv'], json: ['geojson', 'ipynb', 'map'] }
const compatible = (claimed: string, ext: string) => claimed === ext || ALIASES[ext]?.includes(claimed) || ALIASES[claimed]?.includes(ext)

export default function FileIdentifier() {
  const [items, setItems] = useState<Res[]>([])
  const [busy, setBusy] = useState(false)

  const analyze = async (files: File[]) => {
    setBusy(true)
    const { fileTypeFromBuffer } = await import('file-type')
    const out: Res[] = []
    for (const f of files) {
      const bytes = new Uint8Array(await f.slice(0, Math.min(f.size, 64 * 1024 * 1024)).arrayBuffer())
      let ext: string | undefined, mime: string | undefined, how = 'magic bytes'
      try { const t = await fileTypeFromBuffer(bytes); if (t) { ext = t.ext; mime = t.mime } } catch { /* ignore */ }
      if (!ext) { const g = textGuess(bytes); if (g) { ext = g.ext; mime = g.mime; how = 'text content' } else how = 'unknown' }
      const claimed = (f.name.includes('.') ? f.name.split('.').pop()! : '').toLowerCase()
      out.push({ file: f, ext, mime, how, claimed, mismatch: !!ext && !!claimed && !compatible(claimed, ext), entropy: entropy(bytes), blocks: entropyBlocks(bytes, 96), head: bytes.slice(0, 256) })
    }
    setItems((s) => [...out, ...s]); setBusy(false)
  }

  return (
    <div className="space-y-4">
      <Dropzone multiple onFiles={analyze} label="Drop any files to find out what they really are" sub="Reads the first bytes (magic numbers) instead of trusting the file name. Nothing is uploaded." compact={items.length > 0} />
      {busy && <Spinner label="Reading files…" />}
      {items.map((r, i) => (
        <div key={i} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className={cn('grid size-11 place-items-center rounded-xl', r.ext ? (r.mismatch ? 'bg-warn/15 text-warn' : 'bg-success/15 text-success') : 'bg-surface-2 text-muted')}>
              {r.ext ? (r.mismatch ? <AlertTriangle className="size-5" /> : <CheckCircle2 className="size-5" />) : <FileQuestion className="size-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{r.file.name}</div>
              <div className="text-sm text-muted">{formatBytes(r.file.size)}{r.ext ? <> · detected as <span className="font-semibold text-fg">.{r.ext}</span> ({r.mime}) from {r.how}</> : ' · type not recognised'}</div>
              {r.mismatch && <div className="mt-1 text-sm text-warn">The name says .{r.claimed} but the content is .{r.ext}. It may be renamed, or the extension is wrong.</div>}
            </div>
            <Button size="sm" variant="ghost" onClick={() => setItems(items.filter((_, k) => k !== i))} aria-label="Remove" icon={<X className="size-4" />} />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <KV label="Real extension" value={r.ext ?? ''} />
            <KV label="MIME type" value={r.mime ?? ''} />
            <KV label={`Entropy (bits per byte)`} value={`${r.entropy.toFixed(3)} · ${entropyLabel(r.entropy)}`} mono={false} />
          </div>
          {r.blocks.length > 1 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Entropy across the file (0 to 8)</div>
              <svg viewBox={`0 0 ${r.blocks.length} 8`} preserveAspectRatio="none" className="h-16 w-full rounded-lg bg-surface-2/50" role="img" aria-label="Entropy chart">
                {r.blocks.map((h, k) => <rect key={k} x={k} y={8 - h} width={0.85} height={h} fill={h > 7.5 ? 'var(--color-warn)' : 'var(--color-teal)'} />)}
              </svg>
            </div>
          )}
          <details>
            <summary className="cursor-pointer text-sm text-muted hover:text-fg">Header bytes <Badge>{r.head.length} B</Badge></summary>
            <pre className="scrollbar-thin mt-2 overflow-auto rounded-lg bg-surface-2/50 p-3 font-mono text-[11px] leading-5">{hexdump(r.head)}</pre>
          </details>
        </div>
      ))}
    </div>
  )
}
