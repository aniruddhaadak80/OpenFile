import { useEffect, useRef, useState } from 'react'
import { LayoutGrid, Download } from 'lucide-react'
import { Button, Dropzone, Field, Progress, Segmented, Select, Slider, Switch, ToolGrid, useJob } from '@/components/ui'
import { baseName, canvasToBlob, downloadBlob, formatBytes, zipFiles } from '@/lib/files'
import { captureFrames, useVideoMeta } from './_media/media'
import { ffRunMany, ffProbe } from './_media/engine'
import { FileBar } from './_media/ui'
import { VIDEO_ACCEPT, inName } from './_b3/shell'
import { clockText, sampleTimes, sheetLayout } from '@/lib/b14/video'

type Theme = 'dark' | 'light'

export default function VideoContactSheet() {
  const [file, setFile] = useState<File | null>(null)
  const { url, meta } = useVideoMeta(file)
  const [cols, setCols] = useState(4)
  const [rows, setRows] = useState(4)
  const [width, setWidth] = useState(1920)
  const [theme, setTheme] = useState<Theme>('dark')
  const [stamps, setStamps] = useState(true)
  const [header, setHeader] = useState(true)
  const [fmt, setFmt] = useState<'jpg' | 'png'>('jpg')
  const [frames, setFrames] = useState<{ img: ImageBitmap; t: number }[]>([])
  const [info, setInfo] = useState<{ w: number; h: number; dur: number } | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const { busy, progress, error, run } = useJob()
  const count = cols * rows

  const grab = () => run(async (setP) => {
    if (!file) return
    let dur = meta?.duration || 0, vw = meta?.width || 0, vh = meta?.height || 0
    let blobs: Blob[] = [], times: number[] = []
    if (meta?.playable !== false && url && dur) {
      times = sampleTimes(dur, count)
      blobs = await captureFrames(url, times, { width: Math.min(960, Math.ceil(width / cols) * 2), type: 'image/jpeg', quality: 0.88, onFrame: (i) => setP((i + 1) / count) })
    } else {
      // the browser cannot play this file (MKV with HEVC, AVI ...), so grab frames with the engine
      const p = await ffProbe(file, inName(file)); dur = p.duration; vw = p.width || 1280; vh = p.height || 720
      if (!dur) throw new Error('Could not read the length of this video.')
      times = sampleTimes(dur, count)
      const sel = times.map((t) => `lt(prev_pts*TB\\,${t.toFixed(2)})*gte(pts*TB\\,${t.toFixed(2)})`).join('+')
      const out = await ffRunMany({ inputs: [{ name: inName(file), file }], args: ['-i', inName(file), '-vf', `select='${sel}',scale=640:-2`, '-fps_mode', 'vfr', '-q:v', '3', 'f_%03d.jpg'], pattern: /^f_\d+\.jpg$/, duration: dur, onProgress: setP })
      blobs = out.map((o) => o.blob)
      times = times.slice(0, blobs.length)
    }
    const bmps = await Promise.all(blobs.map((b) => createImageBitmap(b)))
    if (bmps.length && (!vw || !vh)) { vw = bmps[0].width; vh = bmps[0].height }
    setInfo({ w: vw, h: vh, dur }); setFrames(bmps.map((img, i) => ({ img, t: times[i] })))
  })
  useEffect(() => { if (file && meta && (meta.duration || meta.playable === false)) grab() }, [file, meta, cols, rows])

  useEffect(() => {
    const c = canvas.current
    if (!c || !frames.length || !info || !file) return
    const ar = frames[0].img.width / frames[0].img.height
    const L = sheetLayout(frames.length, cols, ar, width, Math.round(width / 240), header ? Math.round(width / 16) : 0)
    c.width = L.width; c.height = L.height
    const ctx = c.getContext('2d')!
    const bg = theme === 'dark' ? '#0B0D10' : '#F7F5F0', fg = theme === 'dark' ? '#F2EFE8' : '#16181C', sub = theme === 'dark' ? '#9AA0A6' : '#5B6068'
    ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height)
    if (header) {
      const s = L.header
      ctx.fillStyle = fg; ctx.font = `600 ${Math.round(s * 0.3)}px Inter, system-ui, sans-serif`; ctx.textBaseline = 'alphabetic'
      ctx.fillText(file.name.length > 80 ? file.name.slice(0, 77) + '...' : file.name, L.gap * 2, s * 0.45)
      ctx.fillStyle = sub; ctx.font = `${Math.round(s * 0.2)}px Inter, system-ui, sans-serif`
      ctx.fillText([`Length ${clockText(info.dur)}`, `${info.w} x ${info.h}`, formatBytes(file.size), `${frames.length} frames`].join('   |   '), L.gap * 2, s * 0.8)
      ctx.fillStyle = '#F5A524'; ctx.fillRect(L.gap * 2, s - 3, Math.min(160, width / 10), 3)
    }
    frames.forEach((f, i) => {
      const { x, y } = L.cells[i]
      ctx.drawImage(f.img, x, y, L.cellW, L.cellH)
      if (stamps) {
        const t = clockText(f.t), fs = Math.max(11, Math.round(L.cellW / 16))
        ctx.font = `600 ${fs}px "JetBrains Mono", ui-monospace, monospace`
        const tw = ctx.measureText(t).width + fs * 0.8
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x + L.cellW - tw - 6, y + L.cellH - fs * 1.6 - 6, tw, fs * 1.6)
        ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(t, x + L.cellW - tw - 6 + fs * 0.4, y + L.cellH - fs * 0.8 - 6)
      }
    })
  }, [frames, info, width, theme, stamps, header, cols])

  if (!file) return <Dropzone accept={VIDEO_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a video to make a contact sheet" sub="A grid of evenly spaced frames with timestamps, to preview a long video at a glance or share a summary. MP4, MOV, MKV, WEBM, AVI." />
  return (
    <ToolGrid
      main={<>
        <FileBar file={file} onReset={() => { setFile(null); setFrames([]); setInfo(null) }} />
        {busy && <Progress value={progress} label="Grabbing frames" />}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-2"><canvas ref={canvas} className="block h-auto w-full" aria-label="Contact sheet preview" /></div>
      </>}
      side={<>
        <Slider label="Columns" value={cols} onChange={setCols} min={2} max={8} />
        <Slider label="Rows" value={rows} onChange={setRows} min={1} max={12} />
        <Field label="Sheet width"><Select value={String(width)} onChange={(v) => setWidth(+v)} options={[{ value: '1280', label: '1280 px' }, { value: '1920', label: '1920 px' }, { value: '2560', label: '2560 px' }, { value: '3840', label: '3840 px (4K)' }]} /></Field>
        <Field label="Look"><Segmented value={theme} onChange={setTheme} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} /></Field>
        <Switch checked={stamps} onChange={setStamps} label="Timestamps on frames" />
        <Switch checked={header} onChange={setHeader} label="Title and details on top" />
        <Field label="Format"><Segmented value={fmt} onChange={setFmt} options={[{ value: 'jpg', label: 'JPG' }, { value: 'png', label: 'PNG' }]} /></Field>
        <Button size="lg" className="w-full" icon={<LayoutGrid className="size-5" />} disabled={!frames.length || busy} onClick={async () => canvas.current && downloadBlob(await canvasToBlob(canvas.current, fmt === 'png' ? 'image/png' : 'image/jpeg', 0.9), `${baseName(file.name)}-contact-sheet.${fmt}`)}>Download sheet</Button>
        <Button variant="outline" className="w-full" icon={<Download className="size-4" />} disabled={!frames.length || busy} onClick={async () => {
          const files = await Promise.all(frames.map(async (f, i) => { const c = document.createElement('canvas'); c.width = f.img.width; c.height = f.img.height; c.getContext('2d')!.drawImage(f.img, 0, 0); return { name: `frame-${String(i + 1).padStart(2, '0')}-${clockText(f.t).replace(/:/g, '-')}.jpg`, data: await canvasToBlob(c, 'image/jpeg', 0.9) } }))
          downloadBlob(await zipFiles(files), `${baseName(file.name)}-frames.zip`)
        }}>Frames as ZIP</Button>
      </>}
    />
  )
}
