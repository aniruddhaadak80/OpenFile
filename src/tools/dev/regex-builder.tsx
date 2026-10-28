import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUp, ArrowDown, Trash2, Copy as CopyIcon, Plus, Wand2, RotateCcw } from 'lucide-react'
import { Button, Card, Input, Select, Textarea, CopyButton, cn } from '@/components/ui'
import { Chip, esc, Pane } from './_dev/kit'
import { explainRegex, TOK_COLOR } from './_dev/regex'

type Q = 'one' | 'opt' | 'star' | 'plus' | 'exact' | 'range' | 'min'
type BType = 'start' | 'end' | 'boundary' | 'text' | 'digit' | 'letter' | 'lower' | 'upper' | 'alnum' | 'word' | 'space' | 'any' | 'anyOf' | 'noneOf' | 'or' | 'group' | 'capture' | 'ahead' | 'notAhead'
interface Block { id: string; t: BType; v?: string; q: Q; min?: number; max?: number; lazy?: boolean; kids?: Block[] }

const META: Record<BType, { label: string; color: string; hint: string; quant: boolean; input?: string }> = {
  start: { label: 'Starts with', color: '#f472b6', hint: 'Anchor at the beginning (^)', quant: false },
  end: { label: 'Ends here', color: '#f472b6', hint: 'Anchor at the end ($)', quant: false },
  boundary: { label: 'Word boundary', color: '#f472b6', hint: 'Edge of a word (\\b)', quant: false },
  text: { label: 'Exact text', color: '#a3e635', hint: 'Literal text, special characters escaped', quant: true, input: 'text' },
  digit: { label: 'Digit', color: '#22d3ee', hint: '0–9', quant: true },
  letter: { label: 'Letter', color: '#22d3ee', hint: 'a–z or A–Z', quant: true },
  lower: { label: 'Lowercase', color: '#22d3ee', hint: 'a–z', quant: true },
  upper: { label: 'Uppercase', color: '#22d3ee', hint: 'A–Z', quant: true },
  alnum: { label: 'Letter or digit', color: '#22d3ee', hint: 'a–z A–Z 0–9', quant: true },
  word: { label: 'Word char', color: '#22d3ee', hint: 'letter, digit or _ (\\w)', quant: true },
  space: { label: 'Whitespace', color: '#22d3ee', hint: 'space, tab, newline (\\s)', quant: true },
  any: { label: 'Any character', color: '#22d3ee', hint: 'anything except newline (.)', quant: true },
  anyOf: { label: 'Any of', color: '#06b6d4', hint: 'One of these characters — ranges like a-z allowed', quant: true, input: 'chars' },
  noneOf: { label: 'None of', color: '#06b6d4', hint: 'Any character except these', quant: true, input: 'chars' },
  or: { label: 'OR', color: '#ef4444', hint: 'Either what is before or what is after', quant: false },
  group: { label: 'Group', color: '#8b6cff', hint: 'Group blocks together (non-capturing)', quant: true },
  capture: { label: 'Capture', color: '#8b6cff', hint: 'Remember this part as a group (optional name)', quant: true, input: 'name' },
  ahead: { label: 'Followed by', color: '#c084fc', hint: 'Must be followed by… (not consumed)', quant: false },
  notAhead: { label: 'Not followed by', color: '#c084fc', hint: 'Must NOT be followed by…', quant: false },
}
const PALETTE: BType[] = ['start', 'end', 'text', 'digit', 'letter', 'lower', 'upper', 'alnum', 'word', 'space', 'any', 'anyOf', 'noneOf', 'boundary', 'or', 'group', 'capture', 'ahead', 'notAhead']
const isContainer = (t: BType) => t === 'group' || t === 'capture' || t === 'ahead' || t === 'notAhead'

let seq = 0
const uid = () => 'b' + ++seq
const B = (t: BType, o: Partial<Block> = {}): Block => ({ id: uid(), t, q: 'one', ...o, kids: o.kids ?? (isContainer(t) ? [] : undefined) })

const escText = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const escSet = (s: string) => s.replace(/^\^/, '\\^').replace(/(?<!\\)\]/g, '\\]') // backslash escapes like \s are kept

