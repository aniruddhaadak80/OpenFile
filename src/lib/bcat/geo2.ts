/* GPS track maths for the Maps and GPS tools: parse GPX/TCX, stats, splits, simplify, privacy zones, merge/split,
 * write GPX, geohash, plus codes, Maidenhead and spherical area. Pure functions, unit tested. */

export interface Pt { lat: number; lon: number; ele?: number; time?: number; hr?: number; cad?: number }
export interface Track { name: string; points: Pt[] }
export interface Wpt { lat: number; lon: number; name?: string; ele?: number }

const R = 6371008.8
const rad = (d: number) => (d * Math.PI) / 180
export function dist(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

const attr = (s: string, n: string) => { const m = s.match(new RegExp(`\\b${n}\\s*=\\s*["']([^"']+)["']`)); return m ? +m[1] : NaN }
const tag = (s: string, n: string) => { const m = s.match(new RegExp(`<(?:\\w+:)?${n}\\b[^>]*>([^<]*)</(?:\\w+:)?${n}>`)); return m ? m[1].trim() : undefined }
const unxml = (s?: string) => s?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
function ptFrom(body: string, lat: number, lon: number): Pt {
  const p: Pt = { lat, lon }
  const e = tag(body, 'ele') ?? tag(body, 'AltitudeMeters'); if (e != null && e !== '' && isFinite(+e)) p.ele = +e
  const t = tag(body, 'time') ?? tag(body, 'Time'); if (t) { const v = Date.parse(t); if (isFinite(v)) p.time = v }
  const hr = tag(body, 'hr') ?? body.match(/<HeartRateBpm[^>]*>\s*<Value>(\d+)/)?.[1]; if (hr && isFinite(+hr)) p.hr = +hr
  const cad = tag(body, 'cad') ?? tag(body, 'Cadence'); if (cad && isFinite(+cad)) p.cad = +cad
  return p
}
/** Parse GPX (tracks, routes, waypoints) or TCX into tracks. */
export function parseGpx(xml: string, fallbackName = 'Track'): { tracks: Track[]; waypoints: Wpt[] } {
  const tracks: Track[] = [], waypoints: Wpt[] = []
  if (/<TrainingCenterDatabase/i.test(xml)) {
    for (const act of xml.match(/<Activity\b[\s\S]*?<\/Activity>/g) ?? [xml]) {
      const pts: Pt[] = []
      for (const m of act.matchAll(/<Trackpoint>([\s\S]*?)<\/Trackpoint>/g)) { const lat = tag(m[1], 'LatitudeDegrees'), lon = tag(m[1], 'LongitudeDegrees'); if (lat && lon) pts.push(ptFrom(m[1], +lat, +lon)) }
      if (pts.length) tracks.push({ name: tag(act, 'Id') ?? fallbackName, points: pts })
    }
    return { tracks, waypoints }
  }
  for (const [blk, ptTag] of [['trk', 'trkpt'], ['rte', 'rtept']] as const) {
    for (const t of xml.match(new RegExp(`<${blk}\\b[\\s\\S]*?</${blk}>`, 'g')) ?? []) {
      const name = unxml(tag(t.replace(new RegExp(`<${ptTag}[\\s\\S]*`, ''), ''), 'name')) ?? fallbackName
      const pts: Pt[] = []
      for (const m of t.matchAll(new RegExp(`<${ptTag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${ptTag}>)`, 'g'))) { const lat = attr(m[1], 'lat'), lon = attr(m[1], 'lon'); if (isFinite(lat) && isFinite(lon)) pts.push(ptFrom(m[2] ?? '', lat, lon)) }
      if (pts.length) tracks.push({ name, points: pts })
    }
  }
  for (const m of xml.matchAll(/<wpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/wpt>)/g)) { const lat = attr(m[1], 'lat'), lon = attr(m[1], 'lon'); if (isFinite(lat) && isFinite(lon)) { const p = ptFrom(m[2] ?? '', lat, lon); waypoints.push({ lat, lon, ele: p.ele, name: unxml(tag(m[2] ?? '', 'name')) }) } }
  return { tracks, waypoints }
}

