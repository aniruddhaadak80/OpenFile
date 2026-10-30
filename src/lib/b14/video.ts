/* Video helpers for round 14: contact sheet layout, black bar detection, effect recipes, countdown timing and beeps.
 * Pure TypeScript, unit tested in Node (scripts/tests/b14/video.test.mjs). */

/* ---------------- contact sheet ---------------- */
/** Evenly spread sample times, skipping the very start and end (often black). */
export function sampleTimes(duration: number, count: number, skip = 0.03): number[] {
  if (!(duration > 0) || count < 1) return []
  const a = duration * skip, b = duration * (1 - skip)
  if (count === 1) return [duration / 2]
  return Array.from({ length: count }, (_, i) => +(a + ((b - a) * (i + 0.5)) / count).toFixed(3))
}

export interface SheetLayout { width: number; height: number; cellW: number; cellH: number; header: number; gap: number; cols: number; rows: number; cells: { x: number; y: number }[] }
/** Grid geometry for a contact sheet of `count` frames with aspect `ar` (w/h). */
export function sheetLayout(count: number, cols: number, ar: number, width = 1600, gap = 8, header = 96): SheetLayout {
  const c = Math.max(1, Math.min(cols, count)), rows = Math.ceil(count / c)
  const cellW = Math.floor((width - gap * (c + 1)) / c), cellH = Math.round(cellW / (ar || 16 / 9))
  const cells = Array.from({ length: count }, (_, i) => ({ x: gap + (i % c) * (cellW + gap), y: header + gap + Math.floor(i / c) * (cellH + gap) }))
  return { width, height: header + gap + rows * (cellH + gap), cellW, cellH, header, gap, cols: c, rows, cells }
}

export const clockText = (s: number) => {
  const t = Math.max(0, Math.floor(s)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(x).padStart(2, '0')
}

/* ---------------- black bars ---------------- */
export interface Crop { x: number; y: number; w: number; h: number }
/** Find letterbox / pillarbox bars in one greyscale frame (values 0..255). A row or column is a bar when almost all its pixels are darker than `limit`. */
export function detectBars(luma: Uint8Array | Uint8ClampedArray | number[], w: number, h: number, limit = 24, share = 0.98): Crop {
  const dark = (i: number) => luma[i] <= limit
  const rowDark = (y: number) => { let n = 0; for (let x = 0; x < w; x++) if (dark(y * w + x)) n++; return n / w >= share }
  const colDark = (x: number, y0: number, y1: number) => { let n = 0; for (let y = y0; y < y1; y++) if (dark(y * w + x)) n++; return n / Math.max(1, y1 - y0) >= share }
  let top = 0; while (top < h - 1 && rowDark(top)) top++
  let bot = h - 1; while (bot > top && rowDark(bot)) bot--
  let left = 0; while (left < w - 1 && colDark(left, top, bot + 1)) left++
  let right = w - 1; while (right > left && colDark(right, top, bot + 1)) right--
  if (bot <= top || right <= left) return { x: 0, y: 0, w, h } // all dark: a black frame, ignore
  return { x: left, y: top, w: right - left + 1, h: bot - top + 1 }
}

/** Combine crops from many frames: the widest picture area seen (so a bright scene in one frame is never cut), snapped to even numbers. */
export function mergeCrops(crops: Crop[], w: number, h: number, minShare = 0.25): Crop {
  const useful = crops.filter((c) => c.w * c.h >= w * h * minShare)
  if (!useful.length) return { x: 0, y: 0, w, h }
  let x0 = Math.min(...useful.map((c) => c.x)), y0 = Math.min(...useful.map((c) => c.y))
  let x1 = Math.max(...useful.map((c) => c.x + c.w)), y1 = Math.max(...useful.map((c) => c.y + c.h))
  x0 = Math.max(0, x0 - (x0 % 2)); y0 = Math.max(0, y0 - (y0 % 2))
  let cw = x1 - x0, ch = y1 - y0
  cw -= cw % 2; ch -= ch % 2
  if (x0 + cw > w) cw = (w - x0) - ((w - x0) % 2)
  if (y0 + ch > h) ch = (h - y0) - ((h - y0) % 2)
  return { x: x0, y: y0, w: cw, h: ch }
}

/** Map a crop found on display sized frames (browsers stretch non square pixel video to its display aspect) to the coded pixels ffmpeg crops.
 * `rotation` is the display matrix rotation: ffmpeg rotates before filters, so 90 and 270 swap the coded sides. */
export function cropToCoded(c: Crop, shownW: number, shownH: number, codedW?: number, codedH?: number, rotation = 0): Crop {
  if (!codedW || !codedH || !shownW || !shownH) return c
  let cw = codedW, ch = codedH
  if (Math.abs(rotation) % 180 === 90) { cw = codedH; ch = codedW }
  if (cw === shownW && ch === shownH) return c
  const sx = cw / shownW, sy = ch / shownH
  let x = Math.round(c.x * sx), y = Math.round(c.y * sy), w = Math.round(c.w * sx), h = Math.round(c.h * sy)
  x -= x % 2; y -= y % 2
  w = Math.min(w, cw - x); h = Math.min(h, ch - y)
  w -= w % 2; h -= h % 2
  return { x, y, w: Math.max(2, w), h: Math.max(2, h) }
}

/** Parse ffmpeg cropdetect log lines and pick the most common crop. */
export function parseCropdetect(log: string): Crop | null {
  const counts = new Map<string, number>()
  for (const m of log.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)) counts.set(m.slice(1).join(':'), (counts.get(m.slice(1).join(':')) ?? 0) + 1)
  if (!counts.size) return null
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  const [w, h, x, y] = best.split(':').map(Number)
  return { x, y, w, h }
}

