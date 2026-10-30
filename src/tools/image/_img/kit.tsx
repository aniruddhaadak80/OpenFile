/* Shared helpers for the OpenFile image tools (owned by the image tools only). */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Plus, X, ImageIcon, Package, Check, Loader2, AlertCircle } from 'lucide-react'
import { Button, Dropzone, cn, useOtherStartOver } from '@/components/ui'
import { downloadBlob, formatBytes, zipFiles, baseName } from '@/lib/files'
import { toast } from '@/components/toast'

/* ------------------------------------------------------------------ */
/* basic image IO                                                      */
/* ------------------------------------------------------------------ */

export const uid = () => Math.random().toString(36).slice(2, 10)

/** Decode a File/Blob/URL into an <img>, revoking the temporary object URL. */
export function decode(src: Blob | string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    const isBlob = typeof src !== 'string'
    const url = isBlob ? URL.createObjectURL(src as Blob) : (src as string)
    if (!isBlob && !url.startsWith('data:') && !url.startsWith('blob:')) img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => { res(img); if (isBlob) setTimeout(() => URL.revokeObjectURL(url), 1000) }
    img.onerror = () => { if (isBlob) URL.revokeObjectURL(url); rej(new Error('Could not read this image, the format may not be supported by your browser.')) }
    img.src = url
  })
}

export type Drawable = HTMLImageElement | HTMLCanvasElement | ImageBitmap | HTMLVideoElement
export function dims(s: Drawable): { w: number; h: number } {
  if (s instanceof HTMLImageElement) return { w: s.naturalWidth || s.width, h: s.naturalHeight || s.height }
  if (s instanceof HTMLVideoElement) return { w: s.videoWidth, h: s.videoHeight }
  return { w: s.width, h: s.height }
}

export function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h))
  const ctx = c.getContext('2d', { willReadFrequently: false })!
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  return { canvas: c, ctx }
}

export function toCanvas(src: Drawable) {
  const { w, h } = dims(src)
  const { canvas: c, ctx } = canvas(w, h)
  ctx.drawImage(src, 0, 0)
  return c
}

/** High-quality resize: halves repeatedly before the final draw (avoids aliasing on big downscales). */
export function hqResize(src: Drawable, tw: number, th: number): HTMLCanvasElement {
  tw = Math.max(1, Math.round(tw)); th = Math.max(1, Math.round(th))
  let { w, h } = dims(src)
  let cur: Drawable = src
  while (w / 2 >= tw && h / 2 >= th && w > 2 && h > 2) {
    w = Math.floor(w / 2); h = Math.floor(h / 2)
    const { canvas: c, ctx } = canvas(w, h)
    ctx.drawImage(cur, 0, 0, w, h)
    cur = c
  }
  const { canvas: out, ctx } = canvas(tw, th)
  ctx.drawImage(cur, 0, 0, tw, th)
  return out
}

/* ------------------------------------------------------------------ */
/* pixel helpers                                                       */
/* ------------------------------------------------------------------ */

/** Separable 3-pass box blur ≈ gaussian with sigma≈radius. Mutates & returns `id`. */
export function blurImageData(id: ImageData, radius: number): ImageData {
  if (radius < 0.5) return id
  const { width: w, height: h, data } = id
  const tmp = new Uint8ClampedArray(data.length)
  const r = Math.max(1, Math.round(radius * 0.85))
  for (let pass = 0; pass < 3; pass++) { boxH(data, tmp, w, h, r); boxV(tmp, data, w, h, r) }
  return id
}
function boxH(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number) {
  const inv = 1 / (r + r + 1)
  for (let y = 0; y < h; y++) {
    const row = y * w * 4
    for (let c = 0; c < 4; c++) {
      let sum = 0
      for (let k = -r; k <= r; k++) sum += src[row + Math.min(w - 1, Math.max(0, k)) * 4 + c]
      for (let x = 0; x < w; x++) {
        dst[row + x * 4 + c] = sum * inv
        sum += src[row + Math.min(w - 1, x + r + 1) * 4 + c] - src[row + Math.max(0, x - r) * 4 + c]
      }
    }
  }
}
function boxV(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number) {
  const inv = 1 / (r + r + 1), stride = w * 4
  for (let x = 0; x < w; x++) {
    const col = x * 4
    for (let c = 0; c < 4; c++) {
      let sum = 0
      for (let k = -r; k <= r; k++) sum += src[Math.min(h - 1, Math.max(0, k)) * stride + col + c]
      for (let y = 0; y < h; y++) {
        dst[y * stride + col + c] = sum * inv
        sum += src[Math.min(h - 1, y + r + 1) * stride + col + c] - src[Math.max(0, y - r) * stride + col + c]
      }
    }
  }
}

