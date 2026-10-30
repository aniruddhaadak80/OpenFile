/* Science helpers: significant figures, scientific notation, formula solving, pH, solutions, decay and curve fits.
 * Pure functions, no DOM, so they can be unit tested in Node. */

/* ---------------- significant figures ---------------- */
export interface SigInfo { sig: number; digits: string; decimals: number; ambiguous: boolean; normalized: string }

/** Count significant figures in a number written as text (keeps trailing zero rules). */
export function countSig(raw: string): SigInfo {
  let s = raw.trim().replace(/[,\s_]/g, '').replace(/×10\^?/i, 'e').replace(/x10\^?/i, 'e').replace(/\*10\^/, 'e')
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) throw new Error('Type a number like 0.00450, 1200, 3.20e5 or 6.02 x 10^23.')
  const [mant] = s.replace(/^[+-]/, '').toLowerCase().split('e')
  const hasDot = mant.includes('.')
  const decimals = hasDot ? mant.split('.')[1].length : 0
  const all = mant.replace('.', '')
  const stripped = all.replace(/^0+/, '')
  let digits: string, ambiguous = false
  if (!stripped) { // the number is zero
    digits = hasDot ? '0'.repeat(Math.max(1, decimals)) : '0'
    return { sig: digits.length, digits, decimals, ambiguous: !hasDot, normalized: s }
  }
  if (hasDot) digits = stripped
  else {
    digits = stripped.replace(/0+$/, '')
    ambiguous = digits.length !== stripped.length
  }
  return { sig: digits.length, digits, decimals, ambiguous, normalized: s }
}

/** Round a value to n significant figures and return the text with trailing zeros kept. */
export function roundSig(x: number, n: number): string {
  if (!isFinite(x)) return String(x)
  if (x === 0) return n > 1 ? '0.' + '0'.repeat(n - 1) : '0'
  n = Math.max(1, Math.min(17, Math.round(n)))
  const e = Math.floor(Math.log10(Math.abs(x)))
  if (e >= 21 || e <= -7) return x.toExponential(n - 1)
  const dec = n - 1 - e
  if (dec >= 0) return x.toFixed(dec)
  const f = Math.pow(10, -dec)
  return String(Math.round(x / f) * f)
}

/** Round to a number of decimal places, used for sums and differences. */
export const roundDec = (x: number, d: number) => (d >= 0 ? x.toFixed(Math.min(20, d)) : String(Math.round(x / 10 ** -d) * 10 ** -d))

export interface SigCalc { result: number; text: string; rule: string; sig?: number; decimals?: number }
/** Combine two measured values with the textbook sig fig rules. */
export function sigOp(a: string, op: '+' | '-' | '*' | '/', b: string): SigCalc {
  const A = countSig(a), B = countSig(b), x = Number(A.normalized), y = Number(B.normalized)
  if (op === '+' || op === '-') {
    const r = op === '+' ? x + y : x - y
    const d = Math.min(A.decimals, B.decimals)
    return { result: r, text: roundDec(r, d), rule: `Adding or subtracting keeps the fewest decimal places (${d}).`, decimals: d }
  }
  if (op === '/' && y === 0) throw new Error('Cannot divide by zero.')
  const r = op === '*' ? x * y : x / y
  const n = Math.min(A.sig, B.sig)
  return { result: r, text: roundSig(r, n), rule: `Multiplying or dividing keeps the fewest significant figures (${n}).`, sig: n }
}

/* ---------------- scientific notation ---------------- */
export interface SciForms { sci: string; eng: string; e: string; plain: string; mantissa: number; exponent: number; latex: string }
const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
export const sup = (n: number | string) => String(n).split('').map((c) => SUP[c] ?? c).join('')

export function parseNumberLoose(raw: string): number {
  const s = raw.trim().replace(/[,\s_]/g, '').replace(/[×x*]10\^?\(?([+-]?\d+)\)?/i, 'e$1').replace(/·10\^?([+-]?\d+)/, 'e$1')
  const v = Number(s)
  if (s === '' || !isFinite(v)) throw new Error('Type a number like 0.000123, 45600000 or 4.56 x 10^7.')
  return v
}

