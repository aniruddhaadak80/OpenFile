// Unit tests for the Money & Finance and Health & Fitness tools and the AI fallbacks added on 2026-10-29.
// Run: node --experimental-strip-types --no-warnings scripts/tests/r13/r13.test.mjs   (fixtures: node scripts/tests/r13/make-fixtures.mjs)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as F from '../../../src/lib/r13/finance.ts'
import * as H from '../../../src/lib/r13/health.ts'
import * as X from '../../../src/lib/r13/extractive.ts'
import * as C from '../../../src/lib/r13/caption.ts'

const fx = (n) => readFileSync(new URL('./fixtures/' + n, import.meta.url))
const txt = (n) => fx(n).toString('utf8')
let n = 0
const t = (name, fn) => { try { fn(); n++ } catch (e) { console.error('FAIL', name); throw e } }

t('money', () => { assert.equal(F.parseMoney('1,234.56'), 1234.56); assert.equal(F.parseMoney('1.234,56'), 1234.56); assert.equal(F.parseMoney('(45.00)'), -45); assert.equal(F.parseMoney('₹ 3,400'), 3400); assert.equal(F.parseMoney('45.00 DR'), -45); assert.equal(F.parseMoney('1,234'), 1234) })
t('dates', () => { assert.equal(F.parseDate('03/04/2026'), '2026-04-03'); assert.equal(F.parseDate('03/04/2026', false), '2026-03-04'); assert.equal(F.parseDate('13/01/26'), '2026-01-13'); assert.equal(F.parseDate('5 Oct 2026'), '2026-10-05'); assert.equal(F.parseDate('Oct 5, 2026'), '2026-10-05'); assert.equal(F.parseDate('20261005'), '2026-10-05') })
t('ofx', () => { const s = F.parseOfx(txt('statement.ofx')); assert.equal(s.txns.length, 6); assert.equal(s.currency, 'INR'); assert.equal(s.account, '99887766'); assert.equal(s.txns[1].amount, -649); assert.equal(s.txns[5].description, 'UBER TRIP & CO'); assert.equal(F.detectFormat('a.ofx', txt('statement.ofx')), 'ofx') })
t('qif', () => { const s = F.parseQif(txt('statement.qif')); assert.equal(s.txns.length, 2); assert.equal(s.txns[0].date, '2026-10-01'); assert.equal(s.txns[1].amount, 2500) })
t('camt', () => { const s = F.parseCamt(txt('camt053.xml')); assert.equal(s.txns.length, 2); assert.equal(s.txns[0].amount, -120.5); assert.equal(s.txns[0].payee, 'Stadtwerke Berlin'); assert.equal(s.account, 'DE89370400440532013000'); assert.equal(F.detectFormat('x.xml', txt('camt053.xml')), 'camt') })
t('mt940', () => { const s = F.parseMt940(txt('mt940.sta')); assert.equal(s.txns.length, 2); assert.equal(s.txns[0].amount, -25.5); assert.equal(s.txns[1].amount, 150); assert.match(s.txns[1].description, /Bol\.com order 77/); assert.equal(F.detectFormat('a.sta', txt('mt940.sta')), 'mt940') })
t('csv map', () => {
  const rows = txt('bank.csv').trim().split('\n').map((l) => l.split(','))
  const m = F.guessCsvMap(rows[0], rows.slice(1)); assert.equal(m.debit, 2); assert.equal(m.credit, 3); assert.equal(m.balance, 4)
  const tx = F.csvToTxns(rows.slice(1), m); assert.equal(tx.length, 5); assert.equal(tx[0].amount, 52000); assert.equal(tx[1].amount, -649); assert.equal(tx[3].date, '2026-10-13')
})
t('ofx round trip', () => { const s = F.parseOfx(txt('statement.ofx')); const back = F.parseOfx(F.toOfx(s.txns, { currency: 'INR' })); assert.equal(back.txns.length, 6); assert.equal(back.txns.reduce((a, x) => a + x.amount, 0).toFixed(2), s.txns.reduce((a, x) => a + x.amount, 0).toFixed(2)) })
t('qif round trip', () => { const s = F.parseOfx(txt('statement.ofx')); const back = F.parseQif(F.toQif(s.txns)); assert.equal(back.txns.length, 6); assert.equal(back.txns[2].amount, -1830.5) })
t('summary + recurring', () => { const s = F.summarizeTxns(F.parseOfx(txt('statement.ofx')).txns); assert.equal(s.in, 52000); assert.equal(s.months.length, 3); assert.equal(s.recurring[0]?.name, 'NETFLIX.COM'); assert.equal(s.recurring[0].every, 'monthly') })
t('rules', () => { assert.equal(F.ruleCategory('SWIGGY ORDER 8821', -412), 'Eating out'); assert.equal(F.ruleCategory('NETFLIX.COM', -649), 'Subscriptions'); assert.equal(F.ruleCategory('random thing', 10), 'Income'); assert.equal(F.ruleCategory('ATM CASH WDL', -2000), 'Cash') })
t('emi', () => { assert.equal(Math.round(F.emi(1000000, 8.5, 240)), 8678); const a = F.amortize(100000, 12, 12); assert.equal(a.months, 12); assert.ok(a.rows.at(-1).balance < 0.01); assert.equal(Math.round(a.totalInterest), 6619); const b = F.amortize(100000, 12, 12, 5000); assert.ok(b.months < 12) })
t('emi zero rate', () => { assert.equal(F.emi(1200, 0, 12), 100) })
t('growth', () => { const r = F.growth({ start: 0, monthly: 1000, ratePct: 12, years: 10 }); assert.equal(r.length, 10); assert.ok(Math.abs(r[9].value - 230039) < 1500, String(r[9].value)); assert.ok(Math.abs(F.cagr(100, 200, 5) - 14.87) < 0.01) })
t('tax', () => { const a = F.tax(100, 18, 'add'); assert.equal(a.gross, 118); const r = F.tax(118, 18, 'remove'); assert.ok(Math.abs(r.net - 100) < 1e-9) })
t('settle', () => { const b = F.balances(['A', 'B', 'C'], [{ payer: 'A', amount: 90, for: [] }, { payer: 'B', amount: 30, for: ['B', 'C'] }]); const s = F.settle(b); assert.equal(s.length, 2); assert.equal(s.reduce((x, y) => x + y.amount, 0), 60) })
t('receipt', () => { const r = F.parseReceipt(txt('receipt.txt')); assert.equal(r.total, 213.15); assert.equal(r.tax, 10.15); assert.equal(r.subtotal, 203); assert.equal(r.date, '2026-10-14'); assert.equal(r.merchant, 'FRESH MART'); assert.equal(r.items.length, 3); assert.equal(r.items[2].name, 'Eggs x12') })
t('receipt ocr, real photos', () => {
  // Tesseract block mode (psm 6) text from two Wikimedia Commons receipt photos (Vienna HOFER, Italian supermarket).
  const v = F.parseReceipt(txt('receipt-ocr-vienna.txt')); assert.equal(v.merchant, 'HOFER KG'); assert.equal(v.date, '2024-03-25'); assert.equal(v.total, 22.41); assert.equal(v.tax, 2.04); assert.equal(v.currency, 'EUR')
  const it = F.parseReceipt(txt('receipt-ocr-italy.txt')); assert.equal(it.total, 11.89); assert.equal(it.merchant, ''); assert.ok(it.items.length >= 4); assert.equal(it.items[0].name, 'ACQUA S.ANGELO NATUR'); assert.equal(it.items[0].amount, 1.32)
  assert.ok(it.items.every((x) => !/%/.test(x.name)))
})
t('receipt ocr noise', () => {
  // Live tesseract.js output lost the MwSt amount and read the shop as junk: no tax from the net amount, no junk shop.
  const r = F.parseReceipt('o | BNO\nDOCUMENTO COMMERCIALE\nA 10,0% Netto 20,37 MwSt\nACQUA 1,32\nTOTALE COMPLESSIVO 11,85\n')
  assert.equal(r.tax, null); assert.equal(r.merchant, ''); assert.equal(r.total, 11.85)
})
t('receipt parser stays linear on hostile text', () => {
  const t0 = Date.now(); F.parseReceipt('\t' + '00,0\t'.repeat(20000)); F.parseReceipt('A' + ' 1,23 .'.repeat(20000) + '%'); F.parseReceipt('SHOP KG' + ' -'.repeat(20000) + 'x')
  assert.ok(Date.now() - t0 < 1500, 'took ' + (Date.now() - t0) + ' ms')
})
t('recurring across calendar months', () => {
  const tx = [['2026-07-02', -1250, 'RENT'], ['2026-08-27', -1250, 'RENT'], ['2026-09-05', -1250, 'RENT'], ['2026-07-10', -40, 'SHOP'], ['2026-07-20', -55, 'SHOP'], ['2026-08-01', -12, 'SHOP']].map(([date, amount, description]) => ({ date, amount, description }))
  const r = F.findRecurring(tx); assert.equal(r.length, 1); assert.equal(r[0].name, 'RENT'); assert.equal(r[0].every, 'monthly')
})
t('pdf rows', () => {
  const it = (str, x, y) => ({ str, x, y })
  const rows = F.pdfStatementRows([it('Date', 10, 700), it('Details', 80, 700), it('01/10/2026', 10, 680), it('Opening', 80, 680), it('1,000.00', 400, 680), it('1,000.00', 480, 680), it('02/10/2026', 10, 660), it('Coffee shop', 80, 660), it('120.00', 400, 660), it('880.00', 480, 660), it('03/10/2026', 10, 640), it('Refund', 80, 640), it('20.00', 400, 640), it('900.00', 480, 640)])
  assert.equal(rows.length, 3); assert.equal(rows[1].amount, -120); assert.equal(rows[2].amount, 20); assert.equal(rows[1].description, 'Coffee shop')
})

