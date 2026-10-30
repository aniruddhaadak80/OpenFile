/* Canvas helpers for card and thumbnail makers. */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean); let line = ''
    if (!words.length) { out.push(''); continue }
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w } else line = t }
    out.push(line)
  }
  return out
}
/** Largest font size (px) at which text fits a box. */
export function fitFont(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, maxW: number, maxH: number, lh = 1.15, hi = 220, lo = 16) {
  let best = lo
  while (lo <= hi) { const mid = (lo + hi) >> 1; ctx.font = font(mid); const lines = wrapLines(ctx, text, maxW); const h = lines.length * mid * lh; if (h <= maxH && lines.every((l) => ctx.measureText(l).width <= maxW)) { best = mid; lo = mid + 1 } else hi = mid - 1 }
  ctx.font = font(best)
  return { size: best, lines: wrapLines(ctx, text, maxW) }
}
/** Draw an image to cover a rect, with zoom (1 = cover) and focus (0..1). */
export function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, w: number, h: number, zoom = 1, fx = 0.5, fy = 0.5) {
  const a = img as any, iw = a.videoWidth || a.naturalWidth || a.width, ih = a.videoHeight || a.naturalHeight || a.height
  if (!iw || !ih) return
  const s = Math.max(w / iw, h / ih) * zoom
  const dw = iw * s, dh = ih * s
  ctx.drawImage(img, x + (w - dw) * fx, y + (h - dh) * fy, dw, dh)
}
export async function fileToBitmap(f: Blob) { return await createImageBitmap(f) }
export function canvasBlob(c: HTMLCanvasElement, type = 'image/png', q = 0.92): Promise<Blob> { return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not export the image.'))), type, q)) }
export const FONTS = [
  { value: 'Inter, Arial, sans-serif', label: 'Clean sans' },
  { value: '"Space Grotesk", Inter, Arial, sans-serif', label: 'Grotesk' },
  { value: 'Impact, "Arial Black", sans-serif', label: 'Impact' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Serif' },
  { value: '"JetBrains Mono", Consolas, monospace', label: 'Mono' },
  { value: '"Comic Sans MS", "Chalkboard SE", cursive', label: 'Hand' },
]