/** Show a number in scientific, engineering, E and plain notation with n significant figures. */
export function sciForms(v: number, sig = 4): SciForms {
  if (v === 0) return { sci: '0', eng: '0', e: '0', plain: '0', mantissa: 0, exponent: 0, latex: '0' }
  let exp = Math.floor(Math.log10(Math.abs(v)))
  let m = v / 10 ** exp
  let mt = roundSig(m, sig)
  if (Math.abs(Number(mt)) >= 10) { exp += 1; m = v / 10 ** exp; mt = roundSig(m, sig) }
  const ee = Math.floor(exp / 3) * 3
  const em = roundSig(v / 10 ** ee, sig)
  const plainNum = Number(roundSig(v, sig))
  const plain = Math.abs(exp) > 20 ? '(too long to show)' : plainNum.toLocaleString('en-US', { maximumFractionDigits: 20, useGrouping: true })
  return { sci: `${mt} × 10${sup(exp)}`, eng: `${em} × 10${sup(ee)}`, e: `${mt}e${exp}`, plain, mantissa: Number(mt), exponent: exp, latex: `${mt} \\times 10^{${exp}}` }
}

/* ---------------- physics formula solver ---------------- */
export interface Formula { id: string; group: string; name: string; expr: string; vars: { k: string; label: string; unit: string }[]; solve: Record<string, (v: Record<string, number>) => number> }
const sq = Math.sqrt
export const FORMULAS: Formula[] = [
  { id: 'speed', group: 'Motion', name: 'Speed', expr: 'v = d / t', vars: [{ k: 'v', label: 'Speed', unit: 'm/s' }, { k: 'd', label: 'Distance', unit: 'm' }, { k: 't', label: 'Time', unit: 's' }],
    solve: { v: (o) => o.d / o.t, d: (o) => o.v * o.t, t: (o) => o.d / o.v } },
  { id: 'suvat1', group: 'Motion', name: 'Final velocity', expr: 'v = u + a·t', vars: [{ k: 'v', label: 'Final velocity', unit: 'm/s' }, { k: 'u', label: 'Initial velocity', unit: 'm/s' }, { k: 'a', label: 'Acceleration', unit: 'm/s²' }, { k: 't', label: 'Time', unit: 's' }],
    solve: { v: (o) => o.u + o.a * o.t, u: (o) => o.v - o.a * o.t, a: (o) => (o.v - o.u) / o.t, t: (o) => (o.v - o.u) / o.a } },
  { id: 'suvat2', group: 'Motion', name: 'Displacement', expr: 's = u·t + ½·a·t²', vars: [{ k: 's', label: 'Displacement', unit: 'm' }, { k: 'u', label: 'Initial velocity', unit: 'm/s' }, { k: 'a', label: 'Acceleration', unit: 'm/s²' }, { k: 't', label: 'Time', unit: 's' }],
    solve: { s: (o) => o.u * o.t + 0.5 * o.a * o.t ** 2, u: (o) => (o.s - 0.5 * o.a * o.t ** 2) / o.t, a: (o) => (2 * (o.s - o.u * o.t)) / o.t ** 2,
      t: (o) => { if (o.a === 0) return o.s / o.u; const d = o.u ** 2 + 2 * o.a * o.s; if (d < 0) return NaN; const r = [(-o.u + sq(d)) / o.a, (-o.u - sq(d)) / o.a].filter((x) => x >= 0); return r.length ? Math.min(...r) : NaN } } },
  { id: 'suvat3', group: 'Motion', name: 'Velocity and distance', expr: 'v² = u² + 2·a·s', vars: [{ k: 'v', label: 'Final velocity', unit: 'm/s' }, { k: 'u', label: 'Initial velocity', unit: 'm/s' }, { k: 'a', label: 'Acceleration', unit: 'm/s²' }, { k: 's', label: 'Displacement', unit: 'm' }],
    solve: { v: (o) => sq(o.u ** 2 + 2 * o.a * o.s), u: (o) => sq(o.v ** 2 - 2 * o.a * o.s), a: (o) => (o.v ** 2 - o.u ** 2) / (2 * o.s), s: (o) => (o.v ** 2 - o.u ** 2) / (2 * o.a) } },
  { id: 'force', group: 'Forces', name: "Newton's second law", expr: 'F = m·a', vars: [{ k: 'F', label: 'Force', unit: 'N' }, { k: 'm', label: 'Mass', unit: 'kg' }, { k: 'a', label: 'Acceleration', unit: 'm/s²' }],
    solve: { F: (o) => o.m * o.a, m: (o) => o.F / o.a, a: (o) => o.F / o.m } },
  { id: 'weight', group: 'Forces', name: 'Weight', expr: 'W = m·g', vars: [{ k: 'W', label: 'Weight', unit: 'N' }, { k: 'm', label: 'Mass', unit: 'kg' }, { k: 'g', label: 'Gravity', unit: 'm/s²' }],
    solve: { W: (o) => o.m * o.g, m: (o) => o.W / o.g, g: (o) => o.W / o.m } },
  { id: 'momentum', group: 'Forces', name: 'Momentum', expr: 'p = m·v', vars: [{ k: 'p', label: 'Momentum', unit: 'kg·m/s' }, { k: 'm', label: 'Mass', unit: 'kg' }, { k: 'v', label: 'Velocity', unit: 'm/s' }],
    solve: { p: (o) => o.m * o.v, m: (o) => o.p / o.v, v: (o) => o.p / o.m } },
  { id: 'pressure', group: 'Forces', name: 'Pressure', expr: 'P = F / A', vars: [{ k: 'P', label: 'Pressure', unit: 'Pa' }, { k: 'F', label: 'Force', unit: 'N' }, { k: 'A', label: 'Area', unit: 'm²' }],
    solve: { P: (o) => o.F / o.A, F: (o) => o.P * o.A, A: (o) => o.F / o.P } },
  { id: 'ke', group: 'Energy', name: 'Kinetic energy', expr: 'E = ½·m·v²', vars: [{ k: 'E', label: 'Energy', unit: 'J' }, { k: 'm', label: 'Mass', unit: 'kg' }, { k: 'v', label: 'Speed', unit: 'm/s' }],
    solve: { E: (o) => 0.5 * o.m * o.v ** 2, m: (o) => (2 * o.E) / o.v ** 2, v: (o) => sq((2 * o.E) / o.m) } },
  { id: 'pe', group: 'Energy', name: 'Potential energy', expr: 'E = m·g·h', vars: [{ k: 'E', label: 'Energy', unit: 'J' }, { k: 'm', label: 'Mass', unit: 'kg' }, { k: 'g', label: 'Gravity', unit: 'm/s²' }, { k: 'h', label: 'Height', unit: 'm' }],
    solve: { E: (o) => o.m * o.g * o.h, m: (o) => o.E / (o.g * o.h), g: (o) => o.E / (o.m * o.h), h: (o) => o.E / (o.m * o.g) } },
  { id: 'work', group: 'Energy', name: 'Work', expr: 'W = F·d', vars: [{ k: 'W', label: 'Work', unit: 'J' }, { k: 'F', label: 'Force', unit: 'N' }, { k: 'd', label: 'Distance', unit: 'm' }],
    solve: { W: (o) => o.F * o.d, F: (o) => o.W / o.d, d: (o) => o.W / o.F } },
  { id: 'power', group: 'Energy', name: 'Power', expr: 'P = W / t', vars: [{ k: 'P', label: 'Power', unit: 'W' }, { k: 'W', label: 'Work', unit: 'J' }, { k: 't', label: 'Time', unit: 's' }],
    solve: { P: (o) => o.W / o.t, W: (o) => o.P * o.t, t: (o) => o.W / o.P } },
  { id: 'ohm', group: 'Electricity', name: "Ohm's law", expr: 'V = I·R', vars: [{ k: 'V', label: 'Voltage', unit: 'V' }, { k: 'I', label: 'Current', unit: 'A' }, { k: 'R', label: 'Resistance', unit: 'Ω' }],
    solve: { V: (o) => o.I * o.R, I: (o) => o.V / o.R, R: (o) => o.V / o.I } },
  { id: 'epower', group: 'Electricity', name: 'Electric power', expr: 'P = V·I', vars: [{ k: 'P', label: 'Power', unit: 'W' }, { k: 'V', label: 'Voltage', unit: 'V' }, { k: 'I', label: 'Current', unit: 'A' }],
    solve: { P: (o) => o.V * o.I, V: (o) => o.P / o.I, I: (o) => o.P / o.V } },
  { id: 'charge', group: 'Electricity', name: 'Charge', expr: 'Q = I·t', vars: [{ k: 'Q', label: 'Charge', unit: 'C' }, { k: 'I', label: 'Current', unit: 'A' }, { k: 't', label: 'Time', unit: 's' }],
    solve: { Q: (o) => o.I * o.t, I: (o) => o.Q / o.t, t: (o) => o.Q / o.I } },
  { id: 'wave', group: 'Waves', name: 'Wave speed', expr: 'v = f·λ', vars: [{ k: 'v', label: 'Wave speed', unit: 'm/s' }, { k: 'f', label: 'Frequency', unit: 'Hz' }, { k: 'l', label: 'Wavelength', unit: 'm' }],
    solve: { v: (o) => o.f * o.l, f: (o) => o.v / o.l, l: (o) => o.v / o.f } },
  { id: 'density', group: 'Matter', name: 'Density', expr: 'ρ = m / V', vars: [{ k: 'rho', label: 'Density', unit: 'kg/m³' }, { k: 'm', label: 'Mass', unit: 'kg' }, { k: 'V', label: 'Volume', unit: 'm³' }],
    solve: { rho: (o) => o.m / o.V, m: (o) => o.rho * o.V, V: (o) => o.m / o.rho } },
  { id: 'gas', group: 'Matter', name: 'Ideal gas law', expr: 'P·V = n·R·T', vars: [{ k: 'P', label: 'Pressure', unit: 'Pa' }, { k: 'V', label: 'Volume', unit: 'm³' }, { k: 'n', label: 'Amount', unit: 'mol' }, { k: 'T', label: 'Temperature', unit: 'K' }],
    solve: { P: (o) => (o.n * 8.314462618 * o.T) / o.V, V: (o) => (o.n * 8.314462618 * o.T) / o.P, n: (o) => (o.P * o.V) / (8.314462618 * o.T), T: (o) => (o.P * o.V) / (o.n * 8.314462618) } },
  { id: 'heat', group: 'Matter', name: 'Heat energy', expr: 'Q = m·c·ΔT', vars: [{ k: 'Q', label: 'Heat', unit: 'J' }, { k: 'm', label: 'Mass', unit: 'kg' }, { k: 'c', label: 'Specific heat', unit: 'J/(kg·K)' }, { k: 'dT', label: 'Temperature change', unit: 'K' }],
    solve: { Q: (o) => o.m * o.c * o.dT, m: (o) => o.Q / (o.c * o.dT), c: (o) => o.Q / (o.m * o.dT), dT: (o) => o.Q / (o.m * o.c) } },
]

