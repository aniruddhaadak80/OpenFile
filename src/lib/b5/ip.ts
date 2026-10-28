/* IPv4 / IPv6 math with BigInt (pure). */
export type Ver = 4 | 6
export type Addr = { v: Ver; n: bigint }

export function parseV4(s: string): bigint | null {
  const p = s.trim().split('.')
  if (p.length !== 4) return null
  let n = 0n
  for (const x of p) { if (!/^\d{1,3}$/.test(x) || Number(x) > 255) return null; n = (n << 8n) | BigInt(Number(x)) }
  return n
}

export function parseV6(s: string): bigint | null {
  let t = s.trim().replace(/^\[|\]$/g, '').split('%')[0]
  if (!t.includes(':')) return null
  // embedded IPv4 tail
  const v4m = t.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (v4m) { const v4 = parseV4(v4m[1]); if (v4 === null) return null; t = t.slice(0, -v4m[1].length) + ((v4 >> 16n) & 0xffffn).toString(16) + ':' + (v4 & 0xffffn).toString(16) }
  const dbl = t.split('::')
  if (dbl.length > 2) return null
  const head = dbl[0] ? dbl[0].split(':') : []
  const tail = dbl.length === 2 && dbl[1] ? dbl[1].split(':') : []
  const fill = 8 - head.length - tail.length
  if (dbl.length === 1 && head.length !== 8) return null
  if (dbl.length === 2 && fill < 1) return null
  const groups = [...head, ...Array(dbl.length === 2 ? fill : 0).fill('0'), ...tail]
  let n = 0n
  for (const g of groups) { if (!/^[0-9a-f]{1,4}$/i.test(g)) return null; n = (n << 16n) | BigInt(parseInt(g, 16)) }
  return n
}

export function parseAddr(s: string): Addr | null {
  const v4 = parseV4(s); if (v4 !== null) return { v: 4, n: v4 }
  const v6 = parseV6(s); if (v6 !== null) return { v: 6, n: v6 }
  return null
}

export const bits = (v: Ver) => (v === 4 ? 32 : 128)
export const maxOf = (v: Ver) => (1n << BigInt(bits(v))) - 1n

export function fmtV4(n: bigint) { return [24n, 16n, 8n, 0n].map((s) => ((n >> s) & 255n).toString()).join('.') }
export function fmtV6Full(n: bigint) { return Array.from({ length: 8 }, (_, i) => ((n >> BigInt((7 - i) * 16)) & 0xffffn).toString(16).padStart(4, '0')).join(':') }
export function fmtV6(n: bigint) {
  const g = Array.from({ length: 8 }, (_, i) => ((n >> BigInt((7 - i) * 16)) & 0xffffn).toString(16))
  let best = -1, bestLen = 0
  for (let i = 0; i < 8;) { if (g[i] === '0') { let j = i; while (j < 8 && g[j] === '0') j++; if (j - i > bestLen && j - i > 1) { best = i; bestLen = j - i } i = j } else i++ }
  if (best < 0) return g.join(':')
  return g.slice(0, best).join(':') + '::' + g.slice(best + bestLen).join(':')
}
export const fmt = (a: Addr) => (a.v === 4 ? fmtV4(a.n) : fmtV6(a.n))

export function parseCidr(s: string): { addr: Addr; prefix: number } | null {
  const [ip, pre, extra] = s.trim().split('/')
  if (extra !== undefined) return null
  const addr = parseAddr(ip); if (!addr) return null
  let prefix = bits(addr.v)
  if (pre !== undefined && pre !== '') {
    if (/^\d+$/.test(pre)) prefix = Number(pre)
    else if (addr.v === 4) { const m = parseV4(pre); if (m === null) return null; const p = maskToPrefix(m); if (p === null) return null; prefix = p }
    else return null
  }
  if (prefix < 0 || prefix > bits(addr.v)) return null
  return { addr, prefix }
}

export function maskToPrefix(m: bigint): number | null {
  const s = m.toString(2).padStart(32, '0'); if (!/^1*0*$/.test(s)) return null; return s.indexOf('0') === -1 ? 32 : s.indexOf('0')
}

export function netMask(v: Ver, prefix: number) { const b = BigInt(bits(v)); return prefix === 0 ? 0n : ((1n << BigInt(prefix)) - 1n) << (b - BigInt(prefix)) }

