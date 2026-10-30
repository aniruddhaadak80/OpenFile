import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Timer } from 'lucide-react'
import { Button, Field, Input, ResultCard, Segmented, Select, Slider, Switch, ToolGrid } from '@/components/ui'
import { ffRun } from './_media/engine'
import { useMediaJob, useObjectUrl } from './_media/media'
import { JobPanel } from './_media/ui'
import { beepTrack, countdownLabel } from '@/lib/b14/video'

type Style = 'ring' | 'leader' | 'bar' | 'minimal' | 'dots'
type Out = 'mp4' | 'webm' | 'gif'
interface Opts { seconds: number; style: Style; w: number; h: number; bg: string; accent: string; fg: string; end: string; title: string; transparent: boolean }

const SIZES = [{ value: '1280x720', label: 'Landscape 1280 x 720' }, { value: '1920x1080', label: 'Landscape 1920 x 1080' }, { value: '1080x1920', label: 'Vertical 1080 x 1920 (Reels, Shorts)' }, { value: '1080x1080', label: 'Square 1080 x 1080' }, { value: '720x720', label: 'Square 720 x 720' }]
const COLORS = [{ name: 'Gold', bg: '#0B0D10', accent: '#F5A524', fg: '#F7F3EA' }, { name: 'Teal', bg: '#06201F', accent: '#14B8A6', fg: '#E6FFFB' }, { name: 'Sky', bg: '#08182A', accent: '#38BDF8', fg: '#EAF6FF' }, { name: 'Lime', bg: '#101806', accent: '#84CC16', fg: '#F4FFE6' }, { name: 'Paper', bg: '#F5F1E8', accent: '#F97316', fg: '#1A1C20' }]

/** Draw one frame of the countdown at time t (seconds). */
function drawFrame(ctx: CanvasRenderingContext2D, t: number, o: Opts) {
  const { w, h } = o, m = Math.min(w, h), cx = w / 2, cy = h / 2
  ctx.clearRect(0, 0, w, h)
  if (!o.transparent) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, w, h) }
  const label = countdownLabel(t, o.seconds, o.end)
  const done = t >= o.seconds
  const frac = done ? 1 : t - Math.floor(t) // progress inside the current second
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  const big = (size: number, color = o.fg) => { ctx.fillStyle = color; ctx.font = `800 ${Math.round(size)}px Inter, "Segoe UI", system-ui, sans-serif`; ctx.fillText(label, cx, cy + size * 0.04) }
  if (o.title) { ctx.fillStyle = o.fg; ctx.globalAlpha = 0.75; ctx.font = `600 ${Math.round(m * 0.055)}px Inter, system-ui, sans-serif`; ctx.fillText(o.title, cx, h * 0.12); ctx.globalAlpha = 1 }
  if (done) {
    const s = Math.min(1, (t - o.seconds) / 0.35)
    ctx.save(); ctx.translate(cx, cy); ctx.scale(0.7 + 0.3 * s, 0.7 + 0.3 * s); ctx.translate(-cx, -cy); ctx.globalAlpha = s
    big(label.length > 4 ? m * 0.16 : m * 0.3, o.accent); ctx.restore(); ctx.globalAlpha = 1
    return
  }
  if (o.style === 'ring') {
    const R = m * 0.32
    ctx.lineWidth = m * 0.035; ctx.strokeStyle = o.fg; ctx.globalAlpha = 0.14; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1
    ctx.strokeStyle = o.accent; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - frac)); ctx.stroke()
    const pop = 1 + 0.12 * Math.max(0, 1 - frac * 6)
    ctx.save(); ctx.translate(cx, cy); ctx.scale(pop, pop); ctx.translate(-cx, -cy); big(m * 0.3); ctx.restore()
  } else if (o.style === 'leader') {
    // classic film leader: crosshair, two circles and a sweeping wedge
    ctx.fillStyle = o.transparent ? 'rgba(0,0,0,0)' : o.bg
    const R = Math.hypot(w, h)
    ctx.fillStyle = o.accent; ctx.globalAlpha = 0.28; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1
    ctx.strokeStyle = o.fg; ctx.lineWidth = m * 0.008
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke()
    ctx.lineWidth = m * 0.012; for (const r of [0.36, 0.42]) { ctx.beginPath(); ctx.arc(cx, cy, m * r, 0, Math.PI * 2); ctx.stroke() }
    ctx.globalAlpha = 0.06 + 0.04 * Math.sin(t * 40); ctx.fillStyle = o.fg; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1
    big(m * 0.42)
  } else if (o.style === 'bar') {
    const total = o.seconds, p = Math.min(1, t / total)
    big(m * 0.34)
    const bw = w * 0.7, bh = m * 0.03, bx = (w - bw) / 2, by = h * 0.78
    ctx.fillStyle = o.fg; ctx.globalAlpha = 0.15; ctx.fillRect(bx, by, bw, bh); ctx.globalAlpha = 1
    ctx.fillStyle = o.accent; ctx.fillRect(bx, by, bw * (1 - p), bh)
  } else if (o.style === 'dots') {
    big(m * 0.3)
    const n = Math.min(o.seconds, 20), gap = Math.min(m * 0.06, (w * 0.8) / n), r = gap * 0.28, y = h * 0.8, x0 = cx - ((n - 1) * gap) / 2
    for (let i = 0; i < n; i++) { const left = o.seconds - t; ctx.fillStyle = i < Math.ceil(left) - (o.seconds - n) ? o.accent : o.fg; ctx.globalAlpha = i < Math.ceil(left) - (o.seconds - n) ? 1 : 0.18; ctx.beginPath(); ctx.arc(x0 + i * gap, y, r, 0, Math.PI * 2); ctx.fill() }
    ctx.globalAlpha = 1
  } else {
    const a = Math.min(1, frac * 5) * Math.min(1, (1 - frac) * 5)
    ctx.globalAlpha = 0.25 + 0.75 * a; big(m * 0.4, o.accent); ctx.globalAlpha = 1
  }
}