/** Tracks from GeoJSON LineStrings (and MultiLineStrings). Coordinates may carry elevation. */
export function tracksFromGeoJSON(g: any, fallbackName = 'Track'): Track[] {
  const feats = g.type === 'FeatureCollection' ? g.features : g.type === 'Feature' ? [g] : [{ type: 'Feature', properties: {}, geometry: g }]
  const out: Track[] = []
  for (const f of feats) {
    const geom = f.geometry; if (!geom) continue
    const lines = geom.type === 'LineString' ? [geom.coordinates] : geom.type === 'MultiLineString' ? geom.coordinates : []
    const times: string[] | undefined = f.properties?.coordinateProperties?.times ?? f.properties?.coordTimes
    lines.forEach((l: number[][], k: number) => out.push({ name: f.properties?.name ?? fallbackName, points: l.map((c, i) => ({ lon: c[0], lat: c[1], ele: c[2], time: (() => { const t = Array.isArray(times?.[0]) ? (times as any)[k]?.[i] : times?.[i]; return t ? Date.parse(t) : undefined })() })) }))
  }
  return out
}

export interface Stats { points: number; distance: number; ascent: number; descent: number; minEle?: number; maxEle?: number; duration?: number; moving?: number; avgSpeed?: number; maxSpeed?: number; avgHr?: number; maxHr?: number; start?: number; end?: number }
/** Stats with a small elevation dead band so GPS noise does not inflate climbing. */
export function trackStats(pts: Pt[], band = 3): Stats {
  let d = 0, up = 0, down = 0, moving = 0, maxSpeed = 0, hrSum = 0, hrN = 0, maxHr = 0
  let minEle = Infinity, maxEle = -Infinity, ref: number | undefined
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (p.ele != null) { minEle = Math.min(minEle, p.ele); maxEle = Math.max(maxEle, p.ele); if (ref == null) ref = p.ele; else if (p.ele - ref >= band) { up += p.ele - ref; ref = p.ele } else if (ref - p.ele >= band) { down += ref - p.ele; ref = p.ele } }
    if (p.hr) { hrSum += p.hr; hrN++; maxHr = Math.max(maxHr, p.hr) }
    if (i) {
      const s = dist(pts[i - 1], p); d += s
      const dt = p.time != null && pts[i - 1].time != null ? (p.time - pts[i - 1].time!) / 1000 : 0
      if (dt > 0) { const v = s / dt; if (v > 0.5 && dt < 300) { moving += dt; if (dt >= 1 && v < 100) maxSpeed = Math.max(maxSpeed, v) } }
    }
  }
  const t0 = pts.find((p) => p.time != null)?.time, t1 = [...pts].reverse().find((p) => p.time != null)?.time
  const st: Stats = { points: pts.length, distance: d, ascent: up, descent: down }
  if (isFinite(minEle)) { st.minEle = minEle; st.maxEle = maxEle }
  if (t0 != null && t1 != null && t1 > t0) { st.duration = (t1 - t0) / 1000; st.moving = moving; st.avgSpeed = moving ? d / moving : d / st.duration; st.maxSpeed = maxSpeed; st.start = t0; st.end = t1 }
  if (hrN) { st.avgHr = hrSum / hrN; st.maxHr = maxHr }
  return st
}

/** Cumulative distance for each point (metres). */
export function cumDist(pts: Pt[]) { const out = [0]; for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + dist(pts[i - 1], pts[i])); return out }

export interface Split { index: number; distance: number; time?: number; pace?: number; gain: number; loss: number; avgHr?: number }
export function splits(pts: Pt[], every = 1000): Split[] {
  const out: Split[] = []
  if (pts.length < 2) return out
  const cd = cumDist(pts)
  let start = 0, k = 1
  const push = (end: number) => {
    const seg = pts.slice(start, end + 1), d = cd[end] - cd[start]
    let gain = 0, loss = 0, hr = 0, hn = 0
    for (let i = 1; i < seg.length; i++) { const a = seg[i - 1].ele, b = seg[i].ele; if (a != null && b != null) { if (b > a) gain += b - a; else loss += a - b } }
    seg.forEach((p) => { if (p.hr) { hr += p.hr; hn++ } })
    const t = seg[0].time != null && seg[seg.length - 1].time != null ? (seg[seg.length - 1].time! - seg[0].time!) / 1000 : undefined
    out.push({ index: k++, distance: d, time: t, pace: t != null && d > 0 ? t / (d / every) : undefined, gain, loss, avgHr: hn ? hr / hn : undefined })
    start = end
  }
  for (let i = 1; i < pts.length; i++) if (cd[i] - cd[start] >= every) push(i)
  if (start < pts.length - 1 && cd[pts.length - 1] - cd[start] > every * 0.05) push(pts.length - 1)
  return out
}

