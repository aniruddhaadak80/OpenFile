/* Shared color math for the design tools (no dependencies). All channels: r,g,b in 0..255, a in 0..1 */
export type RGBA = { r: number; g: number; b: number; a: number }

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const round = (v: number, d = 0) => { const p = 10 ** d; return Math.round(v * p) / p }

export const NAMED: Record<string, string> = {
  black: '000000', white: 'ffffff', red: 'ff0000', lime: '00ff00', green: '008000', blue: '0000ff', yellow: 'ffff00', cyan: '00ffff', aqua: '00ffff',
  magenta: 'ff00ff', fuchsia: 'ff00ff', silver: 'c0c0c0', gray: '808080', grey: '808080', maroon: '800000', olive: '808000', purple: '800080',
  teal: '008080', navy: '000080', orange: 'ffa500', pink: 'ffc0cb', brown: 'a52a2a', gold: 'ffd700', indigo: '4b0082', violet: 'ee82ee',
  coral: 'ff7f50', salmon: 'fa8072', tomato: 'ff6347', crimson: 'dc143c', turquoise: '40e0d0', tan: 'd2b48c', khaki: 'f0e68c', plum: 'dda0dd',
  orchid: 'da70d6', lavender: 'e6e6fa', beige: 'f5f5dc', ivory: 'fffff0', mintcream: 'f5fffa', skyblue: '87ceeb', steelblue: '4682b4',
  royalblue: '4169e1', slateblue: '6a5acd', slategray: '708090', chocolate: 'd2691e', sienna: 'a0522d', peru: 'cd853f', firebrick: 'b22222',
  darkred: '8b0000', darkgreen: '006400', darkblue: '00008b', darkorange: 'ff8c00', hotpink: 'ff69b4', deeppink: 'ff1493', limegreen: '32cd32',
  seagreen: '2e8b57', forestgreen: '228b22', midnightblue: '191970', dodgerblue: '1e90ff', deepskyblue: '00bfff', rebeccapurple: '663399',
  transparent: '00000000', lightgray: 'd3d3d3', darkgray: 'a9a9a9', whitesmoke: 'f5f5f5', gainsboro: 'dcdcdc', wheat: 'f5deb3', aquamarine: '7fffd4',
}

export function hexToRgb(hex: string): RGBA | null {
  let h = hex.trim().replace(/^#/, '')
  if (!/^[0-9a-f]+$/i.test(h)) return null
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6 && h.length !== 8) return null
  const n = parseInt(h.slice(0, 6), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 }
}
const hx = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')
export function rgbToHex({ r, g, b, a }: RGBA, alpha = false) { return '#' + hx(r) + hx(g) + hx(b) + (alpha && a < 1 ? hx(a * 255) : '') }

export function rgbToHsl({ r, g, b }: RGBA) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h *= 60
  }
  return { h, s: s * 100, l: l * 100 }
}
export function hslToRgb(h: number, s: number, l: number, a = 1): RGBA {
  h = ((h % 360) + 360) % 360; s = clamp(s / 100); l = clamp(l / 100)
  const k = (n: number) => (n + h / 30) % 12, A = s * Math.min(l, 1 - l)
  const f = (n: number) => l - A * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255, a }
}
export function rgbToHsv({ r, g, b }: RGBA) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60
  return { h, s: max ? (d / max) * 100 : 0, v: max * 100 }
}
export function hsvToRgb(h: number, s: number, v: number, a = 1): RGBA {
  s /= 100; v /= 100; h = ((h % 360) + 360) % 360
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)) }
  return { r: f(5) * 255, g: f(3) * 255, b: f(1) * 255, a }
}
export function rgbToHwb(c: RGBA) { const { h, s, v } = rgbToHsv(c); return { h, w: ((100 - s) * v) / 100, b: 100 - v } }
export function hwbToRgb(h: number, w: number, bl: number, a = 1): RGBA {
  w /= 100; bl /= 100
  if (w + bl >= 1) { const g = (w / (w + bl)) * 255; return { r: g, g, b: g, a } }
  return hsvToRgb(h, (1 - w / (1 - bl)) * 100, (1 - bl) * 100, a)
}
export function rgbToCmyk({ r, g, b }: RGBA) {
  r /= 255; g /= 255; b /= 255
  const k = 1 - Math.max(r, g, b)
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 }
  return { c: ((1 - r - k) / (1 - k)) * 100, m: ((1 - g - k) / (1 - k)) * 100, y: ((1 - b - k) / (1 - k)) * 100, k: k * 100 }
}
export function cmykToRgb(c: number, m: number, y: number, k: number, a = 1): RGBA {
  c /= 100; m /= 100; y /= 100; k /= 100
  return { r: 255 * (1 - c) * (1 - k), g: 255 * (1 - m) * (1 - k), b: 255 * (1 - y) * (1 - k), a }
}

