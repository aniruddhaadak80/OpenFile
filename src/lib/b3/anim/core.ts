/* Animated image model shared by the Batch 3 animation tools.
 * Every frame is a fully composited RGBA bitmap of the whole canvas, so tools never have to think
 * about disposal or blending. Encoders re-optimise (crop to changed area, transparency) on export.
 * Everything here is plain TypeScript with no DOM access, so it runs in Node tests too. */

export interface Frame {
  /** width * height * 4 bytes, straight (not premultiplied) alpha */
  rgba: Uint8ClampedArray
  /** display time in milliseconds */
  delay: number
}

export interface Anim {
  width: number
  height: number
  frames: Frame[]
  /** 0 = loop forever, n = play n times */
  loop: number
  /** format the animation was read from, for display only */
  source?: string
}

export const MIN_DELAY = 20

export function cloneAnim(a: Anim): Anim {
  return { ...a, frames: a.frames.map((f) => ({ rgba: f.rgba.slice(), delay: f.delay })) }
}

export const totalDuration = (a: Anim) => a.frames.reduce((s, f) => s + f.delay, 0)

export function blank(w: number, h: number, color?: [number, number, number, number]) {
  const px = new Uint8ClampedArray(w * h * 4)
  if (color && color[3]) for (let i = 0; i < px.length; i += 4) { px[i] = color[0]; px[i + 1] = color[1]; px[i + 2] = color[2]; px[i + 3] = color[3] }
  return px
}

export function hexToRgba(hex: string, alpha = 255): [number, number, number, number] {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6) || '0', 16)
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : alpha
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a]
}

export function hasTransparency(a: Anim, threshold = 250): boolean {
  for (const f of a.frames) { const p = f.rgba; for (let i = 3; i < p.length; i += 4) if (p[i] < threshold) return true }
  return false
}

/* ------------------------------------------------------------------ resampling */

interface Contrib { start: number; weights: Float32Array }

function contributions(src: number, dst: number): Contrib[] {
  const scale = dst / src
  const out: Contrib[] = []
  if (scale < 1) {
    // area average: each destination pixel covers 1/scale source pixels
    const span = 1 / scale
    for (let d = 0; d < dst; d++) {
      const a = d * span, b = a + span
      const s0 = Math.floor(a), s1 = Math.min(src, Math.ceil(b))
      const w = new Float32Array(s1 - s0)
      let sum = 0
      for (let s = s0; s < s1; s++) { const cov = Math.min(b, s + 1) - Math.max(a, s); w[s - s0] = cov; sum += cov }
      for (let k = 0; k < w.length; k++) w[k] /= sum || 1
      out.push({ start: s0, weights: w })
    }
  } else {
    // bilinear
    for (let d = 0; d < dst; d++) {
      const x = Math.min(src - 1, Math.max(0, (d + 0.5) / scale - 0.5))
      const s0 = Math.floor(x), t = x - s0
      if (s0 + 1 < src && t > 0) out.push({ start: s0, weights: Float32Array.from([1 - t, t]) })
      else out.push({ start: s0, weights: Float32Array.from([1]) })
    }
  }
  return out
}

/** High quality resize of one RGBA bitmap (premultiplied internally to avoid dark fringes). */
export function resizeRGBA(src: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number, smooth = true): Uint8ClampedArray {
  dw = Math.max(1, Math.round(dw)); dh = Math.max(1, Math.round(dh))
  if (dw === sw && dh === sh) return src.slice()
  const out = new Uint8ClampedArray(dw * dh * 4)
  if (!smooth) {
    for (let y = 0; y < dh; y++) {
      const sy = Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / dh))
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / dw))
        const si = (sy * sw + sx) * 4, di = (y * dw + x) * 4
        out[di] = src[si]; out[di + 1] = src[si + 1]; out[di + 2] = src[si + 2]; out[di + 3] = src[si + 3]
      }
    }
    return out
  }
  const cx = contributions(sw, dw), cy = contributions(sh, dh)
  // horizontal pass into premultiplied float buffer
  const tmp = new Float32Array(dw * sh * 4)
  for (let y = 0; y < sh; y++) {
    const row = y * sw
    for (let x = 0; x < dw; x++) {
      const c = cx[x]; let r = 0, g = 0, b = 0, a = 0
      for (let k = 0; k < c.weights.length; k++) {
        const si = (row + c.start + k) * 4, w = c.weights[k], al = src[si + 3] * w
        r += src[si] * al; g += src[si + 1] * al; b += src[si + 2] * al; a += al
      }
      const ti = (y * dw + x) * 4
      tmp[ti] = r; tmp[ti + 1] = g; tmp[ti + 2] = b; tmp[ti + 3] = a
    }
  }
  for (let x = 0; x < dw; x++) {
    for (let y = 0; y < dh; y++) {
      const c = cy[y]; let r = 0, g = 0, b = 0, a = 0
      for (let k = 0; k < c.weights.length; k++) {
        const ti = ((c.start + k) * dw + x) * 4, w = c.weights[k]
        r += tmp[ti] * w; g += tmp[ti + 1] * w; b += tmp[ti + 2] * w; a += tmp[ti + 3] * w
      }
      const di = (y * dw + x) * 4
      if (a > 0) { out[di] = r / a; out[di + 1] = g / a; out[di + 2] = b / a }
      out[di + 3] = a
    }
  }
  return out
}

