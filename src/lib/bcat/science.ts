/* Science helpers: periodic table data, formula parsing and molar mass, equation balancing with exact fractions,
 * boolean expressions and truth tables with simplification, primes and factorisation. Pure, unit tested. */

/* ---------- elements ---------- */
const RAW = 'H Hydrogen 1.008|He Helium 4.0026|Li Lithium 6.94|Be Beryllium 9.0122|B Boron 10.81|C Carbon 12.011|N Nitrogen 14.007|O Oxygen 15.999|F Fluorine 18.998|Ne Neon 20.180|Na Sodium 22.990|Mg Magnesium 24.305|Al Aluminium 26.982|Si Silicon 28.085|P Phosphorus 30.974|S Sulfur 32.06|Cl Chlorine 35.45|Ar Argon 39.948|K Potassium 39.098|Ca Calcium 40.078|Sc Scandium 44.956|Ti Titanium 47.867|V Vanadium 50.942|Cr Chromium 51.996|Mn Manganese 54.938|Fe Iron 55.845|Co Cobalt 58.933|Ni Nickel 58.693|Cu Copper 63.546|Zn Zinc 65.38|Ga Gallium 69.723|Ge Germanium 72.630|As Arsenic 74.922|Se Selenium 78.971|Br Bromine 79.904|Kr Krypton 83.798|Rb Rubidium 85.468|Sr Strontium 87.62|Y Yttrium 88.906|Zr Zirconium 91.224|Nb Niobium 92.906|Mo Molybdenum 95.95|Tc Technetium 98|Ru Ruthenium 101.07|Rh Rhodium 102.91|Pd Palladium 106.42|Ag Silver 107.87|Cd Cadmium 112.41|In Indium 114.82|Sn Tin 118.71|Sb Antimony 121.76|Te Tellurium 127.60|I Iodine 126.90|Xe Xenon 131.29|Cs Caesium 132.91|Ba Barium 137.33|La Lanthanum 138.91|Ce Cerium 140.12|Pr Praseodymium 140.91|Nd Neodymium 144.24|Pm Promethium 145|Sm Samarium 150.36|Eu Europium 151.96|Gd Gadolinium 157.25|Tb Terbium 158.93|Dy Dysprosium 162.50|Ho Holmium 164.93|Er Erbium 167.26|Tm Thulium 168.93|Yb Ytterbium 173.05|Lu Lutetium 174.97|Hf Hafnium 178.49|Ta Tantalum 180.95|W Tungsten 183.84|Re Rhenium 186.21|Os Osmium 190.23|Ir Iridium 192.22|Pt Platinum 195.08|Au Gold 196.97|Hg Mercury 200.59|Tl Thallium 204.38|Pb Lead 207.2|Bi Bismuth 208.98|Po Polonium 209|At Astatine 210|Rn Radon 222|Fr Francium 223|Ra Radium 226|Ac Actinium 227|Th Thorium 232.04|Pa Protactinium 231.04|U Uranium 238.03|Np Neptunium 237|Pu Plutonium 244|Am Americium 243|Cm Curium 247|Bk Berkelium 247|Cf Californium 251|Es Einsteinium 252|Fm Fermium 257|Md Mendelevium 258|No Nobelium 259|Lr Lawrencium 266|Rf Rutherfordium 267|Db Dubnium 268|Sg Seaborgium 269|Bh Bohrium 270|Hs Hassium 277|Mt Meitnerium 278|Ds Darmstadtium 281|Rg Roentgenium 282|Cn Copernicium 285|Nh Nihonium 286|Fl Flerovium 289|Mc Moscovium 290|Lv Livermorium 293|Ts Tennessine 294|Og Oganesson 294'
export type ElCat = 'alkali' | 'alkaline' | 'transition' | 'post' | 'metalloid' | 'nonmetal' | 'halogen' | 'noble' | 'lanthanide' | 'actinide'
export const CAT_NAME: Record<ElCat, string> = { alkali: 'Alkali metal', alkaline: 'Alkaline earth metal', transition: 'Transition metal', post: 'Post-transition metal', metalloid: 'Metalloid', nonmetal: 'Reactive nonmetal', halogen: 'Halogen', noble: 'Noble gas', lanthanide: 'Lanthanide', actinide: 'Actinide' }
const SETS: [ElCat, number[]][] = [
  ['alkali', [3, 11, 19, 37, 55, 87]], ['alkaline', [4, 12, 20, 38, 56, 88]], ['metalloid', [5, 14, 32, 33, 51, 52]], ['nonmetal', [1, 6, 7, 8, 15, 16, 34]], ['halogen', [9, 17, 35, 53, 85, 117]], ['noble', [2, 10, 18, 36, 54, 86, 118]], ['post', [13, 31, 49, 50, 81, 82, 83, 84, 113, 114, 115, 116]],
]
export interface Element { z: number; symbol: string; name: string; mass: number; cat: ElCat; period: number; group: number | null; row: number; col: number; config: string }
const ORB = ['1s', '2s', '2p', '3s', '3p', '4s', '3d', '4p', '5s', '4d', '5p', '6s', '4f', '5d', '6p', '7s', '5f', '6d', '7p']
const CAP: Record<string, number> = { s: 2, p: 6, d: 10, f: 14 }
const EXC: Record<number, string> = { 24: '[Ar] 3d5 4s1', 29: '[Ar] 3d10 4s1', 41: '[Kr] 4d4 5s1', 42: '[Kr] 4d5 5s1', 44: '[Kr] 4d7 5s1', 45: '[Kr] 4d8 5s1', 46: '[Kr] 4d10', 47: '[Kr] 4d10 5s1', 57: '[Xe] 5d1 6s2', 58: '[Xe] 4f1 5d1 6s2', 64: '[Xe] 4f7 5d1 6s2', 78: '[Xe] 4f14 5d9 6s1', 79: '[Xe] 4f14 5d10 6s1', 89: '[Rn] 6d1 7s2', 90: '[Rn] 6d2 7s2', 91: '[Rn] 5f2 6d1 7s2', 92: '[Rn] 5f3 6d1 7s2', 93: '[Rn] 5f4 6d1 7s2', 96: '[Rn] 5f7 6d1 7s2', 103: '[Rn] 5f14 7s2 7p1' }
const NOBLE: [number, string][] = [[86, 'Rn'], [54, 'Xe'], [36, 'Kr'], [18, 'Ar'], [10, 'Ne'], [2, 'He']]
export function electronConfig(z: number) {
  if (EXC[z]) return EXC[z]
  const parts: string[] = []; let left = z
  for (const o of ORB) { if (!left) break; const n = Math.min(left, CAP[o[1]]); parts.push(`${o}${n}`); left -= n }
  const core = NOBLE.find(([n]) => n < z)
  if (!core) return parts.join(' ')
  let skip = core[0]; const rest: string[] = []
  for (const p of parts) { const n = +p.slice(2); if (skip >= n) { skip -= n; continue } rest.push(p) }
  return `[${core[1]}] ${rest.join(' ')}`
}
function place(z: number) {
  const ends = [2, 10, 18, 36, 54, 86, 118]
  const period = ends.findIndex((e) => z <= e) + 1, start = period === 1 ? 1 : ends[period - 2] + 1, i = z - start
  if (z >= 57 && z <= 71) return { period, group: null, row: 9, col: z - 57 + 3 }
  if (z >= 89 && z <= 103) return { period, group: null, row: 10, col: z - 89 + 3 }
  let group: number
  if (period === 1) group = z === 1 ? 1 : 18
  else if (period <= 3) group = i < 2 ? i + 1 : i + 11
  else if (period <= 5) group = i + 1
  else group = i < 2 ? i + 1 : i - 13 // after the f block (15 elements)
  return { period, group, row: period, col: group }
}
export const ELEMENTS: Element[] = RAW.split('|').map((s, i) => {
  const [symbol, name, m] = s.split(' '), z = i + 1
  const cat: ElCat = (z >= 57 && z <= 71) ? 'lanthanide' : (z >= 89 && z <= 103) ? 'actinide' : SETS.find(([, l]) => l.includes(z))?.[0] ?? 'transition'
  return { z, symbol, name, mass: +m, cat, ...place(z), config: electronConfig(z) }
})
export const BY_SYMBOL = new Map(ELEMENTS.map((e) => [e.symbol, e]))

