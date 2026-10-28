/* Pure mesh helpers (no DOM, no three.js): heightmap to solid mesh, binary STL, and STL analysis. Node-testable. */

export type Tri = Float32Array // 9 floats per triangle, flat list

/** Build a closed solid from a heightmap (row-major, 0..1, 1 = thickest).
 *  Flat: x in [0,w], y in [0,h], z from 0 to height. Curved: bent around the Y axis by `curve` degrees. */
export function heightmapSolid(hm: Float32Array, cols: number, rows: number, o: { width: number; minT: number; maxT: number; curve?: number }): Tri {
  const sx = o.width / (cols - 1)
  const height = sx * (rows - 1)
  const tris: number[] = []
  const z = (i: number, j: number) => o.minT + hm[j * cols + i] * (o.maxT - o.minT)
  const curve = ((o.curve ?? 0) * Math.PI) / 180
  const R = curve > 0 ? o.width / curve : 0
  // map (x, y, depth) -> 3D. Depth 0 is the back face.
  const P = (x: number, y: number, d: number): [number, number, number] => {
    if (!R) return [x, height - y, d]
    const a = (x / o.width - 0.5) * curve, r = R + d
    return [Math.sin(a) * r, height - y, Math.cos(a) * r - R]
  }
  const quad = (a: number[], b: number[], c: number[], d: number[]) => { tris.push(...a, ...b, ...c, ...a, ...c, ...d) }
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
    const x0 = i * sx, x1 = (i + 1) * sx, y0 = j * sx, y1 = (j + 1) * sx
    // front (relief) faces outward (+z): counter-clockwise seen from front
    quad(P(x0, y0, z(i, j)), P(x0, y1, z(i, j + 1)), P(x1, y1, z(i + 1, j + 1)), P(x1, y0, z(i + 1, j)))
    // back face (z = 0) faces -z
    quad(P(x0, y0, 0), P(x1, y0, 0), P(x1, y1, 0), P(x0, y1, 0))
  }
  // side walls
  for (let i = 0; i < cols - 1; i++) {
    const x0 = i * sx, x1 = (i + 1) * sx
    quad(P(x0, 0, 0), P(x0, 0, z(i, 0)), P(x1, 0, z(i + 1, 0)), P(x1, 0, 0))
    const yb = (rows - 1) * sx, jb = rows - 1
    quad(P(x1, yb, 0), P(x1, yb, z(i + 1, jb)), P(x0, yb, z(i, jb)), P(x0, yb, 0))
  }
  for (let j = 0; j < rows - 1; j++) {
    const y0 = j * sx, y1 = (j + 1) * sx, xr = (cols - 1) * sx, ir = cols - 1
    quad(P(0, y1, 0), P(0, y1, z(0, j + 1)), P(0, y0, z(0, j)), P(0, y0, 0))
    quad(P(xr, y0, 0), P(xr, y0, z(ir, j)), P(xr, y1, z(ir, j + 1)), P(xr, y1, 0))
  }
  return Float32Array.from(tris)
}

export function binaryStl(tris: Tri, name = 'OpenFile'): Uint8Array {
  const n = tris.length / 9
  const buf = new ArrayBuffer(84 + n * 50), v = new DataView(buf), u8 = new Uint8Array(buf)
  for (let i = 0; i < Math.min(80, name.length); i++) u8[i] = name.charCodeAt(i) & 0x7f
  v.setUint32(80, n, true)
  let o = 84
  for (let t = 0; t < n; t++) {
    const b = t * 9
    const ax = tris[b + 3] - tris[b], ay = tris[b + 4] - tris[b + 1], az = tris[b + 5] - tris[b + 2]
    const bx = tris[b + 6] - tris[b], by = tris[b + 7] - tris[b + 1], bz = tris[b + 8] - tris[b + 2]
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l
    v.setFloat32(o, nx, true); v.setFloat32(o + 4, ny, true); v.setFloat32(o + 8, nz, true); o += 12
    for (let k = 0; k < 9; k++) { v.setFloat32(o, tris[b + k], true); o += 4 }
    v.setUint16(o, 0, true); o += 2
  }
  return u8
}

export type MeshReport = {
  triangles: number; vertices: number; volume: number; area: number
  bbox: { min: [number, number, number]; max: [number, number, number] }
  boundaryEdges: number; nonManifoldEdges: number; degenerate: number; flippedHint: boolean; watertight: boolean; shells: number
}

