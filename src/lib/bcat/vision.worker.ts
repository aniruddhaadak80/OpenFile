/// <reference lib="webworker" />
/* On-device vision and text AI (Transformers.js, Apache-2.0) for the Local AI tools.
 * Everything runs in this worker so the page never freezes. Images arrive as Blobs and are
 * downscaled here with OffscreenCanvas before they reach the model. Models download once and are cached. */
import { pipeline, env, RawImage } from '@huggingface/transformers'

env.allowLocalModels = false
const post = (m: any, t?: Transferable[]) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, t ?? [])
const cache = new Map<string, any>()

async function get(task: string, model: string, device: string, dtype: string | undefined, id: number) {
  const key = `${task}|${model}|${device}|${dtype}`
  if (cache.has(key)) return cache.get(key)
  // keep memory low: one pipeline per task
  for (const [k, p] of cache) if (k.startsWith(task + '|')) { try { await p.dispose?.() } catch { /* ignore */ } cache.delete(k) }
  const files = new Map<string, { loaded: number; total: number }>()
  post({ id, type: 'status', text: 'Getting the AI model ready' })
  const p = await pipeline(task as any, model, {
    device: device as any, dtype: dtype as any,
    progress_callback: (e: any) => {
      if (e.status === 'progress' && e.file) {
        files.set(e.file, { loaded: e.loaded ?? 0, total: e.total ?? 0 })
        let l = 0, t = 0; files.forEach((f) => { l += f.loaded; t += f.total })
        post({ id, type: 'load', loaded: l, total: t })
      } else if (e.status === 'initiate') post({ id, type: 'status', text: `Downloading ${String(e.file).split('/').pop()}` })
    },
  })
  cache.set(key, p)
  return p
}

async function toRaw(blob: Blob, max: number) {
  const bmp = await createImageBitmap(blob)
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s))
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d')!
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const d = ctx.getImageData(0, 0, w, h)
  return new RawImage(d.data, w, h, 4).rgb()
}

const norm = (v: Float32Array | number[]) => { let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s) || 1; return Array.from(v, (x) => x / s) }

self.onmessage = async (ev: MessageEvent) => {
  const { id, task, model, device, dtype, input, options = {} } = ev.data
  try {
    const p = await get(task, model, device, dtype, id)
    post({ id, type: 'ready' })
    const maxSide = options.maxSide ?? 640

    if (task === 'image-to-text') {
      const blobs: Blob[] = input, out: string[] = []
      for (let i = 0; i < blobs.length; i++) {
        const img = await toRaw(blobs[i], maxSide)
        const r: any = await p(img, { max_new_tokens: options.max ?? 30, num_beams: options.beams ?? 1 })
        out.push(String((Array.isArray(r) ? r[0] : r).generated_text || '').trim())
        post({ id, type: 'progress', done: i + 1, total: blobs.length, partial: out[i] })
      }
      post({ id, type: 'done', result: out }); return
    }
    if (task === 'object-detection') {
      const img = await toRaw(input, maxSide)
      const r: any[] = await p(img, { threshold: options.threshold ?? 0.5, percentage: true })
      post({ id, type: 'done', result: r.map((b) => ({ label: b.label, score: b.score, box: b.box })) }); return
    }
    if (task === 'depth-estimation') {
      const img = await toRaw(input, maxSide)
      const r: any = await p(img)
      const d: RawImage = (Array.isArray(r) ? r[0] : r).depth
      const g = new Uint8ClampedArray(d.data)
      post({ id, type: 'done', result: { width: d.width, height: d.height, data: g } }, [g.buffer]); return
    }
    if (task === 'image-segmentation') {
      const img = await toRaw(input, maxSide)
      const r: any[] = await p(img)
      const segs = r.map((s) => ({ label: s.label, score: s.score, width: s.mask.width, height: s.mask.height, mask: new Uint8Array(s.mask.data) }))
      post({ id, type: 'done', result: segs }, segs.map((s) => s.mask.buffer)); return
    }
    if (task === 'zero-shot-image-classification') {
      const blobs: Blob[] = input, out: any[] = []
      for (let i = 0; i < blobs.length; i++) {
        const img = await toRaw(blobs[i], 448)
        out.push(await p(img, options.labels, { hypothesis_template: options.template ?? 'a photo of {}' }))
        post({ id, type: 'progress', done: i + 1, total: blobs.length })
      }
      post({ id, type: 'done', result: out }); return
    }
    if (task === 'image-feature-extraction') {
      const blobs: Blob[] = input, out: number[][] = []
      for (let i = 0; i < blobs.length; i++) {
        try { const img = await toRaw(blobs[i], 448); const t: any = await p(img); out.push(norm(t.data)) } catch { out.push([]) }
        post({ id, type: 'progress', done: i + 1, total: blobs.length })
      }
      post({ id, type: 'done', result: out }); return
    }
    if (task === 'text-classification') {
      const texts: string[] = input, out: any[] = []
      for (let i = 0; i < texts.length; i++) {
        const r: any = await p(texts[i].slice(0, 2000), { top_k: options.top_k ?? 2 })
        out.push(r)
        post({ id, type: 'progress', done: i + 1, total: texts.length })
      }
      post({ id, type: 'done', result: out }); return
    }
    if (task === 'zero-shot-classification') {
      const texts: string[] = input, out: any[] = []
      for (let i = 0; i < texts.length; i++) {
        out.push(await p(texts[i].slice(0, 2000), options.labels, { multi_label: !!options.multi, hypothesis_template: options.template ?? 'This text is about {}.' }))
        post({ id, type: 'progress', done: i + 1, total: texts.length })
      }
      post({ id, type: 'done', result: out }); return
    }
    if (task === 'token-classification') {
      const texts: string[] = input, out: any[] = []
      for (let i = 0; i < texts.length; i++) {
        out.push(await p(texts[i]))
        post({ id, type: 'progress', done: i + 1, total: texts.length })
      }
      post({ id, type: 'done', result: out }); return
    }
    if (task === 'feature-extraction') {
      const texts: string[] = input, vecs: number[][] = []
      const B = 16
      for (let i = 0; i < texts.length; i += B) {
        const t: any = await p(texts.slice(i, i + B), { pooling: 'mean', normalize: true })
        vecs.push(...(t.tolist() as number[][]))
        post({ id, type: 'progress', done: Math.min(texts.length, i + B), total: texts.length })
      }
      post({ id, type: 'done', result: vecs }); return
    }
    throw new Error('Unknown task ' + task)
  } catch (e: any) {
    post({ id, type: 'error', message: e?.message || String(e) })
  }
}
