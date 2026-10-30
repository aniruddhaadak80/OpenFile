import { useEffect, useRef, useState } from 'react'
import { Clapperboard, ImagePlus } from 'lucide-react'
import { Button, Dropzone, Input, Label, Select, Segmented, ToolGrid, ResultCard } from '@/components/ui'
import { baseName } from '@/lib/files'
import { ffRun, extFromBlob } from '@/tools/video/_media/engine'
import { useMediaJob, useObjectUrl } from '@/tools/video/_media/media'
import { JobPanel, FileBar, Note } from '@/tools/video/_media/ui'
import { AUDIO_ACCEPT, mediaDuration } from './_b4/FxShell'
import { vizGraph, type Viz } from '@/lib/b3/viz'

const SIZES = { landscape: [1280, 720], square: [720, 720], portrait: [720, 1280] } as const
type Size = keyof typeof SIZES

async function background(w: number, h: number, cover: Blob | null, title: string, artist: string, bg: string, viz: Viz): Promise<Blob> {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h)
  let img: ImageBitmap | null = null
  if (cover) { try { img = await createImageBitmap(cover) } catch { img = null } }
  if (img) {
    const s = Math.max(w / img.width, h / img.height)
    ctx.filter = 'blur(28px) brightness(0.45)'; ctx.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s); ctx.filter = 'none'
  }
  const portrait = h > w
  const art = viz === 'circle' ? 0 : Math.round(Math.min(w, h) * (portrait ? 0.62 : 0.44))
  const ax = portrait ? (w - art) / 2 : Math.round(w * 0.08), ay = portrait ? Math.round(h * 0.12) : Math.round(h * 0.12)
  if (img && art) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 30; const s = Math.max(art / img.width, art / img.height); ctx.beginPath(); ctx.roundRect(ax, ay, art, art, 18); ctx.clip(); ctx.drawImage(img, ax + (art - img.width * s) / 2, ay + (art - img.height * s) / 2, img.width * s, img.height * s); ctx.restore() }
  ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'top'
  const tx = portrait || !art || viz === 'circle' ? w / 2 : ax + art + Math.round(w * 0.05)
  const ty = portrait ? ay + art + Math.round(h * 0.04) : viz === 'circle' ? Math.round(h * 0.06) : ay + Math.round(art * 0.3)
  ctx.textAlign = portrait || !art || viz === 'circle' ? 'center' : 'left'
  const maxW = portrait || !art || viz === 'circle' ? w * 0.86 : w - tx - w * 0.06
  const fit = (t: string, size: number, weight: number) => { let s = size; do { ctx.font = `${weight} ${s}px system-ui, 'Segoe UI', Arial, sans-serif`; s -= 2 } while (ctx.measureText(t).width > maxW && s > 12); return s }
  if (title) { const s = fit(title, Math.round(h * (portrait ? 0.05 : 0.07)), 800); ctx.fillText(title, tx, ty); if (artist) { fit(artist, Math.round(h * 0.04), 500); ctx.globalAlpha = 0.8; ctx.fillText(artist, tx, ty + s * 1.35); ctx.globalAlpha = 1 } }
  img?.close()
  return new Promise((r) => c.toBlob((b) => r(b!), 'image/png'))
}

