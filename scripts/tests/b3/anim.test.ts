// Run: npx tsx scripts/tests/b3/anim.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { decodeGif, encodeGif, gifLoopCount } from '../../../src/lib/b3/anim/gif'
import { decodePng, encodeApng, isApng } from '../../../src/lib/b3/anim/png'
import { parseWebp, patchWebpDurations } from '../../../src/lib/b3/anim/webp'
import { webpArgs, animVideoArgs, videoToApngArgs } from '../../../src/lib/b3/anim/args'
import * as C from '../../../src/lib/b3/anim/core'
// @ts-ignore
import { ffmpeg } from './ffwasm.mjs'

const W = 40, H = 30
function synth(n = 6, alpha = false): C.Anim {
  const frames = Array.from({ length: n }, (_, k) => {
    const px = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const on = x >= k * 5 && x < k * 5 + 8 && y > 5 && y < 20
      px[i] = on ? 245 : 10; px[i + 1] = on ? 165 : 20; px[i + 2] = on ? 36 : 30; px[i + 3] = alpha && !on ? 0 : 255
    }
    return { rgba: px, delay: 80 + k * 10 }
  })
  return { width: W, height: H, frames, loop: 0 }
}
let passed = 0
const t = async (name: string, fn: () => any) => { await fn(); passed++; console.log('ok -', name) }

await t('gif round trip keeps frames, delays, pixels', () => {
  const a = synth()
  const bytes = encodeGif(a, { colors: 64 })
  const b = decodeGif(bytes)
  assert.equal(b.width, W); assert.equal(b.height, H); assert.equal(b.frames.length, 6)
  assert.deepEqual(b.frames.map((f) => f.delay), [80, 90, 100, 110, 120, 130])
  assert.equal(gifLoopCount(bytes), 0)
  for (let k = 0; k < 6; k++) { // check a pixel inside the moving box and one outside
    const inside = ((10) * W + k * 5 + 2) * 4, outside = ((25) * W + 1) * 4
    assert.ok(Math.abs(b.frames[k].rgba[inside] - 245) < 12, 'inside colour frame ' + k)
    assert.ok(Math.abs(b.frames[k].rgba[outside] - 10) < 12, 'outside colour frame ' + k)
  }
})

await t('gif optimisation makes smaller files than full frames', () => {
  const a = synth(10)
  const opt = encodeGif(a, { optimize: true }), full = encodeGif(a, { optimize: false })
  assert.ok(opt.length < full.length, `${opt.length} < ${full.length}`)
  const back = decodeGif(opt)
  assert.ok(C.sameRGBA(back.frames[9].rgba, decodeGif(full).frames[9].rgba, 16))
})

await t('gif with transparency, local palette, dither, loop count', () => {
  const a = synth(4, true); a.loop = 3
  const bytes = encodeGif(a, { palette: 'local', dither: 0.8, colors: 16 })
  const b = decodeGif(bytes)
  assert.equal(b.frames.length, 4); assert.equal(gifLoopCount(bytes), 3)
  assert.equal(b.frames[2].rgba[(1 * W + 1) * 4 + 3], 0, 'transparent pixel stays transparent')
  assert.equal(b.frames[2].rgba[(10 * W + 12) * 4 + 3], 255)
})

await t('apng round trip with loop patch', () => {
  const a = synth(5); a.loop = 2
  const bytes = encodeApng(a)
  assert.ok(isApng(bytes))
  const b = decodePng(bytes)
  assert.equal(b.frames.length, 5); assert.equal(b.loop, 2); assert.equal(b.source, 'APNG')
  assert.ok(C.sameRGBA(b.frames[3].rgba, a.frames[3].rgba))
  assert.deepEqual(b.frames.map((f) => f.delay), a.frames.map((f) => f.delay))
})

