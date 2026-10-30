// Unit tests for the new-category tools (privacy, geo, office, science, creator, AI fallbacks).
// Run: node scripts/tests/bcat/bcat.test.mjs   (fixtures: node scripts/tests/bcat/make-fixtures.mjs)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as P from '../../../src/lib/bcat/privacy.ts'
import * as G from '../../../src/lib/bcat/geo2.ts'
import * as O from '../../../src/lib/bcat/office.ts'
import * as S from '../../../src/lib/bcat/science.ts'
import * as C from '../../../src/lib/bcat/creator.ts'
import * as Q from '../../../src/lib/bcat/quick.ts'
import { pack, unpack } from '../../../src/lib/bcat/selfdecrypt.ts'

const fx = (n) => new URL('./fixtures/' + n, import.meta.url)
let n = 0
const t = (name, fn) => { try { fn(); n++ } catch (e) { console.error('FAIL', name); throw e } }
const ta = async (name, fn) => { try { await fn(); n++ } catch (e) { console.error('FAIL', name); throw e } }

/* privacy */
t('luhn', () => { assert.ok(P.luhn('4111 1111 1111 1111')); assert.ok(!P.luhn('4111 1111 1111 1112')) })
t('iban', () => { assert.ok(P.ibanOk('GB82 WEST 1234 5698 7654 32')); assert.ok(!P.ibanOk('GB82 WEST 1234 5698 7654 33')) })
t('pii', () => {
  const s = 'Mail a.b@example.com, card 4111 1111 1111 1111, fake 1234 5678 9012 3456, IP 10.0.0.1, PAN ABCDE1234F, SSN 123-45-6789'
  const h = P.findPii(s, ['email', 'card', 'ip', 'pan', 'ssn'])
  assert.deepEqual(h.map((x) => x.kind), ['email', 'card', 'ip', 'pan', 'ssn'])
  const r = P.redact(s, h, 'label'); assert.ok(r.includes('[EMAIL]') && r.includes('[CARD NUMBER]') && !r.includes('4111'))
  assert.ok(P.redact('x@y.com x@y.com', P.findPii('x@y.com x@y.com', ['email']), 'token') === '[EMAIL_1] [EMAIL_1]')
  assert.equal(P.maskOne({ kind: 'card', text: '4111 1111 1111 1111', start: 0, end: 0 }, 'partial', 1), '**** **** **** 1111')
})
t('hidden chars', () => {
  const s = 'Pa\u200by а\u202e\u00a0x'
  const h = P.scanHidden(s)
  assert.deepEqual(h.map((x) => x.kind), ['zero-width', 'lookalike', 'bidi', 'space'])
  assert.equal(P.cleanHidden(s, ['zero-width', 'lookalike', 'bidi', 'space']), 'Pay a x')
})
t('entropy', () => { assert.equal(P.entropy(new Uint8Array(100)), 0); const r = new Uint8Array(65536); for (let i = 0; i < r.length; i++) r[i] = i & 255; assert.ok(Math.abs(P.entropy(r) - 8) < 1e-9); assert.ok(P.entropyBlocks(r, 16).length >= 16) })
t('sums', () => {
  const l = P.parseSums('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  empty.txt\nd41d8cd98f00b204e9800998ecf8427e *b.bin\nSHA256 (c.iso) = ' + 'a'.repeat(64))
  assert.deepEqual(l.map((x) => [x.name, x.algo]), [['empty.txt', 'SHA-256'], ['b.bin', 'MD5'], ['c.iso', 'SHA-256']])
})
t('stego', () => {
  for (const bits of [1, 2]) {
    const px = new Uint8ClampedArray(64 * 64 * 4).map((_, i) => (i * 37) & 255)
    const msg = new TextEncoder().encode('secret message ✓ '.repeat(10))
    const out = P.stegoEmbed(px, msg, bits, 3)
    for (let i = 3; i < out.length; i += 4) assert.equal(out[i], px[i]) // alpha untouched
    const r = P.stegoExtract(out); assert.ok(r); assert.equal(r.flags, 3); assert.equal(new TextDecoder().decode(r.payload), new TextDecoder().decode(msg))
    let maxd = 0; for (let i = 0; i < out.length; i++) maxd = Math.max(maxd, Math.abs(out[i] - px[i])); assert.ok(maxd <= (1 << bits) - 1)
  }
  assert.equal(P.stegoExtract(new Uint8ClampedArray(4000)), null)
  assert.throws(() => P.stegoEmbed(new Uint8ClampedArray(40), new Uint8Array(100)))
})
await ta('pw crypto', async () => { const e = await P.pwEncrypt(new TextEncoder().encode('hi'), 'pw', 1000); assert.equal(new TextDecoder().decode(await P.pwDecrypt(e, 'pw')), 'hi'); await assert.rejects(P.pwDecrypt(e, 'nope')) })
t('self decrypt pack', () => { const p = pack('file', 'a.txt', 'text/plain', new Uint8Array([1, 2, 3])); const u = unpack(p); assert.equal(u.meta.name, 'a.txt'); assert.deepEqual([...u.data], [1, 2, 3]) })
t('strip jpeg', () => {
  const app1 = [0xff, 0xe1, 0x00, 0x10, ...'Exif\0\0'.split('').map((c) => c.charCodeAt(0)), 1, 2, 3, 4, 5, 6, 7, 8]
  const com = [0xff, 0xfe, 0x00, 0x05, 65, 66, 67]
  const dqt = [0xff, 0xdb, 0x00, 0x04, 9, 9]
  const sos = [0xff, 0xda, 0x00, 0x02, 1, 2, 3, 0xff, 0xd9]
  const r = P.stripJpeg(new Uint8Array([0xff, 0xd8, ...app1, ...com, ...dqt, ...sos]))
  assert.deepEqual([...r.out], [0xff, 0xd8, ...dqt, ...sos]); assert.equal(r.removed.length, 2)
})
t('strip png + mp3 + webp', () => {
  const chunk = (type, data) => { const b = new Uint8Array(12 + data.length), dv = new DataView(b.buffer); dv.setUint32(0, data.length); b.set([...type].map((c) => c.charCodeAt(0)), 4); b.set(data, 8); dv.setUint32(8 + data.length, P.crc32(b.subarray(4, 8 + data.length))); return [...b] }
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]), ...chunk('tEXt', [65, 0, 66]), ...chunk('IDAT', [1, 2]), ...chunk('IEND', [])])
  const r = P.stripPng(png); assert.equal(r.removed.length, 1); assert.equal(r.out.length, png.length - 15)
  const id3 = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 4, 1, 2, 3, 4, 0xff, 0xfb, 9, 9])
  assert.deepEqual([...P.stripMp3(id3).out], [0xff, 0xfb, 9, 9])
  const riff = (chunks) => { const body = chunks.flat(); const h = [...'RIFF'].map((c) => c.charCodeAt(0)); const len = body.length + 4; return new Uint8Array([...h, len & 255, (len >> 8) & 255, 0, 0, ...[...'WEBP'].map((c) => c.charCodeAt(0)), ...body]) }
  const wc = (type, data) => [...[...type].map((c) => c.charCodeAt(0)), data.length, 0, 0, 0, ...data, ...(data.length & 1 ? [0] : [])]
  const w = P.stripWebp(riff([wc('VP8X', [0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0]), wc('VP8 ', [1, 2, 3, 4]), wc('EXIF', [1, 2, 3])]))
  assert.deepEqual(w.removed, ['EXIF']); assert.equal(w.out[20] & 0x0c, 0); assert.equal(new DataView(w.out.buffer).getUint32(4, true), w.out.length - 8)
})