// linear sRGB
const toLin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const fromLin = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055)

export function rgbToXyz({ r, g, b }: RGBA) {
  const R = toLin(r), G = toLin(g), B = toLin(b)
  return { x: R * 0.4124564 + G * 0.3575761 + B * 0.1804375, y: R * 0.2126729 + G * 0.7151522 + B * 0.072175, z: R * 0.0193339 + G * 0.119192 + B * 0.9503041 }
}
export function xyzToRgb(x: number, y: number, z: number, a = 1): RGBA {
  return {
    r: fromLin(x * 3.2404542 - y * 1.5371385 - z * 0.4985314),
    g: fromLin(-x * 0.969266 + y * 1.8760108 + z * 0.041556),
    b: fromLin(x * 0.0556434 - y * 0.2040259 + z * 1.0572252), a,
  }
}
const D65 = [0.95047, 1, 1.08883]
export function rgbToLab(c: RGBA) {
  const { x, y, z } = rgbToXyz(c)
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  const fx = f(x / D65[0]), fy = f(y / D65[1]), fz = f(z / D65[2])
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}
export function labToRgb(l: number, A: number, B: number, alpha = 1): RGBA {
  const fy = (l + 16) / 116, fx = fy + A / 500, fz = fy - B / 200
  const inv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27))
  return xyzToRgb(inv(fx) * D65[0], (l > 8 ? fy ** 3 : l / (24389 / 27)) * D65[1], inv(fz) * D65[2], alpha)
}
export function rgbToOklab({ r, g, b }: RGBA) {
  const R = toLin(r), G = toLin(g), B = toLin(b)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return { L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s }
}
export function oklabToRgb(L: number, a: number, b: number, alpha = 1): RGBA {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return {
    r: fromLin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s), a: alpha,
  }
}
export function rgbToOklch(c: RGBA) {
  const { L, a, b } = rgbToOklab(c)
  const C = Math.hypot(a, b); let h = (Math.atan2(b, a) * 180) / Math.PI; if (h < 0) h += 360
  return { l: L, c: C, h: C < 1e-4 ? 0 : h }
}
export function oklchToRgb(l: number, c: number, h: number, a = 1) { const r = (h * Math.PI) / 180; return oklabToRgb(l, c * Math.cos(r), c * Math.sin(r), a) }

export function inGamut(c: RGBA) { return c.r >= -0.5 && c.r <= 255.5 && c.g >= -0.5 && c.g <= 255.5 && c.b >= -0.5 && c.b <= 255.5 }
export function clampRgb(c: RGBA): RGBA { return { r: clamp(c.r, 0, 255), g: clamp(c.g, 0, 255), b: clamp(c.b, 0, 255), a: clamp(c.a) } }
/** oklch → rgb with chroma reduction until in gamut */
export function oklchToRgbGamut(l: number, c: number, h: number, a = 1) {
  let col = oklchToRgb(l, c, h, a)
  let lo = 0, hi = c
  if (inGamut(col)) return clampRgb(col)
  for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; col = oklchToRgb(l, mid, h, a); if (inGamut(col)) lo = mid; else hi = mid }
  return clampRgb(oklchToRgb(l, lo, h, a))
}

function num(s: string, scale: number) { s = s.trim(); if (s.endsWith('%')) return (parseFloat(s) / 100) * scale; return parseFloat(s) }
function hue(s: string) { s = s.trim(); const v = parseFloat(s); if (s.endsWith('turn')) return v * 360; if (s.endsWith('rad')) return (v * 180) / Math.PI; if (s.endsWith('grad')) return v * 0.9; return v }
function alphaOf(s?: string) { if (s == null || s === '') return 1; s = s.trim(); return clamp(s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s)) }

