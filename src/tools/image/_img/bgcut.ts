/* Background cut-out for tools that need it as one step (passport photo, GIF effects). The IMG.LY model runs in
 * bg-remover.worker.ts, so the page keeps responding: run on the main thread, a CPU-only browser froze for 17 s. */
let worker: Worker | null = null
let seq = 0

/** Plain words for a failed cut-out. Pure. */
export function cutError(m: string): string {
  if (/fetch|network|Failed to load|resources\.json|404|offline/i.test(m)) return 'The background model could not be downloaded. Check your connection and try again.'
  if (/memory|allocation|bad_alloc/i.test(m)) return 'The browser ran out of memory while removing the background. Close other tabs and try again.'
  return 'Removing the background failed: ' + m.slice(0, 160)
}

/** The image with its background made transparent, as a full-size PNG. onProgress gets the model's own keys
 *  ("fetch:..." while downloading, "compute:..." while running). */
export function cutOut(file: Blob, onProgress?: (key: string, cur: number, total: number) => void, model: 'isnet_fp16' | 'isnet_quint8' = 'isnet_fp16'): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    if (!worker) worker = new Worker(new URL('../bg-remover.worker.ts', import.meta.url), { type: 'module' })
    const w = worker, id = 'cut' + ++seq
    const done = () => w.removeEventListener('message', onMsg)
    const onMsg = (ev: MessageEvent) => {
      const m = ev.data; if (m.id !== id) return
      if (m.type === 'progress') onProgress?.(m.key, m.cur, m.total)
      else if (m.type === 'done') { done(); resolve(m.blob) }
      else if (m.type === 'error') { done(); reject(new Error(cutError(String(m.message)))) }
    }
    w.addEventListener('message', onMsg)
    w.onerror = (e) => { e.preventDefault?.(); done(); w.terminate(); if (worker === w) worker = null; reject(new Error(cutError('the background worker stopped'))) }
    w.postMessage({ id, file, model, preferGpu: true })
  })
}
