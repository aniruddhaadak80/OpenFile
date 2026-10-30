import { useState } from 'react'
import { Music } from 'lucide-react'
import { Button, Dropzone, Field, Label, ResultCard, Segmented, Select, ToolGrid, cn } from '@/components/ui'
import { baseName, formatBytes } from '@/lib/files'
import { ffRun, extFromBlob } from './_media/engine'
import { audioCodecArgs } from './_media/audio'
import { fmtTime, useMediaJob, useObjectUrl, useVideoMeta } from './_media/media'
import { FileBar, JobPanel, Reveal, VideoStage } from './_media/ui'

type Fmt = 'mp3' | 'wav' | 'm4a' | 'ogg'
const INFO: Record<Fmt, { label: string; sub: string; lossy: boolean }> = {
  mp3: { label: 'MP3', sub: 'Plays everywhere', lossy: true },
  m4a: { label: 'AAC', sub: '.m4a · best quality per MB', lossy: true },
  ogg: { label: 'OGG', sub: 'Vorbis · open format', lossy: true },
  wav: { label: 'WAV', sub: 'Uncompressed, lossless', lossy: false },
}

export default function ExtractAudio() {
  const [file, setFile] = useState<File | null>(null)
  const { url, meta } = useVideoMeta(file)
  const [fmt, setFmt] = useState<Fmt>('mp3')
  const [br, setBr] = useState('192')
  const [sr, setSr] = useState('original')
  const [result, setResult] = useState<Blob | null>(null)
  const resultUrl = useObjectUrl(result)
  const job = useMediaJob()

  const reset = () => { if (job.busy) job.cancel(); setFile(null); setResult(null); job.reset() }
  const dur = meta?.duration || 0
  const est = dur && INFO[fmt].lossy ? (+br * 1000 * dur) / 8 : dur ? dur * (sr === 'original' ? 48000 : +sr) * 4 : 0

  const go = () => job.run(async ({ setProgress, setLabel }) => {
    if (!file) return
    setResult(null); setLabel('Extracting audio…')
    const input = 'in' + extFromBlob(file), out = `out.${fmt}`
    const logs: string[] = []
    let blob: Blob
    try {
      blob = await ffRun({ inputs: [{ name: input, file }], args: ['-i', input, '-map', '0:a:0', '-vn', ...(sr !== 'original' ? ['-ar', sr] : []), ...audioCodecArgs(fmt, +br), out], output: out, duration: dur || undefined, onProgress: setProgress, onLog: (l) => { logs.push(l); if (logs.length > 400) logs.shift() } })
    } catch (e: any) {
      const streams = logs.filter((l) => /Stream #0:\d+/.test(l))
      const noAudio = /no matching track|no audio/i.test(String(e?.message)) || logs.some((l) => /matches no streams|does not contain any stream/i.test(l)) || (streams.length > 0 && !streams.some((l) => /Audio:/.test(l)))
      if (noAudio) throw new Error('This video has no sound track to extract.')
      throw e
    }
    setResult(blob)
  })

  if (!file) return <Dropzone accept="video/*,.mkv,.avi,.mov,.m4v,.flv,.wmv" onFiles={(f) => setFile(f[0])} label="Drop a video to extract its audio" sub="Get the soundtrack as MP3, AAC, OGG or WAV, no upload." />

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <FileBar file={file} onReset={reset} extra={dur ? <span className="font-mono text-xs text-muted">{fmtTime(dur, 0)}</span> : null} />
          <VideoStage src={url} playable={meta?.playable !== false} />
        </>}
        side={<>
          <div>
            <Label>Format</Label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(INFO) as Fmt[]).map((f) => (
                <button key={f} onClick={() => setFmt(f)} className={cn('rounded-xl border px-3 py-2 text-left transition cursor-pointer', fmt === f ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50')}>
                  <div className="text-sm font-semibold">{INFO[f].label}</div><div className="text-[11px] text-muted">{INFO[f].sub}</div>
                </button>
              ))}
            </div>
          </div>
          {INFO[fmt].lossy && <div><Label>Bitrate</Label><Segmented value={br} onChange={setBr} options={['96', '128', '192', '256', '320'].map((v) => ({ value: v, label: v }))} /><p className="mt-1 text-xs text-muted">kbps · 192 is transparent for most listeners.</p></div>}
          <Field label="Sample rate"><Select value={sr} onChange={setSr} options={[{ value: 'original', label: 'Keep original' }, { value: '48000', label: '48 kHz' }, { value: '44100', label: '44.1 kHz (CD)' }, { value: '22050', label: '22 kHz (voice)' }]} /></Field>
          {est > 0 && <div className="flex justify-between rounded-xl bg-surface-2/60 px-3 py-2 text-sm"><span className="text-muted">Estimated size</span><span className="font-mono">≈{formatBytes(est)}</span></div>}
          <Button size="lg" className="w-full" icon={<Music className="size-5" />} onClick={go} loading={job.busy}>Extract audio</Button>
          <JobPanel job={job} onRetry={go} />
        </>}
      />
      {result && resultUrl && (
        <Reveal k={resultUrl}>
          <ResultCard blob={result} filename={`${baseName(file.name)}.${fmt}`} title="Audio extracted" onReset={reset}>
            <audio src={resultUrl} controls className="w-full" />
          </ResultCard>
        </Reveal>
      )}
    </div>
  )
}
