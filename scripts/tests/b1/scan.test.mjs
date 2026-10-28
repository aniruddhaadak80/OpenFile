// Run: npx tsx scripts/tests/b1/scan.test.mjs
import assert from 'node:assert/strict'
import { homography, applyH, detectQuad, warp, enhance, quadSize, rotate90 } from '../../../src/tools/pdf/_b1/scan.ts'

const src = [{ x: 10, y: 20 }, { x: 200, y: 30 }, { x: 190, y: 220 }, { x: 5, y: 210 }]
const dst = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 150 }, { x: 0, y: 150 }]
const H = homography(src, dst)
src.forEach((p, i) => { const q = applyH(H, p.x, p.y); assert.ok(Math.abs(q.x - dst[i].x) < 1e-6 && Math.abs(q.y - dst[i].y) < 1e-6) })
console.log('ok   homography maps corners exactly')

// synthetic photo: dark table, tilted white page with black text bars
const W = 400, Hh = 300, img = { width: W, height: Hh, data: new Uint8ClampedArray(W * Hh * 4) }
const quad = [{ x: 80, y: 40 }, { x: 330, y: 60 }, { x: 310, y: 270 }, { x: 60, y: 250 }]
const inside = (x, y) => { let s = 0; for (let i = 0; i < 4; i++) { const a = quad[i], b = quad[(i + 1) % 4]; const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x); if (c < 0) s++ } return s === 0 }
for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; const v = inside(x, y) ? ((y % 20 < 3 && x % 50 < 35) ? 30 : 235) : 50; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255 }
const q = detectQuad(img)
q.forEach((p, i) => assert.ok(Math.hypot(p.x - quad[i].x, p.y - quad[i].y) < 10, `corner ${i} off: ${JSON.stringify(p)}`))
console.log('ok   page corners detected', q.map((p) => [Math.round(p.x), Math.round(p.y)]))
const { w, h } = quadSize(q)
const out = warp(img, q, w, h)
let bright = 0; for (let i = 0; i < out.length; i += 4) if (out[i] > 150) bright++
assert.ok(bright / (w * h) > 0.75, 'warped output is mostly page')
console.log('ok   warp', w, 'x', h)
enhance(out, w, h, 'bw', 0.5)
assert.ok([...out].every((v, i) => i % 4 === 3 || v === 0 || v === 255))
console.log('ok   black and white enhance')
const r = rotate90(new Uint8ClampedArray([1, 1, 1, 1, 2, 2, 2, 2]), 2, 1)
assert.equal(r.w, 1); assert.equal(r.h, 2); assert.equal(r.px[0], 1); assert.equal(r.px[4], 2)
console.log('ok   rotate')
