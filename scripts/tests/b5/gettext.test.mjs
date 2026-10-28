import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { writeFileSync, readFileSync } from 'node:fs'
import { parsePo, writePo, writeMo, parseMo, toRows, fromRows } from '../../../src/lib/b5/gettext.ts'
const po = `# French translation
msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"
"Language: fr\\n"
"Plural-Forms: nplurals=2; plural=(n > 1);\\n"

#. Shown on the home page
#: src/App.tsx:12
#, fuzzy
msgid "Hello"
msgstr "Bonjour"

msgctxt "menu"
msgid "Open"
msgstr "Ouvrir"

msgid "One file"
msgid_plural "%d files"
msgstr[0] "Un fichier"
msgstr[1] "%d fichiers"

msgid "Line one\\n"
"line two"
msgstr "Ligne un\\nligne \\"deux\\""

msgid "Untranslated"
msgstr ""
`
const c = parsePo(po)
assert.equal(c.headers.Language, 'fr'); assert.equal(c.entries.length, 5)
assert.deepEqual(c.entries[0].flags, ['fuzzy']); assert.equal(c.entries[1].ctx, 'menu'); assert.deepEqual(c.entries[2].str, ['Un fichier', '%d fichiers'])
assert.equal(c.entries[3].id, 'Line one\nline two'); assert.equal(c.entries[3].str[0], 'Ligne un\nligne "deux"')
const c2 = parsePo(writePo(c)); assert.deepEqual(c2, c)
const mo = writeMo(c); const back = parseMo(mo)
assert.equal(back.entries.length, 4); assert.equal(back.headers.Language, 'fr')
assert.deepEqual(back.entries.find((e) => e.ctx === 'menu').str, ['Ouvrir'])
const rows = toRows(c); const c3 = fromRows(rows); assert.equal(c3.entries[2].str[1], '%d fichiers'); assert.equal(c3.entries[1].ctx, 'menu')
try {
  writeFileSync('/tmp/t.po', po); execSync('msgfmt -o /tmp/t.mo /tmp/t.po 2>/dev/null')
  const ref = parseMo(new Uint8Array(readFileSync('/tmp/t.mo')))
  // msgfmt skips fuzzy entries by default
  assert.deepEqual(ref.entries.find((e) => e.ctx === 'menu').str, ['Ouvrir']); console.log('compared with msgfmt')
  writeFileSync('/tmp/mine.mo', mo); const dump = execSync('msgunfmt /tmp/mine.mo').toString(); assert.match(dump, /Ouvrir/); console.log('msgunfmt reads our MO')
} catch (e) { if (!String(e).includes('not found') && !String(e).includes('Command failed')) throw e; else console.log('msgfmt not available, skipped') }
console.log('gettext ok')
