import assert from 'node:assert/strict'
import * as V from '../../../src/lib/b14/video.ts'
assert.deepEqual(V.sampleTimes(100, 4, 0), [12.5, 37.5, 62.5, 87.5])
const L = V.sheetLayout(10, 4, 16 / 9, 1608, 8, 100); assert.equal(L.rows, 3); assert.equal(L.cellW, 392); assert.equal(L.cells[5].x, 8 + 400); assert.equal(L.cells[5].y, 108 + L.cellH + 8)
assert.equal(V.clockText(3725), '1:02:05'); assert.equal(V.clockText(65), '1:05')
// letterbox: 20x10 frame with 2 black rows top and bottom, 3 black cols each side
const w = 20, h = 10, l = new Uint8Array(w * h)
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) l[y * w + x] = y >= 2 && y < 8 && x >= 3 && x < 17 ? 120 : 5
assert.deepEqual(V.detectBars(l, w, h), { x: 3, y: 2, w: 14, h: 6 })
assert.deepEqual(V.detectBars(new Uint8Array(w * h), w, h), { x: 0, y: 0, w, h })
assert.deepEqual(V.mergeCrops([{ x: 3, y: 2, w: 14, h: 6 }, { x: 4, y: 3, w: 12, h: 4 }], w, h), { x: 2, y: 2, w: 14, h: 6 })
assert.deepEqual(V.parseCropdetect('[x] crop=1920:800:0:140\n crop=1920:800:0:140\n crop=1920:1080:0:0'), { x: 0, y: 140, w: 1920, h: 800 })
for (const e of V.EFFECTS) assert.ok(V.effectFilter(e.id, 0.5, 640, 360).length > 3, e.id)
assert.equal(V.countdownLabel(0, 5), '5'); assert.equal(V.countdownLabel(0.99, 5), '5'); assert.equal(V.countdownLabel(1, 5), '4'); assert.equal(V.countdownLabel(4.5, 5), '1'); assert.equal(V.countdownLabel(5, 5, 'Go'), 'Go')
const wav = V.beepTrack(3, 4, 8000); assert.equal(wav.length, 44 + 32000 * 2); assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF')
console.log('b14 video ok')
// anamorphic 1280x720 shown as 1280x967 (SAR 67:90): crop maps back into coded pixels
{ const c = V.cropToCoded({ x: 0, y: 122, w: 1280, h: 722 }, 1280, 967, 1280, 720); assert.equal(c.y + c.h <= 720, true); assert.equal(c.y, 90); assert.equal(c.h % 2, 0); assert.equal(c.w, 1280) }
assert.deepEqual(V.cropToCoded({ x: 0, y: 140, w: 1280, h: 440 }, 1280, 720, 1280, 720), { x: 0, y: 140, w: 1280, h: 440 })
assert.deepEqual(V.cropToCoded({ x: 0, y: 140, w: 720, h: 1000 }, 720, 1280, 1280, 720, -90), { x: 0, y: 140, w: 720, h: 1000 })
