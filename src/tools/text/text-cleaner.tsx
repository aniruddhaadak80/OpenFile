import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Undo2, Redo2, Trash2, CopyMinus, Rows3, ArrowDownAZ, ArrowUpZA, ArrowDown10, ListOrdered, Shuffle, Scissors, Space, WrapText, Code, Languages, Hash, Replace, FlipVertical, TextQuote, Eraser, Link2Off, Mail } from 'lucide-react'
import { Button, Card, Field, Input, Select, Segmented, Switch, CopyButton, cn } from '@/components/ui'
import { joinLines, splitToLines, padLines, wrapLines, type PadSide } from '@/lib/b5/linetools'
import { toast } from '@/components/toast'
import { randInt, useStored, DownloadButton, OpenFileButton } from '@/tools/dev/_dev/kit'

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const lines = (s: string) => s.split(/\r?\n/)

export default function TextCleaner() {
  const [text, setTextRaw] = useStored('text-cleaner:text', '  banana\nApple\n\ncherry   pie\nbanana\n<b>Élan</b> vital\nitem 10\nitem 2\n\n  apple  ')
  const hist = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] })
  const [, force] = useState(0)
  const [last, setLast] = useState<string | null>(null)
  const [caseIns, setCaseIns] = useState(true)
  const [prefix, setPrefix] = useState('- '); const [suffix, setSuffix] = useState('')
  const [find, setFind] = useState(''); const [repl, setRepl] = useState(''); const [useRe, setUseRe] = useState(false); const [reCase, setReCase] = useState(false)
  const [joinWith, setJoinWith] = useState(', ')
  const [joinQuote, setJoinQuote] = useState<'' | "'" | '"' | '`'>('')
  const [joinWrap, setJoinWrap] = useState<'none' | '[]' | '()' | '{}'>('none')
  const [padW, setPadW] = useState(10); const [padCh, setPadCh] = useState(' '); const [padSide, setPadSide] = useState<PadSide>('left'); const [padAuto, setPadAuto] = useState(true)
  const [wrapW, setWrapW] = useState(80); const [wrapBreak, setWrapBreak] = useState(true)

  const apply = (name: string, fn: (s: string) => string) => {
    const out = fn(text)
    if (out === text) { toast(`${name}: nothing to change`, 'info'); return }
    hist.current.past.push(text); hist.current.future = []
    const dl = lines(text).length - lines(out).length
    setTextRaw(out); setLast(`${name}${dl > 0 ? ` · ${dl} line${dl > 1 ? 's' : ''} removed` : ''}`); force((x) => x + 1)
  }
  const undo = () => { const p = hist.current.past.pop(); if (p === undefined) return; hist.current.future.push(text); setTextRaw(p); setLast('Undo'); force((x) => x + 1) }
  const redo = () => { const f = hist.current.future.pop(); if (f === undefined) return; hist.current.past.push(text); setTextRaw(f); setLast('Redo'); force((x) => x + 1) }
  const L = (fn: (l: string[]) => string[]) => (s: string) => fn(lines(s)).join('\n')

  const GROUPS: { title: string; items: { name: string; icon: any; run: () => void; hint?: string }[] }[] = [
    { title: 'Lines', items: [
      { name: 'Remove duplicates', icon: CopyMinus, run: () => apply('Remove duplicates', L((ls) => { const seen = new Set<string>(); return ls.filter((l) => { const k = caseIns ? l.trim().toLowerCase() : l; if (seen.has(k)) return false; seen.add(k); return true }) })), hint: caseIns ? 'case-insensitive, trimmed' : 'exact match' },
      { name: 'Remove empty lines', icon: Rows3, run: () => apply('Remove empty lines', L((ls) => ls.filter((l) => l.trim()))) },
      { name: 'Collapse blank lines', icon: Rows3, run: () => apply('Collapse blank lines', (s) => s.replace(/(\r?\n\s*){3,}/g, '\n\n')) },
      { name: 'Reverse lines', icon: FlipVertical, run: () => apply('Reverse lines', L((ls) => [...ls].reverse())) },
      { name: 'Shuffle lines', icon: Shuffle, run: () => apply('Shuffle', L((ls) => { const a = [...ls]; for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1);[a[i], a[j]] = [a[j], a[i]] } return a })) },
      { name: 'Number lines', icon: ListOrdered, run: () => apply('Number lines', L((ls) => { const w = String(ls.length).length; return ls.map((l, i) => `${String(i + 1).padStart(w, ' ')}. ${l}`) })) },
    ] },
    { title: 'Sort', items: [
      { name: 'Sort A → Z', icon: ArrowDownAZ, run: () => apply('Sort A→Z', L((ls) => [...ls].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: caseIns ? 'base' : 'variant' })))) },
      { name: 'Sort Z → A', icon: ArrowUpZA, run: () => apply('Sort Z→A', L((ls) => [...ls].sort((a, b) => b.localeCompare(a, undefined, { sensitivity: caseIns ? 'base' : 'variant' })))) },
      { name: 'Natural sort', icon: ArrowDown10, run: () => apply('Natural sort', L((ls) => [...ls].sort(collator.compare))), hint: 'item 2 before item 10' },
      { name: 'Sort by length', icon: ArrowDown10, run: () => apply('Sort by length', L((ls) => [...ls].sort((a, b) => a.length - b.length || collator.compare(a, b)))) },
    ] },
    { title: 'Whitespace', items: [
      { name: 'Trim lines', icon: Scissors, run: () => apply('Trim', L((ls) => ls.map((l) => l.trim()))) },
      { name: 'Collapse spaces', icon: Space, run: () => apply('Collapse spaces', L((ls) => ls.map((l) => l.replace(/[ \t\u00a0]+/g, ' ')))) },
      { name: 'Remove all spaces', icon: Eraser, run: () => apply('Remove spaces', (s) => s.replace(/[ \t\u00a0]+/g, '')) },
      { name: 'Tabs → spaces', icon: Space, run: () => apply('Tabs → spaces', (s) => s.replace(/\t/g, '  ')) },
    ] },
    { title: 'Clean up', items: [
      { name: 'Strip HTML tags', icon: Code, run: () => apply('Strip HTML', (s) => { const d = new DOMParser().parseFromString(s.replace(/<(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, '\n$&'), 'text/html'); return d.body.textContent ?? '' }) },
      { name: 'Remove accents', icon: Languages, run: () => apply('Remove accents', (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/[Øø]/g, (c) => (c === 'Ø' ? 'O' : 'o')).replace(/[Łł]/g, (c) => (c === 'Ł' ? 'L' : 'l'))) },
      { name: 'Remove punctuation', icon: TextQuote, run: () => apply('Remove punctuation', (s) => s.replace(/[\p{P}\p{S}]/gu, '')) },
      { name: 'Remove numbers', icon: Hash, run: () => apply('Remove numbers', (s) => s.replace(/\d+/g, '')) },
      { name: 'Remove URLs', icon: Link2Off, run: () => apply('Remove URLs', (s) => s.replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, '')) },
      { name: 'Remove emails', icon: Mail, run: () => apply('Remove emails', (s) => s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '')) },
      { name: 'Smart quotes → plain', icon: TextQuote, run: () => apply('Plain quotes', (s) => s.replace(/[‘’‚‛]/g, "'").replace(/[“”„‟]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')) },
      { name: 'Remove emoji', icon: Eraser, run: () => apply('Remove emoji', (s) => s.replace(/\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/gu, '')) },
    ] },
  ]

  const doReplace = () => {
    if (!find) return
    try {
      const re = useRe ? new RegExp(find, 'g' + (reCase ? '' : 'i') + 'm') : new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g' + (reCase ? '' : 'i'))
      const count = (text.match(re) ?? []).length
      apply(`Replaced ${count} match${count === 1 ? '' : 'es'}`, (s) => s.replace(re, useRe ? repl.replace(/\\n/g, '\n').replace(/\\t/g, '\t') : repl.replace(/\$/g, '$$$$')))
    } catch (e: any) { toast('Invalid regex: ' + e.message, 'error') }
  }
  const matchCount = (() => { if (!find) return null; try { const re = useRe ? new RegExp(find, 'g' + (reCase ? '' : 'i') + 'm') : new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g' + (reCase ? '' : 'i')); return (text.match(re) ?? []).length } catch { return -1 } })()

  const ls = lines(text)
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-3">
        <Card className="p-0">
          <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2">
            <Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />} onClick={undo} disabled={!hist.current.past.length}>Undo</Button>
            <Button size="sm" variant="ghost" icon={<Redo2 className="size-4" />} onClick={redo} disabled={!hist.current.future.length} aria-label="Redo" />
            <AnimatePresence mode="wait">{last && <motion.span key={last + hist.current.past.length} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="ml-2 rounded-lg bg-success/10 px-2 py-0.5 text-xs text-success">✓ {last}</motion.span>}</AnimatePresence>
            <div className="ml-auto flex gap-1"><OpenFileButton onText={(t) => apply('Opened file', () => t)} /><CopyButton text={text} variant="ghost" /><DownloadButton text={text} filename="cleaned.txt" /><Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => apply('Cleared', () => '')} aria-label="Clear" /></div>
          </div>
          <textarea value={text} onChange={(e) => setTextRaw(e.target.value)} spellCheck={false} placeholder="Paste text to clean…" className="scrollbar-thin block min-h-[520px] w-full resize-y bg-transparent p-4 font-mono text-[13px] leading-6 outline-none" />
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-xs text-muted">
            <span>{ls.length.toLocaleString()} lines</span><span>{ls.filter((l) => !l.trim()).length} empty</span><span>{ls.length - new Set(ls.map((l) => (caseIns ? l.trim().toLowerCase() : l))).size} duplicates</span>
            <span>{text.trim() ? text.trim().split(/\s+/).length.toLocaleString() : 0} words</span><span>{text.length.toLocaleString()} chars</span>
          </div>
        </Card>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-4 p-4">
          <Switch checked={caseIns} onChange={setCaseIns} label={<span className="text-sm">Ignore case (duplicates & sort)</span>} />
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">{g.title}</div>
              <div className="grid grid-cols-2 gap-1.5">
                {g.items.map((it) => (
                  <motion.button key={it.name} whileTap={{ scale: 0.96 }} onClick={it.run} title={it.hint} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/40 px-2.5 py-2 text-left text-xs font-medium transition hover:border-accent hover:bg-accent/5 hover:text-accent cursor-pointer">
                    <it.icon className="size-3.5 shrink-0" /><span className="truncate">{it.name}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          ))}
        </Card>
        <Card className="space-y-3 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Prefix and suffix</div>
          <div className="grid grid-cols-2 gap-2"><Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="Prefix" className="font-mono text-xs" /><Input value={suffix} onChange={(e) => setSuffix(e.target.value)} placeholder="Suffix" className="font-mono text-xs" /></div>
          <Button size="sm" variant="outline" className="w-full" onClick={() => apply('Added prefix/suffix', L((ls) => ls.map((l) => (l.trim() ? prefix + l + suffix : l))))}>Add to each non-empty line</Button>
        </Card>
        <Card className="space-y-3 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Join and split</div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <Input value={joinWith} onChange={(e) => setJoinWith(e.target.value)} placeholder="Delimiter" aria-label="Delimiter" className="font-mono text-xs" title="Use \n for a new line and \t for a tab" />
            <Select value={joinQuote} onChange={setJoinQuote} options={[{ value: '', label: 'No quotes' }, { value: "'", label: "'a'" }, { value: '"', label: '"a"' }, { value: '`', label: '`a`' }]} className="w-24" />
            <Select value={joinWrap} onChange={setJoinWrap} options={[{ value: 'none', label: 'No wrap' }, { value: '[]', label: '[ ]' }, { value: '()', label: '( )' }, { value: '{}', label: '{ }' }]} className="w-24" />
          </div>
          <div className="flex flex-wrap gap-1.5">{[[', ', 'comma'], ['\\t', 'tab'], [' | ', 'pipe'], [';', 'semicolon'], [' ', 'space'], ['', 'nothing']].map(([d, l]) => <button key={l} onClick={() => setJoinWith(d)} className={cn('rounded-md border px-2 py-0.5 text-[11px]', joinWith === d ? 'border-accent text-accent' : 'border-border text-muted hover:text-fg')}>{l}</button>)}</div>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" icon={<WrapText className="size-4" />} onClick={() => apply('Joined lines', (s) => joinLines(s, { delim: joinWith, quote: joinQuote, skipEmpty: true, trim: true, wrapStart: joinWrap === 'none' ? '' : joinWrap[0], wrapEnd: joinWrap === 'none' ? '' : joinWrap[1] }))}>Join lines</Button>
            <Button size="sm" variant="outline" icon={<Rows3 className="size-4" />} disabled={!joinWith} onClick={() => apply('Split into lines', (s) => splitToLines(s.replace(/^\s*[[({]|[\])}]\s*$/g, ''), joinWith))}>Split into lines</Button>
          </div>
        </Card>
        <Card className="space-y-3 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Pad lines</div>
          <Segmented value={padSide} onChange={setPadSide} options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'center', label: 'Center' }]} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Width"><Input type="number" min={1} max={500} value={padW} disabled={padAuto} onChange={(e) => setPadW(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} className="text-xs" /></Field>
            <Field label="Fill character"><Input value={padCh} maxLength={2} onChange={(e) => setPadCh(e.target.value)} className="font-mono text-xs" placeholder="space" /></Field>
          </div>
          <Switch checked={padAuto} onChange={setPadAuto} label={<span className="text-xs">Match the longest line</span>} />
          <Button size="sm" variant="outline" className="w-full" onClick={() => apply('Padded lines', (s) => padLines(s, padW, padCh || ' ', padSide, padAuto))}>Pad each line</Button>
        </Card>
        <Card className="space-y-3 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Wrap lines</div>
          <div className="flex items-end gap-2">
            <Field label="Max characters per line" className="flex-1"><Input type="number" min={5} max={1000} value={wrapW} onChange={(e) => setWrapW(Math.max(5, Math.min(1000, Number(e.target.value) || 5)))} className="text-xs" /></Field>
            <div className="flex gap-1 pb-0.5">{[40, 72, 80, 100].map((n) => <button key={n} onClick={() => setWrapW(n)} className={cn('rounded-md border px-1.5 py-1 text-[11px]', wrapW === n ? 'border-accent text-accent' : 'border-border text-muted hover:text-fg')}>{n}</button>)}</div>
          </div>
          <Switch checked={wrapBreak} onChange={setWrapBreak} label={<span className="text-xs">Split words longer than the line</span>} />
          <Button size="sm" variant="outline" className="w-full" onClick={() => apply(`Wrapped at ${wrapW}`, (s) => wrapLines(s, wrapW, wrapBreak))}>Wrap text</Button>
        </Card>
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted"><Replace className="size-3.5" />Find & replace{matchCount !== null && <span className={cn('ml-auto normal-case tracking-normal', matchCount < 0 ? 'text-danger' : 'text-accent')}>{matchCount < 0 ? 'invalid regex' : `${matchCount} match${matchCount === 1 ? '' : 'es'}`}</span>}</div>
          <Field label="Find"><Input value={find} onChange={(e) => setFind(e.target.value)} className="font-mono text-xs" placeholder={useRe ? '\\s+$' : 'text'} /></Field>
          <Field label="Replace with"><Input value={repl} onChange={(e) => setRepl(e.target.value)} className="font-mono text-xs" placeholder={useRe ? '$1, \\n allowed' : ''} /></Field>
          <div className="flex flex-wrap gap-3"><Switch checked={useRe} onChange={setUseRe} label={<span className="text-xs">Regex</span>} /><Switch checked={reCase} onChange={setReCase} label={<span className="text-xs">Match case</span>} /></div>
          <Button size="sm" className="w-full" disabled={!find || !matchCount || matchCount < 0} onClick={doReplace}>Replace all</Button>
        </Card>
      </aside>
    </div>
  )
}
