import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Segmented, Switch, Slider } from '@/components/ui'
import { Bar, Pane, CodeArea, OpenFileButton, useStored, useDebounced, DownloadButton, Stat } from '../dev/_b5/shell'
import { rake, wordFrequency, ngrams, words } from '@/lib/b10/text'

const SAMPLE = `Client-side file tools run in your browser, so your files never leave your device. A client-side PDF tool can merge, split and compress PDF files without uploading them. Image tools can resize, crop and convert images. Because the work happens on your device, client-side tools are private and fast, and they keep working offline.`

type Mode = 'rake' | 'words' | 'bigrams' | 'trigrams'
const csvCell = (s: string | number) => /[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s)

export default function KeywordExtractor() {
  const [text, setText] = useStored('b10:kw:text', SAMPLE)
  const [mode, setMode] = useState<Mode>('rake')
  const [stop, setStop] = useState(true)
  const [minLen, setMinLen] = useState(3)
  const [limit, setLimit] = useState(40)
  const t = useDebounced(text, 200)
  const total = useMemo(() => words(t).length, [t])
  const rows = useMemo(() => {
    if (mode === 'rake') return rake(t).map((k) => ({ term: k.phrase, value: k.score, count: k.count }))
    if (mode === 'words') return wordFrequency(t, { stop, minLen }).map((w) => ({ term: w.word, value: Math.round(w.pct * 100) / 100, count: w.count }))
    return ngrams(t, mode === 'bigrams' ? 2 : 3, stop).map((g) => ({ term: g.phrase, value: g.count, count: g.count }))
  }, [t, mode, stop, minLen])
  const shown = rows.slice(0, limit)
  const max = Math.max(1, ...shown.map((r) => r.value))
  const valueLabel = mode === 'rake' ? 'Score' : mode === 'words' ? '% of words' : 'Count'
  const csv = () => ['term,' + valueLabel.toLowerCase().replace(/ /g, '_') + ',count', ...rows.map((r) => [csvCell(r.term), r.value, r.count].join(','))].join('\n')

  return (
    <div className="space-y-4">
      <Bar>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'rake', label: 'Key phrases' }, { value: 'words', label: 'Word frequency' }, { value: 'bigrams', label: '2-word phrases' }, { value: 'trigrams', label: '3-word phrases' }]} />
        {mode !== 'rake' && <Switch checked={stop} onChange={setStop} label="Skip common words" />}
        {mode === 'words' && <Slider label="Min length" value={minLen} onChange={setMinLen} min={1} max={10} className="w-44" />}
        <Slider label="Show" value={limit} onChange={setLimit} min={10} max={200} step={10} className="w-44" />
      </Bar>
      <div className="grid gap-4 lg:grid-cols-2">
        <Pane title="Text" className="h-[520px]" actions={<OpenFileButton accept=".txt,.md,.csv,.html,text/*" onText={(x) => setText(x)} />}>
          <CodeArea value={text} onChange={setText} lineNumbers={false} placeholder="Paste an article, a page or any text" />
        </Pane>
        <Pane title={`${rows.length.toLocaleString()} results`} className="h-[520px]" actions={rows.length ? <DownloadButton text={csv} filename="keywords.csv" mime="text/csv" label="CSV" /> : null}>
          <div className="grid grid-cols-3 gap-2 border-b border-border p-3">
            <Stat label="Words" value={total.toLocaleString()} />
            <Stat label="Unique" value={new Set(words(t.toLowerCase())).size.toLocaleString()} />
            <Stat label="Top term" value={shown[0]?.term ?? 'n/a'} />
          </div>
          <div className="scrollbar-thin h-[calc(100%-82px)] overflow-auto p-3">
            {shown.length ? (
              <ol className="space-y-1.5">
                {shown.map((r, i) => (
                  <motion.li key={r.term} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 20) * 0.015 }} className="relative overflow-hidden rounded-lg bg-surface-2/40 px-3 py-1.5 text-sm">
                    <motion.div className="absolute inset-y-0 left-0 bg-accent/15" initial={{ width: 0 }} animate={{ width: `${(r.value / max) * 100}%` }} transition={{ duration: 0.5 }} />
                    <div className="relative flex items-center gap-3"><span className="w-6 text-right text-xs text-muted tabular-nums">{i + 1}</span><span className="flex-1 truncate font-medium">{r.term}</span><span className="text-xs text-muted tabular-nums">{r.count}x</span><span className="w-16 text-right font-mono text-xs tabular-nums">{r.value}</span></div>
                  </motion.li>
                ))}
              </ol>
            ) : <div className="grid h-full place-items-center text-sm text-muted">{mode.includes('grams') ? 'No phrase appears twice yet. Add more text.' : 'Add some text to see keywords.'}</div>}
          </div>
        </Pane>
      </div>
    </div>
  )
}
