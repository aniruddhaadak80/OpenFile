/* Save transactions as CSV, Excel, JSON, OFX or QIF. */
import { toOfx, toQif, type Txn } from './finance'
import { toCsv } from '@/lib/bcat/kit'

export type Out = 'csv' | 'xlsx' | 'json' | 'ofx' | 'qif'

export async function exportTxns(txns: Txn[], out: Out, meta: { currency?: string; account?: string } = {}): Promise<Blob> {
  const rows = [['date', 'description', 'amount', 'payee', 'memo', 'reference', 'balance', 'category'], ...txns.map((t) => [t.date, t.description, t.amount.toFixed(2), t.payee ?? '', t.memo ?? '', t.ref ?? '', t.balance != null && isFinite(t.balance) ? t.balance.toFixed(2) : '', t.category ?? ''])]
  if (out === 'csv') return new Blob(['\uFEFF' + toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  if (out === 'json') return new Blob([JSON.stringify({ ...meta, transactions: txns }, null, 2)], { type: 'application/json' })
  if (out === 'ofx') return new Blob([toOfx(txns, meta)], { type: 'application/x-ofx' })
  if (out === 'qif') return new Blob([toQif(txns)], { type: 'application/qif' })
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([rows[0], ...txns.map((t) => [t.date, t.description, t.amount, t.payee ?? '', t.memo ?? '', t.ref ?? '', t.balance ?? '', t.category ?? ''])])
  ws['!cols'] = [{ wch: 11 }, { wch: 42 }, { wch: 12 }, { wch: 24 }, { wch: 24 }, { wch: 14 }, { wch: 12 }, { wch: 16 }]
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Transactions')
  return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

