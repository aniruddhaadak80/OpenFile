/* Animated image engine: read any animation into frames and write it back out.
 * GIF and APNG are handled in JavaScript; WebP frames use the browser decoder; animated AVIF uses
 * the WebCodecs ImageDecoder where the browser has it; WebP/MP4/WebM output and video input go
 * through the self-hosted ffmpeg.wasm core (src/tools/video/_media/engine.ts). */
import { ffRun, extFromBlob } from '@/tools/video/_media/engine'
import { type Anim, type Frame, flattenAnim, hexToRgba, estimateRawBytes } from './core'
import { decodeGif, encodeGif, type GifOptions } from './gif'
import { decodePng, encodeApng, encodePngFrame } from './png'
import { decodeWebp, isWebp, patchWebpDurations } from './webp'
import { webpArgs, animVideoArgs } from './args'

export * from './core'
export { decodeGif, encodeGif, gifLoopCount, type GifOptions } from './gif'
export { decodePng, encodeApng, encodePngFrame, isApng } from './png'
export { parseWebp, decodeWebp, isWebp, patchWebpDurations } from './webp'
export { webpArgs, animVideoArgs } from './args'

export type Kind = 'gif' | 'png' | 'webp' | 'avif' | 'jxl' | 'image' | 'video' | 'unknown'

export function sniff(b: Uint8Array, name = ''): Kind {
  const s = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n))
  if (s(0, 4) === 'GIF8') return 'gif'
  if (b[0] === 0x89 && s(1, 3) === 'PNG') return 'png'
  if (isWebp(b)) return 'webp'
  if (s(4, 4) === 'ftyp') {
    const brands = s(8, 4) + s(16, Math.min(32, Math.max(0, b.length - 16)))
    if (/avif|avis/.test(brands)) return 'avif'
    if (/heic|heix|mif1|msf1/.test(s(8, 4))) return 'image'
    return 'video'
  }
  if ((b[0] === 0xff && b[1] === 0x0a) || s(4, 4) === 'JXL ') return 'jxl'
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video'
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'AVI ') return 'video'
  if (b[0] === 0xff && b[1] === 0xd8) return 'image'
  if (s(0, 2) === 'BM') return 'image'
  if (/\.(mp4|m4v|mov|webm|mkv|avi|ogv|3gp|flv|wmv|mpg|mpeg|ts|mts)$/i.test(name)) return 'video'
  if (/\.(jpe?g|bmp|ico|svg|tiff?)$/i.test(name)) return 'image'
  return 'unknown'
}

export const ANIM_ACCEPT = 'image/gif,image/png,image/apng,image/webp,image/avif,.gif,.png,.apng,.webp,.avif'
export const ANIM_OR_VIDEO_ACCEPT = ANIM_ACCEPT + ',video/*,.mp4,.mov,.webm,.mkv,.avi,.m4v'

/** Draw a Blob with the browser decoder into RGBA. */
export async function blobToRGBA(blob: Blob, maxSide = 0): Promise<{ rgba: Uint8ClampedArray; width: number; height: number }> {
  let bmp: ImageBitmap
  try { bmp = await createImageBitmap(blob) } catch {
    const url = URL.createObjectURL(blob)
    try {
      const img = new Image(); img.decoding = 'async'; img.src = url
      await img.decode()
      bmp = await createImageBitmap(img)
    } catch { throw new Error('Your browser could not read this image.') } finally { URL.revokeObjectURL(url) }
  }
  let w = bmp.width, h = bmp.height
  if (maxSide && Math.max(w, h) > maxSide) { const s = maxSide / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s) }
  const c = makeCanvas(w, h), ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  ctx.drawImage(bmp, 0, 0, w, h); bmp.close?.()
  return { rgba: ctx.getImageData(0, 0, w, h).data, width: w, height: h }
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c
}

export function frameToCanvas(rgba: Uint8ClampedArray, w: number, h: number, target?: HTMLCanvasElement) {
  const c = target ?? makeCanvas(w, h)
  if (c.width !== w) c.width = w
  if (c.height !== h) c.height = h
  const ctx = c.getContext('2d')!
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0)
  return c
}

export function canvasRGBA(c: HTMLCanvasElement) { return c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data }

