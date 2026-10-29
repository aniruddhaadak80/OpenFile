/* Client for the on-device AI worker plus model catalogue and text helpers. */
export type AiTask = 'translation' | 'summarization' | 'text-generation' | 'feature-extraction'
export interface ModelInfo {
  id: string; label: string; size: string; dtype?: Partial<Record<'wasm' | 'webgpu', string>>; note?: string
  /** Picked by default when there is no WebGPU: small enough that download plus load stays well inside a tab's memory on the CPU. */
  cpuDefault?: boolean
}

export const MODELS = {
  translate: [{ id: 'Xenova/nllb-200-distilled-600M', label: 'NLLB-200 (200 languages)', size: 'about 900 MB', dtype: { wasm: 'q8', webgpu: 'q8' }, note: 'Meta NLLB, CC-BY-NC 4.0 weights: free for personal, non-commercial use.' }],
  summarize: [{ id: 'Xenova/distilbart-cnn-6-6', label: 'DistilBART (fast summary)', size: 'about 300 MB', dtype: { wasm: 'q8', webgpu: 'fp32' } }],
  chat: [
    // wasm uses q8 (488 MB): Qwen's q4 file keeps the embeddings in fp32 and is 749 MB, which crashed CPU-only tabs while loading
    { id: 'onnx-community/Qwen2.5-0.5B-Instruct', label: 'Qwen2.5 0.5B (better answers)', size: 'about 500 MB', dtype: { wasm: 'q8', webgpu: 'q4f16' } },
    { id: 'HuggingFaceTB/SmolLM2-135M-Instruct', label: 'SmolLM2 135M (lightest, best without a GPU)', size: 'about 130 MB', dtype: { wasm: 'q8', webgpu: 'fp16' }, cpuDefault: true, note: 'Short, simple answers. Pick Qwen2.5 for better ones if your device has the memory.' },
    { id: 'onnx-community/Qwen2.5-1.5B-Instruct', label: 'Qwen2.5 1.5B (smarter, needs WebGPU)', size: 'about 1.3 GB', dtype: { wasm: 'q4', webgpu: 'q4f16' } },
  ],
  embed: [{ id: 'Xenova/all-MiniLM-L6-v2', label: 'MiniLM embeddings', size: 'about 25 MB', dtype: { wasm: 'q8', webgpu: 'fp32' } }],
} satisfies Record<string, ModelInfo[]>

export async function hasWebGPU(): Promise<boolean> {
  try { const g = (navigator as any).gpu; return !!(g && (await g.requestAdapter())) } catch { return false }
}

export interface AiCallbacks { onLoad?: (loaded: number, total: number) => void; onStatus?: (s: string) => void; onReady?: () => void; onToken?: (t: string) => void; onProgress?: (done: number, total: number, partial?: string) => void }

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void; cb: AiCallbacks }>()
function w() {
  if (!worker) {
    worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      const m = e.data, p = pending.get(m.id); if (!p) return
      if (m.type === 'load') p.cb.onLoad?.(m.loaded, m.total)
      else if (m.type === 'status') p.cb.onStatus?.(m.text)
      else if (m.type === 'ready') p.cb.onReady?.()
      else if (m.type === 'token') p.cb.onToken?.(m.text)
      else if (m.type === 'progress') p.cb.onProgress?.(m.done, m.total, m.partial)
      else if (m.type === 'done') { pending.delete(m.id); p.resolve(m.result) }
      else if (m.type === 'error') { pending.delete(m.id); p.reject(new Error(friendlyAiError(m.message))) }
    }
    worker.onerror = (e) => { const err = new Error(friendlyAiError(e.message || 'crashed')); pending.forEach((p) => p.reject(err)); pending.clear(); worker?.terminate(); worker = null }
  }
  return worker
}
export function friendlyAiError(m: string) {
  if (/out of memory|memory|allocation|bad_alloc/i.test(m)) return 'The browser ran out of memory while running the AI model. Close other tabs, or pick the smaller model.'
  if (/fetch|network|Failed to load|404/i.test(m)) return 'The AI model could not be downloaded. Check your connection and try again.'
  if (/webgpu|adapter/i.test(m)) return 'WebGPU failed on this device. Turn off GPU and try again.'
  return 'The AI model failed: ' + m.slice(0, 200)
}
export function cancelAi() { worker?.terminate(); worker = null; pending.forEach((p) => p.reject(Object.assign(new Error('Cancelled'), { name: 'CancelledError' }))); pending.clear() }

