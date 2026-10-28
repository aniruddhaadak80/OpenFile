import { useEffect, useRef, useState } from 'react'
import { Clapperboard } from 'lucide-react'
import { Button, Dropzone, Input, Label, Segmented, Slider, ToolGrid, ResultCard } from '@/components/ui'
import { baseName, canvasToBlob, loadImage } from '@/lib/files'
import { ffRun, extFromBlob, X264 } from '@/tools/video/_media/engine'
import { useMediaJob, useObjectUrl } from '@/tools/video/_media/media'
import { JobPanel, FileBar } from '@/tools/video/_media/ui'

const SIZES = { square: [1080, 1080], story: [1080, 1920], wide: [1920, 1080] } as const
type Size = keyof typeof SIZES
const COLORS = ['#F5A524', '#2DD4BF', '#38BDF8', '#A3E635', '#FDE68A', '#F97316']

async function background(o: { size: Size; cover: File | null; title: string; sub: string; color: string; dark: boolean }) {
  const [W, H] = SIZES[o.size]
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = o.dark ? '#0a0a0a' : '#FFFBEB'; ctx.fillRect(0, 0, W, H)
  if (o.cover) {
    const img = await loadImage(o.cover)
    // blurred fill
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight)
    ctx.filter = 'blur(40px) brightness(.45)'; ctx.drawImage(img, (W - img.naturalWidth * s) / 2, (H - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s); ctx.filter = 'none'
    const side = Math.min(W, H) * (o.size === 'wide' ? 0.55 : 0.56), x = o.size === 'wide' ? 120 : (W - side) / 2, y = o.size === 'wide' ? (H - side) / 2 - 60 : H * 0.12
    const t = Math.min(img.naturalWidth, img.naturalHeight)
    ctx.save(); ctx.beginPath(); (ctx as any).roundRect?.(x, y, side, side, 36); ctx.clip(); ctx.drawImage(img, (img.naturalWidth - t) / 2, (img.naturalHeight - t) / 2, t, t, x, y, side, side); ctx.restore()
  } else { ctx.fillStyle = o.color; ctx.globalAlpha = 0.14; ctx.beginPath(); ctx.arc(W * 0.8, H * 0.2, Math.min(W, H) * 0.35, 0, 7); ctx.fill(); ctx.globalAlpha = 1 }
  ctx.fillStyle = o.cover || o.dark ? '#FAFAF9' : '#1C1917'; ctx.textAlign = o.size === 'wide' && o.cover ? 'left' : 'center'
  const tx = o.size === 'wide' && o.cover ? 120 + Math.min(W, H) * 0.55 + 80 : W / 2
  const ty = o.size === 'wide' ? H * 0.38 : o.cover ? H * 0.12 + Math.min(W, H) * 0.56 + 110 : H * 0.36
  const maxW = o.size === 'wide' && o.cover ? W - tx - 100 : W - 160
  let fs = 72; ctx.font = `800 ${fs}px system-ui, sans-serif`
  while (ctx.measureText(o.title).width > maxW && fs > 30) { fs -= 4; ctx.font = `800 ${fs}px system-ui, sans-serif` }
  ctx.fillText(o.title, tx, ty)
  ctx.font = `500 ${Math.round(fs * 0.55)}px system-ui, sans-serif`; ctx.fillStyle = o.color; ctx.fillText(o.sub, tx, ty + fs * 1.1)
  return canvasToBlob(c, 'image/png')
}

