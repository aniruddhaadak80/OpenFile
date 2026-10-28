/* Geo helpers: distances, DMS, UTM, MGRS, GeoJSON to GPX/CSV (pure). */
export type LngLat = [number, number]
const R = 6371008.8
const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI

export function haversine(a: LngLat, b: LngLat) {
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}
export function bearing(a: LngLat, b: LngLat) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]))
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]))
  return (deg(Math.atan2(y, x)) + 360) % 360
}
export function midpoint(a: LngLat, b: LngLat): LngLat {
  const Bx = Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0])), By = Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]))
  const lat = Math.atan2(Math.sin(rad(a[1])) + Math.sin(rad(b[1])), Math.sqrt((Math.cos(rad(a[1])) + Bx) ** 2 + By ** 2))
  const lon = rad(a[0]) + Math.atan2(By, Math.cos(rad(a[1])) + Bx)
  return [((deg(lon) + 540) % 360) - 180, deg(lat)]
}

/* ---------- DMS ---------- */
export function toDMS(v: number, isLat: boolean, decimals = 2) {
  const h = isLat ? (v >= 0 ? 'N' : 'S') : v >= 0 ? 'E' : 'W'
  const a = Math.abs(v); let d = Math.floor(a); let m = Math.floor((a - d) * 60); let s = +(((a - d) * 60 - m) * 60).toFixed(decimals)
  if (s >= 60) { s = 0; m++ } if (m >= 60) { m = 0; d++ }
  return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(decimals).padStart(decimals + 3, '0')}″ ${h}`
}
export function toDDM(v: number, isLat: boolean, decimals = 4) {
  const h = isLat ? (v >= 0 ? 'N' : 'S') : v >= 0 ? 'E' : 'W'
  const a = Math.abs(v); const d = Math.floor(a); const m = (a - d) * 60
  return `${d}° ${m.toFixed(decimals)}′ ${h}`
}

/** Parse one coordinate in decimal, DMS or DDM form. */
export function parseCoord(s: string): number | null {
  const t = s.trim().toUpperCase().replace(/,/g, '.')
  if (!t) return null
  const hemi = t.match(/[NSEW]/)?.[0]
  const neg = /^-/.test(t) || hemi === 'S' || hemi === 'W'
  const nums = t.replace(/[NSEW]/g, ' ').match(/\d+(\.\d+)?/g)
  if (!nums) return null
  const [d, m = '0', sec = '0'] = nums
  const v = Number(d) + Number(m) / 60 + Number(sec) / 3600
  if (Number(m) >= 60 || Number(sec) >= 60) return null
  return neg ? -v : v
}

/** Parse "lat, lon" in any common format. Returns [lat, lon]. */
export function parseLatLon(s: string): [number, number] | null {
  const t = s.trim()
  if (!t) return null
  // split on comma, semicolon or between hemisphere groups
  let parts = t.split(/\s*[;,]\s*(?=[-+\d NSEW])/i)
  if (parts.length !== 2) { const m = t.match(/^(.*?[NS])\s*(.*[EW])$/i); if (m) parts = [m[1], m[2]] }
  if (parts.length !== 2) { const p = t.split(/\s+/); if (p.length === 2) parts = p }
  if (parts.length !== 2) return null
  let a = parseCoord(parts[0]), b = parseCoord(parts[1])
  if (a === null || b === null) return null
  if (/[EW]/i.test(parts[0]) && /[NS]/i.test(parts[1])) [a, b] = [b, a]
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null
  return [a, b]
}

/* ---------- UTM (WGS84) ---------- */
const A = 6378137, F = 1 / 298.257223563, K0 = 0.9996
const E2 = F * (2 - F), EP2 = E2 / (1 - E2)

export function utmZone(lat: number, lon: number) {
  let z = Math.floor((lon + 180) / 6) + 1
  if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) z = 32
  if (lat >= 72 && lat < 84) { if (lon >= 0 && lon < 9) z = 31; else if (lon >= 9 && lon < 21) z = 33; else if (lon >= 21 && lon < 33) z = 35; else if (lon >= 33 && lon < 42) z = 37 }
  return z
}
const BANDS = 'CDEFGHJKLMNPQRSTUVWXX'
export const latBand = (lat: number) => (lat < -80 || lat > 84 ? null : BANDS[Math.floor((lat + 80) / 8)])

export function toUTM(lat: number, lon: number, forceZone?: number) {
  if (lat < -80 || lat > 84) throw new Error('UTM covers latitudes from 80°S to 84°N.')
  const zone = forceZone ?? utmZone(lat, lon)
  const lon0 = rad((zone - 1) * 6 - 180 + 3)
  const φ = rad(lat), λ = rad(lon)
  const N = A / Math.sqrt(1 - E2 * Math.sin(φ) ** 2)
  const T = Math.tan(φ) ** 2, C = EP2 * Math.cos(φ) ** 2, Aa = Math.cos(φ) * (λ - lon0)
  const M = A * ((1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * φ - ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * φ) + ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * φ) - ((35 * E2 ** 3) / 3072) * Math.sin(6 * φ))
  const easting = K0 * N * (Aa + ((1 - T + C) * Aa ** 3) / 6 + ((5 - 18 * T + T ** 2 + 72 * C - 58 * EP2) * Aa ** 5) / 120) + 500000
  let northing = K0 * (M + N * Math.tan(φ) * (Aa ** 2 / 2 + ((5 - T + 9 * C + 4 * C ** 2) * Aa ** 4) / 24 + ((61 - 58 * T + T ** 2 + 600 * C - 330 * EP2) * Aa ** 6) / 720))
  if (lat < 0) northing += 10000000
  return { zone, band: latBand(lat)!, hemi: lat >= 0 ? 'N' : 'S', easting, northing }
}

export function fromUTM(zone: number, hemi: 'N' | 'S', easting: number, northing: number): [number, number] {
  const x = easting - 500000, y = hemi === 'S' ? northing - 10000000 : northing
  const lon0 = rad((zone - 1) * 6 - 180 + 3)
  const M = y / K0, mu = M / (A * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256))
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2))
  const φ1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu)
  const N1 = A / Math.sqrt(1 - E2 * Math.sin(φ1) ** 2), T1 = Math.tan(φ1) ** 2, C1 = EP2 * Math.cos(φ1) ** 2
  const R1 = (A * (1 - E2)) / (1 - E2 * Math.sin(φ1) ** 2) ** 1.5, D = x / (N1 * K0)
  const lat = φ1 - ((N1 * Math.tan(φ1)) / R1) * (D ** 2 / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * EP2) * D ** 4) / 24 + ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * EP2 - 3 * C1 ** 2) * D ** 6) / 720)
  const lon = lon0 + (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * EP2 + 24 * T1 ** 2) * D ** 5) / 120) / Math.cos(φ1)
  return [deg(lat), deg(lon)]
}

/* ---------- MGRS ---------- */
const COL_SETS = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ']
const ROW_SET = 'ABCDEFGHJKLMNPQRSTUV'
export function toMGRS(lat: number, lon: number, digits = 5) {
  const u = toUTM(lat, lon)
  const set = (u.zone - 1) % 3
  const col = COL_SETS[set][Math.floor(u.easting / 100000) - 1]
  const rowOffset = u.zone % 2 === 0 ? 5 : 0
  const row = ROW_SET[(Math.floor(u.northing / 100000) + rowOffset) % 20]
  const div = 10 ** (5 - digits)
  const e = String(Math.floor((u.easting % 100000) / div)).padStart(digits, '0')
  const n = String(Math.floor((u.northing % 100000) / div)).padStart(digits, '0')
  return `${u.zone}${u.band} ${col}${row} ${e} ${n}`
}

export function fromMGRS(s: string): [number, number] {
  const m = s.toUpperCase().replace(/\s+/g, '').match(/^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z])([A-HJ-NP-V])(\d*)$/)
  if (!m || m[5].length % 2) throw new Error('Not a valid MGRS reference, e.g. 33U UP 05465 91412.')
  const zone = Number(m[1]), band = m[2], digits = m[5].length / 2
  const set = (zone - 1) % 3
  const e100 = COL_SETS[set].indexOf(m[3]) + 1
  if (e100 <= 0) throw new Error('The column letter does not fit this zone.')
  const rowOffset = zone % 2 === 0 ? 5 : 0
  let n100 = (ROW_SET.indexOf(m[4]) - rowOffset + 20) % 20
  const mul = 10 ** (5 - digits)
  const easting = e100 * 100000 + (digits ? Number(m[5].slice(0, digits)) * mul : 0) + mul / 2
  let northingBase = n100 * 100000 + (digits ? Number(m[5].slice(digits)) * mul : 0) + mul / 2
  // band minimum northing, then add 2,000 km cycles until the point is inside the band
  const bandLat = -80 + BANDS.indexOf(band) * 8
  const hemi = band >= 'N' ? 'N' : 'S'
  const minN = toUTM(Math.max(-80, bandLat), (zone - 1) * 6 - 180 + 3, zone).northing
  while (northingBase < minN - 100000) northingBase += 2000000
  return fromUTM(zone, hemi as 'N' | 'S', easting, northingBase)
}

/* ---------- GeoJSON helpers ---------- */
export type FC = { type: 'FeatureCollection'; features: any[] }
export function toFC(g: any): FC {
  if (!g) return { type: 'FeatureCollection', features: [] }
  if (Array.isArray(g)) return { type: 'FeatureCollection', features: g.flatMap((x) => toFC(x).features) }
  if (g.type === 'FeatureCollection') return g
  if (g.type === 'Feature') return { type: 'FeatureCollection', features: [g] }
  if (g.type && g.coordinates) return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: g }] }
  throw new Error('This JSON is not GeoJSON.')
}

export function eachCoord(geom: any, fn: (c: number[]) => void) {
  if (!geom) return
  if (geom.type === 'GeometryCollection') return geom.geometries.forEach((g: any) => eachCoord(g, fn))
  const walk = (c: any) => (typeof c[0] === 'number' ? fn(c) : c.forEach(walk))
  if (geom.coordinates) walk(geom.coordinates)
}

export function bbox(fc: FC): [number, number, number, number] | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const f of fc.features) eachCoord(f.geometry, (c) => { x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]); x1 = Math.max(x1, c[0]); y1 = Math.max(y1, c[1]) })
  return isFinite(x0) ? [x0, y0, x1, y1] : null
}

export function lineLength(coords: number[][]) { let d = 0; for (let i = 1; i < coords.length; i++) d += haversine(coords[i - 1] as LngLat, coords[i] as LngLat); return d }
export function fcStats(fc: FC) {
  const s = { points: 0, lines: 0, polygons: 0, vertices: 0, length: 0 }
  for (const f of fc.features) {
    const g = f.geometry; if (!g) continue
    const t = g.type
    if (t === 'Point' || t === 'MultiPoint') s.points += t === 'Point' ? 1 : g.coordinates.length
    if (t === 'LineString') { s.lines++; s.length += lineLength(g.coordinates) }
    if (t === 'MultiLineString') { s.lines += g.coordinates.length; for (const l of g.coordinates) s.length += lineLength(l) }
    if (t === 'Polygon' || t === 'MultiPolygon') s.polygons += t === 'Polygon' ? 1 : g.coordinates.length
    eachCoord(g, () => s.vertices++)
  }
  return s
}

const xmlEsc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export function toGPX(fc: FC, creator = 'OpenFile') {
  const pt = (c: number[], tag: string, props?: any, time?: string) => `<${tag} lat="${c[1]}" lon="${c[0]}">${c[2] != null ? `<ele>${c[2]}</ele>` : ''}${time ? `<time>${xmlEsc(time)}</time>` : ''}${props?.name ? `<name>${xmlEsc(props.name)}</name>` : ''}${props?.desc || props?.description ? `<desc>${xmlEsc(props.desc ?? props.description)}</desc>` : ''}</${tag}>`
  const wpts: string[] = [], trks: string[] = []
  for (const f of fc.features) {
    const g = f.geometry, p = f.properties ?? {}; if (!g) continue
    const times: string[] | undefined = p.coordinateProperties?.times ?? p.coordTimes
    if (g.type === 'Point') wpts.push(pt(g.coordinates, 'wpt', p, p.time))
    else if (g.type === 'MultiPoint') g.coordinates.forEach((c: number[]) => wpts.push(pt(c, 'wpt', p)))
    else if (g.type === 'LineString' || g.type === 'MultiLineString') {
      const segs = g.type === 'LineString' ? [g.coordinates] : g.coordinates
      trks.push(`<trk>${p.name ? `<name>${xmlEsc(p.name)}</name>` : ''}${segs.map((s: number[][], si: number) => `<trkseg>${s.map((c, i) => pt(c, 'trkpt', null, Array.isArray(times?.[0]) ? (times as any)[si]?.[i] : times?.[i])).join('')}</trkseg>`).join('')}</trk>`)
    } else if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((pp: number[][][]) => pp[0])
      trks.push(`<trk>${p.name ? `<name>${xmlEsc(p.name)}</name>` : ''}${rings.map((r: number[][]) => `<trkseg>${r.map((c) => pt(c, 'trkpt')).join('')}</trkseg>`).join('')}</trk>`)
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="${xmlEsc(creator)}" xmlns="http://www.topografix.com/GPX/1/1">\n${wpts.join('\n')}\n${trks.join('\n')}\n</gpx>\n`
}

