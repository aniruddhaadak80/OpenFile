import { useEffect, useRef, useState } from 'react'
import { Play, Square, Download, Hand, Minus, Plus } from 'lucide-react'
import { Button, Field, Input, Segmented, Select, Slider, ToolGrid, cn } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { clickTrack, wav16, tapBpm } from '@/lib/b14/audio'
import { audioCtx } from '@/tools/video/_media/audio'

const NAMES: [number, string][] = [[40, 'Grave'], [60, 'Largo'], [66, 'Adagio'], [76, 'Andante'], [108, 'Moderato'], [120, 'Allegro'], [168, 'Presto'], [200, 'Prestissimo']]
const tempoName = (b: number) => NAMES.reduce((n, [v, s]) => (b >= v ? s : n), 'Grave')

export default function Metronome() {
  const [bpm, setBpm] = useState(100)
  const [beats, setBeats] = useState(4)
  const [sub, setSub] = useState(1)
  const [accents, setAccents] = useState<boolean[]>([true, false, false, false])
  const [running, setRunning] = useState(false)
  const [beat, setBeat] = useState(-1)
  const [bars, setBars] = useState(16)
  const taps = useRef<number[]>([])
  const st = useRef({ next: 0, i: 0, timer: 0 as any, bpm, beats, sub, accents })
  st.current.bpm = bpm; st.current.beats = beats; st.current.sub = sub; st.current.accents = accents
  useEffect(() => setAccents((a) => Array.from({ length: beats }, (_, i) => a[i] ?? i === 0)), [beats])

  const click = (ctx: AudioContext, t: number, kind: 0 | 1 | 2) => {
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.frequency.value = kind === 2 ? 1600 : kind === 1 ? 1000 : 800
    g.gain.setValueAtTime(kind === 0 ? 0.25 : kind === 2 ? 0.9 : 0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.06)
  }
  const start = async () => {
    const ctx = audioCtx(); await ctx.resume()
    const s = st.current; s.next = ctx.currentTime + 0.08; s.i = 0
    const tick = () => {
      while (s.next < ctx.currentTime + 0.12) {
        const step = s.i % (s.beats * s.sub), b = Math.floor(step / s.sub), isBeat = step % s.sub === 0
        click(ctx, s.next, isBeat ? (s.accents[b] ? 2 : 1) : 0)
        if (isBeat) { const at = s.next; setTimeout(() => setBeat(b), Math.max(0, (at - ctx.currentTime) * 1000)) }
        s.next += 60 / s.bpm / s.sub; s.i++
      }
    }
    tick(); s.timer = setInterval(tick, 25); setRunning(true)
  }
  const stop = () => { clearInterval(st.current.timer); setRunning(false); setBeat(-1) }
  useEffect(() => () => clearInterval(st.current.timer), [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest('input,textarea,select')) return; if (e.code === 'Space') { e.preventDefault(); running ? stop() : start() } else if (e.key === 't' || e.key === 'T') tap(); else if (e.key === 'ArrowUp') setBpm((b) => Math.min(300, b + (e.shiftKey ? 5 : 1))); else if (e.key === 'ArrowDown') setBpm((b) => Math.max(20, b - (e.shiftKey ? 5 : 1))) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })
  const tap = () => { const now = performance.now(); const t = taps.current; const n = (t.length && now - t[t.length - 1] > 2500 ? [] : t).concat(now); taps.current = n; const b = tapBpm(n); if (b) setBpm(Math.round(Math.min(300, Math.max(20, b)))) }
  const save = () => { const sr = 44100; const data = clickTrack(bpm, beats, bars, sr, sub, accents); downloadBlob(new Blob([wav16([data], sr) as BlobPart], { type: 'audio/wav' }), `click-${bpm}bpm-${beats}-4.wav`) }

  return (
    <ToolGrid
      main={<div className="rounded-2xl border border-border bg-surface p-6">
        <div className="text-center">
          <div className="font-display text-7xl font-semibold tabular-nums">{bpm}</div>
          <div className="text-sm text-muted">BPM, {tempoName(bpm)}</div>
        </div>
        <div className="mx-auto mt-6 flex max-w-md items-center gap-3">
          <Button variant="outline" size="sm" aria-label="Slower" onClick={() => setBpm((b) => Math.max(20, b - 1))}><Minus className="size-4" /></Button>
          <input type="range" min={20} max={300} value={bpm} onChange={(e) => setBpm(+e.target.value)} aria-label="Tempo" className="flex-1 accent-[var(--accent)]" />
          <Button variant="outline" size="sm" aria-label="Faster" onClick={() => setBpm((b) => Math.min(300, b + 1))}><Plus className="size-4" /></Button>
        </div>
        <div className="mt-8 flex justify-center gap-3" aria-label="Beats in a bar">
          {accents.map((a, i) => (
            <button key={i} type="button" aria-pressed={a} aria-label={`Beat ${i + 1}${a ? ', accented' : ''}`} onClick={() => setAccents((p) => p.map((x, k) => (k === i ? !x : x)))}
              className={cn('grid size-12 cursor-pointer place-items-center rounded-full border-2 font-semibold transition', a ? 'border-accent' : 'border-border', beat === i ? 'scale-110 bg-accent text-on-accent' : 'bg-surface-2')}>{i + 1}</button>
          ))}
        </div>
        <div className="mt-8 flex justify-center gap-3">
          {running ? <Button size="lg" variant="secondary" icon={<Square className="size-5" />} onClick={stop}>Stop</Button> : <Button size="lg" icon={<Play className="size-5" />} onClick={start}>Start</Button>}
          <Button size="lg" variant="outline" icon={<Hand className="size-5" />} onClick={tap}>Tap tempo</Button>
        </div>
        <p className="mt-4 text-center text-xs text-muted">Space starts and stops, T taps, arrow keys change the tempo. Click a beat to accent it.</p>
      </div>}
      side={<>
        <Field label="Beats per bar"><Select value={String(beats)} onChange={(v) => setBeats(+v)} options={['2', '3', '4', '5', '6', '7', '8', '9', '12']} /></Field>
        <Field label="Subdivision"><Segmented value={String(sub)} onChange={(v) => setSub(+v)} options={[{ value: '1', label: '1/4' }, { value: '2', label: '1/8' }, { value: '3', label: 'Triplet' }, { value: '4', label: '1/16' }]} /></Field>
        <Slider label="Tempo" value={bpm} onChange={setBpm} min={20} max={300} suffix=" BPM" />
        <Field label="Click track length (bars)"><Input type="number" min={1} max={500} value={bars} onChange={(e) => setBars(Math.min(500, Math.max(1, Math.round(+e.target.value || 1))))} /></Field>
        <Button className="w-full" variant="outline" icon={<Download className="size-4" />} onClick={save}>Download click track (WAV)</Button>
        <p className="text-xs text-muted">The click is scheduled with the Web Audio clock, so it stays steady even when the page is busy.</p>
      </>}
    />
  )
}