/* ---------- formulas ---------- */
/** Count atoms in a formula like Ca(OH)2, CuSO4·5H2O, [Fe(CN)6]3- or K4[Fe(CN)6]. */
export function parseFormula(f: string): Map<string, number> {
  const src = f.replace(/\s+/g, '').replace(/\^?[0-9]*[+-]$/, '').replace(/\{[0-9]*[+-]\}$/, '')
  const parts = src.split(/[·•*.]/)
  const total = new Map<string, number>()
  for (const part of parts) {
    const m = part.match(/^(\d+)(.*)$/), mult = m ? +m[1] : 1, body = m ? m[2] : part
    let i = 0
    const group = (): Map<string, number> => {
      const out = new Map<string, number>()
      while (i < body.length) {
        const c = body[i]
        if (c === '(' || c === '[') { i++; const inner = group(); if (body[i] !== ')' && body[i] !== ']') throw new Error('Missing closing bracket'); i++; const n = num(); inner.forEach((v, k) => out.set(k, (out.get(k) ?? 0) + v * n)) }
        else if (c === ')' || c === ']') return out
        else if (/[A-Z]/.test(c)) { let s = c; i++; while (i < body.length && /[a-z]/.test(body[i])) s += body[i++]; if (!BY_SYMBOL.has(s)) throw new Error(`Unknown element: ${s}`); const n = num(); out.set(s, (out.get(s) ?? 0) + n) }
        else throw new Error(`Unexpected "${c}" in ${f}`)
      }
      return out
    }
    const num = () => { let s = ''; while (i < body.length && /\d/.test(body[i])) s += body[i++]; return s ? +s : 1 }
    const g = group(); if (i < body.length) throw new Error('Unbalanced brackets')
    g.forEach((v, k) => total.set(k, (total.get(k) ?? 0) + v * mult))
  }
  if (!total.size) throw new Error('Type a formula like H2O')
  return total
}
export function molarMass(f: string) {
  const atoms = parseFormula(f)
  let m = 0; atoms.forEach((n, s) => { m += BY_SYMBOL.get(s)!.mass * n })
  const parts = [...atoms.entries()].map(([s, n]) => ({ symbol: s, name: BY_SYMBOL.get(s)!.name, count: n, mass: BY_SYMBOL.get(s)!.mass * n, pct: (BY_SYMBOL.get(s)!.mass * n / m) * 100 }))
  return { mass: m, parts }
}
export function chargeOf(f: string) { const m = f.match(/(?:\^|\{)?(\d*)([+-])\}?$/); if (!m || /[A-Za-z)\]]$/.test(f)) return 0; return (m[2] === '+' ? 1 : -1) * (m[1] ? +m[1] : 1) }

