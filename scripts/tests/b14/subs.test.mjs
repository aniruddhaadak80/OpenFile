import assert from 'node:assert/strict'
import { splitAt, splitCount, joinTracks, middleCut } from '../../../src/lib/b14/subs.ts'
const cue = (start, end, text) => ({ start, end, text })
const cues = [cue(0.599, 4.16, 'a'), cue(4.16, 6.77, 'b'), cue(6.77, 10.88, 'c'), cue(10.88, 16.7, 'd'), cue(16.7, 21.48, 'e')]
// default cut sits on a cue boundary near the middle, never inside a line
const mid = middleCut(cues)
assert.equal(mid, 10.88)
const parts = splitAt(cues, [mid], true)
assert.deepEqual(parts.map((p) => p.length), [3, 2])
assert.ok(parts.flat().every((c) => c.end > c.start))
// split then join with gap 0 gives back the original times
const back = joinTracks(parts, [null, null], 0)
assert.deepEqual(back.map((c) => [c.start, c.end].map((n) => +n.toFixed(3))), cues.map((c) => [c.start, c.end]))
// equal parts cut at the end of the earlier cue, so a gap before the next cue survives the round trip
const gappy = [cue(1, 2, 'a'), cue(3, 4, 'b'), cue(6, 7, 'c'), cue(8, 9, 'd')]
const eq = splitCount(gappy, 2, true)
const back2 = joinTracks(eq, [null, null], 0)
assert.deepEqual(back2.map((c) => [c.start, c.end]), gappy.map((c) => [c.start, c.end]))
assert.equal(middleCut([cue(0, 1, 'x')]), null)
console.log('b14 subs ok')
