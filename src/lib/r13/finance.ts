/* Money & Finance logic: bank file parsers (OFX/QFX, QIF, CAMT.053, MT940, CSV), writers (OFX, QIF, CSV),
 * loan schedules, compound growth, GST/VAT maths, group expense settling, receipt text parsing and rule based
 * transaction categories. Pure functions with no DOM, so they run in Node tests too. */

export interface Txn { date: string; amount: number; description: string; payee?: string; memo?: string; ref?: string; balance?: number; type?: string; category?: string; currency?: string }
export interface Statement { format: string; account?: string; currency?: string; txns: Txn[]; warnings: string[] }

const iso = (y: number, m: number, d: number) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const num = (s: string | undefined) => { if (s == null) return NaN; const t = String(s).trim(); return t ? Number(t.replace(/\s/g, '')) : NaN }

/** Parse a money string like "1,234.56", "1.234,56", "(45.00)", "-12", "₹ 3,400", "45.00 CR". */
export function parseMoney(raw: string | number | undefined | null): number {
  if (raw == null) return NaN
  if (typeof raw === 'number') return raw
  let s = String(raw).trim()
  if (!s) return NaN
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  if (/\b(dr|debit)\b\.?$/i.test(s)) { neg = true; s = s.replace(/\b(dr|debit)\b\.?$/i, '') }
  s = s.replace(/\b(cr|credit)\b\.?$/i, '')
  if (/-\s*$/.test(s)) { neg = true; s = s.replace(/-\s*$/, '') }
  s = s.replace(/[^\d.,\-+]/g, '')
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1) } else if (s.startsWith('+')) s = s.slice(1)
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',')
  if (lastComma > lastDot) {
    // comma is the decimal mark when it has 1-2 digits after it (1.234,56), else a thousands mark (1,234)
    const after = s.length - lastComma - 1
    s = after <= 2 ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else s = s.replace(/,/g, '')
  const v = Number(s)
  return isFinite(v) && s !== '' ? (neg ? -v : v) : NaN
}

/** Parse a date in common bank formats into YYYY-MM-DD. dayFirst decides 03/04/2026. */
export function parseDate(raw: string, dayFirst = true): string {
  const s = String(raw ?? '').trim()
  let m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2,4})$/.exec(s)
  if (m) {
    let a = +m[1], b = +m[2]; let y = +m[3]; if (y < 100) y += y < 70 ? 2000 : 1900
    if (a > 12) dayFirst = true; else if (b > 12) dayFirst = false
    return dayFirst ? iso(y, b, a) : iso(y, a, b)
  }
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  m = /^(\d{1,2})[\s\-/]([A-Za-z]{3,9})[\s\-/,]*(\d{2,4})$/.exec(s)
  if (m) { const mo = MON.indexOf(m[2].slice(0, 3).toLowerCase()); let y = +m[3]; if (y < 100) y += 2000; if (mo >= 0) return iso(y, mo + 1, +m[1]) }
  m = /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/.exec(s)
  if (m) { const mo = MON.indexOf(m[1].slice(0, 3).toLowerCase()); if (mo >= 0) return iso(+m[3], mo + 1, +m[2]) }
  return ''
}

/* ---------------- OFX / QFX (SGML 1.x and XML 2.x) ---------------- */
const tag = (block: string, name: string) => { const m = new RegExp(`<${name}>([^<\\r\\n]*)`, 'i').exec(block); return m ? m[1].trim() : undefined }
const decodeEnt = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

