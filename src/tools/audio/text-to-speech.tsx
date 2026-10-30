import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, Square, Volume2, Search, Info, Pencil, Star, Download, Cpu, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button, Label, Select, Slider, Textarea, ToolGrid, Input, Progress, Segmented, cn } from '@/components/ui'
import { downloadBlob, formatBytes } from '@/lib/files'
import { NEURAL_VOICES, loadNeural, neuralDevice, encodeWav, concatFloat, type LoadProgress } from './_tts/neural'

type State = 'idle' | 'loading' | 'speaking' | 'paused'
type Engine = 'system' | 'neural'
interface Chunk { text: string; start: number }

const SAMPLE = 'OpenFile reads your text aloud on your own device. Adjust the speed, pick a voice you like, and follow along as the words light up.'
const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

/** Split text into sentence-ish chunks under ~220 chars (Chrome stops long utterances after ~15 s). */
function chunkText(text: string): Chunk[] {
  const out: Chunk[] = []
  const re = /[^.!?。！？\n]+[.!?。！？]*[\s\n]*|\n+/g
  let m: RegExpExecArray | null
  let buf = '', bufStart = 0
  const push = () => { if (buf.trim()) out.push({ text: buf, start: bufStart }); buf = '' }
  while ((m = re.exec(text))) {
    const piece = m[0]
    if (!buf) bufStart = m.index
    if ((buf + piece).length > 220 && buf) { push(); bufStart = m.index }
    if (piece.length > 220) {
      // very long sentence: split on commas/spaces
      let i = 0
      while (i < piece.length) {
        let end = Math.min(piece.length, i + 200)
        if (end < piece.length) { const sp = piece.lastIndexOf(' ', end); if (sp > i + 50) end = sp + 1 }
        out.push({ text: piece.slice(i, end), start: m.index + i }); i = end
      }
      bufStart = m.index + piece.length
      continue
    }
    buf += piece
  }
  push()
  return out
}

const langName = (code: string) => { try { return new Intl.DisplayNames([navigator.language || 'en'], { type: 'language' }).of(code) || code } catch { return code } }