/* health */
t('fit decode', () => {
  const a = H.decodeFit(new Uint8Array(fx('morning-run.fit')))
  assert.equal(a.points.length, 120); assert.equal(a.laps.length, 1); assert.equal(a.sessions[0].sport, 'running'); assert.equal(a.sessions[0].distance, 595); assert.equal(a.device, 'Garmin product 3122')
  assert.ok(Math.abs(a.points[0].lat - 51.5) < 1e-6); assert.ok(Math.abs(a.points[30].lon - (-0.12)) < 1e-5); assert.equal(a.points[0].hr, 110); assert.equal(a.points[119].hr, 170); assert.ok(Math.abs(a.points[0].ele - 20) < 0.3); assert.equal(a.points[10].speed, 5)
  const s = H.activityStats(a); assert.equal(s.maxHr, 170); assert.equal(s.hasGps, true); assert.equal(s.duration, 119)
})
t('fit reject', () => { assert.throws(() => H.decodeFit(new Uint8Array(20)), /not a FIT/) })
t('fit csv gpx', () => { const a = H.decodeFit(new Uint8Array(fx('morning-run.fit'))); const rows = H.toCsvRows(a.points); assert.equal(rows.length, 121); assert.ok(rows[0].includes('heart_rate')); const g = H.toGpx(a.points); const back = H.parseGpxHr(g); assert.equal(back.points.length, 120); assert.equal(back.points[5].hr, a.points[5].hr) })
t('zones', () => { const a = H.decodeFit(new Uint8Array(fx('morning-run.fit'))); const z = H.zoneTimes(a.points, 190); const tot = z.secs.reduce((x, y) => x + y, 0) + z.below; assert.equal(Math.round(tot), 119); assert.ok(z.secs[3] > 0); assert.ok(H.trimp(a.points, 190, 60) > 1); assert.equal(H.maxHrTanaka(30), 187) })
t('tcx', () => { const x = `<TrainingCenterDatabase><Activities><Activity Sport="Biking"><Lap StartTime="2026-10-01T06:00:00Z"><TotalTimeSeconds>60</TotalTimeSeconds><Track><Trackpoint><Time>2026-10-01T06:00:00Z</Time><HeartRateBpm><Value>120</Value></HeartRateBpm></Trackpoint><Trackpoint><Time>2026-10-01T06:00:10Z</Time><HeartRateBpm><Value>130</Value></HeartRateBpm><Cadence>80</Cadence></Trackpoint></Track></Lap></Activity></Activities></TrainingCenterDatabase>`; const a = H.parseTcx(x); assert.equal(a.points.length, 2); assert.equal(a.points[1].hr, 130); assert.equal(a.points[1].cad, 80); assert.equal(a.sessions[0].sport, 'biking') })
t('health chunk', () => {
  const s = txt('export.xml'); const half = Math.floor(s.length / 2)
  const a = H.parseHealthChunk(s.slice(0, half)); const b = H.parseHealthChunk(a.rest + s.slice(half))
  const all = [...a.records, ...b.records]; assert.equal(all.length, 5); assert.equal(all.filter((r) => r.type.endsWith('StepCount')).length, 2); assert.equal(all.at(-1).type, 'Workout:Running'); assert.equal(H.healthName('HKQuantityTypeIdentifierBodyMass'), 'Body Mass')
})
t('pace', () => { assert.equal(H.parseDuration('1:02:03'), 3723); assert.equal(H.fmtDuration(3723), '1:02:03'); assert.equal(Math.round(H.riegel(1500, 5, 10)), 3127) })
t('body', () => { assert.equal(H.bmi(70, 175).toFixed(1), '22.9'); assert.equal(H.bmiClass(22.9), 'Healthy weight'); assert.equal(Math.round(H.bmr(70, 175, 30, 'm')), 1649); assert.ok(Math.abs(H.navyBodyFat('m', 178, 38, 86) - 17.3) < 0.3); assert.ok(Math.abs(H.idealWeight(175, 'm') - 70.5) < 0.5) })

