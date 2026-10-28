import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Segmented, Slider, CopyButton } from '@/components/ui'
import { Bar, Pane, CodeArea, OpenFileButton, Stat, useStored, useDebounced, DownloadButton } from '../dev/_b5/shell'
import { readability, easeLabel, bionic } from '@/lib/b10/text'

const SAMPLE = `Good writing is easy to read. Short sentences help. So do plain words.

When a sentence keeps going and going, adding clause after clause with commas and conjunctions and parenthetical asides, the reader has to hold every part of it in their head before they finally reach the point, which makes the whole thing much harder to follow than it needs to be.

Try this tool on your own text. It shows the grade level and the sentences that need work.`

const fmtMin = (m: number) => (m < 1 ? `${Math.max(1, Math.round(m * 60))} sec` : `${Math.round(m * 10) / 10} min`)

export default function ReadabilityScore() {
  const [text, setText] = useStored('b10:read:text', SAMPLE)
  const [view, setView] = useState<'scores' | 'bionic'>('scores')
  const [ratio, setRatio] = useState(45)
  const t = useDebounced(text, 150)
  const r = useMemo(() => readability(t), [t])
  const bio = useMemo(() => (view === 'bionic' ? bionic(t, ratio / 100) : ''), [t, view, ratio])
  const ease = Math.max(0, Math.min(100, r.fleschEase))
  const hue = ease >= 60 ? 'var(--color-success, #10B981)' : ease >= 30 ? '#F5A524' : '#EF4444'

  return (
    <div className="space-y-4">
      <Bar>
        <Segmented value={view} onChange={setView} options={[{ value: 'scores', label: 'Scores' }, { value: 'bionic', label: 'Bionic reading' }]} />
        {view === 'bionic' && <Slider label="Bold part" value={ratio} onChange={setRatio} min={20} max={70} suffix="%" className="w-56" />}
      </Bar>
      <div className="grid gap-4 lg:grid-cols-2">
        <Pane title="Your text" className="h-[480px]" actions={<OpenFileButton accept=".txt,.md,text/*" onText={(x) => setText(x)} />}>
          <CodeArea value={text} onChange={setText} lineNumbers={false} spellCheck placeholder="Paste or type your text" />
        </Pane>
        {view === 'scores' ? (
          <div className="space-y-4">
            <div className="flex items-center gap-5 rounded-2xl border border-border bg-surface p-4">
              <div className="relative size-28 shrink-0">
                <svg viewBox="0 0 100 100" className="size-28 -rotate-90"><circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth="10" />
                  <motion.circle cx="50" cy="50" r="42" fill="none" stroke={hue} strokeWidth="10" strokeLinecap="round" strokeDasharray={264} initial={{ strokeDashoffset: 264 }} animate={{ strokeDashoffset: 264 - (264 * ease) / 100 }} transition={{ type: 'spring', stiffness: 80, damping: 18 }} /></svg>
                <div className="absolute inset-0 grid place-items-center text-center"><div><div className="font-display text-2xl font-bold tabular-nums">{Math.round(r.fleschEase)}</div><div className="text-[10px] uppercase tracking-wider text-muted">Ease</div></div></div>
              </div>
              <div>
                <div className="font-display text-xl font-semibold">{easeLabel(r.fleschEase)}</div>
                <p className="mt-1 text-sm text-muted">Average grade level {r.avgGrade}. Most people read comfortably at grade 8 or below.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Flesch-Kincaid grade" value={r.fleschKincaid} />
              <Stat label="Gunning Fog" value={r.gunningFog} />
              <Stat label="SMOG" value={r.smog} />
              <Stat label="Coleman-Liau" value={r.colemanLiau} />
              <Stat label="ARI" value={r.ari} />
              <Stat label="Complex words" value={r.complex} sub={r.words ? `${Math.round((r.complex / r.words) * 100)}% of words` : ''} />
              <Stat label="Words" value={r.words.toLocaleString()} />
              <Stat label="Sentences" value={r.sentences} sub={r.sentences ? `${Math.round(r.words / r.sentences)} words each` : ''} />
              <Stat label="Reading time" value={fmtMin(r.readingMinutes)} sub={`Speaking ${fmtMin(r.speakingMinutes)}`} />
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="mb-2 text-sm font-semibold">Hard sentences ({r.hardSentences.length})</div>
              {r.hardSentences.length ? (
                <ul className="scrollbar-thin max-h-48 space-y-2 overflow-auto text-sm">
                  {r.hardSentences.map((s, i) => <li key={i} className="rounded-lg border-l-2 border-warn bg-surface-2/40 px-3 py-2"><span className="mr-2 rounded bg-warn/15 px-1.5 text-xs font-semibold text-warn">grade {s.grade}</span>{s.text}</li>)}
                </ul>
              ) : <p className="text-sm text-muted">No long or hard sentences. Nice and clear.</p>}
            </div>
          </div>
        ) : (
          <Pane title="Bionic reading" className="h-[480px]" actions={<><CopyButton text={() => bio} label="Copy HTML" variant="ghost" /><DownloadButton text={() => `<!doctype html><meta charset="utf-8"><style>body{font:18px/1.7 system-ui;max-width:720px;margin:40px auto;padding:0 16px}b{font-weight:700}</style><p>${bio}</p>`} filename="bionic.html" mime="text/html" /></>}>
            <div className="scrollbar-thin h-full overflow-auto p-5 text-[17px] leading-8 [&_b]:font-bold" dangerouslySetInnerHTML={{ __html: bio }} />
          </Pane>
        )}
      </div>
    </div>
  )
}
