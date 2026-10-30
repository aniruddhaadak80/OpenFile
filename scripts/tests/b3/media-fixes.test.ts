// QA media round 2 fixes, run against the real ffmpeg.wasm core. Run: npx tsx scripts/tests/b3/media-fixes.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import * as F from '../../../src/lib/b3/ffops'
import { vizGraph, type Viz } from '../../../src/lib/b3/viz'
import { capToSource, lowerQuality, VIDEO_FLOOR_KBPS } from '../../../src/tools/video/_media/bitrate'

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../../..')
;(globalThis as any).self ??= globalThis
;(globalThis as any).location ??= { href: 'file:///tmp/' }
const create = (await import(url.pathToFileURL(path.join(root, 'public/ffmpeg/ffmpeg-core.js')).href)).default
const wasmBinary = fs.readFileSync(path.join(root, 'public/ffmpeg/ffmpeg-core.wasm'))
/** One ffmpeg run with a wall clock limit, so a recipe that never ends fails the test instead of hanging it. */
async function ff(args: string[], files: Record<string, Uint8Array> = {}, out?: string, limitMs = 60000) {
  const m = await create({ wasmBinary })
  const logs: string[] = []
  m.setLogger(({ message }: { message: string }) => logs.push(message))
  m.setTimeout(limitMs)
  for (const [n, d] of Object.entries(files)) m.FS.writeFile(n, d)
  const t0 = Date.now()
  const code = m.exec(...args)
  let data: Uint8Array | null = null
  if (out) try { data = m.FS.readFile(out) } catch { data = null }
  return { code, logs, data, ms: Date.now() - t0 }
}
async function make(args: string[], out: string) { const r = await ff([...args, out], {}, out); assert.equal(r.code, 0, r.logs.slice(-3).join('\n')); return r.data! }
/** duration and size from ffmpeg's own probe of an output */
async function probe(name: string, data: Uint8Array) {
  const r = await ff(['-i', name, '-f', 'null', '-'], { [name]: data })
  const text = r.logs.join('\n')
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(text)
  const s = /Video: [^\n]*?(\d{2,5})x(\d{2,5})/.exec(text)
  const times = [...text.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop()
  return { duration: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0, w: s ? +s[1] : 0, h: s ? +s[2] : 0, decoded: times ? +times[1] * 3600 + +times[2] * 60 + +times[3] : 0, hasAudio: /Audio:/.test(text) }
}

const V = await make(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'], 'v.mp4')
const A = await make(['-f', 'lavfi', '-i', 'sine=f=220:duration=2', '-c:a', 'libmp3lame'], 'a.mp3')
const ALONG = await make(['-f', 'lavfi', '-i', 'sine=f=220:duration=5', '-c:a', 'libmp3lame'], 'along.mp3')
const ST = await make(['-f', 'lavfi', '-i', 'sine=f=220:duration=3', '-f', 'lavfi', '-i', 'sine=f=330:duration=3', '-filter_complex', '[0:a][1:a]amerge=inputs=2', '-c:a', 'libmp3lame'], 'st.mp3')
const IMG = await make(['-f', 'lavfi', '-i', 'mandelbrot=size=320x240', '-frames:v', '1'], 'i.png')
const BG = await make(['-f', 'lavfi', '-i', 'color=c=0x101010:s=320x320', '-frames:v', '1'], 'bg.png')

// 1. Add audio, Length = Longest with the repeat switch on: ends at the longer of the two, never runs forever
for (const [audio, aDur, want] of [[A, 2, 3], [ALONG, 5, 5]] as const) {
  const op = F.addAudioOp('v.mp4', 'a.mp3', 'replace', { videoHasAudio: false, loop: true, fit: 'longest', videoDuration: 3, audioDuration: aDur })
  assert.ok(op.args.includes('-stream_loop') && op.args.includes('-t'), 'repeat with a cap')
  const r = await ff(op.args, { 'v.mp4': V, 'a.mp3': audio }, op.output, 30000)
  assert.equal(r.code, 0, 'longest + repeat finishes: ' + r.logs.slice(-3).join(' | '))
  const p = await probe('o.mp4', r.data!)
  assert.ok(Math.abs(p.duration - want) < 0.25, `longest + repeat length ${p.duration}, want ${want}`)
  console.log('ok add audio longest + repeat', aDur, 's audio ->', p.duration.toFixed(2), 's in', r.ms, 'ms')
}
{
  // lengths unknown: the audio is not repeated rather than looping forever
  const op = F.addAudioOp('v.mp4', 'a.mp3', 'mix', { videoHasAudio: true, loop: true, fit: 'longest' })
  assert.ok(!op.args.includes('-stream_loop'), 'no endless repeat without lengths')
  // other lengths still repeat as before
  assert.ok(F.addAudioOp('v.mp4', 'a.mp3', 'replace', { videoHasAudio: false, loop: true, fit: 'video' }).args.includes('-stream_loop'))
}

// 2. Slideshow with Slow zoom: the file is as long as the page says
for (const kenBurns of [true, false]) {
  const slides = [{ name: 's0.png', duration: 3 }, { name: 's1.png', duration: 3 }, { name: 's2.png', duration: 3 }]
  const op = F.slideshowOp(slides, { w: 320, h: 180, fps: 30, transition: 'fade', td: 0.8, kenBurns, fit: 'fit', bg: '#000000' })
  const r = await ff(op.args, { 's0.png': IMG, 's1.png': IMG, 's2.png': IMG }, op.output, 90000)
  assert.equal(r.code, 0, r.logs.slice(-3).join(' | '))
  const p = await probe('o.mp4', r.data!)
  const want = 9 - 0.8 * 2
  assert.ok(Math.abs(p.duration - want) < 0.15, `slideshow kenBurns=${kenBurns} length ${p.duration}, want ${want}`)
  console.log('ok slideshow kenBurns', kenBurns, p.duration.toFixed(2), 's')
}

// 3. Stabilizer with the zoom keeps the source frame size
{
  const op = F.stabilizeOp('v.mp4', 'strong', true, false, { w: 320, h: 180 })
  const r = await ff(op.args, { 'v.mp4': V }, op.output, 60000)
  assert.equal(r.code, 0, r.logs.slice(-3).join(' | '))
  const p = await probe('o.mp4', r.data!)
  assert.deepEqual([p.w, p.h], [320, 180], `stabilized size ${p.w}x${p.h}`)
  console.log('ok stabilizer keeps 320x180')
}

// 4. Every Music Visualizer style renders in the wasm core (bars and scope used to fail or never end)
for (const viz of ['waves', 'line', 'bars', 'spectrum', 'circle'] as Viz[]) {
  for (const [name, audio] of [['a.mp3', A], ['st.mp3', ST]] as const) {
    const args = ['-loop', '1', '-framerate', '25', '-i', 'bg.png', '-i', name, '-filter_complex', vizGraph(viz, 320, 320, '#F5A524', 25), '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage', '-crf', '26', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', 'out.mp4']
    const r = await ff(args, { 'bg.png': BG, [name]: audio }, 'out.mp4', 60000)
    assert.equal(r.code, 0, `${viz} ${name}: ` + r.logs.filter((l) => /rror|fail|memory/i.test(l)).slice(-3).join(' | '))
    const p = await probe('o.mp4', r.data!)
    const want = name === 'a.mp3' ? 2 : 3
    assert.ok(p.duration > want - 0.3 && p.duration < want + 0.4, `${viz} length ${p.duration}`)
    console.log('ok visualizer', viz, name, p.duration.toFixed(2), 's in', r.ms, 'ms')
  }
}

// 5. Chunked reverse into MKV (Audio Reverse keeps the container of an MKV input)
{
  const VA = await make(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=2', '-f', 'lavfi', '-i', 'sine=f=440:duration=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'], 'va.mkv')
  const plan = F.reversePlan({ duration: 2, width: 320, height: 180, fps: 25 }, { budgetMB: 1 })
  assert.ok(plan.pieces.length > 1, 'several pieces')
  const pieces: Record<string, Uint8Array> = {}
  for (let i = 0; i < plan.pieces.length; i++) {
    const op = F.reversePieceOp('in.mkv', plan, i)
    const r = await ff(op.args, { 'in.mkv': VA }, op.output)
    assert.equal(r.code, 0, r.logs.slice(-3).join(' | '))
    pieces[op.output] = r.data!
  }
  const join = F.reverseJoinOp('list.txt', 'in.mkv', 'out.mkv', ['-c:a', 'aac', '-b:a', '128k'])
  assert.ok(!join.args.includes('-movflags'), 'no MP4 flags for MKV')
  const r = await ff(join.args, { ...pieces, 'list.txt': new TextEncoder().encode(F.concatList(F.reverseOrder(plan, 'reverse'))), 'in.mkv': VA }, 'out.mkv')
  assert.equal(r.code, 0, r.logs.slice(-3).join(' | '))
  const p = await probe('o.mkv', r.data!)
  assert.ok(p.hasAudio && p.decoded > 1.8, `reversed mkv ${p.decoded}s audio=${p.hasAudio}`)
  console.log('ok chunked reverse into mkv', plan.pieces.length, 'pieces', p.decoded, 's')
}

// 6. Re-encode cap: a very low bitrate source keeps its own rate instead of a 200 kb/s floor
{
  const args = capToSource(['-c:v', 'libx264', '-crf', '21'], { total: 60, video: 50, audio: 0 }, 1.25)
  assert.equal(args[args.indexOf('-maxrate') + 1], '63k')
  const tiny = capToSource(['-c:v', 'libx264', '-crf', '21'], { total: 5, video: 5, audio: 0 }, 1.25)
  assert.equal(tiny[tiny.indexOf('-maxrate') + 1], `${VIDEO_FLOOR_KBPS}k`)
  const normal = capToSource(['-c:v', 'libx264', '-crf', '21'], { total: 2000, video: 1800, audio: 0 }, 1.25)
  assert.equal(normal[normal.indexOf('-maxrate') + 1], '2250k')
  console.log('ok bitrate cap floor')
}
// 7. Chunked reverse of a clip with chapters (phones add them): pieces carry no chapter track, so the join has no gaps
{
  const meta = new TextEncoder().encode(';FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=3000\ntitle=c1\n')
  const r0 = await ff(['-i', 'v.mp4', '-i', 'meta.txt', '-map_metadata', '1', '-map_chapters', '1', '-c', 'copy', 'ch.mp4'], { 'v.mp4': V, 'meta.txt': meta }, 'ch.mp4')
  assert.equal(r0.code, 0, r0.logs.slice(-3).join('\n'))
  const plan = F.reversePlan({ duration: 3, width: 320, height: 180, fps: 25 }, { budgetMB: 0.09 })
  assert.ok(plan.pieces.length >= 3, `several pieces, got ${plan.pieces.length}`)
  const files: Record<string, Uint8Array> = {}
  for (let i = 0; i < plan.pieces.length; i++) {
    const op = F.reversePieceOp('ch.mp4', plan, i)
    assert.ok(op.args.join(' ').includes('-map_chapters -1'), 'pieces drop chapters')
    const r = await ff(op.args, { 'ch.mp4': r0.data! }, op.output); assert.equal(r.code, 0, r.logs.slice(-3).join('\n')); files[op.output] = r.data!
  }
  files['list.txt'] = new TextEncoder().encode(F.concatList(F.reverseOrder(plan, 'reverse')))
  const j = F.reverseJoinOp('list.txt')
  const r = await ff(j.args, files, j.output); assert.equal(r.code, 0, r.logs.slice(-3).join('\n'))
  const p = await probe('o.mp4', r.data!)
  assert.ok(Math.abs(p.duration - 3) < 0.2, `reversed clip with chapters is ${p.duration}s, want 3`)
  console.log('ok chunked reverse with chapters', plan.pieces.length, 'pieces', p.duration, 's')
}
// 8. A pure edit of a very low bitrate clip that came back bigger is made again smaller (crf up, cap under the source)
{
  const src = { total: 34, video: 32, audio: 0 }
  const first = [...capToSource(['-i', 'in.mp4', '-vf', 'hue=s=0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p'], src, 1.25), 'out.mp4']
  const again = lowerQuality(first, src)!
  assert.equal(again[again.length - 1], 'out.mp4', 'output name stays last')
  assert.equal(again[again.indexOf('-crf') + 1], '27')
  assert.equal(again[again.indexOf('-maxrate') + 1], '26k')
  assert.equal(again[again.indexOf('-bufsize') + 1], '52k')
  assert.equal(again.filter((a) => a === '-maxrate').length, 1)
  assert.equal(lowerQuality(['-i', 'in.mp4', '-c:v', 'copy', 'out.mp4'], src), null, 'stream copy is left alone')
  // real core: a 320x240 15 fps clip at about 32 kb/s, filtered to grey
  const LOW = await make(['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=15:duration=6', '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '30k', '-maxrate', '30k', '-bufsize', '60k', '-pix_fmt', 'yuv420p'], 'low.mp4')
  const r1 = await ff(first, { 'in.mp4': LOW }, 'out.mp4'); assert.equal(r1.code, 0, r1.logs.slice(-3).join('\n'))
  const r2 = await ff(again, { 'in.mp4': LOW }, 'out.mp4'); assert.equal(r2.code, 0, r2.logs.slice(-3).join('\n'))
  assert.ok(r2.data!.length < r1.data!.length, `second encode ${r2.data!.length} B is smaller than the first ${r1.data!.length} B`)
  console.log('ok lower quality retry', LOW.length, '->', r1.data!.length, '->', r2.data!.length)
}
console.log('media-fixes: all passed')
