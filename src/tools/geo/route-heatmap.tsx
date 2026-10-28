import { useEffect, useRef, useState } from 'react'
import { Dropzone, Label, Progress, Segmented, Slider, ToolGrid, ErrorNote } from '@/components/ui'
import { canvasToBlob } from '@/lib/files'
import { trackStats, fmtKm, type Track } from '@/lib/bcat/geo2'
import { loadTracks, TRACK_ACCEPT } from '@/lib/bcat/geoui'
import { DlButton } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

type Theme = 'gold' | 'teal' | 'fire'
const THEMES: Record<Theme, { bg: string; line: string }> = { gold: { bg: '#050505', line: '245,165,36' }, teal: { bg: '#03110f', line: '45,212,191' }, fire: { bg: '#0a0502', line: '249,115,22' } }
const merc = (lat: number, lon: number) => { const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180); return [(lon + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)] }

function render(tracks: Track[], W: number, H: number, theme: Theme, width: number, glow: number) {
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d')!, t = THEMES[theme]
  ctx.fillStyle = t.bg; ctx.fillRect(0, 0, W, H)
  const pts = tracks.flatMap((x) => x.points); if (!pts.length) return c
  // fit to the densest area: use 2nd to 98th percentile so one far trip does not shrink the rest
  const xs = pts.map((p) => merc(p.lat, p.lon)[0]).sort((a, b) => a - b), ys = pts.map((p) => merc(p.lat, p.lon)[1]).sort((a, b) => a - b)
  const q = (a: number[], f: number) => a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * f)))]
  const minX = q(xs, 0.01), maxX = q(xs, 0.99), minY = q(ys, 0.01), maxY = q(ys, 0.99)
  const pad = 0.06, scale = Math.min(W / Math.max(1e-9, maxX - minX), H / Math.max(1e-9, maxY - minY)) * (1 - pad * 2)
  const x0 = (minX + maxX) / 2 - W / 2 / scale, y0 = (minY + maxY) / 2 - H / 2 / scale
  ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  const alpha = Math.max(0.04, Math.min(0.6, 3 / Math.sqrt(tracks.length + 1)))
  for (const pass of glow ? [{ w: width * 4, a: alpha * 0.15 * glow / 5 }, { w: width, a: alpha }] : [{ w: width, a: alpha }]) {
    ctx.strokeStyle = `rgba(${t.line},${pass.a})`; ctx.lineWidth = pass.w
    for (const tr of tracks) { ctx.beginPath(); tr.points.forEach((p, i) => { const [mx, my] = merc(p.lat, p.lon), x = (mx - x0) * scale, y = (my - y0) * scale; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y) }); ctx.stroke() }
  }
  ctx.globalCompositeOperation = 'source-over'
  return c
}

export default function RouteHeatmap() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [prog, setProg] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>('gold')
  const [width, setWidth] = useState(2)
  const [glow, setGlow] = useState(5)
  const [size, setSize] = useState<'square' | 'wide' | 'poster'>('square')
  const cv = useRef<HTMLCanvasElement>(null)
  const dims = { square: [2048, 2048], wide: [3000, 1688], poster: [2480, 3508] }[size]

  const add = async (fs: File[]) => {
    setErr(null)
    const got: Track[] = []
    for (let i = 0; i < fs.length; i++) { setProg(i / fs.length); try { got.push(...(await loadTracks(fs[i])).tracks) } catch { /* skip */ } }
    if (!got.length) setErr('No tracks found in these files.')
    setTracks((p) => [...p, ...got]); setProg(null)
  }
  useEffect(() => {
    const c = cv.current; if (!c || !tracks.length) return
    const W = c.clientWidth || 600, H = (W * dims[1]) / dims[0], dpr = window.devicePixelRatio || 1
    const img = render(tracks, Math.round(W * dpr), Math.round(H * dpr), theme, width * dpr * 0.6, glow)
    c.width = img.width; c.height = img.height; c.style.height = H + 'px'
    c.getContext('2d')!.drawImage(img, 0, 0)
  }, [tracks, theme, width, glow, size])

  if (!tracks.length) return <><Dropzone multiple accept={TRACK_ACCEPT} onFiles={add} label="Drop all your GPX or TCX activities" sub="Every route is drawn on top of each other, so the roads you use most glow brightest. Make a poster from a year of runs or rides." />{prog != null && <Progress value={prog} label="Reading tracks" />}<ErrorNote error={err} /></>
  const total = tracks.reduce((s, t) => s + trackStats(t.points).distance, 0)
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2"><Stat label="Routes" value={tracks.length} /><Stat label="Total distance" value={fmtKm(total)} /><Stat label="Points" value={tracks.reduce((s, t) => s + t.points.length, 0).toLocaleString()} /></div>
          {prog != null && <Progress value={prog} label="Reading tracks" />}
          <canvas ref={cv} className="w-full rounded-2xl border border-border" aria-label="Route heatmap" />
          <Dropzone compact multiple accept={TRACK_ACCEPT} onFiles={add} label="Add more routes" />
        </div>
      }
      side={
        <>
          <div><Label>Colour</Label><Segmented value={theme} onChange={setTheme} options={[{ value: 'gold', label: 'Gold' }, { value: 'teal', label: 'Teal' }, { value: 'fire', label: 'Ember' }]} /></div>
          <div><Label>Size</Label><Segmented value={size} onChange={setSize} options={[{ value: 'square', label: 'Square' }, { value: 'wide', label: 'Wide' }, { value: 'poster', label: 'A4 poster' }]} /></div>
          <Slider label="Line width" value={width} onChange={setWidth} min={1} max={8} />
          <Slider label="Glow" value={glow} onChange={setGlow} min={0} max={10} />
          <DlButton variant="primary" className="w-full" name={`route-heatmap-${dims[0]}x${dims[1]}.png`} data={() => canvasToBlob(render(tracks, dims[0], dims[1], theme, width * 1.6, glow), 'image/png')}>Download PNG ({dims[0]}×{dims[1]})</DlButton>
          <p className="text-xs text-muted">The view centres on where most of your routes are, so one far-away trip does not shrink the rest.</p>
        </>
      }
    />
  )
}
