/* Minimal Aseprite (.ase / .aseprite) reader: layers, cels (raw, linked, zlib), palettes and tags,
 * composited into RGBA frames. Blend modes other than normal are drawn as normal. */
import { unzlibSync } from 'fflate'
import type { Anim, Frame } from './anim/core'

export interface AseTag { name: string; from: number; to: number; direction: 'forward' | 'reverse' | 'pingpong' | 'pingpong_reverse'; color: string }
export interface AseLayer { name: string; visible: boolean; opacity: number; type: number; level: number; blend: number }
export interface AseFile { width: number; height: number; depth: number; frames: number; layers: AseLayer[]; tags: AseTag[]; durations: number[]; anim: Anim; palette: number }

class R {
  p = 0
  constructor(public b: Uint8Array) {}
  u8() { return this.b[this.p++] }
  u16() { const v = this.b[this.p] | (this.b[this.p + 1] << 8); this.p += 2; return v }
  i16() { const v = this.u16(); return v > 0x7fff ? v - 0x10000 : v }
  u32() { const v = (this.b[this.p] | (this.b[this.p + 1] << 8) | (this.b[this.p + 2] << 16) | (this.b[this.p + 3] << 24)) >>> 0; this.p += 4; return v }
  str() { const n = this.u16(); const s = new TextDecoder().decode(this.b.subarray(this.p, this.p + n)); this.p += n; return s }
  skip(n: number) { this.p += n }
}

interface Cel { layer: number; x: number; y: number; opacity: number; w: number; h: number; px: Uint8Array | null; link?: number; z: number }

