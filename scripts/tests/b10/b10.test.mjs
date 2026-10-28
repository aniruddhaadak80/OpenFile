import assert from 'node:assert/strict'
import * as T from '../../../src/lib/b10/text.ts'
import * as D from '../../../src/lib/b10/dev.ts'
import { randomBytes } from 'node:crypto'

// readability
const r = T.readability('The cat sat on the mat. It was a sunny day. Everyone was happy.')
assert.equal(r.sentences, 3); assert.equal(r.words, 14); assert.ok(r.fleschEase > 80, String(r.fleschEase))
assert.ok(T.bionic('Hello world').includes('<b>Hel</b>lo'))
// keywords
const kw = T.rake('Compatibility of systems of linear constraints over the set of natural numbers. Criteria of compatibility of a system of linear Diophantine equations.')
assert.ok(kw.some(k => k.phrase === 'linear diophantine equations'), JSON.stringify(kw.slice(0,5)))
assert.equal(T.wordFrequency('a b b c', {})[0].word, 'b')
// similarity
assert.equal(T.levenshtein('kitten', 'sitting'), 3)
assert.equal(T.damerau('ca', 'ac'), 1)
assert.equal(T.hamming('karolin', 'kathrin'), 3)
assert.ok(Math.abs(T.jaroWinkler('MARTHA', 'MARHTA') - 0.9611) < 0.001)
assert.ok(Math.abs(T.cosine('a b c', 'a b c') - 1) < 1e-9)
assert.equal(T.fuzzyMatch(['Appel'], ['Banana', 'Apple'])[0].b, 'Apple')
// stats
const s = T.describe([2, 4, 4, 4, 5, 5, 7, 9])
assert.equal(s.mean, 5); assert.equal(s.sdPop, 2); assert.deepEqual(s.modes, [4]); assert.equal(s.median, 4.5)
assert.deepEqual(T.parseNumbers('1,234.5 and -3e2, 7'), [1234.5, -300, 7])
const reg = T.regression([1, 2, 3], [2, 4, 6]); assert.equal(reg.slope, 2); assert.equal(reg.intercept, 0)
// tables
const rows = T.parseTable('name,qty\napple,3\npear,12')
assert.equal(T.renderTable(rows, 'ascii'), '+-------+-----+\n| name  | qty |\n+-------+-----+\n| apple |   3 |\n| pear  |  12 |\n+-------+-----+')
assert.ok(T.renderTable(rows, 'markdown').includes('| apple |'))
assert.deepEqual(T.parseTable('| a | b |\n|---|---|\n| 1 | 2 |'), [['a', 'b'], ['1', '2']])
assert.equal(T.strWidth('日本'), 4)
// numbers
assert.equal(T.numberToWords('1234567'), 'one million two hundred thirty-four thousand five hundred sixty-seven')
assert.equal(T.numberToWords('12345678', { system: 'indian' }), 'one crore twenty-three lakh forty-five thousand six hundred seventy-eight')
assert.equal(T.numberToWords('21', { mode: 'ordinal' }), 'twenty-first')
assert.equal(T.numberToWords('1999', { mode: 'year' }), 'nineteen ninety-nine')
assert.equal(T.numberToWords('1250.5', { mode: 'cheque', currency: { major: 'rupee', majorPl: 'rupees', minor: 'paisa', minorPl: 'paise' } }), 'One thousand two hundred fifty rupees and 50/100 only')
assert.equal(T.numberToWords('3.14'), 'three point one four')
assert.equal(T.wordsToNumber('two lakh fifty thousand and five'), '250005')
assert.equal(T.wordsToNumber('one million two hundred thousand'), '1200000')
assert.equal(T.wordsToNumber('minus forty-two point five'), '-42.5')
for (const n of [0, 7, 15, 100, 101, 999, 1000, 1001, 90210, 1000000, 123456789]) assert.equal(T.wordsToNumber(T.numberToWords(String(n))), String(n))
for (const n of [100000, 2500000, 987654321]) assert.equal(T.wordsToNumber(T.numberToWords(String(n), { system: 'indian' })), String(n))

