// Runs every video recipe against the real ffmpeg.wasm core. Run: npx tsx scripts/tests/b3/ffops.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as F from '../../../src/lib/b3/ffops'
// @ts-ignore
import { ffmpeg } from './ffwasm.mjs'

const make = async (args: string[], out: string) => { const r = await ffmpeg([...args, out], {}, [out]); assert.equal(r.code, 0, r.logs.slice(-3).join('\n')); return r.out[out] as Uint8Array }
const V = await make(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=3', '-f', 'lavfi', '-i', 'sine=f=440:duration=3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'], 'v.mp4')
const V2 = await make(['-f', 'lavfi', '-i', 'smptebars=size=320x240:rate=25:duration=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'], 'v2.mp4')
const A = await make(['-f', 'lavfi', '-i', 'sine=f=220:duration=5', '-c:a', 'libmp3lame'], 'a.mp3')
const PNG = await make(['-f', 'lavfi', '-i', 'color=c=red@0.5:s=80x40,format=rgba', '-frames:v', '1'], 'logo.png')
const IMG2 = await make(['-f', 'lavfi', '-i', 'mandelbrot=size=300x400', '-frames:v', '1'], 'img2.jpg')
const SRT = new TextEncoder().encode('1\n00:00:00,500 --> 00:00:02,000\nHello there\n')
const FONT = fs.readFileSync(new URL('../../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf', import.meta.url))
const files = { 'in.mp4': V, 'b.mp4': V2, 'a.mp3': A, 'logo.png': PNG, 'img2.jpg': IMG2, 's.srt': SRT, '/fonts/LiberationSans-Bold.ttf': FONT }

const cases: [string, F.Op][] = [
  ['crop', F.cropOp('in.mp4', { x: 10, y: 10, w: 101, h: 99 }, true)],
  ['rotate 90 + flip', F.rotateOp('in.mp4', 90, true, false, true)],
  ['rotate lossless', F.rotateMetaOp('in.mp4', 90)],
  ['resize fit color', F.resizeOp('in.mp4', 720, 1280, 'fit', 'color', '#101010', true)],
  ['resize fit blur', F.resizeOp('in.mp4', 360, 640, 'fit', 'blur', '#000', true)],
  ['resize fill', F.resizeOp('in.mp4', 200, 200, 'fill', 'color', '#000', true)],
  // reverse and boomerang are built from pieces; scripts/tests/b3/reverse.test.ts runs the whole chain
  ['reverse piece', F.reversePieceOp('in.mp4', F.reversePlan({ duration: 3, width: 320, height: 240, fps: 25 }), 0)],
  ['boomerang forward half', F.forwardPieceOp('in.mp4', F.reversePlan({ duration: 3, width: 320, height: 240, fps: 25 }))],
  ['loop x3', F.loopOp('in.mp4', 3, true)],
  ['loop to 7s', F.loopToDurationOp('in.mp4', 7, true)],
  ['fps convert', F.fpsOp('in.mp4', 'convert', 15, 1, true)],
  ['fps smooth', F.fpsOp('in.mp4', 'smooth', 30, 1, true)],
  ['slowmo', F.fpsOp('in.mp4', 'slowmo', 30, 2, true)],
  ['timelapse', F.fpsOp('in.mp4', 'timelapse', 30, 4, true)],
  ['stopmotion', F.fpsOp('in.mp4', 'stopmotion', 6, 1, true)],
  ['freeze', F.freezeOp('in.mp4', 1.2, 1.5, true)],
  ['watermark png', F.overlayPngOp('in.mp4', 'logo.png', ...F.cornerXY('br', 10), true, { opacity: 0.6, scaleW: 60 })],
  // b.mp4 has no audio: the looped logo must not keep the encode running forever after the video ends
  ['watermark png, silent video', F.overlayPngOp('b.mp4', 'logo.png', ...F.cornerXY('br', 10), false, { opacity: 0.6, scaleW: 60 })],
  ['timed overlay', F.overlayPngOp('in.mp4', 'logo.png', '10', '10', true, { t0: 0.5, t1: 2 })],
  ['timed overlays', F.timedOverlaysOp('in.mp4', [{ name: 'logo.png', t0: 0, t1: 1 }, { name: 'logo.png', t0: 1, t1: 3 }], true, 3)],
  ['timed overlays + bar', F.timedOverlaysOp('in.mp4', [{ name: 'logo.png', t0: 0, t1: 1 }], true, 3, { color: '#F5A524', height: 8, top: false, width: 320 })],
  ['pip video', F.pipOp('in.mp4', 'b.mp4', false, { x: 200, y: 140, w: 100 }, true, { border: 3 })],
  ['pip image', F.pipOp('in.mp4', 'img2.jpg', true, { x: 10, y: 10, w: 80 }, true)],
  ['background color', F.backgroundOp('in.mp4', 720, 1280, { color: '#F5A524' }, 0.9, true)],
  ['background image', F.backgroundOp('in.mp4', 400, 400, { image: 'img2.jpg' }, 0.8, true)],
  ['zoompan', F.zoomPanOp('in.mp4', 1.5, 3, 25, 320, 240, true)],
  ['audio replace', F.addAudioOp('in.mp4', 'a.mp3', 'replace', { videoHasAudio: true, offset: 0.5 })],
  ['audio mix', F.addAudioOp('in.mp4', 'a.mp3', 'mix', { videoHasAudio: true, volume: 0.5, originalVolume: 1, offset: -1 })],
  ['audio add track', F.addAudioOp('in.mp4', 'a.mp3', 'add', { videoHasAudio: true })],
  ['audio loop longest', F.addAudioOp('b.mp4', 'a.mp3', 'replace', { videoHasAudio: false, loop: true, fit: 'video' })],
  ['split h', F.splitScreenOp(['in.mp4', 'b.mp4'], 'h', 320, 240, 8, '#000000', 0, [true, false])],
  ['split grid 3', F.splitScreenOp(['in.mp4', 'b.mp4', 'in.mp4'], 'grid', 160, 120, 4, '#ffffff', 'mix', [true, false, true], 'fit')],
  ['filters', F.filtersOp('in.mp4', { ...F.NEUTRAL, brightness: 0.1, contrast: 1.2, saturation: 1.3, sharpen: 1, vignette: 40, temperature: 50, hue: 20, denoise: true, sepia: true }, true)],
  ['stabilize', F.stabilizeOp('in.mp4', 'normal', true, true)],
  ['delogo', F.delogoOp('in.mp4', { x: 0, y: 0, w: 60, h: 40 }, 320, 240, true, [0, 2])],
  ['blur regions', F.blurRegionOp('in.mp4', [{ x: 10, y: 10, w: 60, h: 40 }, { x: 200, y: 100, w: 81, h: 51 }], 'blur', 10, true)],
  ['pixelate', F.blurRegionOp('in.mp4', [{ x: 10, y: 10, w: 100, h: 80 }], 'pixelate', 12, true, [1, 2])],
  ['black box', F.blurRegionOp('in.mp4', [{ x: 10, y: 10, w: 100, h: 80 }], 'black', 1, true)],
  ['chroma color', F.chromaKeyOp('in.mp4', '#00ff00', 0.2, 0.1, { color: '#0000ff' }, true, 320, 240)],
  ['chroma image', F.chromaKeyOp('in.mp4', '#00ff00', 0.2, 0.1, { image: 'img2.jpg' }, true, 320, 240)],
  ['chroma transparent', F.chromaKeyOp('in.mp4', '#00ff00', 0.2, 0.1, { transparent: true }, true, 320, 240)],
  ['burn subs styled', F.burnSubsOp('in.mp4', 's.srt', '/fonts', { font: 'Liberation Sans', size: 24, color: '#ffffff', outline: '#000000', outlineW: 2, box: true, position: 'bottom', margin: 20 }, true)],
  ['soft subs mp4', F.softSubsOp('in.mp4', 's.srt', 'mp4', 'eng')],
  ['soft subs mkv', F.softSubsOp('in.mp4', 's.srt', 'mkv', 'eng')],
  ['remux', F.remuxOp('in.mp4', 'mp4', { genpts: true })],
  ['repair reencode', F.reencodeRepairOp('in.mp4')],
  ['slideshow xfade kb audio', F.slideshowOp([{ name: 'logo.png', duration: 2 }, { name: 'img2.jpg', duration: 2 }], { w: 320, h: 240, fps: 25, transition: 'fade', td: 0.5, kenBurns: true, fit: 'fit', bg: '#000000', audio: 'a.mp3', audioFade: true })],
  ['slideshow plain', F.slideshowOp([{ name: 'logo.png', duration: 1 }, { name: 'img2.jpg', duration: 1 }, { name: 'logo.png', duration: 1 }], { w: 320, h: 240, fps: 25, transition: 'none', td: 0, kenBurns: false, fit: 'fill', bg: '#000000' })],
  ['xfade join', F.xfadeJoinOp([{ name: 'in.mp4', duration: 3, hasAudio: true }, { name: 'b.mp4', duration: 2, hasAudio: false }], { w: 320, h: 240, fps: 25, transition: 'wipeleft', td: 0.5 })],
]

const only = process.argv[2]
let ok = 0, fail = 0
for (const [name, op] of cases) {
  if (only && !name.includes(only)) continue
  const r = await ffmpeg(op.args, files, [op.output])
  const size = r.out[op.output]?.length ?? 0
  if (r.code === 0 && size > 300) { ok++; console.log(`ok - ${name} (${size} B)`) }
  else { fail++; console.log(`FAIL - ${name} code=${r.code} size=${size}\n   ${r.logs.filter((l: string) => /error|invalid|fail|no such|unable|not/i.test(l)).slice(-4).join('\n   ')}`) }
}
console.log(`\n${ok} passed, ${fail} failed`)
if (fail) process.exit(1)