export function aiRun<T = any>(task: AiTask, model: ModelInfo, device: 'wasm' | 'webgpu', input: any, options: any = {}, cb: AiCallbacks = {}): Promise<T> {
  const id = ++seq
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, cb }); w().postMessage({ id, task, model: model.id, device, dtype: model.dtype?.[device], input, options }) })
}

/** Split text into chunks of about `size` characters at paragraph or sentence breaks. Pure, unit tested. */
export function chunkText(text: string, size = 1800, overlap = 0): string[] {
  const paras = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const pieces: string[] = []
  for (const p of paras) {
    if (p.length <= size) { pieces.push(p); continue }
    const sents = p.match(/[^.!?。！？]+[.!?。！？]+["')\]]*\s*|[^.!?。！？]+$/g) ?? [p]
    let buf = ''
    for (const s of sents) { if ((buf + s).length > size && buf) { pieces.push(buf.trim()); buf = '' } buf += s }
    if (buf.trim()) pieces.push(buf.trim())
  }
  const out: string[] = []
  let cur = ''
  for (const p of pieces) {
    if ((cur + '\n\n' + p).length > size && cur) { out.push(cur); cur = overlap ? cur.slice(-overlap) + '\n\n' + p : p }
    else cur = cur ? cur + '\n\n' + p : p
  }
  if (cur) out.push(cur)
  return out
}

export const cosine = (a: number[], b: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s }

/** Pull the first JSON array or object out of model output. Pure, unit tested. */
export function extractJson(s: string): any {
  const clean = s.replace(/```(?:json)?/g, '')
  for (const [o, c] of [['[', ']'], ['{', '}']] as const) {
    const a = clean.indexOf(o), b = clean.lastIndexOf(c)
    if (a >= 0 && b > a) { try { return JSON.parse(clean.slice(a, b + 1)) } catch { /* try next */ } }
  }
  return null
}

/** NLLB-200 language codes (common subset). */
export const NLLB_LANGS: { code: string; name: string }[] = [
  ['eng_Latn', 'English'], ['spa_Latn', 'Spanish'], ['fra_Latn', 'French'], ['deu_Latn', 'German'], ['ita_Latn', 'Italian'], ['por_Latn', 'Portuguese'], ['nld_Latn', 'Dutch'], ['pol_Latn', 'Polish'],
  ['rus_Cyrl', 'Russian'], ['ukr_Cyrl', 'Ukrainian'], ['ces_Latn', 'Czech'], ['ron_Latn', 'Romanian'], ['hun_Latn', 'Hungarian'], ['ell_Grek', 'Greek'], ['tur_Latn', 'Turkish'], ['swe_Latn', 'Swedish'],
  ['dan_Latn', 'Danish'], ['fin_Latn', 'Finnish'], ['nob_Latn', 'Norwegian'], ['arb_Arab', 'Arabic'], ['heb_Hebr', 'Hebrew'], ['pes_Arab', 'Persian'], ['hin_Deva', 'Hindi'], ['ben_Beng', 'Bengali'],
  ['urd_Arab', 'Urdu'], ['tam_Taml', 'Tamil'], ['tel_Telu', 'Telugu'], ['mar_Deva', 'Marathi'], ['guj_Gujr', 'Gujarati'], ['kan_Knda', 'Kannada'], ['mal_Mlym', 'Malayalam'], ['pan_Guru', 'Punjabi'],
  ['zho_Hans', 'Chinese (Simplified)'], ['zho_Hant', 'Chinese (Traditional)'], ['jpn_Jpan', 'Japanese'], ['kor_Hang', 'Korean'], ['vie_Latn', 'Vietnamese'], ['tha_Thai', 'Thai'], ['ind_Latn', 'Indonesian'], ['zsm_Latn', 'Malay'],
  ['tgl_Latn', 'Tagalog'], ['swh_Latn', 'Swahili'], ['amh_Ethi', 'Amharic'], ['hau_Latn', 'Hausa'], ['yor_Latn', 'Yoruba'], ['zul_Latn', 'Zulu'], ['afr_Latn', 'Afrikaans'], ['cat_Latn', 'Catalan'],
  ['bul_Cyrl', 'Bulgarian'], ['hrv_Latn', 'Croatian'], ['srp_Cyrl', 'Serbian'], ['slk_Latn', 'Slovak'], ['slv_Latn', 'Slovenian'], ['lit_Latn', 'Lithuanian'], ['lvs_Latn', 'Latvian'], ['est_Latn', 'Estonian'],
].map(([code, name]) => ({ code, name }))
