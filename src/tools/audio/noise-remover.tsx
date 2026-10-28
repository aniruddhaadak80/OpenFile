import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Label, Slider, Segmented, Switch } from '@/components/ui'
import { FxShell, AV_ACCEPT, runAudioFilter } from './_b4/FxShell'

type Level = 'light' | 'medium' | 'strong' | 'custom'
const LEVELS: Record<Exclude<Level, 'custom'>, number> = { light: 8, medium: 15, strong: 25 }

/** FFT denoise (afftdn) plus optional hum and rumble filters. Pure, unit tested. */
export function denoiseFilter(nr: number, floor: number, opts: { highpass: boolean; hum: '' | '50' | '60'; voice: boolean }) {
  const f: string[] = []
  if (opts.highpass) f.push('highpass=f=80')
  if (opts.hum) { const h = +opts.hum; f.push(`bandreject=f=${h}:width_type=q:w=8`, `bandreject=f=${h * 2}:width_type=q:w=8`, `bandreject=f=${h * 3}:width_type=q:w=8`) }
  f.push(`afftdn=nr=${nr}:nf=${floor}:tn=1`)
  if (opts.voice) f.push('lowpass=f=12000', 'acompressor=threshold=-20dB:ratio=3:attack=5:release=80:makeup=2')
  return f.join(',')
}

export default function NoiseRemover() {
  const [level, setLevel] = useState<Level>('medium')
  const [nr, setNr] = useState(15)
  const [floor, setFloor] = useState(-40)
  const [highpass, setHighpass] = useState(true)
  const [hum, setHum] = useState<'' | '50' | '60'>('')
  const [voice, setVoice] = useState(false)
  const amount = level === 'custom' ? nr : LEVELS[level]
  return (
    <FxShell allowVideo accept={AV_ACCEPT} dropLabel="Drop a noisy recording" dropSub="Reduce hiss, fan noise, hum and rumble in voice recordings and video sound. Nothing is uploaded." actionLabel="Remove noise" actionIcon={<Sparkles className="size-5" />} suffix="clean"
      process={(ctx) => runAudioFilter(ctx, denoiseFilter(amount, floor, { highpass, hum, voice }))}>
      <div><Label>Strength</Label><Segmented value={level} onChange={setLevel} options={[{ value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' }, { value: 'strong', label: 'Strong' }, { value: 'custom', label: 'Custom' }]} /></div>
      {level === 'custom' && <>
        <Slider label="Noise reduction" value={nr} onChange={setNr} min={1} max={60} suffix=" dB" />
        <Slider label="Noise floor" value={floor} onChange={setFloor} min={-80} max={-20} suffix=" dB" />
      </>}
      <div><Label>Electrical hum</Label><Segmented value={hum} onChange={setHum} options={[{ value: '', label: 'None' }, { value: '50', label: '50 Hz' }, { value: '60', label: '60 Hz' }]} /><p className="mt-1 text-xs text-muted">50 Hz in Europe, India and most of Asia. 60 Hz in the Americas.</p></div>
      <Switch checked={highpass} onChange={setHighpass} label="Cut low rumble (below 80 Hz)" />
      <Switch checked={voice} onChange={setVoice} label="Voice polish (gentle compression)" />
      <p className="text-xs text-muted">Strong settings can make voices sound watery. Start with Medium and listen to the result.</p>
    </FxShell>
  )
}
