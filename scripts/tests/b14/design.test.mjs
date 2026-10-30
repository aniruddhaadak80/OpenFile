import assert from 'node:assert/strict'
import * as D from '../../../src/lib/b14/design.ts'
const a = D.rng(5), b = D.rng(5); assert.equal(a(), b())
assert.equal(D.blobPath(3), D.blobPath(3)); assert.notEqual(D.blobPath(3), D.blobPath(4)); assert.match(D.blobPath(3, 400, 6), /^M[\d.]+,[\d.]+(C[^C]+){6}Z$/)
const wv = D.wavePaths(1, 1000, 200, 3); assert.equal(wv.length, 3); assert.match(wv[0], /L1000,200L0,200Z$/)
assert.equal(D.mix('#000000', '#ffffff', 0.5), '#808080')
for (const kind of ['blob', 'wave', 'scatter', 'layered-blob']) assert.match(D.shapeSvg({ kind, seed: 1, w: 800, h: 400, c1: '#F5A524', c2: '#14B8A6', bg: '#000000', gradient: true, edges: 6, growth: 0.5, layers: 3, peaks: 3, amp: 0.6, top: false, count: 5, stroke: false }), /^<svg[\s\S]+<\/svg>$/)
const base = { w: 210, h: 297, margin: 10, spacing: 5, color: '#999', accent: '#333', weight: 0.2, majorEvery: 5, header: false, marginLine: true }
const g = D.paperPrims({ ...base, kind: 'graph' }); assert.equal(g.length, (38 + 1) + (55 + 1))
const dots = D.paperPrims({ ...base, kind: 'dot' }); assert.equal(dots.length, 39 * 56)
const lined = D.paperPrims({ ...base, kind: 'lined', spacing: 8 }); assert.equal(lined.filter((p) => p.t === 'line').length, Math.floor(277 / 8) + 1)
for (const k of ['isometric', 'hex', 'music', 'handwriting', 'polar', 'calligraphy', 'engineering']) { const p = D.paperPrims({ ...base, kind: k }); assert.ok(p.length > 10, k); for (const q of p) if (q.t === 'line') assert.ok(q.x1 >= 9.99 && q.x2 <= 200.01 && q.y1 >= 9.99 && q.y2 <= 287.01 && q.y1 >= 0, k + JSON.stringify(q)) }
assert.match(D.paperSvg({ ...base, kind: 'dot' }), /width="210mm"/)
const cd = D.parseChartTable('Month,Sales,Cost\nJan,"1,200",800\nFeb,1500,900\n')
assert.deepEqual(cd, { labels: ['Jan', 'Feb'], series: [{ name: 'Sales', values: [1200, 1500] }, { name: 'Cost', values: [800, 900] }] })
assert.deepEqual(D.niceTicks(0, 1500), [0, 500, 1000, 1500]); assert.deepEqual(D.niceTicks(-3, 7, 5), [-4, -2, 0, 2, 4, 6, 8])
assert.throws(() => D.parseChartTable('a,b\nx,y'))
for (const kind of ['bar', 'hbar', 'stacked', 'line', 'area', 'pie', 'donut', 'scatter']) { const s = D.chartSvg(cd, { kind, title: 'T & co', w: 800, h: 500, colors: ['#F5A524', '#14B8A6'], bg: '#fff', fg: '#111', grid: true, legend: true, values: true, font: 'Inter' }); assert.match(s, /T &amp; co/); assert.ok(!/NaN/.test(s), kind) }
assert.equal(D.tokenColor('hljs-keyword', D.CODE_THEMES[0]), '#F5A524'); assert.equal(D.tokenColor('hljs-foo', D.CODE_THEMES[0]), null)
console.log('b14 design ok')
