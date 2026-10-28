// node --experimental-strip-types scripts/tests/b2/mesh.test.mjs
import assert from 'node:assert'
const { heightmapSolid, binaryStl, analyseMesh, flipWinding } = await import('../../../src/lib/b2/mesh.ts')
// flat heightmap -> box of 10 x 10 x 2
const cols = 11, rows = 11
const hm = new Float32Array(cols * rows).fill(1)
const tris = heightmapSolid(hm, cols, rows, { width: 10, minT: 1, maxT: 2 })
const r = analyseMesh(tris)
assert.ok(r.watertight, 'lithophane solid should be watertight: ' + JSON.stringify(r))
assert.ok(Math.abs(r.volume - 200) < 1e-3, 'volume ' + r.volume)
assert.ok(Math.abs(r.area - (2 * 100 + 4 * 20)) < 1e-3, 'area ' + r.area)
assert.equal(r.shells, 1)
assert.ok(!r.flippedHint, 'normals should point outward')
const flipped = analyseMesh(flipWinding(tris))
assert.ok(flipped.flippedHint)
// curved variant stays watertight
const curved = analyseMesh(heightmapSolid(hm, cols, rows, { width: 10, minT: 1, maxT: 2, curve: 120 }))
assert.ok(curved.watertight)
const stl = binaryStl(tris)
assert.equal(stl.length, 84 + (tris.length / 9) * 50)
assert.equal(new DataView(stl.buffer).getUint32(80, true), tris.length / 9)
// open mesh: single triangle
const open = analyseMesh(Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]))
assert.equal(open.boundaryEdges, 3); assert.ok(!open.watertight)
console.log('ok mesh', r.triangles, 'triangles, volume', r.volume.toFixed(2))
