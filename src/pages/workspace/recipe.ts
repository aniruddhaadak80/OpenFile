/* Recipes: the pipeline graph, its schema check, share links and undo history.
 * Pure TypeScript (plus fflate), loaded by the Node tests in scripts/tests/workspace. */
import { strToU8, strFromU8, deflateSync, inflateSync } from 'fflate'
import { metaOf, ALIASES, type ParamDef } from './catalog.ts'

export const IN = '@in'
export const OUT = '@out'
export type GNode = { id: string; step: string; params: Record<string, any>; enabled: boolean; x: number; y: number }
export type Edge = [string, string]
export type Graph = { nodes: GNode[]; edges: Edge[] }
export type Recipe = { v: 1; name: string; desc?: string; graph: Graph }

export const LIMITS = { nodes: 60, edges: 120, name: 80, desc: 300, text: 200, hash: 12000, json: 200_000 }
const ID_RE = /^[A-Za-z0-9_@-]{1,24}$/
const COLOR_RE = /^#[0-9a-f]{6}$/i

let seq = 0
export function newId(): string {
  const r = typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 2 ** 32)
  return 'n' + (r.toString(36) + (seq++).toString(36)).slice(0, 9)
}

/** Remove control characters and trim to a max length. */
export function cleanText(v: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max)
}

/** Coerce one param value to its declared type, or fall back to the default. */
export function coerceParam(p: ParamDef, v: unknown): any {
  switch (p.type) {
    case 'number': {
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
      if (!Number.isFinite(n)) return p.default
      return Math.min(p.max ?? Number.MAX_SAFE_INTEGER, Math.max(p.min ?? -Number.MAX_SAFE_INTEGER, n))
    }
    case 'bool': return typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : p.default
    case 'select': return p.options!.includes(String(v)) ? String(v) : p.default
    case 'color': return typeof v === 'string' && COLOR_RE.test(v) ? v.toLowerCase() : p.default
    default: return typeof v === 'string' || typeof v === 'number' ? cleanText(v, LIMITS.text) : p.default
  }
}

export function cleanParams(step: string, raw: unknown): Record<string, any> {
  const m = metaOf(step)
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const out: Record<string, any> = {}
  for (const p of m?.params ?? []) out[p.key] = Object.prototype.hasOwnProperty.call(src, p.key) ? coerceParam(p, src[p.key]) : p.default
  return out
}

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-100000, Math.min(100000, Math.round(v))) : d)

/** Kahn's algorithm. Returns node ids in run order, or null when the graph has a cycle. */
export function topoOrder(g: Graph): string[] | null {
  const indeg = new Map(g.nodes.map((n) => [n.id, 0]))
  const out = new Map<string, string[]>(g.nodes.map((n) => [n.id, []]))
  for (const [a, b] of g.edges) { if (!indeg.has(a) || !indeg.has(b)) continue; indeg.set(b, indeg.get(b)! + 1); out.get(a)!.push(b) }
  const pos = new Map(g.nodes.map((n, i) => [n.id, i]))
  const ready = g.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id)
  const order: string[] = []
  while (ready.length) {
    ready.sort((a, b) => (a === IN ? -1 : b === IN ? 1 : pos.get(a)! - pos.get(b)!))
    const id = ready.shift()!
    order.push(id)
    for (const t of out.get(id)!) { indeg.set(t, indeg.get(t)! - 1); if (indeg.get(t) === 0) ready.push(t) }
  }
  return order.length === g.nodes.length ? order : null
}

export const wouldCycle = (g: Graph, a: string, b: string) => a === b || topoOrder({ ...g, edges: [...g.edges, [a, b]] }) === null

/** True when the graph is one straight line from input to output (what list mode can show). */
export function isLinear(g: Graph): boolean {
  const ins = new Map<string, number>(), outs = new Map<string, number>()
  for (const [a, b] of g.edges) { outs.set(a, (outs.get(a) ?? 0) + 1); ins.set(b, (ins.get(b) ?? 0) + 1) }
  return [...ins.values(), ...outs.values()].every((n) => n <= 1) && chain(g).length === g.nodes.filter((n) => n.id !== IN && n.id !== OUT).length
}

