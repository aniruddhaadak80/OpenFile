import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MonitorPlay, Circle, Square, Pause, Play, Mic, Camera, Volume2, Scissors, RefreshCw, Monitor, Timer } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button, Label, ResultCard, Segmented, Select, Slider, Switch, ToolGrid, ErrorNote, Card, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { setHandoff } from '@/lib/handoff'
import { ffRun, X264 } from './_media/engine'
import { mediaError, pickRecorderMime, probeVideo, recExt, stamp, stopStream, useDevices, useMediaJob, useObjectUrl, workerTicker } from './_media/media'
import { Countdown, JobPanel, LevelMeter, Note, RecTimer, Reveal } from './_media/ui'

type Corner = 'tl' | 'tr' | 'bl' | 'br'
type Shape = 'circle' | 'rounded'
type Phase = 'setup' | 'countdown' | 'recording' | 'done'
interface Bubble { on: boolean; corner: Corner; shape: Shape; size: number; mirror: boolean }

const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== 'undefined'

function drawBubble(ctx: CanvasRenderingContext2D, cam: HTMLVideoElement, W: number, H: number, b: Bubble) {
  if (!cam.videoWidth) return
  const bw = Math.round(W * b.size / 100)
  const bh = b.shape === 'circle' ? bw : Math.round(bw * 0.75)
  const m = Math.round(Math.min(W, H) * 0.03)
  const x = b.corner.endsWith('l') ? m : W - bw - m
  const y = b.corner.startsWith('t') ? m : H - bh - m
  // cover-crop the camera into the bubble
  const ar = bw / bh, car = cam.videoWidth / cam.videoHeight
  let sw = cam.videoWidth, sh = cam.videoHeight, sx = 0, sy = 0
  if (car > ar) { sw = sh * ar; sx = (cam.videoWidth - sw) / 2 } else { sh = sw / ar; sy = (cam.videoHeight - sh) / 2 }
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = m * 0.8
  ctx.beginPath()
  if (b.shape === 'circle') ctx.arc(x + bw / 2, y + bh / 2, bw / 2, 0, Math.PI * 2)
  else ctx.roundRect(x, y, bw, bh, Math.round(bw * 0.08))
  ctx.fillStyle = '#000'; ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.clip()
  if (b.mirror) { ctx.translate(x + bw, y); ctx.scale(-1, 1); ctx.drawImage(cam, sx, sy, sw, sh, 0, 0, bw, bh) }
  else ctx.drawImage(cam, sx, sy, sw, sh, x, y, bw, bh)
  ctx.restore()
  ctx.save(); ctx.beginPath()
  if (b.shape === 'circle') ctx.arc(x + bw / 2, y + bh / 2, bw / 2 - 1, 0, Math.PI * 2)
  else ctx.roundRect(x + 1, y + 1, bw - 2, bh - 2, Math.round(bw * 0.08))
  ctx.lineWidth = Math.max(2, W / 400); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke(); ctx.restore()
}

