import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, Replace, ListOrdered, Sparkles, AlertTriangle, Timer } from 'lucide-react'
import { Card, Input, Switch, Tabs, CopyButton, cn } from '@/components/ui'
import { Chip, Pane, useDebounced, esc } from './_dev/kit'
import { explainRegex, TOK_COLOR, LIBRARY } from './_dev/regex'

type M = { i: number; s: number; e: number; t: string; g: { n: number; name?: string; s: number; e: number; t: string | undefined }[] }
type Result = { ok: true; matches: M[]; replaced?: string; truncated: boolean; ms: number } | { ok: false; error: string }

/* Runs inside a Web Worker (stringified) so runaway patterns can be killed. */
function workerMain() {
const S: any = self
S.onmessage = (ev: MessageEvent) => {
  const { pattern, flags, text, replace, doReplace } = ev.data
  const t0 = performance.now()
  try {
    let fl = flags
    let hasD = true
    try { new RegExp('', 'd') } catch { hasD = false }
    if (hasD && !fl.includes('d')) fl += 'd'
    new RegExp(pattern, flags) // surface syntax errors with the user's own flags
    const re = new RegExp(pattern, fl)
    const matches: any[] = []
    let truncated = false
    // capture-group names by group number (scan pattern, skipping escapes and [...] sets)
    const names: (string | null)[] = [null]
    for (let i = 0, inSet = false; i < pattern.length; i++) {
      const c = pattern[i]
      if (c === '\\') { i++; continue }
      if (inSet) { if (c === ']') inSet = false; continue }
      if (c === '[') { inSet = true; continue }
      if (c !== '(') continue
      if (pattern[i + 1] !== '?') names.push(null)
      else if (pattern[i + 2] === '<' && pattern[i + 3] !== '=' && pattern[i + 3] !== '!') { const e = pattern.indexOf('>', i); names.push(pattern.slice(i + 3, e)) }
    }
    const push = (m: any, k: number) => {
      const g: any[] = []
      for (let j = 1; j < m.length; j++) {
        const idx = m.indices && m.indices[j]
        g.push({ n: j, name: names[j] || undefined, s: idx ? idx[0] : -1, e: idx ? idx[1] : -1, t: m[j] })
      }
      matches.push({ i: k, s: m.index, e: m.index + m[0].length, t: m[0], g })
    }
    if (re.global) {
      let k = 0
      for (const m of (text as string).matchAll(re)) { push(m, k++); if (k >= 5000) { truncated = true; break } }
    } else {
      const m = re.exec(text); if (m) push(m, 0)
    }
    let replaced: string | undefined
    if (doReplace) replaced = (text as string).replace(new RegExp(pattern, flags), replace)
    S.postMessage({ ok: true, matches, replaced, truncated, ms: performance.now() - t0 })
  } catch (e: any) { S.postMessage({ ok: false, error: e.message }) }
}}
const WORKER = `(${workerMain.toString()})()`

const FLAGS = [
  { f: 'g', name: 'global', d: 'Find all matches, not just the first' },
  { f: 'i', name: 'ignore case', d: 'Case-insensitive' },
  { f: 'm', name: 'multiline', d: '^ and $ match at line breaks' },
  { f: 's', name: 'dotAll', d: '. also matches newlines' },
  { f: 'u', name: 'unicode', d: 'Full Unicode, enables \\p{…}' },
  { f: 'y', name: 'sticky', d: 'Match only at lastIndex' },
]
const COLORS = ['rgba(139,108,255,.35)', 'rgba(6,182,212,.35)']

let workerUrl: string | null = null
function runInWorker(data: object, timeout = 1500): Promise<Result> {
  if (!workerUrl) workerUrl = URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' }))
  return new Promise((res) => {
    const w = new Worker(workerUrl!)
    const t = setTimeout(() => { w.terminate(); res({ ok: false, error: `Timed out after ${timeout} ms, the pattern likely causes catastrophic backtracking (e.g. nested quantifiers like (a+)+).` }) }, timeout)
    w.onmessage = (e) => { clearTimeout(t); w.terminate(); res(e.data) }
    w.onerror = (e) => { clearTimeout(t); w.terminate(); res({ ok: false, error: e.message }) }
    w.postMessage(data)
  })
}

