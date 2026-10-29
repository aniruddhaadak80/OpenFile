/* Health & Fitness logic: a FIT file decoder (Garmin, Wahoo, Coros, Zwift and others), TCX/GPX trackpoint
 * reading, heart rate zones and training load, Apple Health export parsing, pace and race prediction, and body
 * measures. Pure functions with no DOM. */

export interface Point { t: number; lat?: number; lon?: number; ele?: number; hr?: number; cad?: number; power?: number; speed?: number; dist?: number; temp?: number }
export interface Lap { start: number; elapsed: number; distance?: number; avgHr?: number; maxHr?: number; calories?: number }
export interface Session { sport?: string; start?: number; elapsed?: number; timer?: number; distance?: number; calories?: number; avgHr?: number; maxHr?: number; ascent?: number; avgSpeed?: number }
export interface Activity { points: Point[]; laps: Lap[]; sessions: Session[]; device?: string; created?: number; messages: Record<string, number>; warnings: string[] }

const FIT_EPOCH = 631065600 // 1989-12-31T00:00:00Z in unix seconds
const SPORTS = ['generic', 'running', 'cycling', 'transition', 'fitness equipment', 'swimming', 'basketball', 'soccer', 'tennis', 'american football', 'training', 'walking', 'cross country skiing', 'alpine skiing', 'snowboarding', 'rowing', 'mountaineering', 'hiking', 'multisport', 'paddling', 'flying', 'e-biking', 'motorcycling', 'boating', 'driving', 'golf', 'hang gliding', 'horseback riding', 'hunting', 'fishing', 'inline skating', 'rock climbing', 'sailing', 'ice skating', 'sky diving', 'snowshoeing', 'snowmobiling', 'stand up paddleboarding', 'surfing', 'wakeboarding', 'water skiing', 'kayaking', 'rafting', 'windsurfing', 'kitesurfing', 'tactical', 'jumpmaster', 'boxing', 'floor climbing']
const MANUFACTURERS: Record<number, string> = { 1: 'Garmin', 15: 'Dynastream', 23: 'Suunto', 32: 'Wahoo', 38: 'Polar', 89: 'Tacx', 255: 'Development', 260: 'Zwift', 263: 'Hammerhead', 265: 'Strava', 289: 'Coros', 294: 'Apple' }
const MSG_NAMES: Record<number, string> = { 0: 'file_id', 12: 'sport', 18: 'session', 19: 'lap', 20: 'record', 21: 'event', 23: 'device_info', 34: 'activity', 49: 'file_creator', 78: 'hrv', 101: 'length', 206: 'field_description', 207: 'developer_data_id' }

interface Def { little: boolean; global: number; fields: { num: number; size: number; type: number }[]; devSize: number }

