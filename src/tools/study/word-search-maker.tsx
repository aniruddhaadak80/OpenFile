import { useMemo, useState } from 'react'
import { FileDown, RefreshCw } from 'lucide-react'
import { Button, Card, Input, Label, Segmented, Slider, Switch, Textarea } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { wordSearch } from '@/lib/cf/study'
import { gridPuzzlePdf } from '@/lib/cf/print'

export default function WordSearchMaker() {
  const [title, setTitle] = useState('Ocean animals')
  const [words, setWords] = useState('dolphin\nwhale\nshark\noctopus\nturtle\njellyfish\nseahorse\ncrab\nstarfish\nsquid\nlobster\nseal')
  const [size, setSize] = useState(14), [diag, setDiag] = useState(true), [back, setBack] = useState(false), [seed, setSeed] = useState(7), [show, setShow] = useState(false)
  const [paper, setPaper] = useState<'a4' | 'letter'>('a4')
  const list = useMemo(() => words.split(/[\n,]+/).map((w) => w.trim()).filter(Boolean), [words])
  const ws = useMemo(() => wordSearch(list, size, { seed, diagonal: diag, backwards: back }), [list, size, seed, diag, back])
  const hl = useMemo(() => { const s = new Set<string>(); for (const p of ws.placed) for (let k = 0; k < p.word.length; k++) s.add(`${p.r + p.dr * k},${p.c + p.dc * k}`); return s }, [ws])
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="min-w-0 space-y-3">
        <div className="font-display text-xl font-bold">{title}</div>
        <div className="mx-auto grid w-fit gap-0.5 font-mono font-bold" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }} role="grid" aria-label="Word search grid">
          {ws.grid.flatMap((row, r) => row.map((ch, c) => <div key={`${r},${c}`} className={`grid size-6 place-items-center rounded text-sm sm:size-7 ${show && hl.has(`${r},${c}`) ? 'bg-accent/30 text-fg' : 'text-fg/85'}`}>{ch}</div>))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">{ws.placed.map((p) => <span key={p.word} className="font-mono">{p.word}</span>)}</div>
        {ws.skipped.length > 0 && <p className="text-sm text-warn">Did not fit: {ws.skipped.join(', ')}. Make the grid bigger.</p>}
      </Card>
      <Card className="space-y-4 self-start">
        <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><Label hint={`${list.length}`}>Words, one per line</Label><Textarea value={words} onChange={(e) => setWords(e.target.value)} className="min-h-40 font-sans" /></div>
        <Slider label="Grid size" value={size} onChange={setSize} min={8} max={24} />
        <Switch checked={diag} onChange={setDiag} label="Diagonal words" /><Switch checked={back} onChange={setBack} label="Backwards words (harder)" /><Switch checked={show} onChange={setShow} label="Show answers" />
        <div><Label>Paper</Label><Segmented value={paper} onChange={setPaper} options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }]} /></div>
        <div className="grid grid-cols-[auto_1fr] gap-2"><Button variant="outline" icon={<RefreshCw className="size-4" />} onClick={() => setSeed(Math.floor(Math.random() * 1e6))}>Shuffle</Button>
          <Button icon={<FileDown className="size-4" />} disabled={!ws.placed.length} onClick={async () => downloadBlob(await gridPuzzlePdf({ title, grid: ws.grid, words: ws.placed.map((p) => p.word).sort(), showLetters: true, size: paper, highlight: hl }), `${title.replace(/\W+/g, '-').toLowerCase() || 'word-search'}.pdf`)}>PDF with answers</Button></div>
      </Card>
    </div>
  )
}