export default function RegexTester() {
  const [pattern, setPattern] = useState(LIBRARY[4].pattern)
  const [flags, setFlags] = useState('g')
  const [text, setText] = useState('Released 2026-10-28, patched 2026-11-03.\nNext milestone: 2027-01-15 (tentative).\nInvalid: 2026-13-40')
  const [tab, setTab] = useState<'matches' | 'replace' | 'explain' | 'library'>('matches')
  const [replace, setReplace] = useState('$<day>/$<month>/$<year>')
  const [res, setRes] = useState<Result | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const dp = useDebounced(pattern, 120), dt = useDebounced(text, 120), dr = useDebounced(replace, 120)
  const back = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    if (!dp) { setRes(null); return }
    runInWorker({ pattern: dp, flags, text: dt, replace: dr, doReplace: tab === 'replace' }).then((r) => alive && setRes(r))
    return () => { alive = false }
  }, [dp, flags, dt, dr, tab])

  const matches = res?.ok ? res.matches : []
  const html = useMemo(() => {
    if (!matches.length) return esc(text) + '\n'
    let out = '', last = 0
    for (const m of matches) {
      if (m.s < last) continue
      out += esc(text.slice(last, m.s))
      const style = `background:${COLORS[m.i % 2]};border-radius:3px;${hover === m.i ? 'outline:2px solid var(--accent);' : ''}`
      out += m.e === m.s ? `<span style="border-left:2px solid var(--accent);margin-left:-1px"></span>` : `<mark style="${style};color:transparent">${esc(text.slice(m.s, m.e))}</mark>`
      last = m.e
    }
    return out + esc(text.slice(last)) + '\n'
  }, [text, matches, hover])

  const toggle = (f: string) => setFlags((s) => (s.includes(f) ? s.replace(f, '') : FLAGS.map((x) => x.f).filter((x) => s.includes(x) || x === f).join('')))
  const tokens = useMemo(() => { try { return explainRegex(pattern) } catch { return [] } }, [pattern])
  const err = res && !res.ok ? res.error : null

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className={cn('flex items-center rounded-xl border bg-surface-2/60 font-mono transition focus-within:ring-2', err ? 'border-danger/60 focus-within:ring-danger/20' : 'border-border focus-within:border-accent focus-within:ring-accent/20')}>
          <span className="pl-3 text-lg text-muted">/</span>
          <input value={pattern} onChange={(e) => setPattern(e.target.value)} spellCheck={false} placeholder="your regex here" className="h-12 min-w-0 flex-1 bg-transparent px-1 text-[15px] outline-none" />
          <span className="pr-3 text-lg text-muted">/<span className="text-accent">{flags}</span></span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FLAGS.map((x) => <Chip key={x.f} active={flags.includes(x.f)} onClick={() => toggle(x.f)} title={x.d}><span className="font-mono font-bold">{x.f}</span> <span className="opacity-70">{x.name}</span></Chip>)}
          <div className="ml-auto flex items-center gap-3 text-xs">
            {res?.ok && <span className="flex items-center gap-1 text-muted"><Timer className="size-3.5" />{res.ms.toFixed(1)} ms</span>}
            <motion.span key={matches.length} initial={{ scale: 1.2 }} animate={{ scale: 1 }} className={cn('rounded-lg px-2 py-1 font-semibold', matches.length ? 'bg-success/15 text-success' : 'bg-surface-2 text-muted')}>
              {matches.length}{res?.ok && res.truncated ? '+' : ''} match{matches.length === 1 ? '' : 'es'}
            </motion.span>
          </div>
        </div>
        {err && <div className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{err}</div>}
      </Card>

      <Pane title="Test string" actions={<span className="text-[11px] text-muted">{text.length} chars · {text.split('\n').length} lines</span>}>
        <div className="relative min-h-48">
          <div ref={back} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words p-4 font-mono text-[14px] leading-6 text-transparent" dangerouslySetInnerHTML={{ __html: html }} />
          <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
            onScroll={(e) => { if (back.current) back.current.scrollTop = e.currentTarget.scrollTop }}
            style={{ fieldSizing: 'content' } as React.CSSProperties} className="scrollbar-thin relative block min-h-48 w-full resize-y whitespace-pre-wrap break-words bg-transparent p-4 font-mono text-[14px] leading-6 text-fg outline-none" rows={8} />
        </div>
      </Pane>

      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'matches', label: <span className="flex items-center gap-1.5"><ListOrdered className="size-4" />Matches</span> },
        { value: 'replace', label: <span className="flex items-center gap-1.5"><Replace className="size-4" />Replace</span> },
        { value: 'explain', label: <span className="flex items-center gap-1.5"><Sparkles className="size-4" />Explain</span> },
        { value: 'library', label: <span className="flex items-center gap-1.5"><BookOpen className="size-4" />Library</span> },
      ]} />

      {tab === 'matches' && (
        matches.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">{pattern ? 'No matches.' : 'Type a pattern to start.'}</div> : (
          <div className="grid gap-2 sm:grid-cols-2">
            {matches.slice(0, 300).map((m) => (
              <motion.div key={m.i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} onMouseEnter={() => setHover(m.i)} onMouseLeave={() => setHover(null)}
                className={cn('rounded-xl border bg-surface p-3 text-sm transition', hover === m.i ? 'border-accent' : 'border-border')}>
                <div className="mb-1.5 flex items-center gap-2 text-xs"><span className="rounded bg-accent/15 px-1.5 py-0.5 font-bold text-accent">#{m.i + 1}</span><span className="text-muted">index {m.s}–{m.e}</span><div className="ml-auto"><CopyButton text={m.t} label="" variant="ghost" /></div></div>
                <div className="break-all font-mono">{m.t === '' ? <span className="italic text-muted">(empty match)</span> : m.t}</div>
                {m.g.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-border pt-2">
                    {m.g.map((g) => (
                      <div key={g.n} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-2 text-xs">
                        <span className="font-mono text-[#22d3ee]">{g.name ? `<${g.name}>` : `$${g.n}`}</span>
                        <span className="break-all font-mono">{g.t === undefined ? <span className="italic text-muted">undefined</span> : g.t}</span>
                        <span className="text-muted">{g.s >= 0 ? `${g.s}–${g.e}` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
            {matches.length > 300 && <div className="text-xs text-muted">Showing first 300 of {matches.length}.</div>}
          </div>
        )
      )}

      {tab === 'replace' && (
        <Card className="space-y-3">
          <div className="flex items-center gap-2"><Input value={replace} onChange={(e) => setReplace(e.target.value)} className="font-mono" placeholder="Replacement, use $1, $<name>, $& (whole match)" /></div>
          <div className="flex flex-wrap gap-1.5 text-[11px] text-muted">{['$&', '$1', '$2', '$<name>', '$`', "$'", '$$'].map((t) => <button key={t} onClick={() => setReplace((r) => r + t)} className="rounded border border-border px-1.5 py-0.5 font-mono hover:text-fg">{t}</button>)}</div>
          <Pane title="Result" actions={res?.ok && res.replaced !== undefined ? <CopyButton text={res.replaced} variant="ghost" /> : null}>
            <pre className="scrollbar-thin max-h-80 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[14px] leading-6">{res?.ok ? res.replaced ?? '' : ''}</pre>
          </Pane>
          {!flags.includes('g') && <p className="text-xs text-warn">Without the g flag only the first match is replaced.</p>}
        </Card>
      )}

      {tab === 'explain' && (
        <Card className="space-y-3">
          <div className="break-all rounded-xl bg-surface-2/60 p-3 font-mono text-[15px]">{tokens.map((t, i) => <span key={i} style={{ color: TOK_COLOR[t.kind] }}>{t.text}</span>)}</div>
          <div className="divide-y divide-border">
            {tokens.map((t, i) => (
              <div key={i} className="flex items-baseline gap-3 py-1.5 text-sm">
                <code className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px]" style={{ color: TOK_COLOR[t.kind] }}>{t.text}</code>
                <span className="text-muted">{t.desc}</span>
              </div>
            ))}
          </div>
          {flags && <div className="border-t border-border pt-2 text-xs text-muted">Flags: {flags.split('').map((f) => FLAGS.find((x) => x.f === f)?.d).join(' · ')}</div>}
        </Card>
      )}

      {tab === 'library' && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {LIBRARY.map((p) => (
            <button key={p.name} onClick={() => { setPattern(p.pattern); setFlags(p.flags); setText(p.sample); setTab('matches') }} className="group rounded-xl border border-border bg-surface p-3 text-left transition hover:-translate-y-0.5 hover:border-accent hover:shadow-lg cursor-pointer">
              <div className="text-sm font-semibold group-hover:text-accent">{p.name}</div>
              <div className="mt-1 truncate font-mono text-[11px] text-muted">/{p.pattern}/{p.flags}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
