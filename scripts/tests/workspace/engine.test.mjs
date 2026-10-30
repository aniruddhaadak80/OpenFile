// Run: node --experimental-strip-types --no-warnings scripts/tests/workspace/engine.test.mjs
import assert from 'node:assert/strict'
import { pool, runGraph, RunControl, waitTurn, eta, autoConcurrency, keepOriginals, Cancelled } from '../../../src/pages/workspace/engine.ts'
import { linearGraph, IN, OUT } from '../../../src/pages/workspace/recipe.ts'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const blob = (n, t = '') => new Blob([new Uint8Array(n)], { type: t })
const item = (name, size = 10) => ({ id: name, name, blob: blob(size), src: name })

// pool respects the concurrency limit and keeps order
{ let active = 0, peak = 0
  const res = await pool([1, 2, 3, 4, 5, 6, 7], async (n) => { active++; peak = Math.max(peak, active); await sleep(5 + (n % 3) * 3); active--; if (n === 4) throw new Error('four'); return n * 2 }, { concurrency: () => 3 })
  assert.equal(peak, 3); assert.deepEqual(res.map((r) => (r.ok ? r.value : 'x')), [2, 4, 6, 'x', 10, 12, 14]) }
assert.deepEqual(await pool([], async () => 1, { concurrency: () => 2 }), [])

// pause holds new tasks, resume continues, cancel stops the rest
{ const c = new RunControl(); const started = []
  const p = pool([1, 2, 3, 4], async (n) => { started.push(n); await sleep(15); return n }, { concurrency: () => 1, control: c })
  await sleep(5); c.pause(); await sleep(40); assert.equal(started.length, 1, 'paused after first')
  c.resume(); await sleep(25); assert.ok(started.length >= 2); c.cancel()
  const res = await p; assert.ok(res.some((r) => !r.ok && r.error instanceof Cancelled)) }

// eta and concurrency helpers
assert.equal(eta(0, 5000), null); assert.equal(eta(0.5, 100), null); assert.equal(eta(0.5, 4000), 4000); assert.equal(eta(1, 4000), 0)
assert.equal(autoConcurrency(8), 6); assert.equal(autoConcurrency(1), 1); assert.equal(autoConcurrency(8, 2), 2); assert.equal(autoConcurrency(8, 4), 3)

// keep originals when a same-type result is bigger
{ const a = item('a.jpg', 100), b = item('b.jpg', 100), c = item('c.pdf', 100)
  const out = keepOriginals([{ ...a, id: 'x', blob: blob(150) }, { ...b, id: 'y', blob: blob(50) }, { ...c, id: 'z', name: 'c.png', blob: blob(300) }], new Map([a, b, c].map((i) => [i.src, i])))
  assert.equal(out[0].kept, true); assert.equal(out[0].blob.size, 100); assert.equal(out[1].kept, undefined); assert.equal(out[2].kept, undefined, 'type changed, keep result') }

