/* Pure palette helpers (no DOM): median-cut quantisation, nearest-colour mapping and dithering.
   Used by compress-to-size, pixel-art-converter, image-compressor and halftone. Node-testable. */

export type RGB = [number, number, number]
export type Dither = 'none' | 'floyd' | 'atkinson' | 'bayer4' | 'bayer8'

/** Median cut on RGB (alpha is ignored when building, preserved when applying). */
export function buildPalette(data: Uint8ClampedArray | Uint8Array, colors: number): RGB[] {
  colors = Math.max(2, Math.min(256, Math.round(colors)))
  const n = data.length / 4
  const step = Math.max(1, Math.floor(n / 60000))
  const px: number[] = []
  for (let i = 0; i < n; i += step) { if (data[i * 4 + 3] < 8) continue; px.push(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) }
  if (!px.length) return [[0, 0, 0], [255, 255, 255]]
  type Box = { idx: number[] }
  const all: number[] = []; for (let i = 0; i < px.length / 3; i++) all.push(i)
  const boxes: Box[] = [{ idx: all }]
  const range = (b: Box) => {
    const mn = [255, 255, 255], mx = [0, 0, 0]
    for (const i of b.idx) for (let c = 0; c < 3; c++) { const v = px[i * 3 + c]; if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v }
    const r = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]
    const ch = r[0] >= r[1] && r[0] >= r[2] ? 0 : r[1] >= r[2] ? 1 : 2
    return { ch, size: r[ch] }
  }
  while (boxes.length < colors) {
    let best = -1, bestScore = -1, bestCh = 0
    for (let k = 0; k < boxes.length; k++) {
      if (boxes[k].idx.length < 2) continue
      const r = range(boxes[k]); const score = r.size * Math.sqrt(boxes[k].idx.length)
      if (score > bestScore) { bestScore = score; best = k; bestCh = r.ch }
    }
    if (best < 0 || bestScore <= 0) break
    const b = boxes[best]
    b.idx.sort((a, c) => px[a * 3 + bestCh] - px[c * 3 + bestCh])
    const mid = b.idx.length >> 1
    boxes.splice(best, 1, { idx: b.idx.slice(0, mid) }, { idx: b.idx.slice(mid) })
  }
  return boxes.map((b) => {
    const s = [0, 0, 0]; for (const i of b.idx) { s[0] += px[i * 3]; s[1] += px[i * 3 + 1]; s[2] += px[i * 3 + 2] }
    const l = Math.max(1, b.idx.length); return [Math.round(s[0] / l), Math.round(s[1] / l), Math.round(s[2] / l)] as RGB
  })
}

export function nearest(pal: RGB[], r: number, g: number, b: number): number {
  let bi = 0, bd = Infinity
  for (let i = 0; i < pal.length; i++) {
    const p = pal[i], dr = r - p[0], dg = g - p[1], db = b - p[2]
    // weighted distance (closer to perceived difference than plain RGB)
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db
    if (d < bd) { bd = d; bi = i }
  }
  return bi
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const BAYER8 = (() => { const m: number[] = []; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { let v = 0, xc = x ^ y, yc = y; for (let bit = 0; bit < 3; bit++) { v = (v << 2) | (((xc >> bit) & 1) << 1) | ((yc >> bit) & 1) } m.push(v) } return m })()

/** Map pixels onto `pal`, returning new RGBA bytes. Alpha is kept (binarised to 0/255 at 50%). */
export function applyPalette(data: Uint8ClampedArray | Uint8Array, w: number, h: number, pal: RGB[], dither: Dither = 'floyd', strength = 1): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(w * h * 4)
  const err = dither === 'floyd' || dither === 'atkinson' ? new Float32Array(w * h * 3) : null
  const spread = pal.length > 1 ? 255 / Math.cbrt(pal.length) : 64
  const cache = new Map<number, number>()
  const near = (r: number, g: number, b: number) => {
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2)
    let v = cache.get(key); if (v === undefined) { v = nearest(pal, r, g, b); cache.set(key, v) } return v
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, o = i * 4
      let r = data[o], g = data[o + 1], b = data[o + 2]
      if (err) { r += err[i * 3]; g += err[i * 3 + 1]; b += err[i * 3 + 2] }
      else if (dither === 'bayer4' || dither === 'bayer8') {
        const t = dither === 'bayer4' ? (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5 : (BAYER8[(y & 7) * 8 + (x & 7)] + 0.5) / 64 - 0.5
        const d = t * spread * strength; r += d; g += d; b += d
      }
      const cr = Math.max(0, Math.min(255, r)), cg = Math.max(0, Math.min(255, g)), cb = Math.max(0, Math.min(255, b))
      const p = pal[near(cr | 0, cg | 0, cb | 0)]
      out[o] = p[0]; out[o + 1] = p[1]; out[o + 2] = p[2]; out[o + 3] = data[o + 3] < 128 ? 0 : 255
      if (err) {
        const er = (cr - p[0]) * strength, eg = (cg - p[1]) * strength, eb = (cb - p[2]) * strength
        const add = (dx: number, dy: number, f: number) => {
          const xx = x + dx, yy = y + dy
          if (xx < 0 || xx >= w || yy >= h) return
          const j = (yy * w + xx) * 3; err[j] += er * f; err[j + 1] += eg * f; err[j + 2] += eb * f
        }
        if (dither === 'floyd') { add(1, 0, 7 / 16); add(-1, 1, 3 / 16); add(0, 1, 5 / 16); add(1, 1, 1 / 16) }
        else { const f = 1 / 8; add(1, 0, f); add(2, 0, f); add(-1, 1, f); add(0, 1, f); add(1, 1, f); add(0, 2, f) }
      }
    }
  }
  return out
}

export const hexToRgb = (hex: string): RGB => { const h = hex.replace('#', ''); const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255] }

/** Classic retro palettes. */
export const RETRO_PALETTES: Record<string, { label: string; colors: string[] }> = {
  gameboy: { label: 'Game Boy (4)', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
  cga: { label: 'CGA (4)', colors: ['#000000', '#55ffff', '#ff55ff', '#ffffff'] },
  cga16: { label: 'CGA full (16)', colors: ['#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa', '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff'] },
  pico8: { label: 'PICO-8 (16)', colors: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'] },
  nes: { label: 'NES (25)', colors: ['#000000', '#fcfcfc', '#f8f8f8', '#bcbcbc', '#7c7c7c', '#a4e4fc', '#3cbcfc', '#0078f8', '#0000fc', '#b8b8f8', '#6888fc', '#0058f8', '#0000bc', '#d8b8f8', '#f8b8f8', '#f878f8', '#e45c10', '#f83800', '#ac7c00', '#00b800', '#00a800', '#58d854', '#00e8d8', '#008888', '#f8d878'] },
  c64: { label: 'Commodore 64 (16)', colors: ['#000000', '#ffffff', '#880000', '#aaffee', '#cc44cc', '#00cc55', '#0000aa', '#eeee77', '#dd8855', '#664400', '#ff7777', '#333333', '#777777', '#aaff66', '#0088ff', '#bbbbbb'] },
  mono: { label: '1-bit (2)', colors: ['#000000', '#ffffff'] },
  sepia: { label: 'Sepia (8)', colors: ['#2b1d0e', '#4a3420', '#6b4f33', '#8c6b47', '#ad885c', '#c9a678', '#e2c69b', '#f6e7c8'] },
  grey4: { label: 'Grey (4)', colors: ['#000000', '#555555', '#aaaaaa', '#ffffff'] },
}
