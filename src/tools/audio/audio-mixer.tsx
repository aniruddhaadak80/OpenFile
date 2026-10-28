import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Layers, Play, Square, X, Plus, Volume2, VolumeX } from 'lucide-react'
import { Button, Dropzone, Label, Select, Segmented, ToolGrid, ResultCard, Progress, ErrorNote, cn } from '@/components/ui'
import { decodeAudioFile, encodeBuffer, audioCtx, drawMiniWave, cssVar } from '@/tools/video/_media/audio'
import { fmtTime, useObjectUrl } from '@/tools/video/_media/media'
import { AV_ACCEPT } from './_b4/FxShell'

type Track = { id: string; name: string; buffer: AudioBuffer; gain: number; offset: number; pan: number; mute: boolean; fadeIn: number; fadeOut: number }
type Len = 'longest' | 'shortest' | 'first'
type Fmt = 'mp3' | 'wav' | 'm4a' | 'ogg' | 'flac'

/** Output length in seconds for a set of tracks. Pure, unit tested. */
export function mixLength(tracks: { offset: number; duration: number; mute?: boolean }[], mode: Len): number {
  const live = tracks.filter((t) => !t.mute)
  if (!live.length) return 0
  const ends = live.map((t) => t.offset + t.duration)
  if (mode === 'first') return ends[0]
  return mode === 'shortest' ? Math.min(...ends) : Math.max(...ends)
}

function buildGraph(ctx: BaseAudioContext, tracks: Track[], start = 0, when = 0) {
  const nodes: AudioBufferSourceNode[] = []
  for (const t of tracks) {
    if (t.mute) continue
    const src = ctx.createBufferSource(); src.buffer = t.buffer
    const g = ctx.createGain(); const p = ctx.createStereoPanner(); p.pan.value = t.pan
    const t0 = when + Math.max(0, t.offset - start)
    const skip = Math.max(0, start - t.offset)
    const end = t0 + t.buffer.duration - skip
    g.gain.setValueAtTime(t.fadeIn > 0 && skip < t.fadeIn ? 0 : t.gain, t0)
    if (t.fadeIn > 0 && skip < t.fadeIn) g.gain.linearRampToValueAtTime(t.gain, t0 + t.fadeIn - skip)
    if (t.fadeOut > 0) { g.gain.setValueAtTime(t.gain, Math.max(t0, end - t.fadeOut)); g.gain.linearRampToValueAtTime(0, end) }
    src.connect(g).connect(p).connect(ctx.destination)
    if (skip < t.buffer.duration) { src.start(t0, skip); nodes.push(src) }
  }
  return nodes
}

function Wave({ buffer }: { buffer: AudioBuffer }) {
  const c = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (c.current) drawMiniWave(c.current, buffer, cssVar('--accent', '#F5A524')) }, [buffer])
  return <canvas ref={c} width={600} height={48} className="h-12 w-full" />
}

