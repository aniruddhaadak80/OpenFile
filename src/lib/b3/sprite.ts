/* Sprite sheet layout, metadata and cutting (pure, Node-tested). */
import type { Anim, Frame } from './anim/core'
import { blank, cropRGBA } from './anim/core'

export interface SheetLayout { cols: number; rows: number; width: number; height: number; cells: { x: number; y: number }[] }

export function layoutSheet(n: number, fw: number, fh: number, cols: number, pad = 0): SheetLayout {
  cols = Math.max(1, Math.min(n, Math.round(cols)))
  const rows = Math.ceil(n / cols)
  const cells = Array.from({ length: n }, (_, i) => ({ x: (i % cols) * (fw + pad), y: Math.floor(i / cols) * (fh + pad) }))
  return { cols, rows, width: cols * fw + (cols - 1) * pad, height: rows * fh + (rows - 1) * pad, cells }
}

export function buildSheet(a: Anim, cols: number, pad = 0): { rgba: Uint8ClampedArray; layout: SheetLayout } {
  const L = layoutSheet(a.frames.length, a.width, a.height, cols, pad)
  const out = blank(L.width, L.height)
  a.frames.forEach((f, i) => {
    const { x, y } = L.cells[i]
    for (let r = 0; r < a.height; r++) out.set(f.rgba.subarray(r * a.width * 4, (r + 1) * a.width * 4), ((y + r) * L.width + x) * 4)
  })
  return { rgba: out, layout: L }
}

export function sheetCss(name: string, a: Anim, L: SheetLayout, file: string): string {
  const cls = name.replace(/[^a-z0-9_-]/gi, '-').toLowerCase() || 'sprite'
  const total = a.frames.reduce((s, f) => s + f.delay, 0)
  const lines = [`.${cls} {`, `  width: ${a.width}px;`, `  height: ${a.height}px;`, `  background: url('${file}') no-repeat;`, `  animation: ${cls}-play ${(total / 1000).toFixed(3)}s steps(1) infinite;`, '}', '', `@keyframes ${cls}-play {`]
  let t = 0
  a.frames.forEach((f, i) => { lines.push(`  ${((t / total) * 100).toFixed(3)}% { background-position: -${L.cells[i].x}px -${L.cells[i].y}px; }`); t += f.delay })
  lines.push(`  100% { background-position: -${L.cells[a.frames.length - 1].x}px -${L.cells[a.frames.length - 1].y}px; }`, '}')
  return lines.join('\n')
}

/** TexturePacker style JSON (hash), which Phaser, PixiJS and many engines read. */
export function sheetJson(name: string, a: Anim, L: SheetLayout, file: string) {
  const frames: Record<string, unknown> = {}
  a.frames.forEach((f, i) => {
    frames[`${name}_${String(i).padStart(3, '0')}`] = { frame: { x: L.cells[i].x, y: L.cells[i].y, w: a.width, h: a.height }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: a.width, h: a.height }, sourceSize: { w: a.width, h: a.height }, duration: f.delay }
  })
  return { frames, meta: { app: 'OpenFile', version: '1.0', image: file, format: 'RGBA8888', size: { w: L.width, h: L.height }, scale: '1', frameTags: [{ name, from: 0, to: a.frames.length - 1, direction: 'forward' }] } }
}

/** Cut a sheet into frames by grid. */
export function cutSheet(rgba: Uint8ClampedArray, W: number, H: number, cols: number, rows: number, o: { pad?: number; marginX?: number; marginY?: number; count?: number; delay?: number; skipEmpty?: boolean } = {}): Anim {
  const pad = o.pad ?? 0, mx = o.marginX ?? 0, my = o.marginY ?? 0
  const fw = Math.floor((W - mx * 2 - pad * (cols - 1)) / cols), fh = Math.floor((H - my * 2 - pad * (rows - 1)) / rows)
  if (fw < 1 || fh < 1) throw new Error('The grid is larger than the image.')
  const frames: Frame[] = []
  const max = o.count ?? cols * rows
  for (let r = 0; r < rows && frames.length < max; r++) for (let c = 0; c < cols && frames.length < max; c++) {
    const px = cropRGBA(rgba, W, H, mx + c * (fw + pad), my + r * (fh + pad), fw, fh)
    if (o.skipEmpty) { let any = false; for (let i = 3; i < px.length; i += 4) if (px[i] > 8) { any = true; break } if (!any) continue }
    frames.push({ rgba: px, delay: o.delay ?? 100 })
  }
  return { width: fw, height: fh, frames, loop: 0 }
}
