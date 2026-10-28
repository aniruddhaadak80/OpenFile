// Node test for INSERT expansion in src/lib/b2/cad.ts.
// Run: node --experimental-strip-types scripts/tests/b2/cad-insert.test.mjs
import fs from 'node:fs'
import assert from 'node:assert/strict'
const { parseDxf, cadToSvg, fitView, insertMatrices, mul } = await import('../../../src/lib/b2/cad.ts')

const g = (pairs) => pairs.map(([c, v]) => `${String(c).padStart(3)}\n${v}`).join('\n')
const line = (x1, y1, x2, y2, extra = []) => g([[0, 'LINE'], [8, '0'], ...extra, [10, x1], [20, y1], [30, 0], [11, x2], [21, y2], [31, 0]])
const insert = (name, x, y, o = {}) => g([[0, 'INSERT'], [8, o.layer ?? 'PARTS'], ...(o.color !== undefined ? [[62, o.color]] : []), [2, name], [10, x], [20, y], [30, 0],
  ...(o.sx !== undefined ? [[41, o.sx]] : []), ...(o.sy !== undefined ? [[42, o.sy]] : []), ...(o.rot !== undefined ? [[50, o.rot]] : []),
  ...(o.cols ? [[70, o.cols]] : []), ...(o.rows ? [[71, o.rows]] : []), ...(o.cs ? [[44, o.cs]] : []), ...(o.rs ? [[45, o.rs]] : [])])
