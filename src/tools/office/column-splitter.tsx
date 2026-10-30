import { useEffect, useMemo, useState } from 'react'
import { Columns3 } from 'lucide-react'
import { Button, Card, Input, Label, Segmented, Select, Switch, Field } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { writeBook } from '@/lib/bcat/sheets'
import { str, type Rows } from '@/lib/cf/sheet'
import { useSheet, SheetDrop, SheetPicker, FileBar, RowsTable, useColOptions } from '@/lib/cf/ui'

const PRE = /^(mr|mrs|ms|miss|dr|prof|sir|shri|smt)\.?$/i
function splitName(v: string) { const p = v.trim().split(/\s+/).filter((x) => !PRE.test(x)); if (p.length <= 1) return [p[0] ?? '', '', '']; if (p.length === 2) return [p[0], '', p[1]]; return [p[0], p.slice(1, -1).join(' '), p[p.length - 1]] }

export default function ColumnSplitter() {
  const s = useSheet()
  const [mode, setMode] = useState<'split' | 'combine'>('split')
  const [col, setCol] = useState('0'), [how, setHow] = useState<'delim' | 'name' | 'fixed' | 'email'>('delim'), [delim, setDelim] = useState(','), [width, setWidth] = useState('3,3'), [max, setMax] = useState('0'), [keep, setKeep] = useState(true)
  const [combine, setCombine] = useState<string[]>([]), [sep, setSep] = useState(' '), [newName, setNewName] = useState('Combined'), [skipBlank, setSkipBlank] = useState(true)
  const [fmt, setFmt] = useState<'xlsx' | 'csv'>('xlsx')
  // Save in the same kind of file that was opened: a CSV in gives a CSV out unless the user picks another format.
  useEffect(() => { const n = s.file?.name.toLowerCase() ?? ''; if (n) setFmt(/\.(csv|tsv|txt)$/.test(n) ? 'csv' : 'xlsx') }, [s.file])
  const opts = useColOptions(s.rows, true)
  const out = useMemo((): Rows => {
    if (!s.rows.length) return []
    const head = s.rows[0], body = s.rows.slice(1), c = +col
    if (mode === 'combine') {
      const cs = combine.map(Number); if (!cs.length) return s.rows
      return [[...head, newName], ...body.map((r) => [...r, cs.map((i) => str(r[i] ?? null)).filter((x) => !skipBlank || x.trim()).join(sep.replace(/\\n/g, '\n'))])]
    }
    let parts = body.map((r): string[] => {
      const v = str(r[c] ?? null)
      if (how === 'name') return splitName(v)
      if (how === 'email') { const [u, d] = v.split('@'); return [u ?? '', d ?? ''] }
      if (how === 'fixed') { const ws = width.split(/[,\s]+/).map(Number).filter((x) => x > 0); const res: string[] = []; let i = 0; for (const w of ws) { res.push(v.slice(i, i + w)); i += w } if (i < v.length) res.push(v.slice(i)); return res }
      const d = delim === '\\t' ? '\t' : delim
      const n = +max; const all = d ? v.split(d).map((x) => x.trim()) : [v]
      return n > 0 && all.length > n ? [...all.slice(0, n - 1), all.slice(n - 1).join(d)] : all
    })
    const w = Math.max(1, ...parts.map((p) => p.length))
    parts = parts.map((p) => [...p, ...Array(w - p.length).fill('')])
    const names = how === 'name' ? ['First name', 'Middle name', 'Last name'] : how === 'email' ? ['User', 'Domain'] : Array.from({ length: w }, (_, i) => `${str(head[c] ?? null) || 'Part'} ${i + 1}`)
    return [[...head.filter((_, i) => keep || i !== c), ...names], ...body.map((r, i) => [...r.filter((_, k) => keep || k !== c), ...parts[i]])]
  }, [s.rows, mode, col, how, delim, width, max, keep, combine, sep, newName, skipBlank])
  if (!s.file) return <SheetDrop s={s} label="Drop a spreadsheet to split or combine columns" sub="Split full names, addresses or codes into columns, or join several columns into one." />
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-3"><FileBar name={s.file.name} size={s.file.size} onReset={s.reset} /><RowsTable rows={out} /></div>
      <Card className="space-y-4 self-start">
        <SheetPicker s={s} />
        <Segmented value={mode} onChange={setMode} options={[{ value: 'split', label: 'Split a column' }, { value: 'combine', label: 'Combine columns' }]} />
        {mode === 'split' ? <>
          <Field label="Column"><Select value={col} onChange={setCol} options={opts} /></Field>
          <Field label="Split"><Select value={how} onChange={setHow} options={[{ value: 'delim', label: 'At a separator' }, { value: 'name', label: 'Full name into first, middle, last' }, { value: 'email', label: 'Email into user and domain' }, { value: 'fixed', label: 'By fixed widths' }]} /></Field>
          {how === 'delim' && <div className="grid grid-cols-2 gap-2"><Field label="Separator"><Input value={delim} onChange={(e) => setDelim(e.target.value)} placeholder=", or ; or \t" /></Field><Field label="Max columns"><Input value={max} onChange={(e) => setMax(e.target.value)} placeholder="0 = all" /></Field></div>}
          {how === 'fixed' && <Field label="Widths (characters)"><Input value={width} onChange={(e) => setWidth(e.target.value)} placeholder="3, 3, 4" /></Field>}
          <Switch checked={keep} onChange={setKeep} label="Keep the original column" />
        </> : <>
          <div><Label>Columns to join, in order</Label><div className="flex max-h-40 flex-wrap gap-1.5 overflow-auto">{opts.map((o) => <button key={o.value} aria-pressed={combine.includes(o.value)} onClick={() => setCombine((x) => x.includes(o.value) ? x.filter((y) => y !== o.value) : [...x, o.value])} className={`rounded-full border px-2.5 py-1 text-xs cursor-pointer ${combine.includes(o.value) ? 'border-accent text-fg' : 'border-border text-muted'}`}>{combine.includes(o.value) ? `${combine.indexOf(o.value) + 1}. ` : ''}{o.label}</button>)}</div></div>
          <div className="grid grid-cols-2 gap-2"><Field label="Joiner"><Input value={sep} onChange={(e) => setSep(e.target.value)} /></Field><Field label="New column"><Input value={newName} onChange={(e) => setNewName(e.target.value)} /></Field></div>
          <Switch checked={skipBlank} onChange={setSkipBlank} label="Skip empty cells" />
        </>}
        <div><Label>Save as</Label><Segmented value={fmt} onChange={setFmt} options={[{ value: 'xlsx', label: 'XLSX' }, { value: 'csv', label: 'CSV' }]} /></div>
        <Button className="w-full" icon={<Columns3 className="size-4" />} onClick={async () => downloadBlob(await writeBook([{ name: s.book!.sheets[s.sheet].name, rows: out }], fmt), `${s.book!.name}-columns.${fmt}`)}>Download</Button>
      </Card>
    </div>
  )
}