await t('core transforms', () => {
  const a = synth(4)
  const r = C.rotateAnim(a, 90); assert.equal(r.width, H); assert.equal(r.height, W)
  const back = C.rotateAnim(C.rotateAnim(C.rotateAnim(r, 90), 90), 90)
  assert.ok(C.sameRGBA(back.frames[1].rgba, a.frames[1].rgba))
  assert.ok(C.sameRGBA(C.flipAnim(C.flipAnim(a, true), true).frames[0].rgba, a.frames[0].rgba))
  const s = C.resizeAnim(a, 20, 15); assert.equal(s.frames[0].rgba.length, 20 * 15 * 4)
  const c = C.cropAnim(a, 5, 5, 10, 10); assert.equal(c.width, 10)
  assert.equal(c.frames[1].rgba[0], a.frames[1].rgba[(5 * W + 5) * 4])
  assert.equal(C.reverseAnim(a).frames[0], a.frames[3])
  assert.equal(C.boomerang(a).frames.length, 6)
  const fast = C.changeSpeed(a, 10); assert.ok(fast.frames.every((f) => f.delay >= 20)); assert.ok(fast.frames.length < 4)
  assert.equal(C.dropFrames(a, 2).frames.length, 2)
  const dup = { ...a, frames: [a.frames[0], { ...a.frames[0] }, a.frames[1]] }
  assert.equal(C.dedupeFrames(dup).frames.length, 2)
  const fit = C.fitAnim(a, 60, 60, 'contain', [255, 0, 0, 255]); assert.equal(fit.width, 60); assert.equal(fit.frames[0].rgba[0], 255)
  assert.equal(C.frameAt(a, 85), 1)
})

await t('webp via ffmpeg wasm: encode from apng, parse frames', async () => {
  const a = synth(5)
  const apng = encodeApng(a)
  const r = await ffmpeg(webpArgs('in.apng', 'out.webp', 0, 80, false), { 'in.apng': apng }, ['out.webp'])
  assert.equal(r.code, 0, r.logs.slice(-3).join('\n'))
  const info = parseWebp(patchWebpDurations(r.out['out.webp'], a.frames.map((f) => f.delay)))
  assert.equal(info.width, W); assert.equal(info.height, H); assert.ok(info.animated)
  assert.equal(info.frames.length, 5)
  assert.deepEqual(info.frames.map((f) => f.duration), [80, 90, 100, 110, 120])
  fs.writeFileSync('/tmp/b3-test.webp', r.out['out.webp'])
})

await t('webp keeps transparency (lossless)', async () => {
  const a = synth(3, true)
  const r = await ffmpeg(webpArgs('in.apng', 'out.webp', 0, 80, true), { 'in.apng': encodeApng(a) }, ['out.webp'])
  assert.equal(r.code, 0)
  const info = parseWebp(r.out['out.webp']); assert.ok(info.hasAlpha); assert.equal(info.frames.length, 3)
})

for (const fmt of ['mp4', 'webm'] as const) await t(`${fmt} from apng`, async () => {
  const a = C.flattenAnim(synth(5, true), [255, 255, 255, 255])
  const r = await ffmpeg(animVideoArgs('in.apng', 'out.' + fmt, fmt), { 'in.apng': encodeApng(a) }, ['out.' + fmt])
  assert.equal(r.code, 0, r.logs.slice(-4).join('\n'))
  assert.ok(r.out['out.' + fmt].length > 500)
})

await t('video to apng args: frames become RGBA so palette-changing FLI/FLC sources encode', async () => {
  const a = videoToApngArgs('in.flc', 'out.apng', { fps: 15, maxFrames: 2000 })
  assert.deepEqual(a, ['-i', 'in.flc', '-vf', 'fps=15,format=rgba', '-frames:v', '2000', '-an', '-f', 'apng', '-plays', '0', 'out.apng'])
  const b = videoToApngArgs('in.mp4', 'out.apng', { fps: 12, width: 320.4, start: 2, duration: 3 })
  assert.deepEqual(b.slice(0, 7), ['-ss', '2', '-t', '3', '-i', 'in.mp4', '-vf'])
  assert.equal(b[7], 'fps=12,scale=320:-2:flags=lanczos,format=rgba')
  const flc = process.env.FLC_SAMPLE
  if (flc && fs.existsSync(flc)) {
    const r = await ffmpeg(a, { 'in.flc': fs.readFileSync(flc) }, ['out.apng'])
    assert.equal(r.code, 0, r.logs.slice(-3).join('\n'))
    assert.ok(decodePng(r.out['out.apng']).frames.length > 10)
  }
})

console.log(`\n${passed} passed`)
