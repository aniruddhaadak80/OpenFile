import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { scan, formatsFor, gtinValid, formatLabel } from '../../../src/lib/b5/barcode-read.ts'
const require = createRequire(import.meta.url)
const full = await import('zxing-wasm/full')
const wasm = readFileSync(require.resolve('zxing-wasm/full/zxing_full.wasm'))
await full.prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) }, fireImmediately: true })
const cases = [['QRCode', 'https://openfile.app/?q=1'], ['EAN13', '4006381333931'], ['Code128', 'OPENFILE-128'], ['DataMatrix', 'Hello DM'], ['PDF417', 'PDF417 sample text'], ['Aztec', 'Aztec ok'], ['UPCA', '036000291452']]
for (const [format, text] of cases) {
  const w = await full.writeBarcode(text, { format, scale: 4 })
  assert.ok(!w.error, w.error)
  const png = new Uint8Array(await w.image.arrayBuffer())
  const hits = await scan(full, png, { thorough: true })
  assert.ok(hits.length >= 1, format)
  assert.ok(hits[0].text === text || (format === 'UPCA' && hits[0].text === '0' + text), format)
  assert.equal(hits[0].points.length, 4)
  // a filter that excludes the format finds nothing
  if (format !== 'QRCode') assert.equal((await scan(full, png, { formats: formatsFor(['qr']) })).length, 0, 'filter ' + format)
}
assert.deepEqual(formatsFor(['all']), []); assert.deepEqual(formatsFor(['qr', 'aztec']), ['QRCode', 'Aztec'])
assert.ok(gtinValid('4006381333931')); assert.ok(!gtinValid('4006381333932')); assert.ok(gtinValid('036000291452'))
assert.equal(formatLabel('EAN13'), 'EAN-13')
console.log('barcode ok')
