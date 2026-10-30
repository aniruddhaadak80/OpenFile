/* Workspace run engine: walks the pipeline graph, runs per-file steps through a concurrency-limited pool,
 * supports pause, resume, cancel, retry of failed files, a memory guard and progress with ETA.
 * No DOM access here, so the Node tests drive it with fake steps. */
import { IN, OUT, topoOrder, type Graph, type GNode } from './recipe.ts'

export type Item = { id: string; name: string; blob: Blob; src: string; path?: string; kept?: boolean; note?: string }
export type Runner = {
  batch: boolean
  /** max parallel files for this step (1 for ffmpeg, OCR, AI) */
  limit?: number
  accepts: (it: Item) => boolean
  run: (items: Item[], onP: (r: number) => void, signal: AbortSignal) => Promise<Omit<Item, 'id' | 'src'>[] | Item[]>
}
export type FileState = 'queued' | 'running' | 'done' | 'error' | 'cancelled'
export type FileStatus = { state: FileState; node?: string; error?: string; progress: number }
export type NodeState = 'idle' | 'wait' | 'run' | 'done' | 'error' | 'skip'
export type Hooks = {
  onNode?: (id: string, state: NodeState, frac: number) => void
  onFile?: (src: string, s: FileStatus) => void
  onProgress?: (overall: number, etaMs: number | null) => void
  onLog?: (line: string) => void
}

export class Cancelled extends Error { constructor() { super('Cancelled') } }

const gates = new WeakMap<AbortSignal, () => Promise<void>>()
/** Called by long steps between pages or chunks: waits while the run is paused, throws Cancelled once it is cancelled. */
export async function waitTurn(signal?: AbortSignal) {
  if (!signal) return
  const g = gates.get(signal)
  if (g) return g()
  if (signal.aborted) throw new Cancelled()
}

/** Pause, resume and cancel for one run. Nothing new starts while paused, and steps that call waitTurn stop at their next page. */
export class RunControl {
  paused = false
  private ac = new AbortController()
  private waiters: (() => void)[] = []
  constructor() { gates.set(this.ac.signal, () => this.gate()) }
  get signal() { return this.ac.signal }
  get cancelled() { return this.ac.signal.aborted }
  pause() { this.paused = true }
  resume() { this.paused = false; this.waiters.splice(0).forEach((w) => w()) }
  cancel() { this.ac.abort(); this.resume() }
  async gate() {
    while (this.paused && !this.cancelled) await new Promise<void>((r) => this.waiters.push(r))
    if (this.cancelled) throw new Cancelled()
  }
}

export type Settled<R> = { ok: true; value: R } | { ok: false; error: unknown }

/**
 * Run `fn` over `list` with at most `concurrency()` tasks at once. The limit is read again each time a slot frees,
 * so it can change during a run (memory guard, user slider). `guard` can delay the next task (memory pressure).
 */
export async function pool<T, R>(list: T[], fn: (t: T, i: number) => Promise<R>, o: { concurrency: () => number; control?: RunControl; guard?: () => Promise<void>; onSettled?: (i: number, s: Settled<R>) => void }): Promise<Settled<R>[]> {
  const res: Settled<R>[] = new Array(list.length)
  let next = 0, active = 0
  return new Promise((resolve) => {
    if (!list.length) return resolve(res)
    let done = 0
    const pump = async () => {
      while (active < Math.max(1, o.concurrency()) && next < list.length) {
        const i = next++
        active++
        ;(async () => {
          try {
            await o.control?.gate()
            await o.guard?.()
            res[i] = { ok: true, value: await fn(list[i], i) }
          } catch (error) { res[i] = { ok: false, error } }
          o.onSettled?.(i, res[i])
          active--; done++
          if (done === list.length) resolve(res)
          else pump()
        })()
      }
    }
    pump()
  })
}