/** Blur a whole canvas (returns a new canvas). Uses ctx.filter when available, else JS box blur. */
export function blurCanvas(src: HTMLCanvasElement | HTMLImageElement, radius: number): HTMLCanvasElement {
  const { w, h } = dims(src)
  const { canvas: out, ctx } = canvas(w, h)
  if (radius <= 0) { ctx.drawImage(src, 0, 0); return out }
  if (supportsCtxFilter()) {
    // pad edges so the blur doesn't fade to transparent at borders
    const pad = Math.ceil(radius * 2)
    const { canvas: big, ctx: bctx } = canvas(w + pad * 2, h + pad * 2)
    bctx.drawImage(src, 0, 0, w, h, pad, pad, w, h)
    bctx.drawImage(src, 0, 0, w, 1, pad, 0, w, pad); bctx.drawImage(src, 0, h - 1, w, 1, pad, h + pad, w, pad)
    bctx.drawImage(big, pad, pad, 1, h, 0, pad, pad, h); bctx.drawImage(big, pad + w - 1, pad, 1, h, w + pad, pad, pad, h)
    bctx.drawImage(big, pad, 0, 1, pad, 0, 0, pad, pad); bctx.drawImage(big, pad + w - 1, 0, 1, pad, w + pad, 0, pad, pad)
    bctx.drawImage(big, pad, h + pad, 1, pad, 0, h + pad, pad, pad); bctx.drawImage(big, pad + w - 1, h + pad, 1, pad, w + pad, h + pad, pad, pad)
    ctx.filter = `blur(${radius}px)`
    ctx.drawImage(big, -pad, -pad)
    ctx.filter = 'none'
    return out
  }
  ctx.drawImage(src, 0, 0)
  const id = ctx.getImageData(0, 0, w, h)
  ctx.putImageData(blurImageData(id, radius), 0, 0)
  return out
}

let _ctxFilter: boolean | null = null
export function supportsCtxFilter() {
  if (_ctxFilter !== null) return _ctxFilter
  try {
    const { canvas: c, ctx } = canvas(4, 4)
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 4, 4)
    ctx.filter = 'invert(1)'
    ctx.drawImage(c, 0, 0)
    _ctxFilter = ctx.getImageData(0, 0, 1, 1).data[0] > 200
  } catch { _ctxFilter = false }
  return _ctxFilter
}

/** Unsharp mask in place. amount 0..3, radius px, threshold 0..255 */
export function unsharp(c: HTMLCanvasElement, amount = 0.8, radius = 1, threshold = 0) {
  const ctx = c.getContext('2d')!
  const id = ctx.getImageData(0, 0, c.width, c.height)
  const blurred = new ImageData(new Uint8ClampedArray(id.data), c.width, c.height)
  blurImageData(blurred, radius)
  const d = id.data, b = blurred.data
  for (let i = 0; i < d.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const diff = d[i + k] - b[i + k]
      if (Math.abs(diff) >= threshold) d[i + k] = d[i + k] + diff * amount
    }
  }
  ctx.putImageData(id, 0, 0)
  return c
}

/** Pixelate a region of ctx in place. */
export function pixelateRegion(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, block: number) {
  x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y))
  w = Math.min(ctx.canvas.width - x, Math.ceil(w)); h = Math.min(ctx.canvas.height - y, Math.ceil(h))
  if (w < 1 || h < 1) return
  const bs = Math.max(2, Math.round(block))
  const sw = Math.max(1, Math.ceil(w / bs)), sh = Math.max(1, Math.ceil(h / bs))
  const { canvas: small, ctx: sctx } = canvas(sw, sh)
  sctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, sw, sh)
  const prev = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(small, 0, 0, sw, sh, x, y, sw * bs, sh * bs)
  ctx.imageSmoothingEnabled = prev
}

