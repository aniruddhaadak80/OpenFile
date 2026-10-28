import { useEffect, useRef, useState } from 'react'
import { BellRing, Play, Pause, Smartphone } from 'lucide-react'
import { Button, Dropzone, Label, Segmented, Slider, ToolGrid, ResultCard } from '@/components/ui'
import { baseName } from '@/lib/files'
import { ffRun, extFromBlob } from '@/tools/video/_media/engine'
import { useMediaJob, useObjectUrl, fmtTime } from '@/tools/video/_media/media'
import { JobPanel, FileBar, RangeTimeline, TimeInput } from '@/tools/video/_media/ui'
import { AV_ACCEPT, mediaDuration } from './_b4/FxShell'

type Out = 'm4r' | 'mp3' | 'ogg'
/** Build the ffmpeg args for a ringtone. Pure, unit tested. */
export function ringtoneArgs(inName: string, start: number, end: number, fadeIn: number, fadeOut: number, gainDb: number, out: Out): string[] {
  const len = Math.max(0.1, end - start)
  const fi = Math.min(fadeIn, len / 2), fo = Math.min(fadeOut, len / 2)
  const af = [fi > 0 ? `afade=t=in:st=0:d=${fi}` : '', fo > 0 ? `afade=t=out:st=${(len - fo).toFixed(3)}:d=${fo}` : '', gainDb ? `volume=${gainDb}dB` : '', 'alimiter=limit=0.98'].filter(Boolean).join(',')
  const codec = out === 'm4r' ? ['-c:a', 'aac', '-b:a', '192k', '-f', 'ipod'] : out === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '192k'] : ['-c:a', 'libvorbis', '-q:a', '6']
  return ['-ss', start.toFixed(3), '-t', len.toFixed(3), '-i', inName, '-vn', '-ac', '2', '-ar', '44100', ...(af ? ['-af', af] : []), ...codec, `out.${out}`]
}

export default function RingtoneMaker() {
  const [file, setFile] = useState<File | null>(null)
  const [duration, setDuration] = useState(0)
  const [range, setRange] = useState<[number, number]>([0, 30])
  const [now, setNow] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [fadeIn, setFadeIn] = useState(1)
  const [fadeOut, setFadeOut] = useState(2)
  const [gain, setGain] = useState(0)
  const [out, setOut] = useState<Out>('m4r')
  const [result, setResult] = useState<Blob | null>(null)
  const job = useMediaJob()
  const url = useObjectUrl(file)
  const resultUrl = useObjectUrl(result)
  const audio = useRef<HTMLAudioElement>(null)
  const maxLen = out === 'm4r' ? 40 : 60

  useEffect(() => { if (!file) return; mediaDuration(file).then((d) => { setDuration(d); setRange([0, Math.min(d || 30, 30)]) }) }, [file])
  useEffect(() => {
    const a = audio.current; if (!a) return
    const t = () => { setNow(a.currentTime); if (a.currentTime >= range[1]) { a.currentTime = range[0] } }
    a.addEventListener('timeupdate', t); return () => a.removeEventListener('timeupdate', t)
  }, [range, url])
  useEffect(() => { if (range[1] - range[0] > maxLen) setRange([range[0], range[0] + maxLen]) }, [maxLen]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => { const a = audio.current; if (!a) return; if (a.paused) { if (a.currentTime < range[0] || a.currentTime >= range[1]) a.currentTime = range[0]; a.play(); setPlaying(true) } else { a.pause(); setPlaying(false) } }
  const make = () => file && job.run(async ({ setProgress }) => {
    setResult(null)
    const inName = 'in' + extFromBlob(file)
    setResult(await ffRun({ inputs: [{ name: inName, file }], args: ringtoneArgs(inName, range[0], range[1], fadeIn, fadeOut, gain, out), output: `out.${out}`, duration: range[1] - range[0], onProgress: setProgress }))
  })

  if (!file) return <Dropzone accept={AV_ACCEPT} onFiles={(f) => { setFile(f[0]); setResult(null) }} label="Drop a song to make a ringtone" sub="Pick the best part, add fades and save as an iPhone M4R or an MP3 for Android." />
  return (
    <ToolGrid
      main={<>
        <FileBar file={file} onReset={() => { setFile(null); setResult(null) }} />
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-4">
          <audio ref={audio} src={url ?? undefined} onPause={() => setPlaying(false)} className="hidden" />
          {duration > 0 ? <RangeTimeline duration={duration} start={range[0]} end={range[1]} onChange={(s, e) => setRange([s, e])} current={now} onSeek={(t) => { if (audio.current) audio.current.currentTime = t; setNow(t) }} maxLen={maxLen} minGap={1} /> : <p className="text-sm text-muted">Reading the song length.</p>}
          <div className="flex flex-wrap items-end gap-3">
            <Button icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={toggle}>{playing ? 'Pause' : 'Play selection'}</Button>
            <div className="w-32"><Label>Start</Label><TimeInput label="Start time" value={range[0]} onChange={(v) => setRange([v, Math.min(duration, Math.max(v + 1, Math.min(range[1], v + maxLen)))])} max={duration} /></div>
            <div className="w-32"><Label>End</Label><TimeInput label="End time" value={range[1]} onChange={(v) => setRange([Math.max(0, Math.min(range[0], v - 1)), v])} max={duration} /></div>
            <div className="text-sm text-muted">Length <span className="font-mono text-fg">{fmtTime(range[1] - range[0], 1)}</span></div>
          </div>
        </div>
        {result && resultUrl && <ResultCard blob={result} filename={`${baseName(file.name)}-ringtone.${out}`} onReset={() => setResult(null)}>
          <audio src={resultUrl} controls className="w-full" />
          {out === 'm4r' && <p className="mt-2 text-xs text-muted">On iPhone: open the file in the Files app or GarageBand and choose Share, then Ringtone. On a computer, drag it onto your iPhone in Finder or iTunes.</p>}
        </ResultCard>}
      </>}
      side={<>
        <div><Label>Phone</Label><Segmented value={out} onChange={setOut} options={[{ value: 'm4r', label: 'iPhone (M4R)' }, { value: 'mp3', label: 'Android (MP3)' }, { value: 'ogg', label: 'OGG' }]} /></div>
        <Slider label="Fade in" value={fadeIn} onChange={setFadeIn} min={0} max={5} step={0.5} suffix=" s" />
        <Slider label="Fade out" value={fadeOut} onChange={setFadeOut} min={0} max={5} step={0.5} suffix=" s" />
        <Slider label="Volume" value={gain} onChange={setGain} min={-10} max={10} suffix=" dB" />
        <Button size="lg" className="w-full" icon={<BellRing className="size-5" />} onClick={make} loading={job.busy} disabled={!duration}>Make ringtone</Button>
        <JobPanel job={job} onRetry={make} />
        <p className="flex gap-1.5 text-xs text-muted"><Smartphone className="size-4 shrink-0" />iPhone ringtones can be up to 40 seconds. Most people pick 20 to 30.</p>
      </>}
    />
  )
}
