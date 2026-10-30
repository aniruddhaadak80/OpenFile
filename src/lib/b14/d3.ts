/* 3D helpers for round 14: G-code toolpaths, point clouds (PLY, PCD, XYZ, PTS, CSV, LAS) and turntable camera paths.
 * Pure TypeScript, unit tested in Node (scripts/tests/b14/d3.test.mjs). */

/* ---------------- G-code ---------------- */
export interface GcodeLayer { z: number; start: number; end: number }
export interface Gcode {
  /** flat segments: x1 y1 z1 x2 y2 z2 per segment */
  seg: Float32Array
  /** 0 travel, 1 extrude (or cut), 2 retract only */
  kind: Uint8Array
  layerOf: Uint32Array
  layers: GcodeLayer[]
  bounds: { min: [number, number, number]; max: [number, number, number] }
  filament: number
  seconds: number
  travel: number
  extrudeLen: number
  lines: number
  flavor: 'printer' | 'cnc' | 'laser'
  tools: number[]
  meta: Record<string, string>
}

/** Parse G-code (G0/G1 moves, G2/G3 arcs, G90/G91, M82/M83, G92, G20/G21) into line segments grouped by layer. */
export function parseGcode(text: string, maxSegments = 3_000_000): Gcode {
  const seg: number[] = [], kind: number[] = [], layerOf: number[] = []
  const layers: GcodeLayer[] = []
  let x = 0, y = 0, z = 0, e = 0, f = 1800
  let absXYZ = true, absE = true, scale = 1
  let filament = 0, seconds = 0, travel = 0, extrudeLen = 0, lines = 0
  let usesE = /^[ \t]*G0?[01]\b[^;\n]*\sE[-+]?\.?\d/im.test(text.slice(0, 400000))
  const laser = !usesE && /laser|lightburn/i.test(text.slice(0, 4000))
  const tools = new Set<number>(), meta: Record<string, string> = {}
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  let curLayerZ = NaN
  let lastMotion: string | undefined
  const startLayer = (zz: number) => { if (layers.length) layers[layers.length - 1].end = kind.length; layers.push({ z: zz, start: kind.length, end: kind.length }); curLayerZ = zz }
  const add = (x2: number, y2: number, z2: number, k: number) => {
    if (kind.length >= maxSegments) return
    if (k === 1 && (Number.isNaN(curLayerZ) || Math.abs(z2 - curLayerZ) > 1e-4)) startLayer(z2)
    if (!layers.length) startLayer(z2)
    seg.push(x, y, z, x2, y2, z2); kind.push(k); layerOf.push(layers.length - 1)
    if (k === 1) for (const [i, v] of [x, y, z, x2, y2, z2].entries()) { const a = i % 3; if (v < min[a]) min[a] = v; if (v > max[a]) max[a] = v }
  }
  for (const raw of text.split(/\r?\n/)) {
    lines++
    const cm = raw.match(/;\s*([A-Za-z_ ]+?)\s*[:=]\s*(.+)$/)
    if (cm && Object.keys(meta).length < 40) { const k = cm[1].trim().toLowerCase(); if (/^(flavor|generated with|filament used|estimated printing time|layer height|nozzle_diameter|filament_type|printer_model|time|layer_count)/.test(k)) meta[cm[1].trim()] = cm[2].trim().slice(0, 80) }
    const line = raw.replace(/;.*$/, '').replace(/\(.*?\)/g, '').trim().toUpperCase()
    if (!line) continue
    const words = line.match(/[A-Z][-+]?\d*\.?\d+(?:E[-+]?\d+)?|[A-Z]/g)
    if (!words) continue
    const w: Record<string, number> = {}
    const codes: string[] = []
    for (const t of words) { const L = t[0], v = Number(t.slice(1)); if (L === 'G' || L === 'M' || L === 'T') codes.push(L + v); else w[L] = v }
    for (const c of codes) {
      if (c === 'G90') { absXYZ = true; absE = true } else if (c === 'G91') { absXYZ = false; absE = false }
      else if (c === 'M82') absE = true; else if (c === 'M83') absE = false
      else if (c === 'G20') scale = 25.4; else if (c === 'G21') scale = 1
      else if (c[0] === 'T') tools.add(Number(c.slice(1)))
      else if (c === 'G92') { if (w.E !== undefined) e = w.E; if (w.X !== undefined) x = w.X * scale; if (w.Y !== undefined) y = w.Y * scale; if (w.Z !== undefined) z = w.Z * scale }
      else if (c === 'G28') { x = 0; y = 0; z = 0 }
      else if (c === 'G4') { seconds += (w.S ?? 0) + (w.P ?? 0) / 1000 }
    }
    const g = codes.find((c) => /^G[0-3](\.0+)?$/.test(c)) ?? (codes.length === 0 && (w.X !== undefined || w.Y !== undefined || w.Z !== undefined) ? lastMotion : undefined)
    if (!g) continue
    lastMotion = g
    if (w.F !== undefined) f = w.F * scale
    const nx = w.X === undefined ? x : absXYZ ? w.X * scale : x + w.X * scale
    const ny = w.Y === undefined ? y : absXYZ ? w.Y * scale : y + w.Y * scale
    const nz = w.Z === undefined ? z : absXYZ ? w.Z * scale : z + w.Z * scale
    let de = 0
    if (w.E !== undefined) { usesE = true; de = absE ? w.E - e : w.E; e = absE ? w.E : e + w.E }
    const cutting = usesE ? de > 0 : g !== 'G0'
    const k = cutting ? 1 : de < 0 ? 2 : 0
    if (de > 0) filament += de
    const moveTo = (tx: number, ty: number, tz: number) => {
      const d = Math.hypot(tx - x, ty - y, tz - z)
      if (d > 0) { add(tx, ty, tz, k); seconds += d / Math.max(1, f) * 60; if (k === 1) extrudeLen += d; else travel += d }
      x = tx; y = ty; z = tz
    }
    if ((g === 'G2' || g === 'G3') && (w.I !== undefined || w.J !== undefined || w.R !== undefined)) {
      let cx: number, cy: number
      if (w.R !== undefined) {
        const r = w.R * scale, dx = nx - x, dy = ny - y, q = Math.hypot(dx, dy), h = Math.sqrt(Math.max(0, r * r - (q / 2) ** 2))
        const s = (g === 'G2') === r > 0 ? -1 : 1
        cx = x + dx / 2 - (s * h * dy) / q; cy = y + dy / 2 + (s * h * dx) / q
      } else { cx = x + (w.I ?? 0) * scale; cy = y + (w.J ?? 0) * scale }
      const r = Math.hypot(x - cx, y - cy)
      let a0 = Math.atan2(y - cy, x - cx), a1 = Math.atan2(ny - cy, nx - cx)
      if (g === 'G2') { if (a1 >= a0 - 1e-9) a1 -= Math.PI * 2 } else if (a1 <= a0 + 1e-9) a1 += Math.PI * 2
      const steps = Math.max(4, Math.min(128, Math.ceil(Math.abs(a1 - a0) * r / 0.5)))
      const z0 = z
      for (let i = 1; i <= steps; i++) { const t = i / steps, a = a0 + (a1 - a0) * t; moveTo(i === steps ? nx : cx + r * Math.cos(a), i === steps ? ny : cy + r * Math.sin(a), z0 + (nz - z0) * t) }
    } else moveTo(nx, ny, nz)
  }
  if (layers.length) layers[layers.length - 1].end = kind.length
  if (!kind.length) throw new Error('No moves found. Is this a G-code file (.gcode, .nc, .ngc, .tap)?')
  if (min[0] === Infinity) { for (let i = 0; i < seg.length; i++) { const a = i % 3; if (seg[i] < min[a]) min[a] = seg[i]; if (seg[i] > max[a]) max[a] = seg[i] } }
  return { seg: Float32Array.from(seg), kind: Uint8Array.from(kind), layerOf: Uint32Array.from(layerOf), layers, bounds: { min: min as [number, number, number], max: max as [number, number, number] }, filament, seconds, travel, extrudeLen, lines, flavor: usesE ? 'printer' : laser ? 'laser' : 'cnc', tools: [...tools], meta }
}
/** Filament length in mm to grams for a diameter and density. */
export const filamentGrams = (mm: number, dia = 1.75, density = 1.24) => (Math.PI * (dia / 2) ** 2 * mm / 1000) * density