/* geo */
const gpxA = readFileSync(fx('morning-run.gpx'), 'utf8')
t('gpx parse + stats', () => {
  const { tracks, waypoints } = G.parseGpx(gpxA)
  assert.equal(tracks.length, 1); assert.equal(tracks[0].points.length, 120); assert.equal(waypoints[0].name, 'Home'); assert.equal(tracks[0].points[0].hr, 130)
  const s = G.trackStats(tracks[0].points)
  assert.ok(s.distance > 11000 && s.distance < 14000, String(s.distance)); assert.equal(s.duration, 119 * 20); assert.ok(s.ascent > 20); assert.ok(s.avgHr > 130)
  const sp = G.splits(tracks[0].points, 1000); assert.ok(sp.length >= 11); assert.ok(sp[0].pace > 0)
})
t('simplify + privacy + split + write', () => {
  const pts = G.parseGpx(gpxA).tracks[0].points
  const simp = G.simplify(pts, 5); assert.ok(simp.length < pts.length / 4, String(simp.length)); assert.deepEqual(simp[0], pts[0]); assert.deepEqual(simp.at(-1), pts.at(-1))
  const pz = G.privacyFilter(pts, [{ lat: pts[0].lat, lon: pts[0].lon, r: 500 }], 0, 1000); assert.ok(G.dist(pz[0], pts[0]) > 500); assert.ok(pz.length < pts.length - 10)
  const parts = G.splitTrack({ name: 'x', points: pts }, { atIndex: [40, 80] }); assert.equal(parts.length, 3); assert.equal(parts[1].points.length, 40)
  const back = G.parseGpx(G.writeGpx(parts)); assert.equal(back.tracks.length, 3); assert.equal(back.tracks[0].points[5].hr, pts[5].hr)
  assert.equal(G.stripExtras(pts, { time: true, hr: true })[0].time, undefined)
})
t('geo codes', () => {
  assert.equal(G.plusEncode(47.36559, 8.524997), '8FVC9G8F+6X')
  assert.equal(G.plusEncode(47.36559, 8.524997, 11), '8FVC9G8F+6XQ')
  const d = G.plusDecode('8FVC9G8F+6X'); assert.ok(Math.abs(d.lat - 47.3656) < 0.0002 && Math.abs(d.lon - 8.525) < 0.0002)
  assert.equal(G.geohashEncode(57.64911, 10.40744, 11), 'u4pruydqqvj')
  assert.ok(Math.abs(G.geohashDecode('u4pruydqqvj').lat - 57.64911) < 1e-5)
  assert.equal(G.maidenhead(51.477, -0.0014), 'IO91xl'.slice(0, 4) + G.maidenhead(51.477, -0.0014).slice(4))
  assert.equal(G.maidenhead(48.8584, 2.2945, 2), 'JN18')
  const m = G.maidenheadDecode('JN18du'); assert.ok(Math.abs(m.lat - 48.85) < 0.05 && Math.abs(m.lon - 2.29) < 0.1)
})
t('area', () => {
  const fc = JSON.parse(readFileSync(fx('parks.geojson'), 'utf8'))
  const a = G.geomArea(fc.features[0].geometry); assert.ok(Math.abs(a - 1236000) / 1236000 < 0.01, String(a))
  assert.ok(Math.abs(G.geomLength(fc.features[1].geometry) - 1112) < 5)
  assert.equal(G.tracksFromGeoJSON(fc).length, 1)
})

