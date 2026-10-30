import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Pause, Play, Download, Trash2, Pencil, Check, MicOff } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Label, Select, Switch, ToolGrid, ErrorNote, Card, Empty, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob, formatBytes } from '@/lib/files'
import { audioCtx, bufferToWav, cssVar, decodeAudioFile } from '@/tools/video/_media/audio'
import { fmtTime, mediaError, pickRecorderMime, recExt, stamp, stopStream, useDevices } from '@/tools/video/_media/media'
import { LevelMeter } from '@/tools/video/_media/ui'

interface Rec { id: string; name: string; blob: Blob; url: string; duration: number; at: Date }

function LiveWave({ analyser, active }: { analyser: AnalyserNode | null; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const hist = useRef<number[]>([])
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d')!
    let raf = 0
    const data = new Float32Array(2048)
    const draw = () => {
      const dpr = window.devicePixelRatio || 1
      const w = c.clientWidth, h = c.clientHeight
      if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h)
      const accent = cssVar('--accent'), muted = cssVar('--muted')
      let level = 0
      if (analyser) {
        analyser.getFloatTimeDomainData(data)
        let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
        level = Math.sqrt(sum / data.length)
        // oscilloscope
        ctx.strokeStyle = accent; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.5; ctx.beginPath()
        for (let x = 0; x < w; x++) { const v = data[Math.floor((x / w) * data.length)]; const y = h / 2 + v * h * 0.45; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }
        ctx.stroke(); ctx.globalAlpha = 1
      }
      // scrolling bar history
      if (active) { hist.current.push(level); if (hist.current.length > Math.ceil(w / 4)) hist.current.shift() }
      const bars = hist.current
      ctx.fillStyle = active ? accent : muted
      for (let i = 0; i < bars.length; i++) {
        const bh = Math.max(2, Math.min(1, bars[i] * 4) * h * 0.9)
        const x = w - (bars.length - i) * 4
        ctx.globalAlpha = 0.4 + 0.6 * (i / bars.length)
        ctx.beginPath(); ctx.roundRect(x, (h - bh) / 2, 2.5, bh, 1.25); ctx.fill()
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(draw)
    }
    draw(); return () => cancelAnimationFrame(raf)
  }, [analyser, active])
  return <canvas ref={ref} className="h-40 w-full" />
}

