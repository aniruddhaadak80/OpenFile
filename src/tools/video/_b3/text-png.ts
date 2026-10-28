/* Render text, emoji and drawings to transparent PNGs at the video's size, so ffmpeg can overlay
 * them. Using the browser's text engine gives every font and emoji without shipping font files. */
import { ensureFont } from '@/tools/image/_img/kit'

export interface TextItem { text: string; font: string; size: number; color: string; stroke: string; strokeW: number; box: boolean; boxColor: string; x: number; y: number; bold: boolean; align?: CanvasTextAlign }

export async function drawText(ctx: CanvasRenderingContext2D, t: TextItem, W: number, H: number) {
  await ensureFont(t.font).catch(() => {})
  ctx.font = `${t.bold ? 'bold ' : ''}${t.size}px "${t.font}", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`
  ctx.textAlign = t.align ?? 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'
  const lines = t.text.split('\n')
  const lh = t.size * 1.2
  const cx = (t.x / 100) * W, cy = (t.y / 100) * H - ((lines.length - 1) * lh) / 2
  if (t.box) {
    const wMax = Math.max(...lines.map((l) => ctx.measureText(l).width))
    const pad = t.size * 0.35
    const left = ctx.textAlign === 'center' ? cx - wMax / 2 : ctx.textAlign === 'right' ? cx - wMax : cx
    ctx.fillStyle = t.boxColor
    ctx.beginPath(); (ctx as any).roundRect?.(left - pad, cy - lh / 2 - pad / 2, wMax + pad * 2, lh * lines.length + pad, pad / 1.5) ?? ctx.rect(left - pad, cy - lh / 2 - pad / 2, wMax + pad * 2, lh * lines.length + pad); ctx.fill()
  }
  lines.forEach((ln, i) => {
    const y = cy + i * lh
    if (t.strokeW > 0) { ctx.strokeStyle = t.stroke; ctx.lineWidth = t.strokeW * 2; ctx.strokeText(ln, cx, y) }
    ctx.fillStyle = t.color; ctx.fillText(ln, cx, y)
  })
}

export function canvasPng(c: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((res, rej) => c.toBlob(async (b) => (b ? res(new Uint8Array(await b.arrayBuffer())) : rej(new Error('Could not render the overlay.'))), 'image/png'))
}

export async function renderPng(W: number, H: number, draw: (ctx: CanvasRenderingContext2D) => void | Promise<void>): Promise<Uint8Array> {
  const c = document.createElement('canvas'); c.width = Math.max(2, W); c.height = Math.max(2, H)
  const ctx = c.getContext('2d')!
  await draw(ctx)
  return canvasPng(c)
}

export const FONTS = ['Inter', 'Arial', 'Impact', 'Georgia', 'Montserrat', 'Poppins', 'Bebas Neue', 'Oswald', 'Anton', 'Permanent Marker', 'Pacifico', 'JetBrains Mono']
