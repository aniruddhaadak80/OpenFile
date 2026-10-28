import assert from 'node:assert/strict'
import { escape, unescape } from '../../../src/lib/b5/escape.ts'
const s = `He said "hi"\n\tit's 50% off; C:\\path ${'${x}'} é😀`
for (const l of ['json', 'js', 'java', 'csharp', 'csharp-verbatim', 'python', 'c', 'go', 'sql', 'csv', 'shell', 'powershell', 'xml', 'html', 'url']) {
  for (const unicode of [false, true]) {
    const e = escape(l, s, { unicode, quote: true })
    assert.equal(unescape(l, e), s, `${l} unicode=${unicode}: ${e}`)
  }
}
assert.equal(escape('regex', 'a.b*c'), 'a\\.b\\*c')
assert.equal(new RegExp(escape('regex', s)).test(s), true)
assert.equal(escape('sql', "O'Reilly", { quote: true }), "'O''Reilly'")
assert.equal(escape('shell', "it's"), `'it'\\''s'`)
console.log('escape ok')
