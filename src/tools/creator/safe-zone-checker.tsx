import { useEffect, useRef, useState } from 'react'
import { ImageDown } from 'lucide-react'
import { Button, Card, Dropzone, Label, Select, Slider, Switch } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { SAFE_ZONES } from '@/lib/cf/creator'
import { canvasBlob, drawCover } from '@/lib/cf/canvas'
import { FileBar } from '@/lib/cf/ui'

export default function SafeZoneChecker() {
  const [file, setFile] = useState<File | null>(null)
  const [src, setSrc] = useState<HTMLImageElement | HTMLVideoElement | null>(null)
  const [preset, setPreset] = useState('reels')
  const [opacity, setOpacity] = useState(45), [labels, setLabels] = useState(true), [grid, setGrid] = useState(true)
  const [t, setT] = useState(0), [dur, setDur] = useState(0), [, setTick] = useState(0)
  const cv = useRef<HTMLCanvasElement>(null)
  const z = SAFE_ZONES[preset]
  const [rw, rh] = z.ratio.split(':').map(Number)
  const W = rw > rh ? 960 : 540, H = Math.round((W * rh) / rw)
  const open = (f: File) => {
    setFile(f); const url = URL.createObjectURL(f)
    if (f.type.startsWith('video')) { const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url; v.onloadeddata = () => { setDur(v.duration || 0); setSrc(v) }; v.onseeked = () => setTick((x) => x + 1) }
    else { const i = new Image(); i.onload = () => setSrc(i); i.src = url }
  }
  useEffect(() => { if (src instanceof HTMLVideoElement && Math.abs(src.currentTime - t) > 0.05) src.currentTime = t }, [t, src])
  const draw = (withZones = true) => {
    const c = cv.current; if (!c) return; c.width = W; c.height = H; const g = c.getContext('2d')!
    g.fillStyle = '#111'; g.fillRect(0, 0, W, H)
    if (src) drawCover(g, src, 0, 0, W, H)
    if (!withZones) return
    if (grid) { g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.setLineDash([4, 6]); for (const k of [1, 2]) { g.beginPath(); g.moveTo((W * k) / 3, 0); g.lineTo((W * k) / 3, H); g.moveTo(0, (H * k) / 3); g.lineTo(W, (H * k) / 3); g.stroke() } g.setLineDash([]) }
    for (const r of z.zones) {
      const x = (r.x / 100) * W, y = (r.y / 100) * H, w = (r.w / 100) * W, h = (r.h / 100) * H
      g.fillStyle = `rgba(239,68,68,${opacity / 100})`; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(245,165,36,.9)'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2)
      if (labels) { g.font = '600 14px Inter, Arial'; g.fillStyle = '#fff'; g.fillText(r.name, x + 8, y + 20) }
    }
  }
  useEffect(() => { draw() })
  const exportPng = async () => { draw(true); downloadBlob(await canvasBlob(cv.current!), `${preset}-safe-zones.png`) }
  if (!file) return (
    <div className="space-y-4">
      <Dropzone accept="image/*,video/*" onFiles={(f) => open(f[0])} label="Drop a frame, thumbnail or short video" sub="See which parts the app covers with buttons, captions and bars before you post." />
      <Card className="flex flex-wrap items-center gap-3"><Label className="mb-0">Or check an empty frame for</Label><Select className="w-56" value={preset} onChange={(v) => { setPreset(v); setFile(new File([], 'Empty frame')) }} options={Object.entries(SAFE_ZONES).map(([k, v]) => ({ value: k, label: v.label }))} /></Card>
    </div>
  )
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <FileBar name={file.name} size={file.size || undefined} onReset={() => { setFile(null); setSrc(null) }} />
        <div className="flex justify-center rounded-2xl border border-border bg-surface-2/40 p-3"><canvas ref={cv} className="max-h-[70vh] max-w-full rounded-lg shadow-xl" style={{ aspectRatio: `${rw}/${rh}` }} aria-label="Frame with safe zones" /></div>
        {dur > 0 && <Slider label="Frame" value={t} onChange={setT} min={0} max={Math.max(0.1, dur)} step={0.1} suffix=" s" />}
      </div>
      <Card className="space-y-4 self-start">
        <div><Label>App and format</Label><Select value={preset} onChange={setPreset} options={Object.entries(SAFE_ZONES).map(([k, v]) => ({ value: k, label: `${v.label} (${v.ratio})` }))} /></div>
        <Slider label="Zone shading" value={opacity} onChange={setOpacity} min={10} max={90} suffix="%" />
        <Switch checked={labels} onChange={setLabels} label="Zone names" /><Switch checked={grid} onChange={setGrid} label="Rule of thirds" />
        <p className="text-xs text-muted">Keep faces, text and logos out of the red areas. Zones are measured from current app layouts and can shift a little between phones.</p>
        <Button className="w-full" icon={<ImageDown className="size-4" />} onClick={exportPng}>Download overlay PNG</Button>
      </Card>
    </div>
  )
}