export function parseOfx(text: string): Statement {
  const warnings: string[] = []
  const blocks = text.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>|<STMTTRN>/i)[0])
  const ofxDate = (s?: string) => (s && /^\d{8}/.test(s) ? iso(+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8)) : '')
  const txns: Txn[] = blocks.map((b) => {
    const name = tag(b, 'NAME'), memo = tag(b, 'MEMO')
    return { date: ofxDate(tag(b, 'DTPOSTED')), amount: num(tag(b, 'TRNAMT')), description: decodeEnt([name, memo].filter(Boolean).join(' ') || ''), payee: name && decodeEnt(name), memo: memo && decodeEnt(memo), ref: tag(b, 'FITID'), type: tag(b, 'TRNTYPE') }
  }).filter((t) => t.date && isFinite(t.amount))
  if (!blocks.length) warnings.push('No transactions (STMTTRN) found in this OFX file.')
  return { format: /<\?xml/i.test(text) ? 'OFX 2 (XML)' : 'OFX 1 (SGML)', account: tag(text, 'ACCTID'), currency: tag(text, 'CURDEF'), txns, warnings }
}

/* ---------------- QIF ---------------- */
export function parseQif(text: string, dayFirst = false): Statement {
  const txns: Txn[] = []
  const warnings: string[] = []
  let cur: Partial<Txn> & { addr?: string[] } = {}
  let type = ''
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (!line) continue
    if (line.startsWith('!')) { type = line.slice(1); continue }
    const c = line[0], v = line.slice(1).trim()
    if (c === '^') { if (cur.date && isFinite(cur.amount as number)) txns.push({ date: cur.date, amount: cur.amount!, description: [cur.payee, cur.memo].filter(Boolean).join(' '), payee: cur.payee, memo: cur.memo, ref: cur.ref, category: cur.category }); cur = {}; continue }
    if (c === 'D') cur.date = parseDate(v.replace(/'/g, '/').replace(/\s/g, ''), dayFirst)
    else if (c === 'T' || c === 'U') cur.amount = parseMoney(v)
    else if (c === 'P') cur.payee = v
    else if (c === 'M') cur.memo = v
    else if (c === 'N') cur.ref = v
    else if (c === 'L') cur.category = v
  }
  if (!txns.length) warnings.push('No transactions found. QIF records end with a ^ line.')
  return { format: `QIF${type ? ` (${type})` : ''}`, txns, warnings }
}

/* ---------------- ISO 20022 CAMT.052/053/054 ---------------- */
export function parseCamt(xml: string): Statement {
  const warnings: string[] = []
  const g = (s: string, path: string[]) => { let cur = s; for (const p of path) { const m = new RegExp(`<(?:\\w+:)?${p}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${p}>`).exec(cur); if (!m) return ''; cur = m[1] } return decodeEnt(cur.trim()) }
  const entries = xml.split(/<(?:\w+:)?Ntry>/).slice(1).map((e) => e.split(/<\/(?:\w+:)?Ntry>/)[0])
  const txns: Txn[] = entries.map((e) => {
    const amtM = /<(?:\w+:)?Amt\b[^>]*Ccy="([A-Z]{3})"[^>]*>([\d.]+)</.exec(e)
    const dbit = /<(?:\w+:)?CdtDbtInd>DBIT</.test(e)
    const date = parseDate(g(e, ['BookgDt', 'Dt']) || g(e, ['BookgDt', 'DtTm']).slice(0, 10) || g(e, ['ValDt', 'Dt']))
    const info = g(e, ['RmtInf', 'Ustrd']) || g(e, ['AddtlNtryInf'])
    const party = dbit ? g(e, ['Cdtr', 'Nm']) || g(e, ['Cdtr', 'Pty', 'Nm']) : g(e, ['Dbtr', 'Nm']) || g(e, ['Dbtr', 'Pty', 'Nm'])
    return { date, amount: (dbit ? -1 : 1) * Number(amtM?.[2] ?? NaN), currency: amtM?.[1], description: [party, info].filter(Boolean).join(' '), payee: party || undefined, memo: info || undefined, ref: g(e, ['AcctSvcrRef']) || g(e, ['EndToEndId']) || undefined }
  }).filter((t) => t.date && isFinite(t.amount))
  if (!entries.length) warnings.push('No entries (Ntry) found in this CAMT file.')
  const ver = /camt\.(05[234])/.exec(xml)?.[1]
  return { format: `CAMT.${ver ?? '053'}`, account: g(xml, ['Acct', 'Id', 'IBAN']) || undefined, currency: g(xml, ['Acct', 'Ccy']) || txns[0]?.currency, txns, warnings }
}

/* ---------------- SWIFT MT940 ---------------- */
export function parseMt940(text: string): Statement {
  const txns: Txn[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  let account: string | undefined, currency: string | undefined
  let last: Txn | null = null
  let inDesc = false
  for (const line of lines) {
    const m = /^:(\w{2,3}):(.*)$/.exec(line)
    if (m) {
      inDesc = false
      const [, t, v] = m
      if (t === '25') account = v.trim()
      else if (t === '60F' || t === '60M') currency = v.slice(7, 10)
      else if (t === '61') {
        const r = /^(\d{2})(\d{2})(\d{2})(\d{4})?(R?[CD])([A-Z])?([\d,]+)(\w{4})([^/\n]*)(?:\/\/(.*))?/.exec(v)
        if (r) {
          const amt = parseFloat(r[7].replace(',', '.'))
          last = { date: iso(2000 + +r[1], +r[2], +r[3]), amount: r[5].endsWith('D') !== r[5].startsWith('R') ? -amt : amt, description: '', ref: r[9]?.trim() || undefined, type: r[8], currency }
          txns.push(last)
        }
      } else if (t === '86' && last) { last.description = v.trim(); inDesc = true }
    } else if (inDesc && last && line && !line.startsWith('-')) last.description += ' ' + line.trim()
  }
  for (const t of txns) t.description = t.description.replace(/\?\d{2}/g, ' ').replace(/\s+/g, ' ').trim()
  return { format: 'MT940', account, currency, txns, warnings: txns.length ? [] : ['No :61: statement lines found.'] }
}

/* ---------------- CSV with column detection ---------------- */
export interface CsvMap { date: number; amount?: number; debit?: number; credit?: number; description: number; balance?: number; dayFirst: boolean }

export function guessCsvMap(head: string[], rows: string[][]): CsvMap {
  const h = head.map((x) => x.toLowerCase().trim())
  const find = (re: RegExp, not?: RegExp) => h.findIndex((x) => re.test(x) && !(not && not.test(x)))
  const date = Math.max(0, find(/date|posted|time|dt\b/, /value date/) >= 0 ? find(/date|posted|time|dt\b/, /value date/) : find(/date/))
  const debit = find(/debit|withdrawal|paid out|money out|dr\b|spent/)
  const credit = find(/credit|deposit|paid in|money in|cr\b|received/)
  const amount = find(/amount|amt|value|sum/, /balance/)
  const balance = find(/balance|bal\b/)
  let description = find(/description|narration|details|particulars|memo|payee|merchant|name|reference|remarks/)
  if (description < 0) description = h.findIndex((_, i) => i !== date && i !== amount && i !== debit && i !== credit && i !== balance)
  // day first unless some value has a month position above 12
  let dayFirst = true
  for (const r of rows.slice(0, 200)) { const m = /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/.exec(r[date] ?? ''); if (m && +m[2] > 12) { dayFirst = false; break } }
  return { date, description: Math.max(0, description), dayFirst, ...(debit >= 0 && credit >= 0 ? { debit, credit } : { amount: amount >= 0 ? amount : undefined }), balance: balance >= 0 ? balance : undefined }
}

export function csvToTxns(rows: string[][], map: CsvMap): Txn[] {
  return rows.map((r) => {
    let amount = NaN
    if (map.debit != null && map.credit != null) { const d = parseMoney(r[map.debit]), c = parseMoney(r[map.credit]); amount = (isFinite(c) ? Math.abs(c) : 0) - (isFinite(d) ? Math.abs(d) : 0); if (!isFinite(d) && !isFinite(c)) amount = NaN }
    else if (map.amount != null) amount = parseMoney(r[map.amount])
    return { date: parseDate(r[map.date] ?? '', map.dayFirst), amount, description: (r[map.description] ?? '').trim(), balance: map.balance != null ? parseMoney(r[map.balance]) : undefined }
  }).filter((t) => t.date && isFinite(t.amount))
}

/** Detect the format from the name and content and parse it. CSV needs a parser for rows, passed in. */
export function detectFormat(name: string, text: string): 'ofx' | 'qif' | 'camt' | 'mt940' | 'csv' {
  const n = name.toLowerCase()
  if (/\.(ofx|qfx|qbo)$/.test(n) || /<OFX>|OFXHEADER/i.test(text.slice(0, 2000))) return 'ofx'
  if (/\.qif$/.test(n) || /^!Type:/im.test(text.slice(0, 500))) return 'qif'
  if (/camt\.05[234]/.test(text.slice(0, 3000)) || (/\.xml$/.test(n) && /<(\w+:)?Ntry>/.test(text))) return 'camt'
  if (/\.(sta|mt940|940)$/.test(n) || /^:20:/m.test(text.slice(0, 500)) && /^:61:/m.test(text)) return 'mt940'
  return 'csv'
}

/* ---------------- writers ---------------- */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const ofxD = (d: string) => d.replace(/-/g, '') + '120000'

/** Write OFX 2.2 (XML). FITIDs are stable hashes of the row so a re-import does not create duplicates. */
export function toOfx(txns: Txn[], o: { account?: string; currency?: string; bankId?: string; type?: 'CHECKING' | 'SAVINGS' | 'CREDITLINE' } = {}): string {
  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date))
  const start = sorted[0]?.date ?? '1970-01-01', end = sorted.at(-1)?.date ?? start
  const body = sorted.map((t) => `<STMTTRN><TRNTYPE>${t.amount < 0 ? 'DEBIT' : 'CREDIT'}</TRNTYPE><DTPOSTED>${ofxD(t.date)}</DTPOSTED><TRNAMT>${t.amount.toFixed(2)}</TRNAMT><FITID>${t.ref || fitId(t)}</FITID><NAME>${esc((t.payee || t.description || 'Transaction').slice(0, 32))}</NAME>${t.description ? `<MEMO>${esc(t.description.slice(0, 255))}</MEMO>` : ''}</STMTTRN>`).join('\n')
  const bal = sorted.at(-1)?.balance
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<?OFX OFXHEADER="200" VERSION="220" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS><DTSERVER>${ofxD(end)}</DTSERVER><LANGUAGE>ENG</LANGUAGE></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1</TRNUID><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS><STMTRS><CURDEF>${o.currency || 'USD'}</CURDEF>
<BANKACCTFROM><BANKID>${esc(o.bankId || '000000000')}</BANKID><ACCTID>${esc(o.account || '0000')}</ACCTID><ACCTTYPE>${o.type || 'CHECKING'}</ACCTTYPE></BANKACCTFROM>
<BANKTRANLIST><DTSTART>${ofxD(start)}</DTSTART><DTEND>${ofxD(end)}</DTEND>
${body}
</BANKTRANLIST><LEDGERBAL><BALAMT>${(bal ?? 0).toFixed(2)}</BALAMT><DTASOF>${ofxD(end)}</DTASOF></LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
`
}

export function toQif(txns: Txn[], type = 'Bank'): string {
  const d = (s: string) => { const [y, m, dd] = s.split('-'); return `${m}/${dd}/${y}` }
  return `!Type:${type}\n` + txns.map((t) => [`D${d(t.date)}`, `T${t.amount.toFixed(2)}`, `P${(t.payee || t.description).replace(/\n/g, ' ')}`, t.memo ? `M${t.memo}` : '', t.ref ? `N${t.ref}` : '', t.category ? `L${t.category}` : '', '^'].filter(Boolean).join('\n')).join('\n') + '\n'
}

export function fitId(t: Txn) {
  let h = 2166136261
  for (const c of `${t.date}|${t.amount}|${t.description}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) }
  return 'OF' + (h >>> 0).toString(16).padStart(8, '0')
}

