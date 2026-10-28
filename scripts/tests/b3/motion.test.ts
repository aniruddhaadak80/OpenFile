// Run: npx tsx scripts/tests/b3/motion.test.ts
import assert from 'node:assert/strict'
import { zipSync } from 'fflate'
import { extractMotion } from '../../../src/lib/b3/motion'
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, ...new TextEncoder().encode('<x GCamera:MicroVideo="1" GCamera:MicroVideoOffset="40"/>'), 0xff, 0xd9])
const mp4 = new Uint8Array(40); mp4.set([0, 0, 0, 24], 0); mp4.set(new TextEncoder().encode('ftypmp42'), 4)
const google = Uint8Array.from([...jpeg, ...mp4])
let r = extractMotion(google)
assert.equal(r.kind, 'google'); assert.equal(r.video.length, 40); assert.equal(r.still.length, jpeg.length)
console.log('ok - google motion photo via XMP offset')
const plain = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9, ...mp4])
r = extractMotion(plain); assert.equal(r.kind, 'embedded'); assert.equal(r.video.length, 40)
console.log('ok - embedded mp4 scan')
const sam = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9, ...new TextEncoder().encode('MotionPhoto_Data'), ...mp4])
r = extractMotion(sam); assert.equal(r.kind, 'samsung'); assert.equal(r.video.length, 40)
console.log('ok - samsung marker')
const livp = zipSync({ 'IMG_1.HEIC': new Uint8Array([1, 2, 3]), 'IMG_1.MOV': mp4 })
r = extractMotion(livp); assert.equal(r.kind, 'livp'); assert.equal(r.videoExt, 'mov'); assert.equal(r.stillExt, 'heic')
console.log('ok - live photo bundle')
assert.throws(() => extractMotion(Uint8Array.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9])))
console.log('ok - plain photo rejected')