/** Remaining time from the share done and the time spent. Null until there is enough to go on. */
export function eta(frac: number, elapsedMs: number): number | null {
  if (!(frac > 0.02) || elapsedMs < 400) return null
  if (frac >= 1) return 0
  return Math.round((elapsedMs / frac) * (1 - frac))
}

/** Pick a starting concurrency from the device: cores minus one, capped, lower on small-memory devices. */
export function autoConcurrency(cores = 4, memGb?: number): number {
  let n = Math.max(1, Math.min(6, (cores || 2) - 1))
  if (memGb && memGb <= 2) n = Math.min(n, 2)
  else if (memGb && memGb <= 4) n = Math.min(n, 3)
  return n
}

let itemSeq = 0
export const itemId = () => 'i' + (itemSeq++).toString(36)
const extName = (n: string) => (/\.([a-z0-9]{1,8})$/i.exec(n)?.[1] ?? '').toLowerCase()

/**
 * Keep the original file when a 1:1 result of the same type came out bigger (the never-bigger rule for the whole pipeline).
 * Applies only when one input produced exactly one output with the same extension.
 */
export function keepOriginals(outputs: Item[], inputs: Map<string, Item>): Item[] {
  const count = new Map<string, number>()
  outputs.forEach((o) => count.set(o.src, (count.get(o.src) ?? 0) + 1))
  return outputs.map((o) => {
    const i = inputs.get(o.src)
    if (!i || count.get(o.src) !== 1 || o.blob === i.blob) return o
    if (extName(o.name) !== extName(i.name) || o.blob.size < i.blob.size) return o
    return { ...o, blob: i.blob, kept: true, note: 'Kept the original, the result was not smaller' }
  })
}

export type RunResult = { outputs: Item[]; failed: Map<string, string>; cancelled: boolean; ms: number }

/**
 * Run the graph. Every node gets the union of what its incoming links carry. Per-file steps go through the pool,
 * batch steps get the whole set. Files a step does not accept pass straight through. A file that fails is
 * dropped from later steps and reported in `failed`; the rest of the batch carries on.
 */
