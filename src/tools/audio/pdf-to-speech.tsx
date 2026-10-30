import { useEffect, useRef, useState } from 'react'
import { AudioLines, Download, Square, Play } from 'lucide-react'
import { Button, Label, Select, Segmented, Slider, Switch, ToolGrid, Progress, ErrorNote } from '@/components/ui'
import { downloadBlob, formatBytes } from '@/lib/files'
import { encodeWav } from '@/tools/video/_media/audio'
import { useObjectUrl } from '@/tools/video/_media/media'
import { useDocInput, DocInput } from '@/lib/b4/aiui'
import { loadSpeech } from './_tts/neural'
import { speechLength } from '@/lib/speech-length'
import { Note } from '@/tools/video/_media/ui'

type Engine = 'neural' | 'system'
const VOICES = [
  { id: 'af_heart', label: 'Heart (US, female)' }, { id: 'af_bella', label: 'Bella (US, female)' }, { id: 'af_nicole', label: 'Nicole (US, female)' }, { id: 'am_michael', label: 'Michael (US, male)' },
  { id: 'am_fenrir', label: 'Fenrir (US, male)' }, { id: 'bf_emma', label: 'Emma (UK, female)' }, { id: 'bf_isabella', label: 'Isabella (UK, female)' }, { id: 'bm_george', label: 'George (UK, male)' }, { id: 'bm_fable', label: 'Fable (UK, male)' },
]

