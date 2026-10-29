// Run: node --experimental-strip-types --no-warnings scripts/tests/compress/compress-guard.test.mjs
import assert from 'node:assert/strict'
import { notSmaller, keepSmaller, parseBitrates, planVideo, targetVideoKbps, bytesFor, sourceKbps, videoArgs, audioArgs, decideOutcome, RETRY_FACTOR, PRESET_RATIO } from '../../../src/lib/compress-guard.ts'

const MB = 1024 * 1024

// never-bigger rule
assert.equal(notSmaller(100, 99), false)
assert.equal(notSmaller(100, 100), true)
assert.equal(notSmaller(100, 133), true)
assert.equal(notSmaller(100, 0), true, 'an empty output is never handed back')
const orig = { size: 11.7 * MB, id: 'o' }, big = { size: 15.5 * MB, id: 'b' }, small = { size: 5 * MB, id: 's' }
assert.deepEqual(keepSmaller(orig, big), { blob: orig, kept: true })
assert.deepEqual(keepSmaller(orig, small), { blob: small, kept: false })
assert.deepEqual(decideOutcome(100, [133, 120]), { kind: 'original' })
assert.deepEqual(decideOutcome(100, [133, 80]), { kind: 'compressed', index: 1 })
assert.deepEqual(decideOutcome(100, [70, 60]), { kind: 'compressed', index: 1 })
assert.deepEqual(decideOutcome(100, [70]), { kind: 'compressed', index: 0 })