/** Parse almost any CSS color string. Returns null if unparseable. */
export function parseColor(input: string): RGBA | null {
  let s = input.trim().toLowerCase()
  if (!s) return null
  if (NAMED[s]) return hexToRgb(NAMED[s])
  if (/^#?[0-9a-f]{3,8}$/.test(s)) return hexToRgb(s)
  const m = s.match(/^([a-z]+)\((.*)\)$/)
  if (!m) {
    // bare "255, 0, 0" or "255 0 0"
    const parts = s.split(/[\s,]+/).filter(Boolean)
    if (parts.length === 3 && parts.every((p) => /^\d+(\.\d+)?$/.test(p))) { const [r, g, b] = parts.map(Number); if ([r, g, b].every((v) => v <= 255)) return { r, g, b, a: 1 } }
    return null
  }
  const fn = m[1]
  const body = m[2].replace(/,/g, ' ').replace(/\s*\/\s*/, ' / ')
  const [main, al] = body.split(' / ')
  const p = main.trim().split(/\s+/)
  let a = alphaOf(al ?? (p.length === 4 ? p[3] : undefined))
  if (p.length < 3) return null
  let out: RGBA | null = null
  switch (fn) {
    case 'rgb': case 'rgba': out = { r: num(p[0], 255), g: num(p[1], 255), b: num(p[2], 255), a }; break
    case 'hsl': case 'hsla': out = hslToRgb(hue(p[0]), parseFloat(p[1]), parseFloat(p[2]), a); break
    case 'hsv': case 'hsb': out = hsvToRgb(hue(p[0]), parseFloat(p[1]), parseFloat(p[2]), a); break
    case 'hwb': out = hwbToRgb(hue(p[0]), parseFloat(p[1]), parseFloat(p[2]), a); break
    case 'lab': out = labToRgb(num(p[0], 100), num(p[1], 125), num(p[2], 125), a); break
    case 'lch': { const l = num(p[0], 100), c = num(p[1], 150), h = (hue(p[2]) * Math.PI) / 180; out = labToRgb(l, c * Math.cos(h), c * Math.sin(h), a); break }
    case 'oklab': out = oklabToRgb(num(p[0], 1), num(p[1], 0.4), num(p[2], 0.4), a); break
    case 'oklch': out = oklchToRgb(num(p[0], 1), num(p[1], 0.4), hue(p[2]), a); break
    case 'cmyk': case 'device-cmyk': out = cmykToRgb(num(p[0], 100), num(p[1], 100), num(p[2], 100), num(p[3] ?? '0', 100)); if (p.length > 4) a = alphaOf(p[4]); out.a = al ? alphaOf(al) : 1; break
    default: return null
  }
  if (!out || [out.r, out.g, out.b, out.a].some((v) => !Number.isFinite(v))) return null
  return clampRgb(out)
}

export function luminance({ r, g, b }: RGBA) { return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b) }
export function contrast(a: RGBA, b: RGBA) { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) }
/** composite fg (with alpha) over opaque bg */
export function over(fg: RGBA, bg: RGBA): RGBA { const a = fg.a; return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 } }
export function wcag(ratio: number) { return { aaNormal: ratio >= 4.5, aaLarge: ratio >= 3, aaaNormal: ratio >= 7, aaaLarge: ratio >= 4.5, ui: ratio >= 3 } }
export const isLight = (c: RGBA) => luminance(c) > 0.4
export const textOn = (c: RGBA) => (contrast(c, { r: 0, g: 0, b: 0, a: 1 }) >= contrast(c, { r: 255, g: 255, b: 255, a: 1 }) ? '#000000' : '#ffffff')

export const fmt = {
  hex: (c: RGBA) => rgbToHex(c, true),
  rgb: (c: RGBA) => c.a < 1 ? `rgb(${round(c.r)} ${round(c.g)} ${round(c.b)} / ${round(c.a, 2)})` : `rgb(${round(c.r)}, ${round(c.g)}, ${round(c.b)})`,
  hsl: (c: RGBA) => { const { h, s, l } = rgbToHsl(c); return `hsl(${round(h) % 360} ${round(s, 1)}% ${round(l, 1)}%${c.a < 1 ? ` / ${round(c.a, 2)}` : ''})` },
  hsv: (c: RGBA) => { const { h, s, v } = rgbToHsv(c); return `hsv(${round(h) % 360}, ${round(s, 1)}%, ${round(v, 1)}%)` },
  hwb: (c: RGBA) => { const { h, w, b } = rgbToHwb(c); return `hwb(${round(h) % 360} ${round(w, 1)}% ${round(b, 1)}%${c.a < 1 ? ` / ${round(c.a, 2)}` : ''})` },
  cmyk: (c: RGBA) => { const { c: C, m, y, k } = rgbToCmyk(c); return `cmyk(${round(C)}%, ${round(m)}%, ${round(y)}%, ${round(k)}%)` },
  lab: (c: RGBA) => { const { l, a, b } = rgbToLab(c); return `lab(${round(l, 2)}% ${round(a, 2)} ${round(b, 2)}${c.a < 1 ? ` / ${round(c.a, 2)}` : ''})` },
  oklch: (c: RGBA) => { const { l, c: C, h } = rgbToOklch(c); return `oklch(${round(l * 100, 2)}% ${round(C, 4)} ${round(h, 2) % 360}${c.a < 1 ? ` / ${round(c.a, 2)}` : ''})` },
}

