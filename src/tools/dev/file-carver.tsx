import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Download } from 'lucide-react'
import { Button, Dropzone, FileChip, Switch, Badge, Progress } from '@/components/ui'
import { Bar, Status, Stat } from './_b5/shell'
import { carve, type Carved } from '@/lib/b10/dev'
import { baseName, downloadBlob, formatBytes, zipFiles } from '@/lib/files'

const IMG = new Set(['png', 'jpg', 'gif', 'bmp', 'webp', 'ico'])
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', ico: 'image/x-icon', pdf: 'application/pdf', zip: 'application/zip', wav: 'audio/wav', mp3: 'audio/mpeg', mp4: 'video/mp4' }

function Thumb({ blob, ext }: { blob: Blob; ext: string }) {
  const url = useMemo(() => (IMG.has(ext) ? URL.createObjectURL(blob) : ''), [blob, ext])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return url ? <img src={url} alt="" className="checker h-28 w-full rounded-lg object-contain" /> : <div className="grid h-28 place-items-center rounded-lg bg-surface-2/60 font-display text-2xl font-bold uppercase text-muted">{ext}</div>
}

export default function FileCarver() {
  const [file, setFile] = useState<File | null>(null)
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [skipFirst, setSkipFirst] = useState(true)
  const [busy, setBusy] = useState(false)
  const [found, setFound] = useState<Carved[] | null>(null)
  const open = async (f: File) => { setFile(f); setFound(null); setBusy(true); const b = new Uint8Array(await f.arrayBuffer()); setBytes(b); await new Promise((r) => setTimeout(r, 20)); setFound(carve(b, { skipFirst })); setBusy(false) }
  useEffect(() => { if (bytes) setFound(carve(bytes, { skipFirst })) }, [skipFirst, bytes])
  const blobs = useMemo(() => (found && bytes ? found.map((c) => new Blob([bytes.slice(c.start, c.end)], { type: MIME[c.sig.ext] ?? 'application/octet-stream' })) : []), [found, bytes])
  const name = (c: Carved, i: number) => `${baseName(file?.name ?? 'file')}-${String(i + 1).padStart(3, '0')}-at-0x${c.start.toString(16)}.${c.sig.ext}`
  const all = async () => { if (!found) return; downloadBlob(await zipFiles(await Promise.all(found.map(async (c, i) => ({ name: name(c, i), data: new Uint8Array(await blobs[i].arrayBuffer()) })))), `${baseName(file?.name ?? 'file')}-extracted.zip`, 'application/zip') }

  if (!file) return <Dropzone onFiles={(f) => open(f[0])} label="Drop any file to look inside it" sub="Finds pictures, PDFs, archives, audio and more hidden inside documents, firmware, memory dumps or disk images" />
  return (
    <div className="space-y-4">
      <Bar>
        <FileChip file={file} />
        <Switch checked={skipFirst} onChange={setSkipFirst} label="Skip the file itself" />
        {found && found.length > 0 && <Button size="sm" className="ml-auto" onClick={all} icon={<Download className="size-4" />}>Download all ({found.length})</Button>}
        <Button size="sm" variant="ghost" onClick={() => { setFile(null); setBytes(null); setFound(null) }}>Start over</Button>
      </Bar>
      {busy && <Progress value={50} label="Scanning bytes" />}
      {found && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="File size" value={formatBytes(bytes?.length ?? 0)} />
            <Stat label="Embedded files" value={found.length} />
            <Stat label="With exact end" value={found.filter((f) => f.exact).length} />
            <Stat label="Types" value={[...new Set(found.map((f) => f.sig.ext))].join(', ') || 'none'} />
          </div>
          {!found.length && <Status kind="info">Nothing recognisable was found inside this file. Compressed or encrypted data hides its contents.</Status>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {found.map((c, i) => (
              <motion.div key={c.start + c.sig.ext} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(i, 16) * 0.03 }} className="rounded-2xl border border-border bg-surface p-3">
                <Thumb blob={blobs[i]} ext={c.sig.ext} />
                <div className="mt-2 truncate text-sm font-medium" title={c.sig.name}>{c.sig.name}</div>
                <div className="font-mono text-xs text-muted">0x{c.start.toString(16).toUpperCase()} to 0x{c.end.toString(16).toUpperCase()}</div>
                <div className="mt-2 flex items-center gap-2">
                  <Badge>{formatBytes(c.end - c.start)}</Badge>
                  {!c.exact && <Badge>end guessed</Badge>}
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => downloadBlob(blobs[i], name(c, i), blobs[i].type)} aria-label={`Download ${name(c, i)}`} icon={<Download className="size-4" />} />
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
