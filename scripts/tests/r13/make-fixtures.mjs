// Writes the sample files used by the Money & Finance and Health & Fitness tests and the live browser checks.
// Run: node scripts/tests/r13/make-fixtures.mjs
import { writeFileSync } from 'node:fs'
const fx = (n) => new URL('./fixtures/' + n, import.meta.url)

/* A small FIT activity: file_id, 120 records (1 s apart, a 600 m loop with heart rate), one lap, one session. */
export function makeFit() {
  const out = []
  const u8 = (v) => out.push(v & 0xff)
  const u16 = (v) => { u8(v); u8(v >> 8) }
  const u32 = (v) => { u16(v & 0xffff); u16(v >>> 16) }
  const i32 = (v) => u32(v >>> 0)
  const def = (local, global, fields) => { u8(0x40 | local); u8(0); u8(0); u16(global); u8(fields.length); for (const [n, s, t] of fields) { u8(n); u8(s); u8(t) } }
  const T0 = 1130000000 // FIT seconds (2025-10-22)
  def(0, 0, [[0, 1, 0x00], [1, 2, 0x84], [2, 2, 0x84], [4, 4, 0x86]])
  u8(0); u8(4); u16(1); u16(3122); u32(T0)
  def(1, 20, [[253, 4, 0x86], [0, 4, 0x85], [1, 4, 0x85], [2, 2, 0x84], [3, 1, 0x02], [4, 1, 0x02], [5, 4, 0x86], [6, 2, 0x84]])
  const semi = 2 ** 31 / 180
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * 2 * Math.PI
    const lat = 51.5 + 0.0009 * Math.sin(a), lon = -0.12 + 0.0014 * Math.cos(a)
    const hr = Math.round(110 + 60 * (i / 119))
    u8(1); u32(T0 + i); i32(Math.round(lat * semi)); i32(Math.round(lon * semi)); u16(Math.round((20 + 3 * Math.sin(a) + 500) * 5)); u8(hr); u8(85); u32(i * 500); u16(5000)
  }
  def(2, 19, [[253, 4, 0x86], [2, 4, 0x86], [7, 4, 0x86], [9, 4, 0x86], [15, 1, 0x02], [16, 1, 0x02]])
  u8(2); u32(T0 + 119); u32(T0); u32(119000); u32(59500); u8(140); u8(170)
  def(3, 18, [[253, 4, 0x86], [2, 4, 0x86], [5, 1, 0x00], [7, 4, 0x86], [8, 4, 0x86], [9, 4, 0x86], [11, 2, 0x84], [16, 1, 0x02], [17, 1, 0x02], [22, 2, 0x84]])
  u8(3); u32(T0 + 119); u32(T0); u8(1); u32(119000); u32(119000); u32(59500); u16(42); u8(140); u8(170); u16(6)
  const data = Uint8Array.from(out)
  const head = new Uint8Array(14)
  head[0] = 14; head[1] = 0x20; head[2] = 0x08; head[3] = 0x08
  new DataView(head.buffer).setUint32(4, data.length, true)
  head.set([0x2e, 0x46, 0x49, 0x54], 8)
  const all = new Uint8Array(14 + data.length + 2); all.set(head); all.set(data, 14)
  return all
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  writeFileSync(fx('morning-run.fit'), makeFit())
  writeFileSync(fx('statement.ofx'), `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>INR<BANKACCTFROM><BANKID>1234<ACCTID>99887766<ACCTTYPE>SAVINGS</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260901<TRNAMT>52000.00<FITID>1<NAME>SALARY ACME LTD</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260903<TRNAMT>-649.00<FITID>2<NAME>NETFLIX.COM<MEMO>Monthly plan</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260905<TRNAMT>-1830.50<FITID>3<NAME>BIGBASKET ORDER</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003<TRNAMT>-649.00<FITID>4<NAME>NETFLIX.COM</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261103<TRNAMT>-649.00<FITID>5<NAME>NETFLIX.COM</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261010<TRNAMT>-340.00<FITID>6<NAME>UBER TRIP &amp; CO</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
`)
  writeFileSync(fx('statement.qif'), `!Type:Bank
D10/01/2026
T-45.20
PTesco Superstore
MWeekly shop
^
D10/02/2026
T2,500.00
PPayroll
^
`)
  writeFileSync(fx('camt053.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt><Acct><Id><IBAN>DE89370400440532013000</IBAN></Id><Ccy>EUR</Ccy></Acct>
<Ntry><Amt Ccy="EUR">120.50</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-10-01</Dt></BookgDt><NtryDtls><TxDtls><RltdPties><Cdtr><Nm>Stadtwerke Berlin</Nm></Cdtr></RltdPties><RmtInf><Ustrd>Strom Oktober</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">3000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-10-02</Dt></BookgDt><NtryDtls><TxDtls><RltdPties><Dbtr><Nm>Example GmbH</Nm></Dbtr></RltdPties><RmtInf><Ustrd>Gehalt</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
</Stmt></BkToCstmrStmt></Document>
`)
  writeFileSync(fx('mt940.sta'), `:20:STATEMENT
:25:NL91ABNA0417164300
:28C:00001/001
:60F:C261001EUR1000,00
:61:2610021002D25,50NTRFNONREF//X1
:86:Albert Heijn 1234 Amsterdam
:61:2610031003C150,00NTRFNONREF
:86:Refund from
 Bol.com order 77
:62F:C261003EUR1124,50
-
`)
  writeFileSync(fx('bank.csv'), `Date,Description,Debit,Credit,Balance
01/10/2026,SALARY ACME LTD,,52000.00,60000.00
03/10/2026,NETFLIX.COM,649.00,,59351.00
05/10/2026,SWIGGY ORDER 8821,412.00,,58939.00
13/10/2026,ATM CASH WDL,2000.00,,56939.00
25/10/2026,AIRTEL RECHARGE,299.00,,56640.00
`)
  writeFileSync(fx('receipt.txt'), `FRESH MART
12 Park Street
Date: 14/10/2026
Milk 1L        62.00
Bread           45.00
Eggs x12       96.00
Subtotal       203.00
GST 5%          10.15
TOTAL          213.15
CARD           213.15
`)
  writeFileSync(fx('export.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_IN">
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Phone" unit="count" creationDate="2026-10-01 09:00:00 +0530" startDate="2026-10-01 08:00:00 +0530" endDate="2026-10-01 08:30:00 +0530" value="1200"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Phone" unit="count" creationDate="2026-10-02 09:00:00 +0530" startDate="2026-10-02 08:00:00 +0530" endDate="2026-10-02 08:30:00 +0530" value="3400"/>
 <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min" creationDate="2026-10-01 09:00:00 +0530" startDate="2026-10-01 09:00:00 +0530" endDate="2026-10-01 09:00:00 +0530" value="72">
  <MetadataEntry key="HKMetadataKeyHeartRateMotionContext" value="0"/>
 </Record>
 <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Scale" unit="kg" creationDate="2026-10-01 07:00:00 +0530" startDate="2026-10-01 07:00:00 +0530" endDate="2026-10-01 07:00:00 +0530" value="68.4"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="31.5" durationUnit="min" sourceName="Watch" startDate="2026-10-03 06:30:00 +0530" endDate="2026-10-03 07:01:30 +0530"/>
</HealthData>
`)
  console.log('fixtures written')
}
