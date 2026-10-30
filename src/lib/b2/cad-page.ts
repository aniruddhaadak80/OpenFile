/** Millimetres per drawing unit for the units parseDxf reports ($INSUNITS). Unitless drawings use 1 unit = 1 mm. */
export const MM_PER_UNIT: Record<string, number> = { unitless: 1, in: 25.4, ft: 304.8, mi: 1609344, mm: 1, cm: 10, m: 1000, km: 1e6, 'µin': 0.0000254, mil: 0.0254, yd: 914.4, dm: 100 }

/** Page size in mm for "Fit drawing": the drawing at real size, scaled up or down by one factor (so the
 *  page keeps the drawing's shape) when its shorter side is under `min` mm or its longer side over `max` mm. Pure. */
export function fitPageMm(bw: number, bh: number, units = 'unitless', min = 50, max = 2000): [number, number] {
  const k = MM_PER_UNIT[units] ?? 1
  let w = Math.max(1e-6, Math.abs(bw) * k), h = Math.max(1e-6, Math.abs(bh) * k)
  if (Math.min(w, h) < min) { const s = min / Math.min(w, h); w *= s; h *= s }
  if (Math.max(w, h) > max) { const s = max / Math.max(w, h); w *= s; h *= s }
  return [Math.round(w * 100) / 100, Math.round(h * 100) / 100]
}