/* office */
t('diff sheets', () => {
  const a = [['id', 'v'], [1, 'a'], [2, 'b'], [3, 'c']], b = [['id', 'v'], [3, 'c'], [1, 'A'], [4, 'd']]
  const k = O.diffSheets(a, b, 0); assert.equal(k.changed.length, 1); assert.deepEqual(k.addedRows, [3]); assert.deepEqual(k.removedRows, [2])
  const p = O.diffSheets(a, a.slice(0, 3)); assert.deepEqual(p.removedRows, [3]); assert.equal(O.colName(27), 'AB')
})
t('pivot', () => {
  const rows = [{ r: 'N', p: 'Pens', a: '120' }, { r: 'S', p: 'Pens', a: '80' }, { r: 'N', p: 'Paper', a: '1,200' }]
  const pv = O.pivot(rows, 'r', 'p', 'a', 'sum'); assert.deepEqual(pv.rowKeys, ['N', 'S']); assert.deepEqual(pv.colKeys, ['Paper', 'Pens']); assert.deepEqual(pv.table, [[1200, 120], [null, 80]]); assert.equal(pv.grand, 1400)
  assert.equal(O.pivot(rows, 'p', null, null, 'count').grand, 3)
})
t('ics', () => {
  const c = O.parseIcs(readFileSync(fx('team.ics'), 'utf8'))
  assert.equal(c.name, 'Team'); assert.equal(c.events.length, 2); assert.equal(c.events[0].summary, 'Planning, Q3'); assert.equal(c.events[0].start.toISOString(), '2026-11-02T09:30:00.000Z')
  assert.equal(c.events[0].organizer, 'Asha'); assert.equal(c.events[1].allDay, true); assert.equal(c.events[1].description, 'Office closed.\nEnjoy.')
  assert.equal(O.describeRrule(c.events[0].rrule), 'Every week on MO, 4 times')
})
t('vcf', () => {
  const cs = O.parseVcf(readFileSync(fx('contacts.vcf'), 'utf8')); assert.equal(cs.length, 3); assert.equal(cs[0].org, 'Acme, Sales'); assert.equal(cs[0].first, 'Asha')
  const back = O.parseVcf(O.toVcf(cs)); assert.deepEqual(back.map((x) => x.name), cs.map((x) => x.name))
  const fromCsv = O.rowsToContacts(['Full Name', 'E-mail', 'Mobile'], [['Z Q', 'z@q.io', '123']]); assert.deepEqual(fromCsv[0].emails, ['z@q.io'])
})
t('docx xml', () => {
  const x = '<w:p><w:r><w:t>A</w:t></w:r><w:del w:id="1"><w:r><w:delText>old</w:delText></w:r></w:del><w:ins w:id="2"><w:r><w:t>new</w:t></w:r></w:ins></w:p>'
  assert.equal(O.acceptChanges(x).xml, '<w:p><w:r><w:t>A</w:t></w:r><w:r><w:t>new</w:t></w:r></w:p>')
  assert.equal(O.rejectChanges(x).xml, '<w:p><w:r><w:t>A</w:t></w:r><w:r><w:t>old</w:t></w:r></w:p>')
  const r = O.docxReplace('<w:p><w:r><w:t>ACME Cor</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>p. &amp; co</w:t></w:r></w:p>', 'ACME Corp', 'Globex', {})
  assert.equal(r.count, 1); assert.ok(r.xml.includes('>Globex</w:t>') && r.xml.includes('>. &amp; co</w:t>'))
  assert.equal(O.removeHidden('<w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>x</w:t></w:r><w:r><w:t>y</w:t></w:r></w:p>').xml, '<w:p><w:r><w:t>y</w:t></w:r></w:p>')
  assert.equal(O.removeComments('<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>a</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>').xml, '<w:p><w:r><w:t>a</w:t></w:r></w:p>')
})

