import { useEffect, useRef, useState } from 'react'
import { SlidersVertical, Play, Pause, RotateCcw } from 'lucide-react'
import { Button, Label, Select, Switch } from '@/components/ui'
import { useObjectUrl } from '@/tools/video/_media/media'
import { FxShell, AV_ACCEPT, runAudioFilter, isVideoFile } from './_b4/FxShell'

export const BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
const PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass boost': [7, 6, 4.5, 2, 0, 0, 0, 0, 0, 0],
  'Bass cut': [-8, -6, -4, -2, 0, 0, 0, 0, 0, 0],
  'Treble boost': [0, 0, 0, 0, 0, 1, 2.5, 4, 5.5, 6],
  'Vocal clarity': [-3, -2, -1, 0, 2, 3.5, 4, 3, 1, 0],
  Podcast: [-6, -3, 0, 1, 2, 3, 3, 2, 0, -2],
  Rock: [5, 4, 2, -1, -2, -1, 2, 3.5, 4.5, 5],
  Pop: [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2],
  Jazz: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3],
  Classical: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4],
  Electronic: [6, 5, 1, 0, -2, 1, 0, 2, 4, 5],
  'Loudspeaker small': [-10, -6, -2, 1, 2, 2, 1, 0, -1, -2],
}
export const eqFilter = (gains: number[], preamp: number) => [preamp ? `volume=${preamp}dB` : '', ...BANDS.map((f, i) => (gains[i] ? `equalizer=f=${f}:width_type=o:width=1:g=${gains[i]}` : '')), 'alimiter=limit=0.98'].filter(Boolean).join(',')

function LivePlayer({ file, gains, preamp, bypass }: { file: File; gains: number[]; preamp: number; bypass: boolean }) {
  const url = useObjectUrl(file)
  const el = useRef<HTMLMediaElement | null>(null)
  const graph = useRef<{ ctx: AudioContext; filters: BiquadFilterNode[]; pre: GainNode } | null>(null)
  const [playing, setPlaying] = useState(false)
  const ensure = () => {
    if (graph.current || !el.current) return
    const ctx = new AudioContext()
    const src = ctx.createMediaElementSource(el.current)
    const pre = ctx.createGain()
    const filters = BANDS.map((f, i) => { const b = ctx.createBiquadFilter(); b.type = i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking'; b.frequency.value = f; b.Q.value = 1.4; return b })
    src.connect(pre); let n: AudioNode = pre; for (const f of filters) { n.connect(f); n = f } n.connect(ctx.destination)
    graph.current = { ctx, filters, pre }
  }
  useEffect(() => {
    const g = graph.current; if (!g) return
    g.filters.forEach((f, i) => f.gain.setTargetAtTime(bypass ? 0 : gains[i], g.ctx.currentTime, 0.02))
    g.pre.gain.setTargetAtTime(bypass ? 1 : Math.pow(10, preamp / 20), g.ctx.currentTime, 0.02)
  }, [gains, preamp, bypass, playing])
  useEffect(() => () => { graph.current?.ctx.close() }, [])
  const toggle = async () => { ensure(); await graph.current?.ctx.resume(); if (el.current!.paused) { await el.current!.play(); setPlaying(true) } else { el.current!.pause(); setPlaying(false) } }
  const video = isVideoFile(file)
  return (
    <div className="space-y-2 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2"><Label className="mb-0 flex-1">Live preview{bypass ? ' (original)' : ' (with EQ)'}</Label><Button size="sm" icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={toggle}>{playing ? 'Pause' : 'Play'}</Button></div>
      {video ? <video ref={(v) => { el.current = v }} src={url ?? undefined} controls onPlay={() => { ensure(); graph.current?.ctx.resume(); setPlaying(true) }} onPause={() => setPlaying(false)} className="max-h-[40vh] w-full rounded-xl bg-black" />
        : <audio ref={(a) => { el.current = a }} src={url ?? undefined} controls onPlay={() => { ensure(); graph.current?.ctx.resume(); setPlaying(true) }} onPause={() => setPlaying(false)} className="w-full" />}
      <p className="text-xs text-muted">Move the sliders while it plays to hear the change right away.</p>
    </div>
  )
}

export default function AudioEqualizer() {
  const [gains, setGains] = useState<number[]>(PRESETS['Bass boost'])
  const [preset, setPreset] = useState('Bass boost')
  const [preamp, setPreamp] = useState(-3)
  const [bypass, setBypass] = useState(false)
  const set = (i: number, v: number) => { setGains((g) => g.map((x, j) => (j === i ? v : x))); setPreset('Custom') }
  return (
    <FxShell allowVideo accept={AV_ACCEPT} dropLabel="Drop audio to equalize" dropSub="10-band equalizer with bass boost, vocal and treble presets, and a live preview." actionLabel="Apply EQ and export" actionIcon={<SlidersVertical className="size-5" />} suffix="eq"
      main={(file) => <LivePlayer file={file} gains={gains} preamp={preamp} bypass={bypass} />}
      process={(ctx) => runAudioFilter(ctx, eqFilter(gains, preamp))}>
      <div><Label>Preset</Label><Select aria-label="Preset" value={preset} onChange={(p) => { setPreset(p); if (PRESETS[p]) setGains(PRESETS[p]) }} options={[...Object.keys(PRESETS), ...(preset === 'Custom' ? ['Custom'] : [])]} /></div>
      <div>
        <Label hint={<button className="inline-flex cursor-pointer items-center gap-1 text-muted hover:text-fg" onClick={() => { setGains(PRESETS.Flat); setPreset('Flat') }}><RotateCcw className="size-3" />Reset</button>}>Bands (dB)</Label>
        <div className="flex h-44 items-stretch justify-between gap-1">
          {BANDS.map((f, i) => (
            <div key={f} className="flex flex-1 flex-col items-center gap-1">
              <span className="font-mono text-[10px] text-muted">{gains[i] > 0 ? '+' : ''}{gains[i]}</span>
              <input type="range" min={-12} max={12} step={0.5} value={gains[i]} onChange={(e) => set(i, +e.target.value)} aria-label={`${f} Hz`}
                className="flex-1 cursor-pointer accent-[var(--accent)] [writing-mode:vertical-lr] [direction:rtl]" style={{ width: 18 }} />
              <span className="font-mono text-[9px] text-muted">{f >= 1000 ? f / 1000 + 'k' : f}</span>
            </div>
          ))}
        </div>
      </div>
      <div><Label hint={`${preamp} dB`}>Preamp</Label><input type="range" min={-12} max={6} step={0.5} value={preamp} onChange={(e) => setPreamp(+e.target.value)} className="w-full cursor-pointer accent-[var(--accent)]" aria-label="Preamp" /><p className="mt-1 text-xs text-muted">Lower the preamp when boosting, so loud parts do not distort.</p></div>
      <Switch checked={bypass} onChange={setBypass} label="Compare with original (bypass)" />
    </FxShell>
  )
}
