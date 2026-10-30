import { useEffect, useRef, useState } from 'react'
import { Play, Square, Download, Music2 } from 'lucide-react'
import { Button, Dropzone, Label, Select, Slider, ToolGrid, ErrorNote, Progress, cn } from '@/components/ui'
import { baseName, downloadBlob } from '@/lib/files'
import { encodeBuffer, audioCtx, cssVar } from '@/tools/video/_media/audio'
import { fmtTime } from '@/tools/video/_media/media'
import { FileBar, Stat } from '@/tools/video/_media/ui'

interface Note { time: number; duration: number; midi: number; velocity: number }
interface Track { name: string; instrument: string; family: string; program: number; drums: boolean; notes: Note[]; on: boolean }

/** Synth voice per General MIDI family. */
function voice(family: string): { type: OscillatorType; attack: number; decay: number; sustain: number; release: number; cutoff: number; detune?: number } {
  switch (family) {
    case 'piano': case 'chromatic percussion': return { type: 'triangle', attack: 0.003, decay: 0.9, sustain: 0.15, release: 0.25, cutoff: 5000 }
    case 'organ': return { type: 'square', attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.08, cutoff: 3000 }
    case 'guitar': return { type: 'sawtooth', attack: 0.004, decay: 0.6, sustain: 0.1, release: 0.15, cutoff: 2500 }
    case 'bass': return { type: 'sawtooth', attack: 0.005, decay: 0.3, sustain: 0.5, release: 0.1, cutoff: 900 }
    case 'strings': case 'ensemble': return { type: 'sawtooth', attack: 0.12, decay: 0.2, sustain: 0.8, release: 0.35, cutoff: 3200, detune: 7 }
    case 'brass': return { type: 'sawtooth', attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.15, cutoff: 2200 }
    case 'reed': case 'pipe': return { type: 'square', attack: 0.04, decay: 0.15, sustain: 0.7, release: 0.12, cutoff: 2600 }
    case 'synth lead': return { type: 'square', attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.1, cutoff: 5000 }
    case 'synth pad': return { type: 'sawtooth', attack: 0.4, decay: 0.3, sustain: 0.8, release: 0.8, cutoff: 1800, detune: 10 }
    default: return { type: 'triangle', attack: 0.01, decay: 0.4, sustain: 0.4, release: 0.2, cutoff: 4000 }
  }
}

let noiseBuf: AudioBuffer | null = null
function noise(ctx: BaseAudioContext) {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return noiseBuf
}

/** Master bus: gain into a compressor into the speakers. */
function makeMaster(ctx: BaseAudioContext, volume: number) {
  const master = ctx.createGain(); master.gain.value = volume
  const comp = ctx.createDynamicsCompressor(); master.connect(comp).connect(ctx.destination)
  return master
}

/**
 * Schedule the notes whose song time falls in [winStart, winEnd) into a context.
 * `from` is the song position that maps to context time `t0`. Notes already sounding at `from` are included
 * when the window starts at `from`. Returns stoppable nodes.
 */
