import assert from 'node:assert/strict'
import * as C from '../../../src/lib/b14/cad.ts'
// path flattening
const sq = C.flattenPath('M0 0 H10 V10 H0 Z'); assert.equal(sq.length, 1); assert.ok(sq[0].closed); assert.deepEqual(sq[0].pts.at(-1), [0, 0])
const rel = C.flattenPath('m5 5 l10 0 l0 10 z'); assert.deepEqual(rel[0].pts.slice(0, 3), [[5, 5], [15, 5], [15, 15]])
const circ = C.flattenPath(C.shapeToPath('circle', (k) => ({ cx: 0, cy: 0, r: 10 })[k] ?? 0), 0.5)
for (const [x, y] of circ[0].pts) assert.ok(Math.abs(Math.hypot(x, y) - 10) < 0.01)
const cub = C.flattenPath('M0 0 C 0 10 10 10 10 0'); assert.deepEqual(cub[0].pts.at(-1), [10, 0])
assert.deepEqual(C.apply(C.parseTransform('translate(10 5) scale(2)'), [1, 1]), [12, 7])
// dxf
const dxf = C.writeDxf([{ pts: [[0, 0], [10, 0], [10, 10]], closed: true }], [{ cx: 5, cy: 5, r: 2 }])
assert.ok(dxf.includes('POLYLINE') && dxf.includes('CIRCLE') && dxf.trim().endsWith('EOF'))
assert.ok(C.writeSvg(sq).includes('viewBox'))
// hpgl
const h = C.parseHpgl('IN;SP1;PU0,0;PD400,0,400,400;PU;SP2;PA0,0;CI100;')
assert.equal(h.polys.length, 2); assert.deepEqual(h.polys[0].pts, [[0, 0], [400, 0], [400, 400]]); assert.deepEqual(h.pens, [1, 2])
// gear
const g = C.gear({ teeth: 20, module: 2, pressure: 20, bore: 5 })
const info = C.gearInfo({ teeth: 20, module: 2, pressure: 20, bore: 5 }); assert.equal(info.pitchDiameter, 40); assert.equal(info.outsideDiameter, 44)
const rs = g.outline.pts.map(([x, y]) => Math.hypot(x, y)); assert.ok(Math.abs(Math.max(...rs) - 22) < 1e-6); assert.ok(Math.abs(Math.min(...rs) - 17.5) < 1e-6)
// box: panels close, finger counts odd
assert.equal(C.fingers(100, 10), 9)
const b = C.box({ width: 100, depth: 60, height: 50, thickness: 3, finger: 10, kerf: 0, lid: true, outside: true, gap: 5 })
assert.equal(b.panels.length, 6)
for (const p of b.panels) { const bb = C.bounds([p.poly]); assert.ok(bb.w > 40 && bb.h > 40, p.name); assert.ok(p.poly.pts.length > 8, p.name) }
// front panel (A sides) is exactly W wide, side panel (B sides) is narrower at fingers: D - 2t at the notch rows
const front = b.panels.find((p) => p.name === 'Front'); assert.equal(Math.round(C.bounds([front.poly]).w), 100)
console.log('b14 cad ok')
