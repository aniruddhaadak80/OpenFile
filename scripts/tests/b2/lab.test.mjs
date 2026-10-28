// node --experimental-strip-types scripts/tests/b2/lab.test.mjs
import assert from 'node:assert'
const { rgbToLab, labToRgb } = await import('../../../src/lib/b2/lab.ts')
for (const c of [[0, 0, 0], [1, 1, 1], [1, 0, 0], [0.2, 0.6, 0.3], [0.9, 0.7, 0.1]]) {
  const lab = rgbToLab(...c); const back = labToRgb(...lab)
  back.forEach((v, i) => assert.ok(Math.abs(v - c[i]) < 2e-3, `${c} -> ${lab} -> ${back}`))
}
const [L, a, b] = rgbToLab(1, 0, 0)
assert.ok(Math.abs(L - 53.24) < 0.3 && Math.abs(a - 80.09) < 0.6 && Math.abs(b - 67.2) < 0.6, `red lab ${L} ${a} ${b}`)
assert.ok(Math.abs(rgbToLab(1, 1, 1)[0] - 100) < 0.01)
console.log('ok lab')