export default function VoiceRecorder() {
  const mics = useDevices('audioinput')
  const [micId, setMicId] = useState('')
  const [ns, setNs] = useState(true)
  const [ec, setEc] = useState(true)
  const [agc, setAgc] = useState(true)
  const [state, setState] = useState<'idle' | 'recording' | 'paused'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const [recs, setRecs] = useState<Rec[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [busyWav, setBusyWav] = useState<string | null>(null)
  const s = useRef<{ stream?: MediaStream; rec?: MediaRecorder; chunks: Blob[]; startedAt: number; acc: number; ctx?: AudioContext }>({ chunks: [], startedAt: 0, acc: 0 })
  const audio = useRef<HTMLAudioElement | null>(null)
  const recsRef = useRef<Rec[]>([]); recsRef.current = recs

  useEffect(() => () => { stopStream(s.current.stream); s.current.ctx?.close().catch(() => {}); audio.current?.pause(); recsRef.current.forEach((r) => URL.revokeObjectURL(r.url)) }, [])
  useEffect(() => {
    if (state !== 'recording') return
    const t = setInterval(() => setElapsed((s.current.acc + (Date.now() - s.current.startedAt)) / 1000), 100)
    return () => clearInterval(t)
  }, [state])

  const start = async () => {
    setError(null)
    if (typeof MediaRecorder === 'undefined') return setError('Your browser does not support audio recording.')
    let stream: MediaStream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: micId ? { exact: micId } : undefined, noiseSuppression: ns, echoCancellation: ec, autoGainControl: agc } }) }
    catch (e) { setError(mediaError(e, 'microphone')); return }
    mics.refresh()
    const ctx = new AudioContext(); const an = ctx.createAnalyser(); an.fftSize = 2048
    ctx.createMediaStreamSource(stream).connect(an); setAnalyser(an)
    const mime = pickRecorderMime('audio')
    const rec = new MediaRecorder(stream, { mimeType: mime || undefined, audioBitsPerSecond: 128000 })
    s.current = { stream, rec, chunks: [], startedAt: Date.now(), acc: 0, ctx }
    rec.ondataavailable = (e) => { if (e.data.size) s.current.chunks.push(e.data) }
    rec.onstop = () => {
      const blob = new Blob(s.current.chunks, { type: (rec.mimeType || mime || 'audio/webm').split(';')[0] })
      const duration = (s.current.acc + (s.current.startedAt ? Date.now() - s.current.startedAt : 0)) / 1000
      stopStream(s.current.stream); s.current.ctx?.close().catch(() => {}); setAnalyser(null)
      s.current = { chunks: [], startedAt: 0, acc: 0 }
      setState('idle')
      if (!blob.size) return toast('Nothing was recorded', 'error')
      const n = recsRef.current.length + 1
      setRecs((r) => [{ id: Math.random().toString(36).slice(2), name: `Recording ${n}`, blob, url: URL.createObjectURL(blob), duration, at: new Date() }, ...r])
    }
    rec.start(250)
    setElapsed(0); setState('recording')
  }
  const stop = () => { const r = s.current.rec; if (r && r.state !== 'inactive') r.stop() }
  const pause = () => {
    const c = s.current; if (!c.rec) return
    if (c.rec.state === 'recording') { c.rec.pause(); c.acc += Date.now() - c.startedAt; c.startedAt = 0; setState('paused') }
    else { c.rec.resume(); c.startedAt = Date.now(); setState('recording') }
  }

  // space to start/stop, P to pause
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return
      if (e.key === ' ') { e.preventDefault(); state === 'idle' ? start() : stop() }
      else if ((e.key === 'p' || e.key === 'P') && state !== 'idle') pause()
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })

  const playRec = (r: Rec) => {
    if (playingId === r.id) { audio.current?.pause(); setPlayingId(null); return }
    audio.current?.pause()
    const a = new Audio(r.url); audio.current = a
    a.onended = () => setPlayingId(null); a.play(); setPlayingId(r.id)
  }
  const fileName = (r: Rec, ext: string) => `${(r.name.trim() || 'recording').replace(/[\\/:*?"<>|]+/g, '-')}.${ext}`
  const saveWav = async (r: Rec) => {
    setBusyWav(r.id)
    try { const b = await decodeAudioFile(r.blob); downloadBlob(bufferToWav(b), fileName(r, 'wav')) }
    catch (e: any) { toast(e?.message || 'Could not convert to WAV', 'error') } finally { setBusyWav(null) }
  }
  const del = (r: Rec) => { if (playingId === r.id) { audio.current?.pause(); setPlayingId(null) } URL.revokeObjectURL(r.url); setRecs((l) => l.filter((x) => x.id !== r.id)) }
  const rename = (id: string, name: string) => setRecs((l) => l.map((x) => (x.id === id ? { ...x, name } : x)))

  const live = state !== 'idle'
  return (
    <ToolGrid
      main={<>
        <Card className="relative overflow-hidden p-0">
          <div className="flex items-center justify-between px-5 pt-4">
            <div className="flex items-center gap-2 text-sm">
              <span className={cn('size-2.5 rounded-full', state === 'recording' ? 'animate-pulse bg-red-500' : state === 'paused' ? 'bg-warn' : 'bg-border')} />
              <span className="text-muted">{state === 'recording' ? 'Recording' : state === 'paused' ? 'Paused' : 'Ready'}</span>
            </div>
            <div className="font-mono text-3xl font-semibold tabular-nums">{fmtTime(elapsed, 1)}</div>
          </div>
          <div className="px-3"><LiveWave analyser={analyser} active={state === 'recording'} /></div>
          <div className="flex items-center justify-center gap-4 border-t border-border bg-surface-2/40 py-5">
            {live && <button onClick={pause} className="grid size-12 place-items-center rounded-full border border-border bg-surface text-fg transition hover:border-accent cursor-pointer" aria-label={state === 'paused' ? 'Resume' : 'Pause'}>{state === 'paused' ? <Play className="size-5" /> : <Pause className="size-5" />}</button>}
            <motion.button whileTap={{ scale: 0.92 }} onClick={live ? stop : start} className={cn('grid size-20 place-items-center rounded-full text-white shadow-xl transition cursor-pointer', live ? 'bg-red-600 shadow-red-600/30' : 'bg-gradient-brand shadow-accent/30 hover:brightness-110')} aria-label={live ? 'Stop recording' : 'Start recording'}>
              {live ? <Square className="size-7 fill-white" /> : <Mic className="size-8" />}
            </motion.button>
            {live && <div className="size-12" />}
          </div>
        </Card>
        {analyser && <LevelMeter analyser={analyser} />}
        <ErrorNote error={error} />
        <div>
          <Label>Recordings {recs.length ? `(${recs.length})` : ''}</Label>
          {!recs.length ? <Empty><MicOff className="mx-auto mb-2 size-6 opacity-50" />No recordings yet. Press the mic button or hit <kbd className="rounded bg-surface-2 px-1">Space</kbd> to start.</Empty> : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {recs.map((r) => (
                  <motion.div key={r.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
                    <button onClick={() => playRec(r)} className={cn('grid size-10 shrink-0 place-items-center rounded-full transition cursor-pointer', playingId === r.id ? 'bg-accent text-on-accent' : 'bg-accent/10 text-accent hover:bg-accent/20')} aria-label="Play">{playingId === r.id ? <Pause className="size-4" /> : <Play className="size-4" />}</button>
                    <div className="min-w-0 flex-1">
                      {editing === r.id ? (
                        <form onSubmit={(e) => { e.preventDefault(); setEditing(null) }} className="flex gap-1">
                          <input autoFocus value={r.name} onChange={(e) => rename(r.id, e.target.value)} onBlur={() => setEditing(null)} className="h-8 w-full rounded-lg border border-accent bg-surface-2/60 px-2 text-sm outline-none" />
                          <button type="submit" className="rounded-lg p-1.5 text-success cursor-pointer" aria-label="Save name"><Check className="size-4" /></button>
                        </form>
                      ) : (
                        <button onClick={() => setEditing(r.id)} className="group flex max-w-full items-center gap-1.5 truncate text-left text-sm font-medium cursor-text">{r.name}<Pencil className="size-3 shrink-0 text-muted opacity-0 group-hover:opacity-100" /></button>
                      )}
                      <div className="text-xs text-muted">{fmtTime(r.duration, 1)} · {formatBytes(r.blob.size)} · {r.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" icon={<Download className="size-3.5" />} onClick={() => downloadBlob(r.blob, fileName(r, recExt(r.blob.type)))}>{recExt(r.blob.type).toUpperCase()}</Button>
                      <Button size="sm" variant="outline" icon={<Download className="size-3.5" />} loading={busyWav === r.id} onClick={() => saveWav(r)}>WAV</Button>
                      <button onClick={() => del(r)} className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger cursor-pointer" aria-label="Delete"><Trash2 className="size-4" /></button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </>}
      side={<>
        <div className={cn(live && 'pointer-events-none opacity-50')}>
          <Label>Microphone</Label>
          <Select aria-label="Microphone" value={micId} onChange={setMicId} options={[{ value: '', label: 'Default microphone' }, ...mics.devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Microphone ${i + 1}` }))]} />
          {!mics.devices.some((d) => d.label) && <p className="mt-1.5 text-xs text-muted">Device names appear after you allow microphone access.</p>}
        </div>
        <div className={cn('space-y-3', live && 'pointer-events-none opacity-50')}>
          <Label>Processing</Label>
          <Switch checked={ns} onChange={setNs} label="Noise suppression" />
          <Switch checked={ec} onChange={setEc} label="Echo cancellation" />
          <Switch checked={agc} onChange={setAgc} label="Auto gain" />
          <p className="text-xs text-muted">Turn these off for music or a studio mic.</p>
        </div>
        <div className="rounded-xl bg-surface-2/60 p-3 text-xs text-muted">
          <div className="mb-1 font-medium text-fg">Shortcuts</div>
          <kbd className="rounded bg-surface px-1">Space</kbd> start / stop · <kbd className="rounded bg-surface px-1">P</kbd> pause
        </div>
        <p className="text-xs text-muted">Recordings live in this tab only, download the ones you want to keep before closing it.</p>
      </>}
    />
  )
}
