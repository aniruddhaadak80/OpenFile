import { useMemo, useState } from 'react'
import { Input, Segmented, Switch, Slider, Textarea, CopyButton, Label } from '@/components/ui'
import { Bar } from '../dev/_b5/shell'
import { slugify } from '@/lib/b5/textops'

export default function SlugGenerator() {
  const [text, setText] = useState('10 Tips for Café Owners: Über Coffee & Croissants in 2026.')
  const [bulk, setBulk] = useState(false)
  const [sep, setSep] = useState<'-' | '_' | '.'>('-')
  const [lower, setLower] = useState(true)
  const [translit, setTranslit] = useState(true)
  const [stop, setStop] = useState(false)
  const [max, setMax] = useState(0)
  const o = { sep, lower, translit, stop, max }
  const out = useMemo(() => bulk ? text.split('\n').map((l) => (l.trim() ? slugify(l, o) : '')).join('\n') : slugify(text, o), [text, bulk, sep, lower, translit, stop, max])
  return (
    <div className="space-y-4">
      <Bar>
        <Segmented value={bulk ? 'bulk' : 'one'} onChange={(v) => setBulk(v === 'bulk')} options={[{ value: 'one', label: 'One title' }, { value: 'bulk', label: 'One per line' }]} />
        <Segmented value={sep} onChange={setSep} options={[{ value: '-', label: 'dash-case' }, { value: '_', label: 'under_score' }, { value: '.', label: 'dot.case' }]} />
        <Switch checked={lower} onChange={setLower} label="Lower case" />
        <Switch checked={translit} onChange={setTranslit} label="Transliterate (ü → ue, Ж → zh)" />
        <Switch checked={stop} onChange={setStop} label="Drop small words (a, the, of)" />
        <Slider label={`Max length${max ? '' : ' (off)'}`} value={max} onChange={setMax} min={0} max={120} className="w-44" />
      </Bar>
      {bulk ? <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-48 font-sans text-sm" placeholder="One title per line" aria-label="Titles" /> : <Input value={text} onChange={(e) => setText(e.target.value)} className="h-12 text-lg" placeholder="Type a title" aria-label="Title" />}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <Label hint={<CopyButton text={out} variant="ghost" />}>Slug</Label>
        {bulk ? <pre className="whitespace-pre-wrap break-all font-mono text-[15px] leading-7 text-accent">{out}</pre> : <div className="break-all font-mono text-2xl text-accent">{out || <span className="text-muted">…</span>}</div>}
        {!bulk && out && <div className="mt-2 text-xs text-muted">{out.length} characters · https://example.com/blog/<span className="text-fg">{out}</span></div>}
      </div>
    </div>
  )
}
