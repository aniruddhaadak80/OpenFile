/* Developer helpers for round 14: bencode / torrent, .env, semver and WebAssembly sections. Pure, unit tested. */

/* ---------------- bencode ---------------- */
export type BVal = number | Uint8Array | BVal[] | { [k: string]: BVal }
export interface BDecoded { value: BVal; infoStart?: number; infoEnd?: number }

export function bdecode(buf: Uint8Array): BDecoded {
  let i = 0
  let infoStart: number | undefined, infoEnd: number | undefined
  const dec = new TextDecoder()
  const num = (end: number) => { const s = dec.decode(buf.subarray(i, end)); i = end + 1; return Number(s) }
  const read = (depth: number): BVal => {
    const c = buf[i]
    if (c === 0x69) { i++; const e = buf.indexOf(0x65, i); if (e < 0) throw new Error('Broken number'); return num(e) }
    if (c === 0x6c) { i++; const l: BVal[] = []; while (buf[i] !== 0x65) { if (i >= buf.length) throw new Error('Unexpected end of file'); l.push(read(depth + 1)) } i++; return l }
    if (c === 0x64) {
      i++; const d: Record<string, BVal> = {}
      while (buf[i] !== 0x65) {
        if (i >= buf.length) throw new Error('Unexpected end of file')
        const k = dec.decode(read(depth + 1) as Uint8Array)
        const at = i
        d[k] = read(depth + 1)
        if (depth === 0 && k === 'info') { infoStart = at; infoEnd = i }
      }
      i++; return d
    }
    if (c >= 0x30 && c <= 0x39) { const colon = buf.indexOf(0x3a, i); if (colon < 0) throw new Error('Broken string'); const len = num(colon); const s = buf.subarray(i, i + len); if (s.length < len) throw new Error('Unexpected end of file'); i += len; return s }
    throw new Error(`Not a bencoded file (unexpected byte at ${i})`)
  }
  const value = read(0)
  return { value, infoStart, infoEnd }
}

const str = (v: BVal | undefined) => (v instanceof Uint8Array ? new TextDecoder().decode(v) : v == null ? '' : String(v))
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

export interface TorrentInfo { name: string; files: { path: string; size: number }[]; total: number; pieceLength: number; pieces: number; trackers: string[]; comment: string; createdBy: string; created?: Date; private: boolean; webSeeds: string[]; infoHash: string; magnet: string; v2: boolean }