/** Douglas-Peucker simplification with a tolerance in metres. Keeps first and last points. */
export function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3 || tol <= 0) return pts.slice()
  const lat0 = rad(pts[0].lat)
  const xy = pts.map((p) => [rad(p.lon) * Math.cos(lat0) * R, rad(p.lat) * R])
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let md = 0, mi = -1
    const [ax, ay] = xy[a], [bx, by] = xy[b], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i]
      let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t))
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
      if (d > md) { md = d; mi = i }
    }
    if (md > tol && mi > 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]) }
  }
  return pts.filter((_, i) => keep[i])
}

/** Remove points inside any privacy circle, and trim a distance from the start and the end. */
export function privacyFilter(pts: Pt[], zones: { lat: number; lon: number; r: number }[], trimStart = 0, trimEnd = 0): Pt[] {
  const cd = cumDist(pts), total = cd[cd.length - 1] ?? 0
  return pts.filter((p, i) => cd[i] >= trimStart && cd[i] <= total - trimEnd && !zones.some((z) => dist(p, z) <= z.r))
}
export function stripExtras(pts: Pt[], o: { time?: boolean; hr?: boolean; ele?: boolean }): Pt[] {
  return pts.map((p) => { const q: Pt = { ...p }; if (o.time) delete q.time; if (o.hr) { delete q.hr; delete q.cad } if (o.ele) delete q.ele; return q })
}

/** Split a track where the time gap or the jump between points is larger than the limit, or every N points. */
export function splitTrack(t: Track, o: { gapSec?: number; jumpM?: number; every?: number; atIndex?: number[] }): Track[] {
  const out: Track[] = []
  let cur: Pt[] = []
  t.points.forEach((p, i) => {
    const prev = t.points[i - 1]
    const cut = i > 0 && ((o.gapSec && p.time != null && prev.time != null && (p.time - prev.time) / 1000 > o.gapSec) || (o.jumpM && dist(prev, p) > o.jumpM) || (o.every && cur.length >= o.every) || o.atIndex?.includes(i))
    if (cut && cur.length) { out.push({ name: `${t.name} part ${out.length + 1}`, points: cur }); cur = [] }
    cur.push(p)
  })
  if (cur.length) out.push({ name: out.length ? `${t.name} part ${out.length + 1}` : t.name, points: cur })
  return out
}
export function mergeTracks(ts: Track[], name = 'Merged track', byTime = true): Track {
  const list = byTime ? [...ts].sort((a, b) => (a.points[0]?.time ?? 0) - (b.points[0]?.time ?? 0)) : ts
  return { name, points: list.flatMap((t) => t.points) }
}

