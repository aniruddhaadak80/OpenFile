import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Segmented, Switch, Slider } from '@/components/ui'
import { Bar, Pane, CodeArea, OpenFileButton, useStored, useDebounced, DownloadButton, Stat, DataTable } from '../dev/_b5/shell'
import { levenshtein, damerau, hamming, jaroWinkler, cosine, jaccard, diceBigram, levRatio, fuzzyMatch } from '@/lib/b10/text'

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`
const csvCell = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s

function Meter({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2"><span className="text-sm font-medium">{label}</span><span className="font-mono text-sm tabular-nums">{pct(value)}</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"><motion.div className="h-full rounded-full bg-gradient-brand" initial={{ width: 0 }} animate={{ width: pct(Math.max(0, Math.min(1, value))) }} transition={{ type: 'spring', stiffness: 90, damping: 20 }} /></div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </div>
  )
}

export default function TextSimilarity() {
  const [mode, setMode] = useState<'pair' | 'lists'>('pair')
  const [a, setA] = useStored('b10:sim:a', 'The quick brown fox jumps over the lazy dog.')
  const [b, setB] = useStored('b10:sim:b', 'A quick brown dog jumps over the lazy fox.')
  const [la, setLa] = useStored('b10:sim:la', 'Microsoft Corp\nApple Inc.\nAlphabet\nAmazon.com Inc')
  const [lb, setLb] = useStored('b10:sim:lb', 'Amazon\nApple Incorporated\nMicrosoft Corporation\nAlphabet Inc')
  const [ci, setCi] = useState(true)
  const [threshold, setThreshold] = useState(70)
  const A = useDebounced(ci ? a.toLowerCase() : a, 150), B = useDebounced(ci ? b.toLowerCase() : b, 150)
  const pair = useMemo(() => {
    const big = A.length * B.length > 25_000_000
    return { lev: big ? null : levenshtein(A, B), dam: big || A.length * B.length > 4_000_000 ? null : damerau(A, B), ham: hamming(A, B), ratio: big ? 0 : levRatio(A, B), jw: big ? 0 : jaroWinkler(A, B), cos: cosine(A, B), jac: jaccard(A, B), dice: diceBigram(A, B) }
  }, [A, B])
  const matches = useMemo(() => (mode === 'lists' ? fuzzyMatch(la.split('\n').filter((x) => x.trim()), lb.split('\n').filter((x) => x.trim()), ci) : []), [mode, la, lb, ci])

  return (
    <div className="space-y-4">
      <Bar>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'pair', label: 'Compare two texts' }, { value: 'lists', label: 'Fuzzy match two lists' }]} />
        <Switch checked={ci} onChange={setCi} label="Ignore case" />
        {mode === 'lists' && <Slider label="Good match from" value={threshold} onChange={setThreshold} min={30} max={100} suffix="%" className="w-56" />}
      </Bar>
      {mode === 'pair' ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Pane title="Text A" className="h-56" actions={<OpenFileButton accept="text/*" onText={(x) => setA(x)} />}><CodeArea value={a} onChange={setA} lineNumbers={false} /></Pane>
            <Pane title="Text B" className="h-56" actions={<OpenFileButton accept="text/*" onText={(x) => setB(x)} />}><CodeArea value={b} onChange={setB} lineNumbers={false} /></Pane>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Levenshtein distance" value={pair.lev ?? 'too long'} sub="edits to turn A into B" />
            <Stat label="Damerau distance" value={pair.dam ?? 'too long'} sub="swaps count as one edit" />
            <Stat label="Hamming distance" value={pair.ham ?? 'n/a'} sub={pair.ham == null ? 'needs equal length' : 'differing positions'} />
            <Stat label="Length" value={`${[...A].length} / ${[...B].length}`} sub="characters A / B" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Meter label="Edit similarity" value={pair.ratio} hint="1 minus edits divided by the longer length" />
            <Meter label="Jaro-Winkler" value={pair.jw} hint="Good for names and short strings" />
            <Meter label="Cosine (words)" value={pair.cos} hint="Shared words, order ignored" />
            <Meter label="Jaccard (words)" value={pair.jac} hint="Shared unique words over all unique words" />
            <Meter label="Dice (letter pairs)" value={pair.dice} hint="Robust to small typos" />
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Pane title="List A (one per line)" className="h-60" actions={<OpenFileButton accept=".txt,.csv,text/*" onText={(x) => setLa(x)} />}><CodeArea value={la} onChange={setLa} /></Pane>
            <Pane title="List B (one per line)" className="h-60" actions={<OpenFileButton accept=".txt,.csv,text/*" onText={(x) => setLb(x)} />}><CodeArea value={lb} onChange={setLb} /></Pane>
          </div>
          <Pane title={`Best match in B for each line of A (${matches.filter((m) => m.score * 100 >= threshold).length} of ${matches.length} good)`} actions={matches.length ? <DownloadButton text={() => ['a,b,score', ...matches.map((m) => [csvCell(m.a), csvCell(m.b), m.score.toFixed(4)].join(','))].join('\n')} filename="fuzzy-matches.csv" mime="text/csv" label="CSV" /> : null}>
            <DataTable className="max-h-96 border-0" columns={['List A', 'Best match in B', 'Score', 'Good']} rows={matches.map((m) => [m.a, m.b, pct(m.score), m.score * 100 >= threshold ? 'yes' : 'no'])} />
          </Pane>
        </>
      )}
    </div>
  )
}
