/// <reference lib="webworker" />
/* AI super-resolution (Swin2SR x2, Transformers.js / ONNX Runtime Web) in a module Web Worker.
 * The image arrives as raw RGBA pixels, is processed in overlapping tiles, and every tile reports progress.
 * Nothing here touches the main thread, so the page stays responsive even on CPU (WebAssembly). */
import { pipeline, env, RawImage } from '@huggingface/transformers'

env.allowLocalModels = false
const post = (m: any, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer)

const MODEL = 'Xenova/swin2SR-classical-sr-x2-64'
let pipe: any = null
let pipeDevice = ''

async function gpuAvailable() {
  try {
    const gpu = (self.navigator as any).gpu
    if (!gpu) return false
    const adapter = await Promise.race([gpu.requestAdapter(), new Promise((r) => setTimeout(() => r(null), 3000))])
    return !!adapter
  } catch { return false }
}

async function load(id: number, preferGpu: boolean) {
  const want = preferGpu && (await gpuAvailable()) ? ['webgpu', 'wasm'] : ['wasm']
  if (pipe && want.includes(pipeDevice)) return pipe
  if (pipe) { try { await pipe.dispose?.() } catch { /* ignore */ } pipe = null; pipeDevice = '' }
  const files = new Map<string, { loaded: number; total: number }>()
  const progress_callback = (e: any) => {
    if (e.status === 'progress' && e.file) {
      files.set(e.file, { loaded: e.loaded ?? 0, total: e.total ?? 0 })
      let l = 0, t = 0; files.forEach((f) => { l += f.loaded; t += f.total })
      post({ id, type: 'load', loaded: l, total: t })
    }
  }
  let lastErr: unknown
  for (const device of want) {
    try { pipe = await pipeline('image-to-image', MODEL, { device: device as any, progress_callback } as any); pipeDevice = device; return pipe }
    catch (e) { lastErr = e }
  }
  throw lastErr
}

/** Runs one tile through the model and returns RGB pixels plus the output width (which may include padding). */
async function runTile(p: any, rgb: Uint8ClampedArray, w: number, h: number) {
  const raw = new RawImage(rgb, w, h, 3)
  if (p.processor && p.model) {
    const inputs = await p.processor(raw)
    const out = await p.model(inputs)
    const t = out.reconstruction
    const img = RawImage.fromTensor(t.squeeze().clamp_(0, 1).mul_(255).round_().to('uint8'))
    try { inputs.pixel_values?.dispose?.(); t.dispose?.() } catch { /* ignore */ }
    return img
  }
  const res = await p(raw)
  return Array.isArray(res) ? res[0] : res
}

/** One 2x pass over an RGB buffer in overlapping tiles. */
async function pass2x(p: any, src: Uint8ClampedArray, W: number, H: number, tile: number, pad: number, onTile: (d: number, t: number) => void) {
  const OW = W * 2, OH = H * 2
  const out = new Uint8ClampedArray(OW * OH * 3)
  const cols = Math.ceil(W / tile), rows = Math.ceil(H / tile), total = cols * rows
  let n = 0
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const x = tx * tile, y = ty * tile, w = Math.min(tile, W - x), h = Math.min(tile, H - y)
    const px = Math.max(0, x - pad), py = Math.max(0, y - pad)
    const pw = Math.min(W, x + w + pad) - px, ph = Math.min(H, y + h + pad) - py
    const buf = new Uint8ClampedArray(pw * ph * 3)
    for (let r = 0; r < ph; r++) buf.set(src.subarray(((py + r) * W + px) * 3, ((py + r) * W + px + pw) * 3), r * pw * 3)
    const img = await runTile(p, buf, pw, ph)
    const ow = img.width, ch = img.channels, data = img.data as Uint8ClampedArray | Uint8Array
    const ox = (x - px) * 2, oy = (y - py) * 2
    for (let r = 0; r < h * 2; r++) {
      const sRow = (oy + r) * ow, dRow = (y * 2 + r) * OW + x * 2
      if (ch === 3) out.set(data.subarray((sRow + ox) * 3, (sRow + ox + w * 2) * 3), dRow * 3)
      else for (let c = 0; c < w * 2; c++) { const s = (sRow + ox + c) * ch, d = (dRow + c) * 3; out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2] }
    }
    onTile(++n, total)
    await new Promise((r) => setTimeout(r, 0))
  }
  return out
}

self.onmessage = async (ev: MessageEvent) => {
  const { id, rgba, width, height, passes, tile = 192, pad = 16, preferGpu = true } = ev.data
  try {
    const p = await load(id, preferGpu)
    post({ id, type: 'ready', device: pipeDevice })
    // RGBA to RGB once
    const px = new Uint8ClampedArray(rgba)
    let rgb = new Uint8ClampedArray(width * height * 3)
    for (let i = 0, j = 0; i < px.length; i += 4, j += 3) { rgb[j] = px[i]; rgb[j + 1] = px[i + 1]; rgb[j + 2] = px[i + 2] }
    let W = width, H = height
    for (let pass = 0; pass < passes; pass++) {
      rgb = await pass2x(p, rgb, W, H, tile, pad, (done, total) => post({ id, type: 'tile', pass, passes, done, total, device: pipeDevice }))
      W *= 2; H *= 2
    }
    const outRgba = new Uint8ClampedArray(W * H * 4)
    for (let i = 0, j = 0; j < rgb.length; i += 4, j += 3) { outRgba[i] = rgb[j]; outRgba[i + 1] = rgb[j + 1]; outRgba[i + 2] = rgb[j + 2]; outRgba[i + 3] = 255 }
    post({ id, type: 'done', width: W, height: H, rgba: outRgba.buffer, device: pipeDevice }, [outRgba.buffer])
  } catch (e: any) {
    // A WebGPU failure gets one retry on WebAssembly before giving up.
    if (pipeDevice === 'webgpu' && preferGpu) {
      try { await pipe?.dispose?.() } catch { /* ignore */ }
      pipe = null; pipeDevice = ''
      ;(self as any).onmessage({ data: { ...ev.data, preferGpu: false } })
      return
    }
    post({ id, type: 'error', message: String(e?.message || e) })
  }
}
