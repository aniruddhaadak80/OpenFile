import assert from 'node:assert/strict'
import * as T from '../../../src/lib/b14/text.ts'
const base = { regex: false, caseSensitive: false, wholeWord: false }
assert.deepEqual(T.applyRules('Cat cat category', [{ ...base, find: 'cat', replace: 'dog' }]), { text: 'dog dog dogegory', counts: [3] })
assert.equal(T.applyRules('Cat cat category', [{ ...base, find: 'cat', replace: 'dog', wholeWord: true }]).text, 'dog dog category')
assert.equal(T.applyRules('2026-10-29', [{ ...base, regex: true, find: '(\\d+)-(\\d+)-(\\d+)', replace: '$3/$2/$1' }]).text, '29/10/2026')
assert.equal(T.applyRules('a.b', [{ ...base, find: '.', replace: '\\n' }]).text, 'a\nb')
assert.equal(T.applyRules('x', [{ ...base, regex: true, find: '(?<n>x)', replace: '[$1]' }]).text, '[x]')
assert.throws(() => T.applyRules('x', [{ ...base, regex: true, find: '(', replace: '' }]))
assert.equal(T.findMatches('a\nb a', { ...base, find: 'a', replace: '' })[1].line, 2)
assert.equal(T.parseRuleList('colour => color\nfavour\tfavor', base)[1].replace, 'favor')
assert.equal(T.repeatText('hi', { count: 3, sep: ' ', numbered: false }), 'hi hi hi')
assert.equal(T.repeatText('row {n}', { count: 2, sep: '\n', numbered: true }), '1. row 1\n2. row 2')
assert.deepEqual(T.splitRow('a,"b,c",d', ','), ['a', 'b,c', 'd'])
assert.equal(T.guessDelimiter('a\tb\tc\n1\t2\t3'), '\t')
assert.deepEqual(T.parseColumns('1,3-4,-1', 5), [0, 2, 3, 4])
assert.equal(T.extractColumns('name,age,city\nAnn,30,"Paris, FR"', { delim: ',', cols: '3,1', outDelim: ',', skipHeader: true }).text, '"Paris, FR",Ann')
console.log('b14 text ok')
