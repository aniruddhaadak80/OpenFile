// Run: node --experimental-strip-types --no-warnings scripts/tests/workspace/recipe.test.mjs
import assert from 'node:assert/strict'
import { validateRecipe, parseRecipeJson, encodeShare, decodeShare, linearGraph, topoOrder, isLinear, chain, wouldCycle, history, push, undo, redo, renamePattern, coerceParam, IN, OUT, LIMITS } from '../../../src/pages/workspace/recipe.ts'
import { CATALOG, kindOf, metaOf, defaults } from '../../../src/pages/workspace/catalog.ts'

// catalog sanity
const ids = new Set(); for (const s of CATALOG) { assert.ok(!ids.has(s.id), 'dup ' + s.id); ids.add(s.id); for (const p of s.params) { if (p.type === 'select') assert.ok(p.options.includes(p.default), s.id + '.' + p.key) } }
assert.ok(CATALOG.length >= 28)
assert.equal(kindOf('a.JPG'), 'image'); assert.equal(kindOf('x', 'application/pdf'), 'pdf'); assert.equal(kindOf('v.mov'), 'video'); assert.equal(kindOf('t.csv'), 'data'); assert.equal(kindOf('n.md'), 'text'); assert.equal(kindOf('z.zip'), 'archive'); assert.equal(kindOf('q.bin'), 'other')
assert.equal(metaOf('img-rename').id, 'file-rename', 'legacy alias')
assert.equal(defaults('img-resize').maxW, 1600)

// coercion and clamping
const qp = metaOf('img-convert').params.find((p) => p.key === 'quality')
assert.equal(coerceParam(qp, 500), 100); assert.equal(coerceParam(qp, '40'), 40); assert.equal(coerceParam(qp, 'x'), 82)
const fp = metaOf('img-convert').params.find((p) => p.key === 'format')
assert.equal(coerceParam(fp, '<script>'), 'webp')
const cp = metaOf('img-watermark').params.find((p) => p.key === 'color')
assert.equal(coerceParam(cp, 'red;background:url(x)'), '#ffffff'); assert.equal(coerceParam(cp, '#AABBCC'), '#aabbcc')

// linear graphs
const g = linearGraph([{ step: 'img-resize' }, { step: 'img-convert', params: { format: 'png', evil: 1 } }])
assert.equal(g.nodes.length, 4); assert.deepEqual(topoOrder(g)[0], IN); assert.equal(topoOrder(g).at(-1), OUT)
assert.ok(isLinear(g)); assert.equal(chain(g).length, 2)
assert.equal(g.nodes[2].params.format, 'png'); assert.equal(g.nodes[2].params.evil, undefined)
assert.ok(wouldCycle(g, g.nodes[2].id, g.nodes[1].id)); assert.ok(!wouldCycle(g, IN, g.nodes[2].id))

// validation: good, old format, bad
const ok = validateRecipe({ name: 'Web', graph: g }); assert.ok(ok.ok)
const old = validateRecipe({ name: 'Old', mode: 'image', steps: [{ id: 'img-resize', params: { maxW: 99999 } }, { id: 'img-rename' }, { id: 'nope' }] })
assert.ok(old.ok); assert.equal(old.recipe.graph.nodes.length, 4); assert.equal(old.recipe.graph.nodes[1].params.maxW, 10000); assert.equal(old.recipe.graph.nodes[2].step, 'file-rename'); assert.equal(old.warnings.length, 1)
assert.equal(validateRecipe(null).ok, false); assert.equal(validateRecipe([]).ok, false); assert.equal(validateRecipe({ graph: { nodes: 'x' } }).ok, false)
const loop = { name: 'L', graph: { nodes: [{ id: IN, step: IN }, { id: 'a', step: 'img-resize' }, { id: 'b', step: 'img-rotate' }, { id: OUT, step: OUT }], edges: [[IN, 'a'], ['a', 'b'], ['b', 'a'], ['b', OUT]] } }
assert.equal(validateRecipe(loop).ok, false)
const dirty = validateRecipe({ name: 'x\u0000y'.padEnd(300, 'z'), graph: { nodes: [{ id: 'a b<', step: 'img-resize' }, { id: 'ok', step: 'pdf-merge', params: { name: 42 } }, { id: 'ok', step: 'img-rotate' }, { id: 'w', step: 'eval' }], edges: [[IN, 'ok'], ['ok', OUT], ['ok', 'ghost'], [OUT, 'ok'], 'bad', ['ok', OUT]] } })
assert.ok(dirty.ok); assert.equal(dirty.recipe.name.length, LIMITS.name); assert.ok(!dirty.recipe.name.includes('\u0000'))
assert.deepEqual(dirty.recipe.graph.nodes.map((n) => n.id), [IN, 'ok', OUT]); assert.equal(dirty.recipe.graph.edges.length, 2); assert.equal(dirty.recipe.graph.nodes[1].params.name, '42')
assert.equal(validateRecipe({ graph: { nodes: Array.from({ length: 100 }, (_, i) => ({ id: 'n' + i, step: 'img-resize' })), edges: [] } }).ok, false)
assert.equal(parseRecipeJson('{oops').ok, false)
assert.equal(validateRecipe({ graph: { nodes: [{ id: '__proto__', step: 'img-resize', params: { __proto__: { polluted: 1 } } }], edges: [] } }).ok, true)
assert.equal(({}).polluted, undefined)

// share links round-trip, damaged and oversized links never throw
const r = ok.recipe
const enc = encodeShare(r)
assert.match(enc, /^recipe=[A-Za-z0-9_-]+$/)
const dec = decodeShare('#' + enc); assert.ok(dec.ok); assert.equal(dec.recipe.name, 'Web'); assert.deepEqual(dec.recipe.graph.edges, r.graph.edges); assert.equal(dec.recipe.graph.nodes[2].params.format, 'png')
assert.ok(decodeShare('#foo=1&' + enc).ok)
assert.equal(decodeShare('#recipe=AAAA').ok, false)
assert.equal(decodeShare('#recipe=' + 'A'.repeat(LIMITS.hash + 1)).ok, false)
assert.equal(decodeShare('').ok, false)
assert.equal(decodeShare('#recipe=<img src=x onerror=alert(1)>').ok, false)

// undo / redo
let h = history(1); h = push(h, 2, undefined, 0); h = push(h, 3, 'k', 1000); h = push(h, 4, 'k', 1200)
assert.equal(h.present, 4); assert.equal(h.past.length, 2, 'typing in one field folds into one step')
h = undo(h); assert.equal(h.present, 2); h = undo(h); assert.equal(h.present, 1); h = undo(h); assert.equal(h.present, 1)
h = redo(h); assert.equal(h.present, 2); h = push(h, 9, undefined, 5000); assert.equal(h.future.length, 0)
let big = history(0); for (let i = 1; i < 300; i++) big = push(big, i, undefined, i * 10000); assert.equal(big.past.length, 100)

// rename patterns
const ctx = { name: 'My Photo.JPG', n: 7, date: '2026-10-30', ext: 'jpg', kind: 'image' }
assert.equal(renamePattern('{name}-{n}', ctx), 'My Photo-007.jpg')
assert.equal(renamePattern('{kind}_{date}', ctx), 'image_2026-10-30.jpg')
assert.equal(renamePattern('{name}', ctx, 'kebab'), 'my-photo.jpg')
assert.equal(renamePattern('../../etc/{name}', ctx), '_.._etc_My Photo.jpg')
console.log('workspace recipe tests passed')
