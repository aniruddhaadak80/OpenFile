// Reverse / boomerang in bounded pieces. Pure checks on the plan and arguments, then the whole chain
// (pieces, forward half, join, reversed sound) against the real ffmpeg.wasm core.
// Run: npx tsx scripts/tests/b3/reverse.test.ts
import assert from 'node:assert/strict'
import * as F from '../../../src/lib/b3/ffops'
// @ts-ignore
import { ffmpeg } from './ffwasm.mjs'

let ok = 0
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); ok++; console.log(`ok - ${name}`) }

/* ---------------------------------------------------------------- pure */
await t('fps: snaps near standard rates, falls back to 30, caps at 60', () => {
  assert.equal(F.outFps(30), 30)
  assert.equal(F.outFps(29.97), 29.97)
  assert.equal(F.outFps(30.13), 30) // tbr of a variable frame rate phone clip
  assert.equal(F.outFps(59.9), 59.94)
  assert.equal(F.outFps(undefined), 30)
  assert.equal(F.outFps(0), 30)
  assert.equal(F.outFps(90000), 30) // a bogus timebase read as fps
  assert.equal(F.outFps(120), 60)
  assert.equal(F.outFps(15), 15)
  assert.equal(F.outFps(12.5), 13)
})

await t('plan: 60 s 1080p30 is cut into pieces that fit the memory budget', () => {
  const p = F.reversePlan({ duration: 60, width: 1920, height: 1080, fps: 30 })
  assert.equal(p.scale, 1)
  const frameMB = (1920 * 1080 * 1.5) / 1048576
  assert.ok(p.frames * frameMB <= 160, `piece holds ${p.frames} frames`)
  assert.ok(p.frames >= 15)
  const frames = p.pieces.reduce((s, x) => s + Math.round(x.len * 30), 0)
  assert.equal(frames, 1800)
  // pieces are back to back
  p.pieces.forEach((x, i) => { if (i) assert.ok(Math.abs(x.start - (p.pieces[i - 1].start + p.pieces[i - 1].len)) < 1e-9) })
})

await t('plan: short small clip is one piece of at most 5 s, 4K is scaled to 1920', () => {
  const small = F.reversePlan({ duration: 3, width: 640, height: 360, fps: 25 })
  assert.equal(small.pieces.length, 1)
  assert.equal(small.frames, 125)
  const k4 = F.reversePlan({ duration: 10, width: 3840, height: 2160, fps: 60 })
  assert.equal(k4.scale, 0.5)
  assert.equal(k4.fps, 60)
  const retry = F.reversePlan({ duration: 10, width: 1920, height: 1080, fps: 30 }, { budgetMB: 48, maxSide: 1280 })
  assert.ok(Math.abs(retry.scale - 1280 / 1920) < 1e-9)
  const unknown = F.reversePlan({ duration: 0, width: 640, height: 480 })
  assert.deepEqual(unknown.pieces, [{ start: 0, len: 0 }])
})

await t('args: constant rate, even size, reverse last, explicit encoder settings', () => {
  const p = F.reversePlan({ duration: 12, width: 641, height: 359, fps: 30.13 })
  const op = F.reversePieceOp('in.mp4', p, 1)
  const a = op.args
  assert.equal(a[a.indexOf('-ss') + 1], String(p.pieces[1].start))
  const vf = a[a.indexOf('-vf') + 1]
  assert.match(vf, /^fps=30,trim=end_frame=\d+,setpts=PTS-STARTPTS,scale=trunc\(iw\/2\)\*2:trunc\(ih\/2\)\*2,format=yuv420p,reverse$/)
  assert.equal(a[a.indexOf('-r') + 1], '30')
  assert.equal(a[a.indexOf('-fps_mode') + 1], 'cfr')
  assert.ok(a.includes('-an') && a.includes('libx264') && a.includes('yuv420p'))
  assert.equal(op.output, 'r0001.mp4')
  assert.deepEqual(F.reverseOrder({ ...p, pieces: p.pieces.slice(0, 3) }, 'reverse'), ['r0002.mp4', 'r0001.mp4', 'r0000.mp4'])
  assert.deepEqual(F.reverseOrder({ ...p, pieces: p.pieces.slice(0, 2) }, 'boomerang'), ['fwd.mp4', 'r0001.mp4', 'r0000.mp4'])
  assert.equal(F.concatList(['a.mp4', 'b.mp4']), "file 'a.mp4'\nfile 'b.mp4'\n")
  const j = F.reverseJoinOp('list.txt', 'in.mp4').args
  assert.ok(j.includes('areverse') && j.includes('copy'))
  assert.ok(F.reverseJoinOp('list.txt').args.includes('-an'))
})

