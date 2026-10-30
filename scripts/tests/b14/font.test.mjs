import assert from 'node:assert/strict'
// font.ts imports '@/lib/b2/fonts' lazily, so only the pure parts are tested here
const F = await import('../../../src/lib/b14/font.ts')
const c = F.normalizePath('M0 0 h10 v10 h-10 z m20 0 c0 5 5 5 5 0 s5 -5 5 0')
assert.deepEqual(c.map((x) => x.t).join(''), 'MLLLZMCC')
assert.deepEqual(c[5].p, [20, 0]); assert.deepEqual(c[7].p, [25, -5, 30, -5, 30, 0])
const t = F.normalizePath('M0 0 L10 0', [2, 0, 0, -2, 1, 1]); assert.deepEqual(t[1].p, [21, 1])
assert.equal(F.iconName('My Icon (2).svg'), 'my-icon-2')
const boxes = Array.from({ length: 95 }, (_, i) => ({ id: i, w: 20 + (i % 7), h: 30 }))
const s = F.packShelves(boxes); assert.ok((s.w & (s.w - 1)) === 0 && (s.h & (s.h - 1)) === 0)
for (const a of boxes) { assert.ok(a.x + a.w <= s.w && a.y + a.h <= s.h); for (const b of boxes) if (a !== b) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y) }
console.log('b14 font ok')