/** Decode a FIT file. Throws on a file that is not FIT. Unknown messages are counted and skipped. */
export function decodeFit(buf: ArrayBuffer | Uint8Array): Activity {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  if (u8.length < 12) throw new Error('This file is too small to be a FIT file.')
  const hsz = u8[0]
  if (String.fromCharCode(u8[8], u8[9], u8[10], u8[11]) !== '.FIT') throw new Error('This is not a FIT file (the ".FIT" mark is missing).')
  const dataSize = dv.getUint32(4, true)
  const end = Math.min(u8.length, hsz + dataSize)
  const defs = new Map<number, Def>()
  const act: Activity = { points: [], laps: [], sessions: [], messages: {}, warnings: [] }
  let p = hsz, lastTs = 0
  if (hsz + dataSize > u8.length) act.warnings.push('The file is cut short. Everything up to the cut was read.')

  const read = (off: number, size: number, type: number, little: boolean): number | string | null => {
    const bt = type & 0x1f
    switch (bt) {
      case 0: case 2: case 10: case 13: { const v = u8[off]; return size === 1 ? (v === (bt === 10 ? 0 : 0xff) ? null : v) : null }
      case 1: { const v = dv.getInt8(off); return v === 0x7f ? null : v }
      case 3: { const v = dv.getInt16(off, little); return v === 0x7fff ? null : v }
      case 4: case 11: { const v = dv.getUint16(off, little); return v === (bt === 11 ? 0 : 0xffff) ? null : v }
      case 5: { const v = dv.getInt32(off, little); return v === 0x7fffffff ? null : v }
      case 6: case 12: { const v = dv.getUint32(off, little); return v === (bt === 12 ? 0 : 0xffffffff) ? null : v }
      case 7: { let s = ''; for (let i = 0; i < size && u8[off + i]; i++) s += String.fromCharCode(u8[off + i]); try { return decodeURIComponent(escape(s)) } catch { return s } }
      case 8: { const v = dv.getFloat32(off, little); return isFinite(v) ? v : null }
      case 9: { const v = dv.getFloat64(off, little); return isFinite(v) ? v : null }
      case 14: case 15: case 16: { const v = Number(dv.getBigUint64(off, little)); return v }
      default: return null
    }
  }

  while (p < end) {
    const h = u8[p++]
    if (h & 0x80) { // compressed timestamp header
      const local = (h >> 5) & 3, off = h & 0x1f
      let ts = (lastTs & ~0x1f) + off; if (off < (lastTs & 0x1f)) ts += 32
      lastTs = ts
      const d = defs.get(local); if (!d) throw new Error('Broken FIT file: data before its definition.')
      p = dataMsg(d, p, ts)
      continue
    }
    const local = h & 0x0f
    if (h & 0x40) { // definition
      const little = u8[p + 1] === 0
      const global = little ? dv.getUint16(p + 2, true) : dv.getUint16(p + 2, false)
      const n = u8[p + 4]; p += 5
      const fields = []
      for (let i = 0; i < n; i++) { fields.push({ num: u8[p], size: u8[p + 1], type: u8[p + 2] }); p += 3 }
      let devSize = 0
      if (h & 0x20) { const nd = u8[p++]; for (let i = 0; i < nd; i++) { devSize += u8[p + 1]; p += 3 } }
      defs.set(local, { little, global, fields, devSize })
    } else {
      const d = defs.get(local); if (!d) throw new Error('Broken FIT file: data before its definition.')
      p = dataMsg(d, p, null)
    }
  }

  function dataMsg(d: Def, start: number, cts: number | null) {
    let o = start
    const f: Record<number, number | string | null> = {}
    for (const fd of d.fields) {
      if (o + fd.size > u8.length) { o += fd.size; continue }
      const sz = [0, 1, 2, 7, 10, 13].includes(fd.type & 0x1f) ? 1 : [3, 4, 11].includes(fd.type & 0x1f) ? 2 : [5, 6, 8, 12].includes(fd.type & 0x1f) ? 4 : 8
      f[fd.num] = (fd.type & 0x1f) === 7 ? read(o, fd.size, fd.type, d.little) : fd.size === sz || (fd.type & 0x1f) === 13 ? read(o, sz, fd.type, d.little) : fd.size >= sz ? read(o, sz, fd.type, d.little) : null
      o += fd.size
    }
    o += d.devSize
    const name = MSG_NAMES[d.global] ?? `message ${d.global}`
    act.messages[name] = (act.messages[name] ?? 0) + 1
    const n = (k: number) => (typeof f[k] === 'number' ? (f[k] as number) : undefined)
    if (n(253) != null) lastTs = n(253)!
    const ts = n(253) ?? cts ?? undefined
    const unix = (v?: number) => (v != null ? (v + FIT_EPOCH) * 1000 : undefined)
    if (d.global === 20 && ts != null) {
      const semi = 180 / 2 ** 31
      const alt = n(78) != null ? n(78)! / 5 - 500 : n(2) != null ? n(2)! / 5 - 500 : undefined
      const spd = n(73) != null ? n(73)! / 1000 : n(6) != null ? n(6)! / 1000 : undefined
      act.points.push({ t: unix(ts)!, lat: n(0) != null ? n(0)! * semi : undefined, lon: n(1) != null ? n(1)! * semi : undefined, ele: alt, hr: n(3), cad: n(4), dist: n(5) != null ? n(5)! / 100 : undefined, speed: spd, power: n(7), temp: n(13) })
    } else if (d.global === 19) {
      act.laps.push({ start: unix(n(2) ?? ts)!, elapsed: (n(7) ?? 0) / 1000, distance: n(9) != null ? n(9)! / 100 : undefined, avgHr: n(15), maxHr: n(16), calories: n(11) })
    } else if (d.global === 18) {
      act.sessions.push({ sport: SPORTS[n(5) ?? -1], start: unix(n(2)), elapsed: n(7) != null ? n(7)! / 1000 : undefined, timer: n(8) != null ? n(8)! / 1000 : undefined, distance: n(9) != null ? n(9)! / 100 : undefined, calories: n(11), avgSpeed: n(14) != null ? n(14)! / 1000 : undefined, avgHr: n(16), maxHr: n(17), ascent: n(22) })
    } else if (d.global === 0) {
      act.device = [MANUFACTURERS[n(1) ?? -1] ?? (n(1) != null ? `maker ${n(1)}` : ''), n(2) != null ? `product ${n(2)}` : ''].filter(Boolean).join(' ')
      act.created = unix(n(4))
    }
    return o
  }
  return act
}

