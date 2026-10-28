// node --experimental-strip-types scripts/tests/b2/enhance.test.mjs
import assert from 'node:assert'
const E = await import('../../../src/lib/b2/enhance.ts')
const W = 64, H = 48
const make = (f) => { const d = new Uint8ClampedArray(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; const [r, g, b] = f(x, y); d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255 } return d }
const range = (d) => { let lo = 255, hi = 0; for (let i = 0; i < d.length; i += 4) { const y = (d[i] + d[i + 1] + d[i + 2]) / 3; lo = Math.min(lo, y); hi = Math.max(hi, y) } return [lo, hi] }
// auto levels stretches a flat low-contrast gradient
const flat = make((x) => { const v = 90 + x; return [v, v, v] })
E.autoLevels(flat, 0.0, 1); const [lo, hi] = range(flat)
assert.ok(hi - lo > 150, `levels ${lo} ${hi}`)
const wide = make((x) => { const v = 40 + x * 2.5; return [v, v, v] }); E.autoLevels(wide, 0, 1); const [lo2, hi2] = range(wide); assert.ok(lo2 < 3 && hi2 > 250, `levels wide ${lo2} ${hi2}`)
// white balance removes a blue cast
const cast = make((x, y) => [100 + x, 100 + y, 160 + x / 2])
E.whiteBalance(cast, 1)
let r = 0, g = 0, b = 0; for (let i = 0; i < cast.length; i += 4) { r += cast[i]; g += cast[i + 1]; b += cast[i + 2] }
assert.ok(Math.abs(r - b) / r < 0.06 && Math.abs(r - g) / r < 0.06, `wb ${r} ${g} ${b}`)
// box mean of constant is constant, and preserves mean
const c = new Float32Array(W * H).fill(7); const m = E.boxMean(c, W, H, 3); assert.ok(m.every((v) => Math.abs(v - 7) < 1e-4))
// denoise lowers noise variance but keeps a hard edge
let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const noisy = make((x) => { const base = x < W / 2 ? 60 : 190; const n = (rnd() - 0.5) * 40; return [base + n, base + n, base + n] })
const varOf = (d, x0, x1) => { let s = 0, s2 = 0, k = 0; for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) { const v = d[(y * W + x) * 4]; s += v; s2 += v * v; k++ } return s2 / k - (s / k) ** 2 }
const before = varOf(noisy, 4, W / 2 - 6); E.denoise(noisy, W, H, 0.8); const after = varOf(noisy, 4, W / 2 - 6)
assert.ok(after < before * 0.5, `denoise ${before} -> ${after}`)
const edgeL = noisy[(10 * W + W / 2 - 3) * 4], edgeR = noisy[(10 * W + W / 2 + 2) * 4]
assert.ok(edgeR - edgeL > 90, `edge kept ${edgeL} ${edgeR}`)
// sharpen increases edge contrast
const soft = make((x) => { const v = Math.max(60, Math.min(190, 60 + (x - 28) * 16)); return [v, v, v] })
const pre = soft[(10 * W + 36) * 4] - soft[(10 * W + 27) * 4]
E.sharpen(soft, W, H, 1, 2, 0); const post = soft[(10 * W + 37) * 4] - soft[(10 * W + 27) * 4]
assert.ok(post >= pre, `sharpen ${pre} ${post}`)
// skin mask flags a skin tone and not sky blue
const skinImg = make((x) => (x < W / 2 ? [224, 172, 140] : [80, 140, 230]))
const sm = E.skinMask(skinImg, W, H); assert.ok(sm[20 * W + 5] > 0.8 && sm[20 * W + W - 5] < 0.1, `skin ${sm[20 * W + 5]} ${sm[20 * W + W - 5]}`)
// full chain runs and keeps alpha
const photo = make((x, y) => [120 + x, 100 + y, 90 + ((x * y) % 30)]); E.enhance(photo, W, H, E.ENHANCE_DEFAULT)
for (let i = 3; i < photo.length; i += 4) assert.equal(photo[i], 255)
for (const k of Object.keys(E.ENHANCE_PRESETS)) { const p = make((x, y) => [x * 3, y * 4, 128]); E.enhance(p, W, H, E.ENHANCE_PRESETS[k].opts) }
console.log('ok enhance')
// strip processing matches whole-image processing (away from strip edges it must be identical)
{
  const WW = 80, HH = 90, img = new Uint8ClampedArray(WW * HH * 4); let sd = 7; const rr = () => ((sd = (sd * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < WW * HH; i++) img.set([100 + rr() * 80, 90 + rr() * 60, 80 + rr() * 50, 255], i * 4)
  const o = { ...E.ENHANCE_DEFAULT }
  const whole = img.slice(); E.enhance(whole, WW, HH, o)
  const st = img.slice(); E.enhanceGlobal(st, o); const ref = Math.max(WW, HH), ov = E.stripOverlap(ref), rows = 30
  for (let y0 = 0; y0 < HH; y0 += rows) { const y1 = Math.min(HH, y0 + rows), a = Math.max(0, y0 - ov), b = Math.min(HH, y1 + ov); const s = st.slice(a * WW * 4, b * WW * 4); E.enhanceLocal(s, WW, b - a, o, ref); st.set(s.subarray((y0 - a) * WW * 4, (y1 - a) * WW * 4), y0 * WW * 4) }
  let maxd = 0; for (let i = 0; i < st.length; i++) maxd = Math.max(maxd, Math.abs(st[i] - whole[i]))
  assert.ok(maxd <= 2, `strip vs whole max diff ${maxd}`)
  console.log('ok enhance strips')
}