export function hasAlpha(c: HTMLCanvasElement) {
  const ctx = c.getContext('2d')!
  const step = Math.max(1, Math.floor((c.width * c.height) / 250000))
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  for (let i = 3; i < d.length; i += 4 * step) if (d[i] < 255) return true
  return false
}

/* ------------------------------------------------------------------ */
/* encoders                                                            */
/* ------------------------------------------------------------------ */

export type Fmt = 'png' | 'jpg' | 'webp' | 'avif' | 'bmp' | 'gif' | 'ico'
export const FMT_MIME: Record<Fmt, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', gif: 'image/gif', ico: 'image/x-icon' }
export const FMT_EXT: Record<Fmt, string> = { png: 'png', jpg: 'jpg', webp: 'webp', avif: 'avif', bmp: 'bmp', gif: 'gif', ico: 'ico' }
export const LOSSY: Fmt[] = ['jpg', 'webp', 'avif']

const _support: Record<string, boolean> = {}
/** Whether the browser's canvas can encode this mime (toDataURL falls back to PNG when not). */
export function canEncode(mime: string) {
  if (mime in _support) return _support[mime]
  try {
    const { canvas: c } = canvas(2, 2)
    _support[mime] = c.toDataURL(mime).startsWith(`data:${mime}`)
  } catch { _support[mime] = false }
  return _support[mime]
}
export const fmtSupported = (f: Fmt) => (f === 'bmp' || f === 'gif' || f === 'ico' || f === 'png' ? true : canEncode(FMT_MIME[f]))

export function fmtFromMime(type: string, name = ''): Fmt {
  const t = type.toLowerCase(), n = name.toLowerCase()
  if (t.includes('jpeg') || /\.jpe?g$/.test(n)) return 'jpg'
  if (t.includes('webp') || n.endsWith('.webp')) return 'webp'
  if (t.includes('avif') || n.endsWith('.avif')) return 'avif'
  if (t.includes('gif') || n.endsWith('.gif')) return 'gif'
  if (t.includes('bmp') || n.endsWith('.bmp')) return 'bmp'
  if (t.includes('icon') || n.endsWith('.ico')) return 'ico'
  return 'png'
}

function blobFromCanvas(c: HTMLCanvasElement, mime: string, q?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error(`Your browser cannot export ${mime}`))), mime, q))
}

export function flatten(c: HTMLCanvasElement, bg: string) {
  const { canvas: out, ctx } = canvas(c.width, c.height)
  ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(c, 0, 0)
  return out
}

export function encodeBMP(c: HTMLCanvasElement, bg = '#ffffff'): Blob {
  const flat = flatten(c, bg)
  const w = flat.width, h = flat.height
  const d = flat.getContext('2d')!.getImageData(0, 0, w, h).data
  const rowSize = Math.ceil((w * 3) / 4) * 4
  const size = 54 + rowSize * h
  const buf = new ArrayBuffer(size), v = new DataView(buf), u8 = new Uint8Array(buf)
  v.setUint8(0, 0x42); v.setUint8(1, 0x4d); v.setUint32(2, size, true); v.setUint32(10, 54, true)
  v.setUint32(14, 40, true); v.setInt32(18, w, true); v.setInt32(22, h, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true)
  v.setUint32(30, 0, true); v.setUint32(34, rowSize * h, true); v.setInt32(38, 2835, true); v.setInt32(42, 2835, true)
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 4, dst = 54 + y * rowSize
    for (let x = 0; x < w; x++) { const s = src + x * 4, o = dst + x * 3; u8[o] = d[s + 2]; u8[o + 1] = d[s + 1]; u8[o + 2] = d[s] }
  }
  return new Blob([buf], { type: 'image/bmp' })
}

