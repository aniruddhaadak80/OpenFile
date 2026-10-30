import { useState } from 'react'
import { Eraser, Search } from 'lucide-react'
import { Button, Card, Dropzone, Switch, ResultCard } from '@/components/ui'
import { formatBytes, zipFiles } from '@/lib/files'
import { FfProgress, useFfJob, ffRun, extOf } from '@/lib/cf/ff'

const SENSITIVE = /location|gps|xyz|iso6709|make|model|serial|author|artist|creator|owner|copyright|comment|description|encoder|software|creation_time|date|title|album|composer|handler|com\.apple|android/i
interface Item { file: File; tags: [string, string][] | null; out?: Blob }
const ACCEPT = 'video/*,audio/*,.mkv,.mov,.m4a,.flac,.opus,.ogg,.wav,.mp3,.aac,.wma,.webm,.avi,.3gp'

export default function MediaMetadataRemover() {
  const [items, setItems] = useState<Item[]>([])
  const [chapters, setChapters] = useState(true), [covers, setCovers] = useState(true)
  const [zip, setZip] = useState<Blob | null>(null)
  const job = useFfJob()
  const inspect = () => job.run(async (p, l) => {
    const next = [...items]
    for (let i = 0; i < next.length; i++) {
      l(`Reading tags ${i + 1} of ${next.length}`)
      const input = 'in.' + (extOf(next[i].file.name) || 'bin')
      try { const meta = await (await ffRun({ inputs: [{ name: input, file: next[i].file }], args: ['-i', input, '-f', 'ffmetadata', 'meta.txt'], output: 'meta.txt' })).text(); next[i] = { ...next[i], tags: meta.split('\n').filter((x) => x.includes('=') && !x.startsWith(';')).map((x) => { const k = x.indexOf('='); return [x.slice(0, k), x.slice(k + 1)] as [string, string] }) } }
      catch { next[i] = { ...next[i], tags: [] } }
      p((i + 1) / next.length); setItems([...next])
    }
  })
  const clean = () => job.run(async (p, l) => {
    const next = [...items]
    for (let i = 0; i < next.length; i++) {
      const f = next[i].file, ext = extOf(f.name) || 'mp4', input = 'in.' + ext, output = 'out.' + ext
      l(`Cleaning ${i + 1} of ${next.length}: ${f.name}`)
      const isAudio = f.type.startsWith('audio') || /^(mp3|m4a|flac|ogg|opus|wav|aac|wma)$/.test(ext)
      const args = ['-i', input, '-map', isAudio && !covers ? '0' : '0', ...(isAudio && covers ? ['-map', '-0:v?'] : []), '-map_metadata', '-1', '-map_metadata:s', '-1', ...(chapters ? ['-map_chapters', '-1'] : []), '-c', 'copy', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact', ...(/^(mp4|m4a|mov|3gp)$/.test(ext) ? ['-movflags', '+faststart'] : []), output]
      next[i] = { ...next[i], out: await ffRun({ inputs: [{ name: input, file: f }], args, output, onProgress: (x) => p((i + x) / next.length) }) }
      setItems([...next])
    }
    setZip(next.length > 1 ? await zipFiles(next.map((x) => ({ name: x.file.name.replace(/(\.[^.]+)$/, '-clean$1'), data: x.out! }))) : null)
  })
  if (!items.length) return <Dropzone multiple accept={ACCEPT} onFiles={(f) => setItems(f.map((file) => ({ file, tags: null })))} label="Drop videos or audio files" sub="Removes GPS location, phone model, dates, encoder and all other tags without re-encoding, so quality stays the same." />
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-3">
        {items.map((it, i) => <Card key={i} className="space-y-2 p-3">
          <div className="flex items-center gap-2"><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{it.file.name}</div><div className="text-xs text-muted">{formatBytes(it.file.size)}{it.tags ? ` · ${it.tags.length} tags found` : ''}</div></div>
            <button onClick={() => setItems(items.filter((_, k) => k !== i))} className="text-xs text-muted hover:text-danger cursor-pointer">Remove</button></div>
          {it.tags && it.tags.length > 0 && <div className="max-h-40 overflow-auto rounded-lg bg-surface-2/50 p-2 font-mono text-[11px]">{it.tags.map(([k, v], j) => <div key={j} className={SENSITIVE.test(k) ? 'text-warn' : 'text-muted'}>{k} = {v.slice(0, 120)}</div>)}</div>}
          {it.tags && !it.tags.length && <div className="text-xs text-success">No container tags found.</div>}
          {it.out && <ResultCard blob={it.out} filename={it.file.name.replace(/(\.[^.]+)$/, '-clean$1')} originalSize={it.file.size} title="Clean copy ready" />}
        </Card>)}
        <Dropzone compact multiple accept={ACCEPT} onFiles={(f) => setItems((o) => [...o, ...f.map((file) => ({ file, tags: null }))])} label="Add more files" />
        <FfProgress job={job} />
        {zip && <ResultCard blob={zip} filename="clean-media.zip" title="All clean copies in one ZIP" />}
      </div>
      <Card className="space-y-4 self-start">
        <Button variant="outline" className="w-full" icon={<Search className="size-4" />} disabled={job.busy} onClick={inspect}>Show what is inside</Button>
        <Switch checked={chapters} onChange={setChapters} label="Remove chapter names" />
        <Switch checked={covers} onChange={setCovers} label="Remove cover art from audio" />
        <Button className="w-full" icon={<Eraser className="size-4" />} disabled={job.busy} onClick={clean}>Remove metadata</Button>
        <p className="text-xs text-muted">Phone videos often carry the exact place they were filmed. Streams are copied as they are, so a 1 GB video is cleaned in seconds. The first run downloads the media engine once.</p>
      </Card>
    </div>
  )
}
