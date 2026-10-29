// Interactive demos for the Money & Finance and Health & Fitness posts (round 13).
import { useMemo, useState } from 'react'
import { parseOfx, parseQif, parseCamt, parseMt940, detectFormat, parseReceipt } from '@/lib/r13/finance'
import { ZONES, maxHrTanaka } from '@/lib/r13/health'

const box = 'not-prose my-6 rounded-2xl border border-border bg-surface p-4'
const SAMPLES: Record<string, string> = {
  OFX: '<OFX><BANKTRANLIST>\n<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003<TRNAMT>-649.00<NAME>NETFLIX.COM</STMTTRN>\n<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261001<TRNAMT>52000.00<NAME>SALARY</STMTTRN>\n</BANKTRANLIST></OFX>',
  QIF: '!Type:Bank\nD10/01/2026\nT-45.20\nPTesco Superstore\n^\nD10/02/2026\nT2500.00\nPPayroll\n^',
  MT940: ':20:STATEMENT\n:25:NL91ABNA0417164300\n:61:2610021002D25,50NTRFNONREF\n:86:Albert Heijn Amsterdam\n:61:2610031003C150,00NTRFNONREF\n:86:Refund',
  CAMT: '<Document><BkToCstmrStmt><Stmt>\n<Ntry><Amt Ccy="EUR">120.50</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-10-01</Dt></BookgDt><RmtInf><Ustrd>Electricity October</Ustrd></RmtInf></Ntry>\n</Stmt></BkToCstmrStmt></Document>',
}

export function BankFormatDemo() {
  const [kind, setKind] = useState('OFX')
  const [text, setText] = useState(SAMPLES.OFX)
  const res = useMemo(() => {
    try {
      const f = detectFormat(kind === 'CAMT' ? 'x.xml' : 'x.' + kind.toLowerCase(), text)
      const s = f === 'ofx' ? parseOfx(text) : f === 'qif' ? parseQif(text) : f === 'camt' ? parseCamt(text) : f === 'mt940' ? parseMt940(text) : null
      return s ? { s } : { err: 'Not a bank format this demo knows.' }
    } catch (e: any) { return { err: e.message as string } }
  }, [text, kind])
  return (
    <div className={box}>
      <div className="mb-2 flex flex-wrap gap-1.5">{Object.keys(SAMPLES).map((k) => <button key={k} type="button" onClick={() => { setKind(k); setText(SAMPLES[k]) }} className={`min-h-9 rounded-full border px-3 text-xs cursor-pointer ${k === kind ? 'border-accent bg-accent/10' : 'border-border text-muted'}`}>{k}</button>)}</div>
      <textarea aria-label="Bank file text" value={text} onChange={(e) => setText(e.target.value)} className="h-32 w-full rounded-xl border border-border bg-bg p-2 font-mono text-[11px]" spellCheck={false} />
      {res.err ? <p className="mt-2 text-sm text-warn">{res.err}</p> : <>
        <p className="mt-2 text-xs text-muted">Read as {res.s!.format}: {res.s!.txns.length} transactions. Edit the text above and watch the table change.</p>
        <table className="mt-2 w-full text-sm"><tbody>{res.s!.txns.map((t, i) => <tr key={i} className="border-t border-border"><td className="py-1 font-mono text-xs">{t.date}</td><td className="py-1">{t.description}</td><td className={`py-1 text-right font-mono ${t.amount < 0 ? '' : 'text-success'}`}>{t.amount.toFixed(2)}</td></tr>)}</tbody></table>
      </>}
    </div>
  )
}

export function ZoneDemo() {
  const [age, setAge] = useState(30)
  const [rest, setRest] = useState(60)
  const [karv, setKarv] = useState(false)
  const max = maxHrTanaka(age)
  const b = (f: number) => Math.round(karv ? rest + f * (max - rest) : f * max)
  return (
    <div className={box}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Age: <b>{age}</b><input type="range" min={15} max={80} value={age} onChange={(e) => setAge(+e.target.value)} className="w-full accent-[var(--accent)]" /></label>
        <label className="text-sm">Resting heart rate: <b>{rest}</b><input type="range" min={40} max={90} value={rest} onChange={(e) => setRest(+e.target.value)} className="w-full accent-[var(--accent)]" /></label>
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={karv} onChange={(e) => setKarv(e.target.checked)} className="accent-[var(--accent)]" />Use heart rate reserve (Karvonen)</label>
      <p className="mt-2 text-xs text-muted">Estimated max: {max} bpm (208 minus 0.7 times age).</p>
      <div className="mt-2 space-y-1.5">{ZONES.map((z, i) => <div key={z.name} className="flex items-center gap-2 text-sm"><span className="size-3 rounded-full" style={{ background: z.color }} /><span className="w-40">{z.name}</span><span className="font-mono">{b(z.lo)} to {i === 4 ? max : b(z.hi) - 1} bpm</span></div>)}</div>
    </div>
  )
}

const RECEIPT = 'CORNER CAFE\n21 Lake Road\n12/10/2026 09:41\nCappuccino      180.00\nCroissant       120.00\nSubtotal        300.00\nGST 5%           15.00\nTOTAL           315.00\nUPI             315.00'

export function ReceiptParseDemo() {
  const [text, setText] = useState(RECEIPT)
  const r = useMemo(() => parseReceipt(text), [text])
  return (
    <div className={box}>
      <div className="grid gap-3 sm:grid-cols-2">
        <textarea aria-label="Receipt text as read by OCR" value={text} onChange={(e) => setText(e.target.value)} className="h-56 w-full rounded-xl border border-border bg-[#F2EFE8] p-3 font-mono text-[12px] text-black" spellCheck={false} />
        <dl className="grid grid-cols-[6rem_1fr] content-start gap-y-1.5 text-sm">
          <dt className="text-muted">Shop</dt><dd>{r.merchant || '-'}</dd>
          <dt className="text-muted">Date</dt><dd className="font-mono">{r.date || '-'}</dd>
          <dt className="text-muted">Subtotal</dt><dd className="font-mono">{r.subtotal ?? '-'}</dd>
          <dt className="text-muted">Tax</dt><dd className="font-mono">{r.tax ?? '-'}</dd>
          <dt className="text-muted">Total</dt><dd className="font-mono font-semibold text-accent">{r.total ?? '-'}</dd>
          <dt className="text-muted">Items</dt><dd>{r.items.map((x) => `${x.name} (${x.amount})`).join(', ') || '-'}</dd>
        </dl>
      </div>
      <p className="mt-2 text-xs text-muted">Change a number or break a line on the left, the way a faded receipt might come out of OCR, and see what the rules pick up.</p>
    </div>
  )
}
