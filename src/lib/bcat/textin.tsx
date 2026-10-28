/* Text input for the text AI tools: paste, or open TXT, CSV (pick a column), MD, PDF, DOCX. Splits into items. */
import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { Button, Label, Segmented, Select, Textarea } from '@/components/ui'
import { toast } from '@/components/toast'

export type Split = 'lines' | 'paragraphs' | 'whole'
export function splitItems(text: string, how: Split) {
  if (how === 'whole') return text.trim() ? [text.trim()] : []
  return (how === 'lines' ? text.split(/\r?\n/) : text.split(/\r?\n\s*\r?\n/)).map((s) => s.trim()).filter(Boolean)
}

export function useTextInput(sample = '', split: Split = 'lines') {
  const [text, setText] = useState(sample)
  const [how, setHow] = useState<Split>(split)
  const [csv, setCsv] = useState<{ head: string[]; rows: string[][]; col: string } | null>(null)
  const items = csv ? csv.rows.map((r) => r[csv.head.indexOf(csv.col)] ?? '').map((s) => s.trim()).filter(Boolean) : splitItems(text, how)
  const open = async (f: File) => {
    const n = f.name.toLowerCase()
    try {
      if (n.endsWith('.csv') || n.endsWith('.tsv')) {
        const Papa = (await import('papaparse')).default
        const r = Papa.parse<string[]>(await f.text(), { skipEmptyLines: true })
        const [head, ...rows] = r.data
        const col = head.find((h) => /text|review|comment|message|body|content|feedback/i.test(h)) ?? head[0]
        setCsv({ head, rows, col }); return
      }
      setCsv(null)
      if (/\.(pdf|docx|epub|odt|rtf|html?)$/.test(n)) { const { docPages } = await import('@/lib/b4/doctext'); setText((await docPages(f)).map((p) => p.text).join('\n\n')); return }
      setText(await f.text())
    } catch (e: any) { toast(e?.message || 'Could not read this file', 'error') }
  }
  return { text, setText, how, setHow, csv, setCsv, items, open }
}
export type TextInputState = ReturnType<typeof useTextInput>

export function TextInput({ s, splits = ['lines', 'paragraphs', 'whole'], placeholder, accept = '.txt,.md,.csv,.tsv,.pdf,.docx,.html,.rtf,.odt,.epub' }: { s: TextInputState; splits?: Split[]; placeholder?: string; accept?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!s.csv && splits.length > 1 && <Segmented value={s.how} onChange={s.setHow} options={splits.map((v) => ({ value: v, label: v === 'lines' ? 'Each line' : v === 'paragraphs' ? 'Each paragraph' : 'Whole text' }))} />}
        <label className="ml-auto">
          <input type="file" hidden accept={accept} onChange={(e) => { const f = e.target.files?.[0]; if (f) s.open(f); e.target.value = '' }} />
          <Button variant="outline" size="sm" icon={<FolderOpen className="size-4" />} onClick={(e) => (e.currentTarget.previousSibling as HTMLInputElement).click()}>Open file</Button>
        </label>
      </div>
      {s.csv ? (
        <div className="space-y-2 rounded-xl border border-border bg-surface-2/40 p-3">
          <Label hint={`${s.csv.rows.length} rows`}>Column to read</Label>
          <Select value={s.csv.col} onChange={(col) => s.setCsv({ ...s.csv!, col })} options={s.csv.head} />
          <Button variant="ghost" size="sm" onClick={() => s.setCsv(null)}>Use typed text instead</Button>
        </div>
      ) : <Textarea value={s.text} onChange={(e) => s.setText(e.target.value)} placeholder={placeholder} className="min-h-48 font-sans text-sm" aria-label="Text" />}
      <p className="text-xs text-muted">{s.items.length} item{s.items.length === 1 ? '' : 's'} to analyse</p>
    </div>
  )
}
