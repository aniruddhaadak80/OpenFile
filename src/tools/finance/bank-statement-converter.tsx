import { useState } from 'react'
import { Label, Segmented, ToolGrid, Empty } from '@/components/ui'
import { baseName } from '@/lib/files'
import { exportTxns } from '@/lib/r13/export'
import { useStatement, StatementDrop, CsvColumns, TxnTable } from '@/lib/r13/ui'
import { DlButton } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

type Out = 'csv' | 'xlsx' | 'json' | 'ofx' | 'qif'

export default function BankStatementConverter() {
  const st = useStatement()
  const [out, setOut] = useState<Out>('csv')
  const [sort, setSort] = useState<'file' | 'date'>('date')
  const s = st.stmt
  const txns = s ? (sort === 'date' ? [...s.txns].sort((a, b) => a.date.localeCompare(b.date)) : s.txns) : []
  const inn = txns.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0), outT = txns.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0)
  return (
    <ToolGrid
      main={<>
        <StatementDrop st={st} />
        {s && s.txns.length > 0 && <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Format" value={s.format} /><Stat label="Transactions" value={txns.length} /><Stat label="Money in" value={inn.toFixed(2)} /><Stat label="Money out" value={outT.toFixed(2)} /></div>
          <TxnTable txns={txns} currency={s.currency} />
        </>}
        {st.file && s && !s.txns.length && <Empty>No transactions yet. Check the column choices on the right.</Empty>}
      </>}
      side={<>
        <CsvColumns st={st} />
        <div><Label>Save as</Label><Segmented value={out} onChange={setOut} options={[{ value: 'csv', label: 'CSV' }, { value: 'xlsx', label: 'Excel' }, { value: 'json', label: 'JSON' }, { value: 'ofx', label: 'OFX' }, { value: 'qif', label: 'QIF' }]} /></div>
        <div><Label>Order</Label><Segmented value={sort} onChange={setSort} options={[{ value: 'date', label: 'Oldest first' }, { value: 'file', label: 'As in the file' }]} /></div>
        <DlButton variant="primary" size="md" className="w-full" disabled={!txns.length} name={() => `${baseName(st.file?.name ?? 'statement')}.${out}`} data={() => exportTxns(txns, out, { currency: s?.currency, account: s?.account })}>Download {out.toUpperCase()}</DlButton>
        <p className="text-xs text-muted">OFX and QIF files import into most money apps. Each OFX row gets a stable ID, so importing the same file twice does not double it.</p>
      </>}
    />
  )
}
