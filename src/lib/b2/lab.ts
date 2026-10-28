/* sRGB <-> CIE Lab (D65), matching OpenCV's float convention: L in [0,100], a/b roughly [-127,127]. Pure, Node-testable. */
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const Xn = 0.950456, Zn = 1.088754
const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
const fi = (t: number) => (t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787)

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = lin(r), G = lin(g), B = lin(b)
  const X = (0.412453 * R + 0.35758 * G + 0.180423 * B) / Xn
  const Y = 0.212671 * R + 0.71516 * G + 0.072169 * B
  const Z = (0.019334 * R + 0.119193 * G + 0.950227 * B) / Zn
  const L = Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y
  return [L, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]
}
export function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200
  const Y = L > 7.9996 ? fy * fy * fy : L / 903.3
  const X = fi(fx) * Xn, Z = fi(fz) * Zn
  const R = 3.240479 * X - 1.53715 * Y - 0.498535 * Z
  const G = -0.969256 * X + 1.875991 * Y + 0.041556 * Z
  const B = 0.055648 * X - 0.204043 * Y + 1.057311 * Z
  const c = (v: number) => Math.max(0, Math.min(1, gam(Math.max(0, v))))
  return [c(R), c(G), c(B)]
}