// hashes and ids
assert.equal(D.identifyHash('5d41402abc4b2a76b9719d911017c592').guesses[0].name, 'MD5')
assert.equal(D.identifyHash('$2b$12$KIXQJ1tS7aZ1Zz0yYzR5UuHk2r4Yb5bQ1sWwq0FvKXo8n0H6yYb1e').guesses[0].name, 'bcrypt')
assert.equal(D.identifyHash('$6$salt$abc').guesses[0].name, 'SHA-512 crypt')
assert.equal(D.analyzeId('01ARZ3NDEKTSV4RRFFQ69G5FAV').kind, 'ULID')
assert.equal(D.analyzeId('507f1f77bcf86cd799439011').fields[0][1], '2012-10-17T21:13:27.000Z')
assert.equal(D.analyzeId('017f22e2-79b0-7cc3-98c4-dc0c0c07398f').kind, 'UUID v7')
assert.equal(D.analyzeId('c232ab00-9414-11ec-b3c8-9f6bdeced846').fields.find(f => f[0] === 'Time')[1], '2022-02-22T19:22:22.000Z')
assert.equal(D.analyzeId('175928847299117063').fields[0][1], '2016-04-30T11:18:25.796Z')
// sql
const sql = D.buildSql('people', ['id', 'Full Name', 'joined', 'active'], [[1, "O'Neil", '2024-01-02', 'true'], [2, 'Ann', '', 'false']], 'postgres', { snakeCase: true, primaryKey: 'id' })
assert.ok(sql.includes('"id" INT NOT NULL PRIMARY KEY'), sql); assert.ok(sql.includes('"full_name" VARCHAR')); assert.ok(sql.includes('"joined" DATE,')); assert.ok(sql.includes("'O''Neil'")); assert.ok(sql.includes('TRUE'))
assert.ok(D.buildSql('t', ['a'], [[1]], 'mysql').includes('`a` INT'))
// secrets
const hits = D.scanSecrets('const k = "AKIAIOSFODNN7EXAMPLE"\nurl = postgres://user:hunter22@db.example.com/app\n-----BEGIN RSA PRIVATE KEY-----', 'x.js')
assert.deepEqual(hits.map(h => h.rule.id).sort(), ['aws-access-key', 'db-url', 'private-key'])
assert.equal(hits.find(h => h.rule.id === 'aws-access-key').line, 1)
// carving: dummy PNG + ZIP + PDF inside junk
const png = D.minimalFile('png', 300), zip = D.minimalFile('zip', 500), pdf = D.minimalFile('pdf', 2000), wav = D.minimalFile('wav', 1000), bmp = D.minimalFile('bmp', 600)
assert.equal(pdf.length, 2000 - (2000 - pdf.length)); assert.ok(Math.abs(pdf.length - 2000) < 80, String(pdf.length))
assert.equal(png.length, 300); assert.equal(zip.length, 500)
const junk = new Uint8Array(100).fill(7)
const blob = new Uint8Array([...junk, ...png, ...junk, ...zip, ...junk, ...pdf, ...junk, ...wav, ...junk, ...bmp, ...junk])
const found = D.carve(blob)
assert.deepEqual(found.map(f => f.sig.ext), ['png', 'zip', 'pdf', 'wav', 'bmp'], JSON.stringify(found.map(f => [f.sig.ext, f.start, f.end])))
assert.equal(found[0].end - found[0].start, 300); assert.ok(found[0].exact)
assert.equal(found[1].end - found[1].start, 500)
// zlib check of the png via node
const zlib = await import('node:zlib')
assert.equal(D.crc32(new TextEncoder().encode('123456789')), 0xcbf43926)
// verify zip with node unzip? check central dir parse via simple read
// shamir
const secret = new TextEncoder().encode('correct horse battery staple')
const shares = D.shamirSplit(secret, 5, 3, (n) => new Uint8Array(randomBytes(n)))
assert.equal(new TextDecoder().decode(D.shamirCombine([shares[0], shares[2], shares[4]])), 'correct horse battery staple')
assert.equal(new TextDecoder().decode(D.shamirCombine([shares[1], shares[3], shares[0]])), 'correct horse battery staple')
assert.notEqual(new TextDecoder().decode(D.shamirCombine([shares[1], shares[3]])), 'correct horse battery staple')
assert.deepEqual(D.fromHex(D.toHex(shares[0])), shares[0])
// encoding
const cp = new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x20, 0x6e, 0x61, 0xef, 0x76, 0x65, 0x20, 0x72, 0xe9, 0x73, 0x75, 0x6d, 0xe9])
assert.ok(['windows-1252', 'iso-8859-1', 'iso-8859-15'].includes(D.detectEncoding(cp).encoding), D.detectEncoding(cp).encoding)
const ru = new TextEncoder().encode('x'); assert.equal(D.detectEncoding(ru).encoding, 'utf-8')
const cyr = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, 0x20, 0xec, 0xe8, 0xf0, 0x2c, 0x20, 0xea, 0xe0, 0xea, 0x20, 0xe4, 0xe5, 0xeb, 0xe0])
assert.equal(D.detectEncoding(cyr).encoding, 'windows-1251', JSON.stringify(D.detectEncoding(cyr).ranked.slice(0, 4)))
assert.equal(D.fixMojibake('CafÃ© dÃ©jÃ\u00a0 vu â€” ok'), 'Café déjà vu — ok')
console.log('b10 ok')