export function subnetInfo(addr: Addr, prefix: number) {
  const mask = netMask(addr.v, prefix)
  const wild = maxOf(addr.v) ^ mask
  const network = addr.n & mask
  const last = network | wild
  const total = wild + 1n
  let first = network, lastHost = last, usable = total
  if (addr.v === 4 && prefix <= 30) { first = network + 1n; lastHost = last - 1n; usable = total - 2n }
  return { mask, wild, network, last, total, first, lastHost, usable }
}

export function v4Class(n: bigint) {
  const a = Number(n >> 24n)
  return a < 128 ? 'A' : a < 192 ? 'B' : a < 224 ? 'C' : a < 240 ? 'D (multicast)' : 'E (reserved)'
}

const inNet = (n: bigint, net: string, v: Ver) => { const c = parseCidr(net)!; const m = netMask(v, c.prefix); return (n & m) === (c.addr.n & m) }
export function addrType(a: Addr): string {
  const tests: [string, string][] = a.v === 4
    ? [['0.0.0.0/8', 'This network'], ['10.0.0.0/8', 'Private (RFC 1918)'], ['100.64.0.0/10', 'Carrier-grade NAT'], ['127.0.0.0/8', 'Loopback'], ['169.254.0.0/16', 'Link-local'], ['172.16.0.0/12', 'Private (RFC 1918)'], ['192.0.2.0/24', 'Documentation'], ['192.168.0.0/16', 'Private (RFC 1918)'], ['198.18.0.0/15', 'Benchmarking'], ['198.51.100.0/24', 'Documentation'], ['203.0.113.0/24', 'Documentation'], ['224.0.0.0/4', 'Multicast'], ['255.255.255.255/32', 'Broadcast'], ['240.0.0.0/4', 'Reserved']]
    : [['::1/128', 'Loopback'], ['::/128', 'Unspecified'], ['::ffff:0:0/96', 'IPv4-mapped'], ['64:ff9b::/96', 'NAT64'], ['2001:db8::/32', 'Documentation'], ['2001::/32', 'Teredo'], ['2002::/16', '6to4'], ['fc00::/7', 'Unique local (ULA)'], ['fe80::/10', 'Link-local'], ['ff00::/8', 'Multicast'], ['2000::/3', 'Global unicast']]
  for (const [net, label] of tests) if (inNet(a.n, net, a.v)) return label
  return a.v === 4 ? 'Public' : 'Reserved'
}

export function reverseDns(a: Addr) {
  if (a.v === 4) return fmtV4(a.n).split('.').reverse().join('.') + '.in-addr.arpa'
  return fmtV6Full(a.n).replace(/:/g, '').split('').reverse().join('.') + '.ip6.arpa'
}

export function toBinary(a: Addr) {
  const s = a.n.toString(2).padStart(bits(a.v), '0')
  return a.v === 4 ? s.match(/.{8}/g)!.join('.') : s.match(/.{16}/g)!.join(':')
}

/** Split a network into equal subnets of newPrefix. */
export function splitSubnets(addr: Addr, prefix: number, newPrefix: number, limit = 1024) {
  const out: { network: bigint; last: bigint }[] = []
  if (newPrefix < prefix || newPrefix > bits(addr.v)) return { out, total: 0n }
  const size = 1n << BigInt(bits(addr.v) - newPrefix)
  const base = addr.n & netMask(addr.v, prefix)
  const total = 1n << BigInt(newPrefix - prefix)
  for (let i = 0n; i < total && i < BigInt(limit); i++) out.push({ network: base + i * size, last: base + (i + 1n) * size - 1n })
  return { out, total }
}

/** Smallest list of CIDR blocks covering start..end. */
export function rangeToCidrs(v: Ver, start: bigint, end: bigint, limit = 4096): string[] {
  const out: string[] = []; const B = bits(v)
  let cur = start
  while (cur <= end && out.length < limit) {
    let size = B
    while (size > 0) {
      const m = netMask(v, size - 1)
      if ((cur & m) !== cur) break
      if ((cur | (maxOf(v) ^ m)) > end) break
      size--
    }
    out.push(`${fmt({ v, n: cur })}/${size}`)
    cur += 1n << BigInt(B - size)
  }
  return out
}

export function randomUla(): string {
  const r = crypto.getRandomValues(new Uint8Array(5))
  const g = [0xfd00 | r[0], (r[1] << 8) | r[2], (r[3] << 8) | r[4]]
  return `${g.map((x) => x.toString(16).padStart(4, '0')).join(':')}::/48`
}

export function v4ToMapped(n: bigint) { return fmtV6((0xffffn << 32n) | n) }