/** Solve a formula for the one variable left empty. */
export function solveFormula(f: Formula, values: Record<string, number | null | undefined>): { key: string; value: number } {
  const missing = f.vars.filter((v) => values[v.k] == null || !isFinite(values[v.k] as number))
  if (missing.length !== 1) throw new Error(missing.length ? 'Leave exactly one box empty, the one you want to find.' : 'Clear the box you want to find.')
  const key = missing[0].k
  const value = f.solve[key](values as Record<string, number>)
  if (!isFinite(value)) throw new Error('These numbers have no real answer. Check the signs and units.')
  return { key, value }
}

/* ---------------- pH ---------------- */
export const KW = 1e-14
export interface PhResult { pH: number; pOH: number; h: number; oh: number; kind: 'acidic' | 'neutral' | 'basic' }
const phOf = (h: number): PhResult => { const pH = -Math.log10(h), pOH = 14 - pH; return { pH, pOH, h, oh: KW / h, kind: pH < 6.995 ? 'acidic' : pH > 7.005 ? 'basic' : 'neutral' } }
export function phFrom(kind: 'pH' | 'pOH' | 'H' | 'OH', v: number): PhResult {
  if (!(v > 0) && kind !== 'pH' && kind !== 'pOH') throw new Error('Concentration must be above zero.')
  if (kind === 'pH') return phOf(10 ** -v)
  if (kind === 'pOH') return phOf(10 ** -(14 - v))
  if (kind === 'H') return phOf(v)
  return phOf(KW / v)
}
/** Strong acid or base of a given molarity (with the water contribution for very dilute solutions). */
export function phStrong(c: number, base: boolean, n = 1): PhResult {
  const x = c * n
  const h = (x + Math.sqrt(x * x + 4 * KW)) / 2 // exact for strong monoprotic, includes water
  return base ? phOf(KW / h) : phOf(h)
}
/** Weak acid (Ka) or weak base (Kb), solved exactly with the quadratic. */
export function phWeak(c: number, k: number, base: boolean): PhResult {
  const x = (-k + Math.sqrt(k * k + 4 * k * c)) / 2
  return base ? phOf(KW / x) : phOf(x)
}
/** Henderson-Hasselbalch buffer. */
export const phBuffer = (pKa: number, acid: number, conjBase: number) => phFrom('pH', pKa + Math.log10(conjBase / acid))

