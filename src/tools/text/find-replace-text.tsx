import { useMemo, useState } from 'react'
import { Replace } from 'lucide-react'
import { Field, Segmented, Switch, ToolGrid, ErrorNote, CopyButton, Textarea, Label } from '@/components/ui'
import { applyRules, findMatches, parseRuleList, type Rule } from '@/lib/b14/text'
import { RuleEditor, BulkRules, newRule } from '@/lib/b14/rules'
import { OpenButton } from '@/lib/b14/ui'
import { DlButton } from '@/lib/bcat/kit'
import { readTextFile } from '@/tools/dev/_dev/kit'

const SAMPLE = 'The colour of the sky changes through the day.\nMy favourite colour is teal.\nCall 555-0142 or 555-0199 before 2026-11-01.'

export default function FindReplaceText() {
  const [text, setText] = useState(SAMPLE)
  const [mode, setMode] = useState<'rules' | 'list'>('rules')
  const [rules, setRules] = useState<Rule[]>([{ ...newRule(), find: 'colour', replace: 'color' }])
  const [list, setList] = useState('colour => color\nfavourite => favorite')
  const [listOpts, setListOpts] = useState({ regex: false, caseSensitive: false, wholeWord: true })
  const [name, setName] = useState('text.txt')
  const active = mode === 'rules' ? rules : parseRuleList(list, listOpts)
  const res = useMemo(() => { try { return { ...applyRules(text, active), error: null as string | null } } catch (e: any) { return { text, counts: [], error: e.message as string } } }, [text, JSON.stringify(active)])
  const first = active.find((r) => r.find)
  const hits = useMemo(() => { try { return first ? findMatches(text, first, 500) : [] } catch { return [] } }, [text, first?.find, first?.regex, first?.caseSensitive, first?.wholeWord])
  const total = res.counts.reduce((a, b) => a + b, 0)
  const marked = useMemo(() => {
    const parts: React.ReactNode[] = []; let at = 0
    hits.forEach((h, i) => { parts.push(text.slice(at, h.index)); parts.push(<mark key={i} className="rounded bg-accent/30 text-fg">{text.slice(h.index, h.index + h.length) || '|'}</mark>); at = h.index + h.length })
    parts.push(text.slice(at)); return parts
  }, [hits, text])
  return (
    <ToolGrid
      main={<>
        <div className="flex items-center justify-between"><Label>Your text</Label><OpenButton accept=".txt,.md,.csv,.json,.html,.xml,.log,.srt,.js,.ts,.css,.yaml,.yml" onFiles={async (f) => { const t = await readTextFile(f[0]); if (t != null) { setText(t); setName(f[0].name) } }} /></div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-44 font-mono text-sm" aria-label="Text" />
        {first && <div><Label hint={`${hits.length}${hits.length >= 500 ? '+' : ''} matches for the first rule`}>Matches</Label><pre className="scrollbar-thin max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-surface p-3 font-mono text-xs leading-5">{marked}</pre></div>}
        <div className="flex items-center justify-between"><Label hint={`${total} replacements`}>Result</Label><div className="flex gap-2"><CopyButton text={res.text} /><DlButton name={name.replace(/(\.[^.]+)?$/, '-replaced$1')} data={() => res.text}>Download</DlButton></div></div>
        <pre className="scrollbar-thin max-h-72 min-h-24 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-surface p-3 font-mono text-sm">{res.text}</pre>
      </>}
      side={<>
        <Field label="Mode"><Segmented value={mode} onChange={setMode} options={[{ value: 'rules', label: 'Rules' }, { value: 'list', label: 'Bulk list' }]} /></Field>
        {mode === 'rules' ? <RuleEditor rules={rules} setRules={setRules} counts={res.counts} /> : <>
          <p className="text-xs text-muted">One pair per line: find =&gt; replace (or a tab between them). Rules run from top to bottom.</p>
          <BulkRules value={list} onChange={setList} />
          <Switch checked={listOpts.wholeWord} onChange={(v) => setListOpts({ ...listOpts, wholeWord: v })} label="Whole words only" />
          <Switch checked={listOpts.caseSensitive} onChange={(v) => setListOpts({ ...listOpts, caseSensitive: v })} label="Match case" />
          <Switch checked={listOpts.regex} onChange={(v) => setListOpts({ ...listOpts, regex: v })} label="Regular expressions" />
        </>}
        <ErrorNote error={res.error} />
        <p className="flex gap-1.5 text-xs text-muted"><Replace className="size-4 shrink-0" />Use \n in the replacement for a new line. With regular expressions, $1 inserts the first group.</p>
      </>}
    />
  )
}
