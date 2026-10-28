import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Clock, Mic, BookOpen, Trash2, ClipboardPaste, Hash } from 'lucide-react'
import { Button, Card, Segmented, Switch, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { Stat, OpenFileButton, useStored, useDebounced } from '@/tools/dev/_dev/kit'

const STOP = new Set('a about above after again against all am an and any are aren\'t as at be because been before being below between both but by can can\'t cannot could couldn\'t did didn\'t do does doesn\'t doing don\'t down during each few for from further had hadn\'t has hasn\'t have haven\'t having he he\'d he\'ll he\'s her here here\'s hers herself him himself his how how\'s i i\'d i\'ll i\'m i\'ve if in into is isn\'t it it\'s its itself let\'s me more most mustn\'t my myself no nor not of off on once only or other ought our ours ourselves out over own same shan\'t she she\'d she\'ll she\'s should shouldn\'t so some such than that that\'s the their theirs them themselves then there there\'s these they they\'d they\'ll they\'re they\'ve this those through to too under until up very was wasn\'t we we\'d we\'ll we\'re we\'ve were weren\'t what what\'s when when\'s where where\'s which while who who\'s whom why why\'s with won\'t would wouldn\'t you you\'d you\'ll you\'re you\'ve your yours yourself yourselves also just will one get like can may much many us use used using via per etc'.split(' '))

function syllables(w: string) {
  const s = w.toLowerCase().replace(/[^a-z]/g, '')
  if (!s) return 0
  if (s.length <= 3) return 1
  const t = s.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  const m = t.match(/[aeiouy]{1,2}/g)
  return Math.max(1, m ? m.length : 1)
}
const seg = typeof Intl !== 'undefined' && (Intl as any).Segmenter ? new (Intl as any).Segmenter(undefined, { granularity: 'word' }) : null
function words(text: string): string[] {
  if (seg) return Array.from(seg.segment(text) as Iterable<any>).filter((x: any) => x.isWordLike).map((x: any) => x.segment)
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) ?? []
}
const fmtTime = (min: number) => { if (min < 1) return `${Math.max(1, Math.round(min * 60))} sec`; const m = Math.floor(min), s = Math.round((min - m) * 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min${s ? ` ${s} s` : ''}` }

const LIMITS = [
  { name: 'X / Twitter post', max: 280, unit: 'chars' }, { name: 'Meta description', max: 160, unit: 'chars' }, { name: 'SEO title', max: 60, unit: 'chars' },
  { name: 'Instagram caption', max: 2200, unit: 'chars' }, { name: 'LinkedIn post', max: 3000, unit: 'chars' }, { name: 'SMS (GSM-7)', max: 160, unit: 'chars' }, { name: 'YouTube title', max: 100, unit: 'chars' },
]

export default function WordCounter() {
  const [text, setText] = useStored('word-counter:text', '')
  const [wpm, setWpm] = useState<'200' | '238' | '300'>('238')
  const [kwMode, setKwMode] = useState<'1' | '2' | '3'>('1')
  const [incStop, setIncStop] = useState(false)
  const t = useDebounced(text, 80)

  const s = useMemo(() => {
    const w = words(t)
    const chars = [...t].length, noSpace = [...t.replace(/\s/g, '')].length
    const sentences = t.trim() ? (t.match(/[^.!?…。！？]+(?:[.!?…。！？]+|$)/g) ?? []).filter((x) => /[\p{L}\p{N}]/u.test(x)).length : 0
    const paragraphs = t.split(/\n\s*\n/).filter((p) => p.trim()).length
    const lines = t ? t.split('\n').length : 0
    const syl = w.reduce((n, x) => n + syllables(x), 0)
    const flesch = w.length && sentences ? 206.835 - 1.015 * (w.length / sentences) - 84.6 * (syl / w.length) : null
    const fk = w.length && sentences ? 0.39 * (w.length / sentences) + 11.8 * (syl / w.length) - 15.59 : null
    const uniq = new Set(w.map((x) => x.toLowerCase())).size
    const longest = w.reduce((a, b) => (b.length > a.length ? b : a), '')
    const avgLen = w.length ? w.reduce((n, x) => n + x.length, 0) / w.length : 0
    return { w, words: w.length, chars, noSpace, sentences, paragraphs, lines, flesch, fk, uniq, longest, avgLen, avgSentence: sentences ? w.length / sentences : 0 }
  }, [t])

  const keywords = useMemo(() => {
    const n = Number(kwMode); const lw = s.w.map((x) => x.toLowerCase().replace(/’/g, "'"))
    const counts = new Map<string, number>()
    for (let i = 0; i + n <= lw.length; i++) {
      const g = lw.slice(i, i + n)
      if (!incStop && (n === 1 ? STOP.has(g[0]) || g[0].length < 2 || /^\d+$/.test(g[0]) : STOP.has(g[0]) || STOP.has(g[n - 1]))) continue
      const k = g.join(' '); counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    const total = Math.max(1, lw.length - n + 1)
    return [...counts].filter(([, c]) => n === 1 || c > 1).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, c]) => ({ k, c, pct: (c / total) * 100 }))
  }, [s.w, kwMode, incStop])

  const ease = s.flesch === null ? null : s.flesch >= 90 ? ['Very easy', '5th grade', '#22c55e'] : s.flesch >= 70 ? ['Easy', '6th–7th grade', '#22c55e'] : s.flesch >= 60 ? ['Plain English', '8th–9th grade', '#84cc16'] : s.flesch >= 50 ? ['Fairly difficult', '10th–12th grade', '#f59e0b'] : s.flesch >= 30 ? ['Difficult', 'College', '#f97316'] : ['Very difficult', 'College graduate', '#ef4444']
  const maxKw = keywords[0]?.c ?? 1

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[['Words', s.words], ['Characters', s.chars], ['No spaces', s.noSpace], ['Sentences', s.sentences]].map(([l, v]) => (
            <div key={l as string} className="rounded-2xl border border-border bg-surface p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{l}</div>
              <motion.div key={v as number} initial={{ y: -4, opacity: 0.5 }} animate={{ y: 0, opacity: 1 }} className="font-display text-3xl font-bold tabular-nums">{(v as number).toLocaleString()}</motion.div>
            </div>
          ))}
        </div>
        <Card className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            <span className="mr-auto text-xs font-semibold uppercase tracking-wide text-muted">Your text</span>
            <Button size="sm" variant="ghost" icon={<ClipboardPaste className="size-4" />} onClick={async () => { try { setText(await navigator.clipboard.readText()) } catch { toast('Clipboard access denied, paste with Ctrl/⌘+V', 'info') } }}>Paste</Button>
            <OpenFileButton accept=".txt,.md,.html,.csv,text/*" onText={(x) => setText(x)} />
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setText('')}>Clear</Button>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Start typing or paste your text here. Everything is counted live and stays on your device."
            className="scrollbar-thin min-h-[380px] w-full resize-y bg-transparent p-4 text-[15px] leading-relaxed outline-none placeholder:text-muted/60" />
        </Card>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Paragraphs" value={s.paragraphs} /><Stat label="Lines" value={s.lines} /><Stat label="Unique words" value={s.uniq} sub={s.words ? `${Math.round((s.uniq / s.words) * 100)}% lexical diversity` : undefined} />
          <Stat label="Longest word" value={<span className="text-base">{s.longest || '-'}</span>} sub={s.longest ? `${s.longest.length} letters · avg ${s.avgLen.toFixed(1)}` : undefined} />
        </div>
        <Card className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Character limits</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {LIMITS.map((l) => {
              const pct = Math.min(1, s.chars / l.max); const over = s.chars > l.max
              return (
                <div key={l.name}>
                  <div className="mb-1 flex justify-between text-xs"><span>{l.name}</span><span className={cn('font-mono', over ? 'font-bold text-danger' : 'text-muted')}>{s.chars}/{l.max}{over && ` (+${s.chars - l.max})`}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><motion.div className="h-full rounded-full" animate={{ width: pct * 100 + '%', backgroundColor: over ? '#ef4444' : pct > 0.9 ? '#f59e0b' : '#22c55e' }} /></div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted"><BookOpen className="size-3" />Reading</div><div className="font-display text-xl font-semibold">{s.words ? fmtTime(s.words / Number(wpm)) : '-'}</div></div>
            <div><div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted"><Mic className="size-3" />Speaking</div><div className="font-display text-xl font-semibold">{s.words ? fmtTime(s.words / 140) : '-'}</div></div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted"><Clock className="size-3.5" />Reading speed <Segmented value={wpm} onChange={setWpm} options={[{ value: '200', label: 'Slow' }, { value: '238', label: 'Avg' }, { value: '300', label: 'Fast' }]} /></div>
        </Card>
        <Card className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Readability</div>
          {ease ? (
            <>
              <div className="flex items-end gap-3"><div className="font-display text-4xl font-bold" style={{ color: ease[2] }}>{Math.round(Math.max(0, Math.min(100, s.flesch!)))}</div><div className="pb-1"><div className="font-semibold" style={{ color: ease[2] }}>{ease[0]}</div><div className="text-xs text-muted">Flesch reading ease · {ease[1]}</div></div></div>
              <div className="relative h-2 rounded-full bg-gradient-to-r from-[#ef4444] via-[#f59e0b] to-[#22c55e]"><motion.div className="absolute -top-1 size-4 -translate-x-1/2 rounded-full border-2 border-surface bg-fg shadow" animate={{ left: `${Math.max(0, Math.min(100, s.flesch!))}%` }} /></div>
              <div className="text-xs text-muted">Grade level {Math.max(0, s.fk!).toFixed(1)} · {s.avgSentence.toFixed(1)} words / sentence</div>
            </>
          ) : <div className="text-sm text-muted">Write a sentence or two to score readability.</div>}
        </Card>
        <Card className="space-y-3">
          <div className="flex items-center gap-2"><Hash className="size-3.5 text-muted" /><span className="mr-auto text-xs font-semibold uppercase tracking-wide text-muted">Keyword density</span><Segmented value={kwMode} onChange={setKwMode} options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }]} /></div>
          <Switch checked={incStop} onChange={setIncStop} label={<span className="text-xs text-muted">Include stop words</span>} />
          {keywords.length === 0 ? <div className="text-sm text-muted">No keywords yet.</div> : (
            <div className="space-y-1.5">
              {keywords.map((k) => (
                <div key={k.k} className="relative overflow-hidden rounded-lg px-2 py-1 text-sm">
                  <motion.div className="absolute inset-y-0 left-0 bg-accent/12" initial={{ width: 0 }} animate={{ width: `${(k.c / maxKw) * 100}%` }} style={{ background: 'color-mix(in oklab, var(--accent) 14%, transparent)' }} />
                  <div className="relative flex justify-between gap-2"><span className="truncate">{k.k}</span><span className="shrink-0 font-mono text-xs text-muted">{k.c}× · {k.pct.toFixed(1)}%</span></div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </aside>
    </div>
  )
}
