import { useRef, useState } from 'react'
import { Sparkles, Eye } from 'lucide-react'
import { Button, Dropzone, Field, ResultCard, Slider, Switch, ToolGrid, cn } from '@/components/ui'
import { baseName } from '@/lib/files'
import { ffProbe, ffRun } from './_media/engine'
import { useMediaJob, useObjectUrl, useVideoMeta } from './_media/media'
import { FileBar, JobPanel, VideoStage } from './_media/ui'
import { VIDEO_ACCEPT, inName } from './_b3/shell'
import { EFFECTS, effectFilter, type EffectId } from '@/lib/b14/video'
import { safeBlobUrl } from '../../lib/safe'

export default function VideoEffects() {
  const [file, setFile] = useState<File | null>(null)
  const { url, meta } = useVideoMeta(file)
  const [fx, setFx] = useState<EffectId>('glitch')
  const [k, setK] = useState(50)
  const [bpm, setBpm] = useState(100)
  const [keepAudio, setKeepAudio] = useState(true)
  const [preview, setPreview] = useState<Blob | null>(null)
  const [res, setRes] = useState<Blob | null>(null)
  const pUrl = useObjectUrl(preview), rUrl = useObjectUrl(res)
  const video = useRef<HTMLVideoElement>(null)
  const job = useMediaJob()
  const cur = EFFECTS.find((e) => e.id === fx)!

  const go = (short: boolean) => job.run(async ({ setProgress, setLabel }) => {
    if (!file) return
    setLabel('Reading video')
    const info = await ffProbe(file, inName(file))
    const W = Math.round((info.width || meta?.width || 1280) / 2) * 2, H = Math.round((info.height || meta?.height || 720) / 2) * 2
    // previews run at most 640 px wide so they come back in seconds
    const pw = short ? Math.min(W, 640) : W, ph = short ? Math.round((H * pw) / W / 2) * 2 : H
    const chain = effectFilter(fx, k / 100, pw, ph, bpm)
    const pre = `scale=${pw}:${ph},setsar=1`
    const start = short ? Math.max(0, Math.min((video.current?.currentTime ?? 0), Math.max(0, (info.duration || 3) - 3))) : 0
    const dur = short ? Math.min(3, info.duration || 3) : info.duration
    const audio = keepAudio && info.hasAudio && !short
    setLabel(short ? 'Making a 3 second preview' : `Applying ${cur.name.toLowerCase()}`)
    const blob = await ffRun({
      inputs: [{ name: inName(file), file }], duration: dur, onProgress: setProgress, output: 'fx.mp4',
      args: [...(short ? ['-ss', start.toFixed(2), '-t', '3'] : []), '-i', inName(file), '-filter_complex', `[0:v]${pre},${chain},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p[v]`, '-map', '[v]', ...(audio ? ['-map', '0:a:0', '-c:a', 'aac', '-b:a', '160k'] : ['-an']), '-c:v', 'libx264', '-preset', short ? 'ultrafast' : 'veryfast', '-crf', short ? '26' : '20', '-movflags', '+faststart', 'fx.mp4'],
    })
    if (short) setPreview(blob); else setRes(blob)
  })

  if (!file) return <Dropzone accept={VIDEO_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a video to add an effect" sub="Glitch, VHS, old film, mirror, kaleidoscope, pixel, sketch, heat map, neon, ghost trails, zoom pulse and more. Runs on your device." />
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <FileBar file={file} onReset={() => { if (job.busy) job.cancel(); setFile(null); setPreview(null); setRes(null) }} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div><p className="mb-1 text-xs text-muted">Original (quick look{cur.css ? ' with a rough effect' : ''})</p><VideoStage ref={video} src={url} playable={meta?.playable !== false} style={cur.css ? { filter: cur.css } : undefined} /></div>
            <div><p className="mb-1 text-xs text-muted">Real effect preview</p>{pUrl ? <video src={safeBlobUrl(pUrl)} autoPlay loop muted playsInline controls className="aspect-video w-full rounded-2xl bg-black object-contain" /> : <div className="grid aspect-video place-items-center rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted">Press Preview to render 3 seconds from where the left video is paused.</div>}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {EFFECTS.map((e) => (
              <button key={e.id} onClick={() => { setFx(e.id); setPreview(null) }} aria-pressed={fx === e.id} className={cn('cursor-pointer rounded-xl border p-2.5 text-left transition', fx === e.id ? 'border-accent bg-accent/10' : 'border-border bg-surface hover:bg-surface-2')}>
                <div className="text-sm font-medium">{e.name}</div><div className="line-clamp-2 text-[11px] text-muted">{e.desc}</div>
              </button>
            ))}
          </div>
        </>}
        side={<>
          <p className="text-sm"><span className="font-semibold">{cur.name}</span><br /><span className="text-muted">{cur.desc}</span></p>
          {!['negative', 'mirror', 'kaleido', 'thermal'].includes(fx) && <Slider label="Strength" value={k} onChange={(v) => { setK(v); setPreview(null) }} min={0} max={100} suffix="%" />}
          {fx === 'zoompulse' && <Field label="Beats per minute"><Slider value={bpm} onChange={setBpm} min={40} max={180} ariaLabel="Beats per minute" /></Field>}
          <Switch checked={keepAudio} onChange={setKeepAudio} label="Keep the sound" />
          <Button variant="outline" className="w-full" icon={<Eye className="size-4" />} onClick={() => go(true)} disabled={job.busy}>Preview 3 seconds</Button>
          <Button size="lg" className="w-full" icon={<Sparkles className="size-5" />} onClick={() => go(false)} loading={job.busy}>Apply to whole video</Button>
          <JobPanel job={job} onRetry={() => go(false)} />
        </>}
      />
      {res && rUrl && (
        <ResultCard blob={res} filename={`${baseName(file.name)}-${fx}.mp4`} originalSize={file.size} title={`${cur.name} applied`} onReset={() => setRes(null)}>
          <video src={safeBlobUrl(rUrl)} controls playsInline className="max-h-80 w-full rounded-xl bg-black" />
        </ResultCard>
      )}
    </div>
  )
}