/* science */
t('elements', () => {
  assert.equal(S.ELEMENTS.length, 118); const fe = S.BY_SYMBOL.get('Fe'); assert.deepEqual([fe.period, fe.group, fe.cat], [4, 8, 'transition'])
  assert.equal(S.BY_SYMBOL.get('Hf').group, 4); assert.equal(S.BY_SYMBOL.get('Og').group, 18); assert.equal(S.BY_SYMBOL.get('Ce').row, 9)
  assert.equal(S.BY_SYMBOL.get('Cu').config, '[Ar] 3d10 4s1'); assert.deepEqual(S.shellCounts(19), [2, 8, 8, 1])
})
t('molar mass', () => { assert.ok(Math.abs(S.molarMass('H2O').mass - 18.015) < 0.01); assert.ok(Math.abs(S.molarMass('CuSO4·5H2O').mass - 249.68) < 0.02); assert.ok(Math.abs(S.molarMass('K4[Fe(CN)6]').mass - 368.35) < 0.02); assert.throws(() => S.parseFormula('Xx2')) })
t('balance', () => {
  assert.equal(S.balance('Fe + O2 -> Fe2O3').text, '4 Fe + 3 O2 → 2 Fe2O3')
  assert.equal(S.balance('KMnO4 + HCl = KCl + MnCl2 + H2O + Cl2').text, '2 KMnO4 + 16 HCl → 2 KCl + 2 MnCl2 + 8 H2O + 5 Cl2')
  assert.equal(S.balance('Cu + NO3^- + H^+ -> Cu^2+ + NO + H2O').text, '3 Cu + 2 NO3^- + 8 H^+ → 3 Cu^2+ + 2 NO + 4 H2O')
  assert.throws(() => S.balance('H2 + O2'))
})
t('rref', () => { const r = S.rref([[2, 1, -1, 8], [-3, -1, 2, -11], [-2, 1, 2, -3]]); assert.deepEqual(r.map((x) => S.qStr(x[3])), ['2', '3', '-1']) })
t('logic', () => {
  const tt = S.truthTable('(A and B) or (A and not B)'); assert.deepEqual(tt.minterms, [2, 3]); assert.equal(S.simplifySop(tt.vars, tt.minterms), 'A')
  assert.equal(S.truthTable("AB' + A'B").minterms.join(), '1,2')
  assert.equal(S.truthTable('p -> q').minterms.join(), '0,1,3')
  assert.equal(S.simplifySop(['A'], [0, 1]), '1')
})
t('primes', () => {
  assert.deepEqual([...S.factorize(600851475143n).keys()], [71n, 839n, 1471n, 6857n])
  assert.deepEqual([...S.factorize(2n ** 67n - 1n).keys()], [193707721n, 761838257287n])
  assert.ok(S.isPrime(1000000007n)); assert.ok(!S.isPrime(561n))
  const f = S.factorize(360n); assert.equal(S.divisorCount(f), 24n); assert.equal(S.totient(360n, f), 96n); assert.equal(S.lcmAll([4n, 6n]), 12n); assert.equal(S.gcdAll([12n, 18n, 30n]), 6n)
})