/* ---------------------------------------------------------------- real core */
const make = async (args: string[], out: string) => { const r = await ffmpeg([...args, out], {}, [out]); assert.equal(r.code, 0, r.logs.slice(-3).join('\n')); return r.out[out] as Uint8Array }
// odd size, 4:4:4, variable frame rate, with sound: the awkward inputs from the bug report in one clip
const SRC = await make(['-f', 'lavfi', '-i', 'testsrc=size=321x241:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=f=440:duration=4',
  '-vf', "setpts='N/30/TB+if(mod(N,3),0,0.02/TB)'", '-fps_mode', 'vfr', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv444p', '-c:a', 'aac', '-shortest'], 'src.mp4')

async function chain(mode: 'reverse' | 'boomerang', audio: boolean) {
  // small budget so the 4 s clip is cut into several pieces
  const plan = F.reversePlan({ duration: 4, width: 321, height: 241, fps: 30.1 }, { budgetMB: 2 })
  assert.ok(plan.pieces.length >= 3, `${plan.pieces.length} pieces`)
  const files: Record<string, Uint8Array> = {}
  for (let i = 0; i < plan.pieces.length; i++) {
    const op = F.reversePieceOp('src.mp4', plan, i)
    const r = await ffmpeg(op.args, { 'src.mp4': SRC }, [op.output])
    assert.equal(r.code, 0, r.logs.slice(-3).join('\n')); files[op.output] = r.out[op.output]
  }
  if (mode === 'boomerang') { const op = F.forwardPieceOp('src.mp4', plan); const r = await ffmpeg(op.args, { 'src.mp4': SRC }, [op.output]); assert.equal(r.code, 0); files[op.output] = r.out[op.output] }
  files['list.txt'] = new TextEncoder().encode(F.concatList(F.reverseOrder(plan, mode)))
  if (audio) files['src.mp4'] = SRC
  const op = F.reverseJoinOp('list.txt', audio ? 'src.mp4' : undefined)
  const r = await ffmpeg(op.args, files, [op.output])
  assert.equal(r.code, 0, r.logs.slice(-3).join('\n'))
  const out = r.out[op.output] as Uint8Array
  // probe the result: frame count, size, audio
  const p = await ffmpeg(['-hide_banner', '-i', 'o.mp4', '-map', '0:v:0', '-f', 'null', '-'], { 'o.mp4': out })
  const log = p.logs.join('\n')
  const frames = +(log.match(/frame=\s*(\d+)/g)?.pop()?.match(/\d+/)?.[0] ?? 0)
  return { log, frames, out }
}

await t('chain: reverse with sound, odd size, VFR, several pieces', async () => {
  const { log, frames } = await chain('reverse', true)
  assert.match(log, /Video: h264[^\n]*320x240/)
  assert.match(log, /30 fps/)
  assert.match(log, /Audio: aac/)
  assert.ok(Math.abs(frames - 120) <= 2, `${frames} frames`)
})

await t('chain: reverse without sound has no audio track', async () => {
  const { log } = await chain('reverse', false)
  assert.doesNotMatch(log, /Audio:/)
})

await t('chain: boomerang is about twice as long', async () => {
  const { frames } = await chain('boomerang', false)
  assert.ok(Math.abs(frames - 240) <= 4, `${frames} frames`)
})

console.log(`\n${ok} passed`)
