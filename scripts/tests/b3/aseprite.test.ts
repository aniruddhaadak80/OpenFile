// Builds a small .aseprite file byte by byte and reads it back. Run: npx tsx scripts/tests/b3/aseprite.test.ts
import assert from 'node:assert/strict'
import { zlibSync } from 'fflate'
import { parseAseprite, tagAnim } from '../../../src/lib/b3/aseprite'

class Wr { a: number[] = []; u8(v: number) { this.a.push(v & 255) } u16(v: number) { this.u8(v); this.u8(v >> 8) } u32(v: number) { this.u16(v & 0xffff); this.u16(v >>> 16) } str(s: string) { const b = new TextEncoder().encode(s); this.u16(b.length); b.forEach((x) => this.u8(x)) } bytes(b: ArrayLike<number>) { for (let i = 0; i < b.length; i++) this.u8(b[i]) } }
const chunk = (type: number, body: Wr) => { const w = new Wr(); w.u32(body.a.length + 6); w.u16(type); w.bytes(body.a); return w.a }
const W = 4, H = 2
function layer(name: string, visible = true) { const b = new Wr(); b.u16(visible ? 1 : 0); b.u16(0); b.u16(0); b.u16(0); b.u16(0); b.u16(0); b.u8(255); b.bytes([0, 0, 0]); b.str(name); return chunk(0x2004, b) }
function cel(layerIdx: number, x: number, y: number, w: number, h: number, rgba: number[], compressed: boolean, opacity = 255) {
  const b = new Wr(); b.u16(layerIdx); b.u16(x); b.u16(y); b.u8(opacity); b.u16(compressed ? 2 : 0); b.u16(0); b.bytes([0, 0, 0, 0, 0]); b.u16(w); b.u16(h)
  b.bytes(compressed ? zlibSync(Uint8Array.from(rgba)) : rgba); return chunk(0x2005, b)
}
function linked(layerIdx: number, to: number) { const b = new Wr(); b.u16(layerIdx); b.u16(0); b.u16(0); b.u8(255); b.u16(1); b.u16(0); b.bytes([0, 0, 0, 0, 0]); b.u16(to); return chunk(0x2005, b) }
function tags() { const b = new Wr(); b.u16(1); b.bytes(new Array(8).fill(0)); b.u16(0); b.u16(2); b.u8(2); b.u16(0); b.bytes(new Array(6).fill(0)); b.bytes([255, 0, 0]); b.u8(0); b.str('walk'); return chunk(0x2018, b) }
function frame(chunks: number[][], dur: number) { const body = chunks.flat(); const w = new Wr(); w.u32(16 + body.length); w.u16(0xf1fa); w.u16(chunks.length); w.u16(dur); w.u16(0); w.u32(chunks.length); w.bytes(body); return w.a }
const red = [255, 0, 0, 255], blue = [0, 0, 255, 255]
const f0 = frame([layer('Background'), layer('Top'), layer('Hidden', false), tags(), cel(0, 0, 0, W, H, Array(W * H).fill(red).flat(), true), cel(1, 1, 0, 1, 1, blue, false), cel(2, 0, 0, 1, 1, blue, false)], 120)
const f1 = frame([linked(0, 0), cel(1, 2, 1, 1, 1, blue, true, 128)], 80)
const f2 = frame([cel(0, 0, 0, 1, 1, blue, false)], 50)
const body = [...f0, ...f1, ...f2]
const hdr = new Wr(); hdr.u32(128 + body.length); hdr.u16(0xa5e0); hdr.u16(3); hdr.u16(W); hdr.u16(H); hdr.u16(32); hdr.u32(1); hdr.u16(100); hdr.u32(0); hdr.u32(0); hdr.u8(0); hdr.bytes([0, 0, 0]); hdr.u16(0); hdr.u8(1); hdr.u8(1)
while (hdr.a.length < 128) hdr.u8(0)
const file = Uint8Array.from([...hdr.a, ...body])
const ase = parseAseprite(file)
assert.equal(ase.width, W); assert.equal(ase.frames, 3); assert.deepEqual(ase.durations, [120, 80, 50])
assert.deepEqual(ase.layers.map((l) => l.name), ['Background', 'Top', 'Hidden'])
assert.equal(ase.tags[0].name, 'walk'); assert.equal(ase.tags[0].direction, 'pingpong')
const px = (f: number, x: number, y: number) => Array.from(ase.anim.frames[f].rgba.subarray((y * W + x) * 4, (y * W + x) * 4 + 4))
assert.deepEqual(px(0, 1, 0), blue, 'top layer drawn over background')
assert.deepEqual(px(0, 0, 0), red, 'hidden layer not drawn')
assert.deepEqual(px(1, 0, 0), red, 'linked cel reuses frame 0 background')
const half = px(1, 2, 1); assert.ok(half[0] > 100 && half[0] < 150 && half[2] > 100, 'cel opacity blends: ' + half)
assert.deepEqual(px(2, 1, 0), [0, 0, 0, 0], 'frame 2 only has a 1px cel')
assert.equal(tagAnim(ase.anim, ase.tags[0]).frames.length, 4)
console.log('ok - aseprite parse, layers, linked cels, opacity, tags')