export function parseAseprite(bytes: Uint8Array): AseFile {
  const r = new R(bytes)
  r.u32()
  if (r.u16() !== 0xa5e0) throw new Error('This is not an Aseprite file.')
  const nFrames = r.u16(), W = r.u16(), H = r.u16(), depth = r.u16(), flags = r.u32()
  r.u16(); r.u32(); r.u32()
  const transparentIndex = r.u8(); r.skip(3)
  let nColors = r.u16(); if (nColors === 0) nColors = 256
  r.p = 128
  if (![8, 16, 32].includes(depth)) throw new Error(`Unsupported colour depth (${depth}).`)
  const layerOpacityValid = !!(flags & 1)
  const palette: [number, number, number, number][] = Array.from({ length: 256 }, () => [0, 0, 0, 255])
  const layers: AseLayer[] = []
  const tags: AseTag[] = []
  const durations: number[] = []
  const celsByFrame: Cel[][] = []
  for (let f = 0; f < nFrames; f++) {
    const start = r.p
    const size = r.u32()
    if (r.u16() !== 0xf1fa) throw new Error(`Frame ${f + 1} is damaged.`)
    const oldChunks = r.u16(), dur = r.u16(); r.skip(2)
    const newChunks = r.u32()
    const nChunks = newChunks || oldChunks
    durations.push(dur || 100)
    const cels: Cel[] = []
    for (let c = 0; c < nChunks; c++) {
      const cStart = r.p
      const cSize = r.u32(), type = r.u16()
      if (type === 0x2004) {
        const lf = r.u16(), lt = r.u16(), level = r.u16(); r.u16(); r.u16()
        const blend = r.u16(), opacity = r.u8(); r.skip(3)
        layers.push({ name: r.str(), visible: !!(lf & 1), opacity: layerOpacityValid ? opacity : 255, type: lt, level, blend })
      } else if (type === 0x2005) {
        const layer = r.u16(), x = r.i16(), y = r.i16(), opacity = r.u8(), ct = r.u16(), z = r.i16(); r.skip(5)
        if (ct === 1) cels.push({ layer, x, y, opacity, w: 0, h: 0, px: null, link: r.u16(), z })
        else if (ct === 0 || ct === 2) {
          const w = r.u16(), h = r.u16()
          const data = bytes.subarray(r.p, cStart + cSize)
          const px = ct === 2 ? unzlibSync(data) : data.slice(0, w * h * (depth / 8))
          cels.push({ layer, x, y, opacity, w, h, px, z })
        }
      } else if (type === 0x2019) {
        r.u32(); const first = r.u32(), last = r.u32(); r.skip(8)
        for (let i = first; i <= last && i < 256; i++) { const ef = r.u16(); palette[i] = [r.u8(), r.u8(), r.u8(), r.u8()]; if (ef & 1) r.str() }
      } else if (type === 0x0004 || type === 0x0011) {
        const packets = r.u16(); let idx = 0
        for (let k = 0; k < packets; k++) { idx += r.u8(); let n = r.u8(); if (!n) n = 256; for (let i = 0; i < n && idx < 256; i++, idx++) { const s = type === 0x0011 ? 4 : 1; palette[idx] = [r.u8() * s, r.u8() * s, r.u8() * s, 255].map((v) => Math.min(255, v)) as [number, number, number, number] } }
      } else if (type === 0x2018) {
        const n = r.u16(); r.skip(8)
        for (let k = 0; k < n; k++) {
          const from = r.u16(), to = r.u16(), dir = r.u8(); r.u16(); r.skip(6)
          const rgb = [r.u8(), r.u8(), r.u8()]; r.u8()
          tags.push({ name: r.str(), from, to, direction: (['forward', 'reverse', 'pingpong', 'pingpong_reverse'] as const)[dir] ?? 'forward', color: '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('') })
        }
      }
      r.p = cStart + cSize
    }
    celsByFrame.push(cels)
    r.p = start + size
  }
  // visibility including parent groups
  const effectiveVisible = layers.map((l, i) => {
    if (!l.visible) return false
    let lvl = l.level
    for (let j = i - 1; j >= 0 && lvl > 0; j--) if (layers[j].level < lvl) { if (!layers[j].visible) return false; lvl = layers[j].level }
    return true
  })
  const toRGBA = (px: Uint8Array, i: number, isBg: boolean): [number, number, number, number] => {
    if (depth === 32) return [px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]]
    if (depth === 16) return [px[i * 2], px[i * 2], px[i * 2], px[i * 2 + 1]]
    const k = px[i]; if (k === transparentIndex && !isBg) return [0, 0, 0, 0]
    return palette[k]
  }
  const frames: Frame[] = celsByFrame.map((cels, f) => {
    const out = new Uint8ClampedArray(W * H * 4)
    const resolved = cels.map((c) => (c.link != null ? { ...celsByFrame[c.link]?.find((x) => x.layer === c.layer && x.px), layer: c.layer } as Cel : c)).filter((c) => c && c.px)
    resolved.sort((a, b) => (a.layer + a.z) - (b.layer + b.z) || a.z - b.z)
    for (const c of resolved) {
      const L = layers[c.layer]; if (!L || !effectiveVisible[c.layer] || L.type === 1) continue
      const isBg = c.layer === 0 && L.name.toLowerCase() === 'background'
      const op = (c.opacity / 255) * (L.opacity / 255)
      for (let y = 0; y < c.h; y++) {
        const cy = c.y + y; if (cy < 0 || cy >= H) continue
        for (let x = 0; x < c.w; x++) {
          const cx = c.x + x; if (cx < 0 || cx >= W) continue
          const [sr, sg, sb, sa0] = toRGBA(c.px!, y * c.w + x, isBg)
          const sa = (sa0 / 255) * op; if (sa <= 0) continue
          const di = (cy * W + cx) * 4, da = out[di + 3] / 255, oa = sa + da * (1 - sa)
          out[di] = (sr * sa + out[di] * da * (1 - sa)) / oa; out[di + 1] = (sg * sa + out[di + 1] * da * (1 - sa)) / oa; out[di + 2] = (sb * sa + out[di + 2] * da * (1 - sa)) / oa; out[di + 3] = oa * 255
        }
      }
    }
    return { rgba: out, delay: durations[f] }
  })
  return { width: W, height: H, depth, frames: nFrames, layers, tags, durations, palette: nColors, anim: { width: W, height: H, frames, loop: 0, source: 'Aseprite' } }
}

/** Frames for one tag, honouring its direction. */
export function tagAnim(a: Anim, t: AseTag): Anim {
  const seq = a.frames.slice(t.from, t.to + 1)
  let frames = seq
  if (t.direction === 'reverse') frames = [...seq].reverse()
  if (t.direction === 'pingpong') frames = [...seq, ...seq.slice(1, -1).reverse()]
  if (t.direction === 'pingpong_reverse') { const r = [...seq].reverse(); frames = [...r, ...r.slice(1, -1).reverse()] }
  return { ...a, frames }
}
