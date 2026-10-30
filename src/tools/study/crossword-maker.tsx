import { useMemo, useState } from 'react'
import { FileDown, RefreshCw } from 'lucide-react'
import { Button, Card, Input, Label, Segmented, Switch, Textarea } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { crossword } from '@/lib/cf/study'
import { gridPuzzlePdf } from '@/lib/cf/print'

const SAMPLE = `MERCURY - Closest planet to the Sun
VENUS - Hottest planet
EARTH - The planet we live on
MARS - The red planet
JUPITER - Largest planet
SATURN - Planet with famous rings
ORBIT - Path around a star
COMET - Icy body with a tail
GALAXY - Huge group of stars
MOON - Earth's natural satellite`

export default function CrosswordMaker() {
  const [title, setTitle] = useState('Space crossword'), [text, setText] = useState(SAMPLE), [seed, setSeed] = useState(1), [show, setShow] = useState(false), [paper, setPaper] = useState<'a4' | 'letter'>('a4')
  const items = useMemo(() => text.split('\n').map((l) => l.match(/^\s*([^-:=\t]+?)\s*(?:-|:|=|\t)\s*(.+)$/)).filter(Boolean).map((m) => ({ word: m![1], clue: m![2] })), [text])
  const cw = useMemo(() => { try { return { r: crossword(items, { seed, tries: 40 }), e: null } } catch (e: any) { return { r: null, e: e.message as string } } }, [items, seed])
  const nums = useMemo(() => { const m = new Map<string, number>(); cw.r?.entries.forEach((e) => m.set(`${e.r},${e.c}`, e.num!)); return m }, [cw])
  const clues = cw.r ? { across: cw.r.entries.filter((e) => e.across).sort((a, b) => a.num! - b.num!).map((e) => `${e.num}. ${e.clue} (${e.word.length})`), down: cw.r.entries.filter((e) => !e.across).sort((a, b) => a.num! - b.num!).map((e) => `${e.num}. ${e.clue} (${e.word.length})`) } : { across: [], down: [] }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="min-w-0 space-y-4">
        <div className="font-display text-xl font-bold">{title}</div>
        {cw.r && <div className="overflow-auto"><div className="mx-auto grid w-fit" style={{ gridTemplateColumns: `repeat(${cw.r.cols}, 1.9rem)` }}>
          {cw.r.grid.flatMap((row, r) => row.map((ch, c) => <div key={`${r},${c}`} className={`relative grid size-[1.9rem] place-items-center text-sm font-bold ${ch == null ? '' : 'border border-fg/40 bg-surface-2'}`}>{nums.get(`${r},${c}`) && <span className="absolute left-0.5 top-0 text-[8px] font-normal text-muted">{nums.get(`${r},${c}`)}</span>}{ch != null && show ? ch : ''}</div>))}
        </div></div>}
        {cw.e && <p className="text-sm text-danger">{cw.e}</p>}
        <div className="grid gap-4 sm:grid-cols-2 text-sm">{(['across', 'down'] as const).map((k) => <div key={k}><div className="mb-1 font-semibold capitalize">{k}</div>{clues[k].map((c) => <div key={c}>{c}</div>)}</div>)}</div>
        {cw.r && cw.r.skipped.length > 0 && <p className="text-sm text-warn">Could not link: {cw.r.skipped.join(', ')}. Shuffle or add words that share letters.</p>}
      </Card>
      <Card className="space-y-4 self-start">
        <div><Label>Title</Label><Input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><Label hint={`${items.length}`}>WORD - clue, one per line</Label><Textarea aria-label="WORD - clue, one per line" value={text} onChange={(e) => setText(e.target.value)} className="min-h-56 font-sans text-sm" /></div>
        <Switch checked={show} onChange={setShow} label="Show answers" />
        <div><Label>Paper</Label><Segmented value={paper} onChange={setPaper} options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }]} /></div>
        <div className="grid grid-cols-[auto_1fr] gap-2"><Button variant="outline" icon={<RefreshCw className="size-4" />} onClick={() => setSeed(seed + 1)}>Shuffle</Button>
          <Button icon={<FileDown className="size-4" />} disabled={!cw.r} onClick={async () => downloadBlob(await gridPuzzlePdf({ title, grid: cw.r!.grid, clues, numbers: nums, showLetters: false, size: paper }), `${title.replace(/\W+/g, '-').toLowerCase() || 'crossword'}.pdf`)}>PDF with answers</Button></div>
      </Card>
    </div>
  )
}
