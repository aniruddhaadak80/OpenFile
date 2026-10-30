/* AI 2x upscale with the same Swin2SR model the Image Upscaler uses (so it is downloaded and cached once).
   Runs in overlapping tiles for memory safety and real progress. */
const MODEL = 'Xenova/swin2SR-classical-sr-x2-64'
let upP: Promise<{ up: any; device: string }> | null = null

export function getUpscaler(onDownload?: (loaded: number, total: number) => void) {
  if (!upP) {
    upP = (async () => {
      const { pipeline } = await import('@huggingface/transformers')
      const files: Record<string, { loaded: number; total: number }> = {}
      const cb = (e: any) => {
        if (e.status === 'progress' && e.file) {
          files[e.file] = { loaded: e.loaded ?? 0, total: e.total ?? 0 }
          const l = Object.values(files).reduce((a, f) => a + f.loaded, 0), t = Object.values(files).reduce((a, f) => a + f.total, 0)
          onDownload?.(l, t)
        }
      }
      // navigator.gpu can exist with no usable adapter (headless or blocklisted GPUs); trying WebGPU then downloads the
      // model, fails with "no available backend" and downloads again for WASM, so ask for an adapter first
      const adapter = await (navigator as any).gpu?.requestAdapter().catch(() => null)
      const devices = adapter ? ['webgpu', 'wasm'] : ['wasm']
      let last: unknown
      for (const device of devices) {
        try { return { up: await pipeline('image-to-image', MODEL, { device: device as any, progress_callback: cb } as any), device } }
        catch (e) { last = e }
      }
      throw last
    })()
    upP.catch(() => { upP = null })
  }
  return upP
}

export async function upscale2x(src: HTMLCanvasElement, onProgress: (stage: string, p: number) => void): Promise<HTMLCanvasElement> {
  const { up, device } = await getUpscaler((l, t) => onProgress(`Downloading upscaler (first run only) ${(l / 1048576).toFixed(1)} / ${(t / 1048576).toFixed(1)} MB`, t ? (l / t) * 0.3 : 0))
  const { RawImage } = await import('@huggingface/transformers')
  const T = 192, P = 12, W = src.width, H = src.height
  const out = document.createElement('canvas'); out.width = W * 2; out.height = H * 2
  const ctx = out.getContext('2d')!
  const cols = Math.ceil(W / T), rows = Math.ceil(H / T), total = cols * rows
  let n = 0
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const x = tx * T, y = ty * T, w = Math.min(T, W - x), h = Math.min(T, H - y)
    const px = Math.max(0, x - P), py = Math.max(0, y - P)
    const pw = Math.min(W, x + w + P) - px, ph = Math.min(H, y + h + P) - py
    const tile = document.createElement('canvas'); tile.width = pw; tile.height = ph
    tile.getContext('2d')!.drawImage(src, px, py, pw, ph, 0, 0, pw, ph)
    const res = await up(RawImage.fromCanvas(tile).rgb())
    const img = Array.isArray(res) ? res[0] : res
    ctx.drawImage(img.toCanvas(), (x - px) * 2, (y - py) * 2, w * 2, h * 2, x * 2, y * 2, w * 2, h * 2)
    onProgress(`Upscaling tile ${++n} of ${total} (${device === 'webgpu' ? 'GPU' : 'CPU'})`, 0.3 + (n / total) * 0.7)
    await new Promise((r) => setTimeout(r, 0))
  }
  return out
}
