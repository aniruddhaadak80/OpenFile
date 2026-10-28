// node --experimental-strip-types scripts/tests/b2/layers.test.mjs
import assert from 'node:assert'
const L = await import('../../../src/lib/b2/layers.ts')
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`)
const l = { ...L.baseLayer('a', 100, 50, 40, 20), rot: 30, sx: 2, sy: -1.5 }
for (const [px, py] of [[0, 0], [40, 20], [13, 7]]) { const [dx, dy] = L.toDoc(l, px, py); const [bx, by] = L.toLocal(l, dx, dy); near(bx, px); near(by, py) }
const [cx, cy] = L.toDoc(l, 20, 10); near(cx, 100); near(cy, 50)
const flat = L.baseLayer('b', 50, 50, 20, 10)
assert.ok(L.contains(flat, 41, 46) && !L.contains(flat, 39, 46) && L.contains(flat, 39, 46, 2))
const bb = L.bounds({ ...flat, rot: 90 }); assert.deepEqual([bb.w, bb.h], [10, 20])
const doc = { w: 200, h: 100, bg: '#fff', layers: [flat, { ...L.baseLayer('top', 50, 50, 10, 10) }, { ...L.baseLayer('hidden', 50, 50, 10, 10), visible: false }] }
assert.equal(L.hitTest(doc, 50, 50).name, 'top'); assert.equal(L.hitTest(doc, 42, 50).name, 'b'); assert.equal(L.hitTest(doc, 5, 5), undefined)
const moved = L.moveLayer(doc, flat.id, 'top'); assert.equal(moved.layers.at(-1).name, 'b'); assert.equal(L.moveLayer(moved, flat.id, -1).layers[1].name, 'b')
const c = L.cropDoc(doc, { x: 30, y: 20, w: 50.4, h: 40 }); assert.equal(c.w, 50); assert.equal(c.layers[0].x, 20); assert.equal(c.layers[0].y, 30)
assert.deepEqual(L.normRect(150, 90, -10, 20, 100, 80), { x: 0, y: 20, w: 100, h: 60 })
// project roundtrip
const ras = { ...L.baseLayer('pix', 10, 10, 4, 4), kind: 'raster', bmp: { fake: 1 } }
const txt = { ...L.baseLayer('t', 5, 5, 30, 12), kind: 'text', text: 'hi', font: 'Inter', size: 10, weight: 400, italic: false, color: '#000', align: 'left', lineHeight: 1.2, stroke: 0, strokeColor: '#fff' }
const p = L.toProject({ w: 20, h: 20, bg: 'transparent', layers: [ras, txt] }, () => 'data:image/png;base64,AAA')
const back = L.parseProject(JSON.parse(JSON.stringify(p)))
assert.equal(back.layers[0].src, 'data:image/png;base64,AAA'); assert.equal(back.layers[0].bmp, undefined); assert.equal(back.layers[1].text, 'hi')
assert.throws(() => L.parseProject({ app: 'x' }), /not a Layer Editor/)
assert.throws(() => L.parseProject({ ...p, w: 0 }), /canvas size/)
assert.throws(() => L.parseProject({ ...p, layers: [{ kind: 'raster' }] }), /missing its image/)
assert.equal(L.blendFromPsd('color dodge'), 'color-dodge'); assert.equal(L.blendFromPsd('weird'), 'source-over')
// colour filters
const px = () => new Uint8ClampedArray([200, 100, 50, 255])
let d = px(); L.colorFilter(d, { ...L.NO_FILTERS }); assert.deepEqual([...d], [200, 100, 50, 255])
d = px(); L.colorFilter(d, { ...L.NO_FILTERS, grayscale: 100 }); assert.ok(d[0] === d[1] && d[1] === d[2])
d = px(); L.colorFilter(d, { ...L.NO_FILTERS, invert: 100 }); assert.deepEqual([...d], [55, 155, 205, 255])
d = px(); L.colorFilter(d, { ...L.NO_FILTERS, hue: 360 }); assert.ok(Math.abs(d[0] - 200) <= 1 && Math.abs(d[2] - 50) <= 1)
d = px(); L.colorFilter(d, { ...L.NO_FILTERS, brightness: 100 }); assert.deepEqual([...d], [255, 255, 255, 255])
assert.ok(L.isNoFilter(L.NO_FILTERS) && !L.isNoFilter({ ...L.NO_FILTERS, blur: 1 }))
console.log('ok layers')