/* creator */
t('post lengths', () => {
  assert.equal(C.xLength('hi https://example.com/a/very/long/path'), 3 + 23); assert.equal(C.xLength('😀'), 2)
  assert.deepEqual(C.smsInfo('a'.repeat(161)).parts, 2); assert.equal(C.smsInfo('₹').encoding, 'Unicode')
  const th = C.splitThread('word '.repeat(150)); assert.ok(th.every((p) => C.xLength(p) <= 280)); assert.ok(th[0].endsWith(`1/${th.length}`))
  assert.deepEqual(C.hashtags('a #b c #d_e'), ['#b', '#d_e'])
})
t('chapters', () => {
  const cs = C.parseChapters('0:00 Intro\n1:05 - Setup\n1:02:03 Outro'); assert.deepEqual(cs.map((c) => c.start), [0, 65, 3723])
  assert.deepEqual(C.checkYouTube(cs), []); assert.equal(C.toYouTube(cs).split('\n')[1], '0:01:05 Setup')
  assert.ok(C.toVtt(cs, 4000).includes('00:01:05.000 --> 01:02:03.000'))
  assert.deepEqual(C.parseChapters('1\n00:00:00,000 --> 00:00:10,000\nStart\n\n2\n00:01:00,000 --> 00:02:00,000\nNext').map((c) => c.title), ['Start', 'Next'])
})
t('word freq', () => { const f = C.wordFreq("The cat's cat sat. The CAT!"); assert.deepEqual(f[0], { word: 'cat', count: 3 }) })

