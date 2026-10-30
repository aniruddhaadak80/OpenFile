import assert from 'node:assert/strict'
import * as T from '../../../src/lib/b14/d3.ts'
const g = T.parseGcode(';FLAVOR:Marlin\nG21\nG90\nM82\nG28\nG1 Z0.2 F3000\nG1 X10 Y0 E1 F1200\nG1 X10 Y10 E2\nG0 X0 Y0\nG1 Z0.4\nG1 X10 Y0 E3\nG2 X20 Y0 I5 J0 E4\n')
assert.equal(g.flavor, 'printer'); assert.equal(g.layers.length, 2); assert.equal(g.filament, 4); assert.equal(g.layers[0].z, 0.2); assert.equal(g.meta.FLAVOR, 'Marlin')
const extr = [...g.kind].filter((k) => k === 1).length; assert.ok(extr >= 3 + 4)
assert.ok(Math.abs(g.bounds.max[0] - 20) < 1e-6 && g.bounds.max[1] >= 4.9) // arc bulges to y=+5 (counter clockwise G2 from 10,0 around 15,0 goes through y=+5)
const cnc = T.parseGcode('G20\nG0 X0 Y0 Z0.1\nG1 Z-0.1 F10\nG1 X1\nG3 X1 Y1 R0.5\n')
assert.equal(cnc.flavor, 'cnc'); assert.ok(Math.abs(cnc.bounds.max[0] - 25.4 - 12.7) < 0.2, String(cnc.bounds.max[0]))
assert.throws(() => T.parseGcode('; nothing'))
assert.ok(Math.abs(T.filamentGrams(1000) - 2.98) < 0.01)
assert.equal(T.fmtDuration(3725), '1 h 2 min')
const x = T.parseXyz('# c\n1 2 3 255 0 0\n4 5 6 0 255 0\n'); assert.equal(x.count, 2); assert.deepEqual([...x.col], [255, 0, 0, 0, 255, 0])
const csv = T.parseXyz('X,Y,Z,Intensity\n1,2,3,9\n4,5,6,8\n', 'csv'); assert.equal(csv.count, 2); assert.deepEqual([...csv.intensity], [9, 8])
const pts = T.parseXyz('2\n1 2 3 100 10 20 30\n4 5 6 50 40 50 60\n', 'pts'); assert.equal(pts.count, 2); assert.deepEqual([...pts.col], [10, 20, 30, 40, 50, 60])
for (const fmt of ['ply', 'ply-ascii', 'pcd', 'pcd-binary', 'xyz', 'csv', 'las']) {
  const bytes = T.writeCloud(pts, fmt)
  const ext = fmt.split('-')[0]
  const back = T.parseCloud('a.' + ext, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  assert.equal(back.count, 2, fmt)
  assert.ok(Math.abs(back.pos[4] - 5) < 0.002, fmt + ' ' + back.pos[4])
  if (fmt !== 'xyz') assert.deepEqual([...back.col], [10, 20, 30, 40, 50, 60], fmt)
}
const many = { pos: Float32Array.from([0, 0, 0, 0.1, 0.1, 0.1, 5, 5, 5]), count: 3, format: 'xyz', comments: [] }
assert.equal(T.voxelDown(many, 1).count, 2); assert.equal(T.everyNth(many, 2).count, 2)
assert.deepEqual(T.recenter(many).shift, [2.5, 2.5, 2.5])
const p = T.orbitPos(0, 4, 10, 0); assert.ok(Math.abs(p[2] - 10) < 1e-9); const q = T.orbitPos(1, 4, 10, 0); assert.ok(Math.abs(q[0] - 10) < 1e-9)
console.log('b14 d3 ok')
