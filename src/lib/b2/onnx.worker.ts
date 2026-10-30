/// <reference lib="webworker" />
/* Runs the Batch 2 ONNX image models (LaMa, DDColor) off the main thread. Without cross-origin isolation ONNX Runtime
   Web gets one thread and runs synchronously, which froze the page for minutes on a CPU; in a worker the page stays
   responsive and Cancel can stop the job by ending the worker. */
import wasmUrl from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url'
import mjsUrl from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url'
import { fetchModel } from './onnxfetch'

const post = (m: any, t?: Transferable[]) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, t ?? [])
let ortP: Promise<any> | null = null
const ortLoad = () => {
  if (!ortP) ortP = import('onnxruntime-web/webgpu').then((ort: any) => { ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl }; ort.env.wasm.numThreads = 1; return ort })
  return ortP
}
const sessions = new Map<string, { session: any; backend: string }>()

export interface FeedIn { name?: string; type: 'float32'; data: Float32Array; dims: number[] }

self.onmessage = async (ev: MessageEvent) => {
  const { id, url, feeds } = ev.data as { id: number; url: string; feeds: FeedIn[] }
  try {
    const ort = await ortLoad()
    let s = sessions.get(url)
    if (!s) {
      let last = 0
      const bytes = await fetchModel(url, (loaded, total) => { const now = Date.now(); if (now - last < 200 && loaded < total) return; last = now; post({ id, type: 'load', loaded, total }) })
      post({ id, type: 'status', text: 'Preparing the model. On a CPU this can take a minute.' })
      const adapter = await (navigator as any).gpu?.requestAdapter().catch(() => null)
      const tries: string[] = adapter ? ['webgpu', 'wasm'] : ['wasm']
      let err: any
      for (const ep of tries) {
        try { s = { session: await ort.InferenceSession.create(bytes, { executionProviders: [ep], graphOptimizationLevel: 'all' }), backend: ep }; break } catch (e) { err = e }
      }
      if (!s) throw new Error('This device could not run the AI model: ' + (err?.message || err))
      sessions.set(url, s)
    }
    post({ id, type: 'ready', backend: s.backend })
    const input: Record<string, any> = {}
    feeds.forEach((f, i) => { input[f.name ?? s!.session.inputNames[i]] = new ort.Tensor(f.type, f.data, f.dims) })
    const out = await s.session.run(input)
    const outputs: Record<string, { data: Float32Array; dims: number[] }> = {}
    const bufs: Transferable[] = []
    for (const n of s.session.outputNames as string[]) { const t = out[n]; const data = Float32Array.from(t.data as Float32Array); outputs[n] = { data, dims: [...t.dims] }; bufs.push(data.buffer) }
    post({ id, type: 'done', outputs, names: s.session.outputNames }, bufs)
  } catch (e: any) {
    post({ id, type: 'error', message: e?.message || String(e) })
  }
}