// banner parsing
const banner = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'in.mp4':
  Duration: 00:01:00.05, start: 0.000000, bitrate: 1636 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 1500 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)`
const br = parseBitrates(banner)
assert.equal(Math.round(br.duration), 60)
assert.equal(br.totalKbps, 1636); assert.equal(br.videoKbps, 1500); assert.equal(br.audioKbps, 128); assert.equal(br.acodec, 'aac'); assert.equal(br.fps, 30)
assert.deepEqual(parseBitrates('garbage'), { duration: 0 })

// the reported case: 11.7 MB, 1:00, 1080p. Every preset must plan a clearly smaller file.
const src = { sizeBytes: 11.7 * MB, duration: 60, width: 1920, height: 1080, hasAudio: true }
const withProbe = { ...src, videoKbps: 1500, audioKbps: 128, acodec: 'aac' }
for (const s of [src, withProbe]) {
  let prev = Infinity
  for (const preset of ['high', 'balanced', 'small']) {
    const p = planVideo(s, { preset, res: 'original' })
    assert.ok(p.estimateBytes < s.sizeBytes * (PRESET_RATIO[preset] + 0.12), `${preset} estimate ${p.estimateBytes} near its ratio`)
    assert.ok(p.estimateBytes < prev, `${preset} smaller than the higher preset`)
    assert.ok(p.videoKbps >= 300, 'still a watchable bitrate at 1080p')
    assert.equal(p.scaleShort, 0, '1080p is kept')
    prev = p.estimateBytes
    const retry = planVideo(s, { preset, res: 'original', factor: RETRY_FACTOR })
    assert.ok(retry.videoKbps < p.videoKbps, 'retry is lower')
  }
}
// AAC at 128 kb/s is copied for the high preset, re-encoded lower for small
assert.equal(planVideo(withProbe, { preset: 'high', res: 'original' }).copyAudio, true)
assert.equal(planVideo(withProbe, { preset: 'small', res: 'original' }).copyAudio, false)
assert.equal(planVideo(withProbe, { preset: 'small', res: 'original' }).audioKbps, 96)
assert.equal(planVideo(src, { preset: 'balanced', res: 'original', noAudio: true }).audioKbps, 0)

// 4K source scales by preset
const uhd = { sizeBytes: 200 * MB, duration: 60, width: 3840, height: 2160 }
assert.equal(planVideo(uhd, { preset: 'small', res: 'original' }).scaleShort, 720)
assert.equal(planVideo(uhd, { preset: 'balanced', res: 'original' }).scaleShort, 1080)
assert.equal(planVideo(uhd, { preset: 'high', res: 'original' }).scaleShort, 1440)
const portrait = planVideo({ ...uhd, width: 2160, height: 3840 }, { preset: 'balanced', res: 'original' })
assert.equal(portrait.outWidth, 1080); assert.equal(portrait.outHeight, 1920)
assert.equal(planVideo(src, { preset: 'balanced', res: 720 }).outHeight, 720)
assert.equal(planVideo(src, { preset: 'balanced', res: 720 }).outWidth, 1280)

// a tiny, already efficient file: the plan is never above the source
const tiny = { sizeBytes: 200 * 1024, duration: 10, width: 640, height: 360, hasAudio: true }
for (const preset of ['small', 'balanced', 'high']) {
  const p = planVideo(tiny, { preset, res: 'original' })
  assert.ok(p.estimateBytes < tiny.sizeBytes, `${preset} tiny estimate ${p.estimateBytes} under ${tiny.sizeBytes}`)
}

// target size math: total bits / duration minus audio
assert.equal(Math.round(sourceKbps(7.5 * 1000 * 60, 60)), 60)
const t8 = targetVideoKbps(8 * MB, 60, 96)
assert.ok(t8 > 900 && t8 < 1050, `8 MB in 60 s leaves about 1 Mb/s for video, got ${t8}`)
for (const mb of [8, 25, 5]) {
  const p = planVideo(src, { preset: 'balanced', res: 'original', targetBytes: mb * MB })
  assert.ok(p.estimateBytes <= mb * MB, `fits under ${mb} MB (${p.estimateBytes})`)
  assert.ok(p.estimateBytes < src.sizeBytes, 'and is smaller than the source')
}
// 25 MB is bigger than the file: still shrinks it
assert.ok(planVideo(src, { preset: 'balanced', res: 'original', targetBytes: 25 * MB }).estimateBytes < src.sizeBytes * 0.95)
// a 1 MB target for a minute of 1080p picks a smaller picture
const t1 = planVideo(src, { preset: 'balanced', res: 'original', targetBytes: 1 * MB })
assert.ok(t1.scaleShort > 0 && t1.scaleShort <= 480, `scaled to ${t1.scaleShort}`)
assert.ok(t1.estimateBytes <= 1 * MB)
// impossible target is flagged
assert.equal(planVideo(src, { preset: 'balanced', res: 'original', targetBytes: 100 * 1024 }).tooSmall, true)
assert.equal(planVideo(src, { preset: 'balanced', res: 'original', targetBytes: 8 * MB }).tooSmall, false)
assert.ok(bytesFor(1000, 8) > 1_000_000 && bytesFor(1000, 8) < 1_030_000)

// argument shapes
const p = planVideo(withProbe, { preset: 'balanced', res: 720 })
const va = videoArgs(p, 28, true)
assert.deepEqual(va.slice(0, 2), ['-vf', 'scale=-2:720'])
assert.ok(va.includes('-maxrate') && va.includes('-bufsize') && va.includes('-crf') && va.includes('libx264'))
assert.ok(videoArgs(p, 28, true, 'abr').includes('-b:v'))
assert.deepEqual(videoArgs(planVideo(src, { preset: 'balanced', res: 720 }), 28, false).slice(0, 2), ['-vf', 'scale=720:-2'])
assert.deepEqual(audioArgs({ ...p, audioKbps: 0 }), ['-an'])
assert.deepEqual(audioArgs({ ...p, audioKbps: 96, copyAudio: false }), ['-c:a', 'aac', '-b:a', '96k', '-ac', '2'])
assert.deepEqual(audioArgs({ ...p, audioKbps: 96, copyAudio: true }), ['-c:a', 'copy'])

console.log('compress guard: all tests passed')
