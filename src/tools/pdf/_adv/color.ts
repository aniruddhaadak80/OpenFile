/* colour helpers for jsPDF renderers */
export function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
/** mix colour with white (t=0 → colour, 1 → white) */
export function tint(hex: string, t: number): [number, number, number] {
  const [r, g, b] = hexRgb(hex)
  return [Math.round(r + (255 - r) * t), Math.round(g + (255 - g) * t), Math.round(b + (255 - b) * t)]
}