const x = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!))
export function writeGpx(tracks: Track[], waypoints: Wpt[] = [], creator = 'OpenFile', oneTrackPerSegment = false): string {
  const pt = (p: Pt, t = 'trkpt') => {
    const ext = p.hr != null || p.cad != null ? `<extensions><gpxtpx:TrackPointExtension>${p.hr != null ? `<gpxtpx:hr>${Math.round(p.hr)}</gpxtpx:hr>` : ''}${p.cad != null ? `<gpxtpx:cad>${Math.round(p.cad)}</gpxtpx:cad>` : ''}</gpxtpx:TrackPointExtension></extensions>` : ''
    return `<${t} lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">${p.ele != null ? `<ele>${p.ele.toFixed(1)}</ele>` : ''}${p.time != null ? `<time>${new Date(p.time).toISOString()}</time>` : ''}${ext}</${t}>`
  }
  const trk = oneTrackPerSegment
    ? `<trk><name>${x(tracks[0]?.name ?? 'Track')}</name>${tracks.map((t) => `<trkseg>${t.points.map((p) => pt(p)).join('')}</trkseg>`).join('')}</trk>`
    : tracks.map((t) => `<trk><name>${x(t.name)}</name><trkseg>\n${t.points.map((p) => pt(p)).join('\n')}\n</trkseg></trk>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="${x(creator)}" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">\n${waypoints.map((w) => `<wpt lat="${w.lat.toFixed(7)}" lon="${w.lon.toFixed(7)}">${w.ele != null ? `<ele>${w.ele}</ele>` : ''}${w.name ? `<name>${x(w.name)}</name>` : ''}</wpt>`).join('\n')}\n${trk}\n</gpx>\n`
}

/* ---------- geohash ---------- */
const B32 = '0123456789bcdefghjkmnpqrstuvwxyz'
export function geohashEncode(lat: number, lon: number, precision = 9) {
  let la = [-90, 90], lo = [-180, 180], bit = 0, ch = 0, even = true, out = ''
  while (out.length < precision) {
    const r = even ? lo : la, v = even ? lon : lat, mid = (r[0] + r[1]) / 2
    if (v >= mid) { ch = (ch << 1) | 1; r[0] = mid } else { ch <<= 1; r[1] = mid }
    even = !even
    if (++bit === 5) { out += B32[ch]; bit = 0; ch = 0 }
  }
  return out
}
export function geohashDecode(h: string) {
  let la = [-90, 90], lo = [-180, 180], even = true
  for (const c of h.toLowerCase()) {
    const v = B32.indexOf(c); if (v < 0) throw new Error('Not a geohash')
    for (let b = 4; b >= 0; b--) { const r = even ? lo : la, mid = (r[0] + r[1]) / 2; if ((v >> b) & 1) r[0] = mid; else r[1] = mid; even = !even }
  }
  return { lat: (la[0] + la[1]) / 2, lon: (lo[0] + lo[1]) / 2, latErr: (la[1] - la[0]) / 2, lonErr: (lo[1] - lo[0]) / 2 }
}

/* ---------- Open Location Code (plus codes) ---------- */
const OLC = '23456789CFGHJMPQRVWX'
export function plusEncode(lat: number, lon: number, len = 10) {
  lat = Math.min(90, Math.max(-90, lat))
  lon = ((((lon + 180) % 360) + 360) % 360) - 180
  let la = Math.floor(Math.round((lat + 90) * 25e6 * 1e6) / 1e6), lo = Math.floor(Math.round((lon + 180) * 8192e3 * 1e6) / 1e6)
  if (la >= 180 * 25e6) la = 180 * 25e6 - 1
  let grid = ''
  if (len > 10) { for (let i = 0; i < 5; i++) { grid = OLC[(la % 5) * 4 + (lo % 4)] + grid; la = Math.floor(la / 5); lo = Math.floor(lo / 4) } }
  else { la = Math.floor(la / 3125); lo = Math.floor(lo / 1024) }
  let pairs = ''
  for (let i = 0; i < 5; i++) { pairs = OLC[la % 20] + OLC[lo % 20] + pairs; la = Math.floor(la / 20); lo = Math.floor(lo / 20) }
  let code = (pairs + grid).slice(0, Math.max(2, len))
  if (code.length < 8) code = code + '0'.repeat(8 - code.length)
  return code.slice(0, 8) + '+' + code.slice(8)
}
export function plusDecode(code: string) {
  const c = code.toUpperCase().replace('+', '').replace(/0+$/, '')
  if (!/^[23456789CFGHJMPQRVWX]+$/.test(c) || c.length < 2) throw new Error('Not a full plus code')
  let lat = -90, lon = -180, res = 20
  for (let i = 0; i < Math.min(10, c.length); i += 2) { lat += OLC.indexOf(c[i]) * res; lon += OLC.indexOf(c[i + 1] ?? '2') * res; if (i + 2 < Math.min(10, c.length)) res /= 20 }
  let hl = res, hg = res
  for (let i = 10; i < c.length; i++) { hl /= 5; hg /= 4; const v = OLC.indexOf(c[i]); lat += Math.floor(v / 4) * hl; lon += (v % 4) * hg }
  return { lat: lat + hl / 2, lon: lon + hg / 2, latErr: hl / 2, lonErr: hg / 2 }
}

/* ---------- Maidenhead locator ---------- */
export function maidenhead(lat: number, lon: number, pairs = 3) {
  let a = lon + 180, b = lat + 90
  let s = String.fromCharCode(65 + Math.floor(a / 20), 65 + Math.floor(b / 10)); a %= 20; b %= 10
  if (pairs > 1) { s += `${Math.floor(a / 2)}${Math.floor(b)}`; a %= 2; b %= 1 }
  if (pairs > 2) s += String.fromCharCode(97 + Math.floor(a * 12), 97 + Math.floor(b * 24))
  return s
}
export function maidenheadDecode(s: string) {
  const u = s.trim(); if (!/^[A-Ra-r]{2}(\d\d([A-Xa-x]{2})?)?$/.test(u)) throw new Error('Not a Maidenhead locator')
  let lon = (u.toUpperCase().charCodeAt(0) - 65) * 20 - 180, lat = (u.toUpperCase().charCodeAt(1) - 65) * 10 - 90, w = 20, h = 10
  if (u.length >= 4) { lon += +u[2] * 2; lat += +u[3]; w = 2; h = 1 }
  if (u.length >= 6) { lon += (u.toLowerCase().charCodeAt(4) - 97) / 12; lat += (u.toLowerCase().charCodeAt(5) - 97) / 24; w = 1 / 12; h = 1 / 24 }
  return { lat: lat + h / 2, lon: lon + w / 2 }
}

/* ---------- area and length ---------- */
/** Area of a ring in square metres on a sphere (same method as common GIS libraries). */
export function ringArea(coords: number[][]) {
  let a = 0
  const n = coords.length
  if (n < 3) return 0
  for (let i = 0; i < n; i++) {
    const p1 = coords[i], p2 = coords[(i + 1) % n], p3 = coords[(i + 2) % n]
    a += (rad(p3[0]) - rad(p1[0])) * Math.sin(rad(p2[1]))
  }
  return Math.abs((a * R * R) / 2)
}
export function geomArea(g: any): number {
  if (!g) return 0
  if (g.type === 'Polygon') return g.coordinates.reduce((s: number, r: number[][], i: number) => s + (i ? -1 : 1) * ringArea(r), 0)
  if (g.type === 'MultiPolygon') return g.coordinates.reduce((s: number, p: number[][][]) => s + geomArea({ type: 'Polygon', coordinates: p }), 0)
  if (g.type === 'GeometryCollection') return g.geometries.reduce((s: number, x: any) => s + geomArea(x), 0)
  return 0
}
const lineLen = (c: number[][]) => { let d = 0; for (let i = 1; i < c.length; i++) d += dist({ lon: c[i - 1][0], lat: c[i - 1][1] }, { lon: c[i][0], lat: c[i][1] }); return d }
export function geomLength(g: any): number {
  if (!g) return 0
  if (g.type === 'LineString') return lineLen(g.coordinates)
  if (g.type === 'MultiLineString') return g.coordinates.reduce((s: number, l: number[][]) => s + lineLen(l), 0)
  if (g.type === 'Polygon') return g.coordinates.reduce((s: number, l: number[][]) => s + lineLen(l), 0)
  if (g.type === 'MultiPolygon') return g.coordinates.reduce((s: number, p: number[][][]) => s + p.reduce((t, l) => t + lineLen(l), 0), 0)
  if (g.type === 'GeometryCollection') return g.geometries.reduce((s: number, x: any) => s + geomLength(x), 0)
  return 0
}
export function geomCentroid(g: any): [number, number] | null {
  let sx = 0, sy = 0, n = 0
  const walk = (c: any) => { if (typeof c[0] === 'number') { sx += c[0]; sy += c[1]; n++ } else c.forEach(walk) }
  if (g?.coordinates) walk(g.coordinates); else if (g?.geometries) g.geometries.forEach((x: any) => x.coordinates && walk(x.coordinates))
  return n ? [sx / n, sy / n] : null
}
export const fmtArea = (m2: number) => m2 >= 1e6 ? `${(m2 / 1e6).toFixed(3)} km² (${(m2 / 2589988.11).toFixed(3)} mi²)` : m2 >= 1e4 ? `${(m2 / 1e4).toFixed(2)} ha (${(m2 / 4046.856).toFixed(2)} acres)` : `${m2.toFixed(1)} m² (${(m2 * 10.7639).toFixed(0)} ft²)`
export const fmtDur = (s?: number) => { if (s == null || !isFinite(s)) return '-'; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}` }
export const fmtKm = (m: number, imperial = false) => imperial ? `${(m / 1609.344).toFixed(2)} mi` : m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`
