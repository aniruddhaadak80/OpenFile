// Run: npx tsx scripts/tests/b3/gif-inspect.test.ts
import assert from 'node:assert/strict'
import { encodeGif, decodeGif } from '../../../src/lib/b3/anim/gif'
import { inspectGif, repairCandidates } from '../../../src/lib/b3/anim/gif-inspect'
const W = 32, H = 24
const frames = Array.from({ length: 5 }, (_, k) => { const p = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < p.length; i += 4) { p[i] = (k * 50 + (i / 4) % W * 5) & 255; p[i + 1] = 80; p[i + 2] = 200; p[i + 3] = 255 } return { rgba: p, delay: 70 } })
const gif = encodeGif({ width: W, height: H, frames, loop: 2 }, { colors: 64 })
const r = inspectGif(gif)
assert.ok(r.valid); assert.equal(r.frames, 5); assert.equal(r.loop, 2); assert.ok(r.trailer); assert.equal(r.width, W)
assert.equal(r.blocks.filter((b) => b.kind === 'gce').length, 5)
assert.deepEqual(r.problems, [])
console.log('ok - inspect healthy gif')
const cut = gif.subarray(0, Math.floor(gif.length * 0.8))
const rc = inspectGif(cut)
assert.ok(rc.problems.length > 0); assert.ok(!rc.trailer)
const cands = repairCandidates(cut)
assert.ok(cands.length >= 1)
let best = -1
for (const c of cands) { try { const a = decodeGif(c); best = Math.max(best, a.frames.length) } catch { /* try next */ } }
assert.ok(best >= 3, 'recovered frames: ' + best)
console.log('ok - repair truncated gif, recovered', best, 'frames')
assert.equal(inspectGif(new Uint8Array([1, 2, 3])).valid, false)
console.log('ok - rejects non gif')
