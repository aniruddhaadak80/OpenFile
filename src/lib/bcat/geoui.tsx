/* Shared pieces for the Maps and GPS tools: track file loading and a canvas map with an optional tile background. */
import { useEffect, useRef, useState } from 'react'
import { Switch } from '@/components/ui'
import { parseGpx, tracksFromGeoJSON, type Track, type Wpt } from './geo2'

export const TRACK_ACCEPT = '.gpx,.tcx,.kml,.kmz,.geojson,.json'

export async function loadTracks(f: File): Promise<{ tracks: Track[]; waypoints: Wpt[] }> {
  const n = f.name.toLowerCase(), base = f.name.replace(/\.[^.]+$/, '')
  if (n.endsWith('.gpx') || n.endsWith('.tcx')) return parseGpx(await f.text(), base)
  if (n.endsWith('.geojson') || n.endsWith('.json')) return { tracks: tracksFromGeoJSON(JSON.parse(await f.text()), base), waypoints: [] }
  let xml: string
  if (n.endsWith('.kmz')) { const { unzipSync, strFromU8 } = await import('fflate'); const z = unzipSync(new Uint8Array(await f.arrayBuffer())); const k = Object.keys(z).find((p) => p.toLowerCase().endsWith('.kml')); if (!k) throw new Error('No KML inside this KMZ'); xml = strFromU8(z[k]) } else xml = await f.text()
  const tg = await import('@tmcw/togeojson')
  const fc = tg.kml(new DOMParser().parseFromString(xml, 'text/xml')) as any
  const wpts: Wpt[] = fc.features.filter((x: any) => x.geometry?.type === 'Point').map((x: any) => ({ lon: x.geometry.coordinates[0], lat: x.geometry.coordinates[1], ele: x.geometry.coordinates[2], name: x.properties?.name }))
  return { tracks: tracksFromGeoJSON(fc, base), waypoints: wpts }
}

export interface Layer { points: { lat: number; lon: number }[]; color: string; width?: number; dash?: number[]; dots?: boolean; label?: string }
export interface Circle { lat: number; lon: number; r: number; color: string }

const tiles$ = new Map<string, Promise<HTMLImageElement | null>>()
function tile(src: string) {
  let p = tiles$.get(src)
  if (!p) { p = new Promise((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src }); tiles$.set(src, p) }
  return p
}
const merc = (lat: number, lon: number) => { const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180); return [(lon + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)] }

