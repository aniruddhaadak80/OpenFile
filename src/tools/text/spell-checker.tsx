import { useEffect, useMemo, useRef, useState } from 'react'
import { SpellCheck, FileText, Check, Plus, X } from 'lucide-react'
import { Button, Textarea, Badge, Spinner, Switch, Segmented, CopyButton, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { Bar, Status, DownloadButton, useStored, useDebounced } from '../dev/_b5/shell'
import { checkGrammar, words, type Issue } from '@/lib/b5/grammar'

const SAMPLE = `Their are a few mistakes in this paragraf. I recieve emails every day, and i could of answered them faster.  It is is a easy fix,but you has to look carefuly.

OpenFile checks spelling against a full English dictionary and points out common grammar slips. Click any marked word to see suggestions.`

let spellP: Promise<any> | null = null
function loadSpell(variant: 'us' | 'gb') {
  return (spellP ??= (async () => {
    const [{ default: nspell }, aff, dic] = await Promise.all([
      import('nspell'),
      import('../../../node_modules/dictionary-en/index.aff?url').then((m) => fetch(m.default).then((r) => r.text())),
      import('../../../node_modules/dictionary-en/index.dic?url').then((m) => fetch(m.default).then((r) => r.text())),
    ])
    return nspell(aff, dic)
  })())
  void variant
}

async function fileToText(f: File): Promise<string> {
  const n = f.name.toLowerCase()
  if (n.endsWith('.docx')) { const mammoth = await import('mammoth'); return (await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value }
  if (n.endsWith('.pdf')) { const { openPdfJs, allText } = await import('@/lib/pdf'); return (await allText(await openPdfJs(f))).join('\n\n') }
  if (n.endsWith('.html') || n.endsWith('.htm')) { const d = new DOMParser().parseFromString(await f.text(), 'text/html'); return d.body.innerText || d.body.textContent || '' }
  return f.text()
}

export default function SpellChecker() {
  const [text, setText] = useStored('b5:spell:text', SAMPLE)
  const [spell, setSpell] = useState<any>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [personal, setPersonal] = useStored<string[]>('b5:spell:dict', [])
  const [ignored, setIgnored] = useState<string[]>([])
  const [grammar, setGrammar] = useState(true)
  const [style, setStyle] = useState(true)
  const [open, setOpen] = useState<number | null>(null)
  const [filter, setFilter] = useState<'all' | 'spelling' | 'grammar' | 'style'>('all')
  const fileRef = useRef<HTMLInputElement>(null)
  const dt = useDebounced(text, 250)

  useEffect(() => { loadSpell('us').then((s) => { setSpell(s); personal.forEach((w) => s.add(w)) }).catch((e) => setLoadErr('Could not load the dictionary: ' + (e?.message || e))) }, [])

  const issues = useMemo<Issue[]>(() => {
    const out: Issue[] = []
    if (spell) {
      const cache = new Map<string, boolean>()
      for (const { w, start } of words(dt)) {
        if (w.length < 2 || ignored.includes(w.toLowerCase())) continue
        let ok = cache.get(w); if (ok === undefined) { ok = spell.correct(w) || spell.correct(w.toLowerCase()) || (/^[A-Z]/.test(w) && spell.correct(w[0] + w.slice(1).toLowerCase())); cache.set(w, ok!) }
        if (!ok) out.push({ start, end: start + w.length, msg: `“${w}” may be misspelled.`, kind: 'spelling' })
      }
    }
    if (grammar || style) out.push(...checkGrammar(dt).filter((i) => (i.kind === 'grammar' && grammar) || (i.kind === 'style' && style)))
    out.sort((a, b) => a.start - b.start)
    return out.filter((x, i) => !out.slice(0, i).some((y) => y.start < x.end && x.start < y.end))
  }, [dt, spell, ignored, grammar, style, personal])

  const sugg = (i: Issue): string[] => (i.kind === 'spelling' ? (spell?.suggest(dt.slice(i.start, i.end)) ?? []).slice(0, 6) : i.fix ?? [])
  const apply = (i: Issue, rep: string) => { setText(dt.slice(0, i.start) + rep + dt.slice(i.end)); setOpen(null) }
  const addWord = (w: string) => { spell?.add(w); setPersonal([...new Set([...personal, w])]); setOpen(null); toast(`Added “${w}” to your dictionary`) }
  const fixAll = () => { let t = dt; [...issues].reverse().forEach((i) => { const s = sugg(i); if (s.length && i.kind !== 'spelling') t = t.slice(0, i.start) + s[0] + t.slice(i.end) }); setText(t); toast('Applied all grammar and style fixes') }
  const counts = { spelling: issues.filter((i) => i.kind === 'spelling').length, grammar: issues.filter((i) => i.kind === 'grammar').length, style: issues.filter((i) => i.kind === 'style').length }
  const shown = issues.filter((i) => filter === 'all' || i.kind === filter)

  // Render text with marks
  const marked = useMemo(() => {
    const parts: React.ReactNode[] = []; let last = 0
    issues.forEach((i, k) => {
      if (i.start > last) parts.push(dt.slice(last, i.start))
      parts.push(<button key={k} onClick={() => setOpen(open === k ? null : k)} className={cn('rounded-sm underline decoration-2 underline-offset-4', i.kind === 'spelling' ? 'decoration-danger decoration-wavy' : i.kind === 'grammar' ? 'decoration-warn' : 'decoration-sky decoration-dotted', open === k && 'bg-accent/15')} aria-label={i.msg}>{dt.slice(i.start, i.end)}</button>)
      last = i.end
    })
    parts.push(dt.slice(last))
    return parts
  }, [issues, dt, open])

  return (
    <div className="space-y-4">
      <Bar>
        <Badge color="#EF4444">{counts.spelling} spelling</Badge><Badge color="#F5A524">{counts.grammar} grammar</Badge><Badge color="#38BDF8">{counts.style} style</Badge>
        <Switch checked={grammar} onChange={setGrammar} label="Grammar" /><Switch checked={style} onChange={setStyle} label="Style" />
        <div className="ml-auto flex gap-1">
          <input ref={fileRef} type="file" hidden accept=".txt,.md,.docx,.pdf,.html,.htm,.rtf,text/*" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { setText(await fileToText(f)); toast(`Loaded text from ${f.name}`) } catch (er: any) { toast(er?.message || 'Could not read that file', 'error') } }} />
          <Button size="sm" variant="ghost" icon={<FileText className="size-4" />} onClick={() => fileRef.current?.click()}>Open TXT, DOCX or PDF</Button>
          <Button size="sm" variant="outline" icon={<Check className="size-4" />} onClick={fixAll} disabled={!counts.grammar && !counts.style}>Fix grammar and style</Button>
        </div>
      </Bar>
      {loadErr && <Status kind="err">{loadErr}</Status>}
      {!spell && !loadErr && <Spinner label="Loading the English dictionary (about 1 MB)…" />}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-1"><div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">Your text<span className="normal-case tracking-normal">{dt.trim() ? dt.trim().split(/\s+/).length : 0} words</span></div><Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[440px] font-sans text-[15px] leading-7" spellCheck={false} aria-label="Text to check" /></div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">Checked<span className="flex gap-1 normal-case"><CopyButton text={dt} variant="ghost" /><DownloadButton text={dt} filename="checked.txt" /></span></div>
          <div className="scrollbar-thin relative min-h-[440px] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-surface p-4 text-[15px] leading-7">{marked}</div>
        </div>
      </div>
      {open !== null && issues[open] && (() => { const i = issues[open]; const s = sugg(i); const word = dt.slice(i.start, i.end); return (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-accent/40 bg-accent/5 p-3">
          <SpellCheck className="size-4 text-accent" /><span className="text-sm">{i.msg}</span>
          {s.map((x) => <Button key={x} size="sm" variant="secondary" onClick={() => apply(i, x)}>{x === ' ' ? '(single space)' : x}</Button>)}
          {i.kind === 'spelling' && !s.length && <span className="text-xs text-muted">No suggestions.</span>}
          {i.kind === 'spelling' && <><Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => addWord(word)}>Add to dictionary</Button><Button size="sm" variant="ghost" onClick={() => { setIgnored([...ignored, word.toLowerCase()]); setOpen(null) }}>Ignore</Button></>}
          <Button size="sm" variant="ghost" className="ml-auto" icon={<X className="size-4" />} onClick={() => setOpen(null)} aria-label="Close" />
        </div>
      ) })()}
      {issues.length > 0 && (
        <div className="space-y-2">
          <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: `All ${issues.length}` }, { value: 'spelling', label: 'Spelling' }, { value: 'grammar', label: 'Grammar' }, { value: 'style', label: 'Style' }]} />
          <div className="grid gap-1.5 md:grid-cols-2">
            {shown.slice(0, 200).map((i) => { const k = issues.indexOf(i); const s = sugg(i); return (
              <div key={k} className={cn('flex items-center gap-2 rounded-lg border border-border border-l-4 bg-surface px-3 py-2 text-sm', i.kind === 'spelling' ? 'border-l-danger' : i.kind === 'grammar' ? 'border-l-warn' : 'border-l-sky')}>
                <code className="font-mono font-semibold">{dt.slice(i.start, i.end).trim() || '␣'}</code><span className="min-w-0 flex-1 truncate text-muted">{i.msg}</span>
                {s[0] && <Button size="sm" variant="ghost" onClick={() => apply(i, s[0])}>→ {s[0] === ' ' ? '␣' : s[0]}</Button>}
              </div>
            ) })}
          </div>
        </div>
      )}
      {issues.length === 0 && spell && dt.trim() && <Status kind="ok">No issues found.</Status>}
      {personal.length > 0 && <p className="text-xs text-muted">Your dictionary: {personal.join(', ')} <button className="text-accent hover:underline" onClick={() => setPersonal([])}>Clear</button></p>}
      <p className="text-xs text-muted">Spelling uses the open Hunspell English dictionary (US spelling). Grammar and style checks are simple rules, so treat them as hints.</p>
    </div>
  )
}
