import { useMemo, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { Button, Segmented, Switch, Select } from '@/components/ui'
import { Bar, Status, TwoPane, useStored } from './_b5/shell'
import { escape, unescape, type EscLang } from '@/lib/b5/escape'

const LANGS: { value: EscLang; label: string }[] = [
  { value: 'json', label: 'JSON' }, { value: 'js', label: 'JavaScript / TypeScript' }, { value: 'java', label: 'Java / Kotlin' }, { value: 'csharp', label: 'C#' }, { value: 'csharp-verbatim', label: 'C# verbatim (@"")' },
  { value: 'python', label: 'Python' }, { value: 'c', label: 'C / C++' }, { value: 'go', label: 'Go / Rust' }, { value: 'sql', label: 'SQL' }, { value: 'csv', label: 'CSV field' },
  { value: 'regex', label: 'Regular expression' }, { value: 'shell', label: 'Bash / sh' }, { value: 'powershell', label: 'PowerShell' }, { value: 'xml', label: 'XML' }, { value: 'html', label: 'HTML' }, { value: 'url', label: 'URL component' },
]
const QUOTABLE: EscLang[] = ['json', 'js', 'java', 'csharp', 'csharp-verbatim', 'python', 'c', 'go', 'sql', 'csv']
const UNI: EscLang[] = ['json', 'js', 'java', 'csharp', 'python', 'c', 'go', 'html']

export default function StringEscape() {
  const [lang, setLang] = useStored<EscLang>('b5:esc:lang', 'json')
  const [dir, setDir] = useState<'esc' | 'unesc'>('esc')
  const [input, setInput] = useStored('b5:esc:input', 'Line one\nShe said "hello" and it\'s done.\tTabbed. Café ☕')
  const [quote, setQuote] = useState(false)
  const [uni, setUni] = useState(false)
  const res = useMemo(() => { try { return { out: dir === 'esc' ? escape(lang, input, { unicode: uni, quote }) : unescape(lang, input) } } catch (e: any) { return { err: e.message as string } } }, [lang, dir, input, quote, uni])
  const out = 'out' in res ? res.out! : ''
  return (
    <div className="space-y-4">
      <Bar>
        <Select aria-label="Language" value={lang} onChange={setLang} options={LANGS} className="w-60" />
        <Segmented value={dir} onChange={setDir} options={[{ value: 'esc', label: 'Escape' }, { value: 'unesc', label: 'Unescape' }]} />
        {dir === 'esc' && QUOTABLE.includes(lang) && <Switch checked={quote} onChange={setQuote} label="Wrap in quotes" />}
        {dir === 'esc' && UNI.includes(lang) && <Switch checked={uni} onChange={setUni} label="Escape non-ASCII" />}
        <Button size="sm" variant="ghost" className="ml-auto" icon={<ArrowLeftRight className="size-4" />} onClick={() => { setInput(out); setDir(dir === 'esc' ? 'unesc' : 'esc') }} disabled={!out}>Swap</Button>
      </Bar>
      {'err' in res && <Status kind="err">Could not unescape: {res.err}</Status>}
      <TwoPane input={input} setInput={setInput} inputTitle={dir === 'esc' ? 'Raw text' : 'Escaped text'} outputTitle={dir === 'esc' ? 'Escaped' : 'Raw text'} output={out} accept="text/*" height="h-[420px]" wrapOutput />
    </div>
  )
}
