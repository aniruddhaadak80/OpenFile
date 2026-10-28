import { useEffect, useMemo, useRef, useState } from 'react'
import { Captions, FileText, X, Cpu, Zap, Clock } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button, Dropzone, Label, Segmented, Select, Switch, ToolGrid, Progress, ErrorNote, CopyButton, Empty, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { baseName, downloadBlob, formatBytes } from '@/lib/files'
import { decodeAudioFile } from '@/tools/video/_media/audio'
import { fmtTime, useObjectUrl } from '@/tools/video/_media/media'
import { EngineLoading, FileBar, Note, Reveal } from '@/tools/video/_media/ui'
import { toSrt, toVtt, type Seg } from './_media/subtitles'

type ModelId = 'Xenova/whisper-tiny' | 'Xenova/whisper-base'
type Stage = 'idle' | 'decoding' | 'loading' | 'transcribing' | 'done' | 'error'

const LANGS: [string, string][] = [['auto', 'Auto-detect'], ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch'], ['ru', 'Russian'], ['uk', 'Ukrainian'], ['pl', 'Polish'], ['tr', 'Turkish'], ['ar', 'Arabic'], ['hi', 'Hindi'], ['bn', 'Bengali'], ['ur', 'Urdu'], ['ta', 'Tamil'], ['te', 'Telugu'], ['mr', 'Marathi'], ['gu', 'Gujarati'], ['kn', 'Kannada'], ['ml', 'Malayalam'], ['pa', 'Punjabi'], ['zh', 'Chinese'], ['ja', 'Japanese'], ['ko', 'Korean'], ['id', 'Indonesian'], ['vi', 'Vietnamese'], ['th', 'Thai'], ['ms', 'Malay'], ['fa', 'Persian'], ['he', 'Hebrew'], ['el', 'Greek'], ['sv', 'Swedish'], ['da', 'Danish'], ['no', 'Norwegian'], ['fi', 'Finnish'], ['cs', 'Czech'], ['ro', 'Romanian'], ['hu', 'Hungarian']]

export default function AudioTranscriber() {
  const [file, setFile] = useState<File | null>(null)
  const url = useObjectUrl(file)
  const [model, setModel] = useState<ModelId>('Xenova/whisper-tiny')
  const [lang, setLang] = useState('auto')
  const [task, setTask] = useState<'transcribe' | 'translate'>('transcribe')
  const hasGpu = typeof navigator !== 'undefined' && 'gpu' in navigator
  const [gpu, setGpu] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')
  const [status, setStatus] = useState('')
  const [load, setLoad] = useState<{ p: number; loaded: number; total: number }>({ p: 0, loaded: 0, total: 0 })
  const [prog, setProg] = useState<{ done: number; total: number }>({ done: 0, total: 1 })
  const [partial, setPartial] = useState('')
  const [segs, setSegs] = useState<Seg[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showTs, setShowTs] = useState(true)
  const [cur, setCur] = useState(0)
  const [duration, setDuration] = useState(0)
  const [startedAt, setStartedAt] = useState(0)
  const worker = useRef<Worker | null>(null)
  const player = useRef<HTMLAudioElement>(null)

  useEffect(() => () => worker.current?.terminate(), [])

  const getWorker = () => {
    if (!worker.current) worker.current = new Worker(new URL('./_media/transcribe.worker.ts', import.meta.url), { type: 'module' })
    return worker.current
  }

  const run = async () => {
    if (!file) return
    setError(null); setSegs([]); setPartial(''); setProg({ done: 0, total: 1 }); setStage('decoding'); setStatus('Decoding audio…')
    let pcm: Float32Array
    try {
      const buf = await decodeAudioFile(file, { sampleRate: 16000 })
      setDuration(buf.duration)
      if (buf.numberOfChannels === 1) pcm = buf.getChannelData(0).slice()
      else {
        const a = buf.getChannelData(0), b = buf.getChannelData(1); pcm = new Float32Array(a.length)
        for (let i = 0; i < a.length; i++) pcm[i] = (a[i] + b[i]) / 2
      }
    } catch (e: any) { setError(e?.message || 'Could not decode the audio.'); setStage('error'); return }

    const w = getWorker()
    setStage('loading'); setStatus('Loading model…'); setStartedAt(0)
    w.onmessage = (ev) => {
      const m = ev.data
      if (m.type === 'status') setStatus(m.text)
      else if (m.type === 'load') setLoad({ p: m.progress, loaded: m.loaded, total: m.total })
      else if (m.type === 'ready') { setStage('transcribing'); setStatus('Transcribing…'); setStartedAt(Date.now()) }
      else if (m.type === 'progress') setProg({ done: m.done, total: m.total })
      else if (m.type === 'partial') setPartial((p) => (p + m.text).slice(-600))
      else if (m.type === 'done') {
        const chunks: { timestamp: [number, number | null]; text: string }[] = m.result?.chunks ?? []
        const out: Seg[] = chunks.length
          ? chunks.map((c, i) => ({ start: c.timestamp[0] ?? 0, end: c.timestamp[1] ?? chunks[i + 1]?.timestamp[0] ?? pcm.length / 16000, text: c.text })).filter((s) => s.text.trim())
          : [{ start: 0, end: pcm.length / 16000, text: m.result?.text ?? '' }]
        setSegs(out); setStage('done')
        if (!out.length || !out.some((s) => s.text.trim())) toast('No speech was detected', 'info')
      } else if (m.type === 'error') {
        setError(/webgpu|gpu/i.test(m.message) ? `${m.message}. Try turning off GPU acceleration.` : m.message); setStage('error')
      }
    }
    w.onerror = (ev) => { setError(ev.message || 'The speech engine crashed. Try the tiny model or a shorter file.'); setStage('error') }
    w.postMessage({ type: 'run', audio: pcm, model, language: lang, task, device: gpu && hasGpu ? 'webgpu' : 'wasm' }, [pcm.buffer])
  }

  const cancel = () => { worker.current?.terminate(); worker.current = null; setStage(segs.length ? 'done' : 'idle'); toast('Cancelled', 'info') }
  const reset = () => { if (busy) cancel(); setFile(null); setSegs([]); setStage('idle'); setError(null); setPartial('') }

  const busy = stage === 'decoding' || stage === 'loading' || stage === 'transcribing'
  const plain = useMemo(() => segs.map((s) => s.text.trim()).join(' ').replace(/\s+/g, ' ').trim(), [segs])
  const withTs = useMemo(() => segs.map((s) => `[${fmtTime(s.start, 0)}] ${s.text.trim()}`).join('\n'), [segs])
  const name = file ? baseName(file.name) : 'transcript'
  const tProg = prog.total ? prog.done / prog.total : 0
  const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0
  const etaS = tProg > 0.05 && tProg < 1 ? elapsed / tProg - elapsed : 0
  const activeIdx = segs.findIndex((s) => cur >= s.start && cur < s.end)

  if (!file) return <Dropzone accept="audio/*,video/*,.mp3,.wav,.m4a,.ogg,.flac,.webm,.mp4,.mov,.mkv" onFiles={(f) => setFile(f[0])} label="Drop audio or video to transcribe" sub="Whisper AI runs on your device, the recording never leaves your browser." />

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <FileBar file={file} onReset={reset} extra={duration ? <span className="font-mono text-xs text-muted">{fmtTime(duration, 0)}</span> : null} />
          {url && <audio ref={player} src={url} controls className="w-full" onTimeUpdate={(e) => setCur((e.target as HTMLAudioElement).currentTime)} />}
          {busy && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
              {stage === 'decoding' && <><div className="text-sm">{status}</div><EngineLoading /></>}
              {stage === 'loading' && <>
                <div className="flex items-center gap-2 text-sm font-medium"><Cpu className="size-4 animate-pulse text-accent" />{status}</div>
                <Progress value={load.p} label={load.total ? `${formatBytes(load.loaded)} of ${formatBytes(load.total)} · cached after first use` : 'Preparing…'} />
              </>}
              {stage === 'transcribing' && <>
                <Progress value={tProg} label={<span>Transcribing · part {Math.min(prog.done + 1, prog.total)} of {prog.total}{etaS ? <span className="text-muted/80"> · ~{etaS < 60 ? `${Math.ceil(etaS)}s` : `${Math.ceil(etaS / 60)} min`} left</span> : null}</span>} />
                {partial && <p className="line-clamp-3 rounded-lg bg-surface-2/60 p-2 text-sm italic text-muted">…{partial.slice(-240)}</p>}
              </>}
              <Button variant="outline" size="sm" icon={<X className="size-4" />} onClick={cancel}>Cancel</Button>
            </motion.div>
          )}
          <ErrorNote error={error} />
          {segs.length > 0 ? (
            <Reveal k="t">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Switch checked={showTs} onChange={setShowTs} label="Timestamps" />
                  <div className="ml-auto flex flex-wrap gap-2">
                    <CopyButton text={() => (showTs ? withTs : plain)} />
                    <Button size="sm" variant="outline" icon={<FileText className="size-4" />} onClick={() => downloadBlob(showTs ? withTs : plain, `${name}.txt`, 'text/plain')}>TXT</Button>
                    <Button size="sm" variant="outline" icon={<Captions className="size-4" />} onClick={() => downloadBlob(toSrt(segs), `${name}.srt`, 'text/plain')}>SRT</Button>
                    <Button size="sm" variant="outline" icon={<Captions className="size-4" />} onClick={() => downloadBlob(toVtt(segs), `${name}.vtt`, 'text/vtt')}>VTT</Button>
                  </div>
                </div>
                <div className="max-h-[480px] overflow-y-auto rounded-2xl border border-border bg-surface p-2 scrollbar-thin">
                  {showTs ? segs.map((s, i) => (
                    <button key={i} onClick={() => { if (player.current) { player.current.currentTime = s.start; player.current.play() } }}
                      className={cn('flex w-full gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition cursor-pointer', i === activeIdx ? 'bg-accent/10' : 'hover:bg-surface-2')}>
                      <span className="mt-0.5 shrink-0 font-mono text-xs text-accent">{fmtTime(s.start, 0)}</span><span className="leading-relaxed">{s.text.trim()}</span>
                    </button>
                  )) : <p className="whitespace-pre-wrap p-2 text-sm leading-relaxed">{plain}</p>}
                </div>
                <p className="text-xs text-muted">{plain.split(/\s+/).filter(Boolean).length} words · click a line to jump there</p>
              </div>
            </Reveal>
          ) : !busy && stage !== 'error' ? <Empty>Pick a model and language, then press Transcribe.</Empty> : null}
        </>}
        side={<>
          <div>
            <Label>Model</Label>
            <Segmented value={model} onChange={setModel} options={[{ value: 'Xenova/whisper-tiny', label: 'Tiny · fast' }, { value: 'Xenova/whisper-base', label: 'Base · accurate' }]} />
            <p className="mt-1.5 text-xs text-muted">{model.endsWith('tiny') ? '~40 MB download, good for clear speech.' : '~80 MB download, better with accents & noise.'} Downloaded once, then cached.</p>
          </div>
          <div><Label>Language</Label><Select value={lang} onChange={setLang} options={LANGS.map(([v, l]) => ({ value: v, label: l }))} /></div>
          <div><Label>Task</Label><Segmented value={task} onChange={setTask} options={[{ value: 'transcribe', label: 'Transcribe' }, { value: 'translate', label: 'Translate → English' }]} /></div>
          {hasGpu && <div><Switch checked={gpu} onChange={setGpu} label={<span className="inline-flex items-center gap-1.5"><Zap className="size-4 text-warn" />GPU acceleration (WebGPU)</span>} /><p className="mt-1 text-xs text-muted">Much faster on supported GPUs; turn off if it fails.</p></div>}
          <Button size="lg" className="w-full" icon={<Captions className="size-5" />} onClick={run} loading={busy}>{segs.length ? 'Transcribe again' : 'Transcribe'}</Button>
          {duration > 1200 && !gpu && <Note tone="warn"><Clock className="mr-1 inline size-3" />Long recording, on CPU this can take a while. Keep the tab open.</Note>}
          <Note>Runs in a background thread with Whisper by OpenAI, so the page stays responsive.</Note>
        </>}
      />
    </div>
  )
}