/** Canvas map that fits all layers. Tiles are off by default (they would tell a tile server where you are). */
export function TrackMap({ layers, circles = [], height = 380, marker, onPick, className, tilesDefault = false, heat }: { layers: Layer[]; circles?: Circle[]; height?: number; marker?: { lat: number; lon: number } | null; onPick?: (lat: number, lon: number) => void; className?: string; tilesDefault?: boolean; heat?: boolean }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const [tiles, setTiles] = useState(tilesDefault)
  const view = useRef<{ x0: number; y0: number; scale: number } | null>(null)
  useEffect(() => {
    const c = cv.current; if (!c) return
    const W = c.clientWidth || 600, H = height, dpr = window.devicePixelRatio || 1
    c.width = W * dpr; c.height = H * dpr
    const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const all = [...layers.flatMap((l) => l.points), ...circles, ...(marker ? [marker] : [])]
    ctx.clearRect(0, 0, W, H)
    if (!all.length) return
    let minX = 1, minY = 1, maxX = 0, maxY = 0
    for (const p of all) { const [x, y] = merc(p.lat, p.lon); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
    for (const z of circles) { const d = z.r / 40075016 / Math.cos((z.lat * Math.PI) / 180); minX -= d; maxX += d; minY -= d; maxY += d }
    const pad = 24, spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6)
    const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY)
    const x0 = (minX + maxX) / 2 - W / 2 / scale, y0 = (minY + maxY) / 2 - H / 2 / scale
    view.current = { x0, y0, scale }
    const P = (lat: number, lon: number) => { const [x, y] = merc(lat, lon); return [(x - x0) * scale, (y - y0) * scale] }
    let alive = true
    const drawVectors = () => {
      if (!alive) return
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'
      if (heat) ctx.globalCompositeOperation = 'lighter'
      for (const l of layers) {
        ctx.strokeStyle = l.color; ctx.lineWidth = l.width ?? 3; ctx.setLineDash(l.dash ?? [])
        if (heat) ctx.globalAlpha = 0.35
        if (l.width !== 0) { ctx.beginPath(); l.points.forEach((p, i) => { const [x, y] = P(p.lat, p.lon); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y) }); ctx.stroke() }
        ctx.globalAlpha = 1
        if (l.dots) { ctx.fillStyle = l.color; for (const p of l.points) { const [x, y] = P(p.lat, p.lon); ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill() } }
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.setLineDash([])
      const first = layers.find((l) => l.points.length > 1 && !l.dots)
      if (first && !heat) {
        const [sx, sy] = P(first.points[0].lat, first.points[0].lon), e = first.points[first.points.length - 1], [ex, ey] = P(e.lat, e.lon)
        ctx.fillStyle = '#10B981'; ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 7); ctx.fill(); ctx.fillStyle = '#F97316'; ctx.beginPath(); ctx.arc(ex, ey, 6, 0, 7); ctx.fill()
      }
      for (const z of circles) { const [x, y] = P(z.lat, z.lon), r = (z.r / 40075016 / Math.cos((z.lat * Math.PI) / 180)) * scale; ctx.fillStyle = z.color + '33'; ctx.strokeStyle = z.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke() }
      if (marker) { const [x, y] = P(marker.lat, marker.lon); ctx.fillStyle = '#FDE68A'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); ctx.stroke() }
    }
    if (tiles) {
      const z = Math.max(0, Math.min(17, Math.floor(Math.log2(scale / 256)))), n = 2 ** z, ts = scale / n
      const tx0 = Math.floor(x0 * n), ty0 = Math.floor(y0 * n), tx1 = Math.floor((x0 + W / scale) * n), ty1 = Math.floor((y0 + H / scale) * n)
      const jobs: Promise<void>[] = []
      for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
        if (ty < 0 || ty >= n) continue
        const src = `https://tile.openstreetmap.org/${z}/${((tx % n) + n) % n}/${ty}.png`
        jobs.push(tile(src).then((img) => { if (img && alive) { ctx.globalAlpha = 0.8; ctx.drawImage(img, (tx / n - x0) * scale, (ty / n - y0) * scale, ts + 0.5, ts + 0.5); ctx.globalAlpha = 1 } }))
      }
      Promise.all(jobs).then(drawVectors)
    } else drawVectors()
    return () => { alive = false }
  }, [layers, circles, height, marker, tiles, heat])

  return (
    <div className={className}>
      <canvas ref={cv} style={{ height }} className="w-full cursor-crosshair rounded-2xl border border-border bg-surface-2" aria-label="Map"
        onClick={(e) => {
          if (!onPick || !view.current) return
          const r = e.currentTarget.getBoundingClientRect(), v = view.current
          const x = (e.clientX - r.left) / v.scale + v.x0, y = (e.clientY - r.top) / v.scale + v.y0
          const lon = x * 360 - 180, lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI
          onPick(lat, lon)
        }} />
      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-muted">
        <Switch checked={tiles} onChange={setTiles} label="Map background" />
        {tiles && <span>Map tiles from OpenStreetMap contributors. Only the tile area is requested, your file stays here.</span>}
      </div>
    </div>
  )
}

export function useTrackFile() {
  const [file, setFile] = useState<File | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [waypoints, setWaypoints] = useState<Wpt[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState(0)
  const open = async (f: File) => {
    setFile(f); setError(null); setSel(0)
    try { const r = await loadTracks(f); if (!r.tracks.length) throw new Error('No track or route found in this file.'); setTracks(r.tracks); setWaypoints(r.waypoints) }
    catch (e: any) { setError(e?.message || 'Could not read this file.'); setTracks([]) }
  }
  const reset = () => { setFile(null); setTracks([]); setWaypoints([]); setError(null) }
  const track = tracks[sel] ?? null
  return { file, tracks, waypoints, error, open, reset, sel, setSel, track }
}
