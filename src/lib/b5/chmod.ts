/* Unix permission conversions (pure). */
export type Perm = { r: boolean; w: boolean; x: boolean }
export type Mode = { u: Perm; g: Perm; o: Perm; setuid: boolean; setgid: boolean; sticky: boolean }
const p = (n: number): Perm => ({ r: !!(n & 4), w: !!(n & 2), x: !!(n & 1) })
const n = (q: Perm) => (q.r ? 4 : 0) + (q.w ? 2 : 0) + (q.x ? 1 : 0)

export function fromOctal(s: string): Mode | null {
  const t = s.trim().replace(/^0o?/i, (m) => (s.trim().length > 3 ? '' : m))
  if (!/^[0-7]{3,4}$/.test(t)) return null
  const d = t.padStart(4, '0').split('').map(Number)
  return { setuid: !!(d[0] & 4), setgid: !!(d[0] & 2), sticky: !!(d[0] & 1), u: p(d[1]), g: p(d[2]), o: p(d[3]) }
}
export function toOctal(m: Mode) { const sp = (m.setuid ? 4 : 0) + (m.setgid ? 2 : 0) + (m.sticky ? 1 : 0); return (sp ? String(sp) : '') + n(m.u) + n(m.g) + n(m.o) }
export function toSymbolic(m: Mode) {
  const s = (q: Perm, special: boolean, ch: string) => (q.r ? 'r' : '-') + (q.w ? 'w' : '-') + (special ? (q.x ? ch : ch.toUpperCase()) : q.x ? 'x' : '-')
  return s(m.u, m.setuid, 's') + s(m.g, m.setgid, 's') + s(m.o, m.sticky, 't')
}
export function fromSymbolic(str: string): Mode | null {
  const t = str.trim().replace(/^[-dlbcps]/, (c) => (str.trim().length === 10 ? '' : c))
  if (!/^[r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/.test(t)) return null
  const q = (i: number): Perm => ({ r: t[i] === 'r', w: t[i + 1] === 'w', x: /[xst]/.test(t[i + 2]) })
  return { u: q(0), g: q(3), o: q(6), setuid: /[sS]/.test(t[2]), setgid: /[sS]/.test(t[5]), sticky: /[tT]/.test(t[8]) }
}
/** Build a chmod u=,g=,o= string. */
export function toUgo(m: Mode) {
  const s = (q: Perm, extra = '') => (q.r ? 'r' : '') + (q.w ? 'w' : '') + (q.x ? 'x' : '') + extra
  return `u=${s(m.u, m.setuid ? 's' : '')},g=${s(m.g, m.setgid ? 's' : '')},o=${s(m.o, m.sticky ? 't' : '')}`
}