function scheduleWindow(ctx: BaseAudioContext, master: AudioNode, tracks: Track[], t0: number, rate: number, from: number, winStart: number, winEnd: number): AudioScheduledSourceNode[] {
  const out: AudioScheduledSourceNode[] = []
  for (const tr of tracks) {
    if (!tr.on) continue
    const v = voice(tr.family)
    for (const n of tr.notes) {
      if (n.time + n.duration < from) continue
      const inWin = n.time >= winStart && n.time < winEnd
      const carried = winStart === from && n.time < from
      if (!inWin && !carried) continue
      const start = t0 + Math.max(0, (n.time - from) / rate)
      const dur = Math.max(0.03, n.duration / rate)
      const g = ctx.createGain()
      const vel = n.velocity * 0.22
      if (tr.drums) {
        const src = ctx.createBufferSource(); src.buffer = noise(ctx)
        const f = ctx.createBiquadFilter()
        const kick = n.midi === 35 || n.midi === 36, snare = n.midi === 38 || n.midi === 40, hat = n.midi >= 42 && n.midi <= 46
        if (kick) {
          const o = ctx.createOscillator(); o.frequency.setValueAtTime(150, start); o.frequency.exponentialRampToValueAtTime(40, start + 0.15)
          g.gain.setValueAtTime(vel * 3, start); g.gain.exponentialRampToValueAtTime(0.001, start + 0.3)
          o.connect(g).connect(master); o.start(start); o.stop(start + 0.32); out.push(o); continue
        }
        f.type = hat ? 'highpass' : 'bandpass'; f.frequency.value = hat ? 7000 : snare ? 1800 : 3000
        const len = hat ? (n.midi === 46 ? 0.25 : 0.06) : snare ? 0.18 : 0.3
        g.gain.setValueAtTime(vel * (hat ? 0.8 : 1.6), start); g.gain.exponentialRampToValueAtTime(0.001, start + len)
        src.connect(f).connect(g).connect(master); src.start(start, Math.random() * 0.5); src.stop(start + len + 0.02); out.push(src)
        continue
      }
      const freq = 440 * Math.pow(2, (n.midi - 69) / 12)
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.min(v.cutoff, freq * 8 + 400)
      const end = start + dur
      g.gain.setValueAtTime(0, start)
      g.gain.linearRampToValueAtTime(vel, start + v.attack)
      g.gain.setTargetAtTime(vel * v.sustain, start + v.attack, v.decay / 3)
      g.gain.setValueAtTime(vel * v.sustain, end)
      g.gain.setTargetAtTime(0, end, v.release / 3)
      f.connect(g).connect(master)
      const oscs = v.detune ? [-v.detune, v.detune] : [0]
      for (const dt of oscs) { const o = ctx.createOscillator(); o.type = v.type; o.frequency.value = freq; o.detune.value = dt; o.connect(f); o.start(start); o.stop(end + v.release * 1.5); out.push(o) }
    }
  }
  return out
}

/** Schedule the whole song at once (used for offline rendering). */
function schedule(ctx: BaseAudioContext, tracks: Track[], t0: number, rate: number, from = 0, volume = 0.8): AudioScheduledSourceNode[] {
  return scheduleWindow(ctx, makeMaster(ctx, volume), tracks, t0, rate, from, from, Infinity)
}

/** How far ahead (in song seconds) the live scheduler queues notes, and how often it wakes up. */
const LOOKAHEAD = 2, TICK_MS = 250

