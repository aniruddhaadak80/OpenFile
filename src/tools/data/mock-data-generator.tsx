import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Download, Shuffle, ArrowUp, ArrowDown } from 'lucide-react'
import { Button, Field, Input, Label, Segmented, Select, Switch, ToolGrid, ErrorNote, CopyButton, useJob } from '@/components/ui'
import { downloadBlob } from '@/lib/files'

const LOCALES: Record<string, { label: string; load: () => Promise<any> }> = {
  en_US: { label: 'English (US)', load: () => import('@faker-js/faker/locale/en_US') },
  en_GB: { label: 'English (UK)', load: () => import('@faker-js/faker/locale/en_GB') },
  en_IN: { label: 'English (India)', load: () => import('@faker-js/faker/locale/en_IN') },
  de: { label: 'German', load: () => import('@faker-js/faker/locale/de') },
  fr: { label: 'French', load: () => import('@faker-js/faker/locale/fr') },
  es: { label: 'Spanish', load: () => import('@faker-js/faker/locale/es') },
  it: { label: 'Italian', load: () => import('@faker-js/faker/locale/it') },
  pt_BR: { label: 'Portuguese (Brazil)', load: () => import('@faker-js/faker/locale/pt_BR') },
  nl: { label: 'Dutch', load: () => import('@faker-js/faker/locale/nl') },
  ja: { label: 'Japanese', load: () => import('@faker-js/faker/locale/ja') },
  zh_CN: { label: 'Chinese (Simplified)', load: () => import('@faker-js/faker/locale/zh_CN') },
  ko: { label: 'Korean', load: () => import('@faker-js/faker/locale/ko') },
  ru: { label: 'Russian', load: () => import('@faker-js/faker/locale/ru') },
}

// type id -> [label, generator]
const TYPES: Record<string, [string, (f: any, i: number) => unknown]> = {
  id: ['Row number', (_f, i) => i + 1],
  uuid: ['UUID', (f) => f.string.uuid()],
  firstName: ['First name', (f) => f.person.firstName()],
  lastName: ['Last name', (f) => f.person.lastName()],
  fullName: ['Full name', (f) => f.person.fullName()],
  email: ['Email', (f) => f.internet.email()],
  username: ['Username', (f) => f.internet.username()],
  password: ['Password', (f) => f.internet.password({ length: 14 })],
  phone: ['Phone', (f) => f.phone.number()],
  street: ['Street address', (f) => f.location.streetAddress()],
  city: ['City', (f) => f.location.city()],
  state: ['State / region', (f) => f.location.state()],
  zip: ['Postal code', (f) => f.location.zipCode()],
  country: ['Country', (f) => f.location.country()],
  lat: ['Latitude', (f) => f.location.latitude()],
  lng: ['Longitude', (f) => f.location.longitude()],
  company: ['Company', (f) => f.company.name()],
  jobTitle: ['Job title', (f) => f.person.jobTitle()],
  product: ['Product name', (f) => f.commerce.productName()],
  price: ['Price', (f) => Number(f.commerce.price({ min: 1, max: 999 }))],
  currency: ['Currency code', (f) => f.finance.currencyCode()],
  iban: ['IBAN', (f) => f.finance.iban()],
  creditCard: ['Card number (test)', (f) => f.finance.creditCardNumber()],
  int: ['Integer 0-1000', (f) => f.number.int({ min: 0, max: 1000 })],
  float: ['Decimal 0-100', (f) => f.number.float({ min: 0, max: 100, fractionDigits: 2 })],
  bool: ['Boolean', (f) => f.datatype.boolean()],
  date: ['Date (past)', (f) => f.date.past({ years: 5 }).toISOString().slice(0, 10)],
  datetime: ['Date and time', (f) => f.date.recent({ days: 90 }).toISOString()],
  birthdate: ['Birth date', (f) => f.date.birthdate().toISOString().slice(0, 10)],
  url: ['URL', (f) => f.internet.url()],
  ip: ['IPv4 address', (f) => f.internet.ipv4()],
  ipv6: ['IPv6 address', (f) => f.internet.ipv6()],
  mac: ['MAC address', (f) => f.internet.mac()],
  userAgent: ['User agent', (f) => f.internet.userAgent()],
  color: ['Hex colour', (f) => f.color.rgb()],
  word: ['Word', (f) => f.lorem.word()],
  sentence: ['Sentence', (f) => f.lorem.sentence()],
  paragraph: ['Paragraph', (f) => f.lorem.paragraph()],
  avatar: ['Avatar URL', (f) => f.image.avatar()],
  status: ['Status (active/pending/closed)', (f) => f.helpers.arrayElement(['active', 'pending', 'closed'])],
}
type Col = { id: string; name: string; type: string; blank: number }
type Fmt = 'json' | 'csv' | 'sql' | 'ndjson' | 'tsv'
let nid = 0
const col = (name: string, type: string): Col => ({ id: String(nid++), name, type, blank: 0 })

