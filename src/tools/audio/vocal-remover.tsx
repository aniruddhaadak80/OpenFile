import { useState } from 'react'
import { MicOff, Download } from 'lucide-react'
import { Button, Dropzone, Label, Select, Segmented, Slider, ToolGrid, Progress, ErrorNote } from '@/components/ui'
import { baseName, downloadBlob, formatBytes } from '@/lib/files'
import { decodeAudioFile, encodeBuffer } from '@/tools/video/_media/audio'
import { useObjectUrl } from '@/tools/video/_media/media'
import { FileBar, Note } from '@/tools/video/_media/ui'
import { AV_ACCEPT } from './_b4/FxShell'

type Fmt = 'mp3' | 'wav' | 'm4a' | 'ogg'

/** Render instrumental (center removed, bass kept) and an isolated center (vocal) track with Web Audio. */
async function separate(buf: AudioBuffer, strength: number, bassHz: number, vocalLo: number, vocalHi: number) {
  if (buf.numberOfChannels < 2) throw new Error('This file is mono. Vocal removal needs a stereo recording, because it works by cancelling sound that is the same in both channels.')
  const render = async (build: (ctx: OfflineAudioContext, l: AudioNode, r: AudioNode) => void) => {
    const ctx = new OfflineAudioContext(2, buf.length, buf.sampleRate)
    const src = ctx.createBufferSource(); src.buffer = buf
    const split = ctx.createChannelSplitter(2); src.connect(split)
    const l = ctx.createGain(), r = ctx.createGain(); split.connect(l, 0); split.connect(r, 1)
    build(ctx, l, r); src.start()
    return ctx.startRendering()
  }
  // instrumental: L - k*R and R - k*L keeps stereo feel; add back the low end from the mid signal
  const inst = await render((ctx, l, r) => {
    const merge = ctx.createChannelMerger(2)
    const nr = ctx.createGain(); nr.gain.value = -strength; r.connect(nr)
    const nl = ctx.createGain(); nl.gain.value = -strength; l.connect(nl)
    l.connect(merge, 0, 0); nr.connect(merge, 0, 0)
    r.connect(merge, 0, 1); nl.connect(merge, 0, 1)
    // bass from mid
    const mid = ctx.createGain(); mid.gain.value = 0.5 * strength; l.connect(mid); r.connect(mid)
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = bassHz; lp.Q.value = 0.7
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = bassHz; lp2.Q.value = 0.7
    mid.connect(lp).connect(lp2)
    lp2.connect(merge, 0, 0); lp2.connect(merge, 0, 1)
    merge.connect(ctx.destination)
  })
  // vocals: the mid (center) signal band-passed to the voice range
  const voc = await render((ctx, l, r) => {
    const mid = ctx.createGain(); mid.gain.value = 0.5; l.connect(mid); r.connect(mid)
    const sum = ctx.createGain(); mid.connect(sum)
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = vocalLo; hp.Q.value = 0.7
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = vocalHi; lp.Q.value = 0.7
    sum.connect(hp).connect(lp)
    const merge = ctx.createChannelMerger(2); lp.connect(merge, 0, 0); lp.connect(merge, 0, 1)
    merge.connect(ctx.destination)
  })
  for (const b of [inst, voc]) { let peak = 0; for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i])) } if (peak > 0) { const k = 0.95 / peak; for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k } } }
  return { inst, voc }
}

export default function VocalRemover() {
  const [file, setFile] = useState<File | null>(null)
  const [strength, setStrength] = useState(100)
  const [bass, setBass] = useState(150)
  const [range, setRange] = useState<'male' | 'female' | 'wide'>('wide')
  const [fmt, setFmt] = useState<Fmt>('mp3')
  const [busy, setBusy] = useState(false)
  const [p, setP] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [out, setOut] = useState<{ inst: Blob; voc: Blob } | null>(null)
  const instUrl = useObjectUrl(out?.inst), vocUrl = useObjectUrl(out?.voc), srcUrl = useObjectUrl(file)

  const run = async () => {
    if (!file) return
    setBusy(true); setError(null); setOut(null); setP(0.05)
    try {
      const buf = await decodeAudioFile(file)
      setP(0.25)
      const [lo, hi] = range === 'male' ? [90, 5000] : range === 'female' ? [160, 8000] : [120, 9000]
      const { inst, voc } = await separate(buf, strength / 100, bass, lo, hi)
      setP(0.55)
      const a = await encodeBuffer(inst, fmt, 192, (x) => setP(0.55 + x * 0.2))
      const b = await encodeBuffer(voc, fmt, 192, (x) => setP(0.75 + x * 0.25))
      setOut({ inst: a, voc: b })
    } catch (e: any) { setError(e?.message || 'Processing failed.') } finally { setBusy(false) }
  }

  if (!file) return <Dropzone accept={AV_ACCEPT} onFiles={(f) => { setFile(f[0]); setOut(null) }} label="Drop a stereo song" sub="Make a karaoke version by removing centered vocals, and get a rough vocal track. Runs on your device." />
  return (
    <ToolGrid
      main={<>
        <FileBar file={file} onReset={() => { setFile(null); setOut(null) }} />
        <div className="space-y-2 rounded-2xl border border-border bg-surface p-4"><Label className="mb-0">Original</Label><audio src={srcUrl ?? undefined} controls className="w-full" /></div>
        <ErrorNote error={error} />
        {busy && <Progress value={p} label="Separating" />}
        {out && instUrl && vocUrl && <div className="grid gap-3 sm:grid-cols-2">
          {[['Instrumental (karaoke)', out.inst, instUrl, 'instrumental'], ['Vocals (approximate)', out.voc, vocUrl, 'vocals']].map(([t, b, u, s]) => (
            <div key={s as string} className="space-y-2 rounded-2xl border border-success/30 bg-success/5 p-4">
              <div className="flex items-center justify-between"><span className="text-sm font-semibold">{t as string}</span><span className="text-xs text-muted">{formatBytes((b as Blob).size)}</span></div>
              <audio src={u as string} controls className="w-full" />
              <Button size="sm" className="w-full" icon={<Download className="size-4" />} onClick={() => downloadBlob(b as Blob, `${baseName(file.name)}-${s}.${fmt}`)}>Download</Button>
            </div>))}
        </div>}
      </>}
      side={<>
        <Slider label="Removal strength" value={strength} onChange={setStrength} min={50} max={100} suffix="%" />
        <Slider label="Keep bass below" value={bass} onChange={setBass} min={60} max={300} step={10} suffix=" Hz" />
        <p className="-mt-3 text-xs text-muted">Bass and kick drums are usually centered too. This keeps them in the instrumental.</p>
        <div><Label>Voice range (vocal track)</Label><Segmented value={range} onChange={setRange} options={[{ value: 'male', label: 'Low' }, { value: 'female', label: 'High' }, { value: 'wide', label: 'Wide' }]} /></div>
        <div><Label>Format</Label><Select value={fmt} onChange={setFmt} options={[{ value: 'mp3', label: 'MP3' }, { value: 'm4a', label: 'M4A' }, { value: 'ogg', label: 'OGG' }, { value: 'wav', label: 'WAV' }]} /></div>
        <Button size="lg" className="w-full" icon={<MicOff className="size-5" />} onClick={run} loading={busy}>Remove vocals</Button>
        <Note>This uses classic center-channel cancellation, not an AI stem splitter. It works best on studio songs with vocals in the middle of the mix. Live recordings and songs with stereo reverb on the voice keep some vocal traces.</Note>
      </>}
    />
  )
}
