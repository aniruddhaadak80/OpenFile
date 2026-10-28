import { useMemo, useState } from 'react'
import { Search, Download } from 'lucide-react'
import { Input, Segmented, Select, Textarea, Badge, Button } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { Bar, Status, KV, DataTable, useLib } from './_b5/shell'

const TYPES: Record<string, string> = { MOBILE: 'Mobile', FIXED_LINE: 'Landline', FIXED_LINE_OR_MOBILE: 'Landline or mobile', TOLL_FREE: 'Toll free', PREMIUM_RATE: 'Premium rate', SHARED_COST: 'Shared cost', VOIP: 'VoIP', PERSONAL_NUMBER: 'Personal', PAGER: 'Pager', UAN: 'UAN', VOICEMAIL: 'Voicemail' }
const guessCountry = () => { const l = (navigator.language || 'en-US').split('-')[1]; return l && l.length === 2 ? l.toUpperCase() : 'US' }

export default function PhoneParser() {
  const lib = useLib('libphonenumber-js/max', () => import('libphonenumber-js/max'))
  const [mode, setMode] = useState<'one' | 'bulk' | 'find'>('one')
  const [num, setNum] = useState('+91 70291 55691')
  const [country, setCountry] = useState(guessCountry())
  const [bulk, setBulk] = useState('+1 415 555 2671\n020 7946 0958\n+49 30 901820\n(212) 555-0199')
  const [text, setText] = useState('Call our London office on 020 7946 0958 or the US line +1 (415) 555-2671. WhatsApp +91 98765 43210.')
  const countries = useMemo(() => {
    if (!lib) return [] as { value: string; label: string }[]
    const dn = new Intl.DisplayNames([navigator.language || 'en'], { type: 'region' })
    return lib.getCountries().map((c) => ({ value: c, label: `${dn.of(c) ?? c} (+${lib.getCountryCallingCode(c)})` })).sort((a, b) => a.label.localeCompare(b.label))
  }, [lib])
  const p = useMemo(() => { if (!lib || !num.trim()) return null; try { return lib.parsePhoneNumberWithError(num, country as any) } catch (e: any) { return { err: e.message as string } } }, [lib, num, country])
  const rows = useMemo(() => lib ? bulk.split(/\r?\n/).filter((l) => l.trim()).map((l) => { const x = lib.parsePhoneNumberFromString(l, country as any); return [l.trim(), x?.isValid() ? 'valid' : x?.isPossible() ? 'possible' : 'invalid', x?.number ?? '', x?.formatInternational() ?? '', x?.country ?? '', x ? TYPES[x.getType() ?? ''] ?? '' : ''] }) : [], [lib, bulk, country])
  const found = useMemo(() => lib ? lib.findPhoneNumbersInText(text, country as any).map((f) => [f.number.number, f.number.formatInternational(), f.number.country ?? '', TYPES[f.number.getType() ?? ''] ?? '', text.slice(f.startsAt, f.endsAt)]) : [], [lib, text, country])
  const dn = useMemo(() => new Intl.DisplayNames([navigator.language || 'en'], { type: 'region' }), [])

  return (
    <div className="space-y-4">
      <Bar>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'one', label: 'Parse a number' }, { value: 'bulk', label: 'Bulk validate' }, { value: 'find', label: 'Find in text' }]} />
        <span className="text-xs text-muted">Default country for numbers without +</span>
        <Select value={country} onChange={setCountry} options={countries.length ? countries : [{ value: country, label: country }]} className="w-64" />
      </Bar>
      {!lib && <Status kind="info">Loading phone metadata…</Status>}
      {lib && mode === 'one' && <>
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-4 size-4 text-muted" /><Input value={num} onChange={(e) => setNum(e.target.value)} className="h-12 pl-9 font-mono text-lg" placeholder="+44 20 7946 0958" aria-label="Phone number" inputMode="tel" /></div>
        {p && 'err' in p ? <Status kind="err">{({ INVALID_COUNTRY: 'Unknown country. Add a + and the country code, or pick a default country.', NOT_A_NUMBER: 'That does not look like a phone number.', TOO_SHORT: 'Too short.', TOO_LONG: 'Too long.', INVALID_LENGTH: 'The length is not valid.' } as Record<string, string>)[p.err] ?? p.err}</Status> : p && <>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-5">
            <span className="font-mono text-2xl font-semibold">{p.formatInternational()}</span>
            {p.isValid() ? <Badge color="#10B981">VALID</Badge> : p.isPossible() ? <Badge color="#F5A524">POSSIBLE, NOT VALID</Badge> : <Badge color="#EF4444">INVALID</Badge>}
            {p.getType() && <Badge color="#38BDF8">{(TYPES[p.getType()!] ?? p.getType()!).toUpperCase()}</Badge>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <KV label="E.164" value={p.number} /><KV label="International" value={p.formatInternational()} /><KV label="National" value={p.formatNational()} />
            <KV label="RFC 3966 (tel: link)" value={p.getURI()} /><KV label="Country" value={p.country ? `${dn.of(p.country)} (${p.country})` : ''} /><KV label="Calling code" value={'+' + p.countryCallingCode} />
            <KV label="National number" value={p.nationalNumber} /><KV label="WhatsApp link" value={`https://wa.me/${p.number.replace('+', '')}`} />{p.ext && <KV label="Extension" value={p.ext} />}
          </div>
        </>}
      </>}
      {lib && mode === 'bulk' && <div className="grid gap-4 lg:grid-cols-[320px_1fr]"><Textarea value={bulk} onChange={(e) => setBulk(e.target.value)} className="min-h-72" placeholder="One number per line" aria-label="Numbers" /><div className="space-y-2"><DataTable columns={['Input', 'Status', 'E.164', 'International', 'Country', 'Type']} rows={rows} className="max-h-96" /><Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob(['input,status,e164,international,country,type\n' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }), 'phone-numbers.csv')}>CSV</Button></div></div>}
      {lib && mode === 'find' && <div className="space-y-3"><Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-32 font-sans text-sm" aria-label="Text to search" />{found.length ? <DataTable columns={['E.164', 'International', 'Country', 'Type', 'As written']} rows={found} /> : <Status kind="info">No phone numbers found.</Status>}</div>}
    </div>
  )
}
