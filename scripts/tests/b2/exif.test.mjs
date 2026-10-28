// node --experimental-strip-types scripts/tests/b2/exif.test.mjs
import fs from 'node:fs'
import assert from 'node:assert'
import exifr from 'exifr'
const { buildExif, writeExif, readExifObject } = await import('../../../src/lib/b2/exif.ts')
const f = { artist: 'Test Person', copyright: '(c) 2026 Test', description: 'A test', make: 'OpenCam', model: 'X1', software: 'OpenFile', dateTaken: '2024-05-06T07:08', orientation: 1, gps: { lat: 22.4241, lng: 87.3197, alt: 12 }, keepOther: false }
for (const [name, kind] of [['photo.jpg', 'jpg'], ['tiny.png', 'png'], ['img.webp', 'webp']]) {
  const u8 = new Uint8Array(fs.readFileSync(new URL('./fixtures/' + name, import.meta.url)))
  const ex = await buildExif(f, await readExifObject(u8, kind))
  const out = await writeExif(u8, kind, ex)
  if (kind === 'webp') {
    // exifr cannot read WebP, so read back with our own parser
    const o = await readExifObject(out, 'webp')
    assert.equal(o['0th'][315], 'Test Person'); assert.equal(o['0th'][271], 'OpenCam'); assert.equal(o.GPS[1], 'N')
    assert.equal(await readExifObject(await writeExif(out, kind, null), 'webp'), null)
    assert.equal(String.fromCharCode(...out.slice(0, 4)), 'RIFF'); assert.equal(new DataView(out.buffer).getUint32(4, true), out.length - 8)
    console.log('ok exif webp', out.length, 'bytes'); continue
  }
  const back = await exifr.parse(Buffer.from(out), { gps: true, tiff: true, exif: true })
  assert.equal(back.Artist, 'Test Person', name)
  assert.equal(back.Make, 'OpenCam', name)
  assert.ok(Math.abs(back.latitude - 22.4241) < 1e-3 && Math.abs(back.longitude - 87.3197) < 1e-3, name + ' gps')
  assert.equal(new Date(back.DateTimeOriginal).getFullYear(), 2024, name + ' date')
  const stripped = await writeExif(out, kind, null)
  const none = await exifr.parse(Buffer.from(stripped)).catch(() => undefined)
  assert.ok(!none || !none.Artist, name + ' strip')
  console.log('ok exif', kind, out.length, 'bytes')
}
