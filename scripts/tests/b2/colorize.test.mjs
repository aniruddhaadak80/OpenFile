// node --experimental-strip-types scripts/tests/b2/colorize.test.mjs
import assert from 'node:assert'
const { lightness, ddcolorInput, mergeAB, meanChroma, cleanBorder } = await import('../../../src/lib/b2/colorize.ts')
const { rgbToLab } = await import('../../../src/lib/b2/lab.ts')
// lightness matches rgbToLab
const px = new Uint8ClampedArray([200, 120, 40, 255, 0, 0, 0, 255, 255, 255, 255, 255, 30, 90, 160, 128])
const L = lightness(px, 4, 1)
for (let i = 0; i < 4; i++) assert.ok(Math.abs(L[i] - rgbToLab(px[i * 4] / 255, px[i * 4 + 1] / 255, px[i * 4 + 2] / 255)[0]) < 1e-3)
// model input is grey and keeps L
const S = 8, img = new Uint8ClampedArray(S * S * 4)
for (let i = 0; i < S * S; i++) { img[i * 4] = (i * 7) % 256; img[i * 4 + 1] = (i * 13) % 256; img[i * 4 + 2] = (i * 29) % 256; img[i * 4 + 3] = 255 }
const inp = ddcolorInput(img, S), Li = lightness(img, S, S)
for (let i = 0; i < S * S; i++) {
  assert.equal(inp[i], inp[S * S + i]); assert.equal(inp[i], inp[2 * S * S + i])
  assert.ok(Math.abs(rgbToLab(inp[i], inp[i], inp[i])[0] - Li[i]) < 0.05)
}
// merge with zero ab gives grey of same L; with ab adds colour and keeps alpha + L
const zero = new Float32Array(2 * S * S)
const grey = mergeAB(img, S, S, zero, 1, S)
assert.ok(meanChroma(grey, S, S) < 1, 'grey output')
const ab = new Float32Array(2 * S * S).fill(20)
const W = 20, H = 12, big = new Uint8ClampedArray(W * H * 4)
for (let i = 0; i < W * H; i++) { const v = 40 + (i % 180); big.set([v, v, v, i % 2 ? 255 : 100], i * 4) }
const col = mergeAB(big, W, H, ab, 1, S)
assert.ok(meanChroma(col, W, H) > 15, 'colour added')
const Lb = lightness(big, W, H), Lc = lightness(col, W, H)
for (let i = 0; i < W * H; i++) { assert.equal(col[i * 4 + 3], big[i * 4 + 3]); assert.ok(Math.abs(Lb[i] - Lc[i]) < 1.5, `L kept ${Lb[i]} ${Lc[i]}`) }
const half = mergeAB(big, W, H, ab, 0.5, S)
assert.ok(meanChroma(half, W, H) < meanChroma(col, W, H))
// border band is replaced by the first clean row or column
{ const T = 16, g = new Float32Array(2 * T * T).fill(5); for (let y = 0; y < T; y++) { g[y * T] = -90; g[T * T + y * T + T - 1] = 70 } for (let x = 0; x < T; x++) g[x] = 99
  cleanBorder(g, T, 2); assert.ok(g.every((v) => v === 5), 'border cleaned') }
console.log('ok colorize')
