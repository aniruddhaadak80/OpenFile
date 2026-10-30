import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button, Card, Label, Segmented, Textarea } from '@/components/ui'
import { typingStats, TYPING_TEXTS } from '@/lib/cf/study'
import { Stat, Stats } from '@/lib/cf/ui'

const BEST = 'of-typing-best'

export default function TypingTest() {
  const [len, setLen] = useState<'30' | '60' | '120' | 'text'>('60')
  const [src, setSrc] = useState<'built' | 'custom'>('built'), [custom, setCustom] = useState('')
  const [idx, setIdx] = useState(0)
  const target = useMemo(() => { if (src === 'custom' && custom.trim()) return custom.trim().replace(/\s+/g, ' '); let t = ''; for (let i = 0; t.length < 900; i++) t += (t ? ' ' : '') + TYPING_TEXTS[(idx + i) % TYPING_TEXTS.length]; return t }, [src, custom, idx])
  const [typed, setTyped] = useState(''), [start, setStart] = useState<number | null>(null), [now, setNow] = useState(Date.now()), [done, setDone] = useState(false)
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST) ?? 0))
  const box = useRef<HTMLTextAreaElement>(null)
  const limit = len === 'text' ? Infinity : +len
  const secs = start ? Math.min(limit, (now - start) / 1000) : 0
  useEffect(() => { if (!start || done) return; const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t) }, [start, done])
  useEffect(() => { if (start && !done && (secs >= limit || typed.length >= target.length)) { setDone(true) } }, [secs, typed, start, done, limit, target.length])
  const st = typingStats(target, typed, Math.max(1, secs))
  useEffect(() => { if (done && st.net > best) { setBest(st.net); localStorage.setItem(BEST, String(st.net)) } }, [done])
  const reset = (next = false) => { setTyped(''); setStart(null); setDone(false); if (next) setIdx((i) => i + 1); setTimeout(() => box.current?.focus(), 0) }
  const shown = target.slice(0, Math.max(typed.length + 260, 320))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><Segmented value={len} onChange={(v) => { setLen(v); reset() }} options={[{ value: '30', label: '30 s' }, { value: '60', label: '1 min' }, { value: '120', label: '2 min' }, { value: 'text', label: 'Whole text' }]} /><Segmented value={src} onChange={(v) => { setSrc(v); reset() }} options={[{ value: 'built', label: 'Our texts' }, { value: 'custom', label: 'My own text' }]} /></div>
      {src === 'custom' && <div><Label>Paste the text to practise (notes, a speech, code)</Label><Textarea value={custom} onChange={(e) => { setCustom(e.target.value); reset() }} className="min-h-24 font-sans" /></div>}
      <Stats cols={4}><Stat label="Time" value={len === 'text' ? `${Math.round(secs)} s` : `${Math.max(0, Math.ceil(limit - secs))} s`} /><Stat label="Speed" value={`${st.net} wpm`} sub={`${st.wpm} gross`} tone="good" /><Stat label="Accuracy" value={`${Math.round(st.accuracy * 100)}%`} /><Stat label="Best here" value={`${best} wpm`} /></Stats>
      <Card className="relative space-y-3" onClick={() => box.current?.focus()}>
        <p className="font-mono text-lg leading-relaxed tracking-wide select-none" aria-hidden="true">
          {shown.split('').map((ch, i) => <span key={i} className={i < typed.length ? (typed[i] === ch ? 'text-success' : 'rounded bg-danger/20 text-danger') : i === typed.length ? 'border-b-2 border-accent text-fg' : 'text-muted'}>{ch}</span>)}
        </p>
        <textarea ref={box} value={typed} disabled={done} aria-label="Type the text shown above" autoFocus spellCheck={false} autoCapitalize="off" autoCorrect="off"
          onChange={(e) => { if (!start) setStart(Date.now()); setTyped(e.target.value.slice(0, target.length)) }}
          className="of-field h-20 w-full resize-none rounded-xl border border-border bg-surface-2/60 p-3 font-mono text-sm" placeholder="Start typing here. The clock starts with your first key." />
        {done && <div className="rounded-xl border border-success/30 bg-success/5 p-4 text-center"><div className="font-display text-3xl font-bold">{st.net} words per minute</div><div className="text-sm text-muted">{Math.round(st.accuracy * 100)}% accurate, {st.errors} mistakes, {st.chars} characters in {Math.round(secs)} s</div></div>}
        <div className="flex gap-2"><Button variant="outline" icon={<RotateCcw className="size-4" />} onClick={() => reset()}>Restart</Button><Button variant="ghost" onClick={() => reset(true)}>New text</Button></div>
      </Card>
      <p className="text-xs text-muted">Net speed counts 5 characters as a word and takes off uncorrected mistakes. Your best score is kept in this browser only.</p>
    </div>
  )
}
