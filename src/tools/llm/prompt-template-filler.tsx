import { useMemo, useState } from 'react'
import { Input, Label, Select, Textarea, ToolGrid, Dropzone, Segmented, Switch } from '@/components/ui'
import { OutBox } from '@/lib/cf/ui'
import { findVars, fillTemplate, detectStyle, estimateTokens, type VarStyle } from '@/lib/r15/llm'
import { Panel, fmtNum } from '@/lib/r15/ui'
import { DlButton } from '@/lib/bcat/kit'

const SAMPLE = `You are an assistant for {{company}}. Reply in a {{tone|friendly}} tone, in {{language|English}}.

Customer name: {{name}}
Order: {{order_id}}

Write a short reply to this message:
"""
{{message}}
"""`
const SAMPLE_VALS: Record<string, string> = { company: 'Green Leaf Plants', name: 'Priya', order_id: 'GL-20931', message: 'My monstera arrived with two broken leaves. Can I get a replacement?' }

export default function PromptTemplateFiller() {
  const [tpl, setTpl] = useState(SAMPLE), [style, setStyle] = useState<VarStyle | 'auto'>('auto')
  const [vals, setVals] = useState<Record<string, string>>(SAMPLE_VALS), [keep, setKeep] = useState(true)
  const [rows, setRows] = useState<string[][] | null>(null), [mode, setMode] = useState<'one' | 'batch'>('one'), [shape, setShape] = useState<'text' | 'chat'>('chat'), [system, setSystem] = useState('')
  const st: VarStyle = style === 'auto' ? detectStyle(tpl) : style
  const vars = useMemo(() => findVars(tpl, st), [tpl, st])
  const filled = fillTemplate(tpl, vals, st, keep)
  const missing = vars.filter((v) => !vals[v.name] && !v.def).map((v) => v.name)
  const batch = useMemo(() => {
    if (!rows || rows.length < 2) return []
    const head = rows[0].map((h) => h.trim())
    return rows.slice(1).map((r) => { const v: Record<string, string> = {}; head.forEach((h, i) => (v[h] = r[i] ?? '')); return fillTemplate(tpl, v, st, keep) })
  }, [rows, tpl, st, keep])
  const unmatched = rows ? vars.filter((v) => !rows[0].map((h) => h.trim()).includes(v.name) && !v.def).map((v) => v.name) : []
  const asLine = (p: string) => JSON.stringify(shape === 'chat' ? { messages: [...(system.trim() ? [{ role: 'system', content: system.trim() }] : []), { role: 'user', content: p }] } : { prompt: p })
  const code = `const template = ${JSON.stringify(tpl)}\nconst fill = (vars) => template.replace(/\\{\\{\\s*(\\w[\\w.-]*)\\s*(?:\\|\\s*([^}]*?)\\s*)?\\}\\}/g, (m, k, d) => vars[k] ?? d ?? m)\nconst prompt = fill(${JSON.stringify(vals, null, 2)})`
  return (
    <ToolGrid
      main={<>
        <div><Label hint="Use {{name}}, {{name|default}}, {name} or ${name}">Template</Label><Textarea aria-label="Template" value={tpl} onChange={(e) => setTpl(e.target.value)} className="min-h-44 font-mono text-[13px]" spellCheck={false} /></div>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'one', label: 'Fill one' }, { value: 'batch', label: 'Fill from a CSV' }]} />
        {mode === 'one' ? <>
          {vars.length ? <Panel title="Variables" hint={`${vars.length} found`}><div className="grid gap-3 sm:grid-cols-2">{vars.map((v) => <div key={v.name}><Label hint={v.def ? `default: ${v.def}` : undefined}>{v.name}</Label>{(vals[v.name] ?? '').length > 60 || v.name === 'message' ? <Textarea aria-label={v.name} value={vals[v.name] ?? ''} onChange={(e) => setVals({ ...vals, [v.name]: e.target.value })} className="min-h-20 text-sm" /> : <Input aria-label={v.name} value={vals[v.name] ?? ''} placeholder={v.def} onChange={(e) => setVals({ ...vals, [v.name]: e.target.value })} />}</div>)}</div></Panel>
            : <p className="text-sm text-muted">No variables found. Wrap names in double braces, like {'{{name}}'}.</p>}
          <OutBox title={<>Filled prompt <span className="font-normal text-muted">about {fmtNum(estimateTokens(filled))} tokens{missing.length ? `, ${missing.length} left empty: ${missing.join(', ')}` : ''}</span></>} text={filled} filename="prompt.txt" />
          <details className="rounded-xl border border-border p-3 text-sm"><summary className="cursor-pointer font-medium">JavaScript snippet</summary><OutBox className="mt-2" text={code} filename="fill-prompt.js" mime="text/javascript" /></details>
        </> : <>
          <Dropzone compact accept=".csv,.tsv" onFiles={async (f) => { if (!f[0]) return; const Papa = (await import('papaparse')).default; setRows(Papa.parse<string[]>(await f[0].text(), { skipEmptyLines: true }).data) }} label="Drop a CSV whose column names match the variables" sub="One prompt is made for each row. Read on your device." />
          {rows && <p className="text-sm">{fmtNum(batch.length)} prompts. {unmatched.length ? <span className="text-warn">No column for: {unmatched.join(', ')}</span> : <span className="text-success">Every variable has a column.</span>}</p>}
          {batch.length > 0 && <Panel title="First prompts"><ol className="max-h-80 space-y-2 overflow-auto text-xs scrollbar-thin">{batch.slice(0, 5).map((p, i) => <li key={i} className="rounded-lg bg-surface-2/50 p-2 font-mono whitespace-pre-wrap">{p}</li>)}</ol></Panel>}
        </>}
      </>}
      side={<>
        <div><Label>Variable style</Label><Select aria-label="Variable style" value={style} onChange={(v) => setStyle(v as VarStyle | 'auto')} options={[{ value: 'auto', label: `Detect (now ${st === 'double' ? '{{name}}' : st === 'dollar' ? '${name}' : '{name}'})` }, { value: 'double', label: '{{name}} Mustache, Jinja, LangChain' }, { value: 'single', label: '{name} Python format' }, { value: 'dollar', label: '${name} JavaScript' }]} /></div>
        <Switch checked={keep} onChange={setKeep} label="Leave empty variables in place" />
        {mode === 'batch' && <>
          <div><Label>Each line as</Label><Select aria-label="Each line as" value={shape} onChange={(v) => setShape(v as 'text' | 'chat')} options={[{ value: 'chat', label: 'Chat messages (batch API, fine-tuning)' }, { value: 'text', label: 'prompt field' }]} /></div>
          {shape === 'chat' && <div><Label>System message</Label><Input aria-label="System message" value={system} onChange={(e) => setSystem(e.target.value)} placeholder="Optional" /></div>}
          <DlButton className="w-full" disabled={!batch.length} name="prompts.jsonl" mime="application/jsonl" data={() => batch.map(asLine).join('\n') + '\n'}>Prompts JSONL</DlButton>
          <DlButton className="w-full" disabled={!batch.length} name="prompts.txt" data={() => batch.join('\n\n---\n\n')}>Prompts as text</DlButton>
        </>}
        <p className="text-xs text-muted">Templates and values stay in this tab. Use the CSV mode to make hundreds of test prompts or a batch file in one go.</p>
      </>}
    />
  )
}
