/* AI 2x upscale for the Photo Enhancer. It sends the pixels to the Image Upscaler's worker (Swin2SR, run in overlapping
   192 px tiles), so the page stays responsive, progress is reported per tile and cancelUpscale() stops it at once.
   With a real WebGPU adapter it runs the full model on the GPU; on the CPU it runs the lightweight model, which is
   about 3.5x faster on WebAssembly. */
import { MODEL_CPU, MODEL_GPU, UP_PAD, UP_TILE, friendlyUpscaleError, remainingText } from './upscale-plan'

let worker: Worker | null = null
let seq = 0
let pending: { id: number; reject: (e: unknown) => void } | null = null
let gpuCheck: Promise<boolean> | null = null

/** True only when WebGPU exists and an adapter can be obtained (navigator.gpu alone is not enough in headless or
    blocklisted browsers). Cached for the page's lifetime. */
export function hasGpuAdapter(): Promise<boolean> {
  if (!gpuCheck) gpuCheck = (async () => {
    try {
      const gpu = (navigator as any).gpu
      if (!gpu) return false
      return !!(await Promise.race([gpu.requestAdapter(), new Promise((r) => setTimeout(() => r(null), 3000))]))
    } catch { return false }
  })()
  return gpuCheck
}

export class CancelledError extends Error { constructor() { super('Cancelled'); this.name = 'CancelledError' } }

/** Stop the running upscale at once. The pending call rejects with a CancelledError. */
export function cancelUpscale() {
  if (worker) { worker.terminate(); worker = null }
  if (pending) { const p = pending; pending = null; p.reject(new CancelledError()) }
}

const mb = (n: number) => (n / 1048576).toFixed(1)

export async function upscale2x(src: HTMLCanvasElement, onProgress: (stage: string, p: number) => void): Promise<HTMLCanvasElement> {
  onProgress('Loading the upscaler', 0)
  const gpu = await hasGpuAdapter()
  // Read the pixels before the worker starts so a canvas problem surfaces as a normal error.
  const data = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data
  return new Promise((resolve, reject) => {
    if (pending) cancelUpscale() // never two runs on one worker
    let w: Worker
    // The worker stays alive between runs so the model stays loaded; Cancel or a crash terminates it.
    try { w = worker ??= new Worker(new URL('../../tools/image/upscaler.worker.ts', import.meta.url), { type: 'module' }) }
    catch (e) { reject(new Error(friendlyUpscaleError(e))); return }
    const id = ++seq
    let tilesStart = 0
    pending = { id, reject }
    const finish = () => { w.onmessage = null; w.onerror = null; w.onmessageerror = null; if (pending?.id === id) pending = null }
    const fail = (msg: string) => { finish(); if (worker === w) { w.terminate(); worker = null } reject(new Error(msg)) }
    w.onmessage = (ev) => {
      const m = ev.data
      if (!m || m.id !== id) return
      if (m.type === 'load') {
        if (m.total && m.loaded >= m.total) onProgress('Preparing the AI model (the first run can take a minute)', 0.2)
        else onProgress(`Downloading the upscaler (first run only) ${mb(m.loaded)} / ${mb(m.total)} MB`, m.total ? (m.loaded / m.total) * 0.2 : 0)
      } else if (m.type === 'ready') {
        tilesStart = performance.now()
        onProgress(m.device === 'webgpu' ? 'Upscaling on the GPU' : 'Upscaling on the CPU, tile by tile', 0.22)
      } else if (m.type === 'tile') {
        const left = remainingText(m.done, m.total, performance.now() - tilesStart)
        onProgress(`Upscaling on the ${m.device === 'webgpu' ? 'GPU' : 'CPU'}: ${m.done} of ${m.total} tiles done${left ? `, ${left}` : ''}`, 0.22 + (m.done / m.total) * 0.78)
      } else if (m.type === 'done') {
        finish()
        try {
          const out = document.createElement('canvas'); out.width = m.width; out.height = m.height
          out.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(m.rgba), m.width, m.height), 0, 0)
          resolve(out)
        } catch (e) { reject(new Error(friendlyUpscaleError(e))) }
      } else if (m.type === 'error') fail(friendlyUpscaleError(m.message))
    }
    // A crashed or out-of-memory worker fires error without a message of its own.
    w.onerror = (e) => { e.preventDefault?.(); fail(e.message ? friendlyUpscaleError(e.message) : 'The AI upscaler stopped unexpectedly, most likely because the browser ran out of memory. Turn off AI upscale or use a smaller photo.') }
    w.onmessageerror = () => fail(friendlyUpscaleError('message'))
    w.postMessage({ id, rgba: data.buffer, width: src.width, height: src.height, passes: 1, tile: UP_TILE, pad: UP_PAD, preferGpu: gpu, model: MODEL_GPU, cpuModel: MODEL_CPU }, [data.buffer])
  })
}