/** Builds an ICO containing one PNG per size (PNG-in-ICO, supported by all modern OSes/browsers). */
export async function encodeICO(src: HTMLCanvasElement, sizes = [16, 32, 48, 64, 128, 256]): Promise<Blob> {
  const pngs: Uint8Array[] = []
  for (const s of sizes) {
    const { w, h } = dims(src)
    const scale = Math.min(s / w, s / h)
    const scaled = hqResize(src, w * scale, h * scale)
    const { canvas: sq, ctx } = canvas(s, s)
    ctx.drawImage(scaled, (s - scaled.width) / 2, (s - scaled.height) / 2)
    pngs.push(new Uint8Array(await (await blobFromCanvas(sq, 'image/png')).arrayBuffer()))
  }
  return new Blob([buildIco(sizes, pngs) as BlobPart], { type: 'image/x-icon' })
}
export function buildIco(sizes: number[], pngs: Uint8Array[]): Uint8Array {
  const n = sizes.length
  const total = 6 + 16 * n + pngs.reduce((a, p) => a + p.length, 0)
  const out = new Uint8Array(total), v = new DataView(out.buffer)
  v.setUint16(0, 0, true); v.setUint16(2, 1, true); v.setUint16(4, n, true)
  let off = 6 + 16 * n
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i
    out[e] = s >= 256 ? 0 : s; out[e + 1] = s >= 256 ? 0 : s; out[e + 2] = 0; out[e + 3] = 0
    v.setUint16(e + 4, 1, true); v.setUint16(e + 6, 32, true); v.setUint32(e + 8, pngs[i].length, true); v.setUint32(e + 12, off, true)
    out.set(pngs[i], off); off += pngs[i].length
  })
  return out
}

export async function loadGifenc(): Promise<{ GIFEncoder: any; quantize: any; applyPalette: any }> {
  // @ts-ignore, gifenc ships without type declarations
  const m: any = await import('gifenc')
  return (m.GIFEncoder ? m : m.default) as any
}

/** Quantize one RGBA frame and write it to an encoder, preserving 1-bit transparency. */
export function writeGifFrame(lib: { quantize: any; applyPalette: any }, enc: any, data: Uint8ClampedArray, w: number, h: number, opts: { delay?: number; repeat?: number; colors?: number; transparent?: boolean } = {}) {
  const colors = opts.colors ?? 256
  if (opts.transparent) {
    const palette = lib.quantize(data, colors, { format: 'rgba4444', oneBitAlpha: true })
    const index = lib.applyPalette(data, palette, 'rgba4444')
    const ti = palette.findIndex((p: number[]) => p[3] === 0)
    enc.writeFrame(index, w, h, { palette, delay: opts.delay ?? 0, repeat: opts.repeat ?? 0, transparent: ti >= 0, transparentIndex: Math.max(0, ti) })
  } else {
    const palette = lib.quantize(data, colors)
    const index = lib.applyPalette(data, palette)
    enc.writeFrame(index, w, h, { palette, delay: opts.delay ?? 0, repeat: opts.repeat ?? 0 })
  }
}

export async function encodeGIF(c: HTMLCanvasElement): Promise<Blob> {
  const lib = await loadGifenc()
  const enc = lib.GIFEncoder()
  const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
  writeGifFrame(lib, enc, data, c.width, c.height, { transparent: hasAlpha(c) })
  enc.finish()
  return new Blob([enc.bytes() as BlobPart], { type: 'image/gif' })
}

/** Export a canvas to any supported format. Lossy formats/BMP get `bg` behind transparency. */
export async function exportCanvas(c: HTMLCanvasElement, fmt: Fmt, quality = 0.9, bg = '#ffffff'): Promise<Blob> {
  switch (fmt) {
    case 'bmp': return encodeBMP(c, bg)
    case 'ico': return encodeICO(c)
    case 'gif': return encodeGIF(c)
    case 'jpg': return blobFromCanvas(flatten(c, bg), 'image/jpeg', quality)
    case 'png': return blobFromCanvas(c, 'image/png')
    default:
      if (!canEncode(FMT_MIME[fmt])) throw new Error(`${fmt.toUpperCase()} export isn't supported by this browser. Try WEBP or PNG.`)
      return blobFromCanvas(c, FMT_MIME[fmt], quality)
  }
}

/** Output file name for an exported image. */
export const outName = (name: string, fmt: Fmt | string, suffix = '') => `${baseName(name)}${suffix}.${FMT_EXT[fmt as Fmt] ?? fmt}`

/* ------------------------------------------------------------------ */
/* hooks                                                               */
/* ------------------------------------------------------------------ */

export function useObjectUrl(blob: Blob | null | undefined) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return url
}

