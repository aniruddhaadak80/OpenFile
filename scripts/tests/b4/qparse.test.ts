// Quiz and Flashcard Generator parsers. Run: npx tsx scripts/tests/b4/qparse.test.ts
import assert from 'node:assert/strict'
import { parseQa, normCards, normMcq, parseMcqText, answerIndex } from '../../../src/lib/b4/qparse'

assert.deepEqual(parseQa('Q: What is it?\nA: A forest.\nQ: Where?\nA: India.'), [{ q: 'What is it?', a: 'A forest.' }, { q: 'Where?', a: 'India.' }])
assert.equal(normCards([{ question: 'x', answer: 'y' }, { q: '', a: 'z' }]).length, 1)

const opts = ['Children', 'A Reading Club', 'A Reading Club on Saturday', 'A Reading Club on Sunday']
// 0-based index kept as is
assert.equal(normMcq([{ q: 'q', options: opts, answer: 0 }])[0].answer, 0)
// a 1-based index whose explanation names the option one before it
assert.equal(normMcq([{ q: 'q', options: opts, answer: 3, explain: 'Reading Club on Saturday' }])[0].answer, 2)
// index past the end read as 1-based
assert.equal(normMcq([{ q: 'q', options: opts, answer: 4 }])[0].answer, 3)
// letter, numeric string and option text answers
assert.equal(normMcq([{ q: 'q', options: opts, answer: 'B' }])[0].answer, 1)
assert.equal(normMcq([{ q: 'q', options: opts, answer: '2' }])[0].answer, 2)
assert.equal(normMcq([{ q: 'q', options: ['Tiger', 'Lion', 'Bear', 'Wolf'], answer: 'the Bear' }])[0].answer, 2)
assert.equal(normMcq([{ q: 'q', options: opts, answer: 9 }]).length, 0)
assert.equal(answerIndex('C) A Reading Club on Saturday', opts), 2)
assert.equal(answerIndex('A reading group', ['x', 'y']), -1)

const txt = `Here are the questions.
Q: What is the largest mangrove forest?
A) The Amazon
B) The Sundarbans
C) The Congo
D) Borneo
Answer: B

Q2: When was it named a World Heritage Site?
A. 1977
B. 1987
C. 1997
D. 2007
Correct answer: 1987
Explanation: The text says 1987.

3. Which animal lives there?
(A) Polar bear
(B) Kangaroo
(C) Bengal tiger
(D) Panda
Answer: (C)`
const m = parseMcqText(txt)
assert.equal(m.length, 3)
assert.deepEqual(m[0], { q: 'What is the largest mangrove forest?', options: ['The Amazon', 'The Sundarbans', 'The Congo', 'Borneo'], answer: 1 })
assert.equal(m[1].answer, 1); assert.equal(m[1].explain, 'The text says 1987.')
assert.equal(m[2].q, 'Which animal lives there?'); assert.equal(m[2].answer, 2)
assert.equal(parseMcqText('no questions here').length, 0)
console.log('qparse ok')
