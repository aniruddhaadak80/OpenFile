// Run: node --experimental-strip-types scripts/tests/b4/docs.test.mjs
import assert from 'node:assert/strict'
import { rtfToText } from '../../../src/lib/b4/rtf.ts'

const rtf = String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0 Times;}}{\colortbl;\red255\green0\blue0;}{\*\generator Test;}\f0\fs24 Hello {\b bold} world\par Caf\'e9 \u8364?5\par{\info{\title T}}Tab\tab end\par}`
const t = rtfToText(rtf)
assert.equal(t, 'Hello bold world\nCaf\u00e9 \u20ac5\nTab\tend')
console.log('docs: all tests passed')
import { splitMbox } from '../../../src/lib/b4/mail.ts'
{
  const mbox = 'From a@b.c Mon Jan  1 00:00:00 2024\nSubject: One\n\nHello\n>From the past\n\nFrom x@y.z Tue Jan  2 00:00:00 2024\nSubject: Two\n\nBye\n'
  const m = splitMbox(mbox)
  assert.equal(m.length, 2); assert.match(m[0], /Subject: One/); assert.match(m[0], /\nFrom the past/); assert.match(m[1], /Subject: Two/)
  console.log('mbox: ok')
}