export type Item = { id: string; file: File; url: string; w: number; h: number }

/** Manages a list of image files with preview URLs and natural dimensions. */
export function useImageList() {
  const [items, setItems] = useState<Item[]>([])
  const ref = useRef(items); ref.current = items
  useEffect(() => () => ref.current.forEach((i) => URL.revokeObjectURL(i.url)), [])
  const add = useCallback(async (files: File[]) => {
    const fresh: Item[] = []
    for (const f of files) {
      const url = URL.createObjectURL(f)
      try {
        const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
        fresh.push({ id: uid(), file: f, url, w: img.naturalWidth, h: img.naturalHeight })
      } catch { URL.revokeObjectURL(url); toast(`Couldn't read ${f.name}`, 'error') }
    }
    setItems((s) => [...s, ...fresh])
    return fresh
  }, [])
  const remove = useCallback((id: string) => setItems((s) => { const it = s.find((x) => x.id === id); if (it) URL.revokeObjectURL(it.url); return s.filter((x) => x.id !== id) }), [])
  const clear = useCallback(() => setItems((s) => { s.forEach((i) => URL.revokeObjectURL(i.url)); return [] }), [])
  const reorder = useCallback((from: number, to: number) => setItems((s) => { const a = [...s]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a }), [])
  return { items, add, remove, clear, reorder, setItems }
}

/** Calls onFiles with images pasted from the clipboard (Ctrl/Cmd+V). */
export function usePasteImages(onFiles: (f: File[]) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const h = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
      if (files.length) { e.preventDefault(); onFiles(files.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `pasted-${Date.now()}${i ? '-' + i : ''}.png`, { type: f.type })))) }
    }
    window.addEventListener('paste', h)
    return () => window.removeEventListener('paste', h)
  }, [onFiles, enabled])
}

export function useDebounced<T>(value: T, ms = 150) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

/* ------------------------------------------------------------------ */
/* UI pieces                                                           */
/* ------------------------------------------------------------------ */

export const IMG_ACCEPT = 'image/*'

/** Before/after comparison with a draggable divider. */
export function BeforeAfter({ before, after, className, labels = ['Before', 'After'], checker = true, maxH = '70vh' }: { before: string; after: string; className?: string; labels?: [string, string]; checker?: boolean; maxH?: string }) {
  const [pos, setPos] = useState(50)
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef(false)
  const move = (clientX: number) => { const r = box.current!.getBoundingClientRect(); setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100))) }
  return (
    <div
      ref={box}
      className={cn('relative mx-auto w-fit max-w-full touch-none select-none overflow-hidden rounded-xl border border-border', checker && 'checker', className)}
      onPointerDown={(e) => { drag.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); move(e.clientX) }}
      onPointerMove={(e) => drag.current && move(e.clientX)}
      onPointerUp={() => (drag.current = false)}
      onKeyDown={(e) => { if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 5)); if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 5)) }}
      tabIndex={0}
      role="slider" aria-valuenow={Math.round(pos)} aria-label="Before/after comparison"
    >
      <img src={before} alt="Before" draggable={false} className="block max-w-full object-contain" style={{ maxHeight: maxH }} />
      <img src={after} alt="After" draggable={false} className="absolute inset-0 size-full object-contain" style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />
      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
        <div className="absolute inset-y-0 -ml-px w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,.5)]" />
        <div className="absolute top-1/2 -ml-4 -mt-4 grid size-8 place-items-center rounded-full bg-white text-[10px] font-bold text-black shadow-lg">⇆</div>
      </div>
      <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">{labels[0]}</span>
      <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">{labels[1]}</span>
    </div>
  )
}

