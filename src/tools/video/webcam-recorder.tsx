import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Circle, Square, Pause, Play, Camera, Download, RefreshCw, Scissors, X, Mic, VideoOff } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Label, ResultCard, Segmented, Select, Switch, ToolGrid, ErrorNote, Card, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob, canvasToBlob, zipFiles } from '@/lib/files'
import { setHandoff } from '@/lib/handoff'
import { ffRun, X264 } from './_media/engine'
import { mediaError, pickRecorderMime, probeVideo, recExt, stamp, stopStream, useDevices, useMediaJob, useObjectUrl, workerTicker } from './_media/media'
import { Countdown, JobPanel, LevelMeter, Note, RecTimer, Reveal } from './_media/ui'

type Res = '480' | '720' | '1080'
type Phase = 'idle' | 'countdown' | 'recording' | 'done'
const DIM: Record<Res, [number, number]> = { '480': [640, 480], '720': [1280, 720], '1080': [1920, 1080] }
interface Shot { id: string; url: string; blob: Blob; name: string }

export default function WebcamRecorder() {
  const navigate = useNavigate()
  const cams = useDevices('videoinput'), mics = useDevices('audioinput')
  const [camId, setCamId] = useState('')
  const [micId, setMicId] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [res, setRes] = useState<Res>('720')
  const [mirror, setMirror] = useState(true)
  const [mirrorRec, setMirrorRec] = useState(false)
  const [useCountdown, setUseCountdown] = useState(true)
  const [phase, setPhase] = useState<Phase>('idle')
  const [count, setCount] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [actual, setActual] = useState('')
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const [result, setResult] = useState<Blob | null>(null)
  const [mp4, setMp4] = useState<Blob | null>(null)
  const [shots, setShots] = useState<Shot[]>([])
  const [flash, setFlash] = useState(0)
  const resultUrl = useObjectUrl(result)
  const job = useMediaJob()
  const preview = useRef<HTMLVideoElement>(null)
  const rec = useRef<{ r?: MediaRecorder; chunks: Blob[]; startedAt: number; acc: number; stopTicker?: () => void; canvasTrack?: MediaStreamTrack }>({ chunks: [], startedAt: 0, acc: 0 })
  const streamRef = useRef<MediaStream | null>(null)
  const cancelCd = useRef(false)

  // (re)open the camera when settings change while idle
  useEffect(() => {
    if (phase === 'recording' || phase === 'countdown') return
    if (phase === 'done') { stopStream(streamRef.current); streamRef.current = null; setStream(null); return }
    let alive = true
    const [w, h] = DIM[res]
    setError(null)
    navigator.mediaDevices?.getUserMedia({
      video: { deviceId: camId ? { exact: camId } : undefined, width: { ideal: w }, height: { ideal: h } },
      audio: micOn ? { deviceId: micId ? { exact: micId } : undefined, echoCancellation: true, noiseSuppression: true } : false,
    }).then((s) => {
      if (!alive) return stopStream(s)
      stopStream(streamRef.current); streamRef.current = s; setStream(s)
      const st = s.getVideoTracks()[0]?.getSettings(); setActual(st?.width ? `${st.width}×${st.height}` : '')
      cams.refresh(); mics.refresh()
    }).catch((e) => { if (alive) { setError(mediaError(e, micOn ? 'camera or microphone' : 'camera')); setStream(null) } })
    return () => { alive = false }
  }, [camId, micId, micOn, res, phase])

  useEffect(() => { if (preview.current) preview.current.srcObject = stream }, [stream, phase])
  useEffect(() => () => { stopStream(streamRef.current); rec.current.stopTicker?.() }, [])

  // mic meter
  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length) { setAnalyser(null); return }
    const ctx = new AudioContext(); const an = ctx.createAnalyser(); an.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(an); setAnalyser(an)
    return () => { ctx.close().catch(() => {}); setAnalyser(null) }
  }, [stream])

  useEffect(() => {
    if (phase !== 'recording') return
    const t = setInterval(() => { const r = rec.current; setElapsed((r.acc + (r.startedAt ? Date.now() - r.startedAt : 0)) / 1000) }, 250)
    return () => clearInterval(t)
  }, [phase])

  const snapshot = async () => {
    const v = preview.current; if (!v || !v.videoWidth) return
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight
    const ctx = c.getContext('2d')!
    if (mirror) { ctx.translate(c.width, 0); ctx.scale(-1, 1) }
    ctx.drawImage(v, 0, 0)
    const blob = await canvasToBlob(c, 'image/jpeg', 0.92)
    setFlash((n) => n + 1)
    setShots((s) => [{ id: Math.random().toString(36).slice(2), url: URL.createObjectURL(blob), blob, name: `photo-${stamp()}.jpg` }, ...s])
  }

  const start = async () => {
    if (!stream) return
    setResult(null); setMp4(null); setElapsed(0); setPaused(false); job.reset()
    cancelCd.current = false
    if (useCountdown) {
      setPhase('countdown')
      for (let n = 3; n > 0; n--) { setCount(n); await new Promise((r) => setTimeout(r, 1000)); if (cancelCd.current) { setCount(null); return } }
      setCount(null)
    }
    let videoTrack = stream.getVideoTracks()[0]
    if (mirror && mirrorRec) {
      const v = preview.current!
      const c = document.createElement('canvas'); c.width = v.videoWidth || DIM[res][0]; c.height = v.videoHeight || DIM[res][1]
      const ctx = c.getContext('2d', { alpha: false })!
      const draw = () => { ctx.setTransform(-1, 0, 0, 1, c.width, 0); ctx.drawImage(v, 0, 0, c.width, c.height) }
      draw(); rec.current.stopTicker = workerTicker(30, draw)
      videoTrack = c.captureStream(30).getVideoTracks()[0]
      rec.current.canvasTrack = videoTrack
    }
    const mime = pickRecorderMime('video')
    const r = new MediaRecorder(new MediaStream([videoTrack, ...stream.getAudioTracks()]), { mimeType: mime || undefined, videoBitsPerSecond: res === '1080' ? 8_000_000 : res === '720' ? 5_000_000 : 2_500_000 })
    rec.current = { ...rec.current, r, chunks: [], startedAt: Date.now(), acc: 0 }
    r.ondataavailable = (e) => { if (e.data.size) rec.current.chunks.push(e.data) }
    r.onstop = () => {
      rec.current.stopTicker?.(); rec.current.canvasTrack?.stop()
      const blob = new Blob(rec.current.chunks, { type: (r.mimeType || mime || 'video/webm').split(';')[0] })
      rec.current = { chunks: [], startedAt: 0, acc: 0 }
      if (!blob.size) { toast('Nothing was recorded', 'error'); setPhase('idle'); return }
      setResult(blob); setPhase('done')
    }
    r.start(1000)
    setPhase('recording')
  }
  const stop = () => { setCount(null); cancelCd.current = true; const r = rec.current.r; if (r && r.state !== 'inactive') r.stop(); else setPhase('idle') }
  const togglePause = () => {
    const r = rec.current; if (!r.r) return
    if (r.r.state === 'recording') { r.r.pause(); r.acc += Date.now() - r.startedAt; r.startedAt = 0; setPaused(true) }
    else { r.r.resume(); r.startedAt = Date.now(); setPaused(false) }
  }

  const ext = result ? recExt(result.type) : 'webm'
  const name = `webcam-${stamp()}`
  const toMp4 = () => job.run(async ({ setProgress, setLabel }) => {
    if (!result) return
    setLabel('Converting to MP4…')
    const meta = resultUrl ? await probeVideo(resultUrl) : null
    setMp4(await ffRun({ inputs: [{ name: `in.${ext}`, file: result }], args: ['-i', `in.${ext}`, '-r', '30', ...X264, '-crf', '22', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', 'out.mp4'], output: 'out.mp4', duration: meta?.duration || elapsed || undefined, onProgress: setProgress }))
  })
  const trim = () => { const b = mp4 ?? result; if (!b) return; setHandoff([new File([b], `${name}.${mp4 ? 'mp4' : ext}`, { type: b.type })]); navigate('/video-trimmer') }

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return <Card className="text-center text-sm text-muted">Your browser doesn't support camera recording. Try a recent Chrome, Edge, Firefox or Safari.</Card>

  const live = phase === 'recording' || phase === 'countdown'
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          {phase === 'done' && resultUrl ? (
            <Reveal k={resultUrl}><video src={resultUrl} controls playsInline className="aspect-video w-full rounded-2xl border border-border bg-black" /></Reveal>
          ) : (
            <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-black">
              <video ref={preview} autoPlay muted playsInline className="h-full w-full object-cover" style={{ transform: mirror ? 'scaleX(-1)' : undefined }} />
              {!stream && <div className="absolute inset-0 grid place-items-center text-center text-sm text-white/70"><div><VideoOff className="mx-auto mb-2 size-10 opacity-60" />{error ? 'Camera unavailable' : 'Waiting for camera permission…'}</div></div>}
              {phase === 'recording' && <div className="absolute top-3 left-3"><RecTimer seconds={elapsed} paused={paused} /></div>}
              {actual && !live && <div className="absolute top-3 right-3 rounded-md bg-black/50 px-2 py-0.5 font-mono text-[11px] text-white/80">{actual}</div>}
              <AnimatePresence>{flash > 0 && <motion.div key={flash} initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 0.45 }} className="pointer-events-none absolute inset-0 bg-white" />}</AnimatePresence>
              <Countdown n={count} />
              {stream && (
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/70 to-transparent p-4">
                  {!live && <button onClick={start} className="grid size-16 place-items-center rounded-full border-4 border-white/90 bg-red-500 shadow-xl transition hover:scale-105 cursor-pointer" aria-label="Start recording"><Circle className="size-6 fill-white text-white" /></button>}
                  {live && <button onClick={stop} className="grid size-16 place-items-center rounded-full border-4 border-white/90 bg-red-600 shadow-xl transition hover:scale-105 cursor-pointer" aria-label="Stop"><Square className="size-6 fill-white text-white" /></button>}
                  {phase === 'recording' && <button onClick={togglePause} className="grid size-12 place-items-center rounded-full bg-white/20 text-white backdrop-blur transition hover:bg-white/30 cursor-pointer" aria-label={paused ? 'Resume' : 'Pause'}>{paused ? <Play className="size-5" /> : <Pause className="size-5" />}</button>}
                  <button onClick={snapshot} className="grid size-12 place-items-center rounded-full bg-white/20 text-white backdrop-blur transition hover:bg-white/30 cursor-pointer" aria-label="Take photo" title="Take photo"><Camera className="size-5" /></button>
                </div>
              )}
            </div>
          )}
          {analyser && phase !== 'done' && <div className="mx-auto flex max-w-sm items-center gap-2 text-xs text-muted"><Mic className="size-3.5" /><LevelMeter analyser={analyser} className="flex-1" /></div>}
          <ErrorNote error={error} />
          {shots.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label className="mb-0">Photos ({shots.length})</Label>{shots.length > 1 && <Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={async () => downloadBlob(await zipFiles(shots.map((s) => ({ name: s.name, data: s.blob }))), `photos-${stamp()}.zip`)}>All (ZIP)</Button>}</div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                <AnimatePresence initial={false}>
                  {shots.map((s) => (
                    <motion.div key={s.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="group relative h-24 shrink-0 overflow-hidden rounded-lg border border-border">
                      <img src={s.url} alt="" className="h-full w-auto" />
                      <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 transition group-hover:opacity-100">
                        <button onClick={() => downloadBlob(s.blob, s.name)} className="rounded-md bg-white/20 p-1.5 text-white cursor-pointer" aria-label="Download photo"><Download className="size-4" /></button>
                        <button onClick={() => { URL.revokeObjectURL(s.url); setShots((x) => x.filter((k) => k.id !== s.id)) }} className="rounded-md bg-white/20 p-1.5 text-white cursor-pointer" aria-label="Delete photo"><X className="size-4" /></button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </>}
        side={phase === 'done' ? <>
          <div className="text-sm font-medium">Recording finished</div>
          <Button variant="outline" className="w-full" icon={<RefreshCw className="size-4" />} onClick={toMp4} loading={job.busy} disabled={!!mp4}>{mp4 ? 'MP4 ready below' : 'Convert to MP4'}</Button>
          <JobPanel job={job} onRetry={toMp4} />
          <Button variant="outline" className="w-full" icon={<Scissors className="size-4" />} onClick={trim}>Trim in Video Trimmer</Button>
          <Button variant="ghost" className="w-full" icon={<Circle className="size-4" />} onClick={() => { setResult(null); setMp4(null); setPhase('idle') }}>Record again</Button>
        </> : <>
          {cams.devices.length > 1 && <div><Label>Camera</Label><Select aria-label="Camera" value={camId} onChange={setCamId} options={[{ value: '', label: 'Default camera' }, ...cams.devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Camera ${i + 1}` }))]} /></div>}
          <div className={cn(live && 'pointer-events-none opacity-50')}><Label hint={actual || undefined}>Resolution</Label><Segmented value={res} onChange={setRes} options={[{ value: '480', label: '480p' }, { value: '720', label: '720p' }, { value: '1080', label: '1080p' }]} /></div>
          <div className={cn('space-y-3', live && 'pointer-events-none opacity-50')}>
            <Switch checked={micOn} onChange={setMicOn} label="Record microphone" />
            {micOn && mics.devices.length > 1 && <Select aria-label="Microphone" value={micId} onChange={setMicId} options={[{ value: '', label: 'Default microphone' }, ...mics.devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Microphone ${i + 1}` }))]} />}
          </div>
          <div className="space-y-3 border-t border-border pt-4">
            <Switch checked={mirror} onChange={setMirror} label="Mirror preview" />
            {mirror && <Switch checked={mirrorRec} onChange={setMirrorRec} label="Mirror the recording too" />}
            <Switch checked={useCountdown} onChange={setUseCountdown} label="3-second countdown" />
          </div>
          <Button size="lg" className="w-full" variant={live ? 'danger' : 'primary'} icon={live ? <Square className="size-4 fill-current" /> : <Circle className="size-5" />} onClick={live ? stop : start} disabled={!stream}>{live ? 'Stop recording' : 'Start recording'}</Button>
          <Note>Tip: press the camera button anytime to save a photo. Everything stays on your device.</Note>
        </>}
      />
      {phase === 'done' && result && (
        <Reveal k="res">
          <div className="space-y-3">
            <ResultCard blob={result} filename={`${name}.${ext}`} title={`Video ready (${ext.toUpperCase()})`} />
            {mp4 && <ResultCard blob={mp4} filename={`${name}.mp4`} title="MP4 version" />}
          </div>
        </Reveal>
      )}
    </div>
  )
}
