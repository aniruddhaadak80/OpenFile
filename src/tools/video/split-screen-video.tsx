import { useState } from 'react'
import { Columns2, X } from 'lucide-react'
import { Button, Dropzone, Label, ResultCard, Segmented, Select, Slider, ToolGrid, cn } from '@/components/ui'
import { splitScreenOp, type SplitLayout } from '@/lib/b3/ffops'
import { ColorInput } from '@/tools/image/_img/kit'
import { ffRun, ffProbe } from './_media/engine'
import { useMediaJob, useObjectUrl } from './_media/media'
import { JobPanel, Reveal } from './_media/ui'
import { VIDEO_ACCEPT, inName } from './_b3/shell'

const LAYOUTS: { v: SplitLayout; label: string; min: number; max: number }[] = [
  { v: 'h', label: 'Side by side', min: 2, max: 4 }, { v: 'v', label: 'Top and bottom', min: 2, max: 4 }, { v: 'grid', label: 'Grid', min: 3, max: 4 },
]

function Clip({ f, onRemove }: { f: File; onRemove: () => void }) {
  const url = useObjectUrl(f)
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-black">
      {url && <video src={url} muted loop autoPlay playsInline className="aspect-video w-full object-cover" />}
      <div className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-2 py-1 text-[11px] text-white">{f.name}</div>
      <button onClick={onRemove} aria-label={`Remove ${f.name}`} className="absolute right-1.5 top-1.5 rounded-lg bg-black/60 p-1 text-white cursor-pointer"><X className="size-3.5" /></button>
    </div>
  )
}

export default function SplitScreenVideo() {
  const [files, setFiles] = useState<File[]>([])
  const [layout, setLayout] = useState<SplitLayout>('h')
  const [cell, setCell] = useState('640x360')
  const [gap, setGap] = useState(6)
  const [color, setColor] = useState('#000000')
  const [fit, setFit] = useState<'fill' | 'fit'>('fill')
  const [audio, setAudio] = useState('0')
  const [result, setResult] = useState<Blob | null>(null)
  const url = useObjectUrl(result)
  const job = useMediaJob()
  const add = (f: File[]) => setFiles((x) => [...x, ...f].slice(0, 4))
  const reset = () => { if (job.busy) job.cancel(); setFiles([]); setResult(null) }
  const L = LAYOUTS.find((x) => x.v === layout)!
  const go = () => job.run(async ({ setProgress, setLabel }) => {
    if (files.length < 2) throw new Error('Add at least two videos.')
    setResult(null)
    const infos = []
    for (let i = 0; i < files.length; i++) { setLabel(`Reading clip ${i + 1}`); infos.push(await ffProbe(files[i], inName(files[i], `c${i}`))) }
    const names = files.map((f, i) => inName(f, `c${i}`))
    const [w, h] = cell.split('x').map(Number)
    const op = splitScreenOp(names, files.length === 2 && layout === 'grid' ? 'h' : layout, w, h, gap, color, audio === 'mix' ? 'mix' : audio === 'none' ? 'none' : +audio, infos.map((x) => x.hasAudio), fit)
    setLabel('Combining')
    const dur = Math.min(...infos.map((x) => x.duration || Infinity))
    setResult(await ffRun({ inputs: files.map((f, i) => ({ name: names[i], file: f })), args: op.args, output: op.output, duration: Number.isFinite(dur) ? dur : undefined, onProgress: setProgress }))
  })
  if (!files.length) return <Dropzone multiple accept={VIDEO_ACCEPT} onFiles={add} label="Drop 2 to 4 videos for a split screen" sub="Side by side, stacked, or a grid. Reaction videos, comparisons, duets." />
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <div className={cn('grid gap-2', layout === 'v' ? 'grid-cols-1 max-w-md mx-auto' : 'grid-cols-2')}>{files.map((f, i) => <Clip key={i} f={f} onRemove={() => setFiles(files.filter((_, k) => k !== i))} />)}</div>
          {files.length < 4 && <Dropzone compact multiple accept={VIDEO_ACCEPT} onFiles={add} label="Add another video" />}
        </>}
        side={<>
          <div><Label>Layout</Label><Segmented value={layout} onChange={setLayout} options={LAYOUTS.map((x) => ({ value: x.v, label: x.label }))} /></div>
          <div><Label>Size of each tile</Label><Select value={cell} onChange={setCell} options={[{ value: '640x360', label: '640×360 (16:9)' }, { value: '960x540', label: '960×540 (16:9)' }, { value: '540x960', label: '540×960 (9:16)' }, { value: '540x540', label: '540×540 (1:1)' }, { value: '1280x720', label: '1280×720 (16:9)' }]} /></div>
          <div><Label>Fit</Label><Segmented value={fit} onChange={setFit} options={[{ value: 'fill', label: 'Fill tile' }, { value: 'fit', label: 'Show all' }]} /></div>
          <Slider label="Gap" value={gap} onChange={setGap} min={0} max={40} suffix="px" />
          <div><Label>Gap colour</Label><ColorInput value={color} onChange={setColor} /></div>
          <div><Label>Sound</Label><Select value={audio} onChange={setAudio} options={[...files.map((f, i) => ({ value: String(i), label: `From clip ${i + 1}` })), { value: 'mix', label: 'Mix all' }, { value: 'none', label: 'No sound' }]} /></div>
          <Button size="lg" className="w-full" icon={<Columns2 className="size-5" />} onClick={go} loading={job.busy} disabled={files.length < L.min && !(layout === 'grid' && files.length >= 2)}>Create split screen</Button>
          <JobPanel job={job} onRetry={go} />
          <p className="text-xs text-muted">The result is as long as the shortest clip.</p>
        </>}
      />
      {result && url && <Reveal k={url}><ResultCard blob={result} filename="split-screen.mp4" title="Split screen ready" onReset={reset}><video src={url} controls playsInline className="max-h-80 w-full rounded-xl bg-black" /></ResultCard></Reveal>}
    </div>
  )
}