/** Thumbnail grid of queued images with remove buttons and an "add more" tile. */
export function ThumbGrid({ items, onRemove, onAdd, onSelect, selected, extra, accept = IMG_ACCEPT }: { items: Item[]; onRemove?: (id: string) => void; onAdd?: (f: File[]) => void; onSelect?: (id: string) => void; selected?: string; extra?: (it: Item) => React.ReactNode; accept?: string }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      <AnimatePresence initial={false}>
        {items.map((it) => (
          <motion.div key={it.id} layout initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => onSelect?.(it.id)}
            className={cn('group relative overflow-hidden rounded-xl border bg-surface-2/40', selected === it.id ? 'border-accent ring-2 ring-accent/30' : 'border-border', onSelect && 'cursor-pointer')}>
            <div className="checker grid aspect-square place-items-center overflow-hidden"><img src={it.url} alt="" className="max-h-full max-w-full object-contain" draggable={false} /></div>
            <div className="border-t border-border px-2.5 py-1.5">
              <div className="truncate text-xs font-medium" title={it.file.name}>{it.file.name}</div>
              <div className="text-[11px] text-muted">{it.w}×{it.h} · {formatBytes(it.file.size)}</div>
              {extra?.(it)}
            </div>
            {onRemove && <button onClick={(e) => { e.stopPropagation(); onRemove(it.id) }} className="absolute right-1.5 top-1.5 rounded-lg bg-black/55 p-1 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100 cursor-pointer max-sm:opacity-100" aria-label="Remove"><X className="size-3.5" /></button>}
          </motion.div>
        ))}
      </AnimatePresence>
      {onAdd && (
        <button onClick={() => input.current?.click()} className="grid aspect-square min-h-24 place-items-center rounded-xl border-2 border-dashed border-border text-muted transition hover:border-accent hover:text-accent cursor-pointer">
          <div className="flex flex-col items-center gap-1 text-xs"><Plus className="size-5" />Add images</div>
          <input ref={input} type="file" hidden multiple accept={accept} onChange={(e) => { if (e.target.files) onAdd(Array.from(e.target.files)); e.target.value = '' }} />
        </button>
      )}
    </div>
  )
}

export type Result = { id: string; name: string; blob: Blob; originalSize?: number; url?: string; note?: string }

/** Results list: per-file download + savings, and "Download all as ZIP". */
export function BatchResults({ results, zipName = 'openfile-images.zip', onReset, title, children }: { results: Result[]; zipName?: string; onReset?: () => void; title?: string; children?: React.ReactNode }) {
  const total = results.reduce((a, r) => a + r.blob.size, 0)
  const orig = results.reduce((a, r) => a + (r.originalSize ?? 0), 0)
  const saved = orig ? 1 - total / orig : 0
  const [zipping, setZipping] = useState(false)
  // Results appear below the options; on a short screen they used to land out of sight, so bring them into view once.
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.top > window.innerHeight - 96 || r.bottom < 64) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' })
  }, [])
  const other = useOtherStartOver(box)
  const zipAll = async () => { setZipping(true); try { downloadBlob(await zipFiles(results.map((r) => ({ name: r.name, data: r.blob }))), zipName) } finally { setZipping(false) } }
  return (
    <motion.div ref={box} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="scroll-mt-24 rounded-2xl border border-success/30 bg-success/5 p-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid size-12 place-items-center rounded-xl bg-success/15 text-success"><Check className="size-6" /></div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{title ?? (results.length === 1 ? 'Your image is ready' : `${results.length} images ready`)}</div>
          <div className="text-sm text-muted">{formatBytes(total)}{orig ? (total === orig ? <> · same size as the original</> : <> · <span className={saved > 0 ? 'font-medium text-success' : 'text-warn'}>{saved > 0 ? `−${(saved * 100).toFixed(1)}%` : `+${(-saved * 100).toFixed(1)}%`}</span> from {formatBytes(orig)}</>) : null}</div>
          {results.length === 1 && results[0].note && <div className="mt-0.5 text-xs text-muted">{results[0].note.charAt(0).toUpperCase() + results[0].note.slice(1)}{/original kept/.test(results[0].note) ? '. Making it smaller would only lose quality, so you get the same file back.' : ''}</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          {onReset && !other && <Button variant="ghost" data-card-reset="" onClick={onReset}>Start over</Button>}
          {results.length > 1
            ? <Button icon={<Package className="size-4" />} loading={zipping} onClick={zipAll}>Download all (ZIP)</Button>
            : results[0] && <Button icon={<Download className="size-4" />} onClick={() => downloadBlob(results[0].blob, results[0].name)}>Download</Button>}
        </div>
      </div>
      {results.length > 1 && (
        <div className="mt-4 max-h-80 space-y-1.5 overflow-auto pr-1 scrollbar-thin">
          {results.map((r) => { const s = r.originalSize ? 1 - r.blob.size / r.originalSize : null; return (
            <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm">
              {r.url ? <img src={r.url} alt="" className="checker size-9 rounded-md object-cover" /> : <ImageIcon className="size-4 text-accent" />}
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.name}</div><div className="text-xs text-muted">{r.originalSize ? `${formatBytes(r.originalSize)} → ` : ''}{formatBytes(r.blob.size)}{r.note ? ` · ${r.note}` : ''}</div></div>
              {s !== null && (s === 0 ? <span className="text-xs text-muted">Unchanged</span> : <span className={cn('font-mono text-xs', s > 0 ? 'text-success' : 'text-warn')}>{s > 0 ? '−' : '+'}{Math.abs(s * 100).toFixed(1)}%</span>)}
              <button onClick={() => downloadBlob(r.blob, r.name)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg cursor-pointer" aria-label={`Download ${r.name}`}><Download className="size-4" /></button>
            </div>) })}
        </div>
      )}
      {children && <div className="mt-4">{children}</div>}
    </motion.div>
  )
}