export default function MusicVisualizer() {
  const [file, setFile] = useState<File | null>(null)
  const [cover, setCover] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [viz, setViz] = useState<Viz>('waves')
  const [size, setSize] = useState<Size>('square')
  const [color, setColor] = useState('#F5A524')
  const [bg, setBg] = useState('#101010')
  const [fps, setFps] = useState('25')
  const [duration, setDuration] = useState(0)
  const [preview, setPreview] = useState<Blob | null>(null)
  const [result, setResult] = useState<Blob | null>(null)
  const job = useMediaJob()
  const previewUrl = useObjectUrl(preview)
  const resultUrl = useObjectUrl(result)
  const tok = useRef(0)

  useEffect(() => {
    if (!file) return
    setTitle(baseName(file.name)); mediaDuration(file).then(setDuration)
    import('music-metadata').then(async (mm) => { try { const m = await mm.parseBlob(file); if (m.common.title) setTitle(m.common.title); if (m.common.artist) setArtist(m.common.artist); const p = m.common.picture?.[0]; if (p && !cover) setCover(new File([p.data as BlobPart], 'cover', { type: p.format })) } catch { /* no tags */ } })
  }, [file]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!file) return; const t = ++tok.current; const [w, h] = SIZES[size]; background(w, h, cover, title, artist, bg, viz).then((b) => { if (t === tok.current) setPreview(b) }) }, [file, cover, title, artist, bg, viz, size])

  const make = () => file && job.run(async ({ setLabel, setProgress }) => {
    setResult(null)
    const [w, h] = SIZES[size]
    setLabel('Drawing background')
    const bgPng = await background(w, h, cover, title, artist, bg, viz)
    const inName = 'in' + extFromBlob(file)
    setLabel('Rendering video')
    const graph = vizGraph(viz, w, h, color, +fps)
    setResult(await ffRun({
      inputs: [{ name: 'bg.png', file: bgPng }, { name: inName, file }],
      args: ['-loop', '1', '-framerate', fps, '-i', 'bg.png', '-i', inName, '-filter_complex', graph, '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage', '-crf', '26', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', 'out.mp4'],
      output: 'out.mp4', duration: duration || undefined, onProgress: setProgress,
    }))
  })

  if (!file) return <Dropzone accept={AUDIO_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a song or podcast clip" sub="Turn audio into a shareable MP4 with your cover art and a moving waveform or spectrum." />
  return (
    <ToolGrid
      main={<>
        <FileBar file={file} onReset={() => { setFile(null); setResult(null); setCover(null) }} />
        {!result && previewUrl && <div className="overflow-hidden rounded-2xl border border-border"><img src={previewUrl} alt="Video background preview" className="mx-auto max-h-[55vh]" /></div>}
        {!result && <p className="text-xs text-muted">This is the background. The {viz === 'circle' ? 'scope' : 'animation'} is drawn on top when you render.</p>}
        {result && resultUrl && <ResultCard blob={result} filename={`${baseName(file.name)}-visualizer.mp4`} onReset={() => setResult(null)}><video src={resultUrl} controls className="mx-auto max-h-[55vh] rounded-xl bg-black" /></ResultCard>}
      </>}
      side={<>
        <div><Label>Animation</Label><Select value={viz} onChange={setViz} options={[{ value: 'waves', label: 'Waveform' }, { value: 'line', label: 'Thin line' }, { value: 'bars', label: 'Frequency bars' }, { value: 'spectrum', label: 'Scrolling spectrum' }, { value: 'circle', label: 'Stereo scope' }]} /></div>
        <div><Label>Shape</Label><Segmented value={size} onChange={setSize} options={[{ value: 'square', label: 'Square' }, { value: 'landscape', label: '16:9' }, { value: 'portrait', label: '9:16' }]} /></div>
        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border px-2 py-2 text-sm font-medium hover:border-accent"><ImagePlus className="size-4" />{cover ? 'Change cover image' : 'Add cover image'}<input type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setCover(f); e.target.value = '' }} /></label>
        <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" /></div>
        <div><Label>Artist or show</Label><Input value={artist} onChange={(e) => setArtist(e.target.value)} aria-label="Artist" /></div>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs text-muted">Wave<input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="mt-1 block h-9 w-full cursor-pointer rounded-lg border border-border bg-transparent" /></label>
          <label className="text-xs text-muted">Background<input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="mt-1 block h-9 w-full cursor-pointer rounded-lg border border-border bg-transparent" /></label>
          <label className="text-xs text-muted">FPS<select value={fps} onChange={(e) => setFps(e.target.value)} className="mt-1 block h-9 w-full rounded-lg border border-border bg-surface-2/60 px-1 text-sm text-fg"><option value="15">15</option><option value="25">25</option><option value="30">30</option></select></label>
        </div>
        {duration > 120 && <Note tone="warn">Long audio takes a while to render in the browser (often slower than real time). Trim to a highlight for social posts.</Note>}
        <Button size="lg" className="w-full" icon={<Clapperboard className="size-5" />} onClick={make} loading={job.busy}>Render MP4</Button>
        <JobPanel job={job} onRetry={make} />
      </>}
    />
  )
}