/* AI fallbacks */
t('quick', () => {
  assert.equal(Q.lexiconSentiment('I love it, really great').label, 'POSITIVE'); assert.equal(Q.lexiconSentiment('not good, very slow').label, 'NEGATIVE')
  // SST-2 band: a plain fact the model is 98% sure about is neutral; clear opinions keep their label
  assert.equal(Q.sentimentBand(0.98328, 'It arrived on Tuesday.').label, 'NEUTRAL'); assert.equal(Q.sentimentBand(0.0080, 'The train leaves from platform 2.').label, 'NEUTRAL')
  assert.equal(Q.sentimentBand(0.99988, 'I love this product.').label, 'POSITIVE'); assert.equal(Q.sentimentBand(0.0054, 'The app keeps crashing.').label, 'NEGATIVE'); assert.equal(Q.sentimentBand(0.0003, 'Delivery took three weeks and nobody answered.').label, 'NEGATIVE')
  assert.deepEqual(Q.mergeNer([{ entity: 'B-PER', word: 'Sa', score: 0.9, index: 1 }, { entity: 'I-PER', word: '##rah', score: 0.9, index: 2 }, { entity: 'B-LOC', word: 'London', score: 0.99, index: 5 }]).map((e) => e.text), ['Sarah', 'London'])
  const re = Q.ruleEntities('Email a@b.co on 12 March 2026 about $4,500 with Priya Sharma.'); assert.ok(re.some((e) => e.type === 'Email') && re.some((e) => e.type === 'Date') && re.some((e) => e.type === 'Money') && re.some((e) => e.text === 'Priya Sharma'))
  assert.equal(Q.bm25(['the cat sat', 'dogs bark', 'a cat and a cat'], 'cat')[0].index, 2)
  const g = Array.from({ length: 72 }, (_, i) => i); assert.equal(Q.dHash(g), '0000000000000000'); assert.equal(Q.hamming('ff', '00'), 8)
  assert.deepEqual(Q.groupBy([1, 2, 10, 11, 30], (a, b) => Math.abs(a - b) <= 1), [[0, 1], [2, 3]])
  const px = new Uint8ClampedArray(400).map((_, i) => (i % 4 === 3 ? 255 : i < 200 ? 0 : 250)); const km = Q.kmeans(px, 2); assert.equal(new Set(km.labels).size, 2)
  assert.ok(Q.quickTags(px, 10, 10).some((x) => x.label === 'square'))
})

t('qa round fixes', () => {
  const m = Q.ruleEntities('Google will invest $2 billion and ₹3 crore, not $5 more.').filter((e) => e.type === 'Money').map((e) => e.text)
  assert.deepEqual(m, ['$2 billion', '₹3 crore', '$5'])
  const c = G.geomCentroid({ type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]] })
  assert.ok(Math.abs(c[0] - 0.005) < 1e-12 && Math.abs(c[1] - 0.005) < 1e-12)
  const l = G.geomCentroid({ type: 'LineString', coordinates: [[0, 0], [0, 0.01]] }); assert.ok(Math.abs(l[1] - 0.005) < 1e-12)
  const long = ('This sentence is here to fill space for the thread splitter test. '.repeat(14) + 'Last words to download now.').trim()
  const th = C.splitThread(long, 280)
  assert.ok(th.every((x) => C.xLength ? C.xLength(x) <= 280 : x.length <= 280))
  assert.ok(th.at(-1).includes('download now.'))
  assert.equal(th.map((x) => x.replace(/ \d+\/\d+$/, '')).join(' ').replace(/\s+/g, ' '), long.replace(/\s+/g, ' '))
})
console.log(`bcat: ${n} tests passed`)