export default function AudiogramMaker() {
  const [audio, setAudio] = useState<File | null>(null)
  const [cover, setCover] = useState<File | null>(null)
  const [title, setTitle] = useState('Episode 12: Building in public')
  const [sub, setSub] = useState('The Weekly Show')
  const [size, setSize] = useState<Size>('square')
  const [style, setStyle] = useState<'wave' | 'line' | 'bars'>('wave')
  const [color, setColor] = useState(COLORS[0])
  const [start, setStart] = useState(0)
  const [len, setLen] = useState(30)
  const [dur, setDur] = useState(0)
  const [preview, setPreview] = useState<Blob | null>(null)
  const [out, setOut] = useState<Blob | null>(null)
  const job = useMediaJob()
  const prevUrl = useObjectUrl(preview), outUrl = useObjectUrl(out), audioUrl = useObjectUrl(audio)
  const au = useRef<HTMLAudioElement>(null)

  useEffect(() => { let alive = true; background({ size, cover, title, sub, color, dark: true }).then((b) => alive && setPreview(b)); return () => { alive = false } }, [size, cover, title, sub, color])

  const go = () => job.run(async ({ setProgress, setLabel }) => {
    setOut(null); setLabel('Drawing the background')
    const [W, H] = SIZES[size]
    const bg = await background({ size, cover, title, sub, color, dark: true })
    const ext = extFromBlob(audio!), inA = 'a' + ext, wh = Math.round(H * (size === 'story' ? 0.16 : 0.2)), ww = W - 160
    const y = size === 'wide' ? Math.round(H * 0.62) : Math.round(H - wh - H * 0.1)
    const hex = '0x' + color.slice(1)
    const wave = style === 'bars' ? `showfreqs=s=${ww}x${wh}:mode=bar:ascale=sqrt:fscale=log:win_size=2048:colors=${hex}` : `showwaves=s=${ww}x${wh}:mode=${style === 'wave' ? 'cline' : 'line'}:rate=25:colors=${hex}:scale=sqrt`
    const D = Math.min(len, Math.max(1, dur - start || len))
    setLabel('Making the video (this runs on your device and takes a while)')
    const blob = await ffRun({
      inputs: [{ name: 'bg.png', file: bg }, { name: inA, file: audio! }],
      args: ['-loop', '1', '-framerate', '25', '-i', 'bg.png', '-ss', String(start), '-t', String(D), '-i', inA, '-filter_complex', `[1:a]aformat=channel_layouts=mono,${wave},format=rgba[w];[0:v][w]overlay=80:${y}:shortest=1,format=yuv420p[v]`, '-map', '[v]', '-map', '1:a', ...X264, '-tune', 'stillimage', '-crf', '26', '-r', '25', '-c:a', 'aac', '-b:a', '128k', '-t', String(D), '-movflags', '+faststart', 'out.mp4'],
      output: 'out.mp4', duration: D, onProgress: setProgress,
    })
    setOut(blob)
  })

  if (!audio) return <Dropzone accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.opus,.aac" onFiles={(f) => setAudio(f[0])} label="Drop a podcast or voice clip" sub="Turn audio into a shareable video with a moving waveform, your cover art and a title." />
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <FileBar file={audio} onReset={() => { if (job.busy) job.cancel(); setAudio(null); setOut(null) }} />
          {audioUrl && <audio ref={au} src={audioUrl} controls className="w-full" onLoadedMetadata={(e) => { const d = e.currentTarget.duration; setDur(d); setLen(Math.min(30, Math.floor(d))) }} />}
          {out && outUrl ? <ResultCard blob={out} filename={`${baseName(audio.name)}-audiogram.mp4`} title="Audiogram ready"><video src={outUrl} controls className="max-h-96 w-full rounded-xl bg-black" /></ResultCard>
            : prevUrl && <div className="relative mx-auto max-w-md"><img src={prevUrl} alt="Background preview" className="w-full rounded-2xl border border-border" /><div className="absolute inset-x-[7%] flex items-end justify-center gap-1" style={{ bottom: size === 'wide' ? '24%' : '12%', height: '14%' }} aria-hidden>{Array.from({ length: 40 }, (_, i) => <span key={i} className="w-full rounded-full" style={{ height: `${20 + Math.abs(Math.sin(i * 1.7)) * 80}%`, background: color, opacity: 0.85 }} />)}</div></div>}
          <JobPanel job={job} onRetry={go} />
        </div>
      }
      side={
        <>
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>Subtitle</Label><Input value={sub} onChange={(e) => setSub(e.target.value)} /></div>
          <div><Label>Cover art (optional)</Label>{cover ? <div className="flex items-center gap-2 text-xs"><span className="flex-1 truncate">{cover.name}</span><Button size="sm" variant="ghost" onClick={() => setCover(null)}>Remove</Button></div> : <Dropzone compact accept="image/*" onFiles={(f) => setCover(f[0])} label="Add an image" />}</div>
          <div><Label>Size</Label><Segmented value={size} onChange={setSize} options={[{ value: 'square', label: 'Square' }, { value: 'story', label: 'Story 9:16' }, { value: 'wide', label: 'Wide 16:9' }]} /></div>
          <div><Label>Waveform</Label><Segmented value={style} onChange={setStyle} options={[{ value: 'wave', label: 'Wave' }, { value: 'line', label: 'Line' }, { value: 'bars', label: 'Bars' }]} /></div>
          <div><Label>Colour</Label><div className="flex gap-2">{COLORS.map((c) => <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => setColor(c)} className="size-8 rounded-full border-2 cursor-pointer" style={{ background: c, borderColor: color === c ? 'var(--color-fg, #fff)' : 'transparent' }} />)}</div></div>
          {dur > 0 && <Slider label="Start at" value={start} onChange={setStart} min={0} max={Math.max(0, Math.floor(dur) - 1)} suffix=" s" />}
          <Slider label="Length" value={len} onChange={setLen} min={5} max={Math.max(5, Math.min(180, Math.floor(dur - start) || 60))} suffix=" s" />
          <Button className="w-full" icon={<Clapperboard className="size-4" />} loading={job.busy} onClick={go}>Make audiogram (MP4)</Button>
          <p className="text-xs text-muted">Video is made on your device with FFmpeg. A 30 second clip usually takes one to three minutes. Shorter clips are faster.</p>
        </>
      }
    />
  )
}