export default function MidiPlayer() {
  const [file, setFile] = useState<File | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [info, setInfo] = useState<{ duration: number; bpm: number; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [rate, setRate] = useState(1)
  const [vol, setVol] = useState(80)
  const [fmt, setFmt] = useState<'wav' | 'mp3' | 'ogg'>('mp3')
  const [busy, setBusy] = useState(false)
  const [p, setP] = useState(0)
  const nodes = useRef<AudioScheduledSourceNode[]>([])
  const clock = useRef<{ ctxStart: number; from: number; perfStart: number } | null>(null)
  const timer = useRef(0)
  const master = useRef<GainNode | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const raf = useRef(0)
  const roll = useRef<HTMLCanvasElement>(null)

  const open = async (f: File) => {
    setFile(f); setError(null); stop()
    try {
      const { Midi } = await import('@tonejs/midi')
      const m = new Midi(await f.arrayBuffer())
      const tr: Track[] = m.tracks.filter((t) => t.notes.length).map((t, i) => ({ name: t.name || `Track ${i + 1}`, instrument: t.instrument.name, family: t.instrument.family, program: t.instrument.number, drums: t.instrument.percussion || t.channel === 9, notes: t.notes.map((n) => ({ time: n.time, duration: n.duration, midi: n.midi, velocity: n.velocity })), on: true }))
      if (!tr.length) throw new Error('This MIDI file has no notes.')
      setTracks(tr); setInfo({ duration: m.duration, bpm: Math.round(m.header.tempos[0]?.bpm ?? 120), name: m.name || baseName(f.name) }); setPos(0)
    } catch (e: any) { setError(e?.message?.includes('notes') ? e.message : 'This does not look like a valid MIDI file.') }
  }

  function stop() {
    if (timer.current) { clearInterval(timer.current); timer.current = 0 }
    nodes.current.forEach((n) => { try { n.stop() } catch { /* done */ } }); nodes.current = []
    try { master.current?.disconnect() } catch { /* gone */ }
    master.current = null
    cancelAnimationFrame(raf.current); setPlaying(false); clock.current = null
  }
  useEffect(() => () => stop(), [])
  // The audio context must be created and resumed inside the click, or browsers keep it muted.
  const play = async (from = pos) => {
    stop(); setError(null); setNote(null)
    if (!info) return
    let ctx: AudioContext
    try { ctx = audioCtx() } catch { setError('Your browser does not support Web Audio, so MIDI files cannot be played here. You can still render and download them.'); return }
    const resumed = ctx.state === 'running' ? Promise.resolve() : ctx.resume()
    // Some browsers never settle resume() without a real gesture. Do not wait forever.
    await Promise.race([resumed.catch(() => undefined), new Promise((r) => setTimeout(r, 600))])
    if (ctx.state !== 'running') setNote('Audio is blocked by the browser right now. Click Play again, or check that this tab is not muted.')
    try {
      const m = makeMaster(ctx, vol / 100); master.current = m
      const t0 = ctx.currentTime + 0.08
      const perf0 = performance.now() + 80
      clock.current = { ctxStart: t0, from, perfStart: perf0 }
      let queued = from
      const pump = () => {
        if (!clock.current) return
        const now = songTime(ctx)
        const until = Math.min(info.duration + 1, now + LOOKAHEAD)
        if (until > queued) {
          nodes.current.push(...scheduleWindow(ctx, m, tracks, t0, rate, from, queued, until))
          queued = until
        }
        // Drop finished nodes so the list does not grow without end.
        if (nodes.current.length > 4000) nodes.current = nodes.current.slice(-2000)
      }
      pump()
      timer.current = window.setInterval(pump, TICK_MS)
      setPlaying(true)
      const tick = () => {
        if (!clock.current) return
        const t = songTime(ctx)
        setPos(Math.max(0, t))
        if (t >= info.duration + 0.5) { stop(); setPos(0); return }
        raf.current = requestAnimationFrame(tick)
      }
      raf.current = requestAnimationFrame(tick)
    } catch (e: any) {
      stop(); setError(e?.message ? `Playback could not start: ${e.message}` : 'Playback could not start in this browser.')
    }
  }
  /** Current song position. Uses the audio clock when it runs, the page clock otherwise so the slider still moves. */
  function songTime(ctx: AudioContext) {
    const c = clock.current; if (!c) return 0
    const elapsed = ctx.state === 'running' && ctx.currentTime > 0 ? ctx.currentTime - c.ctxStart : (performance.now() - c.perfStart) / 1000
    return c.from + Math.max(0, elapsed) * rate
  }

  useEffect(() => {
    const c = roll.current; if (!c || !info) return
    const w = c.clientWidth, h = 220, dpr = window.devicePixelRatio || 1
    c.width = w * dpr; c.height = h * dpr
    const ctx = c.getContext('2d')!; ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h)
    const all = tracks.filter((t) => t.on && !t.drums).flatMap((t) => t.notes)
    const lo = Math.min(...all.map((n) => n.midi), 48), hi = Math.max(...all.map((n) => n.midi), 72)
    const span = 12, t0 = Math.max(0, pos - span * 0.25)
    const palette = [cssVar('--accent', '#F5A524'), '#2DD4BF', '#38BDF8', '#34D399', '#FBBF24', '#22D3EE', '#A3E635', '#FB923C']
    tracks.forEach((t, ti) => {
      if (!t.on) return
      ctx.fillStyle = palette[ti % palette.length]
      for (const n of t.notes) {
        if (n.time > t0 + span || n.time + n.duration < t0) continue
        const x = ((n.time - t0) / span) * w, nw = Math.max(2, (n.duration / span) * w)
        const y = t.drums ? h - 8 : h - 12 - ((n.midi - lo) / Math.max(1, hi - lo)) * (h - 24)
        ctx.globalAlpha = 0.4 + n.velocity * 0.6
        ctx.fillRect(x, y - 2, nw, 4)
      }
    })
    ctx.globalAlpha = 1; ctx.fillStyle = cssVar('--fg', '#fff'); ctx.fillRect(((pos - t0) / span) * w, 0, 2, h)
  }, [pos, tracks, info])

  const render = async () => {
    if (!info || !file) return
    setBusy(true); setP(0.05)
    try {
      const sr = 44100, len = Math.ceil(((info.duration / rate) + 2) * sr)
      const off = new OfflineAudioContext(2, len, sr)
      schedule(off, tracks, 0.05, rate, 0, vol / 100)
      const buf = await off.startRendering()
      setP(0.5)
      downloadBlob(await encodeBuffer(buf, fmt, 192, (x) => setP(0.5 + x / 2)), `${baseName(file.name)}.${fmt}`)
    } catch (e: any) { setError(e?.message || 'Rendering failed.') } finally { setBusy(false) }
  }

  if (!file) return <Dropzone accept=".mid,.midi,.kar,audio/midi" onFiles={(f) => open(f[0])} label="Drop a MIDI file" sub="Play MIDI songs in your browser, see the notes, mute tracks and save the result as MP3 or WAV." />
  return (
    <ToolGrid
      main={<>
        <FileBar file={file} onReset={() => { stop(); setFile(null); setTracks([]); setInfo(null) }} />
        <ErrorNote error={error} />
        {note && <p role="status" className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted">{note}</p>}
        {info && <>
          <canvas ref={roll} className="h-[220px] w-full rounded-2xl border border-border bg-surface" aria-label="Piano roll" />
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
            <Button icon={playing ? <Square className="size-4" /> : <Play className="size-4" />} onClick={() => (playing ? stop() : play())}>{playing ? 'Stop' : 'Play'}</Button>
            <input type="range" min={0} max={info.duration} step={0.1} value={Math.min(pos, info.duration)} onChange={(e) => { const t = +e.target.value; setPos(t); if (playing) play(t) }} className="flex-1 cursor-pointer accent-[var(--accent)]" aria-label="Position" />
            <span className="font-mono text-xs text-muted">{fmtTime(pos / 1, 0)} / {fmtTime(info.duration, 0)}</span>
          </div>
          <div className="space-y-1.5">{tracks.map((t, i) => (
            <label key={i} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm', !t.on && 'opacity-50')}>
              <input type="checkbox" checked={t.on} onChange={(e) => { setTracks((l) => l.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x))); if (playing) setTimeout(() => play(), 0) }} className="accent-[var(--accent)]" />
              <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
              <span className="truncate text-xs text-muted">{t.drums ? 'Drums' : t.instrument} · {t.notes.length} notes</span>
            </label>))}</div>
        </>}
      </>}
      side={<>
        {info && <div className="grid grid-cols-3 gap-2"><Stat label="Length" value={fmtTime(info.duration, 0)} /><Stat label="Tempo" value={`${info.bpm} bpm`} /><Stat label="Tracks" value={tracks.length} /></div>}
        <Slider label="Speed" value={rate} onChange={(v) => { setRate(v); if (playing) setTimeout(() => play(), 0) }} min={0.5} max={2} step={0.05} suffix="x" />
        <Slider label="Volume" value={vol} onChange={(v) => { setVol(v); if (master.current) master.current.gain.value = v / 100 }} min={10} max={100} suffix="%" />
        <div><Label>Save as</Label><Select aria-label="Save as" value={fmt} onChange={setFmt} options={[{ value: 'mp3', label: 'MP3' }, { value: 'wav', label: 'WAV' }, { value: 'ogg', label: 'OGG' }]} /></div>
        <Button size="lg" className="w-full" icon={<Download className="size-5" />} onClick={render} loading={busy} disabled={!info}>Render and download</Button>
        {busy && <Progress value={p} />}
        <p className="flex gap-1.5 text-xs text-muted"><Music2 className="size-4 shrink-0" />Played with a built-in synthesizer, so it sounds simpler than a full sound bank. Muted tracks are left out of the export.</p>
      </>}
    />
  )
}
