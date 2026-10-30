import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, Square, Scissors, Trash2, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Volume2, Sparkles, Repeat2, Gauge, Download, TrendingUp, TrendingDown, Crop } from 'lucide-react'
import { Button, Dropzone, Label, Segmented, Slider, ToolGrid, Spinner, ResultCard, ErrorNote, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { baseName } from '@/lib/files'
import { audioCtx, decodeAudioFile, trimBuffer, deleteRange, fade, gain, normalize, reverse, changeSpeed, encodeBuffer } from '@/tools/video/_media/audio'
import { fmtTime, useMediaJob, useObjectUrl } from '@/tools/video/_media/media'
import { FileBar, JobPanel, TimeInput, Reveal, EngineLoading } from '@/tools/video/_media/ui'
import { Waveform } from './_media/Waveform'

type Fmt = 'wav' | 'mp3' | 'ogg'
const MAX_HISTORY = 30

function Tool({ icon, label, onClick, disabled, title }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title ?? label}
      className="flex flex-col items-center gap-1 rounded-xl border border-border bg-surface px-2 py-2 text-[11px] font-medium text-muted transition hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-40 cursor-pointer">
      <span className="text-fg">{icon}</span>{label}
    </button>
  )
}

export default function AudioEditor() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [hist, setHist] = useState<{ list: AudioBuffer[]; i: number; labels: string[] }>({ list: [], i: -1, labels: [] })
  const buffer = hist.list[hist.i] ?? null
  const [view, setView] = useState<[number, number]>([0, 1])
  const [sel, setSel] = useState<[number, number] | null>(null)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [gainDb, setGainDb] = useState(3)
  const [speed, setSpeed] = useState(1.25)
  const [fmt, setFmt] = useState<Fmt>('wav')
  const [br, setBr] = useState('192')
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null)
  const resultUrl = useObjectUrl(result?.blob)
  const job = useMediaJob()
  const play = useRef<{ src?: AudioBufferSourceNode; startCtx: number; offset: number; end: number; raf: number }>({ startCtx: 0, offset: 0, end: 0, raf: 0 })

  const load = async (f: File) => {
    setFile(f); setLoading(true); setLoadErr(null); setResult(null)
    try {
      const b = await decodeAudioFile(f, { onFallback: () => toast('Converting format with the audio engine…', 'info') })
      setHist({ list: [b], i: 0, labels: ['Open'] }); setView([0, b.duration]); setSel(null); setPlayhead(0)
    } catch (e: any) { setLoadErr(e?.message || 'Could not decode this file.') } finally { setLoading(false) }
  }

  const stop = useCallback(() => {
    const p = play.current
    if (p.src) { p.src.onended = null; try { p.src.stop() } catch { /* */ } p.src.disconnect(); p.src = undefined }
    cancelAnimationFrame(p.raf); setPlaying(false)
  }, [])
  useEffect(() => () => stop(), [stop])

  const startPlay = (from: number, to: number) => {
    if (!buffer) return
    stop()
    const ctx = audioCtx(); ctx.resume()
    const src = ctx.createBufferSource(); src.buffer = buffer; src.connect(ctx.destination)
    const p = play.current
    p.src = src; p.startCtx = ctx.currentTime; p.offset = from; p.end = to
    src.start(0, from, Math.max(0.01, to - from))
    src.onended = () => { stop(); setPlayhead(to >= buffer.duration - 0.01 ? 0 : from) }
    setPlaying(true)
    const tick = () => { setPlayhead(p.offset + (ctx.currentTime - p.startCtx)); p.raf = requestAnimationFrame(tick) }
    tick()
  }
  const togglePlay = () => {
    if (!buffer) return
    if (playing) { const ph = playhead; stop(); setPlayhead(ph); return }
    if (sel) startPlay(sel[0], sel[1])
    else startPlay(playhead >= buffer.duration - 0.01 ? 0 : playhead, buffer.duration)
  }

  const commit = (b: AudioBuffer, label: string, keepSel = true) => {
    stop()
    setHist((h) => { const list = [...h.list.slice(0, h.i + 1), b].slice(-MAX_HISTORY); const labels = [...h.labels.slice(0, h.i + 1), label].slice(-MAX_HISTORY); return { list, labels, i: list.length - 1 } })
    if (!keepSel) setSel(null)
    setView((v) => (v[1] > b.duration || v[1] - v[0] >= (buffer?.duration ?? 0) - 1e-6 ? [0, b.duration] : v))
    setPlayhead((p) => Math.min(p, b.duration)); setResult(null)
  }
  const range = (): [number, number] => sel ?? [0, buffer!.duration]
  const undo = () => { stop(); setHist((h) => ({ ...h, i: Math.max(0, h.i - 1) })); setSel(null); setResult(null) }
  const redo = () => { stop(); setHist((h) => ({ ...h, i: Math.min(h.list.length - 1, h.i + 1) })); setSel(null); setResult(null) }
  useEffect(() => { if (buffer && view[1] > buffer.duration + 1e-6) setView([0, buffer.duration]) }, [buffer])

  const ops = {
    trim: () => { if (!sel) return; const b = trimBuffer(buffer!, sel[0], sel[1]); commit(b, 'Trim', false); setView([0, b.duration]); setPlayhead(0) },
    del: () => { if (!sel) return; if (sel[1] - sel[0] >= buffer!.duration - 0.001) return toast('Select only part of the audio to delete', 'error'); commit(deleteRange(buffer!, sel[0], sel[1]), 'Delete', false); setPlayhead(sel[0]) },
    fadeIn: () => { const [a, b] = sel ?? [0, Math.min(3, buffer!.duration)]; commit(fade(buffer!, a, b, 'in'), 'Fade in') },
    fadeOut: () => { const [a, b] = sel ?? [Math.max(0, buffer!.duration - 3), buffer!.duration]; commit(fade(buffer!, a, b, 'out'), 'Fade out') },
    gain: () => { const [a, b] = range(); commit(gain(buffer!, a, b, gainDb), `Gain ${gainDb > 0 ? '+' : ''}${gainDb} dB`) },
    norm: () => { const [a, b] = range(); commit(normalize(buffer!, a, b), 'Normalize') },
    rev: () => { const [a, b] = range(); commit(reverse(buffer!, a, b), 'Reverse') },
    speed: async () => { const b = await changeSpeed(buffer!, speed); commit(b, `Speed ${speed}×`, false); setView([0, b.duration]) },
  }

  // keyboard
  useEffect(() => {
    if (!buffer) return
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const mod = e.ctrlKey || e.metaKey
      if (e.key === ' ') { e.preventDefault(); togglePlay() }
      else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); ops.del() }
      else if (e.key === 'Escape') setSel(null)
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })

  const zoom = (k: number) => {
    if (!buffer) return
    const c = sel ? (sel[0] + sel[1]) / 2 : playhead
    const ns = Math.min(buffer.duration, Math.max(0.05, (view[1] - view[0]) * k))
    const a = Math.max(0, Math.min(buffer.duration - ns, c - ns / 2)); setView([a, a + ns])
  }
  const zoomSel = () => sel && setView([sel[0], sel[1]])

  const exportIt = () => job.run(async ({ setProgress, setLabel }) => {
    if (!buffer || !file) return
    setLabel(fmt === 'wav' ? 'Encoding WAV…' : `Encoding ${fmt.toUpperCase()}…`)
    const blob = await encodeBuffer(buffer, fmt, +br, setProgress)
    setResult({ blob, name: `${baseName(file.name)}-edited.${fmt}` })
  })
  const reset = () => { stop(); if (job.busy) job.cancel(); setFile(null); setHist({ list: [], i: -1, labels: [] }); setResult(null); setLoadErr(null); job.reset() }

  if (!file) return <Dropzone accept="audio/*,video/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.opus,.webm" onFiles={(f) => load(f[0])} label="Drop an audio file to edit" sub="MP3, WAV, OGG, M4A, FLAC… or a video to edit its soundtrack. Nothing is uploaded." />
  if (loading) return <div className="grid h-64 place-items-center rounded-2xl border border-border"><div className="space-y-3 text-center"><Spinner label="Decoding audio…" /><EngineLoading /></div></div>
  if (loadErr || !buffer) return <div className="space-y-3"><ErrorNote error={loadErr ?? 'Could not open this file.'} /><Button variant="secondary" onClick={reset}>Choose another file</Button></div>

  const zoomPct = Math.round(buffer.duration / (view[1] - view[0]) * 100)
  const scrollMax = Math.max(0, buffer.duration - (view[1] - view[0]))
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <FileBar file={file} onReset={reset} extra={<span className="hidden font-mono text-xs text-muted sm:inline">{fmtTime(buffer.duration)} · {buffer.sampleRate / 1000} kHz · {buffer.numberOfChannels === 1 ? 'mono' : 'stereo'}</span>} />
          <div className="space-y-2">
            <Waveform buffer={buffer} view={view} onView={setView} selection={sel} onSelection={setSel} playhead={playhead} onSeek={(t) => { const wasPlaying = playing; stop(); setPlayhead(t); if (wasPlaying) startPlay(t, buffer.duration) }} />
            {scrollMax > 0 && <input type="range" min={0} max={scrollMax} step={scrollMax / 1000} value={view[0]} onChange={(e) => { const a = +e.target.value; setView([a, a + (view[1] - view[0])]) }} className="w-full cursor-pointer accent-[var(--accent)]" aria-label="Scroll waveform" />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={togglePlay} icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />}>{playing ? 'Pause' : sel ? 'Play selection' : 'Play'}</Button>
            <Button variant="outline" onClick={() => { stop(); setPlayhead(sel ? sel[0] : 0) }} icon={<Square className="size-4" />} aria-label="Stop" />
            <span className="font-mono text-sm tabular-nums">{fmtTime(playhead)} <span className="text-muted">/ {fmtTime(buffer.duration)}</span></span>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => zoom(0.5)} icon={<ZoomIn className="size-4" />} aria-label="Zoom in" />
              <Button variant="ghost" size="sm" onClick={() => zoom(2)} icon={<ZoomOut className="size-4" />} aria-label="Zoom out" />
              <Button variant="ghost" size="sm" onClick={() => setView([0, buffer.duration])} icon={<Maximize2 className="size-4" />} aria-label="Fit" />
              <span className="w-12 text-right font-mono text-xs text-muted">{zoomPct}%</span>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted">
              {sel ? <>
                <span className="font-medium text-fg">Selection</span>
                <div className="w-28"><TimeInput label="Selection start" value={sel[0]} max={sel[1] - 0.01} onChange={(v) => setSel([v, sel[1]])} className="h-8" /></div>→
                <div className="w-28"><TimeInput label="Selection end" value={sel[1]} min={sel[0] + 0.01} max={buffer.duration} onChange={(v) => setSel([sel[0], v])} className="h-8" /></div>
                <span className="font-mono">{fmtTime(sel[1] - sel[0])}</span>
                <button className="text-accent hover:underline cursor-pointer" onClick={zoomSel}>Zoom to selection</button>
                <button className="hover:text-fg cursor-pointer" onClick={() => setSel(null)}>Clear</button>
              </> : <span>Drag on the waveform to select a region · effects apply to the selection, or the whole track when nothing is selected · Ctrl/⌘ + scroll to zoom</span>}
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              <Tool icon={<Crop className="size-4" />} label="Trim" title="Keep only the selection" onClick={ops.trim} disabled={!sel} />
              <Tool icon={<Scissors className="size-4" />} label="Cut" title="Remove the selection (Delete)" onClick={ops.del} disabled={!sel} />
              <Tool icon={<TrendingUp className="size-4" />} label="Fade in" title={sel ? 'Fade in across the selection' : 'Fade in over the first 3 s'} onClick={ops.fadeIn} />
              <Tool icon={<TrendingDown className="size-4" />} label="Fade out" title={sel ? 'Fade out across the selection' : 'Fade out over the last 3 s'} onClick={ops.fadeOut} />
              <Tool icon={<Sparkles className="size-4" />} label="Normalize" title="Raise peak level to −0.5 dB" onClick={ops.norm} />
              <Tool icon={<Repeat2 className="size-4" />} label="Reverse" onClick={ops.rev} />
              <Tool icon={<Undo2 className="size-4" />} label="Undo" title="Undo (Ctrl+Z)" onClick={undo} disabled={hist.i <= 0} />
              <Tool icon={<Redo2 className="size-4" />} label="Redo" title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={hist.i >= hist.list.length - 1} />
            </div>
            {hist.i > 0 && <div className="mt-2 truncate text-[11px] text-muted">History: {hist.labels.slice(1, hist.i + 1).join(' → ')}</div>}
          </div>
        </>}
        side={<>
          <div className="space-y-2">
            <Slider label={<span className="inline-flex items-center gap-1.5"><Volume2 className="size-3.5" />Volume</span>} value={gainDb} onChange={setGainDb} min={-20} max={20} step={1} suffix=" dB" />
            <Button variant="outline" size="sm" className="w-full" onClick={ops.gain} disabled={gainDb === 0}>Apply to {sel ? 'selection' : 'whole track'}</Button>
          </div>
          <div className="space-y-2 border-t border-border pt-4">
            <Slider label={<span className="inline-flex items-center gap-1.5"><Gauge className="size-3.5" />Speed</span>} value={speed} onChange={setSpeed} min={0.5} max={2} step={0.05} suffix="×" />
            <Button variant="outline" size="sm" className="w-full" onClick={ops.speed} disabled={speed === 1}>Apply to whole track</Button>
            <p className="text-[11px] text-muted">Tape-style: pitch changes with speed.</p>
          </div>
          <div className="space-y-3 border-t border-border pt-4">
            <div><Label>Export as</Label><Segmented value={fmt} onChange={setFmt} options={[{ value: 'wav', label: 'WAV' }, { value: 'mp3', label: 'MP3' }, { value: 'ogg', label: 'OGG' }]} /></div>
            {fmt !== 'wav' && <div><Label>Bitrate</Label><Segmented value={br} onChange={setBr} options={['128', '192', '256', '320'].map((v) => ({ value: v, label: v }))} /></div>}
            <Button size="lg" className="w-full" icon={<Download className="size-5" />} onClick={exportIt} loading={job.busy}>Export {fmt.toUpperCase()}</Button>
            <JobPanel job={job} onRetry={exportIt} />
            {fmt === 'wav' && <p className="text-[11px] text-muted">16-bit PCM, encoded instantly in your browser.</p>}
          </div>
        </>}
      />
      {result && resultUrl && (
        <Reveal k={resultUrl}>
          <ResultCard blob={result.blob} filename={result.name} originalSize={file.size} title="Your audio is ready">
            <audio src={resultUrl} controls className="w-full" />
          </ResultCard>
        </Reveal>
      )}
    </div>
  )
}
