import assert from 'node:assert/strict'
import { renameAll, dedupeNames } from '../../../src/lib/b5/rename.ts'
const d = new Date(2026, 9, 28, 14, 5, 9)
const items = ['IMG_0001.JPG', 'IMG_0002.JPG', 'My Holiday Photo.jpeg'].map((name, i) => ({ name, size: 2048 * (i + 1), date: d }))
const base = { pattern: '{name}.{ext}', find: '', replace: '', regex: false, matchCase: false, caseMode: 'keep', start: 1, step: 1, spaces: 'keep' }
assert.deepEqual(renameAll(items, { ...base, pattern: 'trip-{n:3}.{ext}' }).names, ['trip-001.JPG', 'trip-002.JPG', 'trip-003.jpeg'])
assert.deepEqual(renameAll(items, { ...base, pattern: '{date:YYYYMMDD}_{n:auto}.{ext}', start: 9, step: 1 }).names, ['20261028_09.JPG', '20261028_10.JPG', '20261028_11.jpeg'])
assert.deepEqual(renameAll(items, { ...base, find: 'IMG_', replace: 'photo-' }).names.slice(0, 1), ['photo-0001.JPG'])
assert.deepEqual(renameAll(items, { ...base, caseMode: 'kebab' }).names[2], 'my-holiday-photo.jpeg')
assert.deepEqual(renameAll(items, { ...base, spaces: 'underscore' }).names[2], 'My_Holiday_Photo.jpeg')
assert.deepEqual(renameAll(items, { ...base, find: '(\\d+)', replace: '[$1]', regex: true }).names[0], 'IMG_[0001].JPG')
const r = renameAll(items, { ...base, pattern: 'same.{ext}' }); assert.equal(r.dup.size, 2)
assert.deepEqual(dedupeNames(['a.jpg', 'A.jpg', 'a.jpg']), ['a.jpg', 'A (2).jpg', 'a (3).jpg'])
console.log('rename ok')