/** Flatten features to CSV rows: one row per point/vertex. */
export function toCSVRows(fc: FC) {
  const rows: Record<string, unknown>[] = []
  fc.features.forEach((f, fi) => {
    const props = Object.fromEntries(Object.entries(f.properties ?? {}).filter(([, v]) => v === null || typeof v !== 'object'))
    let vi = 0
    eachCoord(f.geometry, (c) => rows.push({ feature: fi + 1, vertex: ++vi, type: f.geometry?.type, latitude: c[1], longitude: c[0], elevation: c[2] ?? '', ...props }))
  })
  return rows
}

/** Rows with lat/lon columns → point features. */
export function rowsToFC(rows: Record<string, any>[]): FC {
  if (!rows.length) throw new Error('The CSV has no rows.')
  const keys = Object.keys(rows[0])
  const find = (re: RegExp) => keys.find((k) => re.test(k.trim()))
  const latK = find(/^(lat|latitude|y)$/i), lonK = find(/^(lon|lng|long|longitude|x)$/i)
  if (!latK || !lonK) throw new Error('Could not find latitude and longitude columns. Name them lat and lon (or latitude and longitude).')
  const eleK = find(/^(ele|elevation|alt|altitude)$/i)
  const features = rows.filter((r) => isFinite(parseFloat(r[latK])) && isFinite(parseFloat(r[lonK]))).map((r) => {
    const props = { ...r }; delete props[latK]; delete props[lonK]; if (eleK) delete props[eleK]
    const c = [parseFloat(r[lonK]), parseFloat(r[latK])]; if (eleK && isFinite(parseFloat(r[eleK]))) c.push(parseFloat(r[eleK]))
    return { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: c } }
  })
  return { type: 'FeatureCollection', features }
}

export function fmtDistance(m: number) { return m >= 1000 ? `${(m / 1000).toFixed(2)} km (${(m / 1609.344).toFixed(2)} mi)` : `${m.toFixed(1)} m (${(m * 3.28084).toFixed(0)} ft)` }
