import { useMemo, useState } from 'react'
import { Gauge, Download, X } from 'lucide-react'
import { Button, Dropzone, Field, Select, ToolGrid, Progress, ErrorNote, cn } from '@/components/ui'
import { baseName, downloadBlob } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { decodeAudioFile } from '@/tools/video/_media/audio'
import { PLATFORMS, wav16, type Loudness } from '@/lib/b14/audio'
import { analyse, cancelAnalysis } from '@/lib/b14/audioRun'
import { Tile } from '@/lib/b14/ui'

const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '-inf')

export default function LoudnessMeter() {
  const [file, setFile] = useState<File | null>(null)
  const [buf, setBuf] = useState<AudioBuffer | null>(null)
  const [res, setRes] = useState<Loudness | null>(null)
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [target, setTarget] = useState('Spotify')
  const open = async (f: File) => {
    setFile(f); setRes(null); setErr(null); setBusy(true); setProg(0.05)
    try {
      const b = await decodeAudioFile(f); setBuf(b)
      const chans = Array.from({ length: b.numberOfChannels }, (_, i) => b.getChannelData(i))
      setRes(await analyse<Loudness>('loudness', chans, b.sampleRate, {}, (p) => setProg(0.1 + p * 0.9)))
    } catch (e: any) { if (e?.name !== 'CancelledError') setErr(e?.message || 'Could not read this audio file.') } finally { setBusy(false) }
  }
  const plat = PLATFORMS.find((p) => p.name === target)!
  const gain = useMemo(() => { if (!res || !Number.isFinite(res.integrated)) return 0; const want = plat.lufs - res.integrated; return Math.min(want, plat.tp - res.truePeak) }, [res, plat])
  const normalize = () => {
    if (!buf || !file) return
    const g = Math.pow(10, gain / 20)
    const chans = Array.from({ length: buf.numberOfChannels }, (_, i) => { const c = buf.getChannelData(i), o = new Float32Array(c.length); for (let k = 0; k < c.length; k++) o[k] = c[k] * g; return o })
    downloadBlob(new Blob([wav16(chans, buf.sampleRate) as BlobPart], { type: 'audio/wav' }), `${baseName(file.name)}-${plat.lufs}LUFS.wav`)
  }
  if (!file) return <Dropzone accept="audio/*,video/*,.mp3,.wav,.flac,.m4a,.ogg,.opus,.aac" onFiles={(f) => open(f[0])} label="Drop a song, podcast or video" sub="Measures integrated LUFS, true peak and loudness range (EBU R128), then shows what Spotify, YouTube and Apple Music will do to it." />
  const short = res?.short ?? []
  const lo = -40, hi = 0
  const pts = short.map((v, i) => `${(i / Math.max(1, short.length - 1)) * 100},${100 - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 100}`).join(' ')
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { cancelAnalysis(); setFile(null); setRes(null); setBuf(null) }} />
        {busy && <div className="space-y-2 rounded-xl border border-border bg-surface-2/50 p-3"><Progress value={prog} label="Measuring loudness" /><Button size="sm" variant="outline" className="w-full" icon={<X className="size-4" />} onClick={() => { cancelAnalysis(); setBusy(false) }}>Cancel</Button></div>}
        <ErrorNote error={err} />
        {res && <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Tile label="Integrated" value={`${f1(res.integrated)} LUFS`} sub="whole file, gated" />
            <Tile label="True peak" value={`${f1(res.truePeak)} dBTP`} sub={`sample peak ${f1(res.samplePeak)} dBFS`} />
            <Tile label="Loudness range" value={`${f1(res.range)} LU`} sub="how much it varies" />
            <Tile label="Short term max" value={`${f1(res.shortMax)} LUFS`} sub="loudest 3 seconds" />
            <Tile label="Momentary max" value={`${f1(res.momentaryMax)} LUFS`} sub="loudest 0.4 seconds" />
            <Tile label="RMS" value={`${f1(res.rms)} dBFS`} sub={buf ? `${buf.numberOfChannels} ch, ${buf.sampleRate} Hz` : ''} />
          </div>
          {short.length > 1 && <div className="rounded-2xl border border-border bg-surface p-3"><div className="mb-1 text-xs text-muted">Short term loudness over time (-40 to 0 LUFS)</div><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-36 w-full" role="img" aria-label="Loudness over time"><line x1="0" x2="100" y1={100 - ((plat.lufs - lo) / (hi - lo)) * 100} y2={100 - ((plat.lufs - lo) / (hi - lo)) * 100} stroke="#14B8A6" strokeDasharray="2 2" strokeWidth="0.6" vectorEffect="non-scaling-stroke" /><polyline points={pts} fill="none" stroke="#F5A524" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg></div>}
          <div className="overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm"><thead className="bg-surface-2 text-left text-xs text-muted"><tr><th className="px-3 py-2">Platform</th><th className="px-3 py-2">Target</th><th className="px-3 py-2">What happens</th></tr></thead>
              <tbody>{PLATFORMS.map((p) => { const d = Number.isFinite(res.integrated) ? p.lufs - res.integrated : 0; return <tr key={p.name} className="border-t border-border"><td className="px-3 py-2">{p.name}</td><td className="px-3 py-2 font-mono text-xs">{p.lufs} LUFS</td><td className={cn('px-3 py-2', Math.abs(d) < 1 ? 'text-success' : 'text-muted')}>{Math.abs(d) < 1 ? 'Played as is' : d < 0 ? `Turned down ${f1(-d)} dB` : `Too quiet by ${f1(d)} dB`}{res.truePeak > p.tp ? ', peaks above ' + p.tp + ' dBTP' : ''}</td></tr> })}</tbody></table>
          </div>
        </>}
      </>}
      side={<>
        <Field label="Normalize for"><Select value={target} onChange={setTarget} options={PLATFORMS.map((p) => p.name)} /></Field>
        {res && <p className="text-sm">Gain needed: <span className="font-mono">{gain >= 0 ? '+' : ''}{gain.toFixed(1)} dB</span>{plat.lufs - res.integrated > gain + 0.05 ? <span className="block text-xs text-muted">Limited by the true peak ceiling of {plat.tp} dBTP, so it ends up a little below the target. A limiter would let it reach the target.</span> : null}</p>}
        <Button className="w-full" icon={<Download className="size-4" />} disabled={!res || !buf} onClick={normalize}>Download normalized WAV</Button>
        <p className="flex gap-1.5 text-xs text-muted"><Gauge className="size-4 shrink-0" />Measured with the ITU-R BS.1770 K-weighting and gating that streaming services use. True peak uses 4x oversampling.</p>
      </>}
    />
  )
}
