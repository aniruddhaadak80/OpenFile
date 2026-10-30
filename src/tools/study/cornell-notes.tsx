import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { Button, Card, Input, Label, Segmented, Slider, Switch, Textarea } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { cornellPdf } from '@/lib/cf/print'
import { today } from '@/lib/cf/ui'

export default function CornellNotes() {
  const [title, setTitle] = useState('Lecture 4: Cell division'), [subject, setSubject] = useState('Biology'), [date, setDate] = useState(today())
  const [cues, setCues] = useState('What are the stages of mitosis?\nWhy does a cell divide?\nMitosis vs meiosis?')
  const [notes, setNotes] = useState('Mitosis makes two identical cells. Stages: prophase, metaphase, anaphase, telophase.\nChromosomes line up in the middle during metaphase.\nMeiosis makes four cells with half the chromosomes, used for eggs and sperm.')
  const [summary, setSummary] = useState('Cells divide to grow and repair. Mitosis copies a cell exactly; meiosis halves the chromosomes for reproduction.')
  const [pages, setPages] = useState(1), [lines, setLines] = useState(true), [size, setSize] = useState<'a4' | 'letter'>('a4'), [blank, setBlank] = useState(false)
  const make = async () => downloadBlob(await cornellPdf({ title, subject, date, cues: blank ? '' : cues, notes: blank ? '' : notes, summary: blank ? '' : summary, pages, size, lines }), `${blank ? 'cornell-template' : title.replace(/\W+/g, '-').toLowerCase()}.pdf`)
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_10rem_10rem]"><Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" className="font-semibold" /><Input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" /><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" /></div>
        <div className="grid gap-3 md:grid-cols-[0.42fr_1fr]">
          <div><Label>Cues and questions</Label><Textarea value={cues} onChange={(e) => setCues(e.target.value)} className="min-h-72 font-sans text-sm" /></div>
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-72 font-sans text-sm" /></div>
        </div>
        <div><Label>Summary</Label><Textarea value={summary} onChange={(e) => setSummary(e.target.value)} className="min-h-20 font-sans text-sm" /></div>
      </Card>
      <Card className="space-y-4 self-start">
        <p className="text-sm text-muted">Take notes on the right during class. After class, write questions on the left and a short summary at the bottom. Cover the notes and answer the questions to review.</p>
        <Switch checked={blank} onChange={setBlank} label="Blank template (keep title only)" />
        <Slider label="Pages" value={pages} onChange={setPages} min={1} max={30} />
        <Switch checked={lines} onChange={setLines} label="Ruled lines" />
        <div><Label>Paper</Label><Segmented value={size} onChange={setSize} options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }]} /></div>
        <Button className="w-full" icon={<FileDown className="size-4" />} onClick={make}>Download PDF</Button>
      </Card>
    </div>
  )
}
