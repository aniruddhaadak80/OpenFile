import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button, Card, Input, Label, Segmented, Select, Slider, Switch, Progress, ErrorNote, useJob } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { writeBook } from '@/lib/bcat/sheets'
import { fakeFromHash, generalize, guessColumn, initialsOf, maskValue, sha256Hex, shiftDate, type AnonMode } from '@/lib/cf/priv'
import { str, type Rows } from '@/lib/cf/sheet'
import { useSheet, SheetDrop, SheetPicker, FileBar, RowsTable } from '@/lib/cf/ui'

const MODES: { value: AnonMode; label: string }[] = [{ value: 'keep', label: 'Keep' }, { value: 'drop', label: 'Remove column' }, { value: 'hash', label: 'Hash (same in, same out)' }, { value: 'fake', label: 'Fake but consistent' }, { value: 'mask', label: 'Mask (j***@m***.com)' }, { value: 'initials', label: 'Initials only' }, { value: 'shift-date', label: 'Shift dates' }, { value: 'generalize', label: 'Group into ranges' }, { value: 'round', label: 'Round numbers' }]

export default function CsvAnonymizer() {
  const s = useSheet()
  const [modes, setModes] = useState<AnonMode[]>([])
  const [kinds, setKinds] = useState<string[]>([])
  const [salt, setSalt] = useState(() => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join(''))
  const [shift, setShift] = useState(-37), [band, setBand] = useState(10), [hashLen, setHashLen] = useState(12), [keyFile, setKeyFile] = useState(false)
  const [fmt, setFmt] = useState<'csv' | 'xlsx'>('csv')
  const [out, setOut] = useState<Rows | null>(null), [key, setKey] = useState<Rows | null>(null)
  const job = useJob()
  useEffect(() => { if (!s.rows.length) return; const head = s.rows[0].map((h) => str(h)); const g = head.map((h, i) => guessColumn(h, s.rows.slice(1, 60).map((r) => str(r[i] ?? null)))); setModes(g.map((x) => x.suggest)); setKinds(g.map((x) => x.kind)); setOut(null) }, [s.rows])
  const run = () => job.run(async (setP) => {
    const head = s.rows[0], body = s.rows.slice(1), keep = modes.map((m) => m !== 'drop')
    const outRows: Rows = [head.filter((_, i) => keep[i] !== false)], keyRows: Rows = [['Column', 'Original', 'Replaced with']]
    const cache = new Map<string, string>()
    for (let r = 0; r < body.length; r++) {
      const row: Rows[number] = []
      for (let c = 0; c < head.length; c++) {
        const m = modes[c] ?? 'keep', v = body[r][c] ?? null, sv = str(v)
        if (m === 'drop') continue
        if (m === 'keep' || sv === '') { row.push(v); continue }
        let nv: string | number = sv
        if (m === 'hash' || m === 'fake') {
          const ck = c + '|' + sv; let h = cache.get(ck)
          if (!h) { h = await sha256Hex(sv.trim().toLowerCase(), salt); cache.set(ck, h) }
          nv = m === 'hash' ? h.slice(0, hashLen) : fakeFromHash(h, (['name', 'email', 'phone', 'id'].includes(kinds[c]) ? kinds[c] : 'text') as 'name')
        }
        else if (m === 'mask') nv = maskValue(sv)
        else if (m === 'initials') nv = initialsOf(sv)
        else if (m === 'shift-date') nv = shiftDate(sv, shift)
        else if (m === 'generalize') nv = generalize(sv, band)
        else if (m === 'round') { const n = parseFloat(sv); nv = isFinite(n) ? Math.round(n / band) * band : sv }
        if (keyFile && nv !== sv && keyRows.length < 200000) keyRows.push([str(head[c]), sv, nv])
        row.push(nv)
      }
      outRows.push(row)
      if (r % 500 === 0) setP(r / body.length)
    }
    setOut(outRows); setKey(keyFile ? keyRows : null); setP(1)
  })
  const preview = useMemo(() => out ?? s.rows, [out, s.rows])
  if (!s.file) return <SheetDrop s={s} label="Drop a CSV or spreadsheet with personal data" sub="Replace names, emails, phones and IDs with safe stand-ins, shift dates and group ages, so you can share or test with real-looking data." />
  const head = s.rows[0] ?? []
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-3">
        <FileBar name={s.file.name} size={s.file.size} onReset={s.reset} />
        <RowsTable rows={preview} />
        {job.busy && <Progress value={job.progress} label="Anonymising" />}
        <ErrorNote error={job.error} />
        {out && <div className="flex flex-wrap gap-2">
          <Button onClick={async () => downloadBlob(await writeBook([{ name: 'Anonymised', rows: out }], fmt), `${s.book!.name}-anonymised.${fmt}`)}>Download anonymised file</Button>
          {key && <Button variant="outline" onClick={async () => downloadBlob(await writeBook([{ name: 'Key', rows: key }], 'csv'), `${s.book!.name}-KEY-keep-private.csv`)}>Download the re-identification key</Button>}
        </div>}
      </div>
      <Card className="space-y-3 self-start">
        <SheetPicker s={s} />
        <Label>What to do with each column</Label>
        <div className="max-h-80 space-y-2 overflow-auto pr-1">{head.map((h, i) => <div key={i} className="grid grid-cols-[1fr_11rem] items-center gap-2"><span className="truncate text-sm" title={str(h)}>{str(h) || `Column ${i + 1}`}<span className="block text-[10px] uppercase text-muted">{kinds[i]}</span></span><Select className="h-9 text-xs" value={modes[i] ?? 'keep'} onChange={(v) => { setModes((m) => m.map((x, k) => (k === i ? v : x))); setOut(null) }} options={MODES} /></div>)}</div>
        <Slider label="Shift dates by" value={shift} onChange={setShift} min={-365} max={365} suffix=" days" />
        <Slider label="Range or rounding size" value={band} onChange={setBand} min={1} max={1000} />
        <Slider label="Hash length" value={hashLen} onChange={setHashLen} min={8} max={64} />
        <div><Label>Secret salt (same salt gives the same results across files)</Label><Input value={salt} onChange={(e) => setSalt(e.target.value)} className="font-mono text-xs" /></div>
        <Switch checked={keyFile} onChange={setKeyFile} label="Also make a key to undo it (keep it private)" />
        <div><Label>Save as</Label><Segmented value={fmt} onChange={setFmt} options={[{ value: 'csv', label: 'CSV' }, { value: 'xlsx', label: 'XLSX' }]} /></div>
        <Button className="w-full" icon={<ShieldCheck className="size-4" />} loading={job.busy} onClick={run}>Anonymise</Button>
      </Card>
    </div>
  )
}
