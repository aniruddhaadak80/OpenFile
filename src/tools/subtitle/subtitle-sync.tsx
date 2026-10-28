import { useMemo, useState } from 'react'
import { Timer, Download } from 'lucide-react'
import { Button, Dropzone, Label, Select, Segmented, Switch, ToolGrid, ErrorNote, Input } from '@/components/ui'
import { baseName, downloadBlob } from '@/lib/files'
import { parseSubtitles, writeSubtitles, shiftCues, scaleCues, twoPointSync, fixOverlaps, fmtClock, parseClock, plainText, SUB_FORMATS, SUB_ACCEPT, subExt, subMime, type SubDoc, type SubFormat, type Cue } from '@/lib/b4/subtitles'
import { readTextFile } from '@/lib/b4/text'
import { TopBar } from '@/lib/b4/ui'

type Mode = 'shift' | 'fps' | 'two'
const FPS = ['23.976', '24', '25', '29.97', '30', '50', '59.94', '60']

function TimeField({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [t, setT] = useState(fmtClock(value, '.'))
  const [focus, setFocus] = useState(false)
  const shown = focus ? t : fmtClock(value, '.')
  return <Input aria-label={label} value={shown} onFocus={() => { setFocus(true); setT(fmtClock(value, '.')) }} onChange={(e) => setT(e.target.value)} onBlur={() => { setFocus(false); const v = parseClock(t); if (Number.isFinite(v)) onChange(v) }} className="font-mono" />
}

export default function SubtitleSync() {
  const [file, setFile] = useState<File | null>(null)
  const [doc, setDoc] = useState<SubDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('shift')
  const [shift, setShift] = useState('1.000')
  const [dir, setDir] = useState<'later' | 'earlier'>('later')
  const [fromCue, setFromCue] = useState(1)
  const [fpsFrom, setFpsFrom] = useState('25')
  const [fpsTo, setFpsTo] = useState('23.976')
  const [a, setA] = useState(0)
  const [b, setB] = useState(0)
  const [aT, setAT] = useState(0)
  const [bT, setBT] = useState(0)
  const [fix, setFix] = useState(false)
  const [out, setOut] = useState<SubFormat>('srt')

  const open = async (f: File) => {
    setFile(f); setError(null)
    try {
      const d = parseSubtitles((await readTextFile(f)).text, { name: f.name })
      setDoc(d); setOut(d.format === 'txt' ? 'srt' : d.format)
      const last = d.cues.length - 1
      setA(0); setB(last); setAT(d.cues[0].start); setBT(d.cues[last].start)
    } catch (e: any) { setError(e?.message || 'Could not read this subtitle file.') }
  }

  const fixed: Cue[] = useMemo(() => {
    if (!doc) return []
    let c = doc.cues
    try {
      if (mode === 'shift') {
        const s = (parseClock(shift) || 0) * (dir === 'later' ? 1 : -1)
        const i = Math.max(0, fromCue - 1)
        c = [...c.slice(0, i), ...shiftCues(c.slice(i), s)]
      } else if (mode === 'fps') c = scaleCues(c, (+fpsFrom || 25) / (+fpsTo || 25))
      else c = twoPointSync(c, doc.cues[a].start, aT, doc.cues[b].start, bT)
    } catch { /* invalid input, keep original */ }
    return fix ? fixOverlaps(c) : c
  }, [doc, mode, shift, dir, fromCue, fpsFrom, fpsTo, a, b, aT, bT, fix])

  const save = () => { if (!doc || !file) return; downloadBlob(new Blob([writeSubtitles(fixed, out, { assHeader: doc.assHeader })], { type: subMime(out) }), `${baseName(file.name)}-synced.${subExt(out)}`) }
  const cueOpts = doc ? doc.cues.map((c, i) => ({ value: String(i), label: `#${i + 1} ${fmtClock(c.start, '.')} ${plainText(c.text).slice(0, 40)}` })) : []

  if (!file) return <Dropzone accept={SUB_ACCEPT} onFiles={(f) => open(f[0])} label="Drop subtitles that are out of sync" sub="Shift all lines, fix frame rate drift, or line up two points. SRT, VTT, ASS, SUB and more." />
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); setDoc(null) }} />
        <ErrorNote error={error} />
        {doc && <div className="max-h-[60vh] overflow-auto rounded-xl border border-border bg-surface scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Before</th><th className="px-3 py-2">After</th><th className="px-3 py-2">Text</th></tr></thead>
            <tbody>{doc.cues.slice(0, 400).map((c, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-3 py-1.5 font-mono text-xs text-muted">{i + 1}</td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-muted">{fmtClock(c.start, '.')}</td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-accent">{fixed[i] ? fmtClock(fixed[i].start, '.') : ''}</td>
                <td className="px-3 py-1.5"><span className="line-clamp-1">{plainText(c.text)}</span></td>
              </tr>))}</tbody>
          </table>
        </div>}
      </>}
      side={<>
        <div><Label>Method</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'shift', label: 'Shift' }, { value: 'fps', label: 'Frame rate' }, { value: 'two', label: 'Two points' }]} /></div>
        {mode === 'shift' && <>
          <div><Label>Move by (seconds)</Label><Input value={shift} onChange={(e) => setShift(e.target.value)} inputMode="decimal" className="font-mono" aria-label="Seconds to shift" /></div>
          <Segmented value={dir} onChange={setDir} options={[{ value: 'later', label: 'Show later' }, { value: 'earlier', label: 'Show earlier' }]} />
          <div><Label>Start from line</Label><Input type="number" min={1} max={doc?.cues.length ?? 1} value={fromCue} onChange={(e) => setFromCue(Math.max(1, +e.target.value || 1))} aria-label="Start from line" /><p className="mt-1 text-xs text-muted">Useful when only the second half is off, for example after an ad break.</p></div>
        </>}
        {mode === 'fps' && <>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Made for</Label><Select value={fpsFrom} onChange={setFpsFrom} options={FPS} /></div>
            <div><Label>Video is</Label><Select value={fpsTo} onChange={setFpsTo} options={FPS} /></div>
          </div>
          <p className="text-xs text-muted">Pick this when lines start in sync but drift further off over time. 25 to 23.976 is the common PAL fix.</p>
        </>}
        {mode === 'two' && doc && <>
          <div className="space-y-1.5"><Label>First reference line</Label><Select value={String(a)} onChange={(v) => { setA(+v); setAT(doc.cues[+v].start) }} options={cueOpts} /><TimeField label="Correct time for first line" value={aT} onChange={setAT} /></div>
          <div className="space-y-1.5"><Label>Second reference line</Label><Select value={String(b)} onChange={(v) => { setB(+v); setBT(doc.cues[+v].start) }} options={cueOpts} /><TimeField label="Correct time for second line" value={bT} onChange={setBT} /></div>
          <p className="text-xs text-muted">Play the video, note when these two lines are actually spoken, and type those times. Everything in between is stretched to fit.</p>
        </>}
        <Switch checked={fix} onChange={setFix} label="Fix overlapping lines" />
        <div><Label>Save as</Label><Select value={out} onChange={setOut} options={SUB_FORMATS.filter((f) => f.id !== 'txt').map((f) => ({ value: f.id, label: f.label }))} /></div>
        <Button size="lg" className="w-full" icon={<Download className="size-5" />} onClick={save} disabled={!doc}>Download synced file</Button>
        <p className="flex gap-1.5 text-xs text-muted"><Timer className="size-4 shrink-0" />The table shows the new start times live as you change settings.</p>
      </>}
    />
  )
}