export function resizeAnim(a: Anim, w: number, h: number, smooth = true): Anim {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h))
  return { ...a, width: w, height: h, frames: a.frames.map((f) => ({ delay: f.delay, rgba: resizeRGBA(f.rgba, a.width, a.height, w, h, smooth) })) }
}

/* ------------------------------------------------------------------ geometry */

export function cropRGBA(src: Uint8ClampedArray, sw: number, sh: number, x: number, y: number, w: number, h: number, fill: [number, number, number, number] = [0, 0, 0, 0]) {
  x = Math.round(x); y = Math.round(y); w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h))
  const out = blank(w, h, fill)
  for (let yy = 0; yy < h; yy++) {
    const sy = y + yy; if (sy < 0 || sy >= sh) continue
    const x0 = Math.max(0, -x), x1 = Math.min(w, sw - x)
    if (x1 <= x0) continue
    out.set(src.subarray((sy * sw + x + x0) * 4, (sy * sw + x + x1) * 4), (yy * w + x0) * 4)
  }
  return out
}

export function cropAnim(a: Anim, x: number, y: number, w: number, h: number, fill?: [number, number, number, number]): Anim {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h))
  return { ...a, width: w, height: h, frames: a.frames.map((f) => ({ delay: f.delay, rgba: cropRGBA(f.rgba, a.width, a.height, x, y, w, h, fill) })) }
}

/** Rotate by a multiple of 90 degrees (clockwise). */
export function rotateRGBA(src: Uint8ClampedArray, w: number, h: number, deg: 0 | 90 | 180 | 270) {
  if (deg === 0) return { rgba: src.slice(), width: w, height: h }
  const nw = deg === 180 ? w : h, nh = deg === 180 ? h : w
  const out = new Uint8ClampedArray(src.length)
  const s32 = new Uint32Array(src.buffer, src.byteOffset, w * h), o32 = new Uint32Array(out.buffer)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let nx: number, ny: number
    if (deg === 90) { nx = h - 1 - y; ny = x } else if (deg === 180) { nx = w - 1 - x; ny = h - 1 - y } else { nx = y; ny = w - 1 - x }
    o32[ny * nw + nx] = s32[y * w + x]
  }
  return { rgba: out, width: nw, height: nh }
}

export function flipRGBA(src: Uint8ClampedArray, w: number, h: number, horizontal: boolean) {
  const out = new Uint8ClampedArray(src.length)
  const s32 = new Uint32Array(src.buffer, src.byteOffset, w * h), o32 = new Uint32Array(out.buffer)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = horizontal ? w - 1 - x : x, ny = horizontal ? y : h - 1 - y
    o32[ny * w + nx] = s32[y * w + x]
  }
  return out
}

export function rotateAnim(a: Anim, deg: 0 | 90 | 180 | 270): Anim {
  if (!deg) return a
  let w = a.width, h = a.height
  const frames = a.frames.map((f) => { const r = rotateRGBA(f.rgba, a.width, a.height, deg); w = r.width; h = r.height; return { delay: f.delay, rgba: r.rgba } })
  return { ...a, width: w, height: h, frames }
}

export function flipAnim(a: Anim, horizontal: boolean): Anim {
  return { ...a, frames: a.frames.map((f) => ({ delay: f.delay, rgba: flipRGBA(f.rgba, a.width, a.height, horizontal) })) }
}

/** Place the animation on a larger or smaller canvas (letterbox / aspect ratio change). */
export function fitAnim(a: Anim, w: number, h: number, mode: 'contain' | 'cover' | 'stretch', fill: [number, number, number, number] = [0, 0, 0, 0]): Anim {
  if (mode === 'stretch') return resizeAnim(a, w, h)
  const s = mode === 'contain' ? Math.min(w / a.width, h / a.height) : Math.max(w / a.width, h / a.height)
  const rw = Math.max(1, Math.round(a.width * s)), rh = Math.max(1, Math.round(a.height * s))
  const r = resizeAnim(a, rw, rh)
  return cropAnim(r, Math.round((rw - w) / 2), Math.round((rh - h) / 2), w, h, fill)
}

/* ------------------------------------------------------------------ timing */

