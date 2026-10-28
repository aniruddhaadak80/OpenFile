// Run: node --experimental-strip-types scripts/tests/b4/docs.test.mjs
import assert from 'node:assert/strict'
import { rtfToText } from '../../../src/lib/b4/rtf.ts'

const rtf = String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0 Times;}}{\colortbl;\red255\green0\blue0;}{\*\generator Test;}\f0\fs24 Hello {\b bold} world\par Caf\'e9 \u8364?5\par{\info{\title T}}Tab\tab end\par}`
const t = rtfToText(rtf)
assert.equal(t, 'Hello bold world\nCaf\u00e9 \u20ac5\nTab\tend')
console.log('docs: all tests passed')
