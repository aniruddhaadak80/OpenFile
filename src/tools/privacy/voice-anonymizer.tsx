import { useMemo, useState } from 'react'
import { safeBlobUrl } from '@/lib/safe'
import { AudioLines } from 'lucide-react'
import { Button, Card, Dropzone, Label, Slider, Switch, ResultCard } from '@/components/ui'
import { FfProgress, useFfJob, ffProbe, ffRun, extOf } from '@/lib/cf/ff'
import { FileBar } from '@/lib/cf/ui'
import { useObjectUrl } from '@/lib/bcat/kit'

const PRESETS = [{ id: 'deep', label: 'Deeper', pitch: -5, radio: false, robot: false, noise: 0 }, { id: 'high', label: 'Higher', pitch: 5, radio: false, robot: false, noise: 0 }, { id: 'radio', label: 'Phone call', pitch: -3, radio: true, robot: false, noise: 0.02 }, { id: 'robot', label: 'Robot', pitch: -2, radio: false, robot: true, noise: 0 }, { id: 'strong', label: 'Strong disguise', pitch: -6, radio: true, robot: true, noise: 0.03 }]

export function voiceFilter(o: { pitch: number; radio: boolean; robot: boolean; noise: number; rate: number }) {
  const f = 2 ** (o.pitch / 12)
  const chain = [`asetrate=${Math.round(o.rate * f)}`, `aresample=${o.rate}`]
  let t = 1 / f; while (t > 2) { chain.push('atempo=2'); t /= 2 } while (t < 0.5) { chain.push('atempo=0.5'); t /= 0.5 } chain.push(`atempo=${t.toFixed(5)}`)
  if (o.robot) chain.push('aecho=0.8:0.88:6:0.4', 'vibrato=f=55:d=0.35')
  if (o.radio) chain.push('highpass=f=320', 'lowpass=f=3200', 'acompressor=threshold=0.1:ratio=6')
  chain.push('alimiter=limit=0.95')
  return chain.join(',')
}

export default function VoiceAnonymizer() {
  const [file, setFile] = useState<File | null>(null)
  const [pitch, setPitch] = useState(-5), [radio, setRadio] = useState(false), [robot, setRobot] = useState(false), [noise, setNoise] = useState(0)
  const [out, setOut] = useState<{ blob: Blob; name: string; preview: boolean } | null>(null)
  const job = useFfJob()
  const srcUrl = useObjectUrl(file), outUrl = useObjectUrl(out?.blob)
  const isVideo = !!file && (file.type.startsWith('video') || /\.(mp4|mov|mkv|webm|avi)$/i.test(file.name))
  const ext = file ? extOf(file.name) : ''
  const af = useMemo(() => (r: number) => voiceFilter({ pitch, radio, robot, noise, rate: r }), [pitch, radio, robot, noise])
  const go = (preview: boolean) => job.run(async (p, l) => {
    if (!file) return
    l('Reading the file'); const info = await ffProbe(file)
    if (!info.hasAudio) throw new Error('This file has no sound track.')
    const rate = info.sampleRate || 48000, input = 'in.' + (ext || 'bin')
    const filter = noise > 0 ? `[0:a]${af(rate)}[v];anoisesrc=color=pink:amplitude=${noise}:sample_rate=${rate}[n];[v][n]amix=inputs=2:duration=first:normalize=0[a]` : `[0:a]${af(rate)}[a]`
    const output = isVideo && !preview ? 'out.mp4' : 'out.m4a'
    l(preview ? 'Making a 10 second preview' : 'Changing the voice')
    const args = ['-i', input, ...(preview ? ['-t', '10'] : []), '-filter_complex', filter, ...(isVideo && !preview ? ['-map', '0:v:0', '-c:v', 'copy'] : ['-vn']), '-map', '[a]', '-c:a', 'aac', '-b:a', '160k', '-map_metadata', '-1', output]
    const blob = await ffRun({ inputs: [{ name: input, file }], args, output, duration: preview ? Math.min(10, info.duration) : info.duration, onProgress: p })
    setOut({ blob, name: file.name.replace(/\.[^.]+$/, '') + (preview ? '-preview.m4a' : isVideo ? '-anon.mp4' : '-anon.m4a'), preview })
  })
  if (!file) return <Dropzone accept="audio/*,video/*" onFiles={(f) => { setFile(f[0]); setOut(null) }} label="Drop a voice recording or video" sub="Change pitch and tone so a voice is harder to recognise. Video stays as it is, only the sound changes." />
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-3">
        <FileBar name={file.name} size={file.size} onReset={() => { setFile(null); setOut(null) }} />
        {srcUrl && <div><Label>Original</Label>{isVideo ? <video src={safeBlobUrl(srcUrl)} controls className="max-h-64 w-full rounded-xl" /> : <audio src={safeBlobUrl(srcUrl)} controls className="w-full" />}</div>}
        <FfProgress job={job} />
        {out && outUrl && <div className="space-y-2"><Label>{out.preview ? 'Preview (first 10 seconds)' : 'Changed voice'}</Label>{out.name.endsWith('.mp4') ? <video src={safeBlobUrl(outUrl)} controls className="max-h-64 w-full rounded-xl" /> : <audio src={safeBlobUrl(outUrl)} controls className="w-full" />}{!out.preview && <ResultCard blob={out.blob} filename={out.name} title="Done" />}</div>}
      </div>
      <Card className="space-y-4 self-start">
        <div><Label>Presets</Label><div className="flex flex-wrap gap-1.5">{PRESETS.map((x) => <button key={x.id} onClick={() => { setPitch(x.pitch); setRadio(x.radio); setRobot(x.robot); setNoise(x.noise); setOut(null) }} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-fg cursor-pointer">{x.label}</button>)}</div></div>
        <Slider label="Pitch" value={pitch} onChange={(v) => { setPitch(v); setOut(null) }} min={-12} max={12} suffix=" semitones" />
        <Switch checked={radio} onChange={(v) => { setRadio(v); setOut(null) }} label="Phone line sound" />
        <Switch checked={robot} onChange={(v) => { setRobot(v); setOut(null) }} label="Robotic texture" />
        <Slider label="Background hiss" value={Math.round(noise * 100)} onChange={(v) => { setNoise(v / 100); setOut(null) }} min={0} max={8} suffix="%" />
        <Button variant="outline" className="w-full" disabled={job.busy} onClick={() => go(true)}>Hear a preview</Button>
        <Button className="w-full" icon={<AudioLines className="size-4" />} disabled={job.busy} onClick={() => go(false)}>Change voice</Button>
        <p className="text-xs text-muted">Pitch changes make casual recognition much harder, but they can be partly undone by experts. For strong protection, combine pitch with the phone line and robotic options, and remove names said aloud.</p>
      </Card>
    </div>
  )
}