/* ---------------- solutions ---------------- */
/** Molarity triangle: moles = M * L, grams = moles * molar mass. Leave one of M, grams, litres empty. */
export function molarity(o: { M?: number | null; g?: number | null; L?: number | null; mm: number }) {
  const set = [o.M, o.g, o.L].filter((x) => x != null && isFinite(x as number)).length
  if (set !== 2) throw new Error('Fill two of molarity, mass and volume.')
  if (o.M == null) return { M: (o.g! / o.mm) / o.L!, g: o.g!, L: o.L! }
  if (o.g == null) return { M: o.M, g: o.M * o.L! * o.mm, L: o.L! }
  return { M: o.M, g: o.g, L: (o.g / o.mm) / o.M }
}
/** C1·V1 = C2·V2, leave one empty. */
export function dilution(v: { c1?: number | null; v1?: number | null; c2?: number | null; v2?: number | null }) {
  const keys = ['c1', 'v1', 'c2', 'v2'] as const
  const miss = keys.filter((k) => v[k] == null || !isFinite(v[k] as number))
  if (miss.length !== 1) throw new Error('Leave exactly one box empty.')
  const c1 = v.c1 as number, v1 = v.v1 as number, c2 = v.c2 as number, v2 = v.v2 as number
  const r = { c1: (c2 * v2) / v1, v1: (c2 * v2) / c1, c2: (c1 * v1) / v2, v2: (c1 * v1) / c2 }[miss[0]]
  if (!isFinite(r)) throw new Error('These numbers have no answer (a zero in the wrong place).')
  return { key: miss[0], value: r }
}