/** Per-item status pill for batch jobs. */
export function StatusPill({ state }: { state?: 'wait' | 'run' | 'done' | 'err' }) {
  if (!state || state === 'wait') return null
  return (
    <span className={cn('mt-1 inline-flex items-center gap-1 text-[11px]', state === 'done' ? 'text-success' : state === 'err' ? 'text-danger' : 'text-accent')}>
      {state === 'run' ? <Loader2 className="size-3 animate-spin" /> : state === 'done' ? <Check className="size-3" /> : <AlertCircle className="size-3" />}
      {state === 'run' ? 'Processing' : state === 'done' ? 'Done' : 'Failed'}
    </span>
  )
}

/** Landing dropzone for image tools with a paste hint. */
export function ImageDrop({ onFiles, multiple = true, label, sub, accept = IMG_ACCEPT }: { onFiles: (f: File[]) => unknown; multiple?: boolean; label?: React.ReactNode; sub?: React.ReactNode; accept?: string }) {
  // Tools often decode the file straight away; when that fails (a damaged or mislabelled file) say so instead of doing nothing.
  const safe = useCallback((f: File[]) => {
    const fail = () => toast(f.length === 1 ? `Couldn't read ${f[0].name}. It may be damaged or not an image this browser can open.` : 'Some of those files could not be read as images.', 'error')
    try { const r = onFiles(f); if (r instanceof Promise) r.catch(fail) } catch { fail() }
  }, [onFiles])
  usePasteImages(useCallback((f: File[]) => safe(multiple ? f : f.slice(0, 1)), [safe, multiple]))
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Dropzone accept={accept} multiple={multiple} onFiles={safe}
        label={label ?? (multiple ? 'Drop images here or click to browse' : 'Drop an image here or click to browse')}
        sub={sub ?? <>JPG, PNG, WEBP, GIF, AVIF, BMP · or paste with <kbd className="rounded border border-border px-1 font-mono">Ctrl/⌘ V</kbd> · never uploaded</>} />
    </motion.div>
  )
}

/** Color input styled to the kit. */
export function ColorInput({ value, onChange, className, label = 'Color' }: { value: string; onChange: (v: string) => void; className?: string; label?: string }) {
  return (
    <div className={cn('flex h-10 items-center gap-2 rounded-xl border border-border bg-surface-2/60 px-2', className)}>
      <input type="color" aria-label={`${label} picker`} value={value} onChange={(e) => onChange(e.target.value)} className="size-7 cursor-pointer rounded-md border-0 bg-transparent p-0" />
      <input aria-label={`${label} hex code`} value={value} onChange={(e) => onChange(e.target.value)} className="w-full min-w-0 bg-transparent font-mono text-xs uppercase text-fg outline-none" spellCheck={false} />
    </div>
  )
}

/** Fit (w,h) into (mw,mh) keeping aspect. */
export function fit(w: number, h: number, mw: number, mh: number) { const s = Math.min(mw / w, mh / h, 1); return { w: w * s, h: h * s, s } }

export function rotatedBounds(w: number, h: number, deg: number) {
  const r = (deg * Math.PI) / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r))
  return { w: Math.round(w * c + h * s), h: Math.round(w * s + h * c) }
}