export default function CountdownVideo() {
  const [seconds, setSeconds] = useState(10)
  const [style, setStyle] = useState<Style>('ring')
  const [size, setSize] = useState('1280x720')
  const [pal, setPal] = useState(0)
  const [end, setEnd] = useState('Go')
  const [title, setTitle] = useState('')
  const [beeps, setBeeps] = useState(true)
  const [hold, setHold] = useState(1.5)
  const [fps, setFps] = useState(30)
  const [out, setOut] = useState<Out>('mp4')
  const [playing, setPlaying] = useState(true)
  const [res, setRes] = useState<{ blob: Blob; name: string } | null>(null)
  const resUrl = useObjectUrl(res?.blob)
  const canvas = useRef<HTMLCanvasElement>(null)
  const job = useMediaJob()
  const [w, h] = size.split('x').map(Number)
  const c = COLORS[pal]
  const opts: Opts = { seconds, style, w, h, bg: c.bg, accent: c.accent, fg: c.fg, end, title, transparent: out === 'webm' }
  const total = seconds + (end ? hold : 0.04)

  useEffect(() => {
    const cv = canvas.current; if (!cv) return
    cv.width = w; cv.height = h
    const ctx = cv.getContext('2d')!
    let raf = 0, t0 = performance.now()
    const loop = (now: number) => { const t = ((now - t0) / 1000) % (total + 0.6); drawFrame(ctx, Math.min(t, total), opts); if (playing) raf = requestAnimationFrame(loop) }
    if (playing) raf = requestAnimationFrame(loop); else drawFrame(ctx, Math.min(seconds - 0.4, total), opts)
    return () => cancelAnimationFrame(raf)
  }, [seconds, style, size, pal, end, title, playing, out, hold])

  const render = () => job.run(async ({ setProgress, setLabel, signal }) => {
    setRes(null)
    const n = Math.round(total * fps)
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    const ctx = cv.getContext('2d')!
    const inputs: { name: string; file: Blob | Uint8Array }[] = []
    const transparent = out === 'webm'
    const scale = out === 'gif' ? Math.min(1, 640 / Math.max(w, h)) : 1
    setLabel('Drawing frames')
    for (let i = 0; i < n; i++) {
      if (signal.aborted) return
      drawFrame(ctx, i / fps, opts)
      const b = await new Promise<Blob>((r, j) => cv.toBlob((x) => (x ? r(x) : j(new Error('Could not draw a frame.'))), transparent ? 'image/png' : 'image/jpeg', 0.9))
      inputs.push({ name: `f${String(i).padStart(5, '0')}.${transparent ? 'png' : 'jpg'}`, file: new Uint8Array(await b.arrayBuffer()) })
      if (i % 10 === 0) setProgress((i / n) * 0.35)
    }
    const pat = transparent ? 'f%05d.png' : 'f%05d.jpg'
    const audio = beeps && out !== 'gif'
    if (audio) inputs.push({ name: 'beep.wav', file: beepTrack(seconds, total, 44100, 880, 1320, !!end) })
    setLabel('Encoding video')
    const prog = (p: number) => setProgress(0.35 + p * 0.65)
    let blob: Blob, name: string
    if (out === 'mp4') {
      blob = await ffRun({ inputs, duration: total, onProgress: prog, output: 'countdown.mp4', args: ['-framerate', String(fps), '-i', pat, ...(audio ? ['-i', 'beep.wav'] : []), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', ...(audio ? ['-c:a', 'aac', '-b:a', '128k', '-shortest'] : []), '-movflags', '+faststart', 'countdown.mp4'] })
      name = `countdown-${seconds}s.mp4`
    } else if (out === 'webm') {
      blob = await ffRun({ inputs, duration: total, onProgress: prog, output: 'countdown.webm', args: ['-framerate', String(fps), '-i', pat, ...(audio ? ['-i', 'beep.wav'] : []), '-c:v', 'libvpx', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '2M', '-deadline', 'realtime', '-cpu-used', '8', ...(audio ? ['-c:a', 'libvorbis', '-shortest'] : []), 'countdown.webm'] })
      name = `countdown-${seconds}s-transparent.webm`
    } else {
      blob = await ffRun({ inputs, duration: total, onProgress: prog, output: 'countdown.gif', args: ['-framerate', String(fps), '-i', pat, '-vf', `fps=${Math.min(fps, 20)},scale=${Math.round(w * scale / 2) * 2}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer`, 'countdown.gif'] })
      name = `countdown-${seconds}s.gif`
    }
    setRes({ blob, name })
  })

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <div className="relative overflow-hidden rounded-2xl border border-border checker">
            <canvas ref={canvas} className="mx-auto block max-h-[62vh] w-auto max-w-full" aria-label="Countdown preview" />
            <Button size="sm" variant="secondary" className="absolute bottom-3 right-3" icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</Button>
          </div>
          <p className="text-center text-xs text-muted">Live preview. The video is drawn frame by frame at full size when you press Make video.</p>
        </>}
        side={<>
          <Slider label="Count down from" value={seconds} onChange={setSeconds} min={3} max={60} suffix=" s" />
          <Field label="Style"><Select value={style} onChange={setStyle} options={[{ value: 'ring', label: 'Ring timer' }, { value: 'leader', label: 'Film leader' }, { value: 'bar', label: 'Number and bar' }, { value: 'dots', label: 'Number and dots' }, { value: 'minimal', label: 'Big number fade' }]} /></Field>
          <Field label="Size"><Select value={size} onChange={setSize} options={SIZES} /></Field>
          <Field label="Colours"><div className="flex flex-wrap gap-1.5">{COLORS.map((p, i) => <button key={p.name} onClick={() => setPal(i)} aria-pressed={pal === i} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${pal === i ? 'border-accent' : 'border-border'}`}><span className="size-3.5 rounded-full" style={{ background: p.accent, boxShadow: `0 0 0 3px ${p.bg}` }} />{p.name}</button>)}</div></Field>
          <Field label="Title on top (optional)"><Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 60))} placeholder="Starting soon" /></Field>
          <Field label="End text (empty for none)"><Input value={end} onChange={(e) => setEnd(e.target.value.slice(0, 24))} /></Field>
          {end && <Slider label="Hold end text" value={hold} onChange={setHold} min={0.5} max={5} step={0.5} suffix=" s" />}
          <Field label="Format"><Segmented value={out} onChange={setOut} options={[{ value: 'mp4', label: 'MP4' }, { value: 'webm', label: 'WebM clear' }, { value: 'gif', label: 'GIF' }]} /></Field>
          {out === 'webm' && <p className="text-xs text-muted">Transparent background, for overlays in video editors and OBS.</p>}
          <Field label="Frame rate"><Segmented value={String(fps)} onChange={(v) => setFps(+v)} options={['24', '30', '60']} /></Field>
          {out !== 'gif' && <Switch checked={beeps} onChange={setBeeps} label="Beep every second" />}
          <Button size="lg" className="w-full" icon={<Timer className="size-5" />} onClick={render} loading={job.busy}>Make video</Button>
          <JobPanel job={job} onRetry={render} />
        </>}
      />
      {res && resUrl && (
        <ResultCard blob={res.blob} filename={res.name} title="Countdown ready" onReset={() => setRes(null)}>
          {res.name.endsWith('.gif') ? <img src={resUrl} alt="Countdown GIF" className="max-h-80 rounded-xl" /> : <video src={resUrl} controls playsInline className="max-h-80 w-full rounded-xl bg-black" />}
        </ResultCard>
      )}
    </div>
  )
}
