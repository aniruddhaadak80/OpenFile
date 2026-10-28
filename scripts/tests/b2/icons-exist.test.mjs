// Every Batch 2 registry icon must be a real lucide-react export.
import fs from 'node:fs'
import assert from 'node:assert'
const src = fs.readFileSync(new URL('../../../src/tools/batches/b2.ts', import.meta.url), 'utf8')
const names = [...src.matchAll(/icon: '([A-Za-z0-9]+)'/g)].map((m) => m[1])
const lucide = await import('lucide-react')
const missing = names.filter((n) => !lucide[n])
assert.deepEqual(missing, [], 'missing icons: ' + missing.join(', '))
const slugs = [...src.matchAll(/slug: '([a-z0-9-]+)'/g)].map((m) => m[1])
const cats = [...src.matchAll(/category: '([a-z0-9]+)'/g)].map((m) => m[1])
slugs.forEach((s, i) => assert.ok(fs.existsSync(new URL(`../../../src/tools/${cats[i]}/${s}.tsx`, import.meta.url)), `component missing for ${cats[i]}/${s}`))
const text = src.replace(/\/\/.*$/gm, '')
assert.ok(!/—/.test(text), 'em dash found in user text')
console.log('ok', names.length, 'icons,', slugs.length, 'tools')
