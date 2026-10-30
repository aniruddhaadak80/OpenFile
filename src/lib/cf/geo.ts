/* Geo helpers for the new Maps & GPS tools: bearings, destination points, point in polygon, CSV coordinates,
 * matching photos to a track by time, track edits and comparison. Pure functions for Node tests. */
import { dist, type Pt } from '../bcat/geo2.ts'
export { dist }

const R = 6371008.8, rad = Math.PI / 180, deg = 180 / Math.PI
export const toRad = (d: number) => d * rad
export function bearing(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad)
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad)
  return (Math.atan2(y, x) * deg + 360) % 360
}
export function midpoint(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const Bx = Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad), By = Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad)
  const lat = Math.atan2(Math.sin(a.lat * rad) + Math.sin(b.lat * rad), Math.sqrt((Math.cos(a.lat * rad) + Bx) ** 2 + By ** 2))
  const lon = a.lon * rad + Math.atan2(By, Math.cos(a.lat * rad) + Bx)
  return { lat: lat * deg, lon: (((lon * deg) + 540) % 360) - 180 }
}
export function destination(a: { lat: number; lon: number }, brg: number, d: number) {
  const δ = d / R, θ = brg * rad, φ1 = a.lat * rad, λ1 = a.lon * rad
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2))
  return { lat: φ2 * deg, lon: ((λ2 * deg + 540) % 360) - 180 }
}
/** Points along the great circle from a to b (for drawing). */
export function greatCircle(a: { lat: number; lon: number }, b: { lat: number; lon: number }, n = 64) {
  const d = dist(a, b); if (d < 1) return [a, b]
  const out = []; let cur = a
  const step = d / n
  out.push(a)
  for (let i = 1; i < n; i++) { cur = destination(cur, bearing(cur, b), step); out.push(cur) }
  out.push(b); return out
}
export const compass = (b: number) => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(b / 22.5) % 16]
/** Parse "lat, lon" in decimal or DMS like 48°51'24"N 2°21'03"E. */
export function parseLatLon(s: string): { lat: number; lon: number } | null {
  const t = s.trim(); if (!t) return null
  const dms = [...t.matchAll(/(-?\d+(?:\.\d+)?)\s*[°d:\s]\s*(?:(\d+(?:\.\d+)?)\s*['′m:\s]\s*)?(?:(\d+(?:\.\d+)?)\s*["″s]?\s*)?([NSEW])?/gi)]
  if (dms.length >= 2 && /[°'"NSEW]/i.test(t)) {
    const v = dms.slice(0, 2).map((m) => { let x = Math.abs(+m[1]) + (m[2] ? +m[2] / 60 : 0) + (m[3] ? +m[3] / 3600 : 0); if (m[1].startsWith('-') || /[SW]/i.test(m[4] ?? '')) x = -x; return { x, h: (m[4] ?? '').toUpperCase() } })
    let lat = v[0].x, lon = v[1].x
    if (/[EW]/.test(v[0].h) || /[NS]/.test(v[1].h)) [lat, lon] = [lon, lat]
    return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null
  }
  const n = t.match(/-?\d+(?:\.\d+)?/g)
  if (!n || n.length < 2) return null
  const lat = +n[0], lon = +n[1]
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null
}

/* ---------------- point in polygon ---------------- */
export function pointInRing(lon: number, lat: number, ring: number[][]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
export function pointInGeometry(lon: number, lat: number, g: any): boolean {
  if (!g) return false
  if (g.type === 'Polygon') return pointInRing(lon, lat, g.coordinates[0]) && !g.coordinates.slice(1).some((h: number[][]) => pointInRing(lon, lat, h))
  if (g.type === 'MultiPolygon') return g.coordinates.some((p: number[][][]) => pointInGeometry(lon, lat, { type: 'Polygon', coordinates: p }))
  if (g.type === 'GeometryCollection') return g.geometries.some((x: any) => pointInGeometry(lon, lat, x))
  return false
}
export interface Zone { name: string; geometry: any }
export function zonesFromGeoJSON(fc: any, nameProp?: string): Zone[] {
  const feats = fc.type === 'FeatureCollection' ? fc.features : fc.type === 'Feature' ? [fc] : [{ type: 'Feature', properties: {}, geometry: fc }]
  return feats.filter((f: any) => /Polygon/.test(f.geometry?.type ?? '')).map((f: any, i: number) => ({ name: String((nameProp && f.properties?.[nameProp]) ?? f.properties?.name ?? f.properties?.NAME ?? f.properties?.id ?? `Zone ${i + 1}`), geometry: f.geometry }))
}
/** A circle zone as a polygon (radius in metres). */
export function circleZone(name: string, c: { lat: number; lon: number }, r: number, n = 48): Zone {
  const ring = Array.from({ length: n + 1 }, (_, i) => { const p = destination(c, (i * 360) / n, r); return [p.lon, p.lat] })
  return { name, geometry: { type: 'Polygon', coordinates: [ring] } }
}

/* ---------------- CSV coordinates ---------------- */
export function guessLatLonCols(head: string[]) {
  const h = head.map((x) => x.toLowerCase().trim())
  const lat = h.findIndex((x) => /^(lat|latitude|y|lat_dd|gps_lat|gpslatitude)$/.test(x) || /latitude/.test(x))
  const lon = h.findIndex((x) => /^(lon|lng|long|longitude|x|lon_dd|gps_lon|gpslongitude)$/.test(x) || /longitude/.test(x))
  const name = h.findIndex((x) => /^(name|title|label|place|description|id)$/.test(x))
  const time = h.findIndex((x) => /(time|date|timestamp)/.test(x))
  return { lat, lon, name, time }
}
export function rowsToPoints(rows: string[][], c: { lat: number; lon: number; name?: number }) {
  const pts: { lat: number; lon: number; name: string; row: number }[] = [], bad: number[] = []
  rows.forEach((r, i) => { const lat = parseFloat(String(r[c.lat] ?? '').replace(',', '.')), lon = parseFloat(String(r[c.lon] ?? '').replace(',', '.')); if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) pts.push({ lat, lon, name: c.name != null && c.name >= 0 ? String(r[c.name] ?? '') : '', row: i }); else bad.push(i) })
  return { pts, bad }
}
export function pointsGeoJSON(pts: { lat: number; lon: number; props: Record<string, any> }[]) {
  return { type: 'FeatureCollection', features: pts.map((p) => ({ type: 'Feature', properties: p.props, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })) }
}
const kmlEsc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export function pointsKml(name: string, pts: { lat: number; lon: number; name: string; desc?: string }[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${kmlEsc(name)}</name>\n` + pts.map((p) => `<Placemark><name>${kmlEsc(p.name)}</name>${p.desc ? `<description>${kmlEsc(p.desc)}</description>` : ''}<Point><coordinates>${p.lon},${p.lat}</coordinates></Point></Placemark>`).join('\n') + '\n</Document></kml>\n'
}
export function pointsGpx(pts: { lat: number; lon: number; name: string }[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="OpenFile" xmlns="http://www.topografix.com/GPX/1/1">\n` + pts.map((p) => `  <wpt lat="${p.lat}" lon="${p.lon}"><name>${kmlEsc(p.name)}</name></wpt>`).join('\n') + '\n</gpx>\n'
}

/* ---------------- geotag by time ---------------- */
/** Position at a time on a track, interpolated between the two nearest points. */
export function positionAt(pts: Pt[], t: number, maxGapSec = 300): { lat: number; lon: number; ele?: number; gap: number } | null {
  const timed = pts.filter((p) => p.time != null)
  if (!timed.length) return null
  if (t <= timed[0].time!) { const g = (timed[0].time! - t) / 1000; return g <= maxGapSec ? { ...timed[0], gap: g } : null }
  if (t >= timed.at(-1)!.time!) { const g = (t - timed.at(-1)!.time!) / 1000; return g <= maxGapSec ? { ...timed.at(-1)!, gap: g } : null }
  let lo = 0, hi = timed.length - 1
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (timed[m].time! <= t) lo = m; else hi = m }
  const a = timed[lo], b = timed[hi], f = (t - a.time!) / Math.max(1, b.time! - a.time!)
  const gap = Math.min(t - a.time!, b.time! - t) / 1000
  if ((b.time! - a.time!) / 1000 > maxGapSec * 2 && gap > maxGapSec) return null
  return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, ele: a.ele != null && b.ele != null ? a.ele + (b.ele - a.ele) * f : a.ele, gap }
}
/** EXIF DateTimeOriginal has no zone. Read it as wall clock time in the camera's offset (minutes east of UTC). */
export function exifToUtc(s: string, offsetMin: number) {
  const m = s.match(/(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/); if (!m) return NaN
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - offsetMin * 60000
}

/* ---------------- track edits ---------------- */
export function trimTrack(pts: Pt[], startM: number, endM: number) {
  let d = 0; const out: Pt[] = []
  const total = pts.reduce((s, p, i) => s + (i ? dist(pts[i - 1], p) : 0), 0)
  for (let i = 0; i < pts.length; i++) { if (i) d += dist(pts[i - 1], pts[i]); if (d >= startM && d <= total - endM) out.push(pts[i]) }
  return out
}
export function reverseTrack(pts: Pt[], keepTimes: boolean) {
  const r = [...pts].reverse()
  if (!keepTimes) return r.map((p) => ({ ...p, time: undefined }))
  const times = pts.map((p) => p.time)
  return r.map((p, i) => ({ ...p, time: times[i] }))
}
export const shiftTimes = (pts: Pt[], ms: number) => pts.map((p) => (p.time != null ? { ...p, time: p.time + ms } : p))
/** Drop points recorded while standing still (speed below minKmh for longer than minSec) and close the time gap. */
export function removeStops(pts: Pt[], minKmh = 1.5, minSec = 30, closeGaps = true) {
  if (pts.length < 3 || pts.some((p) => p.time == null)) return { pts, removed: 0, removedSec: 0 }
  const out: Pt[] = [pts[0]]; let removed = 0, shift = 0, removedSec = 0
  let i = 1
  while (i < pts.length) {
    let j = i
    while (j < pts.length && (dist(pts[j - 1], pts[j]) / Math.max(1e-3, (pts[j].time! - pts[j - 1].time!) / 1000)) * 3.6 < minKmh) j++
    const dur = j > i ? (pts[Math.min(j, pts.length - 1)].time! - pts[i - 1].time!) / 1000 : 0
    if (j > i && dur >= minSec) { removed += j - i; if (closeGaps) { shift += (pts[Math.min(j, pts.length - 1)].time! - pts[i - 1].time!) - 1000; } removedSec += dur; i = j; continue }
    for (let k = i; k <= Math.min(j, pts.length - 1); k++) out.push({ ...pts[k], time: pts[k].time! - shift })
    i = j + 1
  }
  return { pts: out, removed, removedSec }
}
/** Set new start time and/or a fixed speed so a planned route gets timestamps. */
export function retime(pts: Pt[], startMs: number, kmh: number) {
  let t = startMs
  return pts.map((p, i) => { if (i) t += (dist(pts[i - 1], p) / (kmh / 3.6)) * 1000; return { ...p, time: Math.round(t) } })
}

/* ---------------- compare two tracks ---------------- */
/** Distance from a point to the nearest point of the other track (sampled), returns summary of divergence. */
export function compareTracks(a: Pt[], b: Pt[], step = 1) {
  const near = (p: Pt, list: Pt[]) => { let m = Infinity; for (let i = 0; i < list.length; i += step) { const d = dist(p, list[i]); if (d < m) m = d } return m }
  const da = a.map((p) => near(p, b))
  const avg = da.reduce((s, x) => s + x, 0) / Math.max(1, da.length)
  const sorted = [...da].sort((x, y) => x - y)
  const within = (m: number) => da.filter((x) => x <= m).length / Math.max(1, da.length)
  return { avg, max: sorted.at(-1) ?? 0, median: sorted[Math.floor(sorted.length / 2)] ?? 0, overlap25: within(25), overlap50: within(50), perPoint: da }
}
/** Where on track a was each distance mark reached vs track b (time gap at each km). */
export function timeGapByDistance(a: Pt[], b: Pt[], every = 1000) {
  const marks = (pts: Pt[]) => { const out: number[] = []; let d = 0, next = every; for (let i = 1; i < pts.length; i++) { d += dist(pts[i - 1], pts[i]); while (d >= next && pts[i].time != null) { out.push(pts[i].time!); next += every } } return out }
  const ma = marks(a), mb = marks(b)
  const a0 = a.find((p) => p.time != null)?.time ?? 0, b0 = b.find((p) => p.time != null)?.time ?? 0
  return ma.slice(0, mb.length).map((t, i) => ({ km: ((i + 1) * every) / 1000, gap: ((t - a0) - (mb[i] - b0)) / 1000 }))
}

/** Parse KML or other XML text into an XML Document without handing it to an HTML-capable parser:
 * the text is loaded as an XML response from a local blob URL, so no markup is ever interpreted as HTML. */
export function xmlDocument(text: string): Promise<Document> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/xml' }))
    const x = new XMLHttpRequest()
    x.open('GET', url)
    x.overrideMimeType('application/xml')
    x.responseType = 'document'
    x.onload = () => { URL.revokeObjectURL(url); if (x.responseXML) resolve(x.responseXML); else reject(new Error('This file is not valid XML.')) }
    x.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this file.')) }
    x.send()
  })
}
