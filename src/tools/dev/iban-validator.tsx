import { useMemo, useState } from 'react'
import { ShieldCheck, ShieldX, Download } from 'lucide-react'
import { Input, Segmented, Textarea, Badge, Button } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { Bar, Status, KV, DataTable, useLib } from './_b5/shell'

const IBAN_ERR = ['No IBAN given.', 'Unknown country code at the start.', 'Wrong length for this country.', 'Wrong format for this country.', 'Check digits are not numbers.', 'Check digits do not match (likely a typo).', 'The national account checksum is wrong.', 'QR-IBANs are not allowed here.']
const BIC_ERR = ['No BIC given.', 'Must be 8 or 11 characters: 4 letters, 2 letter country, 2 location, optional 3 branch.', 'Unknown country code.']

export default function IbanValidator() {
  const T = useLib('ibantools', () => import('ibantools'))
  const [mode, setMode] = useState<'iban' | 'bic' | 'bulk'>('iban')
  const [iban, setIban] = useState('DE89 3704 0044 0532 0130 00')
  const [bic, setBic] = useState('DEUTDEFF500')
  const [bulk, setBulk] = useState('GB82 WEST 1234 5698 7654 32\nFR14 2004 1010 0505 0001 3M02 606\nNL91ABNA0417164301')
  const dn = useMemo(() => new Intl.DisplayNames([navigator.language || 'en'], { type: 'region' }), [])
  const r = useMemo(() => { if (!T || !iban.trim()) return null; const e = T.electronicFormatIBAN(iban) ?? ''; const v = T.validateIBAN(e); return { e, v, x: T.extractIBAN(e), spec: T.getCountrySpecifications()[e.slice(0, 2)] } }, [T, iban])
  const b = useMemo(() => (T && bic.trim() ? { v: T.validateBIC(bic.trim().toUpperCase()), x: T.extractBIC(bic.trim().toUpperCase()) } : null), [T, bic])
  const rows = useMemo(() => T ? bulk.split(/\r?\n/).filter((l) => l.trim()).map((l) => { const e = T.electronicFormatIBAN(l) ?? ''; const v = T.validateIBAN(e); return [l.trim(), v.valid ? 'valid' : 'invalid', T.friendlyFormatIBAN(e) ?? '', e.slice(0, 2), v.valid ? '' : v.errorCodes.map((c) => IBAN_ERR[c]).join(' ')] }) : [], [T, bulk])
  return (
    <div className="space-y-4">
      <Bar><Segmented value={mode} onChange={setMode} options={[{ value: 'iban', label: 'IBAN' }, { value: 'bic', label: 'BIC / SWIFT' }, { value: 'bulk', label: 'Bulk IBAN check' }]} /><span className="text-xs text-muted">Checked offline with the official country rules and mod-97 checksum. Nothing is sent to a bank.</span></Bar>
      {!T && <Status kind="info">Loading…</Status>}
      {T && mode === 'iban' && <>
        <Input value={iban} onChange={(e) => setIban(e.target.value)} className="h-12 font-mono text-lg uppercase" placeholder="GB82 WEST 1234 5698 7654 32" aria-label="IBAN" spellCheck={false} />
        {r && (r.v.valid ? <Status kind="ok"><span className="inline-flex items-center gap-2"><ShieldCheck className="size-4" />Valid IBAN{r.spec ? ` for ${dn.of(r.e.slice(0, 2))}` : ''}{T.isSEPACountry(r.e.slice(0, 2)) ? ' (SEPA)' : ''}.</span></Status> : <Status kind="err"><span className="inline-flex items-center gap-2"><ShieldX className="size-4" />Not valid.</span> {r.v.errorCodes.map((c) => IBAN_ERR[c]).join(' ')}</Status>)}
        {r && r.x.countryCode && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <KV label="Printed format" value={T.friendlyFormatIBAN(r.e) ?? ''} /><KV label="Electronic format" value={r.e} /><KV label="Country" value={`${dn.of(r.x.countryCode)} (${r.x.countryCode})`} />
            <KV label="Check digits" value={r.e.slice(2, 4)} /><KV label="BBAN" value={r.x.bban ?? ''} /><KV label="Bank code" value={r.x.bankIdentifier ?? ''} />
            {r.x.branchIdentifier && <KV label="Branch code" value={r.x.branchIdentifier} />}<KV label="Account number" value={r.x.accountNumber ?? ''} /><KV label="Expected length" value={r.spec?.chars ? `${r.spec.chars} characters (has ${r.e.length})` : ''} />
          </div>
        )}
      </>}
      {T && mode === 'bic' && <>
        <Input value={bic} onChange={(e) => setBic(e.target.value)} className="h-12 font-mono text-lg uppercase" placeholder="DEUTDEFF" aria-label="BIC" spellCheck={false} />
        {b && (b.v.valid ? <Status kind="ok">Valid BIC format.</Status> : <Status kind="err">{b.v.errorCodes.map((c) => BIC_ERR[c]).join(' ')}</Status>)}
        {b?.x.valid && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><KV label="Bank code" value={b.x.bankCode ?? ''} /><KV label="Country" value={b.x.countryCode ? `${dn.of(b.x.countryCode)} (${b.x.countryCode})` : ''} /><KV label="Location" value={b.x.locationCode ?? ''} /><KV label="Branch" value={b.x.branchCode ?? 'XXX (head office)'} />{b.x.testBIC && <Badge color="#F5A524">TEST BIC</Badge>}</div>}
        <p className="text-xs text-muted">This checks the format and country. It cannot confirm the bank exists without an online directory.</p>
      </>}
      {T && mode === 'bulk' && <div className="grid gap-4 lg:grid-cols-[340px_1fr]"><Textarea value={bulk} onChange={(e) => setBulk(e.target.value)} className="min-h-72 font-mono" aria-label="IBANs, one per line" /><div className="space-y-2"><DataTable columns={['Input', 'Status', 'Formatted', 'Country', 'Problem']} rows={rows} className="max-h-96" /><Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob(['input,status,formatted,country,problem\n' + rows.map((x) => x.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }), 'iban-check.csv')}>CSV</Button></div></div>}
    </div>
  )
}
