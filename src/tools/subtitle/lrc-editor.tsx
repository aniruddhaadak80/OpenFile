import { useEffect, useMemo, useRef, useState } from 'react'
import { Music2, Download, Timer, RotateCcw, Play, Pause } from 'lucide-react'
import { Button, Dropzone, Field, Input, Textarea, ToolGrid, Segmented, cn } from '@/components/ui'
import { baseName, downloadBlob } from '@/lib/files'
import { fmtClock, parseSubtitles, writeSubtitles } from '@/lib/b4/subtitles'
import { toLrc, lyricsToCues } from '@/lib/b14/subs'
import { useBlobUrl, OpenButton } from '@/lib/b14/ui'
import { toast } from '@/components/toast'
import { safeBlobUrl } from '../../lib/safe'

type Line = { text: string; time: number | null }
const SAMPLE = 'Paste your lyrics here, one line per row\nPress Play, then tap Stamp (or the Space key)\nevery time a new line starts\nYou can fix any time by hand later'

export default function LrcEditor() {
  const [audio, setAudio] = useState<File | null>(null)
  const url = useBlobUrl(audio)
  const el = useRef<HTMLAudioElement>(null)
  const [raw, setRaw] = useState(SAMPLE)
  const [lines, setLines] = useState<Line[]>([])
  const [cur, setCur] = useState(0)
  const [now, setNow] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [meta, setMeta] = useState({ ti: '', ar: '', al: '' })
  const [step, setStep] = useState<'lyrics' | 'sync'>('lyrics')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (audio) setMeta((m) => ({ ...m, ti: m.ti || baseName(audio.name) })) }, [audio])
  const start = () => { const ls = raw.split(/\r?\n/).map((t) => t.trim()).filter(Boolean); if (!ls.length) { toast('Add some lyrics first', 'error'); return } setLines((old) => ls.map((t, i) => ({ text: t, time: old[i]?.text === t ? old[i].time : null }))); setCur(0); setStep('sync') }
  const stamp = () => { const a = el.current; if (!a || cur >= lines.length) return; const t = a.currentTime; setLines((p) => p.map((l, i) => (i === cur ? { ...l, time: t } : l))); setCur((c) => Math.min(lines.length, c + 1)) }
  const undo = () => { const c = Math.max(0, cur - 1); setLines((p) => p.map((l, i) => (i === c ? { ...l, time: null } : l))); setCur(c); if (el.current && lines[c - 1]?.time != null) el.current.currentTime = Math.max(0, lines[c - 1].time! - 1) }
  useEffect(() => {
    if (step !== 'sync') return
    const k = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest('input,textarea')) return; if (e.code === 'Space') { e.preventDefault(); stamp() } else if (e.key === 'Backspace') { e.preventDefault(); undo() } else if (e.key === 'p') { const a = el.current; if (a) a.paused ? a.play() : a.pause() } }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })
  const active = useMemo(() => { let i = -1; lines.forEach((l, k) => { if (l.time != null && l.time <= now) i = k }); return i }, [lines, now])
  useEffect(() => { listRef.current?.querySelector(`[data-i="${Math.max(0, active)}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active])
  const openLyrics = async (f: File) => {
    const t = await f.text()
    if (/^\s*\[\d+:\d+/m.test(t) || /--!?>/.test(t)) {
      try { const d = parseSubtitles(t, { name: f.name }); const ls = d.cues.map((c) => ({ text: c.text.replace(/\n/g, ' '), time: c.start })); setRaw(ls.map((l) => l.text).join('\n')); setLines(ls); setCur(ls.length); setStep('sync'); return } catch { /* fall back to plain */ }
    }
    setRaw(t)
  }
  const done = lines.filter((l) => l.time != null).length
  const name = baseName(audio?.name || 'lyrics')

  if (!audio) return <Dropzone accept="audio/*,.mp3,.m4a,.flac,.ogg,.wav,.opus" onFiles={(f) => setAudio(f[0])} label="Drop the song (MP3, M4A, FLAC, WAV)" sub="Then paste the lyrics and tap along to sync each line. Export LRC for music players or SRT for videos." />
  return (
    <ToolGrid
      main={<>
        <div className="rounded-2xl border border-border bg-surface p-3">
          <audio ref={el} src={safeBlobUrl(url) || undefined} controls className="w-full" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
          <div className="mt-2 flex items-center justify-between text-xs text-muted"><span className="truncate">{audio.name}</span><span className="font-mono">{fmtClock(now, '.')}</span></div>
        </div>
        {step === 'lyrics' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between"><span className="text-sm font-medium">Lyrics</span><OpenButton accept=".txt,.lrc,.srt,.vtt" onFiles={(f) => openLyrics(f[0])} label="Open TXT or LRC" /></div>
            <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} className="min-h-72 font-sans text-sm" aria-label="Lyrics" />
          </div>
        ) : (
          <div ref={listRef} className="scrollbar-thin max-h-[460px] space-y-1 overflow-auto rounded-2xl border border-border bg-surface p-2" role="list">
            {lines.map((l, i) => (
              <div key={i} data-i={i} role="listitem" className={cn('grid grid-cols-[7.5rem_1fr] items-center gap-2 rounded-lg px-2 py-1.5 text-sm', i === active && 'bg-accent/15 font-semibold', i === cur && 'ring-1 ring-accent')}>
                <Input aria-label={`Time of line ${i + 1}`} value={l.time == null ? '' : fmtClock(l.time, '.', false)} placeholder="--:--.---" className="h-8 font-mono text-xs"
                  onChange={(e) => { const v = e.target.value; const m = v.match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/); setLines((p) => p.map((x, k) => (k === i ? { ...x, time: v.trim() === '' ? null : m ? (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] : x.time } : x))) }} />
                <button type="button" className="cursor-pointer truncate text-left" onClick={() => { if (l.time != null && el.current) el.current.currentTime = l.time; setCur(i) }}>{l.text}</button>
              </div>
            ))}
          </div>
        )}
      </>}
      side={<>
        <Segmented value={step} onChange={(v) => (v === 'sync' ? start() : setStep('lyrics'))} options={[{ value: 'lyrics', label: '1. Lyrics' }, { value: 'sync', label: '2. Sync' }]} />
        {step === 'lyrics' ? <Button className="w-full" icon={<Timer className="size-4" />} onClick={start}>Start syncing</Button> : <>
          <div className="text-sm">Next line: <span className="font-medium">{lines[cur]?.text ?? 'All lines stamped'}</span></div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={() => { const a = el.current; if (a) a.paused ? a.play() : a.pause() }}>{playing ? 'Pause' : 'Play'}</Button>
            <Button icon={<Timer className="size-4" />} onClick={stamp} disabled={cur >= lines.length}>Stamp</Button>
          </div>
          <Button variant="ghost" size="sm" className="w-full" icon={<RotateCcw className="size-4" />} onClick={undo} disabled={cur === 0}>Undo last stamp</Button>
          <p className="text-xs text-muted">Keys: Space stamps, Backspace undoes, P plays or pauses. Click a line to jump to it. {done} of {lines.length} stamped.</p>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Title"><Input value={meta.ti} onChange={(e) => setMeta({ ...meta, ti: e.target.value })} /></Field>
            <Field label="Artist"><Input value={meta.ar} onChange={(e) => setMeta({ ...meta, ar: e.target.value })} /></Field>
            <Field label="Album"><Input value={meta.al} onChange={(e) => setMeta({ ...meta, al: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button icon={<Download className="size-4" />} disabled={!done} onClick={() => downloadBlob(new Blob([toLrc(lines, meta)], { type: 'text/plain;charset=utf-8' }), `${name}.lrc`)}>LRC</Button>
            <Button variant="outline" icon={<Download className="size-4" />} disabled={!done} onClick={() => downloadBlob(new Blob([writeSubtitles(lyricsToCues(lines), 'srt')], { type: 'application/x-subrip' }), `${name}.srt`)}>SRT</Button>
          </div>
        </>}
        <p className="flex gap-1.5 text-xs text-muted"><Music2 className="size-4 shrink-0" />The song plays from your device. Nothing is uploaded.</p>
        <Button variant="ghost" size="sm" className="w-full" onClick={() => { setAudio(null); setStep('lyrics') }}>Start over</Button>
      </>}
    />
  )
}