export default function TextToSpeech() {
  const [text, setText] = useState(SAMPLE)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voiceURI, setVoiceURI] = useState('')
  const [lang, setLang] = useState('all')
  const [q, setQ] = useState('')
  const [rate, setRate] = useState(1)
  const [pitch, setPitch] = useState(1)
  const [volume, setVolume] = useState(1)
  const [state, setState] = useState<State>('idle')
  const [word, setWord] = useState<[number, number] | null>(null)
  const [sentence, setSentence] = useState<[number, number] | null>(null)
  const [boundaryOk, setBoundaryOk] = useState(true)
  const token = useRef(0)
  const wordEl = useRef<HTMLSpanElement>(null)
  // neural engine (Kokoro, runs in the tab) used automatically when the browser has no voices
  const [engine, setEngine] = useState<Engine>(supported ? 'system' : 'neural')
  const [autoNeural, setAutoNeural] = useState(!supported)
  const [neuralVoice, setNeuralVoice] = useState(NEURAL_VOICES[0].id)
  const [load, setLoad] = useState<LoadProgress | null>(null)
  const [neuralReady, setNeuralReady] = useState(false)
  const [neuralErr, setNeuralErr] = useState<string | null>(null)
  const [wav, setWav] = useState<{ blob: Blob; text: string; voice: string } | null>(null)
  const [genCount, setGenCount] = useState<[number, number] | null>(null)
  const audioCtx = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (!supported) return
    const load = () => {
      const v = speechSynthesis.getVoices()
      if (!v.length) return
      setVoices(v)
      setVoiceURI((cur) => cur || (v.find((x) => x.default && x.lang.startsWith((navigator.language || 'en').slice(0, 2))) ?? v.find((x) => x.lang.startsWith((navigator.language || 'en').slice(0, 2))) ?? v.find((x) => x.default) ?? v[0]).voiceURI)
    }
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    // some browsers (many Linux builds, privacy browsers) report no voices at all: switch to the neural engine
    const t = setTimeout(() => { if (!speechSynthesis.getVoices().length) { setEngine('neural'); setAutoNeural(true) } }, 1600)
    return () => { clearTimeout(t); speechSynthesis.removeEventListener('voiceschanged', load); speechSynthesis.cancel() }
  }, [])
  useEffect(() => () => { void audioCtx.current?.close().catch(() => {}) }, [])

  const langs = useMemo(() => {
    const m = new Map<string, number>()
    voices.forEach((v) => { const k = v.lang.split(/[-_]/)[0].toLowerCase(); m.set(k, (m.get(k) || 0) + 1) })
    return [...m.entries()].map(([k, n]) => ({ k, n, name: langName(k) })).sort((a, b) => a.name.localeCompare(b.name))
  }, [voices])
  const filtered = useMemo(() => voices.filter((v) => (lang === 'all' || v.lang.toLowerCase().startsWith(lang)) && (!q || `${v.name} ${v.lang}`.toLowerCase().includes(q.toLowerCase()))), [voices, lang, q])
  const voice = voices.find((v) => v.voiceURI === voiceURI) ?? null

  useEffect(() => { wordEl.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [word])

  const ensureNeural = async () => {
    setNeuralErr(null)
    try {
      const m = await loadNeural((p) => setLoad(p))
      setNeuralReady(true); setLoad(null)
      return m
    } catch (e: any) {
      setLoad(null); setNeuralErr(`Could not load the neural voice: ${e?.message || e}. Check your connection for the first download.`)
      return null
    }
  }

  /** Neural engine: generate chunk by chunk, play each as soon as it is ready, keep the samples for WAV export. */
  const speakNeural = async (opts: { play: boolean } = { play: true }) => {
    if (!text.trim()) return
    stop()
    const my = ++token.current
    setState('loading')
    const tts = await ensureNeural()
    if (!tts || token.current !== my) { if (token.current === my) setState('idle'); return }
    const chunks = chunkText(text).filter((c) => c.text.trim())
    const ctx = opts.play ? new AudioContext() : null
    audioCtx.current = ctx
    const gain = ctx ? ctx.createGain() : null
    if (ctx && gain) { gain.gain.value = volume; gain.connect(ctx.destination) }
    let at = ctx ? ctx.currentTime + 0.05 : 0
    const parts: Float32Array[] = []
    let sr = 24000
    let last: AudioBufferSourceNode | null = null
    setGenCount([0, chunks.length])
    try {
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i]
        const out = await tts.generate(c.text.trim(), { voice: neuralVoice as any, speed: rate })
        if (token.current !== my) return
        sr = out.sampling_rate
        const data = out.audio as Float32Array
        parts.push(data, new Float32Array(Math.round(sr * 0.12)))
        setGenCount([i + 1, chunks.length])
        if (ctx && gain) {
          const buf = ctx.createBuffer(1, data.length, sr)
          buf.copyToChannel(new Float32Array(data), 0)
          const src = ctx.createBufferSource(); src.buffer = buf; src.connect(gain)
          const start = Math.max(at, ctx.currentTime + 0.02)
          src.start(start)
          const delay = (start - ctx.currentTime) * 1000
          setTimeout(() => { if (token.current === my) { setSentence([c.start, c.start + c.text.length]); setState((s) => (s === 'loading' ? 'speaking' : s)) } }, Math.max(0, delay))
          at = start + buf.duration + 0.12
          last = src
        }
      }
      setWav({ blob: encodeWav(concatFloat(parts), sr), text, voice: neuralVoice })
      if (!ctx) { setState('idle'); setGenCount(null); return }
      if (last) last.onended = () => { if (token.current === my) { setState('idle'); setSentence(null); setGenCount(null) } }
    } catch (e: any) {
      if (token.current === my) { setNeuralErr(e?.message || String(e)); setState('idle'); setGenCount(null) }
    }
  }

  const testNeural = async (id: string) => {
    stop()
    const my = ++token.current
    const tts = await ensureNeural()
    if (!tts || token.current !== my) return
    const v = NEURAL_VOICES.find((x) => x.id === id)
    const out = await tts.generate(`Hi, I am ${v?.name ?? 'a neural voice'}.`, { voice: id as any, speed: rate })
    if (token.current !== my) return
    const ctx = new AudioContext(); audioCtx.current = ctx
    const buf = ctx.createBuffer(1, out.audio.length, out.sampling_rate); buf.copyToChannel(new Float32Array(out.audio), 0)
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start()
  }

  const speak = (from = 0) => {
    if (engine === 'neural') { void speakNeural(); return }
    if (!supported || !text.trim()) return
    speechSynthesis.cancel()
    const my = ++token.current
    const chunks = chunkText(text).filter((c) => c.start + c.text.length > from)
    if (!chunks.length) return
    let gotBoundary = false
    chunks.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c.text)
      if (voice) { u.voice = voice; u.lang = voice.lang }
      u.rate = rate; u.pitch = pitch; u.volume = volume
      u.onstart = () => { if (token.current !== my) return; setSentence([c.start, c.start + c.text.length]); setState('speaking') }
      u.onboundary = (e) => {
        if (token.current !== my || (e.name && e.name !== 'word')) return
        gotBoundary = true
        const s = c.start + e.charIndex
        const len = e.charLength || (text.slice(s).match(/^\S+/)?.[0].length ?? 1)
        setWord([s, s + len])
      }
      u.onend = () => {
        if (token.current !== my) return
        if (i === chunks.length - 1) { setState('idle'); setWord(null); setSentence(null); setBoundaryOk(gotBoundary) }
      }
      u.onerror = (e) => { if (token.current !== my || e.error === 'interrupted' || e.error === 'canceled') return; setState('idle'); setWord(null); setSentence(null) }
      speechSynthesis.speak(u)
    })
    setState('speaking')
  }
  const pause = () => { if (engine === 'neural') void audioCtx.current?.suspend(); else speechSynthesis.pause(); setState('paused') }
  const resume = () => { if (engine === 'neural') void audioCtx.current?.resume(); else speechSynthesis.resume(); setState('speaking') }
  const stop = () => {
    token.current++
    if (supported) speechSynthesis.cancel()
    const ctx = audioCtx.current; audioCtx.current = null; if (ctx) void ctx.close().catch(() => {})
    setState('idle'); setWord(null); setSentence(null); setGenCount(null)
  }
  const testVoice = (v: SpeechSynthesisVoice) => {
    stop()
    const u = new SpeechSynthesisUtterance(v.lang.startsWith('en') ? `Hi, I'm ${v.name.split(/[-(]/)[0].trim()}.` : v.name)
    u.voice = v; u.lang = v.lang; u.rate = rate; u.pitch = pitch; u.volume = volume
    speechSynthesis.speak(u)
  }

  // keyboard: Ctrl/⌘+Enter to speak, Esc to stop
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (state === 'loading') return; state === 'idle' ? speak() : state === 'paused' ? resume() : pause() }
      else if (e.key === 'Escape' && state !== 'idle') stop()
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })

  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const mins = words / (160 * rate)
  const reading = state !== 'idle'
  const hl = word ?? (engine === 'neural' || !boundaryOk ? sentence : null)
  const wavFresh = wav && wav.text === text && wav.voice === neuralVoice

  return (
    <ToolGrid
      main={<>
        {reading ? (
          <div className="max-h-[420px] min-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-accent/40 bg-surface-2/60 p-4 text-[15px] leading-relaxed scrollbar-thin">
            {hl ? <>
              {sentence && word ? <>
                {text.slice(0, sentence[0])}
                <span className="rounded bg-accent/5">{text.slice(sentence[0], word[0])}</span>
                <motion.span ref={wordEl} layout className="rounded bg-accent px-0.5 text-on-accent">{text.slice(word[0], word[1])}</motion.span>
                <span className="rounded bg-accent/5">{text.slice(word[1], Math.max(word[1], sentence[1]))}</span>
                {text.slice(Math.max(word[1], sentence[1]))}
              </> : <>
                {text.slice(0, hl[0])}<span ref={wordEl} className="rounded bg-accent/20">{text.slice(hl[0], hl[1])}</span>{text.slice(hl[1])}
              </>}
            </> : text}
          </div>
        ) : (
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or paste text to read aloud" className="min-h-56 font-sans text-[15px]" />
        )}
        <div className="flex flex-wrap items-center gap-2">
          {state === 'idle' && <Button size="lg" icon={<Play className="size-5" />} onClick={() => speak()} disabled={!text.trim()}>Read aloud</Button>}
          {state === 'loading' && <Button size="lg" loading>{load ? 'Loading voice' : 'Preparing audio'}</Button>}
          {state === 'speaking' && <Button size="lg" icon={<Pause className="size-5" />} onClick={pause}>Pause</Button>}
          {state === 'paused' && <Button size="lg" icon={<Play className="size-5" />} onClick={resume}>Resume</Button>}
          {reading && <Button size="lg" variant="outline" icon={<Square className="size-4" />} onClick={stop}>Stop</Button>}
          {engine === 'neural' && state === 'idle' && (wavFresh
            ? <Button size="lg" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(wav!.blob, `speech-${neuralVoice}.wav`)}>Download WAV ({formatBytes(wav!.blob.size)})</Button>
            : <Button size="lg" variant="outline" icon={<Download className="size-4" />} disabled={!text.trim()} onClick={() => void speakNeural({ play: false })}>Make WAV</Button>)}
          {reading && <span className="inline-flex items-center gap-1.5 text-xs text-muted"><Pencil className="size-3" />Stop to edit the text</span>}
          <span className="ml-auto text-xs text-muted">{words} words | about {mins < 1 ? `${Math.max(1, Math.round(mins * 60))} s` : `${mins.toFixed(1)} min`} | <kbd className="rounded bg-surface-2 px-1">Ctrl+Enter</kbd></span>
        </div>
        {load && <Progress value={load.total ? load.loaded / load.total : 0} label={`Downloading the neural voice model (first time only)${load.total ? `: ${formatBytes(load.loaded)} of ${formatBytes(load.total)}` : ''}`} />}
        {genCount && engine === 'neural' && <div className="flex items-center gap-2 text-xs text-muted"><Loader2 className={cn('size-3.5', genCount[0] < genCount[1] && 'animate-spin')} /> Generated {genCount[0]} of {genCount[1]} parts on {neuralDevice() === 'webgpu' ? 'your GPU' : 'your CPU'}</div>}
        {neuralErr && <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{neuralErr}</div>}
        <div className="flex gap-2 rounded-xl border border-border bg-surface-2/40 px-3 py-2.5 text-xs text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>{engine === 'system' ? 'System voices play directly and the browser does not allow saving them as a file. Switch to the neural engine to download a WAV. Word highlighting depends on the voice, and some online voices only report whole sentences.' : 'The neural engine runs the open Kokoro model in this tab. The model downloads once (about 90 MB) and is cached. Your text never leaves your device. It reads English best.'}</span>
        </div>
      </>}
      side={<>
        <div className="space-y-2">
          <Label>Engine</Label>
          <Segmented value={engine} onChange={(v) => { stop(); setEngine(v) }} options={[{ value: 'system', label: <span className="flex items-center gap-1.5"><Volume2 className="size-3.5" />System voices</span> }, { value: 'neural', label: <span className="flex items-center gap-1.5"><Cpu className="size-3.5" />Neural (in browser)</span> }]} className="w-full" />
          {autoNeural && <p className="text-xs text-muted">{supported ? 'This browser has no system voices, so the neural engine is on.' : 'This browser has no speech synthesis, so the neural engine is on.'}</p>}
        </div>
        {engine === 'neural' ? (
        <div className="space-y-2">
          <Label hint={`${NEURAL_VOICES.length} voices${neuralReady ? ' | ready' : ''}`}>Neural voice</Label>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border p-1 scrollbar-thin">
            {NEURAL_VOICES.map((v) => (
              <div key={v.id} className={cn('group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition', v.id === neuralVoice ? 'bg-accent/10 text-fg' : 'hover:bg-surface-2')}>
                <button onClick={() => setNeuralVoice(v.id)} className="min-w-0 flex-1 text-left cursor-pointer">
                  <div className="truncate font-medium">{v.name}</div>
                  <div className="text-[11px] text-muted">English ({v.accent}) | {v.gender.toLowerCase()} | on-device</div>
                </button>
                <button onClick={() => void testNeural(v.id)} className="rounded-md p-1 text-muted opacity-60 hover:text-accent group-hover:opacity-100 cursor-pointer" aria-label={`Test ${v.name}`} title="Test voice"><Volume2 className="size-4" /></button>
              </div>
            ))}
          </div>
          {!neuralReady && !load && <Button size="sm" variant="outline" icon={<Download className="size-3.5" />} onClick={() => void ensureNeural()}>Load the model now</Button>}
        </div>
        ) : (
        <div className="space-y-2">
          <Label hint={voices.length ? `${filtered.length} of ${voices.length}` : undefined}>Voice</Label>
          <div className="grid grid-cols-2 gap-2">
            <Select aria-label="Language" value={lang} onChange={setLang} options={[{ value: 'all', label: 'All languages' }, ...langs.map((l) => ({ value: l.k, label: `${l.name} (${l.n})` }))]} />
            <div className="relative"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="pl-8" /></div>
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border p-1 scrollbar-thin">
            {!voices.length && <div className="p-3 text-xs text-muted">Looking for system voices. If none show up, switch to the neural engine above.</div>}
            {voices.length > 0 && !filtered.length && <div className="p-3 text-xs text-muted">No voices match.</div>}
            {filtered.map((v) => (
              <div key={v.voiceURI} className={cn('group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition', v.voiceURI === voiceURI ? 'bg-accent/10 text-fg' : 'hover:bg-surface-2')}>
                <button onClick={() => setVoiceURI(v.voiceURI)} className="min-w-0 flex-1 text-left cursor-pointer">
                  <div className="flex items-center gap-1 truncate font-medium">{v.name}{v.default && <Star className="size-3 shrink-0 fill-warn text-warn" />}</div>
                  <div className="text-[11px] text-muted">{v.lang}{v.localService ? ' | on-device' : ' | online'}</div>
                </button>
                <button onClick={() => testVoice(v)} className="rounded-md p-1 text-muted opacity-60 hover:text-accent group-hover:opacity-100 cursor-pointer" aria-label={`Test ${v.name}`} title="Test voice"><Volume2 className="size-4" /></button>
              </div>
            ))}
          </div>
        </div>
        )}
        <Slider label="Rate" value={rate} onChange={setRate} min={0.5} max={2} step={0.05} suffix="×" />
        {engine === 'system' ? <Slider label="Pitch" value={pitch} onChange={setPitch} min={0} max={2} step={0.05} /> : <p className="text-xs text-muted">Pitch is only available with system voices.</p>}
        <Slider label="Volume" value={Math.round(volume * 100)} onChange={(v) => setVolume(v / 100)} min={0} max={100} suffix="%" />
        {reading && <p className="text-xs text-muted">New settings apply the next time you press Read aloud.</p>}
        <Button variant="ghost" size="sm" onClick={() => { setRate(1); setPitch(1); setVolume(1) }}>Reset voice settings</Button>
      </>}
    />
  )
}