/** Draw a rounded rect path. */
export function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) {
  const rr = Array.isArray(r) ? r : [r, r, r, r]
  const m = Math.min(w, h) / 2
  const [a, b, c, d] = rr.map((v) => Math.max(0, Math.min(v, m)))
  ctx.beginPath()
  ctx.moveTo(x + a, y); ctx.lineTo(x + w - b, y); ctx.quadraticCurveTo(x + w, y, x + w, y + b)
  ctx.lineTo(x + w, y + h - c); ctx.quadraticCurveTo(x + w, y + h, x + w - c, y + h)
  ctx.lineTo(x + d, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - d)
  ctx.lineTo(x, y + a); ctx.quadraticCurveTo(x, y, x + a, y); ctx.closePath()
}

export const SOCIAL_SIZES: { id: string; label: string; w: number; h: number }[] = [
  { id: 'ig-post', label: 'Instagram post (1080×1080)', w: 1080, h: 1080 },
  { id: 'ig-portrait', label: 'Instagram portrait (1080×1350)', w: 1080, h: 1350 },
  { id: 'ig-story', label: 'Instagram story / Reel (1080×1920)', w: 1080, h: 1920 },
  { id: 'yt-thumb', label: 'YouTube thumbnail (1280×720)', w: 1280, h: 720 },
  { id: 'x-header', label: 'X / Twitter header (1500×500)', w: 1500, h: 500 },
  { id: 'x-post', label: 'X / Twitter post (1600×900)', w: 1600, h: 900 },
  { id: 'li-banner', label: 'LinkedIn banner (1584×396)', w: 1584, h: 396 },
  { id: 'li-post', label: 'LinkedIn post (1200×627)', w: 1200, h: 627 },
  { id: 'fb-cover', label: 'Facebook cover (820×312)', w: 820, h: 312 },
  { id: 'fb-post', label: 'Facebook post (1200×630)', w: 1200, h: 630 },
  { id: 'passport', label: 'Passport photo 35×45mm (413×531)', w: 413, h: 531 },
  { id: 'us-passport', label: 'US passport 2×2in (600×600)', w: 600, h: 600 },
]

/** Load a Google Font into the document (idempotent) and wait for it. */
const _fonts = new Set<string>()
export async function loadGoogleFont(family: string, weights = '400;700') {
  if (!family || _fonts.has(family)) { try { await document.fonts.load(`700 32px "${family}"`) } catch { /* ignore */ } return }
  _fonts.add(family)
  const l = document.createElement('link')
  l.rel = 'stylesheet'
  l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:ital,wght@0,${weights.split(';').join(';0,')};1,${weights.split(';').join(';1,')}&display=swap`
  document.head.appendChild(l)
  await new Promise((r) => { l.onload = r; l.onerror = r; setTimeout(r, 4000) })
  try { await Promise.all([document.fonts.load(`400 32px "${family}"`), document.fonts.load(`700 32px "${family}"`)]) } catch { /* ignore */ }
}

export const FONT_CHOICES = ['Inter', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Verdana', 'Roboto', 'Montserrat', 'Poppins', 'Playfair Display', 'Bebas Neue', 'Oswald', 'Lobster', 'Pacifico', 'Anton', 'Dancing Script', 'Permanent Marker', 'Space Grotesk', 'JetBrains Mono']
export const SYSTEM_FONTS = new Set(['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Verdana'])
export async function ensureFont(family: string) { if (!SYSTEM_FONTS.has(family)) await loadGoogleFont(family) }

/** Reduce a canvas to N colors in place (keeps alpha), makes PNGs compress dramatically better. */
export async function quantizeCanvas(c: HTMLCanvasElement, colors: number) {
  const lib = await loadGifenc()
  const ctx = c.getContext('2d')!
  const id = ctx.getImageData(0, 0, c.width, c.height)
  const palette: number[][] = lib.quantize(id.data, colors, { format: 'rgba4444' })
  const index: Uint8Array = lib.applyPalette(id.data, palette, 'rgba4444')
  const d = id.data
  for (let i = 0, p = 0; p < index.length; p++, i += 4) { const col = palette[index[p]]; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = col[3] ?? 255 }
  ctx.putImageData(id, 0, 0)
  return c
}