// graph runs: per-file, passthrough, batch, failure isolation, branches and merge
const double = { batch: false, accepts: (it) => it.name.endsWith('.jpg'), run: async ([it], onP) => { onP(1); if (it.name.startsWith('bad')) throw new Error('broken file'); return [{ name: it.name.replace('.jpg', '.webp'), blob: blob(it.blob.size / 2) }] } }
const merge = { batch: true, accepts: () => true, run: async (items) => [{ name: 'all.zip', blob: blob(items.reduce((a, i) => a + i.blob.size, 0)) }] }
const tag = (s) => ({ batch: false, accepts: () => true, run: async ([it]) => [{ name: s + '-' + it.name, blob: it.blob }] })
{ const g = linearGraph([{ step: 'img-compress' }, { step: 'zip-all' }])
  const files = []; const nodes = []
  const res = await runGraph({ graph: g, inputs: [item('a.jpg', 100), item('bad.jpg'), item('doc.pdf', 30)], resolve: (n) => (n.step === 'img-compress' ? double : merge), control: new RunControl(), concurrency: () => 2, hooks: { onFile: (s, st) => files.push([s, st.state]), onNode: (id, st) => nodes.push(st) } })
  assert.equal(res.outputs.length, 1); assert.equal(res.outputs[0].name, 'all.zip'); assert.equal(res.outputs[0].blob.size, 80, 'webp 50 + pdf 30, bad file dropped')
  assert.equal(res.failed.get('bad.jpg'), 'broken file'); assert.ok(files.some(([s, st]) => s === 'bad.jpg' && st === 'error')); assert.ok(files.some(([s, st]) => s === 'a.jpg' && st === 'done')); assert.ok(nodes.includes('done')) }
{ // branch: in -> A and in -> B, both -> out
  const g = { nodes: [{ id: IN, step: IN, params: {}, enabled: true, x: 0, y: 0 }, { id: 'A', step: 'a', params: {}, enabled: true, x: 0, y: 0 }, { id: 'B', step: 'b', params: {}, enabled: true, x: 0, y: 0 }, { id: 'D', step: 'off', params: {}, enabled: false, x: 0, y: 0 }, { id: OUT, step: OUT, params: {}, enabled: true, x: 0, y: 0 }], edges: [[IN, 'A'], [IN, 'B'], ['A', OUT], ['B', 'D'], ['D', OUT]] }
  const res = await runGraph({ graph: g, inputs: [item('x.jpg')], resolve: (n) => tag(n.step), control: new RunControl(), concurrency: () => 4 })
  assert.deepEqual(res.outputs.map((o) => o.name).sort(), ['a-x.jpg', 'b-x.jpg']) }
{ // cancel mid run
  const c = new RunControl()
  const slow = { batch: false, accepts: () => true, run: async ([it]) => { await sleep(20); return [{ name: it.name, blob: it.blob }] } }
  const p = runGraph({ graph: linearGraph([{ step: 'x' }, { step: 'y' }]), inputs: Array.from({ length: 8 }, (_, i) => item(i + '.jpg')), resolve: () => slow, control: c, concurrency: () => 2 })
  await sleep(30); c.cancel(); const res = await p; assert.equal(res.cancelled, true) }
{ // keepSmaller across the whole pipeline, and a cycle is refused
  const grow = { batch: false, accepts: () => true, run: async ([it]) => [{ name: it.name, blob: blob(it.blob.size * 2) }] }
  const res = await runGraph({ graph: linearGraph([{ step: 'g' }]), inputs: [item('k.jpg', 40)], resolve: () => grow, control: new RunControl(), concurrency: () => 1, keepSmaller: true })
  assert.equal(res.outputs[0].kept, true); assert.equal(res.outputs[0].blob.size, 40)
  const cyc = { nodes: [{ id: 'a', step: 'a', params: {}, enabled: true, x: 0, y: 0 }, { id: 'b', step: 'b', params: {}, enabled: true, x: 0, y: 0 }], edges: [['a', 'b'], ['b', 'a']] }
  await assert.rejects(runGraph({ graph: cyc, inputs: [], resolve: () => grow, control: new RunControl(), concurrency: () => 1 })) }
{ // per-step limit caps the pool (ffmpeg style)
  let active = 0, peak = 0
  const one = { batch: false, limit: 1, accepts: () => true, run: async ([it]) => { active++; peak = Math.max(peak, active); await sleep(5); active--; return [{ name: it.name, blob: it.blob }] } }
  await runGraph({ graph: linearGraph([{ step: 'v' }]), inputs: [item('1'), item('2'), item('3')], resolve: () => one, control: new RunControl(), concurrency: () => 4 })
  assert.equal(peak, 1) }
// waitTurn: a long step stops between pages while paused and ends on cancel without counting as failed
{ const c = new RunControl(); let pages = 0
  const slow = { batch: false, accepts: () => true, run: async ([it], _p, signal) => { for (let k = 0; k < 50; k++) { await waitTurn(signal); pages++; await sleep(4) } return [{ name: it.name, blob: it.blob }] } }
  const run = runGraph({ graph: linearGraph([{ step: 's' }]), inputs: [item('1'), item('2')], resolve: () => slow, control: c, concurrency: () => 2 })
  await sleep(30); c.pause(); await sleep(15); const at = pages; await sleep(60)
  assert.equal(pages, at, 'no pages run while paused')
  c.resume(); await sleep(30); assert.ok(pages > at, 'pages run again after resume')
  c.cancel(); const r = await run
  assert.equal(r.cancelled, true); assert.equal(r.failed.size, 0)
  await assert.rejects(waitTurn(c.signal), Cancelled) }
console.log('workspace engine tests passed')
