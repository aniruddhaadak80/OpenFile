import { useRef, useState } from 'react'
import { RefreshCw, Download, X, Check, AlertCircle, Archive, Plus, Music, Play, Pause } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Dropzone, Label, Segmented, Select, ToolGrid, Progress, cn } from '@/components/ui'
import { baseName, downloadBlob, formatBytes, zipFiles } from '@/lib/files'
import { notSmaller } from '@/lib/compress-guard'
import { ffRun, extFromBlob, isCancel } from '@/tools/video/_media/engine'
import { convertArgs, type Fmt } from './convert-args'
import { useMediaJob } from '@/tools/video/_media/media'
import { JobPanel, Note } from '@/tools/video/_media/ui'

type Item = { id: string; file: File; status: 'queued' | 'working' | 'done' | 'error'; progress: number; out?: Blob; error?: string; kept?: boolean }
const FORMATS: Record<Fmt, { label: string; sub: string; lossless: boolean; more?: boolean }> = {
  mp3: { label: 'MP3', sub: 'Universal', lossless: false },
  m4a: { label: 'M4A', sub: 'AAC in MP4 · Apple', lossless: false },
  aac: { label: 'AAC', sub: 'Raw ADTS stream', lossless: false },
  ogg: { label: 'OGG', sub: 'Vorbis · open', lossless: false },
  wav: { label: 'WAV', sub: 'Uncompressed', lossless: true },
  flac: { label: 'FLAC', sub: 'Lossless, smaller', lossless: true },
  opus: { label: 'OPUS', sub: 'Best at low bitrates', lossless: false, more: true },
  aiff: { label: 'AIFF', sub: 'Uncompressed · Mac', lossless: true, more: true },
  alac: { label: 'ALAC', sub: 'Apple Lossless (.m4a)', lossless: true, more: true },
  wma: { label: 'WMA', sub: 'Windows Media', lossless: false, more: true },
  ac3: { label: 'AC3', sub: 'Dolby Digital', lossless: false, more: true },
  caf: { label: 'CAF', sub: 'Core Audio · Apple', lossless: true, more: true },
  au: { label: 'AU', sub: 'Sun / NeXT', lossless: true, more: true },
  m4b: { label: 'M4B', sub: 'Audiobook', lossless: false, more: true },
  m4r: { label: 'M4R', sub: 'iPhone ringtone', lossless: false, more: true },
  mp2: { label: 'MP2', sub: 'MPEG Layer II', lossless: false, more: true },
  weba: { label: 'WEBA', sub: 'WebM audio (Opus)', lossless: false, more: true },
  voc: { label: 'VOC', sub: 'Creative Voice', lossless: true, more: true },
}
const ACCEPT = 'audio/*,video/*,.mp3,.wav,.ogg,.oga,.m4a,.m4b,.m4r,.flac,.aac,.opus,.wma,.aiff,.aif,.aifc,.caf,.au,.snd,.ac3,.eac3,.dts,.mp2,.mpa,.amr,.awb,.ape,.tta,.wv,.mka,.weba,.webm,.voc,.spx,.gsm,.ra,.mpc,.dsf,.dff,.3ga,.mkv,.mp4,.mov'
const PRESETS = [{ label: 'Smallest (64k)', br: '64' }, { label: 'Voice (96k)', br: '96' }, { label: 'Good (128k)', br: '128' }, { label: 'Great (192k)', br: '192' }, { label: 'Best (320k)', br: '320' }]

function Preview({ blob }: { blob: Blob }) {
  const a = useRef<HTMLAudioElement | null>(null)
  const [on, setOn] = useState(false)
  const toggle = () => {
    if (!a.current) { a.current = new Audio(URL.createObjectURL(blob)); a.current.onended = () => setOn(false) }
    if (on) { a.current.pause(); setOn(false) } else { a.current.play(); setOn(true) }
  }
  return <button onClick={toggle} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg cursor-pointer" aria-label={on ? 'Pause' : 'Play'}>{on ? <Pause className="size-4" /> : <Play className="size-4" />}</button>
}

