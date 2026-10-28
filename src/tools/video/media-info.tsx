import { useMemo, useState } from 'react'
import { FileVideo, Music, Info, Captions, Image as ImageIcon, List, Download } from 'lucide-react'
import { Button, CopyButton, Dropzone, ErrorNote, Segmented, Spinner, cn } from '@/components/ui'
import { downloadBlob, formatBytes, baseName } from '@/lib/files'
import wasmUrl from 'mediainfo.js/MediaInfoModule.wasm?url'
import { FileBar } from './_media/ui'
import { fmtTime } from './_media/media'

type Track = Record<string, any> & { '@type': string }

async function analyze(file: File): Promise<{ tracks: Track[]; text: string }> {
  const { default: mediaInfoFactory } = await import('mediainfo.js')
  const read = async (size: number, offset: number) => new Uint8Array(await file.slice(offset, offset + size).arrayBuffer())
  const mi = await mediaInfoFactory({ format: 'object', locateFile: () => wasmUrl })
  try {
    const obj: any = await mi.analyzeData(file.size, read)
    const tracks: Track[] = obj?.media?.track ?? []
    const text: string = await (async () => {
      const t = await mediaInfoFactory({ format: 'text', locateFile: () => wasmUrl })
      try { return (await t.analyzeData(file.size, read)) as unknown as string } finally { t.close() }
    })()
    return { tracks, text }
  } finally { mi.close() }
}

const ICON: Record<string, any> = { General: Info, Video: FileVideo, Audio: Music, Text: Captions, Image: ImageIcon, Menu: List }
const num = (v: any) => (v == null || v === '' ? null : Number(v))
function summary(t: Track): [string, string][] {
  const out: [string, string | null][] = []
  const kb = (b: any) => (num(b) ? `${Math.round(num(b)! / 1000)} kb/s` : null)
  switch (t['@type']) {
    case 'General':
      out.push(['Container', [t.Format, t.Format_Profile].filter(Boolean).join(' ')], ['Duration', num(t.Duration) != null ? fmtTime(num(t.Duration)!, 2) : null], ['Size', num(t.FileSize) ? formatBytes(num(t.FileSize)!) : null], ['Overall bitrate', kb(t.OverallBitRate)], ['Title', t.Title], ['Encoded by', t.Encoded_Application || t.Encoded_Library], ['Recorded', t.Recorded_Date || t.Encoded_Date], ['Streams', [t.VideoCount && `${t.VideoCount} video`, t.AudioCount && `${t.AudioCount} audio`, t.TextCount && `${t.TextCount} subtitle`].filter(Boolean).join(', ')])
      break
    case 'Video':
      out.push(['Codec', [t.Format, t.Format_Profile, t.Format_Level && `L${t.Format_Level}`].filter(Boolean).join(' ')], ['Resolution', t.Width ? `${t.Width}×${t.Height}` : null], ['Aspect', t.DisplayAspectRatio_String || (num(t.DisplayAspectRatio) ? (+t.DisplayAspectRatio).toFixed(3) : null)], ['Frame rate', t.FrameRate ? `${(+t.FrameRate).toFixed(3)} fps ${t.FrameRate_Mode ? `(${t.FrameRate_Mode})` : ''}` : null], ['Bitrate', kb(t.BitRate)], ['Bit depth', t.BitDepth && `${t.BitDepth}-bit`], ['Colour', [t.ColorSpace, t.ChromaSubsampling, t.colour_primaries, t.transfer_characteristics].filter(Boolean).join(' · ')], ['HDR', t.HDR_Format], ['Rotation', t.Rotation && `${t.Rotation}°`], ['Scan', t.ScanType], ['Frames', t.FrameCount])
      break
    case 'Audio':
      out.push(['Codec', [t.Format, t.Format_AdditionalFeatures, t.Format_Profile].filter(Boolean).join(' ')], ['Channels', t.Channels && `${t.Channels}${t.ChannelLayout ? ` (${t.ChannelLayout})` : ''}`], ['Sample rate', t.SamplingRate && `${(+t.SamplingRate / 1000).toFixed(1)} kHz`], ['Bitrate', kb(t.BitRate)], ['Bit depth', t.BitDepth && `${t.BitDepth}-bit`], ['Language', t.Language], ['Title', t.Title], ['Default', t.Default])
      break
    case 'Text':
      out.push(['Format', t.Format], ['Language', t.Language], ['Title', t.Title], ['Default', t.Default], ['Forced', t.Forced])
      break
    case 'Menu': {
      const ex = t.extra ?? {}
      Object.entries(ex).slice(0, 50).forEach(([k, v]) => out.push([k.replace(/^_/, '').replace(/_/g, ':'), String(v)]))
      break
    }
    default:
      out.push(['Format', t.Format], ['Size', t.Width ? `${t.Width}×${t.Height}` : null])
  }
  return out.filter((x): x is [string, string] => !!x[1])
}

export default function MediaInfo() {
  const [file, setFile] = useState<File | null>(null)
  const [data, setData] = useState<{ tracks: Track[]; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'summary' | 'all' | 'text'>('summary')
  const open = async (f: File) => {
    setFile(f); setData(null); setError(null); setBusy(true)
    try { setData(await analyze(f)) } catch (e: any) { setError('This file could not be analysed. ' + (e?.message || '')) } finally { setBusy(false) }
  }
  const json = useMemo(() => (data ? JSON.stringify({ media: { track: data.tracks } }, null, 2) : ''), [data])
  if (!file) return <Dropzone onFiles={(f) => open(f[0])} label="Drop any video or audio file" sub="Codecs, bitrate, resolution, frame rate, channels, chapters and tags. Only the parts it needs are read; nothing is uploaded." />
  return (
    <div className="space-y-4">
      <FileBar file={file} onReset={() => { setFile(null); setData(null) }} />
      {busy && <Spinner label="Reading file details" />}
      <ErrorNote error={error} />
      {data && <>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={view} onChange={setView} options={[{ value: 'summary', label: 'Summary' }, { value: 'all', label: 'All fields' }, { value: 'text', label: 'Text report' }]} />
          <div className="ml-auto flex gap-2">
            <CopyButton text={view === 'text' ? data.text : json} label={view === 'text' ? 'Copy report' : 'Copy JSON'} />
            <Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([json], { type: 'application/json' }), `${baseName(file.name)}-mediainfo.json`)}>JSON</Button>
          </div>
        </div>
        {view === 'text' ? <pre className="max-h-[70vh] overflow-auto rounded-2xl border border-border bg-surface-2/40 p-4 font-mono text-xs leading-relaxed scrollbar-thin">{data.text}</pre> : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.tracks.map((t, i) => {
              const Icon = ICON[t['@type']] ?? Info
              const rows: [string, string][] = view === 'summary' ? summary(t) : Object.entries(t).filter(([k]) => k !== '@type' && k !== 'extra').map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])
              return (
                <div key={i} className={cn('rounded-2xl border border-border bg-surface p-4', t['@type'] === 'General' && 'md:col-span-2')}>
                  <div className="mb-2 flex items-center gap-2 font-semibold"><Icon className="size-4 text-accent" />{t['@type']}{t['@typeorder'] ? ` ${t['@typeorder']}` : ''}{t.ID ? <span className="text-xs font-normal text-muted">#{t.ID}</span> : null}</div>
                  <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1 text-sm">
                    {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="break-all font-mono text-xs leading-5">{v}</dd></div>)}
                    {!rows.length && <dd className="col-span-2 text-xs text-muted">No details.</dd>}
                  </dl>
                </div>
              )
            })}
          </div>
        )}
      </>}
    </div>
  )
}