/* ---------------- TCX and GPX ---------------- */
const attr = (s: string, name: string) => { const m = new RegExp(`\\b${name}="([^"]*)"`).exec(s); return m ? m[1] : undefined }
const inner = (s: string, name: string) => { const m = new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>\\s*([^<]*)<`).exec(s); return m ? m[1].trim() : undefined }
const numOr = (s?: string) => (s != null && s !== '' && isFinite(+s) ? +s : undefined)

export function parseTcx(xml: string): Activity {
  const pts = xml.split(/<(?:\w+:)?Trackpoint>/).slice(1).map((b) => b.split(/<\/(?:\w+:)?Trackpoint>/)[0])
  const points: Point[] = pts.map((b) => {
    const hrBlock = /<(?:\w+:)?HeartRateBpm[^>]*>([\s\S]*?)<\/(?:\w+:)?HeartRateBpm>/.exec(b)?.[1] ?? ''
    return { t: Date.parse(inner(b, 'Time') ?? ''), lat: numOr(inner(b, 'LatitudeDegrees')), lon: numOr(inner(b, 'LongitudeDegrees')), ele: numOr(inner(b, 'AltitudeMeters')), dist: numOr(inner(b, 'DistanceMeters')), hr: numOr(inner(hrBlock, 'Value')), cad: numOr(inner(b, 'Cadence')), power: numOr(inner(b, 'Watts')), speed: numOr(inner(b, 'Speed')) }
  }).filter((p) => isFinite(p.t))
  const sport = attr(/<(?:\w+:)?Activity\b[^>]*>/.exec(xml)?.[0] ?? '', 'Sport')
  const laps = xml.split(/<(?:\w+:)?Lap\b/).slice(1).map((b) => ({ start: Date.parse(attr(b, 'StartTime') ?? ''), elapsed: numOr(inner(b, 'TotalTimeSeconds')) ?? 0, distance: numOr(inner(b, 'DistanceMeters')), calories: numOr(inner(b, 'Calories')) }))
  return { points, laps, sessions: [{ sport: sport?.toLowerCase() }], messages: { trackpoints: points.length }, warnings: points.length ? [] : ['No trackpoints found in this TCX file.'] }
}

export function parseGpxHr(xml: string): Activity {
  const pts = xml.split(/<trkpt\b/).slice(1).map((b) => '<trkpt' + b.split(/<\/trkpt>/)[0])
  const points: Point[] = pts.map((b) => ({ t: Date.parse(inner(b, 'time') ?? ''), lat: numOr(attr(b, 'lat')), lon: numOr(attr(b, 'lon')), ele: numOr(inner(b, 'ele')), hr: numOr(inner(b, 'hr')), cad: numOr(inner(b, 'cad')), power: numOr(inner(b, 'power')), temp: numOr(inner(b, 'atemp')) })).filter((p) => isFinite(p.t))
  return { points, laps: [], sessions: [], messages: { trackpoints: points.length }, warnings: points.length ? [] : ['No timed track points found in this GPX file.'] }
}

/** Open any activity file by its name and bytes. */
export function readActivity(name: string, bytes: Uint8Array): Activity {
  const n = name.toLowerCase()
  if (n.endsWith('.fit') || String.fromCharCode(...bytes.slice(8, 12)) === '.FIT') return decodeFit(bytes)
  const text = new TextDecoder().decode(bytes)
  if (n.endsWith('.tcx') || /<TrainingCenterDatabase/i.test(text.slice(0, 2000))) return parseTcx(text)
  if (n.endsWith('.gpx') || /<gpx\b/i.test(text.slice(0, 2000))) return parseGpxHr(text)
  throw new Error('Open a FIT, TCX or GPX activity file.')
}

/* ---------------- distance, stats ---------------- */
export function haversine(a: Point, b: Point) {
  if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) return 0
  const R = 6371008.8, r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Fill in cumulative distance from GPS when the file does not carry it. */
export function withDistance(points: Point[]) {
  if (points.some((p) => p.dist != null)) return points
  let d = 0
  return points.map((p, i) => { if (i) d += haversine(points[i - 1], p); return { ...p, dist: d } })
}

export function activityStats(a: Activity) {
  const pts = withDistance(a.points)
  const hr = pts.map((p) => p.hr).filter((v): v is number => v != null)
  const pw = pts.map((p) => p.power).filter((v): v is number => v != null)
  let ascent = 0
  for (let i = 1; i < pts.length; i++) { const e0 = pts[i - 1].ele, e1 = pts[i].ele; if (e0 != null && e1 != null && e1 > e0) ascent += e1 - e0 }
  const s = a.sessions[0] ?? {}
  const dur = pts.length > 1 ? (pts[pts.length - 1].t - pts[0].t) / 1000 : s.elapsed ?? 0
  const dist = s.distance ?? pts.at(-1)?.dist ?? 0
  return {
    sport: s.sport, start: pts[0]?.t ?? s.start, duration: s.elapsed ?? dur, moving: s.timer ?? dur, distance: dist, points: pts.length,
    avgHr: hr.length ? Math.round(hr.reduce((x, y) => x + y, 0) / hr.length) : s.avgHr, maxHr: hr.length ? Math.max(...hr) : s.maxHr,
    avgPower: pw.length ? Math.round(pw.reduce((x, y) => x + y, 0) / pw.length) : undefined, maxPower: pw.length ? Math.max(...pw) : undefined,
    ascent: s.ascent ?? Math.round(ascent), calories: s.calories, hasGps: pts.some((p) => p.lat != null), hasHr: hr.length > 0,
  }
}

export function toCsvRows(points: Point[]): (string | number)[][] {
  const cols: (keyof Point)[] = ['t', 'lat', 'lon', 'ele', 'dist', 'speed', 'hr', 'cad', 'power', 'temp']
  const used = cols.filter((c) => c === 't' || points.some((p) => p[c] != null))
  const head = used.map((c) => ({ t: 'time', lat: 'latitude', lon: 'longitude', ele: 'elevation_m', dist: 'distance_m', speed: 'speed_mps', hr: 'heart_rate', cad: 'cadence', power: 'power_w', temp: 'temperature_c' }[c]))
  return [head, ...points.map((p) => used.map((c) => (c === 't' ? new Date(p.t).toISOString() : p[c] == null ? '' : +(+p[c]!).toFixed(c === 'lat' || c === 'lon' ? 7 : 2))))]
}

export function toGpx(points: Point[], name = 'Activity'): string {
  const e = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const trk = points.filter((p) => p.lat != null && p.lon != null).map((p) => `<trkpt lat="${p.lat!.toFixed(7)}" lon="${p.lon!.toFixed(7)}">${p.ele != null ? `<ele>${p.ele.toFixed(1)}</ele>` : ''}<time>${new Date(p.t).toISOString()}</time>${p.hr != null || p.cad != null ? `<extensions><gpxtpx:TrackPointExtension>${p.hr != null ? `<gpxtpx:hr>${p.hr}</gpxtpx:hr>` : ''}${p.cad != null ? `<gpxtpx:cad>${p.cad}</gpxtpx:cad>` : ''}</gpxtpx:TrackPointExtension></extensions>` : ''}</trkpt>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="OpenFile" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">\n<trk><name>${e(name)}</name><trkseg>\n${trk}\n</trkseg></trk>\n</gpx>\n`
}