/* ---------------- statement summary ---------------- */
export function summarizeTxns(txns: Txn[]) {
  const months = new Map<string, { in: number; out: number }>()
  const payees = new Map<string, { n: number; total: number }>()
  let inn = 0, out = 0
  for (const t of txns) {
    const k = t.date.slice(0, 7)
    const m = months.get(k) ?? { in: 0, out: 0 }
    if (t.amount >= 0) { m.in += t.amount; inn += t.amount } else { m.out += -t.amount; out += -t.amount }
    months.set(k, m)
    const p = cleanPayee(t.payee || t.description)
    if (t.amount < 0 && p) { const v = payees.get(p) ?? { n: 0, total: 0 }; v.n++; v.total += -t.amount; payees.set(p, v) }
  }
  return {
    in: inn, out, net: inn - out, count: txns.length,
    first: txns.reduce((a, t) => (t.date < a ? t.date : a), txns[0]?.date ?? ''), last: txns.reduce((a, t) => (t.date > a ? t.date : a), ''),
    months: [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => ({ month, ...v })),
    payees: [...payees.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total),
    recurring: findRecurring(txns),
  }
}

/** Short payee key: drop card numbers, dates, reference codes and city suffixes. */
export function cleanPayee(s: string) {
  return s.toUpperCase().replace(/\b(POS|UPI|NEFT|IMPS|ACH|DEBIT|CREDIT|CARD|PURCHASE|PAYMENT|TO|FROM|VIA|REF|TXN|ONLINE)\b/g, ' ')
    .replace(/[*#/\\_\-:]+/g, ' ').replace(/\b\d[\d\s]{3,}\b/g, ' ').replace(/\b[A-Z0-9]{10,}\b/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ')
}

/** Payees that charge about the same amount at roughly monthly gaps (subscriptions, rent, bills). */
export function findRecurring(txns: Txn[]) {
  const by = new Map<string, Txn[]>()
  for (const t of txns) if (t.amount < 0) { const k = cleanPayee(t.payee || t.description); if (k) by.set(k, [...(by.get(k) ?? []), t]) }
  const out: { name: string; amount: number; every: string; count: number }[] = []
  for (const [name, list] of by) {
    if (list.length < 3) continue
    const s = [...list].sort((a, b) => a.date.localeCompare(b.date))
    const gaps = s.slice(1).map((t, i) => (Date.parse(t.date) - Date.parse(s[i].date)) / 864e5)
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
    const amts = s.map((t) => -t.amount), mean = amts.reduce((a, b) => a + b, 0) / amts.length
    const spread = Math.max(...amts.map((a) => Math.abs(a - mean))) / (mean || 1)
    const every = avg > 25 && avg < 35 ? 'monthly' : avg > 5 && avg < 9 ? 'weekly' : avg > 350 && avg < 380 ? 'yearly' : ''
    if (every && spread < 0.15) out.push({ name, amount: Math.round(mean * 100) / 100, every, count: s.length })
  }
  return out.sort((a, b) => b.amount - a.amount)
}

/* ---------------- rule based categories (also the quick mode of the AI categorizer) ---------------- */
export const CATEGORIES: { name: string; words: string[]; hint: string }[] = [
  { name: 'Groceries', words: ['grocery', 'supermarket', 'mart', 'bigbasket', 'blinkit', 'zepto', 'dmart', 'walmart', 'tesco', 'aldi', 'lidl', 'kroger', 'safeway', 'costco', 'reliance fresh', 'whole foods', 'sainsbury'], hint: 'groceries, supermarket, food shopping' },
  { name: 'Eating out', words: ['restaurant', 'cafe', 'coffee', 'starbucks', 'swiggy', 'zomato', 'mcdonald', 'kfc', 'domino', 'pizza', 'burger', 'uber eats', 'doordash', 'deliveroo', 'subway', 'bar ', 'pub'], hint: 'restaurant, cafe, food delivery, takeaway' },
  { name: 'Transport', words: ['uber', 'ola', 'lyft', 'metro', 'railway', 'irctc', 'bus', 'taxi', 'fuel', 'petrol', 'diesel', 'shell', 'parking', 'toll', 'fastag', 'transit'], hint: 'taxi, train, bus, fuel, parking' },
  { name: 'Shopping', words: ['amazon', 'flipkart', 'myntra', 'ebay', 'ikea', 'decathlon', 'store', 'shop', 'mall', 'target', 'meesho', 'ajio'], hint: 'online shopping, clothes, electronics, home goods' },
  { name: 'Bills and utilities', words: ['electric', 'electricity', 'water', 'gas bill', 'broadband', 'internet', 'mobile', 'recharge', 'airtel', 'jio', 'vodafone', 'bsnl', 'verizon', 'at&t', 'comcast', 'utility'], hint: 'electricity, water, phone, internet bill' },
  { name: 'Subscriptions', words: ['netflix', 'spotify', 'prime', 'youtube', 'hotstar', 'apple.com', 'google', 'icloud', 'adobe', 'microsoft', 'github', 'openai', 'subscription', 'membership'], hint: 'streaming, software, monthly subscription' },
  { name: 'Rent and home', words: ['rent', 'landlord', 'maintenance', 'society', 'mortgage', 'housing', 'hoa'], hint: 'rent, mortgage, home maintenance' },
  { name: 'Health', words: ['pharmacy', 'chemist', 'hospital', 'clinic', 'doctor', 'dental', 'apollo', 'medplus', 'netmeds', 'cvs', 'walgreens', 'gym', 'fitness'], hint: 'doctor, pharmacy, medicine, gym' },
  { name: 'Travel', words: ['airline', 'airways', 'indigo', 'air india', 'vistara', 'hotel', 'airbnb', 'booking.com', 'makemytrip', 'expedia', 'goibibo', 'oyo'], hint: 'flights, hotels, holidays' },
  { name: 'Entertainment', words: ['cinema', 'pvr', 'inox', 'bookmyshow', 'steam', 'playstation', 'xbox', 'concert', 'ticket'], hint: 'movies, games, events, tickets' },
  { name: 'Education', words: ['school', 'college', 'university', 'tuition', 'course', 'udemy', 'coursera', 'books', 'exam'], hint: 'school fees, courses, books' },
  { name: 'Income', words: ['salary', 'payroll', 'interest', 'refund', 'dividend', 'cashback', 'reimbursement'], hint: 'salary, refund, interest received' },
  { name: 'Transfers', words: ['transfer', 'self', 'own account', 'neft', 'imps', 'rtgs', 'zelle', 'venmo', 'paypal', 'wise'], hint: 'money sent to people or own accounts' },
  { name: 'Cash', words: ['atm', 'cash withdrawal', 'cash'], hint: 'ATM cash withdrawal' },
  { name: 'Fees and charges', words: ['fee', 'charge', 'penalty', 'gst on', 'service tax', 'annual fee', 'late fee'], hint: 'bank fees, charges, penalties' },
]

export function ruleCategory(desc: string, amount?: number): string {
  const d = ' ' + desc.toLowerCase() + ' '
  for (const c of CATEGORIES) if (c.words.some((w) => d.includes(w))) return c.name === 'Income' && amount != null && amount < 0 ? 'Fees and charges' : c.name
  return amount != null && amount > 0 ? 'Income' : 'Other'
}

/* ---------------- loans ---------------- */
export interface LoanRow { n: number; date?: string; payment: number; principal: number; interest: number; extra: number; balance: number }

/** Standard EMI for principal P, annual rate r (percent) and n months. */
export function emi(P: number, ratePct: number, n: number) {
  const i = ratePct / 1200
  if (n <= 0) return 0
  if (i === 0) return P / n
  return (P * i * (1 + i) ** n) / ((1 + i) ** n - 1)
}

export function amortize(P: number, ratePct: number, n: number, extraMonthly = 0, lump: { month: number; amount: number }[] = []): { rows: LoanRow[]; payment: number; totalInterest: number; months: number } {
  const pay = emi(P, ratePct, n), i = ratePct / 1200
  const rows: LoanRow[] = []
  let bal = P, k = 0, ti = 0
  while (bal > 0.005 && k < 1200) {
    k++
    const int = bal * i
    let princ = Math.min(bal, pay - int)
    let extra = extraMonthly + lump.filter((l) => l.month === k).reduce((s, l) => s + l.amount, 0)
    extra = Math.min(extra, bal - princ)
    bal = bal - princ - extra
    ti += int
    rows.push({ n: k, payment: princ + int, principal: princ, interest: int, extra, balance: Math.max(0, bal) })
    if (pay <= int && extra <= 0) break // payment does not cover interest
    if (princ < 0) princ = 0
  }
  return { rows, payment: pay, totalInterest: ti, months: rows.length }
}

/* ---------------- compound growth and SIP ---------------- */
export interface GrowthRow { year: number; invested: number; interest: number; value: number }

/** Lump sum plus a monthly contribution, compounded `perYear` times a year, contributions at month end. */
export function growth(o: { start: number; monthly: number; ratePct: number; years: number; perYear?: number; stepUpPct?: number }): GrowthRow[] {
  const per = o.perYear ?? 12
  const rows: GrowthRow[] = []
  let value = o.start, invested = o.start, monthly = o.monthly
  const mRate = (1 + o.ratePct / 100 / per) ** (per / 12) - 1 // effective monthly rate
  for (let y = 1; y <= o.years; y++) {
    for (let m = 0; m < 12; m++) { value = value * (1 + mRate) + monthly; invested += monthly }
    rows.push({ year: y, invested, interest: value - invested, value })
    monthly *= 1 + (o.stepUpPct ?? 0) / 100
  }
  return rows
}

/** Compound annual growth rate between two values over years. */
export const cagr = (from: number, to: number, years: number) => (from > 0 && years > 0 ? ((to / from) ** (1 / years) - 1) * 100 : NaN)

/* ---------------- GST / VAT ---------------- */
export function tax(amount: number, ratePct: number, mode: 'add' | 'remove') {
  if (mode === 'add') { const t = amount * ratePct / 100; return { net: amount, tax: t, gross: amount + t } }
  const net = amount / (1 + ratePct / 100); return { net, tax: amount - net, gross: amount }
}

/* ---------------- split expenses ---------------- */
export interface Expense { payer: string; amount: number; for: string[]; note?: string }

export function balances(people: string[], exps: Expense[]) {
  const bal = new Map(people.map((p) => [p, 0]))
  for (const e of exps) {
    const share = e.for.length ? e.for : people
    bal.set(e.payer, (bal.get(e.payer) ?? 0) + e.amount)
    for (const p of share) bal.set(p, (bal.get(p) ?? 0) - e.amount / share.length)
  }
  return bal
}

/** Fewest transfers to settle: repeatedly match the biggest debtor with the biggest creditor. */
export function settle(bal: Map<string, number>) {
  const cents = [...bal.entries()].map(([p, v]) => ({ p, v: Math.round(v * 100) }))
  const out: { from: string; to: string; amount: number }[] = []
  for (let guard = 0; guard < 1000; guard++) {
    cents.sort((a, b) => a.v - b.v)
    const d = cents[0], c = cents[cents.length - 1]
    if (!d || !c || d.v >= 0 || c.v <= 0) break
    const x = Math.min(-d.v, c.v)
    out.push({ from: d.p, to: c.p, amount: x / 100 })
    d.v += x; c.v -= x
  }
  return out
}

/* ---------------- receipts (text from OCR) ---------------- */
export interface Receipt { merchant: string; date: string; total: number | null; tax: number | null; subtotal: number | null; currency: string; items: { name: string; amount: number }[] }

export function parseReceipt(text: string): Receipt {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const money = /(-?\d{1,3}(?:[,\s]\d{3})*(?:[.,]\d{2})|-?\d+[.,]\d{2})\s*$/
  const cur = /₹|rs\.?|inr/i.test(text) ? 'INR' : /€|eur/i.test(text) ? 'EUR' : /£|gbp/i.test(text) ? 'GBP' : /\$|usd/i.test(text) ? 'USD' : ''
  const find = (re: RegExp) => { for (let i = lines.length - 1; i >= 0; i--) if (re.test(lines[i])) { const m = money.exec(lines[i]); if (m) return parseMoney(m[1]) } return null }
  const total = find(/\b(grand\s*total|total\s*(amount|due|payable)?|amount\s*(due|paid)|net\s*payable|balance\s*due)\b/i)
  const taxV = find(/\b(gst|vat|tax|cgst|sgst|igst|hst)\b/i)
  const subtotal = find(/\bsub\s*-?\s*total\b/i)
  let date = ''
  for (const l of lines) {
    const m = /(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/.exec(l)
    if (m) { date = parseDate(m[1]); if (date) break }
  }
  const merchant = lines.slice(0, 5).find((l) => /[A-Za-z]{3}/.test(l) && !/receipt|invoice|tax|gst|tel|phone|www|date|bill no/i.test(l) && !money.test(l)) ?? ''
  const skip = /total|tax|gst|vat|cgst|sgst|change|cash|card|visa|mastercard|tender|balance|round|discount|saving|paid|due/i
  const items = lines.filter((l) => money.test(l) && !skip.test(l)).map((l) => { const m = money.exec(l)!; return { name: l.slice(0, m.index).replace(/[\s.:x×@*-]+$/, '').trim(), amount: parseMoney(m[1]) } }).filter((i) => i.name.length > 1 && /[A-Za-z]/.test(i.name) && isFinite(i.amount))
  return { merchant, date, total, tax: taxV, subtotal, currency: cur, items }
}

/* ---------------- PDF statement rows from positioned text ---------------- */
export interface TextItem { str: string; x: number; y: number }

/** Group positioned text into lines, then keep lines that start with a date and contain an amount. */
export function pdfStatementRows(items: TextItem[], dayFirst = true): Txn[] {
  const lines: { y: number; parts: TextItem[] }[] = []
  for (const it of items.filter((i) => i.str.trim())) {
    const l = lines.find((L) => Math.abs(L.y - it.y) < 3)
    if (l) l.parts.push(it); else lines.push({ y: it.y, parts: [it] })
  }
  lines.sort((a, b) => b.y - a.y)
  const out: Txn[] = []
  const dateRe = /^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\s-][A-Za-z]{3}[\s-]\d{2,4})/
  const amtRe = /^\(?-?[\d,]+\.\d{2}\)?\s*(CR|DR|Cr|Dr)?$/
  let lastBal: number | undefined
  for (const L of lines) {
    const parts = L.parts.sort((a, b) => a.x - b.x).map((p) => p.str.trim())
    const text = parts.join(' ')
    const dm = dateRe.exec(text)
    if (!dm) { if (out.length && !parts.some((p) => amtRe.test(p))) out[out.length - 1].description += ' ' + text; continue }
    const date = parseDate(dm[1], dayFirst)
    const nums = parts.filter((p) => amtRe.test(p))
    if (!date || !nums.length) continue
    const desc = parts.filter((p) => !amtRe.test(p) && !p.startsWith(dm[1])).join(' ').replace(dm[1], '').trim()
    let amount = parseMoney(nums[0])
    let balance: number | undefined
    if (nums.length >= 2) { balance = parseMoney(nums[nums.length - 1]); amount = parseMoney(nums[nums.length - 2]) }
    // sign from the running balance when it is there, else from DR/CR markers
    if (balance != null && lastBal != null && isFinite(balance)) amount = Math.abs(amount) * (balance < lastBal ? -1 : 1)
    else if (/dr/i.test(nums[nums.length > 1 ? nums.length - 2 : 0])) amount = -Math.abs(amount)
    if (balance != null && isFinite(balance)) lastBal = balance
    out.push({ date, amount, description: desc, balance })
  }
  return out
}
