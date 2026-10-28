import { zipSync, strToU8 } from 'fflate'
import { getPrefs } from './prefs'

export function formatBytes(bytes: number, decimals = 1) {
  if (!Number.isFinite(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  const k = 1024, sizes = ['KB', 'MB', 'GB', 'TB']
  let i = -1, v = bytes
  do { v /= k; i++ } while (v >= k && i < sizes.length - 1)
  return `${v.toFixed(decimals)} ${sizes[i]}`
}

/** Hooks installed by lib/store: apply the user's output-naming pattern and log downloads to local History. */
type DownloadHooks = { rename?: (filename: string) => string; after?: (filename: string, size?: number) => void }
let hooks: DownloadHooks = {}
export function setDownloadHooks(h: DownloadHooks) { hooks = h }
const finalName = (filename: string) => { try { return hooks.rename ? hooks.rename(filename) : filename } catch { return filename } }

export function downloadBlob(data: Blob | Uint8Array | ArrayBuffer | string, filename: string, mime = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: mime })
  const name = finalName(filename)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  try { hooks.after?.(name, blob.size) } catch { /* ignore */ }
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const name = finalName(filename)
  const a = document.createElement('a'); a.href = dataUrl; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  try { hooks.after?.(name) } catch { /* ignore */ }
}

/** change/append extension: renameExt('a.png','webp') => 'a.webp' */
export function renameExt(name: string, ext: string, suffix = '') {
  const base = name.replace(/\.[^.]+$/, '')
  return `${base}${suffix}.${ext.replace(/^\./, '')}`
}
export const baseName = (name: string) => name.replace(/\.[^.]+$/, '')

export async function zipFiles(files: { name: string; data: Blob | Uint8Array | string }[]): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {}
  const used = new Set<string>()
  for (const f of files) {
    let n = f.name, i = 1
    while (used.has(n)) n = f.name.replace(/(\.[^.]+)?$/, (m) => `-${i++}${m}`)
    used.add(n)
    entries[n] = typeof f.data === 'string' ? strToU8(f.data) : f.data instanceof Blob ? new Uint8Array(await f.data.arrayBuffer()) : f.data
  }
  return new Blob([zipSync(entries, { level: 6 }) as BlobPart], { type: 'application/zip' })
}

export const readArrayBuffer = (file: Blob) => file.arrayBuffer()
export const readText = (file: Blob) => file.text()
export function readDataUrl(file: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file) })
}

export function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    const url = typeof src === 'string' ? src : URL.createObjectURL(src)
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = () => rej(new Error('Could not load image'))
    img.src = url
  })
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  // When a tool does not pass a quality, use the user's default image quality from Settings (lossy formats only).
  const q = quality ?? (/jpe?g|webp|avif/.test(type) ? getPrefs().imageQuality / 100 : undefined)
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Canvas export failed (format may be unsupported in this browser)'))), type, q))
}

export function createCanvas(w: number, h: number) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h))
  const ctx = c.getContext('2d')!
  return { canvas: c, ctx }
}

export const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', bmp: 'image/bmp',
  pdf: 'application/pdf', zip: 'application/zip', json: 'application/json', txt: 'text/plain', csv: 'text/csv', svg: 'image/svg+xml',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav',
}

export function parsePageRanges(input: string, total: number): number[] {
  // "1-3, 5, 8-" -> zero-based indices, deduped, in order
  const out: number[] = []
  for (const part of input.split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/)
    if (m) {
      const a = m[1] ? parseInt(m[1]) : 1, b = m[2] ? parseInt(m[2]) : total
      for (let i = Math.max(1, a); i <= Math.min(total, b); i++) out.push(i - 1)
    } else if (/^\d+$/.test(part)) {
      const n = parseInt(part); if (n >= 1 && n <= total) out.push(n - 1)
    }
  }
  return [...new Set(out)]
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}