export function fmtDuration(s: number): string {
  const t = Math.round(s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60)
  return h ? `${h} h ${m} min` : m ? `${m} min ${t % 60} s` : `${t % 60} s`
}

/* ---------------- point clouds ---------------- */
export interface Cloud { pos: Float32Array; col?: Uint8Array; intensity?: Float32Array; count: number; format: string; comments: string[] }

const isNum = (s: string) => s !== '' && Number.isFinite(Number(s))

/** XYZ, PTS, TXT, CSV: x y z [r g b] or x y z intensity r g b per line (any whitespace, comma or semicolon). */
export function parseXyz(text: string, format = 'xyz'): Cloud {
  const pos: number[] = [], col: number[] = [], inten: number[] = []
  let hasCol = false, hasInt = false, mode: 'xyz' | 'xyzrgb' | 'xyzirgb' | 'xyzi' | null = null
  let colIdx: number[] | null = null
  const lines = text.split(/\r?\n/)
  for (let li = 0; li < lines.length; li++) {
    const l = lines[li].trim()
    if (!l || l.startsWith('#') || l.startsWith('//')) continue
    const p = l.split(/[\s,;]+/)
    if (!p.slice(0, 3).every(isNum)) {
      if (li < 3 && !colIdx) { const hd = p.map((s) => s.toLowerCase().replace(/["']/g, '')); const ix = ['x', 'y', 'z'].map((k) => hd.indexOf(k)); if (ix.every((i) => i >= 0)) { const c = ['r', 'g', 'b'].map((k) => hd.findIndex((h) => h === k || h === (k === 'r' ? 'red' : k === 'g' ? 'green' : 'blue'))); colIdx = [...ix, ...(c.every((i) => i >= 0) ? c : []), hd.findIndex((h) => /intensity|^i$/.test(h))] } }
      continue
    }
    if (p.length === 1 && li < 2) continue // PTS count line
    if (colIdx) {
      pos.push(+p[colIdx[0]], +p[colIdx[1]], +p[colIdx[2]])
      if (colIdx.length >= 6 && colIdx[3] >= 0) { hasCol = true; col.push(+p[colIdx[3]], +p[colIdx[4]], +p[colIdx[5]]) }
      const ii = colIdx[colIdx.length - 1]; if (colIdx.length === 7 || colIdx.length === 4) { if (ii >= 0) { hasInt = true; inten.push(+p[ii]) } }
      continue
    }
    if (!mode) mode = p.length >= 7 ? 'xyzirgb' : p.length === 6 ? 'xyzrgb' : p.length === 4 ? 'xyzi' : 'xyz'
    pos.push(+p[0], +p[1], +p[2])
    if (mode === 'xyzrgb') { hasCol = true; col.push(+p[3], +p[4], +p[5]) }
    else if (mode === 'xyzirgb') { hasCol = true; hasInt = true; inten.push(+p[3]); col.push(+p[4], +p[5], +p[6]) }
    else if (mode === 'xyzi') { hasInt = true; inten.push(+p[3]) }
  }
  if (!pos.length) throw new Error('No points found. Each line should start with x y z numbers.')
  let c: Uint8Array | undefined
  if (hasCol) { const mx = Math.max(...col.slice(0, 3000)); c = Uint8Array.from(col.map((v) => (mx <= 1 ? Math.round(v * 255) : Math.max(0, Math.min(255, Math.round(v)))))) }
  return { pos: Float32Array.from(pos), col: c, intensity: hasInt ? Float32Array.from(inten) : undefined, count: pos.length / 3, format, comments: [] }
}

const TYPES: Record<string, [number, (v: DataView, o: number, le: boolean) => number]> = {
  char: [1, (v, o) => v.getInt8(o)], int8: [1, (v, o) => v.getInt8(o)], uchar: [1, (v, o) => v.getUint8(o)], uint8: [1, (v, o) => v.getUint8(o)],
  short: [2, (v, o, l) => v.getInt16(o, l)], int16: [2, (v, o, l) => v.getInt16(o, l)], ushort: [2, (v, o, l) => v.getUint16(o, l)], uint16: [2, (v, o, l) => v.getUint16(o, l)],
  int: [4, (v, o, l) => v.getInt32(o, l)], int32: [4, (v, o, l) => v.getInt32(o, l)], uint: [4, (v, o, l) => v.getUint32(o, l)], uint32: [4, (v, o, l) => v.getUint32(o, l)],
  float: [4, (v, o, l) => v.getFloat32(o, l)], float32: [4, (v, o, l) => v.getFloat32(o, l)], double: [8, (v, o, l) => v.getFloat64(o, l)], float64: [8, (v, o, l) => v.getFloat64(o, l)],
}

/** PLY vertices (ascii, binary little or big endian). Faces are ignored: only the points are kept. */
export function parsePly(buf: ArrayBuffer): Cloud {
  const u8 = new Uint8Array(buf)
  const headEnd = (() => { const s = new TextDecoder('latin1').decode(u8.subarray(0, Math.min(u8.length, 65536))); const i = s.indexOf('end_header'); if (!s.startsWith('ply') || i < 0) throw new Error('Not a PLY file.'); return i + 'end_header'.length + (s[i + 10] === '\r' ? 2 : 1) })()
  const head = new TextDecoder('latin1').decode(u8.subarray(0, headEnd))
  const fmt = head.match(/format\s+(\S+)/)?.[1] ?? 'ascii'
  const elements: { name: string; count: number; props: { name: string; type: string; list?: [string, string] }[] }[] = []
  const comments: string[] = []
  for (const l of head.split(/\r?\n/)) {
    const p = l.trim().split(/\s+/)
    if (p[0] === 'element') elements.push({ name: p[1], count: +p[2], props: [] })
    else if (p[0] === 'property') elements[elements.length - 1]?.props.push(p[1] === 'list' ? { name: p[4], type: p[3], list: [p[2], p[3]] } : { name: p[2], type: p[1] })
    else if (p[0] === 'comment') comments.push(l.trim().slice(8))
  }
  const vEl = elements.find((e) => e.name === 'vertex')
  if (!vEl) throw new Error('This PLY file has no vertices.')
  const n = vEl.count, pos = new Float32Array(n * 3)
  const names = vEl.props.map((p) => p.name)
  const ix = ['x', 'y', 'z'].map((k) => names.indexOf(k))
  const ic = [['red', 'r', 'diffuse_red'], ['green', 'g', 'diffuse_green'], ['blue', 'b', 'diffuse_blue']].map((ks) => names.findIndex((x) => ks.includes(x)))
  const ii = names.findIndex((x) => /^(intensity|scalar_intensity|i)$/.test(x))
  const hasCol = ic.every((i) => i >= 0), col = hasCol ? new Uint8Array(n * 3) : undefined
  const inten = ii >= 0 ? new Float32Array(n) : undefined
  const colScale = hasCol && /float|double/.test(vEl.props[ic[0]].type) ? 255 : 1
  if (fmt === 'ascii') {
    const body = new TextDecoder('latin1').decode(u8.subarray(headEnd)).split(/\r?\n/)
    let line = 0
    for (const el of elements) {
      if (el !== vEl) { line += el.count; continue }
      for (let i = 0; i < n; i++) {
        const p = body[line++].trim().split(/\s+/).map(Number)
        pos[i * 3] = p[ix[0]]; pos[i * 3 + 1] = p[ix[1]]; pos[i * 3 + 2] = p[ix[2]]
        if (col) for (let k = 0; k < 3; k++) col[i * 3 + k] = Math.round(p[ic[k]] * colScale)
        if (inten) inten[i] = p[ii]
      }
      break
    }
  } else {
    const le = fmt === 'binary_little_endian', v = new DataView(buf)
    let o = headEnd
    for (const el of elements) {
      const fixed = el.props.every((p) => !p.list)
      if (el !== vEl) {
        if (fixed) { o += el.count * el.props.reduce((a, p) => a + TYPES[p.type][0], 0); continue }
        for (let i = 0; i < el.count; i++) for (const p of el.props) { if (p.list) { const [cs, cr] = TYPES[p.list[0]], cnt = cr(v, o, le); o += cs + cnt * TYPES[p.list[1]][0] } else o += TYPES[p.type][0] }
        continue
      }
      const offs: number[] = []; let stride = 0
      for (const p of el.props) { offs.push(stride); stride += TYPES[p.type][0] }
      const rd = el.props.map((p) => TYPES[p.type][1])
      for (let i = 0; i < n; i++) {
        const b = o + i * stride
        for (let k = 0; k < 3; k++) pos[i * 3 + k] = rd[ix[k]](v, b + offs[ix[k]], le)
        if (col) for (let k = 0; k < 3; k++) col[i * 3 + k] = Math.round(rd[ic[k]](v, b + offs[ic[k]], le) * colScale)
        if (inten) inten[i] = rd[ii](v, b + offs[ii], le)
      }
      break
    }
  }
  return { pos, col, intensity: inten, count: n, format: 'ply', comments }
}

/** PCD (ascii or binary; binary_compressed is not supported). */
export function parsePcd(buf: ArrayBuffer): Cloud {
  const u8 = new Uint8Array(buf)
  const s = new TextDecoder('latin1').decode(u8.subarray(0, Math.min(u8.length, 8192)))
  const m = s.match(/^DATA\s+(\S+)\s*$/m)
  if (!m) throw new Error('Not a PCD file (no DATA line).')
  const headEnd = (m.index ?? 0) + m[0].length + 1
  const h: Record<string, string[]> = {}
  for (const l of s.slice(0, headEnd).split(/\r?\n/)) { const p = l.trim().split(/\s+/); if (p[0] && !p[0].startsWith('#')) h[p[0].toUpperCase()] = p.slice(1) }
  const fields = h.FIELDS ?? [], size = (h.SIZE ?? []).map(Number), type = h.TYPE ?? [], count = (h.COUNT ?? fields.map(() => '1')).map(Number)
  const n = Number(h.POINTS?.[0] ?? (Number(h.WIDTH?.[0]) * Number(h.HEIGHT?.[0] ?? 1)))
  const fx = ['x', 'y', 'z'].map((k) => fields.indexOf(k)), frgb = fields.findIndex((f) => f === 'rgb' || f === 'rgba'), fi = fields.indexOf('intensity')
  if (fx.some((i) => i < 0)) throw new Error('This PCD file has no x y z fields.')
  const pos = new Float32Array(n * 3), col = frgb >= 0 ? new Uint8Array(n * 3) : undefined, inten = fi >= 0 ? new Float32Array(n) : undefined
  const putRgb = (i: number, packed: number) => { if (!col) return; col[i * 3] = (packed >> 16) & 255; col[i * 3 + 1] = (packed >> 8) & 255; col[i * 3 + 2] = packed & 255 }
  if (m[1] === 'ascii') {
    const lines = new TextDecoder('latin1').decode(u8.subarray(headEnd)).split(/\r?\n/).filter((l) => l.trim())
    const colStart: number[] = []; let c = 0; for (const k of count) { colStart.push(c); c += k }
    for (let i = 0; i < Math.min(n, lines.length); i++) {
      const p = lines[i].trim().split(/\s+/)
      for (let k = 0; k < 3; k++) pos[i * 3 + k] = +p[colStart[fx[k]]]
      if (col) { const raw = p[colStart[frgb]]; const f = new DataView(new ArrayBuffer(4)); if (type[frgb] === 'F') { f.setFloat32(0, +raw, true); putRgb(i, f.getUint32(0, true)) } else putRgb(i, +raw) }
      if (inten) inten[i] = +p[colStart[fi]]
    }
  } else if (m[1] === 'binary') {
    const v = new DataView(buf), offs: number[] = []; let stride = 0
    fields.forEach((_, k) => { offs.push(stride); stride += size[k] * count[k] })
    const rd = (k: number, o: number) => { const t = type[k], sz = size[k]; return t === 'F' ? (sz === 8 ? v.getFloat64(o, true) : v.getFloat32(o, true)) : t === 'U' ? (sz === 1 ? v.getUint8(o) : sz === 2 ? v.getUint16(o, true) : v.getUint32(o, true)) : (sz === 1 ? v.getInt8(o) : sz === 2 ? v.getInt16(o, true) : v.getInt32(o, true)) }
    for (let i = 0; i < n; i++) {
      const b = headEnd + i * stride
      for (let k = 0; k < 3; k++) pos[i * 3 + k] = rd(fx[k], b + offs[fx[k]])
      if (col) putRgb(i, v.getUint32(b + offs[frgb], true))
      if (inten) inten[i] = rd(fi, b + offs[fi])
    }
  } else throw new Error('Compressed PCD files are not supported yet. Save as ascii or binary PCD.')
  return { pos, col, intensity: inten, count: n, format: 'pcd', comments: [] }
}

/** LAS 1.0 to 1.4 (uncompressed). LAZ needs the LASzip engine and is refused with a clear message. */
export function parseLas(buf: ArrayBuffer, maxPoints = 5_000_000): Cloud {
  const v = new DataView(buf)
  const sig = String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))
  if (sig !== 'LASF') throw new Error('Not a LAS file.')
  const vMinor = v.getUint8(25), offset = v.getUint32(96, true), fmtRaw = v.getUint8(104), fmt = fmtRaw & 0x3f
  if (fmtRaw & 0x80 || fmtRaw & 0x40) throw new Error('This is a compressed LAZ file. Decompress it to LAS first, then open it here.')
  const recLen = v.getUint16(105, true)
  let n = v.getUint32(107, true)
  if (vMinor >= 4 && !n && buf.byteLength >= 255) n = Number(v.getBigUint64(247, true))
  const sx = v.getFloat64(131, true), sy = v.getFloat64(139, true), sz = v.getFloat64(147, true)
  const ox = v.getFloat64(155, true), oy = v.getFloat64(163, true), oz = v.getFloat64(171, true)
  n = Math.min(n, Math.floor((buf.byteLength - offset) / recLen), maxPoints)
  const rgbOff = ({ 2: 20, 3: 28, 5: 28, 7: 30, 8: 30, 10: 30 } as Record<number, number>)[fmt]
  const pos = new Float32Array(n * 3), inten = new Float32Array(n), col = rgbOff !== undefined ? new Uint8Array(n * 3) : undefined
  let colMax = 0
  for (let i = 0; i < n; i++) {
    const b = offset + i * recLen
    pos[i * 3] = v.getInt32(b, true) * sx + ox; pos[i * 3 + 1] = v.getInt32(b + 4, true) * sy + oy; pos[i * 3 + 2] = v.getInt32(b + 8, true) * sz + oz
    inten[i] = v.getUint16(b + 12, true)
    if (col) for (let k = 0; k < 3; k++) { const c = v.getUint16(b + rgbOff! + k * 2, true); if (c > colMax) colMax = c; col[i * 3 + k] = c > 255 ? c >> 8 : c }
  }
  if (col && colMax <= 255) { /* already 8 bit */ }
  return { pos, col, intensity: inten, count: n, format: 'las', comments: [`LAS 1.${vMinor}, point format ${fmt}`] }
}

export function parseCloud(name: string, buf: ArrayBuffer): Cloud {
  const ext = name.toLowerCase().split('.').pop() || ''
  if (ext === 'ply') return parsePly(buf)
  if (ext === 'pcd') return parsePcd(buf)
  if (ext === 'las') return parseLas(buf)
  if (ext === 'laz') throw new Error('LAZ is the compressed form of LAS. Decompress it to LAS first, then open it here.')
  return parseXyz(new TextDecoder().decode(buf), ext)
}

/** Keep one point per voxel (grid cell of `size`). */
export function voxelDown(c: Cloud, size: number): Cloud {
  if (!(size > 0)) return c
  const seen = new Map<string, number>(), keep: number[] = []
  for (let i = 0; i < c.count; i++) { const k = `${Math.floor(c.pos[i * 3] / size)},${Math.floor(c.pos[i * 3 + 1] / size)},${Math.floor(c.pos[i * 3 + 2] / size)}`; if (!seen.has(k)) { seen.set(k, i); keep.push(i) } }
  return pick(c, keep)
}
export function everyNth(c: Cloud, n: number): Cloud { if (n <= 1) return c; const keep: number[] = []; for (let i = 0; i < c.count; i += n) keep.push(i); return pick(c, keep) }
function pick(c: Cloud, keep: number[]): Cloud {
  const pos = new Float32Array(keep.length * 3), col = c.col ? new Uint8Array(keep.length * 3) : undefined, inten = c.intensity ? new Float32Array(keep.length) : undefined
  keep.forEach((i, j) => { for (let k = 0; k < 3; k++) { pos[j * 3 + k] = c.pos[i * 3 + k]; if (col) col[j * 3 + k] = c.col![i * 3 + k] } if (inten) inten[j] = c.intensity![i] })
  return { ...c, pos, col, intensity: inten, count: keep.length }
}
export function cloudBounds(c: Cloud) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < c.count * 3; i++) { const a = i % 3; if (c.pos[i] < min[a]) min[a] = c.pos[i]; if (c.pos[i] > max[a]) max[a] = c.pos[i] }
  return { min, max }
}
/** Move the cloud so its centre sits at the origin (large survey coordinates lose precision otherwise). */
export function recenter(c: Cloud): { cloud: Cloud; shift: [number, number, number] } {
  const { min, max } = cloudBounds(c), s: [number, number, number] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const pos = new Float32Array(c.pos.length); for (let i = 0; i < pos.length; i++) pos[i] = c.pos[i] - s[i % 3]
  return { cloud: { ...c, pos }, shift: s }
}

