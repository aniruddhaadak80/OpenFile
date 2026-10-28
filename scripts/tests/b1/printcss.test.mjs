// Run: npx tsx scripts/tests/b1/printcss.test.mjs
import assert from 'node:assert/strict'
import { readAtPage, applyPrintMedia, toPt } from '../../../src/tools/convert/_b1/printCss.ts'
assert.ok(Math.abs(toPt('210mm') - 595.28) < 0.01)
assert.deepEqual(readAtPage('<style>@page { size: A4 landscape; margin: 1in 2cm }</style>').size, { w: 841.89, h: 595.28 })
const m = readAtPage('<style>@page { size: 5in 8in; margin: 1in 2cm }</style>'); assert.deepEqual(m.size, { w: 360, h: 576 }); assert.equal(m.margin.top, 72); assert.ok(Math.abs(m.margin.right - 56.69) < 0.01)
assert.deepEqual(readAtPage('<p>no css</p>'), {})
const h = applyPrintMedia('<link rel="stylesheet" media="print" href="p.css"><style>@media print{.x{display:none}} @media screen and (min-width:1px){.y{color:red}}</style>')
assert.match(h, /media="all"/); assert.match(h, /@media all\{/); assert.match(h, /@media not all and/)
console.log('ok   print css helpers')