/** Multiply playback speed. Delays below the GIF floor are merged by dropping frames. */
export function changeSpeed(a: Anim, speed: number, minDelay = MIN_DELAY): Anim {
  const frames: Frame[] = []
  let carry = 0
  for (const f of a.frames) {
    const d = f.delay / speed + carry
    if (d < minDelay && frames.length) { carry = d; continue }
    frames.push({ rgba: f.rgba, delay: Math.max(minDelay, Math.round(d)) }); carry = 0
  }
  if (carry && frames.length) frames[frames.length - 1].delay += Math.round(carry)
  return { ...a, frames: frames.length ? frames : [a.frames[0]] }
}

export function setAllDelays(a: Anim, delay: number): Anim {
  return { ...a, frames: a.frames.map((f) => ({ ...f, delay: Math.max(MIN_DELAY, Math.round(delay)) })) }
}

export const reverseAnim = (a: Anim): Anim => ({ ...a, frames: [...a.frames].reverse() })

export function boomerang(a: Anim): Anim {
  if (a.frames.length < 3) return { ...a, frames: [...a.frames, ...[...a.frames].reverse()] }
  return { ...a, frames: [...a.frames, ...a.frames.slice(1, -1).reverse()] }
}

/** Keep frames from index `start` to `end` inclusive. */
export const cutAnim = (a: Anim, start: number, end: number): Anim => ({ ...a, frames: a.frames.slice(Math.max(0, start), Math.max(start, end) + 1) })

/** Keep every n-th frame, folding the dropped frames' time into the kept ones. */
export function dropFrames(a: Anim, every: number): Anim {
  if (every <= 1) return a
  const frames: Frame[] = []
  a.frames.forEach((f, i) => { if (i % every === 0) frames.push({ rgba: f.rgba, delay: f.delay }); else frames[frames.length - 1].delay += f.delay })
  return { ...a, frames }
}

/** Merge consecutive frames that look the same (max channel difference <= tolerance). */
export function dedupeFrames(a: Anim, tolerance = 0): Anim {
  const frames: Frame[] = []
  for (const f of a.frames) {
    const prev = frames[frames.length - 1]
    if (prev && sameRGBA(prev.rgba, f.rgba, tolerance)) prev.delay += f.delay
    else frames.push({ rgba: f.rgba, delay: f.delay })
  }
  return { ...a, frames }
}

export function sameRGBA(a: Uint8ClampedArray, b: Uint8ClampedArray, tol = 0) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] < 8 && b[i + 3] < 8) continue
    if (Math.abs(a[i] - b[i]) > tol || Math.abs(a[i + 1] - b[i + 1]) > tol || Math.abs(a[i + 2] - b[i + 2]) > tol || Math.abs(a[i + 3] - b[i + 3]) > tol) return false
  }
  return true
}

/** Hold the last frame (or a given frame) for extra milliseconds. */
export function holdFrame(a: Anim, index: number, extra: number): Anim {
  return { ...a, frames: a.frames.map((f, i) => (i === index ? { ...f, delay: f.delay + extra } : f)) }
}

/** Composite RGBA `top` onto `base` (in place) at offset, with opacity. */
export function blendOnto(base: Uint8ClampedArray, bw: number, bh: number, top: Uint8ClampedArray, tw: number, th: number, ox: number, oy: number, opacity = 1) {
  for (let y = 0; y < th; y++) {
    const by = y + oy; if (by < 0 || by >= bh) continue
    for (let x = 0; x < tw; x++) {
      const bx = x + ox; if (bx < 0 || bx >= bw) continue
      const ti = (y * tw + x) * 4, bi = (by * bw + bx) * 4
      const ta = (top[ti + 3] / 255) * opacity; if (ta <= 0) continue
      const ba = base[bi + 3] / 255
      const oa = ta + ba * (1 - ta)
      for (let c = 0; c < 3; c++) base[bi + c] = (top[ti + c] * ta + base[bi + c] * ba * (1 - ta)) / (oa || 1)
      base[bi + 3] = oa * 255
    }
  }
}

/** Flatten transparency onto a solid colour. */
export function flattenAnim(a: Anim, color: [number, number, number, number]): Anim {
  return {
    ...a, frames: a.frames.map((f) => {
      const out = blank(a.width, a.height, [color[0], color[1], color[2], 255])
      blendOnto(out, a.width, a.height, f.rgba, a.width, a.height, 0, 0)
      return { delay: f.delay, rgba: out }
    }),
  }
}

/** Convert a constant-rate frame list from mixed delays: the timeline position of each frame. */
export function frameStarts(a: Anim): number[] {
  const out: number[] = []; let t = 0
  for (const f of a.frames) { out.push(t); t += f.delay }
  return out
}

/** Index of the frame shown at time t (ms), looping. */
export function frameAt(a: Anim, t: number): number {
  const total = totalDuration(a) || 1
  let x = ((t % total) + total) % total
  for (let i = 0; i < a.frames.length; i++) { if (x < a.frames[i].delay) return i; x -= a.frames[i].delay }
  return a.frames.length - 1
}

export function estimateRawBytes(a: Anim) { return a.width * a.height * 4 * a.frames.length }