const csvCell = (v: unknown, sep: string) => { if (v === null || v === undefined) return ''; const s = String(v); return s.includes(sep) || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s }
const sqlVal = (v: unknown) => v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : `'${String(v).replace(/'/g, "''")}'`

export function serialise(rows: Record<string, unknown>[], cols: string[], fmt: Fmt, table = 'mock_data') {
  if (fmt === 'json') return JSON.stringify(rows, null, 2)
  if (fmt === 'ndjson') return rows.map((r) => JSON.stringify(r)).join('\n')
  if (fmt === 'csv' || fmt === 'tsv') { const sep = fmt === 'csv' ? ',' : '\t'; return [cols.map((c) => csvCell(c, sep)).join(sep), ...rows.map((r) => cols.map((c) => csvCell(r[c], sep)).join(sep))].join('\n') }
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`
  return rows.map((r) => `INSERT INTO ${q(table)} (${cols.map(q).join(', ')}) VALUES (${cols.map((c) => sqlVal(r[c])).join(', ')});`).join('\n')
}

export default function MockDataGenerator() {
  const [cols, setCols] = useState<Col[]>([col('id', 'id'), col('name', 'fullName'), col('email', 'email'), col('city', 'city'), col('signup_date', 'date')])
  const [count, setCount] = useState(100)
  const [locale, setLocale] = useState('en_US')
  const [fmt, setFmt] = useState<Fmt>('json')
  const [seed, setSeed] = useState(42)
  const [useSeed, setUseSeed] = useState(true)
  const [table, setTable] = useState('mock_data')
  const [out, setOut] = useState('')
  const { busy, error, run } = useJob()

  const gen = (n: number) => run(async () => {
    if (!cols.length) throw new Error('Add at least one column.')
    const names = cols.map((c) => c.name.trim())
    if (names.some((x) => !x)) throw new Error('Every column needs a name.')
    if (new Set(names).size !== names.length) throw new Error('Column names must be unique.')
    const { faker } = await LOCALES[locale].load()
    if (useSeed) faker.seed(seed); else faker.seed()
    const rows: Record<string, unknown>[] = []
    for (let i = 0; i < n; i++) { const r: Record<string, unknown> = {}; for (const c of cols) r[c.name] = c.blank && faker.number.int({ min: 1, max: 100 }) <= c.blank ? null : TYPES[c.type][1](faker, i); rows.push(r) }
    return serialise(rows, names, fmt, table)
  })
  const refresh = async () => { const s = await gen(Math.min(count, 20)); if (s !== undefined) setOut(s) }
  useEffect(() => { refresh() }, [cols, locale, fmt, seed, useSeed, table])

  const set = (id: string, p: Partial<Col>) => setCols((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)))
  const move = (i: number, d: number) => setCols((cs) => { const a = [...cs]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a })
  const download = async () => { if (count > 1_000_000) return; const s = await gen(count); if (s !== undefined) downloadBlob(new Blob([s], { type: 'text/plain' }), `${table || 'mock-data'}.${fmt === 'ndjson' ? 'jsonl' : fmt}`) }
  const typeOptions = useMemo(() => Object.entries(TYPES).map(([value, [label]]) => ({ value, label })), [])

  return (
    <ToolGrid
      main={<div className="space-y-4">
        <div className="space-y-2">
          <Label hint={`${cols.length} columns`}>Columns</Label>
          {cols.map((c, i) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2">
              <Input value={c.name} onChange={(e) => set(c.id, { name: e.target.value })} className="h-9 w-40 font-mono text-xs" aria-label="Column name" />
              <Select aria-label="Column type" value={c.type} onChange={(v) => set(c.id, { type: v })} options={typeOptions} className="h-9 min-w-44 flex-1" />
              <label className="flex items-center gap-1 text-[11px] text-muted">Blank %<Input type="number" min={0} max={100} value={c.blank} onChange={(e) => set(c.id, { blank: Math.max(0, Math.min(100, Number(e.target.value))) })} className="h-9 w-16" /></label>
              <button onClick={() => move(i, -1)} aria-label="Move up" className="rounded p-1 text-muted hover:text-fg cursor-pointer"><ArrowUp className="size-4" /></button>
              <button onClick={() => move(i, 1)} aria-label="Move down" className="rounded p-1 text-muted hover:text-fg cursor-pointer"><ArrowDown className="size-4" /></button>
              <button onClick={() => setCols((cs) => cs.filter((x) => x.id !== c.id))} aria-label="Remove column" className="rounded p-1 text-muted hover:text-danger cursor-pointer"><Trash2 className="size-4" /></button>
            </div>
          ))}
          <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={() => setCols((cs) => [...cs, col(`field_${cs.length + 1}`, 'word')])}>Add column</Button>
        </div>
        <div>
          <Label hint={<CopyButton text={out} />}>Preview (first {Math.min(count, 20)} rows)</Label>
          <pre className="max-h-96 overflow-auto rounded-xl border border-border bg-surface-2/50 p-3 font-mono text-xs scrollbar-thin">{out}</pre>
        </div>
      </div>}
      side={<>
        <Field label="Rows"><Input type="number" min={1} max={1000000} value={count} onChange={(e) => setCount(Math.max(1, Math.min(1000000, Number(e.target.value))))} /></Field>
        <Field label="Format"><Segmented value={fmt} onChange={setFmt} options={[{ value: 'json', label: 'JSON' }, { value: 'csv', label: 'CSV' }, { value: 'sql', label: 'SQL' }, { value: 'ndjson', label: 'NDJSON' }, { value: 'tsv', label: 'TSV' }]} /></Field>
        {fmt === 'sql' && <Field label="Table name"><Input value={table} onChange={(e) => setTable(e.target.value)} /></Field>}
        <Field label="Locale"><Select value={locale} onChange={setLocale} options={Object.entries(LOCALES).map(([value, v]) => ({ value, label: v.label }))} /></Field>
        <Switch checked={useSeed} onChange={setUseSeed} label="Repeatable (same seed, same data)" />
        {useSeed && <div className="flex items-end gap-2"><Field label="Seed" className="flex-1"><Input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} /></Field><Button variant="outline" icon={<Shuffle className="size-4" />} onClick={() => setSeed(Math.floor(Math.random() * 1e6))} aria-label="New seed" /></div>}
        <ErrorNote error={error} />
        <Button size="lg" className="w-full" loading={busy} icon={<Download className="size-4" />} onClick={download}>Download {count.toLocaleString()} rows</Button>
        <p className="text-[11px] text-muted">All data is fake and made on your device. Card numbers are test numbers and cannot be charged.</p>
      </>}
    />
  )
}
