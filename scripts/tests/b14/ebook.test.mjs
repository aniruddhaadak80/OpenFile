import assert from 'node:assert/strict'
import * as E from '../../../src/lib/b14/ebook.ts'
const txt = `\uFEFFThe Hobbit (J.R.R. Tolkien)
- Your Highlight on page 12 | Location 180-182 | Added on Monday, 3 March 2025 10:12:01

In a hole in the ground there lived a hobbit.
==========
The Hobbit (J.R.R. Tolkien)
- Your Highlight on page 12 | Location 180-183 | Added on Monday, 3 March 2025 10:12:30

In a hole in the ground there lived a hobbit. Not a nasty, dirty, wet hole.
==========
The Hobbit (J.R.R. Tolkien)
- Your Note on page 12 | Location 183 | Added on Monday, 3 March 2025 10:13:00

Great opening line
==========
Atomic Habits (James Clear)
- Your Bookmark on page 4 | Location 50 | Added on Tuesday, 4 March 2025 08:00:00


==========
`
const c = E.parseClippings(txt)
assert.equal(c.length, 4); assert.equal(c[0].book, 'The Hobbit'); assert.equal(c[0].author, 'J.R.R. Tolkien'); assert.equal(c[2].type, 'Note'); assert.equal(c[3].type, 'Bookmark'); assert.equal(c[0].page, '12'); assert.equal(c[0].locStart, 180)
const d = E.dedupeClips(c); assert.equal(d.removed, 1); assert.ok(d.clips[0].text.includes('Not a nasty'))
const g = E.groupByBook(d.clips); assert.equal(g.length, 2)
const md = E.clipsMarkdown(g[0], { notes: true, meta: true }); assert.ok(md.startsWith('# The Hobbit')); assert.ok(md.includes('**Note:** Great opening line'))
assert.equal(E.countWords("It's a well-known fact, 42 times."), 6)
assert.equal(E.readingTime(2500, 250), '10 min')
assert.equal(E.topWords('hobbit hobbit hole the the the')[0].word, 'hobbit')
console.log('b14 ebook ok')
