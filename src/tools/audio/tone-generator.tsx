import { useEffect, useRef, useState } from 'react'
import { Play, Square, Download, AudioWaveform } from 'lucide-react'
import { Button, Field, Input, Segmented, Select, Slider, ToolGrid, Tabs } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { synth, wav16, noteOf, type Wave, type Noise, type ToneSpec } from '@/lib/b14/audio'
import { audioCtx } from '@/tools/video/_media/audio'

type Kind = ToneSpec['kind']
const PRESETS = [440, 432, 1000, 50, 100, 10000, 15000, 17400]

export default function ToneGenerator() {
  const [kind, setKind] = useState<Kind>('tone')
  const [wave, setWave] = useState<Wave>('sine')
  const [freq, setFreq] = useState(440)
  const [freq2, setFreq2] = useState(8000)
  const [noise, setNoise] = useState<Noise>('pink')
  const [beat, setBeat] = useState(10)
  const [digits, setDigits] = useState('0123456789')
  const [seconds, setSeconds] = useState(5)
  const [vol, setVol] = useState(30)
  const [log, setLog] = useState(true)
  const [playing, setPlaying] = useState(false)
  const node = useRef<{ src: AudioScheduledSourceNode; osc?: OscillatorNode; gain: GainNode } | null>(null)

  const spec = (sr: number): ToneSpec => ({ kind, wave, freq, freq2, seconds, volume: vol / 100, sampleRate: sr, noise, sweepLog: log, beat, digits, fade: 0.02 })
  const stop = () => { try { node.current?.src.stop() } catch { /* already stopped */ } node.current = null; setPlaying(false) }
  useEffect(() => stop, [])
  // live updates for a plain tone
  useEffect(() => { const n = node.current; if (n?.osc) { n.osc.frequency.setTargetAtTime(freq, n.osc.context.currentTime, 0.01); n.osc.type = wave } if (n) n.gain.gain.setTargetAtTime(vol / 100, n.gain.context.currentTime, 0.02) }, [freq, wave, vol])
  const play = async () => {
    stop()
    const ctx = audioCtx(); await ctx.resume()
    const gain = ctx.createGain(); gain.connect(ctx.destination)
    if (kind === 'tone') {
      const osc = ctx.createOscillator(); osc.type = wave; osc.frequency.value = freq
      gain.gain.setValueAtTime(0, ctx.currentTime); gain.gain.linearRampToValueAtTime(vol / 100, ctx.currentTime + 0.03)
      osc.connect(gain); osc.start(); node.current = { src: osc, osc, gain }
    } else {
      const [L, R] = synth({ ...spec(ctx.sampleRate), volume: 1, seconds: kind === 'noise' || kind === 'binaural' ? 10 : seconds }, 7)
      const buf = ctx.createBuffer(2, L.length, ctx.sampleRate); buf.copyToChannel(L as Float32Array<ArrayBuffer>, 0); buf.copyToChannel(R as Float32Array<ArrayBuffer>, 1)
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = kind === 'noise' || kind === 'binaural'
      gain.gain.value = vol / 100; src.connect(gain); src.start(); src.onended = () => { if (node.current?.src === src) setPlaying(false) }
      node.current = { src, gain }
    }
    setPlaying(true)
  }
  const save = () => {
    const sr = 44100
    const [L, R] = synth(spec(sr), 7)
    const stereo = kind === 'binaural'
    const name = kind === 'tone' ? `tone-${freq}hz-${wave}` : kind === 'sweep' ? `sweep-${freq}-${freq2}hz` : kind === 'noise' ? `${noise}-noise` : kind === 'binaural' ? `binaural-${freq}hz-${beat}hz` : `dtmf-${digits}`
    downloadBlob(new Blob([wav16(stereo ? [L, R] : [L], sr) as BlobPart], { type: 'audio/wav' }), `${name}.wav`)
  }
  const note = freq > 0 ? noteOf(freq) : null

  return (
    <ToolGrid
      main={<>
        <Tabs value={kind} onChange={(k) => { stop(); setKind(k) }} tabs={[{ value: 'tone', label: 'Tone' }, { value: 'sweep', label: 'Sweep' }, { value: 'noise', label: 'Noise' }, { value: 'binaural', label: 'Binaural' }, { value: 'dtmf', label: 'Phone keys' }]} />
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          {kind === 'tone' && <>
            <div className="font-display text-5xl font-semibold tabular-nums">{freq.toLocaleString()} <span className="text-2xl text-muted">Hz</span></div>
            {note && <div className="mt-1 text-sm text-muted">Closest note {note.name}{note.octave} ({note.cents > 0 ? '+' : ''}{note.cents} cents)</div>}
            <input type="range" aria-label="Frequency (log scale)" min={0} max={1000} value={Math.round(1000 * Math.log(freq / 20) / Math.log(1000))} onChange={(e) => setFreq(Math.round(20 * Math.pow(1000, +e.target.value / 1000)))} className="mt-5 w-full accent-[var(--accent)]" />
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">{PRESETS.map((p) => <Button key={p} size="sm" variant={p === freq ? 'secondary' : 'ghost'} onClick={() => setFreq(p)}>{p >= 1000 ? p / 1000 + ' kHz' : p + ' Hz'}</Button>)}</div>
          </>}
          {kind === 'sweep' && <div className="font-display text-3xl font-semibold">{freq} Hz to {freq2} Hz in {seconds} s</div>}
          {kind === 'noise' && <div className="font-display text-3xl font-semibold capitalize">{noise} noise</div>}
          {kind === 'binaural' && <div><div className="font-display text-3xl font-semibold">{freq} Hz left, {freq + beat} Hz right</div><p className="mt-2 text-sm text-muted">Use headphones. Your brain hears a {beat} Hz beat between the two ears.</p></div>}
          {kind === 'dtmf' && <div className="font-mono text-3xl tracking-widest">{digits || 'Type keys'}</div>}
        </div>
        <p className="text-xs text-muted">Start with low volume. Very high or very low tones can be hard to hear but still loud for speakers and ears.</p>
      </>}
      side={<>
        {(kind === 'tone' || kind === 'sweep') && <Field label="Wave"><Segmented value={wave} onChange={setWave} options={[{ value: 'sine', label: 'Sine' }, { value: 'square', label: 'Square' }, { value: 'sawtooth', label: 'Saw' }, { value: 'triangle', label: 'Triangle' }]} /></Field>}
        {(kind === 'tone' || kind === 'sweep' || kind === 'binaural') && <Field label={kind === 'sweep' ? 'Start frequency (Hz)' : kind === 'binaural' ? 'Carrier (Hz)' : 'Frequency (Hz)'}><Input type="number" min={1} max={22000} value={freq} onChange={(e) => setFreq(Math.min(22000, Math.max(1, +e.target.value || 1)))} /></Field>}
        {kind === 'sweep' && <><Field label="End frequency (Hz)"><Input type="number" min={1} max={22000} value={freq2} onChange={(e) => setFreq2(Math.min(22000, Math.max(1, +e.target.value || 1)))} /></Field><Field label="Curve"><Segmented value={log ? 'log' : 'lin'} onChange={(v) => setLog(v === 'log')} options={[{ value: 'log', label: 'Logarithmic' }, { value: 'lin', label: 'Linear' }]} /></Field></>}
        {kind === 'noise' && <Field label="Colour"><Select value={noise} onChange={setNoise} options={[{ value: 'white', label: 'White (all frequencies)' }, { value: 'pink', label: 'Pink (balanced, like rain)' }, { value: 'brown', label: 'Brown (deep rumble)' }]} /></Field>}
        {kind === 'binaural' && <Slider label="Beat (Hz)" value={beat} onChange={setBeat} min={1} max={40} />}
        {kind === 'dtmf' && <Field label="Keys (0 to 9, *, #, A to D)"><Input value={digits} onChange={(e) => setDigits(e.target.value.toUpperCase().replace(/[^0-9A-D*#]/g, ''))} className="font-mono" /></Field>}
        {kind !== 'dtmf' && <Field label="Length for download (seconds)"><Input type="number" min={1} max={600} value={seconds} onChange={(e) => setSeconds(Math.min(600, Math.max(1, +e.target.value || 1)))} /></Field>}
        <Slider label="Volume" value={vol} onChange={setVol} min={0} max={100} suffix="%" />
        <div className="grid grid-cols-2 gap-2">
          {playing ? <Button variant="secondary" icon={<Square className="size-4" />} onClick={stop}>Stop</Button> : <Button icon={<Play className="size-4" />} onClick={play}>Play</Button>}
          <Button variant="outline" icon={<Download className="size-4" />} onClick={save}>WAV</Button>
        </div>
        <p className="flex gap-1.5 text-xs text-muted"><AudioWaveform className="size-4 shrink-0" />Made by your browser, 44.1 kHz 16-bit WAV.</p>
      </>}
    />
  )
}