/** Tailwind-like 50..950 scale built in OKLCH around a base colour (base lands at the closest step). */
export const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
const SCALE_L = [0.975, 0.94, 0.885, 0.81, 0.71, 0.62, 0.54, 0.46, 0.39, 0.33, 0.25]
export function tailwindScale(base: RGBA) {
  const { l, c, h } = rgbToOklch(base)
  // find closest step to base lightness and shift curve so base sits exactly there
  let idx = 0; let best = Infinity
  SCALE_L.forEach((L, i) => { const d = Math.abs(L - l); if (d < best) { best = d; idx = i } })
  const shift = l - SCALE_L[idx]
  return SCALE_STEPS.map((step, i) => {
    if (i === idx) return { step, color: { ...base, a: 1 }, base: true }
    const w = 1 - Math.abs(i - idx) / 10
    const L = clamp(SCALE_L[i] + shift * w, 0.08, 0.99)
    const edge = i < idx ? (L - l) / (1 - l + 1e-6) : (l - L) / (l + 1e-6)
    const C = c * (1 - 0.65 * clamp(edge) ** 1.6)
    return { step, color: oklchToRgbGamut(L, C, h), base: false }
  })
}

/** Colour blindness simulation matrices (Machado 2009, severity 1) applied in linear RGB */
export const CVD: Record<string, { label: string; m: number[] }> = {
  protanopia: { label: 'Protanopia', m: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998] },
  deuteranopia: { label: 'Deuteranopia', m: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881] },
  tritanopia: { label: 'Tritanopia', m: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039] },
  achromatopsia: { label: 'Achromatopsia', m: [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722] },
}
export function simulateCvd(c: RGBA, type: keyof typeof CVD | string): RGBA {
  const t = CVD[type]; if (!t) return c
  const R = toLin(c.r), G = toLin(c.g), B = toLin(c.b), m = t.m
  return clampRgb({ r: fromLin(m[0] * R + m[1] * G + m[2] * B), g: fromLin(m[3] * R + m[4] * G + m[5] * B), b: fromLin(m[6] * R + m[7] * G + m[8] * B), a: c.a })
}

export function harmonies(base: RGBA) {
  const { h, s, l } = rgbToHsl(base)
  const at = (d: number) => hslToRgb(h + d, s, l)
  return {
    complementary: [base, at(180)],
    analogous: [at(-30), base, at(30)],
    triadic: [base, at(120), at(240)],
    tetradic: [base, at(90), at(180), at(270)],
    split: [base, at(150), at(210)],
    monochrome: [hslToRgb(h, s, clamp(l - 30, 5, 95) ), hslToRgb(h, s, clamp(l - 15, 5, 95)), base, hslToRgb(h, s, clamp(l + 15, 5, 95)), hslToRgb(h, s, clamp(l + 30, 5, 95))],
  }
}

/** Rough colour name via nearest named colour in Lab */
export function nearestName(c: RGBA) {
  const lab = rgbToLab(c); let best = '', bd = Infinity
  for (const [n, h] of Object.entries(NAMED)) {
    if (h.length !== 6 || n === 'aqua' || n === 'fuchsia' || n === 'grey') continue
    const o = rgbToLab(hexToRgb(h)!); const d = (o.l - lab.l) ** 2 + (o.a - lab.a) ** 2 + (o.b - lab.b) ** 2
    if (d < bd) { bd = d; best = n }
  }
  return best
}

export const randomColor = (): RGBA => hslToRgb(Math.random() * 360, 55 + Math.random() * 35, 45 + Math.random() * 20)
