import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Volume2 } from 'lucide-react'
import { Button, Field, Input, Select, ToolGrid, ErrorNote, cn } from '@/components/ui'
import { detectPitch, noteOf, closestString, freqOfMidi, midiName, TUNINGS } from '@/lib/b14/audio'
import { audioCtx } from '@/tools/video/_media/audio'
import { mediaError, stopStream } from '@/tools/video/_media/media'

export default function InstrumentTuner() {
  const [preset, setPreset] = useState('chromatic')
  const [a4, setA4] = useState(440)
  const [on, setOn] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [reading, setReading] = useState<{ freq: number; name: string; octave: number; cents: number; target?: string } | null>(null)
  const r = useRef<{ stream?: MediaStream; raf?: number; hist: number[]; ctx?: AudioContext; src?: MediaStreamAudioSourceNode }>({ hist: [] })
  const presetRef = useRef(preset); presetRef.current = preset
  const a4Ref = useRef(a4); a4Ref.current = a4

  const stop = () => { const s = r.current; if (s.raf) cancelAnimationFrame(s.raf); s.src?.disconnect(); stopStream(s.stream); s.stream = undefined; setOn(false); setReading(null) }
  useEffect(() => stop, [])
  const start = async () => {
    setErr(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      const ctx = audioCtx(); await ctx.resume()
      const src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser(); an.fftSize = 4096; src.connect(an)
      const buf = new Float32Array(an.fftSize)
      Object.assign(r.current, { stream, src, ctx, hist: [] })
      let last = 0
      const loop = (t: number) => {
        r.current.raf = requestAnimationFrame(loop)
        if (t - last < 60) return
        last = t
        an.getFloatTimeDomainData(buf)
        const { freq } = detectPitch(buf, ctx.sampleRate, { minHz: 30, maxHz: 1800 })
        const h = r.current.hist
        if (!freq) { if (h.length) h.shift(); if (!h.length) setReading(null); return }
        h.push(freq); if (h.length > 5) h.shift()
        const med = [...h].sort((x, y) => x - y)[Math.floor(h.length / 2)]
        const notes = TUNINGS[presetRef.current].notes
        if (notes.length) { const c = closestString(med, notes, a4Ref.current); const n = noteOf(freqOfMidi(c.midi, a4Ref.current), a4Ref.current); setReading({ freq: med, name: n.name, octave: n.octave, cents: c.cents, target: midiName(c.midi) }) }
        else { const n = noteOf(med, a4Ref.current); setReading({ freq: med, name: n.name, octave: n.octave, cents: n.cents }) }
      }
      r.current.raf = requestAnimationFrame(loop); setOn(true)
    } catch (e: any) { setErr(mediaError(e, 'microphone')) }
  }
  const ref = async (midi: number) => {
    const ctx = audioCtx(); await ctx.resume()
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = freqOfMidi(midi, a4)
    g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.6)
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 1.7)
  }
  const cents = reading?.cents ?? 0
  const inTune = reading && Math.abs(cents) <= 5
  const color = !reading ? 'var(--muted)' : inTune ? '#10B981' : Math.abs(cents) < 20 ? '#F5A524' : '#F97316'

  return (
    <ToolGrid
      main={<div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <div className="font-display text-8xl font-semibold" style={{ color }} aria-live="polite">{reading ? reading.name : '--'}<span className="text-3xl text-muted">{reading ? reading.octave : ''}</span></div>
        <div className="mt-1 text-sm text-muted">{reading ? `${reading.freq.toFixed(1)} Hz${reading.target ? `, closest string ${reading.target}` : ''}` : on ? 'Play a single note' : 'Press Start and allow the microphone'}</div>
        <div className="relative mx-auto mt-8 h-14 max-w-lg" aria-hidden>
          <div className="absolute inset-x-0 top-6 h-1.5 rounded-full bg-surface-2" />
          <div className="absolute left-1/2 top-2 h-10 w-0.5 -translate-x-1/2 bg-success" />
          {[-50, -25, 25, 50].map((c) => <div key={c} className="absolute top-4 h-6 w-px bg-border" style={{ left: `${50 + c}%` }} />)}
          <div className="absolute top-0 h-14 w-2 -translate-x-1/2 rounded-full transition-[left] duration-150" style={{ left: `${50 + Math.max(-50, Math.min(50, cents))}%`, background: color }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted max-w-lg mx-auto"><span>flat</span><span className="font-mono">{reading ? `${cents > 0 ? '+' : ''}${cents} cents` : ''}</span><span>sharp</span></div>
        {reading && <div className={cn('mt-4 text-sm font-medium', inTune ? 'text-success' : 'text-warn')}>{inTune ? 'In tune' : cents < 0 ? 'Tune up a little' : 'Tune down a little'}</div>}
        <div className="mt-6">{on ? <Button variant="secondary" icon={<MicOff className="size-4" />} onClick={stop}>Stop</Button> : <Button size="lg" icon={<Mic className="size-5" />} onClick={start}>Start tuner</Button>}</div>
        <ErrorNote error={err} />
      </div>}
      side={<>
        <Field label="Instrument"><Select value={preset} onChange={setPreset} options={Object.entries(TUNINGS).map(([v, t]) => ({ value: v, label: t.label }))} /></Field>
        {TUNINGS[preset].notes.length > 0 && <div><div className="mb-1.5 text-sm font-medium">Reference notes</div><div className="flex flex-wrap gap-1.5">{TUNINGS[preset].notes.map((m, i) => <Button key={i} size="sm" variant="outline" icon={<Volume2 className="size-3.5" />} onClick={() => ref(m)}>{midiName(m)}</Button>)}</div></div>}
        <Field label="Reference pitch A4 (Hz)"><Input type="number" min={415} max={466} value={a4} onChange={(e) => setA4(Math.min(466, Math.max(415, +e.target.value || 440)))} /></Field>
        <p className="text-xs text-muted">Sound from the microphone is analysed live in your browser and never recorded or sent anywhere. Use a quiet room and play one string at a time.</p>
      </>}
    />
  )
}