/* fallbacks */
t('sentences', () => { assert.deepEqual(X.sentences('Dr. Smith came. It was 3.5 km away, e.g. far. Then he left.'), ['Dr. Smith came.', 'It was 3.5 km away, e.g. far.', 'Then he left.']) })
t('extractive', () => { const text = 'OpenFile runs tools in the browser. Files never leave the device. The weather was nice. Tools in the browser keep files private on the device. Cats sleep a lot.'; const s = X.summarize(text, 2); assert.equal(s.length, 2); assert.ok(s.some((x) => /browser/.test(x.text))); assert.ok(X.keywords(text, 3).includes('browser')) })
t('bm25 answer', () => { const ps = [{ page: 1, text: 'The invoice total is 450 dollars. Payment is due on 5 November.' }, { page: 2, text: 'Our office moved to Pune in 2024. The team has nine people.' }]; assert.equal(X.bm25(ps, 'when is payment due')[0].p.page, 1); const a = X.answer(ps, 'how many people are in the team'); assert.equal(a[0].page, 2); assert.match(a[0].text, /nine/) })
t('caption', () => { assert.equal(C.captionFromObjects(['person', 'person', 'dog']), 'A photo of two people and a dog.'); assert.equal(C.captionFromObjects([], { light: 'dark', color: '', wide: 'portrait' }), 'A dark tall photo with no everyday objects found.'); const tone = C.toneFromPixels(new Uint8ClampedArray([40, 90, 210, 255, 50, 100, 200, 255]), 400, 200); assert.equal(tone.color, 'mostly blue'); assert.equal(tone.wide, 'landscape') })

console.log(`r13: ${n} tests passed`)
