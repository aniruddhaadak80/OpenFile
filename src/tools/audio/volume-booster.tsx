import { useState } from 'react'
import { Volume2 } from 'lucide-react'
import { Label, Slider, Segmented, Switch } from '@/components/ui'
import { FxShell, AV_ACCEPT, runAudioFilter } from './_b4/FxShell'

type Mode = 'boost' | 'normalize' | 'peak'
export function volumeFilter(mode: Mode, db: number, lufs: number, limiter: boolean): string {
  if (mode === 'normalize') return `loudnorm=I=${lufs}:TP=-1.5:LRA=11`
  if (mode === 'peak') return 'dynaudnorm=f=250:g=15:p=0.95'
  return `volume=${db}dB${limiter ? ',alimiter=limit=0.97:attack=5:release=50' : ''}`
}

export default function VolumeBooster() {
  const [mode, setMode] = useState<Mode>('boost')
  const [db, setDb] = useState(6)
  const [lufs, setLufs] = useState(-14)
  const [limiter, setLimiter] = useState(true)
  return (
    <FxShell allowVideo accept={AV_ACCEPT} dropLabel="Drop an audio or video file" dropSub="Make quiet recordings louder, or even out loudness to a standard level. Works offline." actionLabel={mode === 'boost' ? `Boost by ${db} dB` : 'Normalize'} actionIcon={<Volume2 className="size-5" />} suffix={mode === 'boost' ? `${db > 0 ? '+' : ''}${db}dB` : 'normalized'}
      process={(ctx) => runAudioFilter(ctx, volumeFilter(mode, db, lufs, limiter))}>
      <div><Label>Mode</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'boost', label: 'Boost' }, { value: 'normalize', label: 'Loudness' }, { value: 'peak', label: 'Even out' }]} /></div>
      {mode === 'boost' && <>
        <Slider label="Volume change" value={db} onChange={setDb} min={-20} max={30} step={1} suffix=" dB" />
        <p className="text-xs text-muted">+6 dB sounds about twice as loud. Negative values make it quieter.</p>
        <Switch checked={limiter} onChange={setLimiter} label="Prevent clipping (limiter)" />
      </>}
      {mode === 'normalize' && <>
        <Slider label="Target loudness" value={lufs} onChange={setLufs} min={-30} max={-8} step={1} suffix=" LUFS" />
        <p className="text-xs text-muted">EBU R128 loudness. -14 suits Spotify and YouTube, -16 suits podcasts, -23 is broadcast TV.</p>
      </>}
      {mode === 'peak' && <p className="text-xs text-muted">Lifts quiet parts and tames loud parts, so speech with uneven volume is easy to follow.</p>}
    </FxShell>
  )
}
