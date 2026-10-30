import { useMemo, useState } from 'react'
import { Shuffle } from 'lucide-react'
import { Button, Segmented, Select, Switch, Input, Label, Textarea, CopyButton, Badge } from '@/components/ui'
import { Bar, Pane, CodeArea, DownloadButton, useStored } from '../dev/_b5/shell'
import { splitList, setOp, shuffle, type SetOp } from '@/lib/b5/textops'

const SEPS = [{ value: 'auto', label: 'Auto detect' }, { value: 'newline', label: 'New line' }, { value: ',', label: 'Comma' }, { value: ';', label: 'Semicolon' }, { value: 'tab', label: 'Tab' }, { value: 'space', label: 'Space' }, { value: '|', label: 'Pipe' }]
const OUT_SEPS: Record<string, string> = { newline: '\n', ',': ', ', ';': '; ', tab: '\t', space: ' ', '|': ' | ', ',raw': ',' }

export default function ListTools() {
  const [mode, setMode] = useState<'compare' | 'convert'>('compare')
  const [a, setA] = useStored('b5:list:a', 'apple\nbanana\ncherry\ndate\nelderberry')
  const [b, setB] = useStored('b5:list:b', 'banana\nDate\nfig\ngrape\napple')
  const [op, setOp2] = useState<SetOp>('intersection')
  const [ci, setCi] = useState(true)
  const [trim, setTrim] = useState(true)
  const [sep, setSep] = useState('auto')
  const [outSep, setOutSep] = useState('newline')
  const [wrapL, setWrapL] = useState(''); const [wrapR, setWrapR] = useState('')
  const [prefix, setPrefix] = useState(''); const [suffix, setSuffix] = useState('')
  const [dedupe, setDedupe] = useState(false)
  const [sort, setSort] = useState<'none' | 'az' | 'za' | 'len' | 'num'>('none')
  const [dropEmpty, setDropEmpty] = useState(true)
  const [shuffled, setShuffled] = useState<string[] | null>(null)

  const clean = (s: string) => { let l = splitList(s, sep); if (trim) l = l.map((x) => x.trim()); if (dropEmpty) l = l.filter((x) => x !== ''); return l }
  const LA = useMemo(() => clean(a), [a, sep, trim, dropEmpty]), LB = useMemo(() => clean(b), [b, sep, trim, dropEmpty])
  const result = useMemo(() => {
    let r = mode === 'compare' ? setOp(LA, LB, op, ci) : shuffled ?? LA
    if (mode === 'convert') {
      if (dedupe) { const seen = new Set<string>(); r = r.filter((x) => { const k = ci ? x.toLowerCase() : x; if (seen.has(k)) return false; seen.add(k); return true }) }
      const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: ci ? 'base' : 'variant' })
      if (sort === 'az') r = [...r].sort(coll.compare); if (sort === 'za') r = [...r].sort((x, y) => coll.compare(y, x)); if (sort === 'len') r = [...r].sort((x, y) => x.length - y.length); if (sort === 'num') r = [...r].sort((x, y) => parseFloat(x) - parseFloat(y))
      r = r.map((x) => `${prefix}${wrapL}${x}${wrapR}${suffix}`)
    }
    return r
  }, [mode, LA, LB, op, ci, shuffled, dedupe, sort, prefix, suffix, wrapL, wrapR])
  const out = result.join(mode === 'convert' ? OUT_SEPS[outSep] ?? '\n' : '\n')

  return (
    <div className="space-y-4">
      <Bar>
        <Segmented value={mode} onChange={(m) => { setMode(m); setShuffled(null) }} options={[{ value: 'compare', label: 'Compare two lists' }, { value: 'convert', label: 'Clean and convert' }]} />
        <label className="flex items-center gap-2 text-sm"><span className="text-muted">Split by</span><Select value={sep} onChange={setSep} options={SEPS} className="h-9 w-36" /></label>
        <Switch checked={ci} onChange={setCi} label="Ignore case" /><Switch checked={trim} onChange={setTrim} label="Trim spaces" /><Switch checked={dropEmpty} onChange={setDropEmpty} label="Drop empty" />
      </Bar>
      {mode === 'compare' ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Pane title={<span>List A <Badge>{LA.length}</Badge></span>} className="h-64"><CodeArea value={a} onChange={setA} minRows={10} /></Pane>
            <Pane title={<span>List B <Badge>{LB.length}</Badge></span>} className="h-64"><CodeArea value={b} onChange={setB} minRows={10} /></Pane>
          </div>
          <Segmented value={op} onChange={setOp2} options={[{ value: 'intersection', label: 'In both' }, { value: 'a-b', label: 'Only in A' }, { value: 'b-a', label: 'Only in B' }, { value: 'xor', label: 'In one only' }, { value: 'union', label: 'All (union)' }]} />
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Pane title={<span>List <Badge>{LA.length}</Badge></span>} className="h-80"><CodeArea value={a} onChange={(v) => { setA(v); setShuffled(null) }} minRows={12} /></Pane>
          <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
            <label className="block"><Label>Join with</Label><Select value={outSep} onChange={setOutSep} options={[{ value: 'newline', label: 'New line' }, { value: ',', label: 'Comma and space' }, { value: ',raw', label: 'Comma' }, { value: ';', label: 'Semicolon' }, { value: 'tab', label: 'Tab' }, { value: 'space', label: 'Space' }, { value: '|', label: 'Pipe' }]} /></label>
            <div className="grid grid-cols-2 gap-2"><div><Label>Wrap left</Label><Input aria-label="Wrap left" value={wrapL} onChange={(e) => setWrapL(e.target.value)} placeholder="'" className="font-mono" /></div><div><Label>Wrap right</Label><Input aria-label="Wrap right" value={wrapR} onChange={(e) => setWrapR(e.target.value)} placeholder="'" className="font-mono" /></div></div>
            <div className="grid grid-cols-2 gap-2"><div><Label>Prefix</Label><Input aria-label="Prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} className="font-mono" /></div><div><Label>Suffix</Label><Input aria-label="Suffix" value={suffix} onChange={(e) => setSuffix(e.target.value)} className="font-mono" /></div></div>
            <label className="block"><Label>Sort</Label><Select value={sort} onChange={setSort} options={[{ value: 'none', label: 'Keep order' }, { value: 'az', label: 'A to Z' }, { value: 'za', label: 'Z to A' }, { value: 'len', label: 'By length' }, { value: 'num', label: 'By number' }]} /></label>
            <Switch checked={dedupe} onChange={setDedupe} label="Remove duplicates" />
            <div className="flex flex-wrap gap-1.5"><Button size="sm" variant="outline" icon={<Shuffle className="size-4" />} onClick={() => setShuffled(shuffle(LA))}>Shuffle</Button><Button size="sm" variant="ghost" onClick={() => { setWrapL("'"); setWrapR("'"); setOutSep(',') }}>SQL IN list</Button><Button size="sm" variant="ghost" onClick={() => { setWrapL('"'); setWrapR('"'); setOutSep(',') }}>JSON array items</Button></div>
          </div>
        </div>
      )}
      <Pane title={<span>Result <Badge color="#14B8A6">{result.length}</Badge></span>} actions={<><CopyButton text={out} variant="ghost" /><DownloadButton text={out} filename="list.txt" /></>}>
        <Textarea readOnly value={out} className="min-h-40 rounded-none border-0 bg-transparent" aria-label="Result" />
      </Pane>
    </div>
  )
}
