import { useEffect, useMemo, useState } from 'react'
import { Check, Download, FileDown, RotateCcw, Shuffle, X } from 'lucide-react'
import { Button, Card, Label, Segmented, Switch, Textarea } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { cardsToAnki, cardsToCsv, leitnerAnswer, leitnerNext, parseCards, shuffle, rng, type Card as FCard, type Leitner } from '@/lib/cf/study'
import { cardsPdf } from '@/lib/cf/print'
import { OpenButton } from '@/lib/b14/ui'
import { toast } from '@/components/toast'

const SAMPLE = `photosynthesis - how plants turn light, water and carbon dioxide into sugar and oxygen
mitochondria - the part of a cell that releases energy from food
osmosis - water moving through a membrane from low to high concentration
enzyme - a protein that speeds up a chemical reaction
chlorophyll - the green pigment that absorbs light in plants
diffusion - particles spreading from high to low concentration`
const KEY = 'of-flashcards'
const ACCEPT = '.txt,.csv,.tsv,.md,text/plain,text/csv,text/tab-separated-values'
/** Read a picked TXT, CSV or TSV file as text; binary files get a plain message instead. */
async function readCardsFile(f: File): Promise<string | null> {
  if (f.size > 20 * 1024 * 1024) { toast('This file is too big for a card list. Pick a text or CSV file under 20 MB.', 'error'); return null }
  const t = (await f.text()).replace(/^\ufeff/, '')
  if (/\u0000/.test(t.slice(0, 4096))) { toast('This does not look like a text or CSV file. Pick a TXT, CSV or TSV file.', 'error'); return null }
  if (!t.trim()) { toast('This file is empty.', 'error'); return null }
  return t
}

export default function FlashcardMaker() {
  const [text, setText] = useState(() => localStorage.getItem(KEY) ?? SAMPLE)
  const cards = useMemo(() => parseCards(text), [text])
  const [mode, setMode] = useState<'edit' | 'study'>('edit')
  const [reverse, setReverse] = useState(false)
  const [lt, setLt] = useState<Leitner>({ box: [], due: [] }), [round, setRound] = useState(0), [cur, setCur] = useState(0), [flip, setFlip] = useState(false), [score, setScore] = useState({ right: 0, wrong: 0 })
  useEffect(() => { localStorage.setItem(KEY, text) }, [text])
  const start = () => { const n = cards.length; setLt({ box: Array(n).fill(1), due: Array(n).fill(0) }); setRound(0); setCur(0); setFlip(false); setScore({ right: 0, wrong: 0 }); setMode('study') }
  const answer = (right: boolean) => { const l = leitnerAnswer(lt, cur, right, round); setLt(l); setScore((s) => ({ right: s.right + +right, wrong: s.wrong + +!right })); setRound(round + 1); setCur(leitnerNext(l, round + 1, cur)); setFlip(false) }
  useEffect(() => { if (mode !== 'study') return; const h = (e: KeyboardEvent) => { if ((e.target as HTMLElement).tagName === 'TEXTAREA') return; if (e.key === ' ') { e.preventDefault(); setFlip((f) => !f) } else if (flip && (e.key === 'ArrowRight' || e.key === 'k')) answer(true); else if (flip && (e.key === 'ArrowLeft' || e.key === 'j')) answer(false) }; addEventListener('keydown', h); return () => removeEventListener('keydown', h) })
  const c = cards[cur]
  const mastered = lt.box.filter((b) => b >= 4).length
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><Segmented value={mode} onChange={(v) => (v === 'study' ? start() : setMode(v))} options={[{ value: 'edit', label: 'Make cards' }, { value: 'study', label: 'Study' }]} /><span className="text-sm text-muted">{cards.length} cards</span></div>
      {mode === 'edit' ? <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div onDragOver={(e) => e.preventDefault()} onDrop={async (e) => { const f = e.dataTransfer.files?.[0]; if (!f) return; e.preventDefault(); const t = await readCardsFile(f); if (t != null) { setText(t); toast(`Opened ${f.name}`) } }}>
          <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2"><Label className="mb-0">One card per line: front - back (also CSV, tab separated, or Q: / A: lines)</Label><OpenButton accept={ACCEPT} label="Open TXT or CSV" onFiles={async ([f]) => { const t = await readCardsFile(f); if (t != null) { setText(t); toast(`Opened ${f.name}, ${parseCards(t).length} cards`) } }} /></div>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-80 font-sans text-sm" aria-label="Cards, one per line: front - back" /></div>
        <Card className="space-y-3 self-start">
          <Button className="w-full" onClick={start} disabled={!cards.length}>Start studying</Button>
          <Button className="w-full" variant="outline" icon={<Shuffle className="size-4" />} onClick={() => setText(shuffle(text.split('\n'), rng(Date.now())).join('\n'))}>Shuffle order</Button>
          <Button className="w-full" variant="outline" icon={<Download className="size-4" />} disabled={!cards.length} onClick={() => downloadBlob(new Blob([cardsToAnki(cards)], { type: 'text/plain' }), 'flashcards-anki.txt')}>Anki import file</Button>
          <Button className="w-full" variant="outline" icon={<Download className="size-4" />} disabled={!cards.length} onClick={() => downloadBlob(new Blob(['\ufeff' + cardsToCsv(cards)], { type: 'text/csv' }), 'flashcards.csv')}>CSV (Quizlet, Excel)</Button>
          <Button className="w-full" variant="outline" icon={<FileDown className="size-4" />} disabled={!cards.length} onClick={async () => downloadBlob(await cardsPdf(cards, { cols: 2, rows: 4, title: 'Flashcards' }), 'flashcards-print.pdf')}>Printable PDF (double-sided)</Button>
          <p className="text-xs text-muted">Your cards are saved in this browser only. Print the PDF double-sided, flip on the long edge, and cut along the dashes.</p>
        </Card>
      </div> : c && <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between text-sm text-muted"><span>Box {lt.box[cur]} of 5</span><span>{score.right} right, {score.wrong} to review, {mastered} of {cards.length} learned</span></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-gradient-brand transition-all" style={{ width: `${(mastered / cards.length) * 100}%` }} /></div>
        <button onClick={() => setFlip(!flip)} className="grid min-h-64 w-full place-items-center rounded-3xl border border-border bg-surface p-8 text-center shadow-xl transition hover:border-accent cursor-pointer" aria-label="Flip card (space)">
          <div><div className="mb-3 text-xs uppercase tracking-widest text-muted">{flip ? 'Answer' : 'Question'}</div><div className={flip ? 'text-lg' : 'font-display text-3xl font-bold'}>{flip ? (reverse ? c.front : c.back) : reverse ? c.back : c.front}</div></div>
        </button>
        {flip ? <div className="grid grid-cols-2 gap-3"><Button variant="outline" size="lg" icon={<X className="size-5 text-danger" />} onClick={() => answer(false)}>Again (←)</Button><Button size="lg" icon={<Check className="size-5" />} onClick={() => answer(true)}>Got it (→)</Button></div> : <Button className="w-full" size="lg" variant="secondary" onClick={() => setFlip(true)}>Show answer (space)</Button>}
        <div className="flex justify-between"><Switch checked={reverse} onChange={setReverse} label="Show the back first" /><Button variant="ghost" size="sm" icon={<RotateCcw className="size-4" />} onClick={start}>Restart</Button></div>
        <p className="text-center text-xs text-muted">Cards you miss come back sooner. Cards you know move up a box and show up less often.</p>
      </div>}
    </div>
  )
}