export default function AudioConverter() {
  const [items, setItems] = useState<Item[]>([])
  const [fmt, setFmt] = useState<Fmt>('mp3')
  const [br, setBr] = useState('192')
  const [sr, setSr] = useState('original')
  const [ch, setCh] = useState('original')
  const job = useMediaJob()

  const add = (files: File[]) => setItems((l) => [...l, ...files.map((file) => ({ id: Math.random().toString(36).slice(2), file, status: 'queued' as const, progress: 0 }))])
  const patch = (id: string, p: Partial<Item>) => setItems((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)))
  const [more, setMore] = useState(false)
  const outName = (f: File, kept?: boolean) => (kept ? f.name : `${baseName(f.name)}.${convertArgs(fmt, +br).ext}`)

  const convert = () => job.run(async ({ setProgress, setLabel, signal }) => {
    const todo = items.map((x) => ({ ...x, status: 'queued' as const, progress: 0, out: undefined, error: undefined }))
    setItems(todo)
    let ok = 0
    for (let i = 0; i < todo.length; i++) {
      if (signal.aborted) return
      const it = todo[i]
      setLabel(`Converting ${i + 1} of ${todo.length}: ${it.file.name}`)
      patch(it.id, { status: 'working' })
      const conv = convertArgs(fmt, +br)
      const input = 'in' + extFromBlob(it.file), out = `out.${conv.ext}`
      try {
        const blob = await ffRun({
          inputs: [{ name: input, file: it.file }],
          args: ['-i', input, '-vn', '-map', '0:a:0', ...(sr !== 'original' ? ['-ar', sr] : []), ...(ch !== 'original' && fmt !== 'voc' ? ['-ac', ch] : []), ...conv.args, out],
          output: out,
          onProgress: (p) => { patch(it.id, { progress: p }); setProgress((i + p) / todo.length) },
        })
        // re-encoding into the same lossy format is compression: never hand back a bigger file
        const same = !FORMATS[fmt].lossless && extFromBlob(it.file) === '.' + conv.ext
        if (same && notSmaller(it.file.size, blob.size)) patch(it.id, { status: 'done', out: it.file, kept: true, progress: 1 })
        else patch(it.id, { status: 'done', out: blob, kept: false, progress: 1 })
        ok++
      } catch (e: any) {
        if (isCancel(e)) throw e
        patch(it.id, { status: 'error', error: e?.message || 'Failed' })
      }
    }
    if (!ok) throw new Error('None of the files could be converted. They may not contain audio.')
  })

  const done = items.filter((x) => x.out)
  const zip = async () => downloadBlob(await zipFiles(done.map((x) => ({ name: outName(x.file, x.kept), data: x.out! }))), `converted-${fmt}.zip`)
  const reset = () => { if (job.busy) job.cancel(); setItems([]); job.reset() }

  if (!items.length) return <Dropzone multiple accept={ACCEPT} onFiles={add} label="Drop audio files to convert" sub="Batch-convert MP3, WAV, OGG, AAC, FLAC, M4A, OPUS, AIFF, ALAC, WMA, AC3 and more. Also opens AMR, APE, TTA and WavPack, or pulls audio out of videos. Offline." />

  return (
    <ToolGrid
      main={<>
        <div className="flex items-center justify-between"><Label className="mb-0">{items.length} file{items.length > 1 ? 's' : ''}</Label><Button variant="ghost" size="sm" onClick={reset}>Start over</Button></div>
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {items.map((it) => (
              <motion.div key={it.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -10 }} className="rounded-xl border border-border bg-surface px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <div className={cn('grid size-9 shrink-0 place-items-center rounded-lg', it.status === 'done' ? 'bg-success/15 text-success' : it.status === 'error' ? 'bg-danger/15 text-danger' : 'bg-accent/10 text-accent')}>
                    {it.status === 'done' ? <Check className="size-4" /> : it.status === 'error' ? <AlertCircle className="size-4" /> : <Music className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{it.file.name}</div>
                    <div className="text-xs text-muted">{formatBytes(it.file.size)}{it.out && <> → <span className="text-fg">{formatBytes(it.out.size)}</span> {it.kept ? 'already as small as it gets at this bitrate, original kept' : fmt.toUpperCase()}</>}{it.error && <span className="text-danger"> · {it.error}</span>}</div>
                  </div>
                  {it.out && <><Preview blob={it.out} /><Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(it.out!, outName(it.file, it.kept))}>Save</Button></>}
                  {!job.busy && <button onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger cursor-pointer" aria-label="Remove"><X className="size-4" /></button>}
                </div>
                {it.status === 'working' && <div className="mt-2"><Progress value={it.progress} /></div>}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {!job.busy && <Dropzone compact multiple accept={ACCEPT} onFiles={add} label={<span className="inline-flex items-center gap-1.5"><Plus className="size-4" />Add more files</span>} />}
      </>}
      side={<>
        <div>
          <Label>Output format</Label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(FORMATS) as Fmt[]).filter((f) => more || !FORMATS[f].more || f === fmt).map((f) => (
              <button key={f} onClick={() => setFmt(f)} className={cn('rounded-xl border px-2 py-2 text-center transition cursor-pointer', fmt === f ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50')}>
                <div className="text-sm font-semibold">{FORMATS[f].label}</div><div className="text-[10px] leading-tight text-muted">{FORMATS[f].sub}</div>
              </button>
            ))}
          </div>
        </div>
        <button className="-mt-3 cursor-pointer text-xs font-medium text-accent hover:underline" onClick={() => setMore(!more)}>{more ? 'Fewer formats' : 'More formats: OPUS, AIFF, ALAC, WMA, AC3, CAF, M4B, M4R and more'}</button>
        {!FORMATS[fmt].lossless && <div><Label>Quality</Label><Select value={br} onChange={setBr} options={PRESETS.map((p) => ({ value: p.br, label: p.label }))} /><p className="mt-1 text-xs text-muted">Lower bitrates make smaller files. 96k is fine for speech, 192k for music.</p></div>}
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Sample rate</Label><Select value={sr} onChange={setSr} options={[{ value: 'original', label: 'Original' }, { value: '48000', label: '48 kHz' }, { value: '44100', label: '44.1 kHz' }, { value: '32000', label: '32 kHz' }, { value: '22050', label: '22 kHz' }, { value: '16000', label: '16 kHz' }]} /></div>
          <div><Label>Channels</Label><Select value={ch} onChange={setCh} options={[{ value: 'original', label: 'Original' }, { value: '2', label: 'Stereo' }, { value: '1', label: 'Mono' }]} /></div>
        </div>
        {FORMATS[fmt].lossless && <Note>Lossless output can't restore quality already lost in an MP3, it just stops further loss.</Note>}
        <Button size="lg" className="w-full" icon={<RefreshCw className="size-5" />} onClick={convert} loading={job.busy}>Convert {items.length > 1 ? `${items.length} files` : ''} to {FORMATS[fmt].label}</Button>
        <JobPanel job={job} onRetry={convert} />
        {done.length > 1 && !job.busy && <Button variant="outline" className="w-full" icon={<Archive className="size-4" />} onClick={zip}>Download all ({done.length}) as ZIP</Button>}
      </>}
    />
  )
}