const block = (name, bx, by, body) => g([[0, 'BLOCK'], [8, '0'], [2, name], [70, 0], [10, bx], [20, by], [30, 0], [3, name]]) + '\n' + body + '\n' + g([[0, 'ENDBLK'], [8, '0']])
const doc = (blocks, ents) => [g([[0, 'SECTION'], [2, 'BLOCKS']]), ...blocks, g([[0, 'ENDSEC'], [0, 'SECTION'], [2, 'ENTITIES']]), ...ents, g([[0, 'ENDSEC'], [0, 'EOF']])].join('\n') + '\n'
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`)
const box = (d) => d.bbox

// 1. base point: a unit line block whose base is (1,0) inserted at (10,10) starts at (10,10)
{
  const d = await parseDxf(doc([block('U', 1, 0, line(1, 0, 2, 0))], [insert('U', 10, 10)]))
  assert.equal(d.space, 'Model'); assert.equal(d.lines.length, 1)
  near(d.lines[0].pts[0][0], 10, 'base x'); near(d.lines[0].pts[0][1], 10, 'base y'); near(d.lines[0].pts[1][0], 11, 'end x')
  assert.equal(d.lines[0].layer, 'PARTS', 'layer 0 entities take the insert layer')
}
// 2. scale and rotation: scale 2 x 3, rotate 90 deg: (1,0) -> (0,2); (0,1) -> (-3,0)
{
  const d = await parseDxf(doc([block('L', 0, 0, line(0, 0, 1, 0) + '\n' + line(0, 0, 0, 1))], [insert('L', 5, 5, { sx: 2, sy: 3, rot: 90 })]))
  const [a, b] = d.lines
  near(a.pts[1][0], 5, 'rot x'); near(a.pts[1][1], 7, 'rot y'); near(b.pts[1][0], 2, 'rot2 x'); near(b.pts[1][1], 5, 'rot2 y')
  // mirrored insert (negative x scale)
  const m = await parseDxf(doc([block('L', 0, 0, line(0, 0, 1, 0))], [insert('L', 0, 0, { sx: -1 })]))
  near(m.lines[0].pts[1][0], -1, 'mirror')
}
// 3. nested blocks: inner transform applies before outer (inner rotated 90 inside outer scaled 2 and moved)
{
  const inner = block('IN', 0, 0, line(0, 0, 1, 0))
  const outer = block('OUT', 0, 0, insert('IN', 1, 0, { rot: 90, layer: '0' }))
  const d = await parseDxf(doc([inner, outer], [insert('OUT', 100, 0, { sx: 2, sy: 2 })]))
  assert.equal(d.lines.length, 1)
  // IN line (0,0)-(1,0) -> rotate 90 -> (0,0)-(0,1) -> +(1,0) -> (1,0)-(1,1) -> scale 2 -> (2,0)-(2,2) -> +(100,0)
  near(d.lines[0].pts[0][0], 102, 'nested x0'); near(d.lines[0].pts[0][1], 0, 'nested y0'); near(d.lines[0].pts[1][0], 102, 'nested x1'); near(d.lines[0].pts[1][1], 2, 'nested y1')
  assert.equal(d.lines[0].layer, 'PARTS', 'layer 0 inherits through nesting')
}
// 4. row/column arrays: 3 columns x 2 rows, spacing 10 x 5, rotation 90 rotates the grid
{
  const d = await parseDxf(doc([block('P', 0, 0, line(0, 0, 1, 0))], [insert('P', 0, 0, { cols: 3, rows: 2, cs: 10, rs: 5 })]))
  assert.equal(d.lines.length, 6)
  near(box(d).maxX, 21, 'array maxX'); near(box(d).maxY, 5, 'array maxY')
  const r = await parseDxf(doc([block('P', 0, 0, line(0, 0, 1, 0))], [insert('P', 0, 0, { cols: 3, rs: 0, cs: 10, rot: 90 })]))
  near(r.bbox.maxY, 21, 'rotated array grows along y')
  assert.equal(insertMatrices({ rowCount: 4, columnCount: 5 }).length, 20)
}
// 5. BYBLOCK colour takes the insert colour; cycles do not hang
{
  const d = await parseDxf(doc([block('C', 0, 0, line(0, 0, 1, 1, [[62, 0]]))], [insert('C', 0, 0, { color: 1 })]))
  assert.deepEqual(d.lines[0].rgb, [255, 0, 0])
  const loop = await parseDxf(doc([block('A', 0, 0, line(0, 0, 1, 0) + '\n' + insert('B', 1, 0)), block('B', 0, 0, insert('A', 1, 0))], [insert('A', 0, 0)]))
  assert.ok(loop.lines.length >= 1 && loop.lines.length < 40)
}
// 6. matrix composition sanity
{
  const [m] = insertMatrices({ x: 3, y: 4, rotation: 0 }), n = mul(m, [1, 0, 0, 1, 1, 1])
  near(n[4], 4, 'mul e'); near(n[5], 5, 'mul f')
}
// 7. SVG and view use the expanded geometry
{
  const d = await parseDxf(doc([block('U', 0, 0, line(0, 0, 1, 0))], [insert('U', 50, 50, { sx: 10 })]))
  const svg = cadToSvg(d, { hidden: new Set() })
  assert.ok(svg.includes('<polyline') && svg.includes('id="PARTS"'))
  assert.ok(fitView(d, 800, 600).scale > 0)
  near(d.bbox.minX, 50, 'bbox minX'); near(d.bbox.maxX, 60, 'bbox maxX')
}
// 8. blocks-only file (no ENTITIES section): falls back to the paper space layout and expands its INSERTs
const samples = new URL('../../../../samples/', import.meta.url)
if (fs.existsSync(new URL('blocks.dxf', samples))) {
  const d = await parseDxf(fs.readFileSync(new URL('blocks.dxf', samples), 'utf8'))
  assert.match(d.space, /^Layout/)
  assert.ok(d.lines.length >= 20, `blocks.dxf lines ${d.lines.length}`)
  assert.ok(d.texts.some((t) => t.text === 'Detail'), 'title block text from nested INSERT')
  assert.ok(d.bbox.maxX - d.bbox.minX > 16 && d.bbox.maxY - d.bbox.minY > 10, 'sheet is 11x17')
  assert.ok(cadToSvg(d, { hidden: new Set() }).length > 5000)
  console.log('ok blocks.dxf', d.space, d.lines.length, 'lines', d.texts.length, 'texts')
}
// 9. only block definitions and nothing placed: show a sheet of the blocks
{
  const d = await parseDxf(doc([block('SYM', 0, 0, line(0, 0, 1, 1)), block('SYM2', 0, 0, line(0, 0, 2, 0))], []))
  assert.equal(d.space, 'Block library'); assert.equal(d.lines.length, 2)
  assert.ok(d.texts.some((t) => t.text === 'SYM2'))
}
// 10. arc1.dxf from dxf-parser: ARC with extrusion (0,0,-1) is mirrored in X
{
  const arc1 = '  0\nSECTION\n  2\nENTITIES\n  0\nARC\n  5\nB484\n330\n3706\n100\nAcDbEntity\n  8\nFG-Dtl-Dim\n  6\nByBlock\n 62\n     0\n370\n    -2\n100\nAcDbCircle\n 10\n650.0541823996996\n 20\n347.5909732684974\n 30\n0.0\n 40\n0.7604262403327394\n210\n0.0\n220\n0.0\n230\n-1.0\n100\nAcDbArc\n 50\n338.8998819521181\n 51\n355.0752244008874\n0\nENDSEC\n  0\nEOF\n'
  const d = await parseDxf(arc1)
  assert.equal(d.lines.length, 1); assert.ok(d.lines[0].pts.length > 2, 'arc is tessellated')
  for (const [x, y] of d.lines[0].pts) near(Math.hypot(x + 650.0541823996996, y - 347.5909732684974), 0.7604262403327394, 'on mirrored circle')
  assert.ok(d.bbox.maxX < -650, 'mirrored to negative x')
  assert.deepEqual(d.layers.map((l) => l.name), ['FG-Dtl-Dim'])
}
console.log('ok cad insert expansion')