/* ---------- exact fractions ---------- */
type Q = [bigint, bigint]
const gcdB = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a }
const q = (n: bigint, d = 1n): Q => { if (d < 0n) { n = -n; d = -d } const g = gcdB(n, d) || 1n; return [n / g, d / g] }
const sub = (a: Q, b: Q): Q => q(a[0] * b[1] - b[0] * a[1], a[1] * b[1]), mul = (a: Q, b: Q): Q => q(a[0] * b[0], a[1] * b[1]), div = (a: Q, b: Q): Q => q(a[0] * b[1], a[1] * b[0])
/** Reduced row echelon form with exact fractions. */
export function rref(M: number[][] | Q[][]): Q[][] {
  const A: Q[][] = M.map((r) => r.map((v: any) => (Array.isArray(v) ? v : q(BigInt(v))))) as Q[][]
  let lead = 0
  for (let r = 0; r < A.length && lead < (A[0]?.length ?? 0); r++) {
    let i = r; while (A[i][lead][0] === 0n) { i++; if (i === A.length) { i = r; lead++; if (lead === A[0].length) return A } }
    [A[i], A[r]] = [A[r], A[i]]
    const lv = A[r][lead]; A[r] = A[r].map((v) => div(v, lv))
    for (let k = 0; k < A.length; k++) if (k !== r && A[k][lead][0] !== 0n) { const f = A[k][lead]; A[k] = A[k].map((v, j) => sub(v, mul(f, A[r][j]))) }
    lead++
  }
  return A
}
export const qStr = (v: Q) => (v[1] === 1n ? String(v[0]) : `${v[0]}/${v[1]}`)
export const qNum = (v: Q) => Number(v[0]) / Number(v[1])
/** rref for decimals: turns each number into an exact fraction first. */
export function rrefDecimal(M: number[][]) {
  const toQ = (x: number): Q => { const s = String(x); if (!s.includes('.') && !s.includes('e')) return q(BigInt(Math.round(x))); const d = 10n ** BigInt(Math.min(12, (s.split('.')[1] ?? '').length || 6)); return q(BigInt(Math.round(x * Number(d))), d) }
  return rref(M.map((r) => r.map(toQ)))
}

