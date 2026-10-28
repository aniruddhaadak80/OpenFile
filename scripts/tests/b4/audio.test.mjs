// Run: node --experimental-strip-types scripts/tests/b4/audio.test.mjs
import assert from 'node:assert/strict'
import { parseSilenceLog, keepSegments, selectExpr } from '../../../src/tools/audio/_b4/silence.ts'

const log = ['[silencedetect @ 0x1] silence_start: 0', '[silencedetect @ 0x1] silence_end: 1.5 | silence_duration: 1.5', 'silence_start: 4.2', 'silence_end: 6.0 | x', 'silence_start: 9.5']
const s = parseSilenceLog(log, 10)
assert.deepEqual(s, [{ start: 0, end: 1.5 }, { start: 4.2, end: 6 }, { start: 9.5, end: 10 }])
const k = keepSegments(s, 10, 0.2)
assert.equal(k.length, 2)
assert.ok(Math.abs(k[0].start - 1.3) < 1e-9 && Math.abs(k[0].end - 4.4) < 1e-9)
assert.ok(Math.abs(k[1].start - 5.8) < 1e-9 && Math.abs(k[1].end - 9.7) < 1e-9)
assert.equal(selectExpr([{ start: 1, end: 2 }]), 'between(t,1.000,2.000)')
assert.deepEqual(keepSegments([], 5, 0.1), [{ start: 0, end: 5 }])
console.log('audio: all tests passed')
import { findSilenceSplits, partsFromSplits } from '../../../src/tools/audio/_b4/silence.ts'
{
  const sr = 1000; const a = new Float32Array(5000)
  for (let i = 0; i < 5000; i++) a[i] = (i < 1500 || i > 2500) ? Math.sin(i) * 0.5 : 0
  const s = findSilenceSplits(a, sr, -40, 0.5)
  assert.equal(s.length, 1); assert.ok(Math.abs(s[0] - 2) < 0.05, String(s))
  assert.deepEqual(partsFromSplits([2], 5), [{ start: 0, end: 2 }, { start: 2, end: 5 }])
  console.log('audio splits: ok')
}
import { groupWords } from '../../../src/tools/audio/_b4/words.ts'
{
  const w = [{ start: 0, end: 0.3, text: ' Hello' }, { start: 0.3, end: 0.6, text: ' there.' }, { start: 0.7, end: 1, text: ' How' }, { start: 1, end: 1.2, text: ' are' }, { start: 3, end: 3.3, text: ' you' }]
  const g = groupWords(w, 6, 0.8)
  assert.deepEqual(g.map((x) => x.text), ['Hello there.', 'How are', 'you'])
  assert.equal(groupWords(w, 1).length, 5)
  console.log('word grouping: ok')
}
