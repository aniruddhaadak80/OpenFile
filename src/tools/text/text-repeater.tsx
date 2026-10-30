import { useMemo, useState } from 'react'
import { Repeat } from 'lucide-react'
import { Field, Input, Select, Switch, ToolGrid, CopyButton, Textarea, Label, Slider } from '@/components/ui'
import { repeatText } from '@/lib/b14/text'
import { DlButton } from '@/lib/bcat/kit'

const SEPS = [{ value: '\n', label: 'New line' }, { value: ' ', label: 'Space' }, { value: '', label: 'Nothing' }, { value: ', ', label: 'Comma' }, { value: '\n\n', label: 'Blank line' }, { value: 'custom', label: 'Custom' }]
const MAX = 5_000_000

export default function TextRepeater() {
  const [text, setText] = useState('Hello 👋')
  const [count, setCount] = useState(10)
  const [sep, setSep] = useState('\n')
  const [custom, setCustom] = useState(' | ')
  const [numbered, setNumbered] = useState(false)
  const s = sep === 'custom' ? custom.replace(/\\n/g, '\n').replace(/\\t/g, '\t') : sep
  const tooBig = (text.length + s.length) * count > MAX
  const out = useMemo(() => (tooBig ? '' : repeatText(text, { count, sep: s, numbered })), [text, count, s, numbered, tooBig])
  return (
    <ToolGrid
      main={<>
        <Label>Text to repeat</Label>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-24 text-sm" aria-label="Text to repeat" />
        <div className="flex items-center justify-between"><Label hint={`${out.length.toLocaleString()} characters`}>Result</Label><div className="flex gap-2"><CopyButton text={out} /><DlButton name="repeated.txt" data={() => out}>Download</DlButton></div></div>
        {tooBig ? <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">That would be more than 5 million characters. Lower the count.</p>
          : <pre className="scrollbar-thin max-h-[420px] min-h-32 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-surface p-3 text-sm">{out.length > 200000 ? out.slice(0, 200000) + '\n...' : out}</pre>}
      </>}
      side={<>
        <Field label="How many times"><Input type="number" min={1} max={100000} value={count} onChange={(e) => setCount(Math.min(100000, Math.max(1, Math.round(+e.target.value || 1))))} /></Field>
        <Slider ariaLabel="Count" value={Math.min(count, 1000)} onChange={setCount} min={1} max={1000} />
        <Field label="Between each copy"><Select value={sep} onChange={setSep} options={SEPS} /></Field>
        {sep === 'custom' && <Field label="Custom separator" hint="\n for a new line"><Input value={custom} onChange={(e) => setCustom(e.target.value)} /></Field>}
        <Switch checked={numbered} onChange={setNumbered} label="Number each copy (1. 2. 3.)" />
        <p className="flex gap-1.5 text-xs text-muted"><Repeat className="size-4 shrink-0" />Write {'{n}'} in your text to insert the copy number, for example Item {'{n}'}.</p>
      </>}
    />
  )
}