/* ---------- equation balancing ---------- */
export interface Balanced { left: { f: string; n: number }[]; right: { f: string; n: number }[]; text: string }
export function balance(eq: string): Balanced {
  const [l, r] = eq.replace(/\s*(=+>|-+>|→|⟶|<=>|⇌|=)\s*/, ' => ').split(' => ')
  if (!r) throw new Error('Write the equation with an arrow, like H2 + O2 -> H2O')
  const side = (s: string) => s.split(/\s+\+\s+/).map((x) => x.trim().replace(/^\d+(?=[A-Z(\[])/, '')).filter(Boolean)
  const L = side(l), Rr = side(r), all = [...L, ...Rr]
  const atoms = all.map(parseFormula)
  const els = [...new Set(atoms.flatMap((a) => [...a.keys()]))]
  const charges = all.map(chargeOf)
  const rows = els.map((e) => all.map((_, j) => (atoms[j].get(e) ?? 0) * (j < L.length ? 1 : -1)))
  if (charges.some((c) => c)) rows.push(charges.map((c, j) => c * (j < L.length ? 1 : -1)))
  const R2 = rref(rows)
  // free variable: last column; solve x_i = -R[i][last] with x_last = 1
  const n = all.length, sol: Q[] = Array(n).fill(null).map(() => q(0n)); sol[n - 1] = q(1n)
  let pivots = 0
  for (const row of R2) { const p = row.findIndex((v) => v[0] !== 0n); if (p < 0) continue; pivots++; if (p === n - 1) throw new Error('This equation cannot be balanced. Check the formulas.'); sol[p] = q(-row[n - 1][0], row[n - 1][1]) }
  if (pivots !== n - 1) throw new Error('This equation has more than one way to balance. Split it into separate reactions.')
  let lcm = 1n; for (const v of sol) lcm = (lcm * v[1]) / gcdB(lcm, v[1])
  let ints = sol.map((v) => (v[0] * lcm) / v[1])
  if (ints.some((v) => v <= 0n)) { if (ints.every((v) => v < 0n)) ints = ints.map((v) => -v); else throw new Error('This equation cannot be balanced as written. A product may be on the wrong side.') }
  const g = ints.reduce((a, b) => gcdB(a, b)); ints = ints.map((v) => v / g)
  const fmt = (list: string[], off: number) => list.map((f, i) => ({ f, n: Number(ints[i + off]) }))
  const left = fmt(L, 0), right = fmt(Rr, L.length)
  const str = (x: { f: string; n: number }[]) => x.map((t) => `${t.n > 1 ? t.n + ' ' : ''}${t.f}`).join(' + ')
  return { left, right, text: `${str(left)} → ${str(right)}` }
}

/* ---------- boolean logic ---------- */
type Node = { t: 'var'; n: string } | { t: 'const'; v: boolean } | { t: 'not'; a: Node } | { t: 'bin'; op: string; a: Node; b: Node }
export function parseBool(src: string): { ast: Node; vars: string[] } {
  const s = src.replace(/<->|<=>|↔|⇔|\biff\b/gi, ' IFF ').replace(/->|=>|→|⇒|\bimplies\b/gi, ' IMP ').replace(/&&|∧|·|\band\b/gi, ' AND ').replace(/\|\||∨|\bor\b/gi, ' OR ').replace(/⊕|\bxor\b/gi, ' XOR ').replace(/\bnand\b|↑/gi, ' NAND ').replace(/\bnor\b|↓/gi, ' NOR ').replace(/¬|\bnot\b/gi, ' NOT ')
  let toks: string[] = s.match(/IFF|IMP|AND|OR|XOR|NAND|NOR|NOT|[A-Za-z_][A-Za-z0-9_]*|[01]|[()&|^!~'+*]/g) ?? []
  const KW = new Set(['IFF', 'IMP', 'AND', 'OR', 'XOR', 'NAND', 'NOR', 'NOT'])
  // textbook style like AB + A'C: all-capital names are single-letter variables written side by side
  const ids = toks.filter((t) => /^[A-Za-z_]/.test(t) && !KW.has(t))
  if (ids.length && ids.every((t) => /^[A-Z]+$/.test(t))) toks = toks.flatMap((t) => (/^[A-Z]+$/.test(t) && !KW.has(t) ? t.split('') : [t]))
  let i = 0
  const vars: string[] = []
  const peek = () => toks[i]
  const prec: Record<string, number> = { IFF: 1, IMP: 2, OR: 3, '|': 3, '+': 3, NOR: 3, XOR: 4, '^': 4, AND: 5, '&': 5, '*': 5, NAND: 5 }
  const norm: Record<string, string> = { '|': 'OR', '+': 'OR', '&': 'AND', '*': 'AND', '^': 'XOR' }
  const atom = (): Node => {
    const t = toks[i++]
    if (t === undefined) throw new Error('The expression ends too early')
    let node: Node
    if (t === 'NOT' || t === '!' || t === '~') node = { t: 'not', a: atom() }
    else if (t === '(') { node = expr(0); if (toks[i++] !== ')') throw new Error('Missing )') }
    else if (t === '0' || t === '1') node = { t: 'const', v: t === '1' }
    else if (/^[A-Za-z_]/.test(t) && !prec[t] && !KW.has(t)) { if (!vars.includes(t)) vars.push(t); node = { t: 'var', n: t } }
    else throw new Error(`Unexpected "${t}"`)
    while (peek() === "'") { i++; node = { t: 'not', a: node } }
    return node
  }
  const expr = (min: number): Node => {
    let left = atom()
    for (;;) {
      let op = peek()
      // implicit AND: AB or A(B)
      if (op !== undefined && (op === '(' || op === '!' || op === '~' || op === 'NOT' || (/^[A-Za-z_01]/.test(op) && !prec[op]))) op = 'AND*'
      const p = op === 'AND*' ? 5 : prec[op ?? '']
      if (p === undefined || p < min) return left
      if (op !== 'AND*') i++
      const right = expr(op === 'IMP' ? p : p + 1)
      left = { t: 'bin', op: op === 'AND*' ? 'AND' : norm[op!] ?? op!, a: left, b: right }
    }
  }
  const ast = expr(0)
  if (i < toks.length) throw new Error(`Unexpected "${toks[i]}"`)
  return { ast, vars: vars.sort() }
}
export function evalBool(n: Node, env: Record<string, boolean>): boolean {
  switch (n.t) {
    case 'var': return env[n.n]
    case 'const': return n.v
    case 'not': return !evalBool(n.a, env)
    default: { const a = evalBool(n.a, env), b = evalBool(n.b, env); return n.op === 'AND' ? a && b : n.op === 'OR' ? a || b : n.op === 'XOR' ? a !== b : n.op === 'IMP' ? !a || b : n.op === 'IFF' ? a === b : n.op === 'NAND' ? !(a && b) : !(a || b) }
  }
}
export function truthTable(src: string) {
  const { ast, vars } = parseBool(src)
  if (vars.length > 12) throw new Error('Up to 12 variables are supported.')
  const rows: { vals: boolean[]; out: boolean }[] = []
  for (let m = 0; m < 1 << vars.length; m++) { const vals = vars.map((_, k) => !!((m >> (vars.length - 1 - k)) & 1)); rows.push({ vals, out: evalBool(ast, Object.fromEntries(vars.map((v, k) => [v, vals[k]]))) }) }
  return { vars, rows, minterms: rows.map((r, i) => (r.out ? i : -1)).filter((i) => i >= 0) }
}
/** Minimal sum of products with Quine-McCluskey and a greedy cover. */
export function simplifySop(vars: string[], minterms: number[]): string {
  const n = vars.length
  if (!minterms.length) return '0'
  if (minterms.length === 1 << n) return '1'
  type Imp = { bits: string; covers: number[] }
  let groups: Imp[] = minterms.map((m) => ({ bits: m.toString(2).padStart(n, '0'), covers: [m] }))
  const primes: Imp[] = []
  while (groups.length) {
    const next = new Map<string, Imp>(), used = new Set<number>()
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i].bits, b = groups[j].bits; let diff = -1, ok = true
      for (let k = 0; k < n; k++) if (a[k] !== b[k]) { if (diff >= 0 || a[k] === '-' || b[k] === '-') { ok = false; break } diff = k }
      if (ok && diff >= 0) { const bits = a.slice(0, diff) + '-' + a.slice(diff + 1); used.add(i); used.add(j); if (!next.has(bits)) next.set(bits, { bits, covers: [...new Set([...groups[i].covers, ...groups[j].covers])] }) }
    }
    groups.forEach((g, i) => { if (!used.has(i) && !primes.some((p) => p.bits === g.bits)) primes.push(g) })
    groups = [...next.values()]
  }
  const left = new Set(minterms), chosen: Imp[] = []
  for (const m of minterms) { const c = primes.filter((p) => p.covers.includes(m)); if (c.length === 1 && !chosen.includes(c[0])) { chosen.push(c[0]); c[0].covers.forEach((x) => left.delete(x)) } }
  while (left.size) { const best = primes.reduce((a, b) => (b.covers.filter((x) => left.has(x)).length > a.covers.filter((x) => left.has(x)).length ? b : a)); chosen.push(best); best.covers.forEach((x) => left.delete(x)) }
  return chosen.map((p) => p.bits.split('').map((c, k) => (c === '1' ? vars[k] : c === '0' ? `¬${vars[k]}` : '')).filter(Boolean).join(' ∧ ') || '1').map((t) => (t.includes('∧') && chosen.length > 1 ? `(${t})` : t)).join(' ∨ ')
}

/* ---------- number theory ---------- */
const modpow = (b: bigint, e: bigint, m: bigint) => { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n } return r }
export function isPrime(n: bigint): boolean {
  if (n < 2n) return false
  for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) { if (n === p) return true; if (n % p === 0n) return false }
  let d = n - 1n, s = 0; while (!(d & 1n)) { d >>= 1n; s++ }
  for (const a of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
    let x = modpow(a, d, n); if (x === 1n || x === n - 1n) continue
    let comp = true; for (let r = 1; r < s; r++) { x = (x * x) % n; if (x === n - 1n) { comp = false; break } }
    if (comp) return false
  }
  return true
}
function rho(n: bigint): bigint {
  if (n % 2n === 0n) return 2n
  for (let c = 1n; c < 50n; c++) {
    let x = 2n, y = 2n, d = 1n
    const f = (v: bigint) => (v * v + c) % n
    let steps = 0
    while (d === 1n && steps++ < 200000) { x = f(x); y = f(f(y)); d = gcdB(x > y ? x - y : y - x, n) }
    if (d !== n && d !== 1n) return d
  }
  return n
}
export function factorize(n: bigint): Map<bigint, number> {
  const out = new Map<bigint, number>()
  const add = (p: bigint) => out.set(p, (out.get(p) ?? 0) + 1)
  if (n < 2n) return out
  for (const p of [2n, 3n, 5n, 7n, 11n, 13n]) while (n % p === 0n) { add(p); n /= p }
  for (let p = 17n; p * p <= n && p < 100000n; p += 2n) while (n % p === 0n) { add(p); n /= p }
  const stack = n > 1n ? [n] : []
  while (stack.length) { const m = stack.pop()!; if (isPrime(m)) { add(m); continue } const d = rho(m); if (d === m) { add(m); continue } stack.push(d, m / d) }
  return new Map([...out.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
}
export function divisorCount(f: Map<bigint, number>) { let c = 1n; f.forEach((e) => { c *= BigInt(e + 1) }); return c }
export function divisors(f: Map<bigint, number>, limit = 2000): bigint[] | null {
  if (divisorCount(f) > BigInt(limit)) return null
  let ds = [1n]; f.forEach((e, p) => { const next: bigint[] = []; for (const d of ds) { let x = d; for (let k = 0; k <= e; k++) { next.push(x); x *= p } } ds = next })
  return ds.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}
export function totient(n: bigint, f: Map<bigint, number>) { let r = n; f.forEach((_, p) => { r = (r / p) * (p - 1n) }); return r }
export const gcdAll = (xs: bigint[]) => xs.reduce((a, b) => gcdB(a, b))
export const lcmAll = (xs: bigint[]) => xs.reduce((a, b) => (a === 0n || b === 0n ? 0n : (a / gcdB(a, b)) * b))
export function nextPrime(n: bigint) { let x = n + 1n; while (!isPrime(x)) x++; return x }
export function prevPrime(n: bigint) { let x = n - 1n; while (x >= 2n && !isPrime(x)) x--; return x >= 2n ? x : null }
/** Electrons per shell (K, L, M...) from the electron configuration. */
export function shellCounts(z: number): number[] {
  const expand = (c: string): string => c.replace(/\[(\w+)\]/, (_m, s) => expand(electronConfig(BY_SYMBOL.get(s)!.z)))
  const out: number[] = []
  for (const m of expand(electronConfig(z)).matchAll(/(\d)[spdf](\d+)/g)) out[+m[1] - 1] = (out[+m[1] - 1] ?? 0) + +m[2]
  return Array.from(out, (v) => v ?? 0)
}