/* ---------------- half-life ---------------- */
/** N = N0 * (1/2)^(t / T). Leave one of N0, N, t, T empty. */
export function halfLife(v: { N0?: number | null; N?: number | null; t?: number | null; T?: number | null }) {
  const keys = ['N0', 'N', 't', 'T'] as const
  const miss = keys.filter((k) => v[k] == null || !isFinite(v[k] as number))
  if (miss.length !== 1) throw new Error('Leave exactly one box empty.')
  const { N0, N, t, T } = v as Record<string, number>
  const k = miss[0]
  let r = NaN
  if (k === 'N') r = N0 * 0.5 ** (t / T)
  else if (k === 'N0') r = N / 0.5 ** (t / T)
  else if (k === 't') r = (T * Math.log(N / N0)) / Math.log(0.5)
  else r = (t * Math.log(0.5)) / Math.log(N / N0)
  if (!isFinite(r) || r < 0) throw new Error('No answer: the amount left must be smaller than the start amount.')
  return { key: k, value: r }
}
export const decayConstant = (T: number) => Math.LN2 / T

/* ---------------- curve fits ---------------- */
export type FitKind = 'linear' | 'quadratic' | 'exponential' | 'power' | 'log'
export interface Fit { kind: FitKind; coef: number[]; r2: number; f: (x: number) => number; eq: string }
function lstsq(X: number[][], y: number[]): number[] {
  const n = X[0].length
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (j < n ? X.reduce((s, r) => s + r[i] * r[j], 0) : X.reduce((s, r, k) => s + r[i] * y[k], 0))))
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r
    ;[A[c], A[p]] = [A[p], A[c]]
    if (Math.abs(A[c][c]) < 1e-12) throw new Error('Not enough distinct points for this fit.')
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let j = c; j <= n; j++) A[r][j] -= f * A[c][j] }
  }
  return A.map((r, i) => r[n] / r[i])
}
const fmtC = (v: number) => { const a = Math.abs(v); return a !== 0 && (a < 1e-3 || a >= 1e5) ? v.toExponential(3) : Number(v.toPrecision(5)).toString() }
export function fit(xs: number[], ys: number[], kind: FitKind): Fit {
  const pts = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => isFinite(x) && isFinite(y))
  if (pts.length < (kind === 'quadratic' ? 3 : 2)) throw new Error('Need more points for this fit.')
  let coef: number[], f: (x: number) => number, eq: string
  if (kind === 'linear') { coef = lstsq(pts.map(([x]) => [1, x]), pts.map(([, y]) => y)); f = (x) => coef[0] + coef[1] * x; eq = `y = ${fmtC(coef[1])}x + ${fmtC(coef[0])}` }
  else if (kind === 'quadratic') { coef = lstsq(pts.map(([x]) => [1, x, x * x]), pts.map(([, y]) => y)); f = (x) => coef[0] + coef[1] * x + coef[2] * x * x; eq = `y = ${fmtC(coef[2])}x² + ${fmtC(coef[1])}x + ${fmtC(coef[0])}` }
  else if (kind === 'exponential') { const p = pts.filter(([, y]) => y > 0); if (p.length < 2) throw new Error('Exponential fits need positive y values.'); const c = lstsq(p.map(([x]) => [1, x]), p.map(([, y]) => Math.log(y))); coef = [Math.exp(c[0]), c[1]]; f = (x) => coef[0] * Math.exp(coef[1] * x); eq = `y = ${fmtC(coef[0])}·e^(${fmtC(coef[1])}x)` }
  else if (kind === 'power') { const p = pts.filter(([x, y]) => x > 0 && y > 0); if (p.length < 2) throw new Error('Power fits need positive x and y values.'); const c = lstsq(p.map(([x]) => [1, Math.log(x)]), p.map(([, y]) => Math.log(y))); coef = [Math.exp(c[0]), c[1]]; f = (x) => coef[0] * x ** coef[1]; eq = `y = ${fmtC(coef[0])}·x^${fmtC(coef[1])}` }
  else { const p = pts.filter(([x]) => x > 0); if (p.length < 2) throw new Error('Log fits need positive x values.'); coef = lstsq(p.map(([x]) => [1, Math.log(x)]), p.map(([, y]) => y)); f = (x) => coef[0] + coef[1] * Math.log(x); eq = `y = ${fmtC(coef[1])}·ln(x) + ${fmtC(coef[0])}` }
  const my = pts.reduce((s, [, y]) => s + y, 0) / pts.length
  const ssr = pts.reduce((s, [x, y]) => s + (y - f(x)) ** 2, 0), sst = pts.reduce((s, [, y]) => s + (y - my) ** 2, 0)
  return { kind, coef, r2: sst ? 1 - ssr / sst : 1, f, eq }
}
