// JPEG quality estimate from the DQT table, and the not-bigger encode loop used by image-filters.
// Run: npx tsx scripts/tests/img/jpeg-quality.test.ts
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { encodeNotBigger, estimateJpegQuality } from '../../../src/lib/img/jpegQuality'

let ok = 0
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); ok++; console.log(`ok - ${name}`) }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jq-'))
const make = (q: number) => {
  const f = path.join(dir, `q${q}.jpg`)
  execFileSync('convert', ['-size', '64x64', 'plasma:fractal', '-quality', String(q), f])
  return fs.readFileSync(f)
}

await t('estimates IJG quality within 2 points', () => {
  for (const q of [30, 50, 75, 85, 90, 95]) {
    const est = estimateJpegQuality(make(q))
    assert.ok(est !== null && Math.abs(est - q) <= 2, `q${q} -> ${est}`)
  }
})
await t('returns null for non-JPEG bytes', () => {
  assert.equal(estimateJpegQuality(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), null)
  assert.equal(estimateJpegQuality(new Uint8Array(0)), null)
})
await t('encodeNotBigger steps quality down until it fits and keeps the smallest', async () => {
  const tried: number[] = []
  const enc = async (q: number) => { tried.push(q); return new Blob([new Uint8Array(Math.round(q * 1000))]) }
  const b = await encodeNotBigger(enc, 700, 0.93)
  assert.ok(b.size <= 700, `size ${b.size}`)
  assert.equal(tried[0], 0.93)
  const b2 = await encodeNotBigger(enc, 10, 0.9)
  assert.ok(b2.size <= 900 && tried.at(-1)! >= 0.5)
})
console.log(`# ${ok} passed`)
