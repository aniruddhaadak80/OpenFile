/// <reference lib="webworker" />
/* Background removal (@imgly/background-removal, ONNX Runtime Web) in a module Web Worker.
 * The mask is computed on a downscaled copy (the model works at 1024 px anyway), then scaled back up and applied
 * to the full-size image on a single OffscreenCanvas. Only the finished PNG goes back to the page. */
import { segmentForeground } from '@imgly/background-removal'

const post = (m: any) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m)
const MASK_SIDE = 1024

async function gpuAvailable() {
  try { const g = (self.navigator as any).gpu; return !!(g && (await g.requestAdapter())) } catch { return false }
}

self.onmessage = async (ev: MessageEvent) => {
  const { id, file, model, preferGpu } = ev.data as { id: string; file: Blob; model: 'isnet_fp16' | 'isnet_quint8'; preferGpu: boolean }
  let full: ImageBitmap | null = null
  let maskBmp: ImageBitmap | null = null
  try {
    full = await createImageBitmap(file)
    const W = full.width, H = full.height
    const k = Math.min(1, MASK_SIDE / Math.max(W, H))
    const sw = Math.max(1, Math.round(W * k)), sh = Math.max(1, Math.round(H * k))
    let small: Blob
    {
      const c = new OffscreenCanvas(sw, sh)
      const ctx = c.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(full, 0, 0, sw, sh)
      small = await c.convertToBlob({ type: 'image/png' })
      c.width = c.height = 0
    }
    const device = preferGpu && (await gpuAvailable()) ? 'gpu' : 'cpu'
    const mask = await segmentForeground(small, {
      model, device, output: { format: 'image/png' },
      progress: (key: string, cur: number, total: number) => post({ id, type: 'progress', key, cur, total }),
    })
    post({ id, type: 'progress', key: 'compose', cur: 0, total: 1 })
    maskBmp = await createImageBitmap(mask)
    // One full-size canvas: draw the photo, then keep only the pixels under the (smoothly upscaled) mask.
    const out = new OffscreenCanvas(W, H)
    const ctx = out.getContext('2d')!
    ctx.drawImage(full, 0, 0)
    full.close(); full = null
    ctx.globalCompositeOperation = 'destination-in'
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(maskBmp, 0, 0, W, H)
    maskBmp.close(); maskBmp = null
    const blob = await out.convertToBlob({ type: 'image/png' })
    out.width = out.height = 0
    post({ id, type: 'done', blob, device })
  } catch (e: any) {
    post({ id, type: 'error', message: String(e?.message || e) })
  } finally {
    full?.close(); maskBmp?.close()
  }
}