/* ---------------- effects ---------------- */
export type EffectId = 'glitch' | 'vhs' | 'oldfilm' | 'mirror' | 'kaleido' | 'pixelate' | 'sketch' | 'negative' | 'posterize' | 'ghost' | 'blurmotion' | 'bw' | 'thermal' | 'neon' | 'zoompulse' | 'shake'
export interface Effect { id: EffectId; name: string; desc: string; css?: string }
export const EFFECTS: Effect[] = [
  { id: 'glitch', name: 'Glitch', desc: 'Split colour channels and add digital noise', css: 'saturate(1.6) contrast(1.2)' },
  { id: 'vhs', name: 'VHS tape', desc: 'Soft picture, colour bleed, noise and scan lines', css: 'blur(0.6px) saturate(1.3) contrast(1.1)' },
  { id: 'oldfilm', name: 'Old film', desc: 'Sepia tone, grain, flicker and a dark edge', css: 'sepia(0.85) contrast(1.1)' },
  { id: 'bw', name: 'Black and white', desc: 'Rich black and white with a little contrast', css: 'grayscale(1) contrast(1.15)' },
  { id: 'mirror', name: 'Mirror', desc: 'Left half mirrored onto the right' },
  { id: 'kaleido', name: 'Kaleidoscope', desc: 'Four way mirror from the top left corner' },
  { id: 'pixelate', name: 'Pixelate', desc: 'Big square pixels, 8 bit style' },
  { id: 'sketch', name: 'Sketch', desc: 'Pencil outlines on white paper', css: 'grayscale(1) invert(1) contrast(2)' },
  { id: 'negative', name: 'Negative', desc: 'Inverted colours like a film negative', css: 'invert(1)' },
  { id: 'posterize', name: 'Posterize', desc: 'Flat poster colours with few shades', css: 'contrast(1.4) saturate(1.5)' },
  { id: 'thermal', name: 'Heat map', desc: 'Thermal camera look from dark to hot', css: 'grayscale(1) contrast(1.3)' },
  { id: 'neon', name: 'Neon edges', desc: 'Glowing coloured outlines on black', css: 'contrast(1.6) saturate(2)' },
  { id: 'ghost', name: 'Ghost trails', desc: 'Moving things leave bright trails' },
  { id: 'blurmotion', name: 'Motion blur', desc: 'Long exposure blur that smooths motion' },
  { id: 'zoompulse', name: 'Zoom pulse', desc: 'Picture gently zooms in and out on a beat' },
  { id: 'shake', name: 'Camera shake', desc: 'Handheld shake for action shots' },
]

