/// <reference lib="webworker" />
/* Image step worker: decodes with createImageBitmap, draws on an OffscreenCanvas, hands back the encoded Blob. */
import { imageOp, type Op } from './imageOps'

self.onmessage = async (ev: MessageEvent) => {
  const { id, blob, op } = ev.data as { id: number; blob: Blob; op: Op }
  let bmp: ImageBitmap | null = null
  try {
    bmp = await createImageBitmap(blob)
    const out = await imageOp(bmp, op)
    ;(self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, ok: true, blob: out })
  } catch (e: any) {
    ;(self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, ok: false, error: String(e?.message || e) })
  } finally { bmp?.close() }
}