/** Analyse a triangle soup: welds vertices, then reports volume, area, open and non-manifold edges and shells. */
export function analyseMesh(tris: Tri, weld = 1e-5): MeshReport {
  const n = tris.length / 9
  const key = (x: number, y: number, z: number) => `${Math.round(x / weld)},${Math.round(y / weld)},${Math.round(z / weld)}`
  const ids = new Map<string, number>()
  const idx = new Uint32Array(n * 3)
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < n * 3; i++) {
    const x = tris[i * 3], y = tris[i * 3 + 1], z = tris[i * 3 + 2]
    if (x < min[0]) min[0] = x; if (y < min[1]) min[1] = y; if (z < min[2]) min[2] = z
    if (x > max[0]) max[0] = x; if (y > max[1]) max[1] = y; if (z > max[2]) max[2] = z
    const k = key(x, y, z); let id = ids.get(k); if (id === undefined) { id = ids.size; ids.set(k, id) } idx[i] = id
  }
  let vol = 0, area = 0, degenerate = 0
  const edges = new Map<string, number>()
  const parent = new Int32Array(ids.size).map((_, i) => i)
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a] } return a }
  for (let t = 0; t < n; t++) {
    const b = t * 9
    const [x1, y1, z1, x2, y2, z2, x3, y3, z3] = [tris[b], tris[b + 1], tris[b + 2], tris[b + 3], tris[b + 4], tris[b + 5], tris[b + 6], tris[b + 7], tris[b + 8]]
    vol += (x1 * (y2 * z3 - y3 * z2) - x2 * (y1 * z3 - y3 * z1) + x3 * (y1 * z2 - y2 * z1)) / 6
    const ax = x2 - x1, ay = y2 - y1, az = z2 - z1, bx = x3 - x1, by = y3 - y1, bz = z3 - z1
    const a = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2
    area += a
    const i0 = idx[t * 3], i1 = idx[t * 3 + 1], i2 = idx[t * 3 + 2]
    if (a < 1e-12 || i0 === i1 || i1 === i2 || i0 === i2) { degenerate++; continue }
    for (const [p, q] of [[i0, i1], [i1, i2], [i2, i0]]) { const k = p < q ? `${p}_${q}` : `${q}_${p}`; edges.set(k, (edges.get(k) ?? 0) + 1) }
    const r0 = find(i0); parent[find(i1)] = r0; parent[find(i2)] = r0
  }
  let boundary = 0, nonManifold = 0
  for (const c of edges.values()) { if (c === 1) boundary++; else if (c > 2) nonManifold++ }
  const roots = new Set<number>(); for (let t = 0; t < n; t++) roots.add(find(idx[t * 3]))
  return { triangles: n, vertices: ids.size, volume: Math.abs(vol), area, bbox: { min, max }, boundaryEdges: boundary, nonManifoldEdges: nonManifold, degenerate, flippedHint: vol < 0, watertight: boundary === 0 && nonManifold === 0, shells: roots.size }
}

/** Flip triangle winding (inside-out fix). */
export function flipWinding(tris: Tri): Tri {
  const out = new Float32Array(tris.length)
  for (let t = 0; t < tris.length; t += 9) { out.set(tris.subarray(t, t + 3), t); out.set(tris.subarray(t + 6, t + 9), t + 3); out.set(tris.subarray(t + 3, t + 6), t + 6) }
  return out
}
/** Drop degenerate triangles. */
export function removeDegenerate(tris: Tri): Tri {
  const keep: number[] = []
  for (let t = 0; t < tris.length; t += 9) {
    const ax = tris[t + 3] - tris[t], ay = tris[t + 4] - tris[t + 1], az = tris[t + 5] - tris[t + 2], bx = tris[t + 6] - tris[t], by = tris[t + 7] - tris[t + 1], bz = tris[t + 8] - tris[t + 2]
    if (Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) > 1e-12) for (let k = 0; k < 9; k++) keep.push(tris[t + k])
  }
  return Float32Array.from(keep)
}

/** Weld a triangle soup into indexed positions. */
export function weldMesh(tris: Tri, eps = 1e-6): { positions: Float32Array; indices: Uint32Array } {
  const map = new Map<string, number>(); const pos: number[] = []; const idx = new Uint32Array(tris.length / 3)
  for (let i = 0; i < tris.length / 3; i++) {
    const x = tris[i * 3], y = tris[i * 3 + 1], z = tris[i * 3 + 2]
    const k = `${Math.round(x / eps)},${Math.round(y / eps)},${Math.round(z / eps)}`
    let id = map.get(k); if (id === undefined) { id = pos.length / 3; map.set(k, id); pos.push(x, y, z) } idx[i] = id
  }
  return { positions: Float32Array.from(pos), indices: idx }
}
export function unweldMesh(positions: Float32Array, indices: Uint32Array, count = indices.length): Tri {
  const out = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) { const v = indices[i] * 3; out[i * 3] = positions[v]; out[i * 3 + 1] = positions[v + 1]; out[i * 3 + 2] = positions[v + 2] }
  return out
}
export function transformTris(tris: Tri, f: (x: number, y: number, z: number) => [number, number, number]): Tri {
  const out = new Float32Array(tris.length)
  for (let i = 0; i < tris.length; i += 3) { const [x, y, z] = f(tris[i], tris[i + 1], tris[i + 2]); out[i] = x; out[i + 1] = y; out[i + 2] = z }
  return out
}
