/* Find and replace rule editor shared by the text tools. */
import { Plus, X } from 'lucide-react'
import { Button, Input, Textarea, cn } from '@/components/ui'
import type { Rule } from './text'

export const newRule = (): Rule => ({ find: '', replace: '', regex: false, caseSensitive: false, wholeWord: false, on: true })

function Toggle({ on, onClick, label, title }: { on: boolean; onClick: () => void; label: string; title: string }) {
  return <button type="button" title={title} aria-label={title} aria-pressed={on} onClick={onClick} className={cn('h-8 min-w-8 cursor-pointer rounded-lg border px-1.5 font-mono text-xs transition', on ? 'border-accent bg-accent/15 text-fg' : 'border-border text-muted hover:text-fg')}>{label}</button>
}

export function RuleEditor({ rules, setRules, counts }: { rules: Rule[]; setRules: (r: Rule[]) => void; counts?: number[] }) {
  const upd = (i: number, p: Partial<Rule>) => setRules(rules.map((r, k) => (k === i ? { ...r, ...p } : r)))
  return (
    <div className="space-y-2">
      {rules.map((r, i) => (
        <div key={i} className="space-y-1.5 rounded-xl border border-border bg-surface-2/40 p-2">
          <div className="flex gap-1.5">
            <Input aria-label={`Find ${i + 1}`} placeholder={r.regex ? 'Pattern, like (\\d+)' : 'Find'} value={r.find} onChange={(e) => upd(i, { find: e.target.value })} className="h-9 font-mono text-sm" />
            {rules.length > 1 && <Button size="sm" variant="ghost" aria-label="Remove rule" onClick={() => setRules(rules.filter((_, k) => k !== i))}><X className="size-4" /></Button>}
          </div>
          <Input aria-label={`Replace ${i + 1}`} placeholder={r.regex ? 'Replace, $1 for groups, \\n for new line' : 'Replace with (empty deletes)'} value={r.replace} onChange={(e) => upd(i, { replace: e.target.value })} className="h-9 font-mono text-sm" />
          <div className="flex items-center gap-1.5">
            <Toggle on={r.caseSensitive} onClick={() => upd(i, { caseSensitive: !r.caseSensitive })} label="Aa" title="Match case" />
            <Toggle on={r.wholeWord} onClick={() => upd(i, { wholeWord: !r.wholeWord })} label="W" title="Whole words only" />
            <Toggle on={r.regex} onClick={() => upd(i, { regex: !r.regex })} label=".*" title="Regular expression" />
            {counts && <span className="ml-auto text-xs text-muted">{counts[i] ?? 0} replaced</span>}
          </div>
        </div>
      ))}
      <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={() => setRules([...rules, newRule()])}>Add rule</Button>
    </div>
  )
}

export function BulkRules({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <Textarea value={value} onChange={(e) => onChange(e.target.value)} className="min-h-40 font-mono text-xs" placeholder={'colour => color\nfavourite => favorite\nteh => the'} aria-label="Replacement list" />
}