export async function parseTorrent(buf: Uint8Array): Promise<TorrentInfo> {
  const { value, infoStart, infoEnd } = bdecode(buf)
  const t = value as Record<string, BVal>
  const info = t.info as Record<string, BVal> | undefined
  if (!info || infoStart == null || infoEnd == null) throw new Error('This file has no info section, so it is not a .torrent file.')
  const name = str(info['name.utf-8'] ?? info.name)
  let files: { path: string; size: number }[] = []
  if (Array.isArray(info.files)) files = (info.files as Record<string, BVal>[]).map((f) => ({ path: ((f['path.utf-8'] ?? f.path) as BVal[]).map(str).join('/'), size: Number(f.length) }))
  else if (info.length != null) files = [{ path: name, size: Number(info.length) }]
  else if (info['file tree']) { const walk = (n: Record<string, BVal>, p: string[]) => { for (const [k, v] of Object.entries(n)) { if (k === '') files.push({ path: p.join('/'), size: Number((v as any).length) }); else walk(v as Record<string, BVal>, [...p, k]) } }; walk(info['file tree'] as Record<string, BVal>, [name]) }
  const trackers = new Set<string>()
  if (t.announce) trackers.add(str(t.announce))
  if (Array.isArray(t['announce-list'])) for (const tier of t['announce-list'] as BVal[][]) for (const u of tier) trackers.add(str(u))
  const ws = t['url-list'] ? (Array.isArray(t['url-list']) ? (t['url-list'] as BVal[]).map(str) : [str(t['url-list'])]) : []
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', buf.slice(infoStart, infoEnd)))
  const infoHash = hex(digest)
  const pieces = info.pieces instanceof Uint8Array ? info.pieces.length / 20 : 0
  const magnet = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}${[...trackers].map((u) => '&tr=' + encodeURIComponent(u)).join('')}${ws.map((u) => '&ws=' + encodeURIComponent(u)).join('')}`
  return { name, files, total: files.reduce((a, f) => a + f.size, 0), pieceLength: Number(info['piece length'] ?? 0), pieces, trackers: [...trackers].filter(Boolean), comment: str(t.comment), createdBy: str(t['created by']), created: t['creation date'] ? new Date(Number(t['creation date']) * 1000) : undefined, private: Number(info.private) === 1, webSeeds: ws, infoHash, magnet, v2: info['meta version'] === 2 }
}

export function parseMagnet(uri: string) {
  const u = new URL(uri)
  if (u.protocol !== 'magnet:') throw new Error('This is not a magnet link.')
  const p = u.searchParams
  const xt = p.getAll('xt')
  const hash = xt.map((x) => x.match(/urn:btih:([a-z0-9]+)/i)?.[1]).find(Boolean) ?? ''
  return { infoHash: hash.length === 32 ? base32ToHex(hash) : hash.toLowerCase(), name: p.get('dn') ?? '', trackers: p.getAll('tr'), webSeeds: p.getAll('ws'), size: p.get('xl') ? Number(p.get('xl')) : undefined }
}
function base32ToHex(s: string) { const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of s.toUpperCase()) bits += a.indexOf(c).toString(2).padStart(5, '0'); let h = ''; for (let i = 0; i + 4 <= bits.length; i += 4) h += parseInt(bits.slice(i, i + 4), 2).toString(16); return h }

/* ---------------- .env ---------------- */
export interface EnvEntry { key: string; value: string; comment?: string }
export function parseEnv(text: string): { entries: EnvEntry[]; errors: string[] } {
  const entries: EnvEntry[] = [], errors: string[] = []
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let pending = ''
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const l = raw.trim()
    if (!l) continue
    if (l.startsWith('#')) { pending = l.replace(/^#\s?/, ''); continue }
    const m = l.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*[=:]\s*(.*)$/)
    if (!m) { errors.push(`Line ${i + 1} is not KEY=value: ${l.slice(0, 40)}`); continue }
    let v = m[2]
    const q = v[0]
    if (q === '"' || q === "'" || q === '`') {
      let body = v.slice(1)
      while (!new RegExp(`(^|[^\\\\])${q}\\s*(#.*)?$`).test(body) && i + 1 < lines.length) { i++; body += '\n' + lines[i] }
      body = body.replace(new RegExp(`${q}\\s*(#.*)?$`), '')
      v = q === '"' ? body.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\') : body
    } else v = v.replace(/\s+#.*$/, '').trim()
    entries.push({ key: m[1], value: v, comment: pending || undefined }); pending = ''
  }
  return { entries, errors }
}
const needsQuote = (v: string) => /[\s#"'\\$`]/.test(v) || v === ''
const dq = (v: string) => '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"'
const yq = (v: string) => (/^[A-Za-z0-9_./@-]+$/.test(v) && !/^(true|false|null|yes|no|on|off|~|\d+(\.\d+)?)$/i.test(v) ? v : JSON.stringify(v))
const b64 = (s: string) => { const b = new TextEncoder().encode(s); let bin = ''; b.forEach((x) => (bin += String.fromCharCode(x))); return btoa(bin) }

export type EnvFormat = 'env' | 'json' | 'yaml' | 'compose' | 'k8s-configmap' | 'k8s-secret' | 'shell' | 'powershell' | 'github' | 'dockerfile'
export function writeEnv(es: EnvEntry[], f: EnvFormat, name = 'app-config'): string {
  switch (f) {
    case 'env': return es.map((e) => (e.comment ? `# ${e.comment}\n` : '') + `${e.key}=${needsQuote(e.value) ? dq(e.value) : e.value}`).join('\n') + '\n'
    case 'json': return JSON.stringify(Object.fromEntries(es.map((e) => [e.key, e.value])), null, 2) + '\n'
    case 'yaml': return es.map((e) => `${e.key}: ${yq(e.value)}`).join('\n') + '\n'
    case 'compose': return `services:\n  app:\n    environment:\n${es.map((e) => `      ${e.key}: ${yq(e.value)}`).join('\n')}\n`
    case 'k8s-configmap': return `apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: ${name}\ndata:\n${es.map((e) => `  ${e.key}: ${JSON.stringify(e.value)}`).join('\n')}\n`
    case 'k8s-secret': return `apiVersion: v1\nkind: Secret\nmetadata:\n  name: ${name}\ntype: Opaque\ndata:\n${es.map((e) => `  ${e.key}: ${b64(e.value)}`).join('\n')}\n`
    case 'shell': return es.map((e) => `export ${e.key}='${e.value.replace(/'/g, `'\\''`)}'`).join('\n') + '\n'
    case 'powershell': return es.map((e) => `$env:${e.key} = '${e.value.replace(/'/g, "''")}'`).join('\n') + '\n'
    case 'github': return `env:\n${es.map((e) => `  ${e.key}: ${yq(e.value)}`).join('\n')}\n`
    case 'dockerfile': return es.map((e) => `ENV ${e.key}=${needsQuote(e.value) ? dq(e.value) : e.value}`).join('\n') + '\n'
  }
}
/** Read JSON or simple YAML key: value maps back into entries. */
export function readEnvAny(text: string): EnvEntry[] {
  const t = text.trim()
  if (t.startsWith('{')) { const o = JSON.parse(t); return Object.entries(o).map(([k, v]) => ({ key: k, value: typeof v === 'string' ? v : JSON.stringify(v) })) }
  if (/^\s*[A-Za-z_][\w.-]*:\s/m.test(t) && !/^\s*[A-Za-z_][\w.-]*=/m.test(t)) return t.split(/\n/).map((l) => l.match(/^\s*([A-Za-z_][\w.-]*):\s*(.*)$/)).filter(Boolean).map((m) => ({ key: m![1], value: m![2].replace(/^(["'])(.*)\1$/, '$2') })).filter((e) => e.value !== '')
  return parseEnv(text).entries
}
export function compareEnv(a: EnvEntry[], b: EnvEntry[]) {
  const ka = new Map(a.map((e) => [e.key, e.value])), kb = new Map(b.map((e) => [e.key, e.value]))
  return { onlyA: [...ka.keys()].filter((k) => !kb.has(k)), onlyB: [...kb.keys()].filter((k) => !ka.has(k)), different: [...ka.keys()].filter((k) => kb.has(k) && kb.get(k) !== ka.get(k)), empty: [...ka.entries()].filter(([, v]) => v === '').map(([k]) => k) }
}

/* ---------------- semver ---------------- */
export interface SemVer { major: number; minor: number; patch: number; pre: (string | number)[]; build: string[]; raw: string }
const SEMVER = /^\s*v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?\s*$/
export function parseSemver(s: string): SemVer | null {
  const m = s.match(SEMVER)
  if (!m) return null
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split('.').map((x) => (/^\d+$/.test(x) ? +x : x)) : [], build: m[5] ? m[5].split('.') : [], raw: s.trim() }
}
export const fmtSemver = (v: SemVer) => `${v.major}.${v.minor}.${v.patch}${v.pre.length ? '-' + v.pre.join('.') : ''}${v.build.length ? '+' + v.build.join('.') : ''}`
export function compareSemver(a: SemVer, b: SemVer): number {
  for (const k of ['major', 'minor', 'patch'] as const) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1
  if (!a.pre.length || !b.pre.length) return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1
    if (typeof x === 'number') return -1
    if (typeof y === 'number') return 1
    return x < y ? -1 : 1
  }
  return 0
}
export function bump(v: SemVer, kind: 'major' | 'minor' | 'patch' | 'premajor' | 'preminor' | 'prepatch' | 'prerelease', tag = 'beta'): SemVer {
  const n = { ...v, pre: [...v.pre], build: [] as string[] }
  const pre = () => [tag, 0]
  switch (kind) {
    case 'major': if (!(v.minor === 0 && v.patch === 0 && v.pre.length)) n.major++; n.minor = 0; n.patch = 0; n.pre = []; break
    case 'minor': if (!(v.patch === 0 && v.pre.length)) n.minor++; n.patch = 0; n.pre = []; break
    case 'patch': if (!v.pre.length) n.patch++; n.pre = []; break
    case 'premajor': n.major++; n.minor = 0; n.patch = 0; n.pre = pre(); break
    case 'preminor': n.minor++; n.patch = 0; n.pre = pre(); break
    case 'prepatch': n.patch++; n.pre = pre(); break
    case 'prerelease': if (!v.pre.length) { n.patch++; n.pre = pre() } else { const last = n.pre[n.pre.length - 1]; if (typeof last === 'number') n.pre[n.pre.length - 1] = last + 1; else n.pre.push(0) } break
  }
  return n
}

type Cmp = { op: '<' | '<=' | '>' | '>=' | '='; v: SemVer }
const sv = (major: number, minor: number, patch: number, pre: (string | number)[] = []): SemVer => ({ major, minor, patch, pre, build: [], raw: '' })
/** Expand one range term (like ^1.2, ~1.2.3, 1.x, >=1.0.0) into comparators. */
function expand(term: string): Cmp[] {
  const t = term.trim()
  if (!t || t === '*' || /^x$/i.test(t)) return []
  const m = t.match(/^(\^|~|>=|<=|>|<|=)?\s*v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
  if (!m) throw new Error(`Could not read the range part "${t}"`)
  const op = m[1] || ''
  const wild = (s?: string) => s === undefined || /^[xX*]$/.test(s)
  const M = wild(m[2]) ? null : +m[2], mi = wild(m[3]) ? null : +m[3], p = wild(m[4]) ? null : +m[4]
  const pre = m[5] ? m[5].split('.').map((x) => (/^\d+$/.test(x) ? +x : x)) : []
  if (M === null) return op === '<' || op === '>' ? [{ op: '<', v: sv(0, 0, 0, [0]) }] : []
  if (op === '^') {
    const lo = sv(M, mi ?? 0, p ?? 0, pre)
    const hi = M > 0 || mi === null ? sv(M + 1, 0, 0, [0]) : mi > 0 || p === null ? sv(0, mi + 1, 0, [0]) : sv(0, 0, p + 1, [0])
    return [{ op: '>=', v: lo }, { op: '<', v: hi }]
  }
  if (op === '~') { const lo = sv(M, mi ?? 0, p ?? 0, pre); const hi = mi === null ? sv(M + 1, 0, 0, [0]) : sv(M, mi + 1, 0, [0]); return [{ op: '>=', v: lo }, { op: '<', v: hi }] }
  if (mi === null || p === null) {
    const lo = sv(M, mi ?? 0, 0), hi = mi === null ? sv(M + 1, 0, 0, [0]) : sv(M, mi + 1, 0, [0])
    if (op === '' || op === '=') return [{ op: '>=', v: lo }, { op: '<', v: hi }]
    if (op === '>') return [{ op: '>=', v: hi }]
    if (op === '>=') return [{ op: '>=', v: lo }]
    if (op === '<') return [{ op: '<', v: lo }]
    return [{ op: '<', v: hi }]
  }
  return [{ op: (op || '=') as Cmp['op'], v: sv(M, mi, p, pre) }]
}
export function satisfies(v: SemVer, range: string, includePre = false): boolean {
  return range.split('||').some((alt) => {
    const a = alt.trim()
    const hy = a.match(/^(\S+)\s+-\s+(\S+)$/)
    let cmps: Cmp[]
    if (hy) {
      const lo = expand('>=' + hy[1])
      const hiParts = hy[2].replace(/^v/, '').split('.')
      cmps = [...lo, ...(hiParts.length < 3 || hiParts.some((x) => /^[xX*]$/.test(x)) ? expand('<' + hiParts.filter((x) => !/^[xX*]$/.test(x)).map((x, i, arr) => (i === arr.length - 1 ? String(+x + 1) : x)).join('.')) : expand('<=' + hy[2]))]
    } else cmps = a.split(/\s+/).filter(Boolean).flatMap(expand)
    const ok = cmps.every(({ op, v: c }) => { const r = compareSemver(v, c); return op === '<' ? r < 0 : op === '<=' ? r <= 0 : op === '>' ? r > 0 : op === '>=' ? r >= 0 : r === 0 })
    if (!ok) return false
    if (v.pre.length && !includePre) return cmps.some(({ v: c }) => c.pre.length && c.pre[0] !== 0 && c.major === v.major && c.minor === v.minor && c.patch === v.patch)
    return true
  })
}
export function describeRange(range: string): string {
  try {
    return range.split('||').map((alt) => {
      const cmps = alt.trim().split(/\s+/).filter(Boolean).flatMap(expand)
      if (!cmps.length) return 'any version'
      return cmps.map(({ op, v }) => `${op === '>=' ? 'at least' : op === '>' ? 'above' : op === '<' ? 'below' : op === '<=' ? 'at most' : 'exactly'} ${fmtSemver({ ...v, pre: v.pre.length === 1 && v.pre[0] === 0 ? [] : v.pre })}`).join(' and ')
    }).join(', or ')
  } catch (e: any) { return e.message }
}

/* ---------------- WebAssembly ---------------- */
export interface WasmInfo { version: number; sections: { id: number; name: string; size: number; offset: number }[]; imports: { module: string; name: string; kind: string; type?: string }[]; exports: { name: string; kind: string; index: number; type?: string }[]; functions: number; memories: string[]; tables: string[]; globals: number; dataSegments: number; customs: string[]; start?: number; names: Map<number, string>; producers: string[]; features: string[] }
const SECT = ['custom', 'type', 'import', 'function', 'table', 'memory', 'global', 'export', 'start', 'element', 'code', 'data', 'data count', 'tag']
const VALT: Record<number, string> = { 0x7f: 'i32', 0x7e: 'i64', 0x7d: 'f32', 0x7c: 'f64', 0x7b: 'v128', 0x70: 'funcref', 0x6f: 'externref' }
const KIND = ['func', 'table', 'memory', 'global', 'tag']

export function parseWasm(b: Uint8Array): WasmInfo {
  if (b.length < 8 || b[0] !== 0 || b[1] !== 0x61 || b[2] !== 0x73 || b[3] !== 0x6d) throw new Error('This is not a WebAssembly binary (missing the \\0asm header).')
  let p = 8
  const dec = new TextDecoder()
  const u = () => { let r = 0, s = 0, x: number; do { x = b[p++]; r |= (x & 0x7f) << s; s += 7 } while (x & 0x80 && s < 35); return r >>> 0 }
  const name = () => { const n = u(); const s = dec.decode(b.subarray(p, p + n)); p += n; return s }
  const limits = () => { const f = b[p++]; const min = u(); const max = f & 1 ? u() : undefined; return `${min}${max != null ? '..' + max : '+'}${f & 2 ? ' shared' : ''}` }
  const info: WasmInfo = { version: b[4] | (b[5] << 8), sections: [], imports: [], exports: [], functions: 0, memories: [], tables: [], globals: 0, dataSegments: 0, customs: [], names: new Map(), producers: [], features: [] }
  const types: string[] = []
  const funcTypes: number[] = []
  let importedFuncs = 0
  while (p < b.length) {
    const id = b[p++], size = u(), start = p, end = p + size
    info.sections.push({ id, name: SECT[id] ?? `unknown ${id}`, size, offset: start })
    try {
      if (id === 1) { const n = u(); for (let i = 0; i < n; i++) { const form = b[p++]; if (form !== 0x60) break; const pc = u(); const ps: string[] = []; for (let k = 0; k < pc; k++) ps.push(VALT[b[p++]] ?? '?'); const rc = u(); const rs: string[] = []; for (let k = 0; k < rc; k++) rs.push(VALT[b[p++]] ?? '?'); types.push(`(${ps.join(', ')}) -> ${rs.length ? rs.join(', ') : 'nothing'}`) } }
      else if (id === 2) { const n = u(); for (let i = 0; i < n; i++) { const mod = name(), nm = name(), k = b[p++]; let type: string | undefined; if (k === 0) { const t = u(); type = types[t]; funcTypes.push(t); importedFuncs++ } else if (k === 1) { p++; type = 'table ' + limits() } else if (k === 2) type = 'pages ' + limits(); else if (k === 3) { type = (VALT[b[p++]] ?? '?') + (b[p++] ? ' mutable' : ''); } else if (k === 4) { p++; u() } info.imports.push({ module: mod, name: nm, kind: KIND[k] ?? '?', type }) } }
      else if (id === 3) { const n = u(); info.functions = n; for (let i = 0; i < n; i++) funcTypes.push(u()) }
      else if (id === 4) { const n = u(); for (let i = 0; i < n; i++) { const et = VALT[b[p++]] ?? '?'; info.tables.push(`${et} ${limits()}`) } }
      else if (id === 5) { const n = u(); for (let i = 0; i < n; i++) info.memories.push(limits() + ' pages (64 KiB each)') }
      else if (id === 6) { info.globals = u() }
      else if (id === 7) { const n = u(); for (let i = 0; i < n; i++) { const nm = name(), k = b[p++], idx = u(); info.exports.push({ name: nm, kind: KIND[k] ?? '?', index: idx, type: k === 0 ? types[funcTypes[idx]] : undefined }) } }
      else if (id === 8) info.start = u()
      else if (id === 11) info.dataSegments = u()
      else if (id === 0) {
        const nm = name(); info.customs.push(nm)
        if (nm === 'name') { while (p < end) { const sub = b[p++], ss = u(), se = p + ss; if (sub === 1) { const n = u(); for (let i = 0; i < n && p < se; i++) { const idx = u(); info.names.set(idx, name()) } } p = se } }
        else if (nm === 'producers') { const n = u(); for (let i = 0; i < n; i++) { const field = name(); const m = u(); for (let k = 0; k < m; k++) { const v = name(), ver = name(); info.producers.push(`${field}: ${v}${ver ? ' ' + ver : ''}`) } } }
        else if (nm === 'target_features') { const n = u(); for (let i = 0; i < n; i++) { const pre = String.fromCharCode(b[p++]); info.features.push(pre + name()) } }
      }
    } catch { /* keep the section list even if one section cannot be decoded */ }
    p = end
  }
  for (const e of info.exports) if (e.kind === 'func' && !e.type) e.type = types[funcTypes[e.index]]
  void importedFuncs
  return info
}