export default function ScreenRecorder() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('setup')
  const [sysAudio, setSysAudio] = useState(true)
  const [micOn, setMicOn] = useState(true)
  const [micId, setMicId] = useState('')
  const [micVol, setMicVol] = useState(100)
  const [sysVol, setSysVol] = useState(100)
  const [camId, setCamId] = useState('')
  const [bubble, setBubble] = useState<Bubble>({ on: false, corner: 'br', shape: 'circle', size: 20, mirror: true })
  const [useCountdown, setUseCountdown] = useState(true)
  const [count, setCount] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Blob | null>(null)
  const [mp4, setMp4] = useState<Blob | null>(null)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const resultUrl = useObjectUrl(result)
  const job = useMediaJob()
  const mics = useDevices('audioinput'), cams = useDevices('videoinput')

  const camPreview = useRef<HTMLVideoElement>(null)
  const livePreview = useRef<HTMLVideoElement>(null)
  const camStream = useRef<MediaStream | null>(null)
  const bubbleRef = useRef(bubble); bubbleRef.current = bubble
  const gains = useRef<{ mic?: GainNode; sys?: GainNode }>({})
  const session = useRef<{ display?: MediaStream; mic?: MediaStream; rec?: MediaRecorder; stopTicker?: () => void; ctx?: AudioContext; chunks: Blob[]; startedAt: number; accumulated: number; out?: MediaStream }>({ chunks: [], startedAt: 0, accumulated: 0 })

  // webcam preview for the bubble
  useEffect(() => {
    if (phase === 'recording' || phase === 'countdown') return
    if (!bubble.on || phase === 'done') { stopStream(camStream.current); camStream.current = null; return }
    let alive = true
    navigator.mediaDevices.getUserMedia({ video: { deviceId: camId ? { exact: camId } : undefined, width: { ideal: 640 }, height: { ideal: 480 } } })
      .then((s) => { if (!alive) return stopStream(s); stopStream(camStream.current); camStream.current = s; if (camPreview.current) camPreview.current.srcObject = s; cams.refresh() })
      .catch((e) => { setError(mediaError(e, 'camera')); setBubble((b) => ({ ...b, on: false })) })
    return () => { alive = false }
  }, [bubble.on, camId, phase])
  useEffect(() => { if (camPreview.current && camStream.current) camPreview.current.srcObject = camStream.current })

  useEffect(() => { if (gains.current.mic) gains.current.mic.gain.value = micVol / 100 }, [micVol])
  useEffect(() => { if (gains.current.sys) gains.current.sys.gain.value = sysVol / 100 }, [sysVol])

  const cleanup = () => {
    const s = session.current
    s.stopTicker?.(); stopStream(s.display); stopStream(s.mic); stopStream(s.out)
    s.ctx?.close().catch(() => {})
    gains.current = {}; setAnalyser(null)
    session.current = { chunks: [], startedAt: 0, accumulated: 0 }
  }
  useEffect(() => () => { cleanup(); stopStream(camStream.current) }, [])

  // timer
  useEffect(() => {
    if (phase !== 'recording') return
    const t = setInterval(() => { const s = session.current; setElapsed((s.accumulated + (s.startedAt ? Date.now() - s.startedAt : 0)) / 1000) }, 250)
    return () => clearInterval(t)
  }, [phase])

  const start = async () => {
    setError(null); setResult(null); setMp4(null); setElapsed(0); setPaused(false); job.reset()
    const s = session.current
    try {
      s.display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: sysAudio ? { echoCancellation: false, noiseSuppression: false } as MediaTrackConstraints : false })
    } catch (e) { setError(mediaError(e, 'screen')); return }
    try {
      if (micOn) s.mic = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: micId ? { exact: micId } : undefined, echoCancellation: true, noiseSuppression: true } })
      mics.refresh()
    } catch (e) { toast(mediaError(e, 'microphone') + ' Recording without mic.', 'error') }
    if (sysAudio && !s.display.getAudioTracks().length) toast('No system audio was shared. In the share dialog, tick "Share audio" (Chrome/Edge).', 'info')

    const screenTrack = s.display.getVideoTracks()[0]
    screenTrack.addEventListener('ended', () => stop())

    // ---- video: direct or composited with webcam bubble ----
    let videoTrack: MediaStreamTrack = screenTrack
    if (bubble.on && camStream.current) {
      const sv = document.createElement('video'); sv.muted = true; sv.playsInline = true; sv.srcObject = new MediaStream([screenTrack]); await sv.play().catch(() => {})
      const cv = document.createElement('video'); cv.muted = true; cv.playsInline = true; cv.srcObject = camStream.current; await cv.play().catch(() => {})
      const st = screenTrack.getSettings()
      const canvas = document.createElement('canvas')
      canvas.width = Math.round((st.width || sv.videoWidth || 1920) / 2) * 2; canvas.height = Math.round((st.height || sv.videoHeight || 1080) / 2) * 2
      const ctx = canvas.getContext('2d', { alpha: false })!
      const draw = () => {
        if (sv.videoWidth && (canvas.width !== sv.videoWidth || canvas.height !== sv.videoHeight)) { canvas.width = sv.videoWidth; canvas.height = sv.videoHeight }
        ctx.drawImage(sv, 0, 0, canvas.width, canvas.height)
        if (bubbleRef.current.on) drawBubble(ctx, cv, canvas.width, canvas.height, bubbleRef.current)
      }
      draw()
      s.stopTicker = workerTicker(30, draw)
      videoTrack = canvas.captureStream(30).getVideoTracks()[0]
    }

    // ---- audio: mix system + mic through Web Audio ----
    const tracks: MediaStreamTrack[] = [videoTrack]
    const sysTracks = s.display.getAudioTracks(), micTracks = s.mic?.getAudioTracks() ?? []
    if (sysTracks.length || micTracks.length) {
      const ctx = new AudioContext(); s.ctx = ctx
      const dest = ctx.createMediaStreamDestination()
      if (sysTracks.length) { const g = ctx.createGain(); g.gain.value = sysVol / 100; ctx.createMediaStreamSource(new MediaStream(sysTracks)).connect(g).connect(dest); gains.current.sys = g }
      if (micTracks.length) {
        const g = ctx.createGain(); g.gain.value = micVol / 100
        const src = ctx.createMediaStreamSource(new MediaStream(micTracks)); src.connect(g).connect(dest); gains.current.mic = g
        const an = ctx.createAnalyser(); an.fftSize = 1024; g.connect(an); setAnalyser(an)
      }
      tracks.push(dest.stream.getAudioTracks()[0])
    }
    s.out = new MediaStream(tracks)
    if (livePreview.current) livePreview.current.srcObject = new MediaStream([videoTrack])

    // ---- countdown ----
    if (useCountdown) {
      setPhase('countdown')
      for (let n = 3; n > 0; n--) { setCount(n); await new Promise((r) => setTimeout(r, 1000)); if (!session.current.out) return }
      setCount(null)
    }

    const mime = pickRecorderMime('video')
    const rec = new MediaRecorder(s.out, { mimeType: mime || undefined, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 160_000 })
    s.rec = rec; s.chunks = []
    rec.ondataavailable = (e) => { if (e.data.size) s.chunks.push(e.data) }
    rec.onstop = () => {
      const blob = new Blob(s.chunks, { type: (rec.mimeType || mime || 'video/webm').split(';')[0] })
      cleanup()
      if (!blob.size) { setError('Nothing was recorded.'); setPhase('setup'); return }
      setResult(blob); setPhase('done')
    }
    rec.start(1000)
    s.startedAt = Date.now(); s.accumulated = 0
    setPhase('recording')
  }

  const stop = () => {
    const s = session.current
    setCount(null)
    if (s.rec && s.rec.state !== 'inactive') s.rec.stop()
    else { cleanup(); setPhase('setup') }
  }
  const togglePause = () => {
    const s = session.current; if (!s.rec) return
    if (s.rec.state === 'recording') { s.rec.pause(); s.accumulated += Date.now() - s.startedAt; s.startedAt = 0; setPaused(true) }
    else if (s.rec.state === 'paused') { s.rec.resume(); s.startedAt = Date.now(); setPaused(false) }
  }

  const ext = result ? recExt(result.type) : 'webm'
  const name = `screen-recording-${stamp()}`

  const toMp4 = () => job.run(async ({ setProgress, setLabel }) => {
    if (!result) return
    setLabel('Converting to MP4…')
    const meta = resultUrl ? await probeVideo(resultUrl) : null
    const blob = await ffRun({ inputs: [{ name: `in.${ext}`, file: result }], args: ['-i', `in.${ext}`, '-r', '30', ...X264, '-crf', '23', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', 'out.mp4'], output: 'out.mp4', duration: meta?.duration || elapsed || undefined, onProgress: setProgress })
    setMp4(blob)
  })
  const openInTrimmer = () => {
    const b = mp4 ?? result; if (!b) return
    setHandoff([new File([b], `${name}.${mp4 ? 'mp4' : ext}`, { type: b.type })])
    navigate('/video-trimmer')
  }
  const newRecording = () => { setResult(null); setMp4(null); setPhase('setup'); job.reset() }

  if (!supported) return <Card className="text-center text-sm text-muted">Screen recording needs a desktop browser with screen-capture support (Chrome, Edge, Firefox or Safari 13+). Mobile browsers can't record the screen.</Card>

  const live = phase === 'recording' || phase === 'countdown'
  const cornerCls: Record<Corner, string> = { tl: 'top-3 left-3', tr: 'top-3 right-3', bl: 'bottom-3 left-3', br: 'bottom-3 right-3' }

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          {phase === 'done' && resultUrl ? (
            <Reveal k={resultUrl}><video src={resultUrl} controls playsInline className="aspect-video w-full rounded-2xl border border-border bg-black" /></Reveal>
          ) : (
            <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-surface-2 to-surface">
              <video ref={livePreview} autoPlay muted playsInline className={cn('absolute inset-0 h-full w-full bg-black object-contain', !live && 'hidden')} />
              {!live && (
                <div className="absolute inset-0 grid place-items-center text-center">
                  <div><Monitor className="mx-auto mb-3 size-12 text-muted/60" /><div className="font-medium">Your screen will appear here</div><div className="mt-1 text-xs text-muted">Pick a tab, window or entire screen after pressing Start.</div></div>
                </div>
              )}
              {!live && bubble.on && (
                <motion.div layout className={cn('absolute overflow-hidden border-2 border-white/80 shadow-xl', cornerCls[bubble.corner], bubble.shape === 'circle' ? 'rounded-full' : 'rounded-xl')} style={{ width: `${bubble.size}%`, aspectRatio: bubble.shape === 'circle' ? '1' : '4/3' }}>
                  <video ref={camPreview} autoPlay muted playsInline className="h-full w-full bg-black object-cover" style={{ transform: bubble.mirror ? 'scaleX(-1)' : undefined }} />
                </motion.div>
              )}
              {phase === 'recording' && <div className="absolute top-3 left-3 z-10"><RecTimer seconds={elapsed} paused={paused} /></div>}
              <Countdown n={count} />
            </div>
          )}
          {live && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="danger" size="lg" icon={<Square className="size-4 fill-current" />} onClick={stop}>Stop</Button>
              {phase === 'recording' && <Button variant="outline" size="lg" icon={paused ? <Play className="size-4" /> : <Pause className="size-4" />} onClick={togglePause}>{paused ? 'Resume' : 'Pause'}</Button>}
            </div>
          )}
          {analyser && live && <div className="mx-auto flex max-w-sm items-center gap-2 text-xs text-muted"><Mic className="size-3.5" /><LevelMeter analyser={analyser} className="flex-1" /></div>}
          <ErrorNote error={error} />
        </>}
        side={phase === 'done' ? <>
          <div className="text-sm font-medium">Recording finished</div>
          <Button variant="outline" className="w-full" icon={<RefreshCw className="size-4" />} onClick={toMp4} loading={job.busy} disabled={!!mp4}>{mp4 ? 'MP4 ready below' : 'Convert to MP4'}</Button>
          <JobPanel job={job} onRetry={toMp4} />
          <Button variant="outline" className="w-full" icon={<Scissors className="size-4" />} onClick={openInTrimmer}>Trim in Video Trimmer</Button>
          <Button variant="ghost" className="w-full" icon={<Circle className="size-4" />} onClick={newRecording}>New recording</Button>
          <Note>WEBM recordings from browsers may not show their total length in some players. Converting to MP4 fixes that and plays everywhere.</Note>
        </> : <>
          <div className="space-y-3">
            <Label>Audio</Label>
            <Switch checked={sysAudio} onChange={setSysAudio} label={<span className="inline-flex items-center gap-1.5"><Volume2 className="size-4 text-muted" />System / tab audio</span>} />
            {sysAudio && live && <Slider label="System volume" value={sysVol} onChange={setSysVol} min={0} max={200} suffix="%" />}
            <Switch checked={micOn} onChange={setMicOn} label={<span className="inline-flex items-center gap-1.5"><Mic className="size-4 text-muted" />Microphone</span>} />
            {micOn && !live && mics.devices.length > 1 && <Select value={micId} onChange={setMicId} options={[{ value: '', label: 'Default microphone' }, ...mics.devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Microphone ${i + 1}` }))]} />}
            {micOn && <Slider label="Mic volume" value={micVol} onChange={setMicVol} min={0} max={200} suffix="%" />}
          </div>
          <div className="space-y-3 border-t border-border pt-4">
            <Switch checked={bubble.on} onChange={(on) => setBubble({ ...bubble, on })} label={<span className="inline-flex items-center gap-1.5"><Camera className="size-4 text-muted" />Webcam bubble</span>} />
            {bubble.on && <>
              {!live && cams.devices.length > 1 && <Select value={camId} onChange={setCamId} options={[{ value: '', label: 'Default camera' }, ...cams.devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Camera ${i + 1}` }))]} />}
              <div><Label>Position</Label><Segmented value={bubble.corner} onChange={(corner) => setBubble({ ...bubble, corner })} options={[{ value: 'tl', label: '↖' }, { value: 'tr', label: '↗' }, { value: 'bl', label: '↙' }, { value: 'br', label: '↘' }]} /></div>
              <div><Label>Shape</Label><Segmented value={bubble.shape} onChange={(shape) => setBubble({ ...bubble, shape })} options={[{ value: 'circle', label: 'Circle' }, { value: 'rounded', label: 'Rounded' }]} /></div>
              <Slider label="Size" value={bubble.size} onChange={(size) => setBubble({ ...bubble, size })} min={10} max={40} suffix="%" />
              <Switch checked={bubble.mirror} onChange={(mirror) => setBubble({ ...bubble, mirror })} label="Mirror camera" />
              {live && <p className="text-xs text-muted">You can move and resize the bubble while recording.</p>}
            </>}
          </div>
          {!live && <>
            <div className="border-t border-border pt-4"><Switch checked={useCountdown} onChange={setUseCountdown} label={<span className="inline-flex items-center gap-1.5"><Timer className="size-4 text-muted" />3-second countdown</span>} /></div>
            <Button size="lg" className="w-full" icon={<MonitorPlay className="size-5" />} onClick={start}>Start recording</Button>
            <p className="text-xs text-muted">Nothing is uploaded — the video is built in your browser. System audio capture works in Chrome & Edge (tick "Share audio").</p>
          </>}
        </>}
      />
      {phase === 'done' && result && (
        <Reveal k="res">
          <div className="space-y-3">
            <ResultCard blob={result} filename={`${name}.${ext}`} title={`Recording ready (${ext.toUpperCase()})`} />
            {mp4 && <ResultCard blob={mp4} filename={`${name}.mp4`} title="MP4 version" />}
          </div>
        </Reveal>
      )}
    </div>
  )
}
