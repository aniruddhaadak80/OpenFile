import { useEffect, useState } from 'react'
import { Ear, X, Cpu, Zap } from 'lucide-react'
import { Button, Dropzone, Field, Progress, Segmented, Switch, ToolGrid, ErrorNote, Label } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { TopBar, StatusLine } from '@/lib/b4/ui'
import { hasWebGPU } from '@/lib/b4/ai'
import { decodeAudioFile } from '@/tools/video/_media/audio'
import { classifySound, cancelAudioAi, withCpuFallback, SOUND_MODEL } from '@/lib/b14/ai'
import { DlButton, toCsv, PALETTE } from '@/lib/bcat/kit'
import { Tile } from '@/lib/b14/ui'

type Seg = { start: number; labels: { label: string; score: number }[] }
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

async function to16kMono(f: File): Promise<Float32Array> {
  const b = await decodeAudioFile(f)
  const len = Math.ceil(b.duration * 16000)
  const ctx = new OfflineAudioContext(1, Math.max(1, len), 16000)
  const src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start()
  return (await ctx.startRendering()).getChannelData(0)
}

export default function SoundClassifier() {
  const [file, setFile] = useState<File | null>(null)
  const [win, setWin] = useState('5')
  const [gpuOk, setGpuOk] = useState(false)
  const [gpu, setGpu] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'decode' | 'load' | 'run'>('idle')
  const [load, setLoad] = useState<{ l: number; t: number } | null>(null)
  const [prog, setProg] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [segs, setSegs] = useState<Seg[] | null>(null)
  useEffect(() => { hasWebGPU().then((ok) => { setGpuOk(ok); setGpu(ok) }) }, [])
  const go = async () => {
    if (!file) return
    setErr(null); setSegs(null); setPhase('decode'); setStatus('Decoding audio'); setProg(null)
    try {
      const pcm = await to16kMono(file)
      if (pcm.length / 16000 > 3600) throw new Error('Up to one hour of audio at a time.')
      setPhase('load')
      const res = await withCpuFallback(gpu && gpuOk ? 'webgpu' : 'wasm', (device) => classifySound(pcm, { device, win: +win, topK: 5 }, { onLoad: (l, t) => setLoad({ l, t }), onStatus: setStatus, onReady: () => { setPhase('run'); setLoad(null); setStatus('Listening') }, onProgress: (d, t) => { setProg(d / t); setStatus(`Listening: ${d} of ${t} parts`) } }), (m) => setStatus(m))
      setSegs(res)
    } catch (e: any) { if (e?.name !== 'CancelledError') setErr(e?.message || String(e)) } finally { setPhase('idle'); setLoad(null); setProg(null) }
  }
  const cancel = () => { cancelAudioAi(); setPhase('idle'); setLoad(null); setProg(null) }
  const totals = (() => { const m = new Map<string, number>(); for (const s of segs ?? []) for (const l of s.labels.slice(0, 3)) m.set(l.label, Math.max(m.get(l.label) ?? 0, l.score)); return [...m.entries()].filter(([k]) => k !== 'Silence').sort((a, b) => b[1] - a[1]).slice(0, 12) })()
  const colorOf = (label: string) => PALETTE[Math.abs([...label].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % PALETTE.length]
  if (!file) return <Dropzone accept="audio/*,video/*" onFiles={(f) => setFile(f[0])} label="Drop an audio or video file" sub="Find out what can be heard: speech, music, dogs, traffic, alarms, applause and over 500 other sounds, with a timeline. Runs on your device." />
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); setSegs(null) }} />
        {phase !== 'idle' && <div className="space-y-2 rounded-xl border border-border bg-surface-2/50 p-3" role="status" aria-live="polite">
          {load && load.t > 0 ? <Progress value={load.l / load.t} label={`Downloading model: ${formatBytes(load.l)} of ${formatBytes(load.t)}`} /> : prog != null ? <Progress value={prog} label={status} /> : <StatusLine text={status || 'Working'} />}
          <Button variant="outline" size="sm" className="w-full" icon={<X className="size-4" />} onClick={cancel}>Cancel</Button>
        </div>}
        <ErrorNote error={err} />
        {segs && <>
          <Label>Sounds heard</Label>
          <div className="flex flex-wrap gap-1.5">{totals.map(([l, s]) => <span key={l} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"><span className="size-2 rounded-full" style={{ background: colorOf(l) }} />{l} <span className="text-muted">{Math.round(s * 100)}%</span></span>)}</div>
          <Label hint={`every ${win} s`}>Timeline</Label>
          <div className="scrollbar-thin max-h-[440px] space-y-1 overflow-auto">{segs.map((s) => <div key={s.start} className="flex items-center gap-3 rounded-lg bg-surface px-3 py-1.5 text-xs"><span className="w-12 font-mono text-muted">{mmss(s.start)}</span><div className="flex flex-1 flex-wrap gap-1">{s.labels.filter((l, i) => i === 0 || l.score > 0.15).slice(0, 3).map((l) => <span key={l.label} className="rounded px-1.5 py-0.5" style={{ background: colorOf(l.label) + '33' }}>{l.label} {Math.round(l.score * 100)}%</span>)}</div></div>)}</div>
        </>}
      </>}
      side={<>
        <div><Label>AI model</Label><div className="rounded-xl border border-border bg-surface-2/50 px-3 py-2 text-sm">{SOUND_MODEL.label}</div><p className="mt-1 text-xs text-muted">Download {SOUND_MODEL.size}, once. Then it runs offline, and the audio never leaves this device.</p></div>
        {gpuOk ? <Switch checked={gpu} onChange={setGpu} label={<span className="inline-flex items-center gap-1.5"><Zap className="size-3.5 text-accent" />Use GPU (WebGPU)</span>} /> : <p className="flex gap-1.5 text-xs text-muted"><Cpu className="size-4 shrink-0" />No WebGPU here, so it runs on the CPU in the background. Slower, but the page stays responsive.</p>}
        <Field label="Check every"><Segmented value={win} onChange={setWin} options={[{ value: '2', label: '2 s' }, { value: '5', label: '5 s' }, { value: '10', label: '10 s' }]} /></Field>
        <Button className="w-full" size="lg" icon={<Ear className="size-5" />} loading={phase !== 'idle'} onClick={go}>Identify sounds</Button>
        {segs && <div className="grid grid-cols-2 gap-2"><Tile label="Parts" value={segs.length} /><Tile label="Kinds" value={totals.length} /></div>}
        {segs && <DlButton className="w-full" name="sounds.csv" mime="text/csv" data={() => toCsv([['start', 'label', 'score'], ...segs.flatMap((s) => s.labels.map((l) => [mmss(s.start), l.label, l.score.toFixed(3)]))])}>Timeline as CSV</DlButton>}
      </>}
    />
  )
}