/** Split text into sentence groups of at most `max` characters for speech. Pure. */
export function speechChunks(text: string, max = 280): string[] {
  const sents = text.replace(/\s+/g, ' ').match(/[^.!?;:]+[.!?;:]+["')\]]*\s*|[^.!?;:]+$/g) ?? []
  const out: string[] = []; let cur = ''
  for (const s0 of sents) {
    let s = s0
    while (s.length > max) { const cut = s.lastIndexOf(' ', max); out.push(s.slice(0, cut > 40 ? cut : max).trim()); s = s.slice(cut > 40 ? cut : max) }
    if ((cur + s).length > max && cur) { out.push(cur.trim()); cur = '' }
    cur += s
  }
  if (cur.trim()) out.push(cur.trim())
  return out.filter((x) => /\w/.test(x))
}

export default function PdfToSpeech() {
  const doc = useDocInput()
  const [engine, setEngine] = useState<Engine>('neural')
  const [voice, setVoice] = useState('af_heart')
  const [speed, setSpeed] = useState(1)
  const [busy, setBusy] = useState(false)
  const [load, setLoad] = useState<{ l: number; t: number } | null>(null)
  const [p, setP] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [wav, setWav] = useState<Blob | null>(null)
  const [mp3, setMp3] = useState(false)
  const [sysVoices, setSysVoices] = useState<SpeechSynthesisVoice[]>([])
  const [sysVoice, setSysVoice] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const run = useRef(0)
  const url = useObjectUrl(wav)

  useEffect(() => {
    const s = window.speechSynthesis; if (!s) return
    const upd = () => { const v = s.getVoices(); setSysVoices(v); if (!sysVoice && v[0]) setSysVoice((v.find((x) => x.default) ?? v[0]).name) }
    upd(); s.addEventListener('voiceschanged', upd); return () => { s.removeEventListener('voiceschanged', upd); s.cancel() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { run.current++ }, [])
  // an earlier message about the other input (file or pasted text) no longer applies
  useEffect(() => { setError(null) }, [doc.mode])

  const stop = () => { run.current++; setBusy(false); setLoad(null); window.speechSynthesis?.cancel(); setSpeaking(false) }
  const neural = async () => {
    const chunks = speechChunks(doc.text)
    if (!chunks.length) return setError('There is no readable text.')
    const my = ++run.current
    setBusy(true); setError(null); setWav(null); setP(0)
    try {
      // Kokoro in a background worker, with the on-page engine as the fallback when the worker stays silent
      const tts = await loadSpeech((x) => { if (my === run.current) setLoad(x.total ? { l: x.loaded, t: x.total } : null) })
      if (my !== run.current) return
      setLoad(null)
      const parts: Float32Array[] = []; let sr = 24000
      for (let i = 0; i < chunks.length; i++) {
        await new Promise((r) => setTimeout(r, 0))
        if (my !== run.current) return
        const a: any = await tts.generate(chunks[i], { voice: voice as any, speed })
        parts.push(new Float32Array(Array.isArray(a.audio) ? a.audio[0] : a.audio)); sr = a.sampling_rate || sr
        setP((i + 1) / chunks.length)
      }
      const gap = new Float32Array(Math.round(sr * 0.18))
      const total = parts.reduce((t, x) => t + x.length + gap.length, 0)
      const all = new Float32Array(total); let o = 0
      for (const x of parts) { all.set(x, o); o += x.length + gap.length }
      let blob = encodeWav([all], sr)
      if (mp3) { const { ffRun } = await import('@/tools/video/_media/engine'); blob = await ffRun({ inputs: [{ name: 'in.wav', file: blob }], args: ['-i', 'in.wav', '-c:a', 'libmp3lame', '-b:a', '96k', 'out.mp3'], output: 'out.mp3' }) }
      if (my !== run.current) return
      setWav(blob)
    } catch (e: any) {
      if (my === run.current) setError(/memory/i.test(e?.message || '') ? 'The browser ran out of memory. Try a shorter document.' : 'Speech failed: ' + (e?.message || e))
    } finally {
      if (my === run.current) { setBusy(false); setLoad(null) }
    }
  }
  const speakSystem = () => {
    const s = window.speechSynthesis; if (!s) return setError('Your browser has no built-in speech.')
    s.cancel()
    const chunks = speechChunks(doc.text, 220)
    const v = sysVoices.find((x) => x.name === sysVoice)
    let i = 0; setSpeaking(true)
    const next = () => { if (i >= chunks.length) { setSpeaking(false); return } const u = new SpeechSynthesisUtterance(chunks[i++]); if (v) u.voice = v; u.rate = speed; u.onend = next; u.onerror = () => setSpeaking(false); setP(i / chunks.length); s.speak(u) }
    next()
  }

  const length = speechLength(doc.text.split(/\s+/).filter(Boolean).length, speed)
  return (
    <ToolGrid
      main={<>
        <DocInput doc={doc} label="Drop a PDF or document to hear it" sub="PDF, DOCX, EPUB, TXT, Markdown or HTML. Turn it into an audiobook file on your device." />
        {doc.ready && <p className="text-sm text-muted">{length}.</p>}
        {wav && url && <div className="space-y-3 rounded-2xl border border-success/30 bg-success/5 p-4">
          <audio src={url} controls className="w-full" />
          <div className="flex items-center gap-2"><span className="flex-1 text-sm text-muted">{formatBytes(wav.size)}</span><Button icon={<Download className="size-4" />} onClick={() => downloadBlob(wav, `${doc.name}-audio.${mp3 ? 'mp3' : 'wav'}`)}>Download {mp3 ? 'MP3' : 'WAV'}</Button></div>
        </div>}
      </>}
      side={<>
        <div><Label>Voice engine</Label><Segmented value={engine} onChange={setEngine} options={[{ value: 'neural', label: 'Natural (AI)' }, { value: 'system', label: 'System voices' }]} /></div>
        {engine === 'neural' ? <>
          <div><Label>Voice</Label><Select aria-label="Voice" value={voice} onChange={setVoice} options={VOICES.map((v) => ({ value: v.id, label: v.label }))} /></div>
          <Slider label="Speed" value={speed} onChange={setSpeed} min={0.7} max={1.5} step={0.05} suffix="x" />
          <Switch checked={mp3} onChange={setMp3} label="Save as MP3 (smaller file)" />
          <Button size="lg" className="w-full" icon={<AudioLines className="size-5" />} onClick={neural} loading={busy} disabled={!doc.ready}>Create audio</Button>
          {busy && (load && load.t ? <Progress value={load.l / load.t} label={`Downloading voice model: ${formatBytes(load.l)} of ${formatBytes(load.t)}`} /> : <Progress value={p} label="Reading aloud" />)}
          {busy && <Button variant="outline" className="w-full" icon={<Square className="size-4" />} onClick={stop}>Stop</Button>}
          <Note>English voices (Kokoro 82M, Apache-2.0). The model is about 90 MB and downloads once. Long books take a while: roughly real time on a laptop CPU, faster with GPU.</Note>
        </> : <>
          <div><Label>Voice</Label><Select aria-label="Voice" value={sysVoice} onChange={setSysVoice} options={sysVoices.map((v) => ({ value: v.name, label: `${v.name} (${v.lang})` }))} /></div>
          <Slider label="Speed" value={speed} onChange={setSpeed} min={0.5} max={2} step={0.1} suffix="x" />
          <Button size="lg" className="w-full" icon={speaking ? <Square className="size-5" /> : <Play className="size-5" />} onClick={() => (speaking ? stop() : speakSystem())} disabled={!doc.ready}>{speaking ? 'Stop' : 'Read aloud'}</Button>
          {speaking && <Progress value={p} />}
          <Note>System voices work in any language your device supports, but browsers cannot save them as a file. Use Natural (AI) to download audio.</Note>
        </>}
        <ErrorNote error={error} />
      </>}
    />
  )
}