/* ---------------- heart rate zones and load ---------------- */
export const ZONES = [
  { name: 'Zone 1 · Easy', lo: 0.5, hi: 0.6, color: '#38BDF8' },
  { name: 'Zone 2 · Endurance', lo: 0.6, hi: 0.7, color: '#14B8A6' },
  { name: 'Zone 3 · Tempo', lo: 0.7, hi: 0.8, color: '#84CC16' },
  { name: 'Zone 4 · Threshold', lo: 0.8, hi: 0.9, color: '#F5A524' },
  { name: 'Zone 5 · Max', lo: 0.9, hi: 1.01, color: '#F97316' },
]

/** Seconds spent in each zone. Gaps over 30 s (pauses) count as 30 s at most. Karvonen when restHr is given. */
export function zoneTimes(points: Point[], maxHr: number, restHr?: number) {
  const secs = ZONES.map(() => 0)
  let below = 0
  for (let i = 1; i < points.length; i++) {
    const hr = points[i].hr; if (hr == null) continue
    const dt = Math.min(30, Math.max(0, (points[i].t - points[i - 1].t) / 1000))
    const f = restHr != null ? (hr - restHr) / Math.max(1, maxHr - restHr) : hr / maxHr
    const z = ZONES.findIndex((Z) => f >= Z.lo && f < Z.hi)
    if (z >= 0) secs[z] += dt; else if (f >= 1.01) secs[4] += dt; else below += dt
  }
  return { secs, below }
}

