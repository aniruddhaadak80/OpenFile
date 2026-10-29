import { useState } from 'react'
import { Input, Label, Segmented, Select, ToolGrid, Empty } from '@/components/ui'
import { baseName } from '@/lib/files'
import { toOfx, toQif } from '@/lib/r13/finance'
import { useStatement, StatementDrop, CsvColumns, TxnTable } from '@/lib/r13/ui'
import { DlButton } from '@/lib/bcat/kit'

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED', 'JPY', 'CHF', 'NZD', 'ZAR']
const BY_REGION: Record<string, string> = { IN: 'INR', US: 'USD', GB: 'GBP', AU: 'AUD', CA: 'CAD', SG: 'SGD', AE: 'AED', JP: 'JPY', CH: 'CHF', NZ: 'NZD', ZA: 'ZAR' }
const EURO = new Set(['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'])
/** Starting currency from the browser's region (en-GB gives GBP, de-DE gives EUR), INR when unknown. */
function localCurrency() {
  try { const r = new Intl.Locale(navigator.language).maximize().region ?? ''; return BY_REGION[r] ?? (EURO.has(r) ? 'EUR' : 'INR') } catch { return 'INR' }
}

export default function CsvToOfx() {
  const st = useStatement()
  const [fmt, setFmt] = useState<'ofx' | 'qif'>('ofx')
  const [currency, setCurrency] = useState(localCurrency)
  const [account, setAccount] = useState('')
  const [type, setType] = useState<'CHECKING' | 'SAVINGS' | 'CREDITLINE'>('CHECKING')
  const [flip, setFlip] = useState(false)
  const txns = (st.stmt?.txns ?? []).map((t) => (flip ? { ...t, amount: -t.amount } : t))
  return (
    <ToolGrid
      main={<>
        <StatementDrop st={st} label="Drop a bank CSV export" sub="Any CSV with a date, a description and an amount (or money in and money out columns). Also opens OFX, QIF, CAMT and MT940." />
        {txns.length > 0 ? <TxnTable txns={txns} currency={currency} /> : st.file && <Empty>No rows read yet. Pick the right columns on the right.</Empty>}
      </>}
      side={<>
        <CsvColumns st={st} />
        <div><Label>Make</Label><Segmented value={fmt} onChange={setFmt} options={[{ value: 'ofx', label: 'OFX 2.2' }, { value: 'qif', label: 'QIF' }]} /></div>
        {fmt === 'ofx' && <>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-muted">Currency<Select value={currency} onChange={setCurrency} options={CURRENCIES} /></label>
            <label className="block text-xs text-muted">Account type<Select value={type} onChange={setType} options={[{ value: 'CHECKING', label: 'Current' }, { value: 'SAVINGS', label: 'Savings' }, { value: 'CREDITLINE', label: 'Credit card' }]} /></label>
          </div>
          <label className="block text-xs text-muted">Account number or name (optional)<Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="Last 4 digits are enough" /></label>
        </>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={flip} onChange={(e) => setFlip(e.target.checked)} className="accent-[var(--accent)]" />Flip signs (credit card exports often show spending as positive)</label>
        <DlButton variant="primary" size="md" className="w-full" disabled={!txns.length} name={() => `${baseName(st.file?.name ?? 'statement')}.${fmt}`} mime={fmt === 'ofx' ? 'application/x-ofx' : 'application/qif'} data={() => (fmt === 'ofx' ? toOfx(txns, { currency, account: account || undefined, type }) : toQif(txns, type === 'CREDITLINE' ? 'CCard' : 'Bank'))}>Download {fmt.toUpperCase()}</DlButton>
        <p className="text-xs text-muted">Use this when your bank only gives CSV but your money app wants OFX or QIF.</p>
      </>}
    />
  )
}
