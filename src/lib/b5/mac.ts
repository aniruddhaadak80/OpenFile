/* MAC address helpers (pure). */
export function normMac(s: string): string | null {
  const h = s.replace(/[^0-9a-f]/gi, '').toUpperCase()
  return h.length === 12 ? h : null
}
export function fmtMac(h: string, style: 'colon' | 'dash' | 'dot' | 'bare' | 'colon-lower') {
  const p = h.match(/../g)!
  switch (style) {
    case 'colon': return p.join(':')
    case 'colon-lower': return p.join(':').toLowerCase()
    case 'dash': return p.join('-')
    case 'dot': return (h.match(/.{4}/g) as string[]).join('.').toLowerCase()
    case 'bare': return h
  }
}
export function macInfo(h: string) {
  const first = parseInt(h.slice(0, 2), 16)
  return { multicast: !!(first & 1), local: !!(first & 2), broadcast: h === 'FFFFFFFFFFFF' }
}
export function randomMac(opts: { prefix?: string; local?: boolean; unicast?: boolean } = {}) {
  const pre = (opts.prefix ?? '').replace(/[^0-9a-f]/gi, '').toUpperCase().slice(0, 10)
  const rnd = crypto.getRandomValues(new Uint8Array(6))
  let h = pre + Array.from(rnd, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase().slice(pre.length)
  if (!pre) { let f = parseInt(h.slice(0, 2), 16); if (opts.local !== false) f = (f | 2); if (opts.unicast !== false) f = f & 0xfe; h = f.toString(16).padStart(2, '0').toUpperCase() + h.slice(2) }
  return h.slice(0, 12)
}
/** EUI-64 interface identifier and IPv6 link-local address from a MAC. */
export function eui64(h: string) {
  const b = h.match(/../g)!.map((x) => parseInt(x, 16)); b[0] ^= 2
  const e = [...b.slice(0, 3), 0xff, 0xfe, ...b.slice(3)]
  const groups = [0, 2, 4, 6].map((i) => ((e[i] << 8) | e[i + 1]).toString(16))
  return { eui64: e.map((x) => x.toString(16).padStart(2, '0')).join(':'), linkLocal: `fe80::${groups.join(':')}`.replace(/(^|:)0+(?=[0-9a-f])/g, '$1') }
}
export function lookupOui(db: Record<string, string>, h: string) {
  for (const n of [9, 7, 6]) { const v = db[h.slice(0, n)]; if (v) { const [vendor, ...addr] = v.split('\n'); return { prefix: h.slice(0, n), vendor, address: addr.join(', '), bits: n * 4 } } }
  return null
}
