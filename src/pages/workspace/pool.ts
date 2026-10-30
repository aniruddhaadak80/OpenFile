/* A small pool of image Web Workers. Each job goes to the least busy worker. Falls back to the main thread when
 * OffscreenCanvas or module workers are missing, or when a worker fails to start. */
import { imageOp, type Op } from './imageOps'
import { loadImage } from '@/lib/files'

type Job = { resolve: (b: Blob) => void; reject: (e: Error) => void }
type W = { w: Worker; busy: number }

class ImagePool {
  private workers: W[] = []
  private jobs = new Map<number, Job>()
  private seq = 0
  private broken = false
  size = 2
  get supported() { return !this.broken && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined' }
  get active() { return this.workers.length }

  private spawn(): W | null {
    try {
      const w = new Worker(new URL('./img.worker.ts', import.meta.url), { type: 'module' })
      const rec: W = { w, busy: 0 }
      w.onmessage = (ev) => { const { id, ok, blob, error } = ev.data; const j = this.jobs.get(id); if (!j) return; this.jobs.delete(id); rec.busy--; ok ? j.resolve(blob) : j.reject(new Error(error)) }
      w.onerror = () => { this.broken = true }
      this.workers.push(rec)
      return rec
    } catch { this.broken = true; return null }
  }

  async run(blob: Blob, op: Op): Promise<Blob> {
    if (!this.supported) return mainThread(blob, op)
    let pick = this.workers.reduce<W | null>((a, b) => (!a || b.busy < a.busy ? b : a), null)
    if ((!pick || pick.busy > 0) && this.workers.length < this.size) pick = this.spawn() ?? pick
    if (!pick) return mainThread(blob, op)
    const id = ++this.seq
    pick.busy++
    const target = pick
    return new Promise<Blob>((resolve, reject) => {
      this.jobs.set(id, { resolve, reject: (e) => { reject(e) } })
      target.w.postMessage({ id, blob, op })
    }).catch(async (e) => {
      // a worker that cannot encode this format (or crashed) gets one retry on the main thread
      if (this.broken) return mainThread(blob, op)
      throw e
    })
  }

  resize(n: number) { this.size = Math.max(1, Math.min(8, n)) }
  terminate() { this.workers.forEach((w) => w.w.terminate()); this.workers = []; this.jobs.forEach((j) => j.reject(new Error('Stopped'))); this.jobs.clear() }
}

async function mainThread(blob: Blob, op: Op): Promise<Blob> {
  const img = await loadImage(blob)
  return imageOp(img, op)
}

export const imagePool = new ImagePool()