/** Banister TRIMP: minutes weighted by heart rate reserve. */
export function trimp(points: Point[], maxHr: number, restHr: number, sex: 'm' | 'f' = 'm') {
  let t = 0
  for (let i = 1; i < points.length; i++) {
    const hr = points[i].hr; if (hr == null) continue
    const dt = Math.min(30, Math.max(0, (points[i].t - points[i - 1].t) / 1000)) / 60
    const r = Math.min(1, Math.max(0, (hr - restHr) / Math.max(1, maxHr - restHr)))
    t += dt * r * (sex === 'm' ? 0.64 * Math.exp(1.92 * r) : 0.86 * Math.exp(1.67 * r))
  }
  return t
}

export const maxHrTanaka = (age: number) => Math.round(208 - 0.7 * age)

/* ---------------- Apple Health export.xml ---------------- */
export interface HealthRecord { type: string; unit: string; value: string; start: string; end: string; source: string }

/** Parse the complete <Record .../> and <Workout .../> elements in a text chunk. Returns the unparsed tail. */
export function parseHealthChunk(text: string): { records: HealthRecord[]; rest: string } {
  const records: HealthRecord[] = []
  const re = /<(Record|Workout)\s([^>]*?)\/?>/g
  let m: RegExpExecArray | null, lastEnd = 0
  while ((m = re.exec(text))) {
    const a = m[2]
    const g = (k: string) => { const r = new RegExp(`\\b${k}="([^"]*)"`).exec(a); return r ? r[1] : '' }
    if (m[1] === 'Record') records.push({ type: g('type'), unit: g('unit'), value: g('value'), start: g('startDate'), end: g('endDate'), source: g('sourceName') })
    else records.push({ type: 'Workout:' + g('workoutActivityType').replace('HKWorkoutActivityType', ''), unit: g('durationUnit') || 'min', value: g('duration'), start: g('startDate'), end: g('endDate'), source: g('sourceName') })
    lastEnd = re.lastIndex
  }
  const cut = text.lastIndexOf('<')
  return { records, rest: cut > lastEnd ? text.slice(cut) : '' }
}

/** Friendly name for an Apple Health type identifier. */
export const healthName = (t: string) => t.replace(/^HK(Quantity|Category|Correlation)TypeIdentifier/, '').replace(/^HKDataType/, '').replace(/([a-z])([A-Z])/g, '$1 $2')

/* ---------------- pace and race prediction ---------------- */
export function parseDuration(s: string): number {
  const p = s.trim().split(':').map(Number)
  if (p.some((x) => !isFinite(x))) return NaN
  return p.reduce((acc, x) => acc * 60 + x, 0)
}
export function fmtDuration(sec: number, alwaysHours = false): string {
  if (!isFinite(sec)) return '-'
  const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  return h || alwaysHours ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`
}
/** Riegel race prediction: T2 = T1 * (D2 / D1) ^ 1.06. */
export const riegel = (t1: number, d1: number, d2: number, k = 1.06) => t1 * (d2 / d1) ** k

/* ---------------- body measures ---------------- */
export const bmi = (kg: number, cm: number) => kg / (cm / 100) ** 2
export function bmiClass(b: number) { return b < 18.5 ? 'Underweight' : b < 25 ? 'Healthy weight' : b < 30 ? 'Overweight' : 'Obesity' }
/** Mifflin-St Jeor resting energy in kcal per day. */
export const bmr = (kg: number, cm: number, age: number, sex: 'm' | 'f') => 10 * kg + 6.25 * cm - 5 * age + (sex === 'm' ? 5 : -161)
export const ACTIVITY = [{ k: 1.2, label: 'Little or no exercise' }, { k: 1.375, label: 'Light exercise 1 to 3 days a week' }, { k: 1.55, label: 'Moderate exercise 3 to 5 days a week' }, { k: 1.725, label: 'Hard exercise 6 to 7 days a week' }, { k: 1.9, label: 'Very hard exercise or a physical job' }]
/** US Navy body fat estimate, measurements in cm. */
export function navyBodyFat(sex: 'm' | 'f', cm: number, neck: number, waist: number, hip = 0) {
  const inch = (x: number) => x / 2.54
  return sex === 'm' ? 86.01 * Math.log10(inch(waist) - inch(neck)) - 70.041 * Math.log10(inch(cm)) + 36.76
    : 163.205 * Math.log10(inch(waist) + inch(hip) - inch(neck)) - 97.684 * Math.log10(inch(cm)) - 78.387
}
/** Devine ideal body weight in kg. */
export const idealWeight = (cm: number, sex: 'm' | 'f') => (sex === 'm' ? 50 : 45.5) + 2.3 * (cm / 2.54 - 60)
