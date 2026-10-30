import { useMemo, useState } from 'react'
import { Layers, Download } from 'lucide-react'
import { Button, Dropzone, Field, Input, Segmented, ToolGrid, FileChip, Label } from '@/components/ui'
import { baseName, downloadBlob } from '@/lib/files'
import { writeSubtitles, SUB_ACCEPT, type SubDoc } from '@/lib/b4/subtitles'
import { mergeStacked, mergeAss } from '@/lib/b14/subs'
import { CueList, readSubs, attempt } from '@/lib/b14/ui'

type Out = 'ass' | 'srt' | 'vtt'

export default function SubtitleMerger() {
  const [a, setA] = useState<{ f: File; d: SubDoc } | null>(null)
  const [b, setB] = useState<{ f: File; d: SubDoc } | null>(null)
  const [out, setOut] = useState<Out>('ass')
  const [layout, setLayout] = useState<'top-bottom' | 'stacked-bottom'>('top-bottom')
  const [colorA, setColorA] = useState('#FFFFFF')
  const [colorB, setColorB] = useState('#F5A524')
  const [sizeA, setSizeA] = useState(52)
  const [sizeB, setSizeB] = useState(44)
  const load = async (f: File, which: 'a' | 'b') => { const d = await attempt(() => readSubs(f), 'Could not read this subtitle file.'); if (d) (which === 'a' ? setA : setB)({ f, d }) }
  const stacked = useMemo(() => (a && b ? mergeStacked(a.d.cues, b.d.cues) : []), [a, b])
  const text = () => {
    if (!a || !b) return ''
    if (out === 'ass') return mergeAss(a.d.cues, b.d.cues, { layout, sizeA, sizeB, colorA, colorB, title: baseName(a.f.name) })
    return writeSubtitles(stacked, out)
  }
  const save = () => { if (!a) return; downloadBlob(new Blob([text()], { type: 'text/plain;charset=utf-8' }), `${baseName(a.f.name)}-dual.${out}`) }

  const slot = (which: 'a' | 'b') => {
    const v = which === 'a' ? a : b
    return v ? <FileChip file={v.f} onRemove={() => (which === 'a' ? setA : setB)(null)} extra={<span className="text-xs text-muted">{v.d.cues.length} lines</span>} />
      : <Dropzone compact accept={SUB_ACCEPT} onFiles={(f) => load(f[0], which)} label={which === 'a' ? 'Main language (bottom)' : 'Second language (top)'} sub="SRT, VTT, ASS, SBV, LRC and more" />
  }

  return (
    <ToolGrid
      main={<>
        <div className="grid gap-3 sm:grid-cols-2">{slot('a')}{slot('b')}</div>
        {a && b ? <><Label hint={`${stacked.length} merged lines`}>Preview (stacked)</Label><CueList cues={stacked} /></> : <p className="text-sm text-muted">Add two subtitle files for the same video, for example English and Spanish. Both are shown at once, so you can learn a language or share one file with two audiences.</p>}
      </>}
      side={<>
        <Field label="Output"><Segmented value={out} onChange={setOut} options={[{ value: 'ass', label: 'ASS (styled)' }, { value: 'srt', label: 'SRT' }, { value: 'vtt', label: 'VTT' }]} /></Field>
        {out === 'ass' ? <>
          <Field label="Layout"><Segmented value={layout} onChange={setLayout} options={[{ value: 'top-bottom', label: 'Top and bottom' }, { value: 'stacked-bottom', label: 'Both at bottom' }]} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Main colour"><Input type="color" value={colorA} onChange={(e) => setColorA(e.target.value)} aria-label="Main colour" /></Field>
            <Field label="Second colour"><Input type="color" value={colorB} onChange={(e) => setColorB(e.target.value)} aria-label="Second colour" /></Field>
            <Field label="Main size"><Input type="number" min={20} max={120} value={sizeA} onChange={(e) => setSizeA(+e.target.value || 52)} /></Field>
            <Field label="Second size"><Input type="number" min={20} max={120} value={sizeB} onChange={(e) => setSizeB(+e.target.value || 44)} /></Field>
          </div>
          <p className="text-xs text-muted">ASS keeps both tracks with their own timing and style. Most players (VLC, mpv, MPC) show it.</p>
        </> : <p className="text-xs text-muted">SRT and VTT cannot place text at the top, so each line shows the main text with the second language under it. Timing is split where the two tracks differ.</p>}
        <Button className="w-full" icon={<Download className="size-4" />} disabled={!a || !b} onClick={save}>Download merged file</Button>
        <p className="flex gap-1.5 text-xs text-muted"><Layers className="size-4 shrink-0" />Works on your device, nothing is uploaded.</p>
      </>}
    />
  )
}