export type CloudOut = 'ply' | 'ply-ascii' | 'pcd' | 'pcd-binary' | 'xyz' | 'csv' | 'las'
export function writeCloud(c: Cloud, fmt: CloudOut): Uint8Array {
  const n = c.count, hasC = !!c.col, hasI = !!c.intensity
  const enc = (s: string) => new TextEncoder().encode(s)
  const f6 = (x: number) => +x.toFixed(6)
  if (fmt === 'xyz' || fmt === 'csv') {
    const sep = fmt === 'csv' ? ',' : ' ', rows: string[] = fmt === 'csv' ? [['x', 'y', 'z', ...(hasC ? ['r', 'g', 'b'] : []), ...(hasI ? ['intensity'] : [])].join(',')] : []
    for (let i = 0; i < n; i++) rows.push([f6(c.pos[i * 3]), f6(c.pos[i * 3 + 1]), f6(c.pos[i * 3 + 2]), ...(hasC ? [c.col![i * 3], c.col![i * 3 + 1], c.col![i * 3 + 2]] : []), ...(hasI ? [f6(c.intensity![i])] : [])].join(sep))
    return enc(rows.join('\n') + '\n')
  }
  if (fmt === 'ply-ascii' || fmt === 'ply') {
    const head = `ply\nformat ${fmt === 'ply' ? 'binary_little_endian' : 'ascii'} 1.0\ncomment Made with OpenFile\nelement vertex ${n}\nproperty float x\nproperty float y\nproperty float z\n${hasC ? 'property uchar red\nproperty uchar green\nproperty uchar blue\n' : ''}${hasI ? 'property float intensity\n' : ''}end_header\n`
    if (fmt === 'ply-ascii') { const rows: string[] = []; for (let i = 0; i < n; i++) rows.push([f6(c.pos[i * 3]), f6(c.pos[i * 3 + 1]), f6(c.pos[i * 3 + 2]), ...(hasC ? [c.col![i * 3], c.col![i * 3 + 1], c.col![i * 3 + 2]] : []), ...(hasI ? [f6(c.intensity![i])] : [])].join(' ')); return enc(head + rows.join('\n') + '\n') }
    const h = enc(head), stride = 12 + (hasC ? 3 : 0) + (hasI ? 4 : 0), out = new Uint8Array(h.length + n * stride), v = new DataView(out.buffer)
    out.set(h)
    for (let i = 0; i < n; i++) { let o = h.length + i * stride; for (let k = 0; k < 3; k++) { v.setFloat32(o, c.pos[i * 3 + k], true); o += 4 } if (hasC) for (let k = 0; k < 3; k++) v.setUint8(o++, c.col![i * 3 + k]); if (hasI) v.setFloat32(o, c.intensity![i], true) }
    return out
  }
  if (fmt === 'pcd' || fmt === 'pcd-binary') {
    const fields = ['x', 'y', 'z', ...(hasC ? ['rgb'] : []), ...(hasI ? ['intensity'] : [])]
    const head = `# .PCD v0.7 - Point Cloud Data file format\nVERSION 0.7\nFIELDS ${fields.join(' ')}\nSIZE ${fields.map(() => 4).join(' ')}\nTYPE ${fields.map((f) => (f === 'rgb' ? 'U' : 'F')).join(' ')}\nCOUNT ${fields.map(() => 1).join(' ')}\nWIDTH ${n}\nHEIGHT 1\nVIEWPOINT 0 0 0 1 0 0 0\nPOINTS ${n}\nDATA ${fmt === 'pcd' ? 'ascii' : 'binary'}\n`
    const packed = (i: number) => ((c.col![i * 3] << 16) | (c.col![i * 3 + 1] << 8) | c.col![i * 3 + 2]) >>> 0
    if (fmt === 'pcd') { const rows: string[] = []; for (let i = 0; i < n; i++) rows.push([f6(c.pos[i * 3]), f6(c.pos[i * 3 + 1]), f6(c.pos[i * 3 + 2]), ...(hasC ? [packed(i)] : []), ...(hasI ? [f6(c.intensity![i])] : [])].join(' ')); return enc(head + rows.join('\n') + '\n') }
    const h = enc(head), stride = fields.length * 4, out = new Uint8Array(h.length + n * stride), v = new DataView(out.buffer)
    out.set(h)
    for (let i = 0; i < n; i++) { let o = h.length + i * stride; for (let k = 0; k < 3; k++) { v.setFloat32(o, c.pos[i * 3 + k], true); o += 4 } if (hasC) { v.setUint32(o, packed(i), true); o += 4 } if (hasI) v.setFloat32(o, c.intensity![i], true) }
    return out
  }
  // LAS 1.2, point format 2 (with colour) or 0
  const pf = hasC ? 2 : 0, recLen = hasC ? 26 : 20, hdr = 227
  const out = new Uint8Array(hdr + n * recLen), v = new DataView(out.buffer)
  const { min, max } = cloudBounds(c)
  const sc = 0.001, off = min.map((m) => Math.floor(m))
  'LASF'.split('').forEach((ch, i) => v.setUint8(i, ch.charCodeAt(0)))
  v.setUint8(24, 1); v.setUint8(25, 2)
  const sys = 'OpenFile'; sys.split('').forEach((ch, i) => { v.setUint8(26 + i, ch.charCodeAt(0)); v.setUint8(58 + i, ch.charCodeAt(0)) })
  const d = new Date(); v.setUint16(90, Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1, true); v.setUint16(92, d.getUTCFullYear(), true)
  v.setUint16(94, hdr, true); v.setUint32(96, hdr, true); v.setUint32(100, 0, true); v.setUint8(104, pf); v.setUint16(105, recLen, true); v.setUint32(107, n, true); v.setUint32(111, n, true)
  for (let k = 0; k < 3; k++) { v.setFloat64(131 + k * 8, sc, true); v.setFloat64(155 + k * 8, off[k], true) }
  v.setFloat64(179, max[0], true); v.setFloat64(187, min[0], true); v.setFloat64(195, max[1], true); v.setFloat64(203, min[1], true); v.setFloat64(211, max[2], true); v.setFloat64(219, min[2], true)
  let imax = 1; if (hasI) for (let i = 0; i < n; i++) if (c.intensity![i] > imax) imax = c.intensity![i]
  for (let i = 0; i < n; i++) {
    const b = hdr + i * recLen
    for (let k = 0; k < 3; k++) v.setInt32(b + k * 4, Math.round((c.pos[i * 3 + k] - off[k]) / sc), true)
    if (hasI) v.setUint16(b + 12, Math.round(imax > 65535 ? (c.intensity![i] / imax) * 65535 : c.intensity![i]), true)
    v.setUint8(b + 14, 0x09) // return 1 of 1
    if (hasC) for (let k = 0; k < 3; k++) v.setUint16(b + 20 + k * 2, c.col![i * 3 + k] * 257, true)
  }
  return out
}

/* ---------------- turntable ---------------- */
/** Camera position on a circle around a target for frame i of n, with elevation in degrees. */
export function orbitPos(i: number, n: number, radius: number, elevationDeg: number, target: [number, number, number] = [0, 0, 0], turns = 1, dir: 1 | -1 = 1): [number, number, number] {
  const a = (i / n) * Math.PI * 2 * turns * dir, e = (elevationDeg * Math.PI) / 180
  return [target[0] + radius * Math.cos(e) * Math.sin(a), target[1] + radius * Math.sin(e), target[2] + radius * Math.cos(e) * Math.cos(a)]
}