/** Run a canvas drawing step over every frame (text, filters, overlays). */
export async function mapFramesCanvas(a: Anim, draw: (ctx: CanvasRenderingContext2D, i: number, c: HTMLCanvasElement) => void | Promise<void>, onProgress?: (p: number) => void): Promise<Anim> {
  const c = makeCanvas(a.width, a.height)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const frames: Frame[] = []
  for (let i = 0; i < a.frames.length; i++) {
    ctx.save(); ctx.clearRect(0, 0, c.width, c.height)
    ctx.putImageData(new ImageData(new Uint8ClampedArray(a.frames[i].rgba), a.width, a.height), 0, 0)
    await draw(ctx, i, c)
    ctx.restore()
    frames.push({ delay: a.frames[i].delay, rgba: ctx.getImageData(0, 0, a.width, a.height).data })
    if (i % 8 === 0) { onProgress?.((i + 1) / a.frames.length); await new Promise((r) => setTimeout(r, 0)) }
  }
  onProgress?.(1)
  return { ...a, frames }
}

async function decodeWithImageDecoder(bytes: Uint8Array, mime: string, onProgress?: (p: number) => void): Promise<Anim> {
  const ID = (globalThis as any).ImageDecoder
  if (!ID || !(await ID.isTypeSupported(mime))) throw new Error(`Your browser cannot read animated ${mime.split('/')[1].toUpperCase()} files. Chrome or Edge can, or convert it to GIF first.`)
  const dec = new ID({ data: bytes, type: mime })
  await dec.tracks.ready
  const track = dec.tracks.selectedTrack
  const count = track?.frameCount || 1
  const frames: Frame[] = []
  let w = 0, h = 0
  const c = makeCanvas(1, 1)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  for (let i = 0; i < count; i++) {
    const { image } = await dec.decode({ frameIndex: i })
    w = image.displayWidth; h = image.displayHeight
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
    ctx.clearRect(0, 0, w, h); ctx.drawImage(image, 0, 0)
    frames.push({ rgba: ctx.getImageData(0, 0, w, h).data, delay: Math.max(20, Math.round((image.duration ?? 100000) / 1000)) })
    image.close()
    onProgress?.((i + 1) / count)
  }
  dec.close()
  const rep = track?.repetitionCount
  return { width: w, height: h, frames, loop: rep === Infinity ? 0 : (rep ?? 0) + 1, source: mime.split('/')[1].toUpperCase() }
}

export interface VideoToAnimOpts { fps?: number; width?: number; start?: number; duration?: number; maxFrames?: number; onProgress?: (p: number) => void }

/** Decode a video clip into frames using ffmpeg (writes an intermediate APNG). */
export async function videoToAnim(file: Blob, o: VideoToAnimOpts = {}): Promise<Anim> {
  const fps = o.fps ?? 12, input = 'in' + extFromBlob(file)
  const vf = [`fps=${fps}`]
  if (o.width) vf.push(`scale=${Math.round(o.width)}:-2:flags=lanczos`)
  const args = [...(o.start ? ['-ss', String(o.start)] : []), ...(o.duration ? ['-t', String(o.duration)] : []), '-i', input, '-vf', vf.join(','), '-frames:v', String(o.maxFrames ?? 900), '-an', '-f', 'apng', '-plays', '0', 'out.apng']
  const blob = await ffRun({ inputs: [{ name: input, file }], args, output: 'out.apng', duration: o.duration, onProgress: o.onProgress })
  const a = decodePng(new Uint8Array(await blob.arrayBuffer()))
  a.loop = 0; a.source = 'Video'
  return a
}

export interface DecodeOpts { onProgress?: (p: number) => void; video?: VideoToAnimOpts }

/** Read GIF, APNG/PNG, WebP, AVIF, still images, or a video into an Anim. */
export async function decodeAnim(file: Blob, opts: DecodeOpts = {}): Promise<Anim> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = sniff(bytes, (file as File).name || '')
  try {
    switch (kind) {
      case 'gif': return decodeGif(bytes)
      case 'png': return decodePng(bytes)
      case 'webp':
        try { return await decodeWebp(bytes, opts.onProgress) } catch (e) {
          if ((globalThis as any).ImageDecoder) return await decodeWithImageDecoder(bytes, 'image/webp', opts.onProgress)
          throw e
        }
      case 'avif': return await decodeWithImageDecoder(bytes, 'image/avif', opts.onProgress)
      case 'video': return await videoToAnim(file, { ...opts.video, onProgress: opts.onProgress })
      case 'jxl': throw new Error('JPEG XL animations cannot be read here yet. Convert it to GIF or APNG first.')
      default: {
        const { rgba, width, height } = await blobToRGBA(file)
        return { width, height, frames: [{ rgba, delay: 1000 }], loop: 0, source: 'Image' }
      }
    }
  } catch (e: any) {
    if (e?.name === 'CancelledError') throw e
    const msg = e?.message || String(e)
    if (/browser cannot|cannot be read|Repair GIF|video engine|ran out of memory|could not read/i.test(msg)) throw e
    throw new Error(`This ${kind === 'unknown' ? 'file' : kind.toUpperCase()} could not be read. It may be damaged or use a feature that is not supported. (${msg.slice(0, 120)})`)
  }
}