function quant(b: Block) {
  let q = ''
  switch (b.q) {
    case 'opt': q = '?'; break; case 'star': q = '*'; break; case 'plus': q = '+'; break
    case 'exact': q = `{${b.min ?? 1}}`; break
    case 'range': q = `{${b.min ?? 1},${b.max ?? ''}}`; break
    case 'min': q = `{${b.min ?? 1},}`; break
  }
  return q && b.lazy && b.q !== 'exact' ? q + '?' : q
}

function compile(blocks: Block[]): string {
  return blocks.map((b) => {
    let core = ''
    switch (b.t) {
      case 'start': return '^'; case 'end': return '$'; case 'boundary': return '\\b'; case 'or': return '|'
      case 'text': { const t = escText(b.v ?? ''); core = t.length > 1 && b.q !== 'one' ? `(?:${t})` : t; break }
      case 'digit': core = '\\d'; break; case 'letter': core = '[a-zA-Z]'; break; case 'lower': core = '[a-z]'; break; case 'upper': core = '[A-Z]'; break
      case 'alnum': core = '[a-zA-Z0-9]'; break; case 'word': core = '\\w'; break; case 'space': core = '\\s'; break; case 'any': core = '.'; break
      case 'anyOf': core = `[${escSet(b.v ?? '')}]`; break
      case 'noneOf': core = `[^${escSet(b.v ?? '')}]`; break
      case 'group': core = `(?:${compile(b.kids ?? [])})`; break
      case 'capture': core = b.v ? `(?<${b.v.replace(/\W/g, '_')}>${compile(b.kids ?? [])})` : `(${compile(b.kids ?? [])})`; break
      case 'ahead': return `(?=${compile(b.kids ?? [])})`
      case 'notAhead': return `(?!${compile(b.kids ?? [])})`
    }
    return core + quant(b)
  }).join('')
}

const r = (n: number, x: number) => ({ q: 'exact' as Q, min: n, max: x })
const PRESETS: { name: string; flags: string; sample: string; blocks: () => Block[] }[] = [
  { name: 'Email', flags: 'g', sample: 'Write to ada@example.com or team.ops+news@open-file.co.in', blocks: () => [B('boundary'), B('anyOf', { v: 'a-zA-Z0-9._%+-', q: 'plus' }), B('text', { v: '@' }), B('anyOf', { v: 'a-zA-Z0-9.-', q: 'plus' }), B('text', { v: '.' }), B('letter', { q: 'min', min: 2 })] },
  { name: 'URL', flags: 'gi', sample: 'Docs at https://openfile.app/docs?id=1 and http://example.org', blocks: () => [B('text', { v: 'http' }), B('text', { v: 's', q: 'opt' }), B('text', { v: '://' }), B('group', { q: 'opt', kids: [B('text', { v: 'www.' })] }), B('anyOf', { v: 'a-zA-Z0-9-', q: 'plus' }), B('group', { q: 'plus', kids: [B('text', { v: '.' }), B('anyOf', { v: 'a-zA-Z0-9-', q: 'plus' })] }), B('noneOf', { v: ' \\s', q: 'star' })] },
  { name: 'Phone (India)', flags: 'g', sample: 'Call +91 98765 43210 or 9123456789', blocks: () => [B('group', { q: 'opt', kids: [B('text', { v: '+91' }), B('anyOf', { v: ' -', q: 'opt' })] }), B('anyOf', { v: '6-9' }), B('digit', r(4, 4)), B('anyOf', { v: ' -', q: 'opt' }), B('digit', r(5, 5))] },
  { name: 'Date (YYYY-MM-DD)', flags: 'g', sample: 'From 2026-10-28 to 2027-01-15', blocks: () => [B('capture', { v: 'year', kids: [B('digit', r(4, 4))] }), B('text', { v: '-' }), B('capture', { v: 'month', kids: [B('digit', r(2, 2))] }), B('text', { v: '-' }), B('capture', { v: 'day', kids: [B('digit', r(2, 2))] })] },
  { name: 'IPv4', flags: 'g', sample: 'Hosts 192.168.0.1 and 10.0.0.254', blocks: () => [B('boundary'), B('group', { ...r(3, 3), kids: [B('digit', { q: 'range', min: 1, max: 3 }), B('text', { v: '.' })] }), B('digit', { q: 'range', min: 1, max: 3 }), B('boundary')] },
  { name: 'Hex color', flags: 'gi', sample: 'Palette: #fff #6d4aff #06B6D4', blocks: () => [B('text', { v: '#' }), B('group', { kids: [B('anyOf', { v: '0-9a-fA-F', ...r(6, 6) }), B('or'), B('anyOf', { v: '0-9a-fA-F', ...r(3, 3) })] }), B('boundary')] },
  { name: 'Indian PIN', flags: 'g', sample: 'PIN 700137 or 721 137', blocks: () => [B('boundary'), B('anyOf', { v: '1-9' }), B('digit', r(2, 2)), B('space', { q: 'opt' }), B('digit', r(3, 3)), B('boundary')] },
  { name: 'PAN', flags: 'g', sample: 'PAN ABCDE1234F, invalid ABC123', blocks: () => [B('boundary'), B('upper', r(5, 5)), B('digit', r(4, 4)), B('upper'), B('boundary')] },
]

