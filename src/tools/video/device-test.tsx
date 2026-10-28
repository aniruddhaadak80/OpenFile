import { useEffect, useRef, useState } from 'react'
import { Camera, Mic, Volume2, CheckCircle2, XCircle, Circle } from 'lucide-react'
import { Button, Card, Select, cn } from '@/components/ui'
import { mediaError, stopStream, useDevices } from './_media/media'
import { LevelMeter } from './_media/ui'

type Status = 'idle' | 'ok' | 'fail'
function Pill({ s, label }: { s: Status; label: string }) {
  const I = s === 'ok' ? CheckCircle2 : s === 'fail' ? XCircle : Circle
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', s === 'ok' ? 'bg-success/15 text-success' : s === 'fail' ? 'bg-danger/15 text-danger' : 'bg-surface-2 text-muted')}><I className="size-3.5" />{label}</span>
}

export default function DeviceTest() {
  const cams = useDevices('videoinput'), mics = useDevices('audioinput'), outs = useDevices('audiooutput')
  const [camId, setCamId] = useState(''), [micId, setMicId] = useState(''), [outId, setOutId] = useState('')
  const [cam, setCam] = useState<MediaStream | null>(null), [camErr, setCamErr] = useState<string | null>(null), [camInfo, setCamInfo] = useState('')
  const [mic, setMic] = useState<MediaStream | null>(null), [micErr, setMicErr] = useState<string | null>(null), [analyser, setAnalyser] = useState<AnalyserNode | null>(null), [peak, setPeak] = useState(0)
  const [spk, setSpk] = useState<Status>('idle')
  const [echo, setEcho] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const ac = useRef<AudioContext | null>(null)
  const echoNode = useRef<MediaStreamAudioDestinationNode | null>(null)
  const echoEl = useRef<HTMLAudioElement>(null)

  useEffect(() => () => { stopStream(cam); stopStream(mic); ac.current?.close() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (video.current) video.current.srcObject = cam }, [cam])

  const testCam = async () => {
    stopStream(cam); setCamErr(null)
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: camId ? { deviceId: { exact: camId }, width: { ideal: 1920 } } : { width: { ideal: 1920 } } })
      setCam(s); cams.refresh()
      const st = s.getVideoTracks()[0].getSettings()
      setCamInfo(`${st.width}×${st.height}${st.frameRate ? ` at ${Math.round(st.frameRate)} fps` : ''}`)
    } catch (e) { setCam(null); setCamErr(mediaError(e, 'camera')) }
  }
  const testMic = async () => {
    stopStream(mic); setMicErr(null); setPeak(0)
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: micId ? { deviceId: { exact: micId }, echoCancellation: false, noiseSuppression: false } : { echoCancellation: false, noiseSuppression: false } })
      setMic(s); mics.refresh()
      ac.current?.close()
      const ctx = new AudioContext(); ac.current = ctx
      const src = ctx.createMediaStreamSource(s)
      const an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an); setAnalyser(an)
      const dest = ctx.createMediaStreamDestination(); const delay = ctx.createDelay(2); delay.delayTime.value = 0.4; src.connect(delay).connect(dest); echoNode.current = dest
      const data = new Float32Array(an.fftSize)
      const loop = () => { if (ctx.state === 'closed') return; an.getFloatTimeDomainData(data); let m = 0; for (const v of data) m = Math.max(m, Math.abs(v)); setPeak((p) => Math.max(p, m)); requestAnimationFrame(loop) }
      loop()
    } catch (e) { setMic(null); setMicErr(mediaError(e, 'microphone')) }
  }
  const toggleEcho = async () => {
    const el = echoEl.current; if (!el || !echoNode.current) return
    if (echo) { el.pause(); el.srcObject = null; setEcho(false); return }
    el.srcObject = echoNode.current.stream
    if (outId && (el as any).setSinkId) await (el as any).setSinkId(outId).catch(() => {})
    await el.play(); setEcho(true)
  }
  const playTone = async (side: 'left' | 'right' | 'both') => {
    const ctx = new AudioContext()
    const el = new Audio()
    const dest = ctx.createMediaStreamDestination()
    const osc = ctx.createOscillator(); osc.frequency.value = side === 'left' ? 440 : side === 'right' ? 660 : 523
    const g = ctx.createGain(); g.gain.setValueAtTime(0, ctx.currentTime); g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.05); g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.9)
    const pan = ctx.createStereoPanner(); pan.pan.value = side === 'left' ? -1 : side === 'right' ? 1 : 0
    osc.connect(g).connect(pan).connect(dest); osc.start(); osc.stop(ctx.currentTime + 1)
    el.srcObject = dest.stream
    if (outId && (el as any).setSinkId) await (el as any).setSinkId(outId).catch(() => {})
    await el.play().catch(() => {})
    setTimeout(() => ctx.close(), 1200)
  }
  const micStatus: Status = micErr ? 'fail' : mic ? (peak > 0.02 ? 'ok' : 'idle') : 'idle'
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="space-y-3">
        <div className="flex items-center justify-between"><div className="flex items-center gap-2 font-semibold"><Camera className="size-4 text-accent" />Camera</div><Pill s={camErr ? 'fail' : cam ? 'ok' : 'idle'} label={camErr ? 'Problem' : cam ? 'Working' : 'Not tested'} /></div>
        {cams.devices.length > 0 && <Select value={camId} onChange={setCamId} options={[{ value: '', label: 'Default camera' }, ...cams.devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Camera ${i + 1}` }))]} />}
        <div className="grid aspect-video place-items-center overflow-hidden rounded-xl bg-black">{cam ? <video ref={video} autoPlay muted playsInline className="h-full w-full -scale-x-100 object-cover" /> : <Camera className="size-8 text-white/30" />}</div>
        {camInfo && cam && <p className="font-mono text-xs text-muted">{camInfo}</p>}
        {camErr && <p className="text-xs text-danger">{camErr}</p>}
        <div className="flex gap-2"><Button className="flex-1" onClick={testCam}>{cam ? 'Restart' : 'Test camera'}</Button>{cam && <Button variant="ghost" onClick={() => { stopStream(cam); setCam(null) }}>Stop</Button>}</div>
      </Card>
      <Card className="space-y-3">
        <div className="flex items-center justify-between"><div className="flex items-center gap-2 font-semibold"><Mic className="size-4 text-accent" />Microphone</div><Pill s={micStatus} label={micErr ? 'Problem' : !mic ? 'Not tested' : peak > 0.02 ? 'Hearing you' : 'Say something'} /></div>
        {mics.devices.length > 0 && <Select value={micId} onChange={setMicId} options={[{ value: '', label: 'Default microphone' }, ...mics.devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Microphone ${i + 1}` }))]} />}
        <LevelMeter analyser={analyser} className="h-3" />
        {mic && <p className="text-xs text-muted">Loudest so far: {Math.round(peak * 100)}%. Speak normally; it should reach 30 to 80%.</p>}
        {micErr && <p className="text-xs text-danger">{micErr}</p>}
        <div className="flex flex-wrap gap-2"><Button className="flex-1" onClick={testMic}>{mic ? 'Restart' : 'Test microphone'}</Button>{mic && <Button variant="secondary" onClick={toggleEcho}>{echo ? 'Stop echo' : 'Hear myself'}</Button>}</div>
        {echo && <p className="text-xs text-warn">Use headphones to avoid feedback.</p>}
        <audio ref={echoEl} className="hidden" />
      </Card>
      <Card className="space-y-3">
        <div className="flex items-center justify-between"><div className="flex items-center gap-2 font-semibold"><Volume2 className="size-4 text-accent" />Speakers</div><Pill s={spk} label={spk === 'ok' ? 'Working' : spk === 'fail' ? 'Problem' : 'Not tested'} /></div>
        {outs.devices.length > 0 && 'setSinkId' in HTMLMediaElement.prototype && <Select value={outId} onChange={setOutId} options={[{ value: '', label: 'Default output' }, ...outs.devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Output ${i + 1}` }))]} />}
        <div className="grid grid-cols-3 gap-2"><Button variant="outline" onClick={() => playTone('left')}>Left</Button><Button variant="outline" onClick={() => playTone('both')}>Both</Button><Button variant="outline" onClick={() => playTone('right')}>Right</Button></div>
        <p className="text-sm">Did you hear the tones from the right sides?</p>
        <div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={() => setSpk('ok')}>Yes</Button><Button variant="ghost" className="flex-1" onClick={() => setSpk('fail')}>No</Button></div>
        {spk === 'fail' && <p className="text-xs text-muted">Check the volume, the output device above, and that this tab is not muted.</p>}
      </Card>
      <p className="text-xs text-muted lg:col-span-3">Everything runs in this tab. Nothing is recorded or sent anywhere.</p>
    </div>
  )
}
