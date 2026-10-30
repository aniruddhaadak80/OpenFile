import { useState } from 'react'
import { Activity, Hand, X } from 'lucide-react'
import { Button, Dropzone, Field, Input, Switch, ToolGrid, Progress, cn } from '@/components/ui'
import { decodeAudioFile } from '@/tools/video/_media/audio'
import { tapBpm } from '@/lib/b14/audio'
import { analyse, cancelAnalysis } from '@/lib/b14/audioRun'
import { OpenButton } from '@/lib/b14/ui'
import { toCsv, DlButton } from '@/lib/bcat/kit'

interface Row { name: string; bpm?: number; alt?: number[]; key?: string; confidence?: number; error?: string; duration?: number }

export default function BpmFinder() {
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState(0)
  const [key, setKey] = useState(true)
  const [min, setMin] = useState(70)
  const [max, setMax] = useState(180)
  const [taps, setTaps] = useState<number[]>([])
  const run = async (files: File[]) => {
    setBusy(true); setProg(0)
    const start = rows.length
    setRows((p) => [...p, ...files.map((f) => ({ name: f.name }))])
    for (let i = 0; i < files.length; i++) {
      try {
        const buf = await decodeAudioFile(files[i], { sampleRate: 22050 })
        const n = Math.min(buf.length, 22050 * 150)
        const mono = new Float32Array(n)
        for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let k = 0; k < n; k++) mono[k] += d[k] / buf.numberOfChannels }
        const r = await analyse<{ bpm: number; candidates: { bpm: number }[]; key: string; confidence: number }>('bpm', [mono], 22050, { key, min, max }, (p) => setProg((i + p) / files.length))
        setRows((p) => p.map((x, k) => (k === start + i ? { ...x, bpm: r.bpm, alt: r.candidates.slice(1).map((c) => c.bpm), key: r.key, confidence: r.confidence, duration: buf.duration } : x)))
      } catch (e: any) {
        if (e?.name === 'CancelledError') break
        setRows((p) => p.map((x, k) => (k === start + i ? { ...x, error: 'Could not read this file' } : x)))
      }
      setProg((i + 1) / files.length)
    }
    setBusy(false)
  }
  const tap = () => { const now = performance.now(); setTaps((t) => (t.length && now - t[t.length - 1] > 2500 ? [now] : [...t, now].slice(-12))) }
  const tapped = tapBpm(taps)
  return (
    <ToolGrid
      main={<>
        {!rows.length ? <Dropzone multiple accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.opus,.aac" onFiles={run} label="Drop songs to find their BPM" sub="Many files at once. The first 2.5 minutes of each song are analysed on your device." />
          : <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{r.name}</div><div className="text-xs text-muted">{r.error ?? (r.bpm == null ? 'Analysing' : `${r.alt?.length ? `Could also be ${r.alt.map((a) => Math.round(a)).join(' or ')} BPM` : ''}`)}</div></div>
                {r.key && <span className="rounded-lg bg-surface-2 px-2 py-1 text-sm">{r.key}</span>}
                <div className={cn('font-display text-3xl font-semibold tabular-nums', r.bpm == null && 'text-muted')}>{r.bpm != null ? Math.round(r.bpm) : '--'}<span className="ml-1 text-sm text-muted">BPM</span></div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2"><OpenButton multiple accept="audio/*" onFiles={run} label="Add songs" />{rows.some((r) => r.bpm) && <DlButton name="bpm.csv" mime="text/csv" data={() => toCsv([['file', 'bpm', 'key', 'other guesses'], ...rows.map((r) => [r.name, r.bpm ? Math.round(r.bpm) : '', r.key ?? '', (r.alt ?? []).map(Math.round).join(' ')])])}>Download CSV</DlButton>}<Button size="sm" variant="ghost" onClick={() => setRows([])}>Clear</Button></div>
          </div>}
        {busy && <div className="space-y-2 rounded-xl border border-border bg-surface-2/50 p-3"><Progress value={prog} label="Finding the beat" /><Button size="sm" variant="outline" className="w-full" icon={<X className="size-4" />} onClick={() => { cancelAnalysis(); setBusy(false) }}>Cancel</Button></div>}
      </>}
      side={<>
        <Switch checked={key} onChange={setKey} label="Also guess the musical key" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lowest BPM"><Input type="number" min={30} max={max - 10} value={min} onChange={(e) => setMin(Math.max(30, +e.target.value || 70))} /></Field>
          <Field label="Highest BPM"><Input type="number" min={min + 10} max={300} value={max} onChange={(e) => setMax(Math.min(300, +e.target.value || 180))} /></Field>
        </div>
        <p className="text-xs text-muted">Results that are double or half the real tempo are common. Narrow the range (for example 70 to 140 for house, 140 to 180 for drum and bass) or check by tapping.</p>
        <div className="rounded-xl border border-border bg-surface-2/40 p-3 text-center">
          <div className="text-xs text-muted">Tap along</div>
          <div className="font-display text-4xl font-semibold tabular-nums">{tapped ? Math.round(tapped) : '--'}</div>
          <Button className="mt-2 w-full" variant="outline" icon={<Hand className="size-4" />} onClick={tap}>Tap</Button>
        </div>
        <p className="flex gap-1.5 text-xs text-muted"><Activity className="size-4 shrink-0" />Analysis runs in a background worker, so the page stays responsive.</p>
      </>}
    />
  )
}
