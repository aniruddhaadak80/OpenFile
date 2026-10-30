// Unit tests for the categories-fill round (privacy, geo, office, science, creator, study, web, time).
// Run: node scripts/tests/cf/cf.test.mjs
import assert from 'node:assert/strict'
import * as S from '../../../src/lib/cf/sci.ts'
import * as W from '../../../src/lib/cf/web.ts'
import * as T from '../../../src/lib/cf/time.ts'
import * as Q from '../../../src/lib/cf/study.ts'
import * as H from '../../../src/lib/cf/sheet.ts'
import * as G from '../../../src/lib/cf/geo.ts'
import * as P from '../../../src/lib/cf/priv.ts'
import * as C from '../../../src/lib/cf/creator.ts'
import * as K from '../../../src/lib/catgrid.ts'

let n = 0
const t = (name, fn) => { try { fn(); n++ } catch (e) { console.error('FAIL', name); throw e } }
const ta = async (name, fn) => { try { await fn(); n++ } catch (e) { console.error('FAIL', name); throw e } }
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`)

/* science */
t('sig figs count', () => {
  assert.equal(S.countSig('0.00450').sig, 3); assert.equal(S.countSig('1200').sig, 2); assert.ok(S.countSig('1200').ambiguous)
  assert.equal(S.countSig('1200.').sig, 4); assert.equal(S.countSig('6.02 x 10^23').sig, 3); assert.equal(S.countSig('100.0').sig, 4); assert.equal(S.countSig('0.0').sig, 1)
})
t('sig round and ops', () => {
  assert.equal(S.roundSig(0.0045678, 2), '0.0046'); assert.equal(S.roundSig(123456, 3), '123000'); assert.equal(S.roundSig(2, 3), '2.00')
  assert.equal(S.sigOp('12.11', '+', '18.0').text, '30.1'); assert.equal(S.sigOp('2.5', '*', '3.42').text, '8.6'); assert.equal(S.sigOp('4.56', '/', '1.4').text, '3.3')
})
t('sci notation', () => { const f = S.sciForms(0.000123456, 3); assert.equal(f.sci, '1.23 × 10⁻⁴'); assert.equal(f.eng, '123 × 10⁻⁶'); assert.equal(S.sciForms(9.996e5, 3).exponent, 6); near(S.parseNumberLoose('4.56 x 10^7'), 4.56e7) })
t('formulas', () => {
  const f = S.FORMULAS.find((x) => x.id === 'ohm'); assert.deepEqual(S.solveFormula(f, { V: null, I: 2, R: 5 }), { key: 'V', value: 10 })
  const s = S.FORMULAS.find((x) => x.id === 'suvat2'); near(S.solveFormula(s, { s: 20, u: 0, a: 10, t: null }).value, 2)
  assert.throws(() => S.solveFormula(f, { V: null, I: null, R: 5 }))
  near(S.solveFormula(S.FORMULAS.find((x) => x.id === 'gas'), { P: null, V: 0.0224, n: 1, T: 273.15 }).value, 101388, 50)
})
t('pH', () => { near(S.phStrong(0.01, false).pH, 2, 1e-4); near(S.phStrong(0.01, true).pH, 12, 1e-4); near(S.phWeak(0.1, 1.8e-5, false).pH, 2.875, 0.003); near(S.phBuffer(4.76, 0.1, 0.1).pH, 4.76); near(S.phStrong(1e-8, false).pH, 6.98, 0.01) })
t('solutions', () => { near(S.molarity({ M: null, g: 5.844, L: 1, mm: 58.44 }).M, 0.1); near(S.dilution({ c1: 2, v1: null, c2: 0.5, v2: 100 }).value, 25) })
t('half-life', () => { near(S.halfLife({ N0: 100, N: null, t: 10, T: 5 }).value, 25); near(S.halfLife({ N0: 100, N: 25, t: 10, T: null }).value, 5); near(S.halfLife({ N0: 100, N: 12.5, t: null, T: 5730 }).value, 17190, 1) })
t('fits', () => { const l = S.fit([1, 2, 3, 4], [3, 5, 7, 9], 'linear'); near(l.coef[1], 2); near(l.r2, 1); const e = S.fit([0, 1, 2, 3], [1, Math.E, Math.E ** 2, Math.E ** 3], 'exponential'); near(e.coef[1], 1, 1e-9); const q = S.fit([0, 1, 2, 3], [1, 2, 5, 10], 'quadratic'); near(q.coef[2], 1) })

/* web */
t('robots', () => {
  const txt = W.buildRobots([{ agents: ['*'], allow: ['/public/'], disallow: ['/admin/', '/*.pdf$'] }, { agents: ['GPTBot'], allow: [], disallow: ['/'] }], ['https://x.com/sitemap.xml'])
  assert.ok(txt.includes('Sitemap: https://x.com/sitemap.xml'))
  assert.equal(W.robotsAllowed(txt, 'Googlebot', '/admin/x').allowed, false); assert.equal(W.robotsAllowed(txt, 'Googlebot', '/blog').allowed, true)
  assert.equal(W.robotsAllowed(txt, 'Googlebot', '/a/file.pdf').allowed, false); assert.equal(W.robotsAllowed(txt, 'GPTBot/1.0', '/blog').allowed, false)
})
t('sitemap', () => {
  const xml = W.buildSitemap([{ loc: 'https://x.com/a?b=1&c=2', lastmod: '2026-10-01', priority: 0.8 }, { loc: 'https://x.com/b' }])
  assert.ok(xml.includes('&amp;')); const p = W.parseSitemap(xml); assert.equal(p.urls.length, 2); assert.equal(p.urls[0].loc, 'https://x.com/a?b=1&c=2'); assert.equal(p.problems.length, 0)
  assert.deepEqual(W.extractLinks('<a href="/x">x</a><a href=\'https://o.com/y#z\'>y</a><a href="mailto:a@b">m</a>', 'https://s.com/p/'), ['https://s.com/x', 'https://o.com/y'])
})
t('redirects', () => {
  const l = W.parseRedirectList('from,to\n/old,/new\nhttps://x.com/a?id=2 https://x.com/b 302\n/new,/newer')
  assert.equal(l.length, 3); assert.ok(W.buildRedirects(l, 'apache').includes('RewriteRule ^old$ /new [R=301,L]')); assert.ok(W.buildRedirects(l, 'nginx').includes('location = /old { return 301 /new; }'))
  assert.equal(JSON.parse(W.buildRedirects(l, 'vercel')).redirects.length, 3); assert.deepEqual(W.redirectChains(l).chains[0], ['/old', '/new', '/newer'])
})
t('hreflang/headers/utm', () => {
  assert.ok(W.validLang('en-GB') && W.validLang('x-default') && !W.validLang('english'))
  const h = W.headerList({ csp: { 'default-src': ["'self'"] }, hsts: 31536000, hstsSub: true, preload: false, frame: 'DENY', referrer: 'strict-origin-when-cross-origin', permissions: { camera: '()' }, nosniff: true, coop: '', corp: '' })
  assert.equal(W.gradeHeaders(h).grade, 'A'); assert.ok(W.headersFor(h, 'nginx').includes('add_header X-Frame-Options "DENY" always;'))
  assert.equal(W.utmUrl('example.com/p?x=1', { source: 'News Letter', medium: 'email', campaign: 'Oct' }), 'https://example.com/p?x=1&utm_source=news_letter&utm_medium=email&utm_campaign=oct')
})
t('schema/llms/audit', () => {
  const a = W.buildSchema('FAQPage', { faq: 'Q: Is it free?\nA: Yes.\nQ: Offline?\nA: Yes' }); assert.equal(a.mainEntity.length, 2)
  const p = W.buildSchema('Product', { name: 'X', price: '9.99', currency: 'USD', images: '' }); assert.equal(p.offers.price, 9.99); assert.equal(p.image, undefined)
  assert.ok(W.schemaScript({ a: '</script>' }).includes('\\u003c/script>'))
  const l = W.buildLlms({ name: 'Site', summary: 'Hi', sections: [{ title: 'Docs', links: W.linksFromLines('https://x.com/getting-started\nAPI | https://x.com/api | reference') }] })
  assert.ok(l.includes('- [Getting started](https://x.com/getting-started)')); assert.ok(l.includes('- [API](https://x.com/api): reference'))
  const au = W.auditHtml('<html lang="en"><head><title>A good page title for testing</title><meta name="viewport" content="width=device-width"></head><body><h1>Hi</h1><h3>x</h3><img src=a></body></html>', 'page')
  assert.ok(au.items.find((i) => i.id === 'desc').level === 'fail' && au.items.find((i) => i.id === 'order').level === 'warn' && au.missingAlt === 1)
  assert.ok(W.truncatePx('a'.repeat(200), 580, 20).cut); assert.ok(W.fitDescription(['One short sentence here.', 'x'.repeat(200)]).length < 155)
})

/* time */
t('ics', () => {
  const ics = T.buildIcs([{ summary: 'Team, sync; call', start: new Date(Date.UTC(2026, 9, 29, 9)), end: new Date(Date.UTC(2026, 9, 29, 10)), alarmMin: 10 }, { summary: 'Holiday', start: new Date(2026, 11, 25), allDay: true }], { name: 'Test', now: new Date(0) })
  assert.ok(ics.includes('SUMMARY:Team\\, sync\\; call') && ics.includes('DTSTART:20261029T090000Z') && ics.includes('DTSTART;VALUE=DATE:20261225') && ics.includes('DTEND;VALUE=DATE:20261226') && ics.includes('TRIGGER:-PT10M'))
  assert.ok(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75))
  const m = T.mergeIcs([{ name: 'a.ics', text: ics }, { name: 'b.ics', text: ics }], { dedupe: 'title-time' }); assert.equal(m.count, 2); assert.equal(m.dupes, 2)
})
t('rrule', () => {
  const r = T.parseRrule('FREQ=MONTHLY;BYDAY=-1FR;COUNT=3'); const d = T.expandRrule(r, new Date(2026, 0, 1))
  assert.deepEqual(d.map(T.ymd), ['2026-01-30', '2026-02-27', '2026-03-27'])
  assert.deepEqual(T.expandRrule(T.parseRrule('FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4'), new Date(2026, 9, 26)).map(T.ymd), ['2026-10-26', '2026-10-28', '2026-11-02', '2026-11-04'])
  assert.equal(T.rruleString({ freq: 'WEEKLY', interval: 2, byday: ['TU'], until: '2026-12-31' }), 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;UNTIL=20261231T235959Z')
  assert.equal(T.describeRule(r), 'Every month on last Friday, 3 times')
  assert.deepEqual(T.expandRrule(T.parseRrule('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=2'), new Date(2026, 9, 1)).map(T.ymd), ['2026-10-30', '2026-11-30'])
})
t('days/age/week/sun', () => {
  const w = T.workingDays(new Date(2026, 9, 26), new Date(2026, 10, 2), { holidays: ['2026-10-28'] }); assert.equal(w.total, 7); assert.equal(w.work, 4)
  assert.equal(T.ymd(T.addWorkingDays(new Date(2026, 9, 30), 1)), '2026-11-02')
  const a = T.ageBetween(new Date(2003, 1, 10), new Date(2026, 9, 29)); assert.deepEqual([a.years, a.months, a.days], [23, 8, 19])
  assert.deepEqual(T.isoWeek(new Date(2026, 0, 1)), { year: 2026, week: 1 }); assert.deepEqual(T.isoWeek(new Date(2027, 0, 1)), { year: 2026, week: 53 }); assert.equal(T.ymd(T.isoWeekStart(2026, 1)), '2025-12-29')
  const s = T.sunTimes(new Date(2026, 5, 21), 51.4779, 0); const h = s.rise.getUTCHours() + s.rise.getUTCMinutes() / 60; assert.ok(h > 3.6 && h < 3.9, String(h))
  assert.equal(T.sunTimes(new Date(2026, 5, 21), 78, 15).polar, 'day')
})
t('monthGrid year clamp', () => {
  assert.equal(T.clampYear(999999), 9999); assert.equal(T.clampYear(-5), 1); assert.equal(T.clampYear(2027.6), 2027)
  const g = T.monthGrid(999999, 1); assert.ok(g.length % 7 === 0 && g.filter(Boolean).length >= 28)
  assert.equal(T.ymd(T.dateOf(50, 0, 1)), '0050-01-01'); assert.equal(T.ymd(T.parseYmd('0050-03-04')), '0050-03-04')
  assert.equal(T.monthGrid(2026, 1, 1).filter(Boolean).length, 28)
})
t('timesheet/rota/meeting', () => {
  assert.equal(T.parseClock('5:15 pm'), 17 * 60 + 15); assert.equal(T.parseClock('0930'), 570); assert.equal(T.parseClock('12am'), 0)
  const tt = T.timesheetTotals([{ start: '9', end: '17:30', breakMin: 30 }, { start: '22:00', end: '06:00', breakMin: 0 }], { dailyOt: 8, rate: 10 })
  assert.equal(tt.total, 960); assert.equal(tt.overtime, 0); assert.equal(tt.pay, 160)
  const r = T.buildRota('D N O'.split(' '), ['A', 'B', 'C'], new Date(2026, 0, 1), 3, 1); assert.deepEqual(r.rows.map((x) => x.codes.join('')), ['DNO', 'NOD', 'ODN']); assert.deepEqual(r.cover[0], { D: 1, N: 1, O: 1 })
  const sl = T.meetingSlots(new Date(2026, 9, 29), [{ tz: 'Asia/Kolkata', from: 9, to: 18 }, { tz: 'Europe/London', from: 9, to: 18 }]); assert.ok(sl.some((x) => x.score === 2))
  assert.equal(T.tzOffsetMin('Asia/Kolkata', new Date()), 330)
})

/* study */
t('cards', () => {
  assert.deepEqual(Q.parseCards('dog - a pet\ncat: also a pet'), [{ front: 'dog', back: 'a pet', tags: undefined }, { front: 'cat', back: 'also a pet', tags: undefined }])
  assert.equal(Q.parseCards('Front,Back\n"a, b",c\nd,e').length, 2); assert.equal(Q.parseCards('Q: 2+2?\nA: 4\nQ: Sky?\nA: Blue').length, 2)
  let l = { box: [1, 1], due: [0, 0] }; l = Q.leitnerAnswer(l, 0, true, 0); assert.equal(l.box[0], 2); assert.equal(Q.leitnerNext(l, 0), 1)
  const s = 'The Treaty of Versailles was signed in 1919 after the First World War ended.'; const c = Q.clozeTarget(s, new Map()); assert.ok(c); assert.ok(Q.makeCloze(s, c).front.includes('_____'))
  assert.deepEqual(Q.rankByEmbedding([[1, 0], [0.9, 0.1], [0, 1]], 2), [1, 0].length === 2 ? Q.rankByEmbedding([[1, 0], [0.9, 0.1], [0, 1]], 2) : [])
})
t('quiz', () => {
  const qs = Q.parseQuiz('1. Capital of France?\na) Berlin\n*b) Paris\n> It is Paris.\n2. Pick primes\n*a) 2\n*b) 3\nc) 4\n3. 2+2?\n= 4 | four\n4. Sky is blue\n*a) True\nb) False')
  assert.equal(qs.length, 4); assert.equal(qs[0].answer[0], 1); assert.equal(qs[1].kind, 'multi'); assert.equal(qs[2].kind, 'text'); assert.equal(qs[3].kind, 'tf')
  assert.ok(Q.gradeAnswer(qs[2], 'Four')); assert.ok(Q.gradeAnswer(qs[1], [1, 0])); assert.ok(!Q.gradeAnswer(qs[0], [0]))
})
t('worksheets and puzzles', () => {
  const p = Q.makeProblems({ ops: ['÷'], min: 1, max: 9, count: 20, seed: 3 }); assert.ok(p.every((x) => Number.isInteger(x.answer)))
  assert.deepEqual(Q.makeProblems({ ops: ['+', '-'], min: 0, max: 20, count: 5, seed: 7 }), Q.makeProblems({ ops: ['+', '-'], min: 0, max: 20, count: 5, seed: 7 }))
  const ws = Q.wordSearch(['apple', 'banana', 'cherry', 'kiwi'], 10, { seed: 1, diagonal: true, backwards: false })
  assert.equal(ws.placed.length, 4); for (const pl of ws.placed) for (let k = 0; k < pl.word.length; k++) assert.equal(ws.grid[pl.r + pl.dr * k][pl.c + pl.dc * k], pl.word[k])
  const cw = Q.crossword([{ word: 'python', clue: 'snake' }, { word: 'typescript', clue: 'typed js' }, { word: 'html', clue: 'markup' }, { word: 'node', clue: 'runtime' }], { seed: 2 })
  assert.ok(cw.entries.length >= 3); for (const e of cw.entries) for (let k = 0; k < e.word.length; k++) assert.equal(cw.grid[e.r + (e.across ? 0 : k)][e.c + (e.across ? k : 0)], e.word[k])
})
t('citations', () => {
  const r = { type: 'article', authors: Q.parseAuthors('Smith, John; Jane Doe'), title: 'A study of things', year: '2020', container: 'Journal of Stuff', volume: '12', issue: '3', pages: '45-67', doi: '10.1000/xyz' }
  assert.equal(Q.plainCite(Q.cite(r, 'apa')), 'Smith, J., & Doe, J. (2020). A study of things. Journal of Stuff, 12(3), 45–67. https://doi.org/10.1000/xyz')
  assert.ok(Q.cite(r, 'mla').startsWith('Smith, John, and Jane Doe. "A study of things."')); assert.equal(Q.inText(r, 'apa'), '(Smith & Doe, 2020)'); assert.ok(Q.cite(r, 'ieee', 2).startsWith('[2] J. Smith and J. Doe'))
  const bib = Q.toBibtex([r]); const back = Q.parseBibtex(bib)[0]; assert.equal(back.title, r.title); assert.equal(back.authors[1].family, 'Doe'); assert.equal(back.pages, '45-67')
  const ris = Q.toRis([r]); assert.equal(Q.parseRis(ris)[0].pages, '45-67'); assert.equal(Q.detectRefFormat(ris), 'ris'); assert.equal(Q.parseCslJson(Q.toCslJson([r]))[0].year, '2020')
  assert.equal(Q.parseBibtex('@book{k, author = {Knuth, Donald E.}, title = {The {Art} of Computer Programming}, year = 1968, publisher="AW"}')[0].title, 'The Art of Computer Programming')
})
t('grades/typing', () => {
  near(Q.gpa([{ credits: 3, points: 4 }, { credits: 4, points: 3 }]).gpa, 24 / 7); near(Q.neededOnFinal(85, 90, 40), 97.5)
  near(Q.weightedGrade([{ name: 'a', weight: 30, score: 80 }, { name: 'b', weight: 30, score: 90 }, { name: 'c', weight: 40, score: null }]).average, 85)
  const ts = Q.typingStats('hello world', 'hello wurld', 60); assert.equal(ts.errors, 1); near(ts.accuracy, 10 / 11)
})

/* sheets */
t('dedupe/sort/clean/split', () => {
  const rows = [['name', 'city'], ['Ann', 'Pune'], ['ann ', 'Pune'], ['Bob', 'Delhi'], ['Ann', 'Goa']]
  assert.equal(H.dedupe(rows, { cols: null, header: true, keep: 'first', trim: true, caseless: true }).removedCount, 1)
  const d2 = H.dedupe(rows, { cols: [0], header: true, keep: 'last' }); assert.deepEqual(d2.rows.slice(1).map((r) => r[1]), ['Pune', 'Delhi', 'Goa'])
  const sf = H.sortFilter([['n', 'v'], ['a', '10'], ['b', '9'], ['c', ''], ['d', '100']], { header: true, filters: [{ col: 1, op: 'not-empty', value: '' }], match: 'all', sort: [{ col: 1, dir: 'desc', as: 'auto' }] })
  assert.deepEqual(sf.map((r) => r[0]), ['n', 'd', 'a', 'b'])
  const cl = H.cleanRows([['h', 'x', 'e'], [' 1,200 ', 'a\u00a0 b', ''], ['', '', ''], ['05/11/2026', '3%', '']], { trim: true, collapse: true, blankRows: true, blankCols: true, nbsp: true, caseMode: 'none', numbers: true, dates: true, header: true, transpose: false, fill: false })
  assert.deepEqual(cl.rows, [['h', 'x'], [1200, 'a b'], ['2026-05-11', 0.03]]); assert.equal(cl.blankRowsRemoved, 1); assert.equal(cl.blankColsRemoved, 1)
  assert.equal(H.splitRows([['h'], ['1'], ['2'], ['3']], { header: true, mode: 'rows', n: 2 }).length, 2); assert.equal(H.splitRows([['h', 'k'], ['1', 'a'], ['2', 'b'], ['3', 'a']], { header: true, mode: 'value', n: 0, col: 1 })[0].rows.length, 3)
  assert.equal(H.toCsvText([['a,b', 'c"d', 1]]), '"a,b","c""d",1\r\n'); assert.deepEqual(H.rowsToJson([['a.b', 'c'], [1, 2]], { header: true, shape: 'objects', nest: true }), [{ a: { b: 1 }, c: 2 }])
  assert.equal(H.sniffDelimiter('a;b;c\n1;2;3'), ';'); assert.equal(H.typeCell('007'), '007'); assert.equal(H.typeCell('7.5'), 7.5)
})

/* geo */
t('geo', () => {
  const a = { lat: 51.5074, lon: -0.1278 }, b = { lat: 48.8566, lon: 2.3522 }
  near(G.dist(a, b) / 1000, 343.5, 1); near(G.bearing(a, b), 148.1, 0.5); assert.equal(G.compass(148), 'SSE')
  const d = G.destination(a, 90, 1000); near(G.dist(a, d), 1000, 0.5)
  assert.deepEqual(G.parseLatLon('48°51\'24"N 2°21\'03"E').lat.toFixed(3), '48.857'); assert.equal(G.parseLatLon('12.5, 200'), null)
  const z = G.circleZone('c', a, 500); assert.ok(G.pointInGeometry(a.lon, a.lat, z.geometry)); assert.ok(!G.pointInGeometry(b.lon, b.lat, z.geometry))
  const pts = [{ lat: 0, lon: 0, time: 0 }, { lat: 0, lon: 0.001, time: 10000 }]; const p = G.positionAt(pts, 5000); near(p.lon, 0.0005)
  near(G.exifToUtc('2026:10:29 14:00:00', 330), Date.UTC(2026, 9, 29, 8, 30))
  assert.equal(G.reverseTrack(pts, true)[0].lon, 0.001); assert.equal(G.reverseTrack(pts, true)[0].time, 0)
  const cmp = G.compareTracks(pts, pts); assert.equal(cmp.max, 0)
  assert.deepEqual(G.guessLatLonCols(['Name', 'Latitude', 'Longitude']), { lat: 1, lon: 2, name: 0, time: -1 })
})

/* privacy */
t('url clean', () => {
  const r = P.cleanUrl('https://www.google.com/url?q=https%3A%2F%2Fshop.com%2Fp%3Fid%3D5%26utm_source%3Dx%26fbclid%3Dabc&sa=D')
  assert.equal(r.output, 'https://shop.com/p?id=5'); assert.deepEqual(r.removed.sort(), ['fbclid', 'utm_source'])
  assert.equal(P.cleanUrl('https://www.amazon.in/Some-Thing/dp/B0ABCDEFGH/ref=sr_1_1?crid=X&keywords=y').output, 'https://www.amazon.in/dp/B0ABCDEFGH')
  assert.equal(P.cleanText('see https://a.com/?utm_medium=x&q=1.').text, 'see https://a.com/?q=1.')
})
t('email headers', () => {
  const raw = 'Received: from mail.evil.test (mail.evil.test [203.0.113.5]) by mx.google.com with ESMTPS id x; Thu, 29 Oct 2026 08:00:10 +0000\nReceived: from [10.0.0.2] by mail.evil.test with SMTP; Thu, 29 Oct 2026 08:00:00 +0000\nAuthentication-Results: mx.google.com;\n spf=fail smtp.mailfrom=evil.test; dkim=none; dmarc=fail header.from=bank.com\nFrom: Bank <alerts@bank.com>\nReply-To: help@evil.test\nSubject: Urgent\n\nbody'
  const r = P.analyzeHeaders(raw); assert.equal(r.hops.length, 2); assert.equal(r.hops[1].delay, 10); assert.equal(r.spf, 'fail'); assert.equal(r.dmarc, 'fail'); assert.equal(r.originIp, '203.0.113.5'); assert.ok(r.warnings.some((w) => w.includes('Replies go')))
})
t('anon', () => { assert.equal(P.maskValue('jane@mail.com'), 'j***@m***.com'); assert.equal(P.maskValue('+91 98765 43210'), '+** ***** *3210'); assert.equal(P.generalize('34'), '30-39'); assert.equal(P.shiftDate('2026-01-31', 2), '2026-02-02'); assert.equal(P.guessColumn('Email', ['a@b.co']).kind, 'email'); assert.equal(P.initialsOf('jane mary doe'), 'J. M. D.') })
await ta('hash + secret note', async () => {
  const h = await P.sha256Hex('x', 's'); assert.equal(h.length, 64); assert.equal(P.fakeFromHash(h, 'name'), P.fakeFromHash(h, 'name'))
  const a = await P.sealNote('hello secret'); assert.equal(await P.openNote(a), 'hello secret'); assert.ok(!P.noteNeedsPassword(a))
  const b = await P.sealNote('pw note', 'hunter2', 1000); assert.ok(P.noteNeedsPassword(b)); assert.equal(await P.openNote(b, 'hunter2', 1000), 'pw note'); await assert.rejects(P.openNote(b, 'nope', 1000))
})

/* creator */
t('creator', () => {
  assert.equal(C.toTag('café life tips'), '#CafeLifeTips'); assert.equal(C.toTag('hello world', 'lower'), '#helloworld')
  assert.ok(C.candidatePhrases('Hiking the alps. Hiking boots and alps trails. Best hiking boots').some((x) => x.phrase === 'hiking boots'))
  assert.equal(C.topicGuess('my morning workout at the gym and running')[0].topic, 'fitness')
  const es = C.parseEntries('@ann: love it @bob @cy\n@bob: nice\n@ann: again @x @y'); assert.equal(C.filterEntries(es, { unique: true }).length, 2); assert.equal(C.filterEntries(es, { unique: false, minMentions: 2 }).length, 2)
  const w = C.drawWinners([1, 2, 3, 4, 5], 3); assert.equal(new Set(w).size, 3)
  const cues = C.parseSubs('1\n00:00:01,000 --> 00:00:03,000\nhello big wide world\n\n2\n00:00:04.000 --> 00:00:05.000\nbye'); assert.equal(cues.length, 2)
  assert.equal(C.chunkCues(cues, 2).length, 3); const ass = C.toAss(cues, { font: 'Arial', size: 80, color: '#FFFFFF', outline: '#000000', outlineW: 4, box: false, boxColor: '#000000', boxAlpha: 0.6, bold: true, upper: true, pos: 'bottom', marginV: 200, words: 2, highlight: '#F5A524', karaoke: false })
  assert.ok(ass.includes('Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,HELLO BIG')); assert.ok(ass.includes('&H0024A5F5'))
})
t('catgrid fills every row', () => {
  for (const n of [1, 2, 5, 9, 10, 16, 26]) for (const c of [2, 3, 4, 5]) {
    let row = 0
    for (let i = 0; i < n; i++) { row += K.spanFor(i, n, c); if (row > c) throw new Error(`overflow n=${n} c=${c}`); if (row === c) row = 0 }
    assert.equal(row, 0, `last row not full n=${n} c=${c}`)
  }
  assert.equal(K.evenCols(10, [5, 4, 3]), 5); assert.equal(K.evenCols(8, [5, 4, 3]), 4); assert.equal(K.catGroups(Array.from({ length: 26 }, (_, i) => i))[1].length, 10)
  assert.equal(K.colsClass({ base: 2, lg: 5 }), 'grid-cols-2 lg:grid-cols-5'); assert.equal(K.spanClass(25, 26, { base: 1, md: 4 }), 'md:col-span-2')
})
console.log(`cf tests: ${n} passed`)
