import { useState } from 'react'
import { Gauge } from 'lucide-react'
import { Label, Slider, Segmented, Button } from '@/components/ui'
import { atempoChain } from '@/tools/video/_media/engine'
import { FxShell, AV_ACCEPT, runAudioFilter } from './_b4/FxShell'

type Mode = 'tempo' | 'pitch' | 'both'
/** Build the ffmpeg audio filter for tempo (x) and pitch (semitones). Pure, unit tested. */
export function speedPitchFilter(mode: Mode, speed: number, semis: number): string {
  const sr = 44100
  if (mode === 'tempo') return atempoChain(speed)
  const k = Math.pow(2, semis / 12)
  if (mode === 'pitch') return `aresample=${sr},asetrate=${Math.round(sr * k)},aresample=${sr},${atempoChain(1 / k)}`
  // both: vinyl style, speed and pitch move together
  return `aresample=${sr},asetrate=${Math.round(sr * speed)},aresample=${sr}`
}

export default function AudioSpeedPitch() {
  const [mode, setMode] = useState<Mode>('tempo')
  const [speed, setSpeed] = useState(1.25)
  const [semis, setSemis] = useState(0)
  const tempoChanges = mode !== 'pitch'
  return (
    <FxShell allowVideo accept={AV_ACCEPT} dropLabel="Drop an audio or video file" dropSub="Change speed without changing pitch, or shift pitch without changing speed. Works offline." actionLabel="Apply" actionIcon={<Gauge className="size-5" />} suffix={mode === 'pitch' ? `pitch${semis > 0 ? '+' : ''}${semis}` : `${speed}x`}
      process={(ctx) => {
        const af = speedPitchFilter(mode, speed, semis)
        const vf = ctx.isVideo && tempoChanges ? `setpts=PTS/${speed}` : undefined
        return runAudioFilter(ctx, af, { vf, outDuration: ctx.duration ? (tempoChanges ? ctx.duration / speed : ctx.duration) : undefined })
      }}>
      <div><Label>What to change</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'tempo', label: 'Speed' }, { value: 'pitch', label: 'Pitch' }, { value: 'both', label: 'Both' }]} /></div>
      {mode !== 'pitch' && <>
        <Slider label="Speed" value={speed} onChange={setSpeed} min={0.25} max={4} step={0.05} suffix="x" />
        <div className="flex flex-wrap gap-1.5">{[0.5, 0.75, 0.9, 1.1, 1.25, 1.5, 2].map((v) => <Button key={v} size="sm" variant={speed === v ? 'secondary' : 'outline'} onClick={() => setSpeed(v)}>{v}x</Button>)}</div>
      </>}
      {mode === 'pitch' && <>
        <Slider label="Pitch" value={semis} onChange={setSemis} min={-12} max={12} step={1} suffix=" semitones" />
        <div className="flex flex-wrap gap-1.5">{[-12, -5, -2, -1, 1, 2, 5, 12].map((v) => <Button key={v} size="sm" variant={semis === v ? 'secondary' : 'outline'} onClick={() => setSemis(v)}>{v > 0 ? '+' : ''}{v}</Button>)}</div>
        <p className="text-xs text-muted">12 semitones is one octave. Use +1 or -1 to change a song's key.</p>
      </>}
      {mode === 'both' && <p className="text-xs text-muted">Like a record player: faster also sounds higher, slower sounds deeper.</p>}
    </FxShell>
  )
}
