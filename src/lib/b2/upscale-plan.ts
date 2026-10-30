/* Pure helpers for the Photo Enhancer's AI 2x upscale: which model to run, how many tiles that is, a time estimate
   and plain-words error messages. Kept free of DOM and Worker code so it can be unit tested in Node. */

export const UP_TILE = 192
export const UP_PAD = 12
/** Full Swin2SR (same as the Image Upscaler). Best quality, used when a GPU adapter is available. */
export const MODEL_GPU = 'Xenova/swin2SR-classical-sr-x2-64'
/** Lightweight Swin2SR. About 3.5x faster on WebAssembly (measured: 23 to 32 s against about 90 s per 216 px tile on a
    slow 2-core ARM CPU), so it is the default when the model has to run on the CPU. */
export const MODEL_CPU = 'Xenova/swin2SR-lightweight-x2-64'

/** Seconds per tile, a fast laptop CPU to a slow one (lightweight model), and on a GPU. Used for the up-front range only;
    once tiles finish, the real rate is measured. */
const SEC_PER_TILE = { cpu: [6, 30] as const, gpu: [0.5, 2] as const }

export const tileCount = (w: number, h: number, tile = UP_TILE) => Math.ceil(w / tile) * Math.ceil(h / tile)

export function fmtDuration(s: number) {
  if (s < 55) return `${Math.max(5, Math.round(s / 5) * 5)} seconds`
  const m = Math.round(s / 60)
  return m === 1 ? 'about a minute' : `${m} minutes`
}

/** Up-front estimate, for example "12 tiles, roughly 1 to 6 minutes on this device's CPU". */
export function estimateText(w: number, h: number, gpu: boolean) {
  const n = tileCount(w, h)
  const [lo, hi] = gpu ? SEC_PER_TILE.gpu : SEC_PER_TILE.cpu
  const a = n * lo, b = n * hi
  const lm = Math.max(1, Math.round(a / 60)), hm = Math.max(1, Math.round(b / 60))
  const span = b < 60 ? 'under a minute' : lm === hm ? `about ${hm} minute${hm === 1 ? '' : 's'}` : `roughly ${lm} to ${hm} minutes`
  return `${n} tile${n === 1 ? '' : 's'}, ${span} on ${gpu ? 'the GPU' : "this device's CPU"}`
}

/** Remaining time from the measured rate so far. Returns '' until at least one tile is done. */
export function remainingText(done: number, total: number, elapsedMs: number) {
  if (done < 1 || done >= total) return ''
  const left = ((elapsedMs / 1000) / done) * (total - done)
  return `about ${fmtDuration(left).replace(/^about /, '')} left`
}

/** Turns a raw model, worker or ONNX Runtime error into a sentence a person can act on. */
export function friendlyUpscaleError(raw: unknown) {
  const m = String((raw as any)?.message ?? raw ?? '')
  if (/memory|allocat|out of range|RangeError|bad_alloc/i.test(m)) return 'The browser ran out of memory while upscaling. Turn off AI upscale or use a smaller photo.'
  if (/fetch|network|load failed|404|403|Failed to download|ERR_/i.test(m)) return 'The AI upscaler model could not be downloaded. Check your connection and try again, or turn off AI upscale.'
  if (/backend|wasm|webassembly|WebGPU|session/i.test(m)) return 'This browser could not start the AI upscaler. Turn off AI upscale to save the enhanced photo at its current size.'
  return 'The AI upscaler stopped with an error. Turn off AI upscale to save the enhanced photo at its current size.' + (m ? ` (Details: ${m.slice(0, 160)})` : '')
}