export default function RegexBuilder() {
  const [blocks, setBlocks] = useState<Block[]>(() => PRESETS[0].blocks())
  const [flags, setFlags] = useState('g')
  const [test, setTest] = useState(PRESETS[0].sample)
  const [target, setTarget] = useState<string | null>(null) // container id where new blocks go
  const pattern = useMemo(() => compile(blocks), [blocks])

  const update = (id: string, fn: (b: Block) => Block | null, list = blocks): Block[] =>
    list.flatMap((b) => { if (b.id === id) { const n = fn(b); return n ? [n] : [] } return [b.kids ? { ...b, kids: update(id, fn, b.kids) } : b] })
  const move = (id: string, d: -1 | 1, list = blocks): Block[] => {
    const i = list.findIndex((b) => b.id === id)
    if (i >= 0) { const j = i + d; if (j < 0 || j >= list.length) return list; const c = [...list];[c[i], c[j]] = [c[j], c[i]]; return c }
    return list.map((b) => (b.kids ? { ...b, kids: move(id, d, b.kids) } : b))
  }
  const dup = (id: string, list = blocks): Block[] => list.flatMap((b) => {
    const clone = (x: Block): Block => ({ ...x, id: uid(), kids: x.kids?.map(clone) })
    if (b.id === id) return [b, clone(b)]
    return [b.kids ? { ...b, kids: dup(id, b.kids) } : b]
  })
  const add = (t: BType) => {
    const nb = B(t, t === 'text' ? { v: 'abc' } : t === 'anyOf' || t === 'noneOf' ? { v: 'a-z' } : {})
    if (target) setBlocks(update(target, (b) => ({ ...b, kids: [...(b.kids ?? []), nb] })))
    else setBlocks([...blocks, nb])
    if (isContainer(t)) setTarget(nb.id)
  }

  const re = useMemo(() => { try { return { re: new RegExp(pattern, flags.includes('g') ? flags : flags + 'g'), err: null } } catch (e: any) { return { re: null, err: e.message as string } } }, [pattern, flags])
  const { html, count } = useMemo(() => {
    if (!re.re || !pattern) return { html: esc(test), count: 0 }
    let out = '', last = 0, n = 0
    for (const m of test.matchAll(re.re)) {
      if (m[0] === '') continue
      out += esc(test.slice(last, m.index)) + `<mark class="rounded px-0.5" style="background:${n % 2 ? 'rgba(6,182,212,.3)' : 'rgba(139,108,255,.35)'};color:inherit">${esc(m[0])}</mark>`
      last = m.index! + m[0].length; n++
      if (n > 2000) break
    }
    return { html: out + esc(test.slice(last)), count: n }
  }, [re, test, pattern])
  const tokens = useMemo(() => explainRegex(pattern), [pattern])

  const ops = { update: (id: string, fn: (b: Block) => Block | null) => setBlocks(update(id, fn)), move: (id: string, d: -1 | 1) => setBlocks(move(id, d)), dup: (id: string) => setBlocks(dup(id)), target, setTarget }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center rounded-xl border border-border bg-surface-2/60 px-3 py-2.5 font-mono text-[15px]">
            <span className="text-muted">/</span>
            <span className="min-w-0 flex-1 break-all px-0.5">{pattern ? tokens.map((t, i) => <span key={i} style={{ color: TOK_COLOR[t.kind] }}>{t.text}</span>) : <span className="text-muted">add blocks below…</span>}</span>
            <span className="text-muted">/<span className="text-accent">{flags}</span></span>
          </div>
          <CopyButton text={pattern} label="Copy regex" size="md" />
          <CopyButton text={() => `/${pattern.replace(/\//g, '\\/')}/${flags}`} label="Copy /literal/" size="md" variant="ghost" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {[['g', 'global'], ['i', 'ignore case'], ['m', 'multiline']].map(([f, n]) => <Chip key={f} active={flags.includes(f)} onClick={() => setFlags((s) => (s.includes(f) ? s.replace(f, '') : s + f))}><b className="font-mono">{f}</b> {n}</Chip>)}
          {re.err && <span className="text-xs text-danger">{re.err}</span>}
          <div className="ml-auto flex flex-wrap gap-1.5">
            <span className="self-center text-xs text-muted"><Wand2 className="mr-1 inline size-3.5" />Presets:</span>
            {PRESETS.map((p) => <Chip key={p.name} onClick={() => { setBlocks(p.blocks()); setFlags(p.flags); setTest(p.sample); setTarget(null) }}>{p.name}</Chip>)}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit space-y-2 p-3 lg:sticky lg:top-24">
          <div className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Add block {target && <span className="normal-case text-accent">→ into group</span>}</div>
          <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
            {PALETTE.map((t) => (
              <button key={t} onClick={() => add(t)} title={META[t].hint} className="group flex items-center gap-2 rounded-lg border border-border bg-surface-2/40 px-2.5 py-1.5 text-left text-xs font-medium transition hover:border-accent hover:bg-accent/5 cursor-pointer">
                <span className="size-2 rounded-full" style={{ background: META[t].color }} /><span className="flex-1">{META[t].label}</span><Plus className="size-3.5 text-muted opacity-0 group-hover:opacity-100" />
              </button>
            ))}
          </div>
          {target && <Button size="sm" variant="ghost" className="w-full" onClick={() => setTarget(null)}>Add to top level instead</Button>}
          <Button size="sm" variant="ghost" className="w-full" icon={<RotateCcw className="size-3.5" />} onClick={() => { setBlocks([]); setTarget(null) }}>Clear all</Button>
        </Card>

        <div className="min-w-0 space-y-4">
          <div onClick={() => setTarget(null)} className={cn('min-h-32 space-y-2 rounded-2xl border border-dashed p-3 transition', !target ? 'border-accent/50' : 'border-border')}>
            {blocks.length === 0 && <div className="py-8 text-center text-sm text-muted">Click blocks on the left to build your pattern step by step.</div>}
            <BlockList list={blocks} ops={ops} />
          </div>

          <Pane title="Test it" actions={<span className={cn('rounded-lg px-2 py-0.5 text-xs font-semibold', count ? 'bg-success/15 text-success' : 'bg-surface-2 text-muted')}>{count} match{count === 1 ? '' : 'es'}</span>}>
            <div className="grid gap-0 md:grid-cols-2">
              <Textarea value={test} onChange={(e) => setTest(e.target.value)} className="min-h-36 rounded-none border-0 border-b border-border bg-transparent md:border-b-0 md:border-r" placeholder="Type sample text to test against" />
              <pre className="min-h-36 whitespace-pre-wrap break-words p-3 font-mono text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: html || '<span class="text-muted">Matches are highlighted here</span>' }} />
            </div>
          </Pane>

          {tokens.length > 0 && (
            <details className="rounded-2xl border border-border bg-surface p-4">
              <summary className="cursor-pointer text-sm font-semibold">What does it mean?</summary>
              <div className="mt-3 divide-y divide-border">{tokens.map((t, i) => <div key={i} className="flex gap-3 py-1 text-sm"><code className="shrink-0 font-mono" style={{ color: TOK_COLOR[t.kind] }}>{t.text}</code><span className="text-muted">{t.desc}</span></div>)}</div>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}

type Ops = { update: (id: string, fn: (b: Block) => Block | null) => void; move: (id: string, d: -1 | 1) => void; dup: (id: string) => void; target: string | null; setTarget: (id: string | null) => void }

function BlockList({ list, ops }: { list: Block[]; ops: Ops }) {
  return (
    <AnimatePresence initial={false}>
      {list.map((b, i) => <BlockRow key={b.id} b={b} ops={ops} first={i === 0} last={i === list.length - 1} />)}
    </AnimatePresence>
  )
}

function BlockRow({ b, ops, first, last }: { b: Block; ops: Ops; first: boolean; last: boolean }) {
  const m = META[b.t]
  const cont = isContainer(b.t)
  const set = (p: Partial<Block>) => ops.update(b.id, (x) => ({ ...x, ...p }))
  return (
    <motion.div layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} onClick={(e) => { e.stopPropagation(); if (cont) ops.setTarget(b.id) }}
      className={cn('rounded-xl border bg-surface p-2.5', cont && ops.target === b.id ? 'border-accent ring-2 ring-accent/20' : 'border-border')} style={{ borderLeft: `4px solid ${m.color}` }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold" style={{ color: m.color }}>{m.label}</span>
        {m.input === 'text' && <Input value={b.v ?? ''} onChange={(e) => set({ v: e.target.value })} className="h-8 w-40 font-mono text-xs" placeholder="text" onClick={(e) => e.stopPropagation()} />}
        {m.input === 'chars' && <Input value={b.v ?? ''} onChange={(e) => set({ v: e.target.value })} className="h-8 w-40 font-mono text-xs" placeholder="e.g. a-z0-9_" onClick={(e) => e.stopPropagation()} />}
        {m.input === 'name' && <Input value={b.v ?? ''} onChange={(e) => set({ v: e.target.value })} className="h-8 w-32 font-mono text-xs" placeholder="name (optional)" onClick={(e) => e.stopPropagation()} />}
        {m.quant && (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Select value={b.q} onChange={(q) => set({ q })} className="h-8 w-36 text-xs" options={[{ value: 'one', label: 'exactly once' }, { value: 'opt', label: 'optional' }, { value: 'plus', label: 'one or more' }, { value: 'star', label: 'zero or more' }, { value: 'exact', label: 'exactly N times' }, { value: 'range', label: 'between N and M' }, { value: 'min', label: 'at least N' }]} />
            {(b.q === 'exact' || b.q === 'range' || b.q === 'min') && <Input type="number" min={0} value={b.min ?? 1} onChange={(e) => set({ min: Math.max(0, +e.target.value) })} className="h-8 w-16 text-xs" />}
            {b.q === 'range' && <><span className="text-xs text-muted">to</span><Input type="number" min={0} value={b.max ?? ''} onChange={(e) => set({ max: e.target.value === '' ? undefined : Math.max(0, +e.target.value) })} className="h-8 w-16 text-xs" placeholder="∞" /></>}
            {b.q !== 'one' && b.q !== 'exact' && <label className="flex items-center gap-1 text-[11px] text-muted"><input type="checkbox" checked={!!b.lazy} onChange={(e) => set({ lazy: e.target.checked })} className="accent-[var(--accent)]" />lazy</label>}
          </div>
        )}
        <span className="hidden text-[11px] text-muted md:inline">{m.hint}</span>
        <div className="ml-auto flex items-center" onClick={(e) => e.stopPropagation()}>
          <button disabled={first} onClick={() => ops.move(b.id, -1)} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30" aria-label="Move up"><ArrowUp className="size-3.5" /></button>
          <button disabled={last} onClick={() => ops.move(b.id, 1)} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30" aria-label="Move down"><ArrowDown className="size-3.5" /></button>
          <button onClick={() => ops.dup(b.id)} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Duplicate"><CopyIcon className="size-3.5" /></button>
          <button onClick={() => { ops.update(b.id, () => null); if (ops.target === b.id) ops.setTarget(null) }} className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger" aria-label="Delete"><Trash2 className="size-3.5" /></button>
        </div>
      </div>
      {cont && (
        <div className="mt-2 space-y-2 rounded-lg border border-dashed border-border bg-surface-2/30 p-2">
          {(b.kids ?? []).length === 0 && <div className="py-2 text-center text-xs text-muted">{ops.target === b.id ? 'Selected — add blocks from the left panel' : 'Click here, then add blocks into this group'}</div>}
          <BlockList list={b.kids ?? []} ops={ops} />
        </div>
      )}
    </motion.div>
  )
}