/** The steps in order along the main path from the input (first edge at each fork). */
export function chain(g: Graph): GNode[] {
  const by = new Map(g.nodes.map((n) => [n.id, n]))
  const res: GNode[] = []
  const seen = new Set<string>()
  let cur = IN
  for (;;) {
    const e = g.edges.find(([a]) => a === cur)
    if (!e || seen.has(e[1])) break
    cur = e[1]; seen.add(cur)
    if (cur === OUT) break
    const n = by.get(cur); if (n) res.push(n)
  }
  return res
}

/** Build a straight-line graph from steps (list mode, presets, old recipes). */
export function linearGraph(steps: { id?: string; step: string; params?: Record<string, any>; enabled?: boolean }[]): Graph {
  const nodes: GNode[] = [{ id: IN, step: IN, params: {}, enabled: true, x: 0, y: 120 }]
  steps.forEach((s, i) => nodes.push({ id: s.id ?? newId(), step: ALIASES[s.step] ?? s.step, params: cleanParams(s.step, s.params ?? {}), enabled: s.enabled !== false, x: 240 * (i + 1), y: 120 }))
  nodes.push({ id: OUT, step: OUT, params: {}, enabled: true, x: 240 * (steps.length + 1), y: 120 })
  const edges: Edge[] = nodes.slice(1).map((n, i) => [nodes[i].id, n.id])
  return { nodes, edges }
}

/** Re-lay a graph as the given ordered steps, keeping ids and params (list mode reorder, flatten). */
export function relink(g: Graph, ordered: GNode[]): Graph {
  const lin = linearGraph(ordered.map((n) => ({ id: n.id, step: n.step, params: n.params, enabled: n.enabled })))
  return lin
}

export type Check = { ok: true; recipe: Recipe; warnings: string[] } | { ok: false; errors: string[] }

/**
 * Validate and sanitize a recipe from an untrusted source (import, share link, other tab, old storage).
 * Unknown steps and params are dropped, values are coerced and clamped, ids and edges are checked, cycles are refused.
 * Also accepts the old format { name, mode, steps: [{ id, params, enabled }] } and the bare graph form.
 */
export function validateRecipe(raw: unknown): Check {
  const errors: string[] = [], warnings: string[] = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['A recipe must be a JSON object.'] }
  const r = raw as Record<string, any>
  const name = cleanText(r.name, LIMITS.name).trim() || 'Untitled recipe'
  const desc = r.desc != null ? cleanText(r.desc, LIMITS.desc) : undefined
  // old format: a list of steps
  if (Array.isArray(r.steps) && !r.graph) {
    if (r.steps.length > LIMITS.nodes) return { ok: false, errors: [`Too many steps (max ${LIMITS.nodes}).`] }
    const steps = r.steps.filter((s: any) => s && typeof s === 'object' && typeof s.id === 'string' && metaOf(s.id))
    if (steps.length < r.steps.length) warnings.push(`${r.steps.length - steps.length} unknown step(s) were left out.`)
    return { ok: true, recipe: { v: 1, name, desc, graph: linearGraph(steps.map((s: any) => ({ step: s.id, params: s.params, enabled: s.enabled }))) }, warnings }
  }
  const g = r.graph
  if (!g || typeof g !== 'object' || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) return { ok: false, errors: ['The recipe has no graph with nodes and edges.'] }
  if (g.nodes.length > LIMITS.nodes + 2) errors.push(`Too many steps (max ${LIMITS.nodes}).`)
  if (g.edges.length > LIMITS.edges) errors.push(`Too many links (max ${LIMITS.edges}).`)
  if (errors.length) return { ok: false, errors }
  const nodes: GNode[] = []
  const ids = new Set<string>()
  for (const n of g.nodes) {
    if (!n || typeof n !== 'object' || typeof n.id !== 'string' || !ID_RE.test(n.id) || ids.has(n.id)) { warnings.push('A step with a bad or repeated id was left out.'); continue }
    const special = n.id === IN || n.id === OUT
    const step = special ? n.id : typeof n.step === 'string' ? ALIASES[n.step] ?? n.step : ''
    if (!special && !metaOf(step)) { warnings.push(`Unknown step "${cleanText(n.step, 40)}" was left out.`); continue }
    ids.add(n.id)
    nodes.push({ id: n.id, step, params: special ? {} : cleanParams(step, n.params), enabled: n.enabled !== false, x: num(n.x, nodes.length * 240), y: num(n.y, 120) })
  }
  if (!ids.has(IN)) nodes.unshift({ id: IN, step: IN, params: {}, enabled: true, x: -240, y: 120 })
  if (!ids.has(OUT)) nodes.push({ id: OUT, step: OUT, params: {}, enabled: true, x: 240 * nodes.length, y: 120 })
  const have = new Set(nodes.map((n) => n.id))
  const seen = new Set<string>()
  const edges: Edge[] = []
  for (const e of g.edges) {
    if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'string' || typeof e[1] !== 'string') continue
    const [a, b] = e
    if (!have.has(a) || !have.has(b) || a === b || a === OUT || b === IN || seen.has(a + '>' + b)) continue
    seen.add(a + '>' + b); edges.push([a, b])
  }
  const graph = { nodes, edges }
  if (!topoOrder(graph)) return { ok: false, errors: ['The recipe links loop back on themselves.'] }
  return { ok: true, recipe: { v: 1, name, desc, graph }, warnings }
}