export default function AudioMixer() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(0)
  const [len, setLen] = useState<Len>('longest')
  const [fmt, setFmt] = useState<Fmt>('mp3')
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [p, setP] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Blob | null>(null)
  const nodes = useRef<AudioBufferSourceNode[]>([])
  const resultUrl = useObjectUrl(result)

  const add = async (files: File[]) => {
    setError(null); setLoading((n) => n + files.length)
    for (const f of files) {
      try { const buffer = await decodeAudioFile(f); setTracks((l) => [...l, { id: Math.random().toString(36).slice(2), name: f.name, buffer, gain: l.length ? 0.6 : 1, offset: 0, pan: 0, mute: false, fadeIn: 0, fadeOut: 0 }]) }
      catch (e: any) { setError(`${f.name}: ${e?.message || 'could not be decoded'}`) }
      finally { setLoading((n) => n - 1) }
    }
  }
  const patch = (id: string, q: Partial<Track>) => { setTracks((l) => l.map((t) => (t.id === id ? { ...t, ...q } : t))); setResult(null) }
  const total = mixLength(tracks.map((t) => ({ offset: t.offset, duration: t.buffer.duration, mute: t.mute })), len)
  const stop = () => { nodes.current.forEach((n) => { try { n.stop() } catch { /* already stopped */ } }); nodes.current = []; setPlaying(false) }
  useEffect(() => () => stop(), [])
  const play = async () => {
    if (playing) return stop()
    const ctx = audioCtx(); await ctx.resume()
    nodes.current = buildGraph(ctx, tracks, 0, ctx.currentTime + 0.05)
    setPlaying(true)
    setTimeout(() => setPlaying(false), total * 1000 + 200)
  }
  const mix = async () => {
    setBusy(true); setError(null); setResult(null); setP(0.05)
    try {
      const sr = Math.max(...tracks.map((t) => t.buffer.sampleRate))
      const off = new OfflineAudioContext(2, Math.max(1, Math.ceil(total * sr)), sr)
      buildGraph(off, tracks)
      const rendered = await off.startRendering()
      // avoid clipping: normalize peak to -1 dB if needed
      let peak = 0; for (let c = 0; c < rendered.numberOfChannels; c++) { const d = rendered.getChannelData(c); for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i])) }
      if (peak > 0.89) { const k = 0.89 / peak; for (let c = 0; c < rendered.numberOfChannels; c++) { const d = rendered.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k } }
      setP(0.4)
      setResult(await encodeBuffer(rendered, fmt, 192, (x) => setP(0.4 + x * 0.6)))
    } catch (e: any) { setError(e?.message || 'Mixing failed.') } finally { setBusy(false) }
  }

  if (!tracks.length && !loading) return <Dropzone multiple accept={AV_ACCEPT} onFiles={add} label="Drop two or more audio tracks" sub="Layer voice over music, add sound effects, set each track's volume, start time and fades. Mixed on your device." />
  return (
    <ToolGrid
      main={<>
        <div className="flex items-center justify-between"><Label className="mb-0">{tracks.length} track{tracks.length === 1 ? '' : 's'} · {fmtTime(total, 1)}</Label><Button variant="ghost" size="sm" onClick={() => { stop(); setTracks([]); setResult(null) }}>Start over</Button></div>
        <AnimatePresence initial={false}>{tracks.map((t, i) => (
          <motion.div key={t.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cn('space-y-2 rounded-2xl border border-border bg-surface p-3', t.mute && 'opacity-60')}>
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-md bg-accent/15 font-mono text-xs text-accent">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.name}</span>
              <span className="font-mono text-xs text-muted">{fmtTime(t.buffer.duration, 1)}</span>
              <button className="cursor-pointer rounded p-1 text-muted hover:text-fg" onClick={() => patch(t.id, { mute: !t.mute })} aria-label={t.mute ? 'Unmute' : 'Mute'}>{t.mute ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button>
              <button className="cursor-pointer rounded p-1 text-muted hover:text-danger" onClick={() => setTracks((l) => l.filter((x) => x.id !== t.id))} aria-label="Remove track"><X className="size-4" /></button>
            </div>
            <div className="relative overflow-hidden rounded-lg bg-surface-2/60" style={{ marginLeft: total ? `${(t.offset / total) * 100}%` : 0, width: total ? `${(t.buffer.duration / total) * 100}%` : '100%' }}><Wave buffer={t.buffer} /></div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
              {([['Volume', 'gain', 0, 2, 0.05, (v: number) => `${Math.round(v * 100)}%`], ['Start at', 'offset', 0, 120, 0.1, (v: number) => `${v.toFixed(1)} s`], ['Pan', 'pan', -1, 1, 0.1, (v: number) => (v === 0 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)], ['Fade in', 'fadeIn', 0, 10, 0.5, (v: number) => `${v} s`], ['Fade out', 'fadeOut', 0, 10, 0.5, (v: number) => `${v} s`]] as const).map(([l, k, min, max, step, f]) => (
                <label key={k} className="block text-xs"><span className="flex justify-between text-muted"><span>{l}</span><span className="font-mono text-fg">{f(t[k] as number)}</span></span>
                  <input type="range" min={min} max={max} step={step} value={t[k] as number} onChange={(e) => patch(t.id, { [k]: +e.target.value } as Partial<Track>)} className="w-full cursor-pointer accent-[var(--accent)]" aria-label={`${l} for ${t.name}`} /></label>
              ))}
            </div>
          </motion.div>))}</AnimatePresence>
        {loading > 0 && <Progress value={0.5} label={`Decoding ${loading} file${loading > 1 ? 's' : ''}`} />}
        <Dropzone compact multiple accept={AV_ACCEPT} onFiles={add} label={<span className="inline-flex items-center gap-1.5"><Plus className="size-4" />Add a track</span>} />
        <ErrorNote error={error} />
        {result && <ResultCard blob={result} filename={`mix.${fmt}`} onReset={() => setResult(null)}>{resultUrl && <audio src={resultUrl} controls className="w-full" />}</ResultCard>}
      </>}
      side={<>
        <Button variant="secondary" className="w-full" icon={playing ? <Square className="size-4" /> : <Play className="size-4" />} onClick={play} disabled={!tracks.length}>{playing ? 'Stop preview' : 'Preview mix'}</Button>
        <div><Label>Length</Label><Segmented value={len} onChange={setLen} options={[{ value: 'longest', label: 'Longest' }, { value: 'shortest', label: 'Shortest' }, { value: 'first', label: 'Track 1' }]} /></div>
        <div><Label>Format</Label><Select value={fmt} onChange={setFmt} options={[{ value: 'mp3', label: 'MP3' }, { value: 'm4a', label: 'M4A (AAC)' }, { value: 'ogg', label: 'OGG' }, { value: 'wav', label: 'WAV' }, { value: 'flac', label: 'FLAC' }]} /></div>
        <Button size="lg" className="w-full" icon={<Layers className="size-5" />} onClick={mix} loading={busy} disabled={tracks.length < 1 || !total}>Mix and export</Button>
        {busy && <Progress value={p} />}
        <p className="text-xs text-muted">The mix is lowered automatically if it would clip. Tip: set music to about 30 to 40% under a voice track.</p>
      </>}
    />
  )
}
