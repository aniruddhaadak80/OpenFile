/* Client for the Local AI worker: model catalogue, run, cancel. */
import { friendlyAiError, hasWebGPU } from '@/lib/b4/ai'
export { hasWebGPU }

export type VTask = 'image-to-text' | 'object-detection' | 'depth-estimation' | 'image-segmentation' | 'zero-shot-image-classification' | 'image-feature-extraction' | 'text-classification' | 'zero-shot-classification' | 'token-classification' | 'feature-extraction'
export interface VModel { id: string; task: VTask; label: string; size: string; dtype?: Partial<Record<'wasm' | 'webgpu', string>>; note?: string }

const q8 = { wasm: 'q8', webgpu: 'fp32' }
export const VMODELS = {
  caption: { id: 'Xenova/vit-gpt2-image-captioning', task: 'image-to-text', label: 'ViT-GPT2 captioner', size: 'about 240 MB', dtype: q8 },
  detect: { id: 'Xenova/yolos-tiny', task: 'object-detection', label: 'YOLOS tiny (80 everyday objects)', size: 'about 10 MB', dtype: q8 },
  depth: { id: 'onnx-community/depth-anything-v2-small', task: 'depth-estimation', label: 'Depth Anything V2 small', size: 'about 27 MB', dtype: q8 },
  segment: { id: 'Xenova/segformer-b0-finetuned-ade-512-512', task: 'image-segmentation', label: 'SegFormer B0 (150 scene classes)', size: 'about 4 MB', dtype: q8 },
  clip: { id: 'Xenova/clip-vit-base-patch32', task: 'zero-shot-image-classification', label: 'CLIP ViT-B/32', size: 'about 150 MB', dtype: q8 },
  clipEmbed: { id: 'Xenova/clip-vit-base-patch32', task: 'image-feature-extraction', label: 'CLIP ViT-B/32 image embeddings', size: 'about 90 MB', dtype: q8 },
  sentiment: { id: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english', task: 'text-classification', label: 'DistilBERT SST-2 (English)', size: 'about 66 MB', dtype: q8 },
  zeroShot: { id: 'Xenova/mobilebert-uncased-mnli', task: 'zero-shot-classification', label: 'MobileBERT MNLI', size: 'about 27 MB', dtype: q8 },
  ner: { id: 'Xenova/bert-base-NER', task: 'token-classification', label: 'BERT NER (people, places, organisations)', size: 'about 105 MB', dtype: q8 },
  embed: { id: 'Xenova/all-MiniLM-L6-v2', task: 'feature-extraction', label: 'MiniLM sentence embeddings', size: 'about 25 MB', dtype: q8 },
} satisfies Record<string, VModel>

export interface VCallbacks { onLoad?: (loaded: number, total: number) => void; onStatus?: (s: string) => void; onReady?: () => void; onProgress?: (done: number, total: number, partial?: string) => void }

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void; cb: VCallbacks }>()
function w() {
  if (!worker) {
    worker = new Worker(new URL('./vision.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      const m = e.data, p = pending.get(m.id); if (!p) return
      if (m.type === 'load') p.cb.onLoad?.(m.loaded, m.total)
      else if (m.type === 'status') p.cb.onStatus?.(m.text)
      else if (m.type === 'ready') p.cb.onReady?.()
      else if (m.type === 'progress') p.cb.onProgress?.(m.done, m.total, m.partial)
      else if (m.type === 'done') { pending.delete(m.id); p.resolve(m.result) }
      else if (m.type === 'error') { pending.delete(m.id); p.reject(new Error(friendlyAiError(m.message))) }
    }
    worker.onerror = (e) => { const err = new Error(friendlyAiError(e.message || 'crashed')); pending.forEach((p) => p.reject(err)); pending.clear(); worker?.terminate(); worker = null }
  }
  return worker
}

export function cancelVision() {
  worker?.terminate(); worker = null
  pending.forEach((p) => p.reject(Object.assign(new Error('Cancelled'), { name: 'CancelledError' })))
  pending.clear()
}

export function visionRun<T = any>(model: VModel, device: 'wasm' | 'webgpu', input: any, options: any = {}, cb: VCallbacks = {}): Promise<T> {
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, cb })
    w().postMessage({ id, task: model.task, model: model.id, device, dtype: model.dtype?.[device], input, options })
  })
}
