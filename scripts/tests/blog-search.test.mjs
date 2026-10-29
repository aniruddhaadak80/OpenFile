// Unit tests for the blog search engine (src/blog/search/engine.ts) and the index builder.
// Run: node --experimental-strip-types --test scripts/tests/blog-search.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseQuery, search, matchWord, editDistance, escapeRegExp, highlightParts, suggestQuery, stripFilter } from '../../src/blog/search/engine.ts'
import { buildIndex, extractSections } from '../blog-search/build-index.mjs'

const docs = [
  { slug: 'midi', title: 'MIDI files explained', description: 'Why a MIDI file has no sound in it.', tags: ['audio', 'music'], date: '2026-10-01', minutes: 6, video: true, listen: true, quiz: true,
    sections: [{ id: '', h: '', text: 'Middle C is note 60. Velocity says how hard the key was hit.' }, { id: 'timing', h: 'Timing', text: 'Times are stored in ticks and a tempo setting.' }] },
  { slug: 'pdf', title: 'Shrink a PDF to fit an email limit', description: 'Compression routine for attachments.', tags: ['pdf', 'email', 'tips'], date: '2026-10-23', minutes: 4, video: false, listen: true, quiz: false,
    sections: [{ id: 'page-range', h: 'Page range syntax', text: 'Use a page range like 1-3 to split the document.' }] },
  { slug: 'gif', title: 'Make a good GIF from a video clip', description: 'Four settings that fix huge GIFs.', tags: ['video', 'gif'], date: '2026-10-17', minutes: 8, video: true, listen: false, quiz: true,
    sections: [{ id: '', h: '', text: 'Frame rate, width, length and colours decide the size.' }] },
]
const slugs = (q, mode) => search(docs, parseQuery(q), mode).map((h) => h.doc.slug)

test('parser reads words, phrases, excludes and filters', () => {
  const q = parseQuery('Email "page range" -video tag:pdf has:quiz time:<5 tag:Tips')
  assert.deepEqual(q.terms, ['email'])
  assert.deepEqual(q.phrases, ['page range'])
  assert.deepEqual(q.excludes, ['video'])
  assert.deepEqual(q.tags, ['pdf', 'tips'])
  assert.deepEqual(q.has, ['quiz'])
  assert.deepEqual(q.time, { op: '<', n: 5 })
  assert.equal(parseQuery('time:>=7').time.op, '>=')
  assert.equal(parseQuery('time:6').time.op, '=')
  assert.equal(parseQuery('tag:').active, false)
  assert.deepEqual(parseQuery('has:nope').terms, ['has', 'nope'])
  assert.deepEqual(parseQuery('how to midi').terms, ['midi'])
})

test('body only words are found', () => { assert.deepEqual(slugs('velocity'), ['midi']); assert.deepEqual(slugs('ticks tempo'), ['midi']) })
test('prefix match', () => assert.deepEqual(slugs('veloc'), ['midi']))
test('typos are tolerated', () => { assert.deepEqual(slugs('velocty'), ['midi']); assert.deepEqual(slugs('compresion'), ['pdf']); assert.equal(matchWord('pfd', 'pdf'), 0) })
test('multi word is AND', () => { assert.deepEqual(slugs('gif velocity'), []); assert.deepEqual(slugs('gif velocity', 'any').sort(), ['gif', 'midi']) })
test('phrase must be in order', () => { assert.deepEqual(slugs('"page range"'), ['pdf']); assert.deepEqual(slugs('"range page"'), []) })
test('filters', () => {
  assert.deepEqual(slugs('tag:video'), ['gif'])
  assert.deepEqual(slugs('has:video').sort(), ['gif', 'midi'])
  assert.deepEqual(slugs('has:quiz time:<7'), ['midi'])
  assert.deepEqual(slugs('time:<5'), ['pdf'])
  assert.deepEqual(slugs('-video').sort(), ['midi', 'pdf'])
})
test('title beats body', () => {
  const extra = [...docs, { slug: 'x', title: 'Tempo', description: '', tags: [], date: '2020-01-01', minutes: 3, video: false, listen: false, quiz: false, sections: [] }]
  assert.equal(search(extra, parseQuery('tempo'))[0].doc.slug, 'x')
})
test('snippet comes from the matching section', () => {
  const h = search(docs, parseQuery('ticks'))[0]
  assert.equal(h.snippet.id, 'timing')
  assert.match(h.snippet.text, /ticks/)
})
test('edit distance counts swaps as one', () => { assert.equal(editDistance('pdf', 'pfd'), 1); assert.equal(editDistance('kitten', 'sitting', 3), 3) })
test('regex escaping, backslash first', () => {
  assert.equal(escapeRegExp('a\\b'), 'a\\\\b')
  assert.equal(escapeRegExp('(x)*[y]$'), '\\(x\\)\\*\\[y\\]\\$')
  assert.doesNotThrow(() => search(docs, parseQuery('(( [ \\ *+? "a(b"')))
  assert.doesNotThrow(() => highlightParts('a (b) c', ['(b', '\\']))
})
test('highlight splits into parts and never returns markup', () => {
  const parts = highlightParts('Velocity says <b>how</b> hard', ['velocity', 'hard'])
  assert.deepEqual(parts.filter((p) => p.hit).map((p) => p.t), ['Velocity', 'hard'])
  assert.equal(parts.map((p) => p.t).join(''), 'Velocity says <b>how</b> hard')
})
test('did you mean', () => { assert.equal(suggestQuery(docs, 'velosoty'), 'velocity'); assert.equal(suggestQuery(docs, 'midi'), null) })
test('strip filter', () => assert.equal(stripFilter('pdf tag:email has:quiz', 'tag', 'email'), 'pdf has:quiz'))

test('index builder reads JSX text, headings and Table props', () => {
  const secs = extractSections(`<>
    <p>Hello <strong>bold</strong> world{' '}<T to="x">link text</T>.</p>
    <H2>First heading</H2>
    <Table head={['Format', 'Shape']} rows={[['CSV', <code>flat</code>]]} />
    <Demo onClick={() => run('ignore me')} className="hidden" />
  </>`)
  assert.equal(secs[0].text, 'Hello bold world link text.')
  assert.equal(secs[1].id, 'first-heading')
  assert.match(secs[1].text, /Format Shape CSV flat/)
  assert.doesNotMatch(secs.map((s) => s.text).join(' '), /hidden|className/)
})
test('real index covers every post body', () => {
  const idx = buildIndex()
  assert.ok(Object.keys(idx.posts).length >= 20)
  const midi = idx.posts['midi-files-explained']
  assert.ok(midi.s.some(([, , t]) => /velocity/i.test(t)))
})
