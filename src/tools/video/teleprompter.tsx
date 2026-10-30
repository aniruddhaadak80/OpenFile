import { useEffect, useRef, useState } from 'react'
import { Camera, Circle, Square, Play, Pause, FlipHorizontal, Maximize2, RotateCcw } from 'lucide-react'
import { Button, Label, ResultCard, Segmented, Select, Slider, Switch, ToolGrid, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { mediaError, pickRecorderMime, recExt, stamp, stopStream, useDevices, useObjectUrl, workerTicker } from './_media/media'
import { Countdown, RecTimer, Reveal } from './_media/ui'

const SAMPLE = `Hi, and welcome.\n\nPaste your script here. It scrolls up at a steady pace while you look at the camera.\n\nUse the speed slider to match how fast you talk. Press space to pause, and the arrow keys to nudge the text.\n\nThanks for watching.`

export default function Teleprompter() {
  const [script, setScript] = useState(SAMPLE)
  const [speed, setSpeed] = useState(40)
  const [size, setSize] = useState(36)
  const [mirror, setMirror] = useState(false)
  const [camMirror, setCamMirror] = useState(true)
  const [scrolling, setScrolling] = useState(false)
  const [source, setSource] = useState<'camera' | 'none'>('camera')
  const [camId, setCamId] = useState('')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [rec, setRec] = useState<MediaRecorder | null>(null)
  const [secs, setSecs] = useState(0)
  const [count, setCount] = useState<number | null>(null)
  const [result, setResult] = useState<Blob | null>(null)
  const resultUrl = useObjectUrl(result)
  const { devices, refresh } = useDevices('videoinput')
  const view = useRef<HTMLVideoElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const pos = useRef(0)

  useEffect(() => () => stopStream(stream), [stream])
  useEffect(() => { if (view.current) view.current.srcObject = stream }, [stream])
  // scroll engine keeps going in background tabs
  useEffect(() => {
    if (!scrolling) return
    return workerTicker(60, () => {
      const el = scroller.current; if (!el) return
      pos.current += speed / 60
      el.scrollTop = pos.current
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) setScrolling(false)
    })
  }, [scrolling, speed])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return
      if (e.key === ' ') { e.preventDefault(); setScrolling((s) => !s) }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); pos.current = Math.max(0, pos.current + (e.key === 'ArrowUp' ? -40 : 40)); if (scroller.current) scroller.current.scrollTop = pos.current }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [])

  const startCam = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: camId ? { deviceId: { exact: camId }, width: { ideal: 1920 }, height: { ideal: 1080 } } : { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: true })
      setStream(s); refresh()
    } catch (e) { toast(mediaError(e, 'camera'), 'error') }
  }
  const restart = () => { pos.current = 0; if (scroller.current) scroller.current.scrollTop = 0 }
  const record = async () => {
    if (!stream) return
    restart(); setResult(null)
    for (let n = 3; n > 0; n--) { setCount(n); await new Promise((r) => setTimeout(r, 1000)) }
    setCount(null)
    const mime = pickRecorderMime('video')
    const r = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined)
    const chunks: Blob[] = []
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    r.onstop = () => { setResult(new Blob(chunks, { type: r.mimeType || 'video/webm' })); setRec(null); setScrolling(false) }
    r.start(1000); setRec(r); setSecs(0); setScrolling(true)
  }
  useEffect(() => { if (!rec) return; const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t) }, [rec])
  const full = () => stage.current?.requestFullscreen?.().catch(() => {})
  const words = script.trim().split(/\s+/).filter(Boolean).length
  const readMins = words / 150

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <div ref={stage} className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-black">
            {stream && <video ref={view} autoPlay muted playsInline className={cn('absolute inset-0 h-full w-full object-cover opacity-60', camMirror && '-scale-x-100')} />}
            <div ref={scroller} className={cn('absolute inset-0 overflow-hidden px-[8%] py-[30%] text-center font-semibold leading-snug text-white', mirror && '-scale-x-100')} style={{ fontSize: size, textShadow: '0 2px 8px rgba(0,0,0,.8)' }}>
              {script.split('\n').map((l, i) => <p key={i} className="min-h-[1em]">{l}</p>)}
              <div style={{ height: '60%' }} />
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-[38%] h-[14%] border-y border-accent/50 bg-accent/5" />
            <div className="absolute left-3 top-3">{rec && <RecTimer seconds={secs} />}</div>
            <Countdown n={count} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" icon={scrolling ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={() => setScrolling(!scrolling)}>{scrolling ? 'Pause' : 'Scroll'}</Button>
            <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={restart}>Back to top</Button>
            <Button size="sm" variant="ghost" icon={<Maximize2 className="size-4" />} onClick={full}>Full screen</Button>
            <span className="ml-auto text-xs text-muted">{words} words, about {readMins < 1 ? `${Math.max(1, Math.round(readMins * 60))} s` : `${readMins.toFixed(1)} min`} at a normal pace</span>
          </div>
          <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={8} aria-label="Script" className="w-full rounded-2xl border border-border bg-surface-2/60 p-4 text-sm leading-relaxed text-fg outline-none focus:border-accent" />
        </>}
        side={<>
          <Slider label="Scroll speed" value={speed} onChange={setSpeed} min={5} max={200} suffix=" px/s" />
          <Slider label="Text size" value={size} onChange={setSize} min={16} max={96} suffix="px" />
          <Switch checked={mirror} onChange={setMirror} label="Mirror text (for glass rigs)" />
          <div className="border-t border-border pt-4 space-y-3">
            <div><Label>Record</Label><Segmented value={source} onChange={(v) => { setSource(v); if (v === 'none') { stopStream(stream); setStream(null) } }} options={[{ value: 'camera', label: 'Camera' }, { value: 'none', label: 'Prompter only' }]} /></div>
            {source === 'camera' && <>
              {devices.length > 1 && <Select aria-label="Camera" value={camId} onChange={(v) => { setCamId(v); stopStream(stream); setStream(null) }} options={[{ value: '', label: 'Default camera' }, ...devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Camera ${i + 1}` }))]} />}
              <Switch checked={camMirror} onChange={setCamMirror} label={<span className="inline-flex items-center gap-1"><FlipHorizontal className="size-4" />Mirror preview</span>} />
              {!stream ? <Button className="w-full" icon={<Camera className="size-4" />} onClick={startCam}>Turn on camera</Button>
                : !rec ? <Button size="lg" className="w-full" icon={<Circle className="size-5 fill-current" />} onClick={record}>Start recording</Button>
                  : <Button size="lg" variant="danger" className="w-full" icon={<Square className="size-5" />} onClick={() => rec.stop()}>Stop</Button>}
              <p className="text-xs text-muted">The script is never recorded, only your camera and microphone. A 3 second countdown starts the scroll.</p>
            </>}
          </div>
        </>}
      />
      {result && resultUrl && <Reveal k={resultUrl}><ResultCard blob={result} filename={`teleprompter-${stamp()}.${recExt(result.type)}`} title="Recording ready" onReset={() => setResult(null)}><video src={resultUrl} controls playsInline className="max-h-80 w-full rounded-xl bg-black" /></ResultCard></Reveal>}
    </div>
  )
}
