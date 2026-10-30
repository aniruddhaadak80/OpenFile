import { useMemo, useState } from 'react'
import { Columns3 } from 'lucide-react'
import { Field, Input, Select, Switch, ToolGrid, CopyButton, Textarea, Label, cn } from '@/components/ui'
import { extractColumns, guessDelimiter, splitRow, parseColumns, type Delim } from '@/lib/b14/text'
import { OpenButton } from '@/lib/b14/ui'
import { DlButton } from '@/lib/bcat/kit'
import { readTextFile } from '@/tools/dev/_dev/kit'

const SAMPLE = 'name,email,city,plan\nAsha Rao,asha@example.com,Pune,Pro\nLeo Park,leo@example.com,"Busan, KR",Free\nMia Chen,mia@example.com,Taipei,Pro'
const DELIMS = [{ value: 'auto', label: 'Detect' }, { value: ',', label: 'Comma ,' }, { value: '\t', label: 'Tab' }, { value: ';', label: 'Semicolon ;' }, { value: '|', label: 'Pipe |' }, { value: 'ws', label: 'Spaces' }, { value: 'custom', label: 'Custom' }]
const OUTS = [{ value: ',', label: 'Comma' }, { value: '\t', label: 'Tab' }, { value: ';', label: 'Semicolon' }, { value: ' ', label: 'Space' }, { value: ' | ', label: 'Pipe' }, { value: '\n', label: 'New line (one value per line)' }]

export default function ColumnExtractor() {
  const [text, setText] = useState(SAMPLE)
  const [d, setD] = useState('auto')
  const [custom, setCustom] = useState(':')
  const [cols, setCols] = useState('1,2')
  const [out, setOut] = useState(',')
  const [skip, setSkip] = useState(false)
  const [trim, setTrim] = useState(true)
  const [unique, setUnique] = useState(false)
  const delim: Delim = d === 'auto' ? guessDelimiter(text) : d === 'custom' ? custom || ',' : d
  const res = useMemo(() => extractColumns(text, { delim, cols, outDelim: out, skipHeader: skip, trim, unique }), [text, delim, cols, out, skip, trim, unique])
  const head = useMemo(() => text.split(/\r?\n/).filter(Boolean).slice(0, 6).map((l) => splitRow(l, delim)), [text, delim])
  const chosen = new Set(parseColumns(cols, res.width))
  const toggle = (i: number) => { const s = new Set(chosen); s.has(i) ? s.delete(i) : s.add(i); setCols([...s].sort((a, b) => a - b).map((x) => x + 1).join(',')) }
  return (
    <ToolGrid
      main={<>
        <div className="flex items-center justify-between"><Label>Text with columns (CSV, TSV, logs)</Label><OpenButton accept=".csv,.tsv,.txt,.log,.dat" onFiles={async (f) => { const t = await readTextFile(f[0]); if (t != null) setText(t) }} /></div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-40 font-mono text-xs" aria-label="Input text" />
        {head.length > 0 && <div className="scrollbar-thin overflow-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs"><thead className="bg-surface-2"><tr>{Array.from({ length: res.width }, (_, i) => <th key={i} className="px-2 py-1.5"><button type="button" aria-pressed={chosen.has(i)} onClick={() => toggle(i)} className={cn('cursor-pointer rounded-md border px-2 py-0.5 font-mono', chosen.has(i) ? 'border-accent bg-accent/15' : 'border-border text-muted')}>{i + 1}</button></th>)}</tr></thead>
            <tbody>{head.map((r, i) => <tr key={i} className="border-t border-border/60">{Array.from({ length: res.width }, (_, j) => <td key={j} className={cn('max-w-48 truncate px-2 py-1 font-mono', chosen.has(j) && 'bg-accent/5')}>{r[j] ?? ''}</td>)}</tr>)}</tbody></table>
        </div>}
        <div className="flex items-center justify-between"><Label hint={`${res.rows} rows`}>Result</Label><div className="flex gap-2"><CopyButton text={res.text} /><DlButton name={out === '\t' ? 'columns.tsv' : 'columns.csv'} data={() => res.text}>Download</DlButton></div></div>
        <pre className="scrollbar-thin max-h-72 min-h-20 overflow-auto rounded-xl border border-border bg-surface p-3 font-mono text-xs">{res.text}</pre>
      </>}
      side={<>
        <Field label="Columns" hint="like 1,3-5 or -1 for the last"><Input value={cols} onChange={(e) => setCols(e.target.value)} className="font-mono" /></Field>
        <p className="text-xs text-muted">Click column numbers in the preview to pick them. The order you type is the order you get, so 3,1 swaps columns.</p>
        <Field label="Input delimiter"><Select value={d} onChange={setD} options={DELIMS} /></Field>
        {d === 'custom' && <Field label="Custom delimiter"><Input value={custom} onChange={(e) => setCustom(e.target.value)} /></Field>}
        <Field label="Output separator"><Select value={out} onChange={setOut} options={OUTS} /></Field>
        <Switch checked={skip} onChange={setSkip} label="Skip the first row (header)" />
        <Switch checked={trim} onChange={setTrim} label="Trim spaces in cells" />
        <Switch checked={unique} onChange={setUnique} label="Remove duplicate rows" />
        <p className="flex gap-1.5 text-xs text-muted"><Columns3 className="size-4 shrink-0" />Quoted values with commas inside stay in one column.</p>
      </>}
    />
  )
}
