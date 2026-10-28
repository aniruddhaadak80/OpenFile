import { useState } from 'react'
import { Film, Music, FileIcon } from 'lucide-react'
import { Button, Dropzone, ToolGrid, Empty, Progress } from '@/components/ui'
import { formatBytes, downloadBlob, zipFiles, baseName } from '@/lib/files'
import { useObjectUrl } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

interface Media { from: string; path: string; name: string; blob: Blob; kind: 'image' | 'video' | 'audio' | 'other' }
const ACCEPT = '.docx,.docm,.dotx,.xlsx,.xlsm,.pptx,.pptm,.ppsx,.potx,.odt,.ods,.odp,.odg,.epub,.vsdx,.pages,.key,.numbers'
const MEDIA_DIR = /^(word|xl|ppt|visio)\/media\/|^Pictures\/|^OEBPS\/|^OPS\/|^EPUB\/|^Data\/|^images?\//i
const IMG = /\.(png|jpe?g|gif|bmp|tiff?|webp|svg|emf|wmf|ico|avif|heic)$/i, VID = /\.(mp4|m4v|mov|avi|wmv|webm|mkv|mpg)$/i, AUD = /\.(mp3|wav|m4a|aac|ogg|wma|flac)$/i
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg' }

function Card({ m }: { m: Media }) {
  const u = useObjectUrl(m.blob)
  const viewable = m.kind === 'image' && !/\.(emf|wmf|tiff?|heic)$/i.test(m.name)
  return (
    <button type="button" onClick={() => downloadBlob(m.blob, m.name)} className="group overflow-hidden rounded-xl border border-border bg-surface text-left cursor-pointer hover:border-accent" title={`Save ${m.name}`}>
      <div className="grid aspect-square place-items-center checker">{viewable && u ? <img src={u} alt={m.name} className="max-h-full max-w-full object-contain" /> : m.kind === 'video' ? <Film className="size-8 text-accent" /> : m.kind === 'audio' ? <Music className="size-8 text-accent" /> : <FileIcon className="size-8 text-muted" />}</div>
      <div className="p-2"><div className="truncate text-xs font-medium">{m.name}</div><div className="text-[10px] text-muted">{formatBytes(m.blob.size)}</div></div>
    </button>
  )
}

export default function OfficeMediaExtractor() {
  const [media, setMedia] = useState<Media[] | null>(null)
  const [names, setNames] = useState<string[]>([])
  const [prog, setProg] = useState<number | null>(null)
  const [filter, setFilter] = useState<'all' | 'image' | 'video' | 'audio'>('all')

  const add = async (fs: File[]) => {
    const JSZip = (await import('jszip')).default
    const found: Media[] = []
    for (let i = 0; i < fs.length; i++) {
      setProg(i / fs.length)
      try {
        const z = await JSZip.loadAsync(await fs[i].arrayBuffer())
        for (const p of Object.keys(z.files)) {
          const e = z.files[p]; if (e.dir) continue
          const n = p.split('/').pop()!
          const kind = IMG.test(n) ? 'image' : VID.test(n) ? 'video' : AUD.test(n) ? 'audio' : 'other'
          if (kind === 'other' || !(MEDIA_DIR.test(p) || /media/i.test(p))) continue
          if (/^thumbnail\./i.test(n) && p.startsWith('docProps')) continue
          const ext = n.split('.').pop()!.toLowerCase()
          found.push({ from: fs[i].name, path: p, name: fs.length > 1 ? `${baseName(fs[i].name)}-${n}` : n, kind, blob: new Blob([await e.async('uint8array') as BlobPart], { type: MIME[ext] ?? 'application/octet-stream' }) })
        }
      } catch { /* not a zip based file */ }
    }
    setMedia((m) => [...(m ?? []), ...found]); setNames((p) => [...p, ...fs.map((f) => f.name)]); setProg(null)
  }
  const shown = (media ?? []).filter((m) => filter === 'all' || m.kind === filter)
  const count = (k: Media['kind']) => (media ?? []).filter((m) => m.kind === k).length

  if (!media) return <><Dropzone multiple accept={ACCEPT} onFiles={add} label="Drop Word, PowerPoint, Excel or OpenDocument files" sub="Get every picture, video and sound inside them at the original quality, not a screenshot." />{prog != null && <Progress value={prog} label="Opening files" />}</>
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Files" value={names.length} /><Stat label="Images" value={count('image')} /><Stat label="Videos" value={count('video')} /><Stat label="Audio" value={count('audio')} /></div>
          {shown.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{shown.map((m, i) => <Card key={i} m={m} />)}</div> : <Empty>No embedded media found in {names.length > 1 ? 'these files' : 'this file'}.</Empty>}
          <Dropzone compact multiple accept={ACCEPT} onFiles={add} label="Add more files" />
        </div>
      }
      side={
        <>
          <div className="flex flex-wrap gap-1.5">{(['all', 'image', 'video', 'audio'] as const).map((k) => <Button key={k} size="sm" variant={filter === k ? 'secondary' : 'ghost'} onClick={() => setFilter(k)}>{k === 'all' ? 'All' : k === 'image' ? 'Images' : k === 'video' ? 'Videos' : 'Audio'}</Button>)}</div>
          <Button className="w-full" disabled={!shown.length} onClick={async () => downloadBlob(await zipFiles(shown.map((m) => ({ name: m.name, data: m.blob }))), 'office-media.zip')}>Download {shown.length} files (ZIP)</Button>
          <Button variant="ghost" className="w-full" onClick={() => { setMedia(null); setNames([]) }}>Start over</Button>
          <p className="text-xs text-muted">Tap any item to save it. EMF and WMF drawings from older Office files are saved as they are, they open in Office and most vector apps.</p>
        </>
      }
    />
  )
}
