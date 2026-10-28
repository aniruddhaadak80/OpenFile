import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, Square, Volume2, Search, Info, Pencil, Star } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button, Label, Select, Slider, Textarea, ToolGrid, Input, Card, cn } from '@/components/ui'

type State = 'idle' | 'speaking' | 'paused'
interface Chunk { text: string; start: number }

const SAMPLE = 'OpenFile reads your text aloud using the voices built into your device. Adjust the speed, pitch and volume, pick a voice you like, and follow along as each word lights up.'
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
    return () => { speechSynthesis.removeEventListener('voiceschanged', load); speechSynthesis.cancel() }
  }, [])

  const langs = useMemo(() => {
    const m = new Map<string, number>()
    voices.forEach((v) => { const k = v.lang.split(/[-_]/)[0].toLowerCase(); m.set(k, (m.get(k) || 0) + 1) })
    return [...m.entries()].map(([k, n]) => ({ k, n, name: langName(k) })).sort((a, b) => a.name.localeCompare(b.name))
  }, [voices])
  const filtered = useMemo(() => voices.filter((v) => (lang === 'all' || v.lang.toLowerCase().startsWith(lang)) && (!q || `${v.name} ${v.lang}`.toLowerCase().includes(q.toLowerCase()))), [voices, lang, q])
  const voice = voices.find((v) => v.voiceURI === voiceURI) ?? null

  useEffect(() => { wordEl.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [word])

  const speak = (from = 0) => {
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
  const pause = () => { speechSynthesis.pause(); setState('paused') }
  const resume = () => { speechSynthesis.resume(); setState('speaking') }
  const stop = () => { token.current++; speechSynthesis.cancel(); setState('idle'); setWord(null); setSentence(null) }
  const testVoice = (v: SpeechSynthesisVoice) => {
    stop()
    const u = new SpeechSynthesisUtterance(v.lang.startsWith('en') ? `Hi, I'm ${v.name.split(/[-(]/)[0].trim()}.` : v.name)
    u.voice = v; u.lang = v.lang; u.rate = rate; u.pitch = pitch; u.volume = volume
    speechSynthesis.speak(u)
  }

  // keyboard: Ctrl/⌘+Enter to speak, Esc to stop
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); state === 'idle' ? speak() : state === 'paused' ? resume() : pause() }
      else if (e.key === 'Escape' && state !== 'idle') stop()
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })

  if (!supported) return <Card className="text-center text-sm text-muted">Your browser doesn't support speech synthesis. Try Chrome, Edge, Safari or Firefox.</Card>

  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const mins = words / (160 * rate)
  const reading = state !== 'idle'
  const hl = word ?? (boundaryOk ? null : sentence)

  return (
    <ToolGrid
      main={<>
        {reading ? (
          <div className="max-h-[420px] min-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-accent/40 bg-surface-2/60 p-4 text-[15px] leading-relaxed scrollbar-thin">
            {hl ? <>
              {sentence && word ? <>
                {text.slice(0, sentence[0])}
                <span className="rounded bg-accent/5">{text.slice(sentence[0], word[0])}</span>
                <motion.span ref={wordEl} layout className="rounded bg-accent px-0.5 text-white">{text.slice(word[0], word[1])}</motion.span>
                <span className="rounded bg-accent/5">{text.slice(word[1], Math.max(word[1], sentence[1]))}</span>
                {text.slice(Math.max(word[1], sentence[1]))}
              </> : <>
                {text.slice(0, hl[0])}<span ref={wordEl} className="rounded bg-accent/20">{text.slice(hl[0], hl[1])}</span>{text.slice(hl[1])}
              </>}
            </> : text}
          </div>
        ) : (
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or paste text to read aloud…" className="min-h-56 font-sans text-[15px]" />
        )}
        <div className="flex flex-wrap items-center gap-2">
          {state === 'idle' && <Button size="lg" icon={<Play className="size-5" />} onClick={() => speak()} disabled={!text.trim()}>Read aloud</Button>}
          {state === 'speaking' && <Button size="lg" icon={<Pause className="size-5" />} onClick={pause}>Pause</Button>}
          {state === 'paused' && <Button size="lg" icon={<Play className="size-5" />} onClick={resume}>Resume</Button>}
          {reading && <Button size="lg" variant="outline" icon={<Square className="size-4" />} onClick={stop}>Stop</Button>}
          {reading && <span className="inline-flex items-center gap-1.5 text-xs text-muted"><Pencil className="size-3" />Stop to edit the text</span>}
          <span className="ml-auto text-xs text-muted">{words} words · ~{mins < 1 ? `${Math.max(1, Math.round(mins * 60))} s` : `${mins.toFixed(1)} min`} · <kbd className="rounded bg-surface-2 px-1">Ctrl+Enter</kbd></span>
        </div>
        <div className="flex gap-2 rounded-xl border border-border bg-surface-2/40 px-3 py-2.5 text-xs text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>The browser's speech API plays audio directly and doesn't allow saving it as a file. Word highlighting depends on the voice — some online voices only report whole sentences.</span>
        </div>
      </>}
      side={<>
        <div className="space-y-2">
          <Label hint={`${filtered.length} of ${voices.length}`}>Voice</Label>
          <div className="grid grid-cols-2 gap-2">
            <Select value={lang} onChange={setLang} options={[{ value: 'all', label: 'All languages' }, ...langs.map((l) => ({ value: l.k, label: `${l.name} (${l.n})` }))]} />
            <div className="relative"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="pl-8" /></div>
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border p-1 scrollbar-thin">
            {!voices.length && <div className="p-3 text-xs text-muted">Loading voices…</div>}
            {voices.length > 0 && !filtered.length && <div className="p-3 text-xs text-muted">No voices match.</div>}
            {filtered.map((v) => (
              <div key={v.voiceURI} className={cn('group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition', v.voiceURI === voiceURI ? 'bg-accent/10 text-fg' : 'hover:bg-surface-2')}>
                <button onClick={() => setVoiceURI(v.voiceURI)} className="min-w-0 flex-1 text-left cursor-pointer">
                  <div className="flex items-center gap-1 truncate font-medium">{v.name}{v.default && <Star className="size-3 shrink-0 fill-warn text-warn" />}</div>
                  <div className="text-[11px] text-muted">{v.lang}{v.localService ? ' · on-device' : ' · online'}</div>
                </button>
                <button onClick={() => testVoice(v)} className="rounded-md p-1 text-muted opacity-60 hover:text-accent group-hover:opacity-100 cursor-pointer" aria-label={`Test ${v.name}`} title="Test voice"><Volume2 className="size-4" /></button>
              </div>
            ))}
          </div>
        </div>
        <Slider label="Rate" value={rate} onChange={setRate} min={0.5} max={2} step={0.05} suffix="×" />
        <Slider label="Pitch" value={pitch} onChange={setPitch} min={0} max={2} step={0.05} />
        <Slider label="Volume" value={Math.round(volume * 100)} onChange={(v) => setVolume(v / 100)} min={0} max={100} suffix="%" />
        {reading && <p className="text-xs text-muted">New settings apply the next time you press Read aloud.</p>}
        <Button variant="ghost" size="sm" onClick={() => { setRate(1); setPitch(1); setVolume(1) }}>Reset voice settings</Button>
      </>}
    />
  )
}
