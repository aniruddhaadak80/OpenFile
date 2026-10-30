// Run: node --experimental-strip-types scripts/tests/b4/subtitles.test.mjs
import assert from 'node:assert/strict'
import * as S from '../../../src/lib/b4/subtitles.ts'

const srt = `1\n00:00:01,000 --> 00:00:03,500\nHello <i>world</i>\n\n2\n00:00:04,000 --> 00:00:06,000\nSecond line\nwith two rows\n`
const d = S.parseSubtitles(srt, { name: 'a.srt' })
assert.equal(d.format, 'srt'); assert.equal(d.cues.length, 2); assert.equal(d.cues[0].start, 1); assert.equal(d.cues[0].end, 3.5)
assert.equal(d.cues[1].text, 'Second line\nwith two rows')

const formats = ['srt', 'vtt', 'ass', 'ssa', 'sbv', 'sub', 'lrc', 'smi', 'ttml', 'json', 'csv']
for (const f of formats) {
  const out = S.writeSubtitles(d.cues, f, { fps: 25 })
  let back; try { back = S.parseSubtitles(out, { fps: 25 }) } catch (e) { console.error(f, JSON.stringify(out)); throw e }
  assert.equal(back.format, f === 'ssa' ? 'ssa' : f, 'detect ' + f + '\n' + out)
  assert.equal(back.cues.length, 2, 'count ' + f + '\n' + out)
  const tol = f === 'sub' ? 0.05 : f === 'ass' || f === 'ssa' || f === 'lrc' ? 0.011 : 0.002
  assert.ok(Math.abs(back.cues[1].start - 4) < tol, 'start ' + f)
  if (f !== 'lrc' && f !== 'smi') assert.ok(Math.abs(back.cues[0].end - 3.5) < tol, 'end ' + f + ' ' + back.cues[0].end)
  assert.match(S.plainText(back.cues[0].text), /Hello world/, 'text ' + f)
}
// ass italic round trip
const ass = S.writeSubtitles(d.cues, 'ass')
assert.match(ass, /\{\\i1\}world\{\\i0\}/)
assert.equal(S.parseSubtitles(ass).cues[0].text, 'Hello <i>world</i>')
// vtt with cue ids and settings
const vtt = 'WEBVTT\n\nintro\n00:01.000 --> 00:02.000 align:start\nHi\n'
const v = S.parseSubtitles(vtt); assert.equal(v.cues[0].start, 1); assert.equal(v.cues[0].text, 'Hi')
// timing tools
assert.equal(S.shiftCues(d.cues, 2)[0].start, 3)
assert.ok(Math.abs(S.scaleCues(d.cues, 25 / 23.976)[1].start - 4 * 25 / 23.976) < 1e-9)
const tp = S.twoPointSync(d.cues, 1, 2, 4, 8); assert.equal(tp[0].start, 2); assert.equal(tp[1].start, 8)
assert.ok(S.fixOverlaps([{ start: 0, end: 5, text: 'a' }, { start: 2, end: 3, text: 'b' }])[0].end < 2)
// clocks
assert.equal(S.fmtClock(3723.456), '01:02:03,456'); assert.equal(S.fmtAss(3723.456), '1:02:03.46'); assert.equal(S.parseClock('1:02:03.5'), 3723.5)
// ttml with offset times
const tt = '<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="1.5s" dur="2s">A<br/>B</p></div></body></tt>'
const t2 = S.parseSubtitles(tt); assert.equal(t2.cues[0].end, 3.5); assert.equal(t2.cues[0].text, 'A\nB')
// whisper json
const wj = JSON.stringify({ chunks: [{ timestamp: [0, 1.2], text: ' hi' }] })
assert.equal(S.parseSubtitles(wj).cues[0].end, 1.2)
console.log('subtitles: all tests passed')

// WebVTT entities: &amp; in a VTT file is an ampersand, and a VTT file written back escapes it again
{
  const vtt = 'WEBVTT\n\n00:00.500 --> 00:02.500\nFish &amp; chips &lt;3 <i>now</i>\n'
  const d = S.parseSubtitles(vtt, { name: 'a.vtt' })
  assert.equal(d.cues[0].text, 'Fish & chips <3 <i>now</i>')
  assert.match(S.writeSubtitles(d.cues, 'srt'), /Fish & chips <3 <i>now<\/i>/)
  assert.match(S.writeSubtitles(d.cues, 'vtt'), /Fish &amp; chips &lt;3 <i>now<\/i>/)
  assert.equal(S.vttDecode('a &#38; b &#x26; c &bogus;'), 'a & b & c &bogus;')
}
console.log('vtt entities ok')
