/* Pixel helpers (pure, testable): blank detection and colour adjustments on RGBA buffers. */

/** Share of pixels darker than the threshold, ignoring a thin border (scanner edges, punch holes). */
export function inkRatio(data: Uint8ClampedArray | Uint8Array, w: number, h: number, threshold = 225, border = 0.04) {
  const bx = Math.floor(w * border), by = Math.floor(h * border)
  let dark = 0, total = 0
  for (let y = by; y < h - by; y++) for (let x = bx; x < w - bx; x++) {
    const i = (y * w + x) * 4
    const l = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    total++; if (l < threshold) dark++
  }
  return total ? dark / total : 0
}

export interface ColorOpts {
  mode: 'none' | 'invert' | 'dark' | 'grayscale' | 'sepia' | 'bw'
  brightness: number // -100..100
  contrast: number // -100..100
  saturation: number // -100..100
  threshold: number // for bw, 0..255
  replace?: { from: [number, number, number]; to: [number, number, number]; tolerance: number }[]
  paper?: [number, number, number] // dark mode background tint
}

export const hexRgb = (h: string): [number, number, number] => { const m = h.replace('#', ''); const v = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255] }

/** Apply colour adjustments in place. */
export function adjustPixels(a: Uint8ClampedArray | Uint8Array, o: ColorOpts) {
  const br = o.brightness * 2.55
  const c = o.contrast >= 0 ? 1 + o.contrast / 50 : 1 + o.contrast / 100
  const sat = 1 + o.saturation / 100
  const reps = (o.replace ?? []).map((r) => ({ ...r, tol2: (r.tolerance * 4.42) ** 2 }))
  const paper = o.paper ?? [24, 24, 27]
  for (let i = 0; i < a.length; i += 4) {
    let r = a[i], g = a[i + 1], b = a[i + 2]
    for (const rp of reps) {
      const dr = r - rp.from[0], dg = g - rp.from[1], db = b - rp.from[2]
      if (dr * dr + dg * dg + db * db <= rp.tol2) { r = rp.to[0]; g = rp.to[1]; b = rp.to[2]; break }
    }
    switch (o.mode) {
      case 'invert': r = 255 - r; g = 255 - g; b = 255 - b; break
      case 'dark': {
        // smart invert: flip lightness, keep hue (invert, then rotate hue by 180 degrees); lift black to a soft paper tint
        const [h, s2, l] = rgbToHsl(255 - r, 255 - g, 255 - b)
        const [nr, ng, nb] = hslToRgb((h + 0.5) % 1, s2, l)
        r = Math.max(paper[0] * (1 - l), nr); g = Math.max(paper[1] * (1 - l), ng); b = Math.max(paper[2] * (1 - l), nb)
        break
      }
      case 'grayscale': { const y = r * 0.299 + g * 0.587 + b * 0.114; r = g = b = y; break }
      case 'sepia': { const nr = r * 0.393 + g * 0.769 + b * 0.189, ng = r * 0.349 + g * 0.686 + b * 0.168, nb = r * 0.272 + g * 0.534 + b * 0.131; r = nr; g = ng; b = nb; break }
      case 'bw': { const y = r * 0.299 + g * 0.587 + b * 0.114; r = g = b = y < o.threshold ? 0 : 255; break }
    }
    if (sat !== 1 && o.mode !== 'grayscale' && o.mode !== 'bw') { const y = r * 0.299 + g * 0.587 + b * 0.114; r = y + (r - y) * sat; g = y + (g - y) * sat; b = y + (b - y) * sat }
    if (c !== 1) { r = (r - 128) * c + 128; g = (g - 128) * c + 128; b = (b - 128) * c + 128 }
    if (br) { r += br; g += br; b += br }
    a[i] = r < 0 ? 0 : r > 255 ? 255 : r; a[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g; a[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b
  }
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b); const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min; const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (!s) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
  const f = (t: number) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p }
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]
}