/* ------------------------------------------------------------------ output */

export type OutFmt = 'gif' | 'apng' | 'webp' | 'mp4' | 'webm'
export const OUT_EXT: Record<OutFmt, string> = { gif: 'gif', apng: 'png', webp: 'webp', mp4: 'mp4', webm: 'webm' }
export const OUT_MIME: Record<OutFmt, string> = { gif: 'image/gif', apng: 'image/png', webp: 'image/webp', mp4: 'video/mp4', webm: 'video/webm' }
export const OUT_LABEL: Record<OutFmt, string> = { gif: 'GIF', apng: 'APNG', webp: 'WebP', mp4: 'MP4', webm: 'WebM' }

export interface EncodeOpts {
  gif?: GifOptions
  /** APNG palette size, 0 = lossless */
  apngColors?: number
  /** WebP 0..100 quality, or lossless */
  webpQuality?: number
  webpLossless?: boolean
  /** video background for transparent pixels */
  background?: string
  /** play the animation this many times inside a video file */
  videoRepeat?: number
  onProgress?: (p: number) => void
  onLabel?: (s: string) => void
}

/** Lossless APNG with real per-frame timing; the cleanest way to hand frames to ffmpeg. */
function apngForFfmpeg(a: Anim) {
  return encodeApng(a, { colors: 0, loop: 0 })
}

export async function encodeAnim(a: Anim, fmt: OutFmt, o: EncodeOpts = {}): Promise<Blob> {
  if (!a.frames.length) throw new Error('There are no frames to save.')
  const prog = o.onProgress ?? (() => {})
  if (fmt === 'gif') {
    o.onLabel?.('Encoding GIF')
    await tick()
    return new Blob([encodeGif(a, { ...o.gif, onProgress: prog }) as BlobPart], { type: 'image/gif' })
  }
  if (fmt === 'apng') {
    o.onLabel?.('Encoding APNG')
    await tick()
    return new Blob([encodeApng(a, { colors: o.apngColors ?? 0, onProgress: prog }) as BlobPart], { type: 'image/png' })
  }
  if (estimateRawBytes(a) > 900 * 1024 * 1024) throw new Error('This animation is too large to convert in the browser. Reduce its size or frame count first.')
  o.onLabel?.('Preparing frames')
  await tick()
  if (fmt === 'webp') {
    const src = apngForFfmpeg(a)
    o.onLabel?.('Encoding WebP')
    const args = webpArgs('in.apng', 'out.webp', a.loop, o.webpQuality ?? 80, !!o.webpLossless)
    const out = await ffRun({ inputs: [{ name: 'in.apng', file: src }], args, output: 'out.webp', onProgress: prog })
    const fixed = patchWebpDurations(new Uint8Array(await out.arrayBuffer()), a.frames.map((f) => f.delay))
    return new Blob([fixed as BlobPart], { type: 'image/webp' })
  }
  // video: repeat, flatten transparency for MP4
  let v = a
  const rep = Math.max(1, Math.min(50, o.videoRepeat ?? 1))
  if (rep > 1) v = { ...v, frames: Array.from({ length: rep }, () => v.frames).flat() }
  if (fmt === 'mp4') v = flattenAnim(v, hexToRgba(o.background ?? '#ffffff'))
  const src = apngForFfmpeg(v)
  const dur = v.frames.reduce((s, f) => s + f.delay, 0) / 1000
  o.onLabel?.(fmt === 'mp4' ? 'Encoding MP4' : 'Encoding WebM')
  const args = animVideoArgs('in.apng', `out.${fmt}`, fmt)
  return ffRun({ inputs: [{ name: 'in.apng', file: src }], args, output: `out.${fmt}`, duration: dur, onProgress: prog })
}

const tick = () => new Promise((r) => setTimeout(r, 0))

/** All frames as PNG files, ready for a ZIP. */
export function framesToPngs(a: Anim, base = 'frame'): { name: string; data: Uint8Array }[] {
  const digits = String(a.frames.length).length
  return a.frames.map((f, i) => ({ name: `${base}_${String(i + 1).padStart(Math.max(3, digits), '0')}.png`, data: encodePngFrame(f.rgba, a.width, a.height) }))
}

export { encodePngFrame as pngFrame }