export function parseRecipeJson(text: string): Check {
  if (text.length > LIMITS.json) return { ok: false, errors: ['That file is too large to be a recipe.'] }
  try { return validateRecipe(JSON.parse(text)) } catch { return { ok: false, errors: ['That is not valid JSON.'] } }
}

/** Compact form for links: drops positions of a straight line and default params. */
function compact(r: Recipe) {
  return { v: 1, name: r.name, desc: r.desc, graph: { nodes: r.graph.nodes.map((n) => ({ id: n.id, step: n.step, params: n.params, enabled: n.enabled ? undefined : false, x: n.x, y: n.y })), edges: r.graph.edges } }
}

const b64url = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
const unb64url = (s: string) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u }

/** Encode a recipe for a URL hash: #recipe=<base64url(deflate(json))> */
export function encodeShare(r: Recipe): string {
  return 'recipe=' + b64url(deflateSync(strToU8(JSON.stringify(compact(r))), { level: 9 }))
}

/** Decode and validate a recipe from a URL hash. Never throws. */
export function decodeShare(hash: string): Check {
  const m = /(?:^|[#&])recipe=([A-Za-z0-9_-]+)/.exec(hash || '')
  if (!m) return { ok: false, errors: ['No recipe in this link.'] }
  if (m[1].length > LIMITS.hash) return { ok: false, errors: ['This recipe link is too long.'] }
  try {
    const bytes = inflateSync(unb64url(m[1]))
    if (bytes.length > LIMITS.json) return { ok: false, errors: ['This recipe link is too large.'] }
    return parseRecipeJson(strFromU8(bytes))
  } catch { return { ok: false, errors: ['This recipe link is damaged.'] } }
}

/* ---------- undo / redo ---------- */
export type History<T> = { past: T[]; present: T; future: T[]; key?: string; at?: number }
export const HISTORY_CAP = 100
export const history = <T,>(present: T): History<T> => ({ past: [], present, future: [] })
/** Push a new state. Edits with the same `key` within `mergeMs` (typing in one field) fold into one undo step. */
export function push<T>(h: History<T>, next: T, key?: string, now = Date.now(), mergeMs = 800): History<T> {
  if (next === h.present) return h
  if (key && h.key === key && h.at && now - h.at < mergeMs) return { ...h, present: next, future: [], at: now }
  return { past: [...h.past, h.present].slice(-HISTORY_CAP), present: next, future: [], key, at: now }
}
export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], key: undefined }
}
export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), key: undefined }
}

/* ---------- renaming ---------- */
export function renamePattern(pattern: string, ctx: { name: string; n: number; date: string; ext: string; kind: string }, kase = 'keep'): string {
  const base = ctx.name.replace(/\.[^.]+$/, '')
  let s = String(pattern || '{name}').replace(/\{name\}/g, base).replace(/\{n\}/g, String(ctx.n).padStart(3, '0')).replace(/\{date\}/g, ctx.date).replace(/\{ext\}/g, ctx.ext).replace(/\{kind\}/g, ctx.kind)
  if (kase === 'lower') s = s.toLowerCase()
  else if (kase === 'upper') s = s.toUpperCase()
  else if (kase === 'kebab') s = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  // no path separators or reserved characters in a file name
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').slice(0, 180) || 'file'
  return ctx.ext ? `${s}.${ctx.ext}` : s
}