/** ffmpeg -vf chain for one effect. `k` is strength 0..1, `w`/`h` the input size (even), `bpm` for pulses. */
export function effectFilter(id: EffectId, k: number, w: number, h: number, bpm = 100): string {
  const s = Math.max(0, Math.min(1, k))
  const even = 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
  switch (id) {
    case 'glitch': { const d = Math.round(4 + s * 18); return `rgbashift=rh=-${d}:bh=${d}:gv=${Math.round(d / 3)},noise=alls=${Math.round(8 + s * 30)}:allf=t,eq=saturation=1.3` }
    case 'vhs': return `scale=iw/2:ih/2,scale=${w}:${h},rgbashift=rh=${Math.round(2 + s * 6)}:bh=-${Math.round(2 + s * 6)},eq=saturation=${(1.2 + s * 0.4).toFixed(2)}:contrast=1.1,noise=alls=${Math.round(10 + s * 20)}:allf=t,drawgrid=w=0:h=4:t=1:c=black@${(0.15 + s * 0.25).toFixed(2)}`
    case 'oldfilm': return `colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,noise=alls=${Math.round(12 + s * 30)}:allf=t,eq=brightness='0.03*sin(t*${(8 + s * 10).toFixed(0)})':eval=frame,vignette=angle=${(0.4 + s * 0.4).toFixed(2)}`
    case 'bw': return `hue=s=0,eq=contrast=${(1.05 + s * 0.35).toFixed(2)}`
    case 'mirror': return `crop=iw/2:ih:0:0,split[a][b];[b]hflip[c];[a][c]hstack,${even}`
    case 'kaleido': return `crop=iw/2:ih/2:0:0,split[a][b];[b]hflip[c];[a][c]hstack,split[d][e];[e]vflip[f];[d][f]vstack,${even}`
    case 'pixelate': { const f = Math.round(6 + s * 34); return `scale=trunc(iw/${f}):trunc(ih/${f}),scale=${w}:${h}:flags=neighbor` }
    case 'sketch': return `edgedetect=low=0.08:high=${(0.3 - s * 0.2).toFixed(2)},negate,hue=s=0`
    case 'negative': return 'negate'
    case 'posterize': { const n = Math.round(6 - s * 4); const step = (255 / n).toFixed(3); return `lutrgb=r='floor(val/${step})*${step}':g='floor(val/${step})*${step}':b='floor(val/${step})*${step}',eq=saturation=1.4` }
    case 'thermal': return 'hue=s=0,pseudocolor=p=inferno'
    case 'neon': return `edgedetect=mode=colormix:high=${(0.3 - s * 0.2).toFixed(2)},eq=saturation=2.2:contrast=1.4`
    case 'ghost': return `lagfun=decay=${(0.9 + s * 0.08).toFixed(3)}`
    case 'blurmotion': return `tmix=frames=${Math.round(3 + s * 9)}`
    case 'zoompulse': { const z = (0.04 + s * 0.12).toFixed(3); const f = (bpm / 60).toFixed(3); return `scale=w='iw*(1+${z}*abs(sin(PI*t*${f})))':h=-2:eval=frame,crop=${w}:${h}` }
    case 'shake': { const a = Math.round(6 + s * 24); return `scale=iw*1.1:-2,crop=${w}:${h}:'(iw-${w})/2+${a}*sin(t*13)':'(ih-${h})/2+${a}*cos(t*17)'` }
  }
}

/* ---------------- countdown ---------------- */
/** Label shown at time t (seconds since start) of an n second countdown, with an optional end title. */
export function countdownLabel(t: number, n: number, end = ''): string {
  if (t >= n) return end || '0'
  return String(Math.max(1, Math.ceil(n - t - 1e-9)))
}

/** 16-bit mono WAV with a short beep at each second (higher pitch on the last one). */
export function beepTrack(seconds: number, total: number, rate = 44100, freq = 880, endFreq = 1320, endTone = true): Uint8Array {
  const len = Math.ceil(total * rate), data = new Int16Array(len)
  const beep = (at: number, f: number, dur: number) => {
    const s0 = Math.floor(at * rate), n = Math.floor(dur * rate)
    for (let i = 0; i < n && s0 + i < len; i++) { const env = Math.min(1, i / 200, (n - i) / 400); data[s0 + i] = Math.round(Math.sin((2 * Math.PI * f * i) / rate) * env * 0.5 * 32767) }
  }
  for (let i = 0; i < seconds; i++) beep(i, freq, 0.12)
  if (endTone && seconds < total) beep(seconds, endFreq, 0.6)
  const out = new Uint8Array(44 + len * 2), v = new DataView(out.buffer)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, len * 2, true)
  out.set(new Uint8Array(data.buffer), 44)
  return out
}