export async function runGraph(o: {
  graph: Graph
  inputs: Item[]
  resolve: (n: GNode) => Runner | undefined
  control: RunControl
  concurrency: () => number
  guard?: () => Promise<void>
  hooks?: Hooks
  keepSmaller?: boolean
  now?: () => number
}): Promise<RunResult> {
  const now = o.now ?? (() => Date.now())
  const t0 = now()
  const h = o.hooks ?? {}
  const order = topoOrder(o.graph)
  if (!order) throw new Error('The pipeline links loop back on themselves.')
  const byId = new Map(o.graph.nodes.map((n) => [n.id, n]))
  const work = order.filter((id) => id !== IN && id !== OUT)
  const failed = new Map<string, string>()
  const status = new Map<string, FileStatus>()
  const setFile = (src: string, s: Partial<FileStatus>) => { const cur = { ...(status.get(src) ?? { state: 'queued', progress: 0 }), ...s } as FileStatus; status.set(src, cur); h.onFile?.(src, cur) }
  o.inputs.forEach((it) => setFile(it.src, { state: 'queued', progress: 0 }))
  work.forEach((id) => h.onNode?.(id, 'wait', 0))
  const outs = new Map<string, Item[]>([[IN, o.inputs]])
  let doneNodes = 0
  const report = (frac: number) => { const overall = work.length ? Math.min(1, (doneNodes + frac) / work.length) : 1; h.onProgress?.(overall, eta(overall, now() - t0)) }
  const incoming = (id: string) => {
    const seen = new Set<Item>(), list: Item[] = []
    for (const [a, b] of o.graph.edges) if (b === id) for (const it of outs.get(a) ?? []) if (!seen.has(it) && !failed.has(it.src)) { seen.add(it); list.push(it) }
    return list
  }
  const fileFrac = (src: string) => setFile(src, { progress: Math.min(0.99, (doneNodes + 1) / Math.max(1, work.length)) })
  let cancelled = false
  try {
    for (const id of work) {
      const node = byId.get(id)!
      const input = incoming(id)
      const r = node.enabled ? o.resolve(node) : undefined
      if (!r) { outs.set(id, input); h.onNode?.(id, node.enabled ? 'error' : 'skip', 1); doneNodes++; report(0); continue }
      const take = input.filter((it) => r.accepts(it))
      const pass = input.filter((it) => !r.accepts(it))
      h.onNode?.(id, 'run', 0)
      const t = now()
      let result: Item[] = []
      if (!take.length) { /* nothing for this step */ }
      else if (r.batch) {
        await o.control.gate()
        take.forEach((it) => setFile(it.src, { state: 'running', node: id }))
        try {
          const made = await r.run(take, (f) => { h.onNode?.(id, 'run', f); report(f) }, o.control.signal)
          const src = take.length === 1 ? take[0].src : '@batch'
          result = made.map((m) => ({ ...m, id: itemId(), src: (m as Item).src ?? src } as Item))
          take.forEach((it) => fileFrac(it.src))
        } catch (e) {
          if (o.control.cancelled) throw new Cancelled()
          const msg = String((e as Error)?.message || e)
          take.forEach((it) => { failed.set(it.src, msg); setFile(it.src, { state: 'error', error: msg, node: id }) })
          h.onLog?.(`✗ ${id}: ${msg}`)
        }
      } else {
        let fin = 0
        const settled = await pool(take, async (it) => {
          setFile(it.src, { state: 'running', node: id })
          const made = await r.run([it], (f) => { h.onNode?.(id, 'run', (fin + f) / take.length); report((fin + f) / take.length) }, o.control.signal)
          return made.map((m) => ({ ...m, id: itemId(), src: it.src, path: (m as Item).path ?? it.path } as Item))
        }, {
          concurrency: () => Math.min(o.concurrency(), r.limit ?? Infinity),
          control: o.control, guard: o.guard,
          onSettled: (i, s) => {
            fin++
            const it = take[i]
            if (s.ok) fileFrac(it.src)
            else if (!(s.error instanceof Cancelled) && !o.control.cancelled) { const msg = String((s.error as Error)?.message || s.error); failed.set(it.src, msg); setFile(it.src, { state: 'error', error: msg, node: id }); h.onLog?.(`✗ ${it.name}: ${msg}`) }
            h.onNode?.(id, 'run', fin / take.length); report(fin / take.length)
          },
        })
        if (o.control.cancelled) throw new Cancelled()
        result = settled.flatMap((s) => (s.ok ? s.value : []))
      }
      outs.set(id, [...result, ...pass])
      doneNodes++
      h.onNode?.(id, 'done', 1); report(0)
      h.onLog?.(`✓ ${node.step} · ${take.length} in, ${result.length} out · ${Math.round(now() - t)} ms`)
    }
  } catch (e) {
    if (e instanceof Cancelled || o.control.cancelled) cancelled = true
    else throw e
  }
  const hasOut = byId.has(OUT) && o.graph.edges.some(([, b]) => b === OUT)
  let outputs: Item[]
  if (hasOut) outputs = incoming(OUT)
  else {
    const sinks = work.filter((id) => !o.graph.edges.some(([a]) => a === id))
    const seen = new Set<Item>(); outputs = []
    for (const id of sinks) for (const it of outs.get(id) ?? []) if (!seen.has(it) && !failed.has(it.src)) { seen.add(it); outputs.push(it) }
  }
  if (o.keepSmaller) outputs = keepOriginals(outputs, new Map(o.inputs.map((i) => [i.src, i])))
  for (const it of o.inputs) {
    const s = status.get(it.src)!
    if (s.state !== 'error') setFile(it.src, { state: cancelled ? 'cancelled' : 'done', progress: cancelled ? s.progress : 1 })
  }
  if (!cancelled) report(1), h.onProgress?.(1, 0)
  return { outputs, failed, cancelled, ms: now() - t0 }
}
