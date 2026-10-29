// Read-aloud player for blog posts: neural narration (pre-generated with word timings) or any system voice (Web Speech API).
// Word highlight, follow-along scrolling, click a word to start there, right-click menu, chapters, speeds, Media Session.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Play, Pause, RotateCcw, RotateCw, Download, X, Settings2, Headphones, ListOrdered, LocateFixed, Link2, Pilcrow, Volume2 } from 'lucide-react'
import { cn } from '@/components/ui'
import { copyText } from '@/lib/files'
import { audioUrl, fmtTime, mediaFor, mp3Url, prefersReducedMotion, pub, timingsUrl, type NeuralVoice } from './media'
import { alignBlocks, collectBlocks, type ReadBlock } from './readable'
import './read.css'

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
const WPS = 2.6 // words per second at 1x, for system voices
type Word = { b: number; w: number; t0: number; t1: number }
type Timings = { dur: number; b: [number, number, [number, number][]][] }
export interface ReadAloudHandle { open: (play?: boolean) => void; playFromHeading: (id: string) => void; isOpen: () => boolean }
interface Prefs { rate: number; voice: string; volume: number; pitch: number; follow: boolean }
const PREFS_KEY = 'of-read-prefs'
const loadPrefs = (): Prefs => { try { return { rate: 1, voice: 'neural:lessac', volume: 1, pitch: 1, follow: true, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') } } catch { return { rate: 1, voice: 'neural:lessac', volume: 1, pitch: 1, follow: true } } }

interface Props { slug: string; title: string; rootRef: React.RefObject<HTMLElement | null>; titleRef: React.RefObject<HTMLElement | null>; onOpenChange?: (o: boolean) => void }

export const ReadAloud = forwardRef<ReadAloudHandle, Props>(function ReadAloud({ slug, title, rootRef, titleRef, onOpenChange }, ref) {
  const media = mediaFor(slug)
  const neural: NeuralVoice[] = media.voices ?? []
  const [open, setOpenS] = useState(false)
  const setOpen = (o: boolean) => { setOpenS(o); onOpenChange?.(o) }
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [dur, setDur] = useState(0)
  const [prefs, setPrefs] = useState<Prefs>(() => {
    const p = loadPrefs()
    try { const s = JSON.parse(localStorage.getItem(`of-read:${slug}`) || '{}'); if (s.voice) p.voice = s.voice; if (s.rate) p.rate = s.rate } catch { /* none */ }
    if (p.voice.startsWith('neural:') && !neural.some((v) => 'neural:' + v.id === p.voice)) p.voice = neural[0] ? 'neural:' + neural[0].id : 'system:'
    if (!neural.length && p.voice.startsWith('neural:')) p.voice = 'system:'
    return p
  })
  const [sysVoices, setSysVoices] = useState<SpeechSynthesisVoice[]>([])
  const [panel, setPanel] = useState<'none' | 'settings' | 'chapters'>('none')
  const [lost, setLost] = useState(false) // user scrolled away while following
  const [menu, setMenu] = useState<{ x: number; y: number; b: number; w: number } | null>(null)
  const [toast, setToast] = useState('')
  const [chapters, setChapters] = useState<{ t: number; label: string; id: string }[]>([])
  const [curChapter, setCurChapter] = useState('')
  const [loading, setLoading] = useState(false)

  const isNeural = prefs.voice.startsWith('neural:')
  const neuralId = prefs.voice.slice(7)
  const audio = useRef<HTMLAudioElement | null>(null)
  const blocks = useRef<ReadBlock[]>([])
  const words = useRef<Word[]>([])               // flattened, ordered by time (neural) or reading order (system)
  const wordIndex = useRef<Map<string, number>>(new Map())  // "b.w" -> index in words
  const cur = useRef(-1)
  const sysIdx = useRef(0)
  const stopAt = useRef<number | null>(null)
  const playingRef = useRef(false)
  const prefsRef = useRef(prefs); prefsRef.current = prefs
  const lostRef = useRef(false)
  const autoScrolling = useRef(0)
  const loadedFor = useRef('')
  const pendingSeek = useRef<{ b: number; w: number; play: boolean } | null>(null)

  // ---------- prefs persistence
  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    try { const s = JSON.parse(localStorage.getItem(`of-read:${slug}`) || '{}'); localStorage.setItem(`of-read:${slug}`, JSON.stringify({ ...s, voice: prefs.voice, rate: prefs.rate })) } catch { /* quota */ }
  }, [prefs, slug])
  const savePos = useCallback((t: number) => { try { const s = JSON.parse(localStorage.getItem(`of-read:${slug}`) || '{}'); localStorage.setItem(`of-read:${slug}`, JSON.stringify({ ...s, pos: Math.round(t * 10) / 10 })) } catch { /* quota */ } }, [slug])
  const savedPos = () => { try { return JSON.parse(localStorage.getItem(`of-read:${slug}`) || '{}').pos || 0 } catch { return 0 } }

  // ---------- system voices
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return
    const load = () => setSysVoices(speechSynthesis.getVoices())
    load()
    speechSynthesis.addEventListener?.('voiceschanged', load)
    return () => { speechSynthesis.removeEventListener?.('voiceschanged', load); speechSynthesis.cancel() }
  }, [])
  const voiceGroups = useMemo(() => {
    const g = new Map<string, SpeechSynthesisVoice[]>()
    const dn = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'language' }) : null
    for (const v of sysVoices) { let k = v.lang; try { k = dn?.of(v.lang) || v.lang } catch { /* odd tag */ } (g.get(k) || g.set(k, []).get(k)!).push(v) }
    return [...g.entries()].sort((a, b) => (a[0].startsWith('English') ? -1 : b[0].startsWith('English') ? 1 : a[0].localeCompare(b[0])))
  }, [sysVoices])

  // ---------- build the word map
  const ensureBlocks = useCallback(() => {
    const root = rootRef.current
    if (!root) return []
    if (!blocks.current.length || !blocks.current[0].el.isConnected) blocks.current = collectBlocks(root, titleRef.current)
    return blocks.current
  }, [rootRef, titleRef])

  const buildSystemWords = useCallback(() => {
    const bl = ensureBlocks()
    const ws: Word[] = []
    let n = 0
    bl.forEach((b, bi) => b.words.forEach((_, wi) => { ws.push({ b: bi, w: wi, t0: n / WPS, t1: (n + 1) / WPS }); n++ }))
    words.current = ws
    wordIndex.current = new Map(ws.map((x, i) => [`${x.b}.${x.w}`, i]))
    setDur(ws.length / WPS)
    setChapters(bl.map((b, i) => ({ b, i })).filter((x) => x.b.tag === 'h2').map((x) => ({ t: (ws.findIndex((w) => w.b === x.i)) / WPS, label: x.b.text, id: x.b.el.id })))
  }, [ensureBlocks])

  const loadNeural = useCallback(async (vid: string) => {
    const key = slug + ':' + vid
    if (loadedFor.current === key) return
    setLoading(true)
    const bl = ensureBlocks()
    const t: Timings = await fetch(timingsUrl(slug, vid)).then((r) => r.json())
    const map = alignBlocks(bl, t.b.map((x) => x[2].length))
    const ws: Word[] = []
    t.b.forEach((blk, i) => { const d = map[i]; if (d < 0) return; const n = bl[d].words.length; blk[2].forEach(([t0, t1], wi) => { if (wi < n) ws.push({ b: d, w: wi, t0, t1 }) }) })
    words.current = ws
    wordIndex.current = new Map(ws.map((x, i) => [`${x.b}.${x.w}`, i]))
    const ch: { t: number; label: string; id: string }[] = []
    t.b.forEach((blk, i) => { const d = map[i]; if (d >= 0 && bl[d].tag === 'h2') ch.push({ t: blk[0], label: bl[d].text, id: bl[d].el.id }) })
    setChapters(ch)
    const a = audio.current!
    a.src = audioUrl(slug, vid)
    a.preload = 'auto'
    setDur(t.dur)
    loadedFor.current = key
    setLoading(false)
  }, [slug, ensureBlocks])

  // ---------- highlight + follow
  const highlight = useCallback((i: number) => {
    if (i === cur.current) return
    const prev = words.current[cur.current]
    const bl = blocks.current
    if (prev && bl[prev.b]) { bl[prev.b].words[prev.w]?.forEach((s) => s.classList.remove('rw-on')); if (!words.current[i] || words.current[i].b !== prev.b) bl[prev.b].el.classList.remove('rb-on') }
    cur.current = i
    const w = words.current[i]
    if (!w || !bl[w.b]) return
    bl[w.b].el.classList.add('rb-on')
    const spans = bl[w.b].words[w.w]
    spans?.forEach((s) => s.classList.add('rw-on'))
    if (prefsRef.current.follow && !lostRef.current && spans?.[0] && playingRef.current) {
      const r = spans[0].getBoundingClientRect()
      if (r.top < 110 || r.bottom > innerHeight - 170) {
        autoScrolling.current = Date.now()
        spans[0].scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      }
    }
    const ch = [...chaptersRef.current].reverse().find((c) => c.t <= w.t0 + 0.01)
    setCurChapter(ch?.label || '')
  }, [])
  const chaptersRef = useRef(chapters); chaptersRef.current = chapters
  const clearHighlight = () => {
    const w = words.current[cur.current]
    if (w && blocks.current[w.b]) { blocks.current[w.b].words[w.w]?.forEach((s) => s.classList.remove('rw-on')); blocks.current[w.b].el.classList.remove('rb-on') }
    cur.current = -1
  }
  const wordAtTime = (t: number) => {
    const ws = words.current
    let lo = 0, hi = ws.length - 1, ans = -1
    while (lo <= hi) { const m = (lo + hi) >> 1; if (ws[m].t0 <= t + 0.02) { ans = m; lo = m + 1 } else hi = m - 1 }
    return ans
  }

  // neural clock
  useEffect(() => {
    let raf = 0, last = 0
    const tick = () => {
      const a = audio.current
      if (a && isNeural && loadedFor.current) {
        const t = a.currentTime
        const i = wordAtTime(t)
        if (i >= 0 && t <= words.current[i].t1 + 0.8) highlight(i)
        if (stopAt.current !== null && t >= stopAt.current) { stopAt.current = null; a.pause() }
        const now = performance.now()
        if (now - last > 200) { last = now; setTime(t); if (playingRef.current) savePos(t) }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isNeural, highlight, savePos])

  // ---------- system speech
  const speakFrom = useCallback((idx: number) => {
    if (typeof speechSynthesis === 'undefined') return
    speechSynthesis.cancel()
    const ws = words.current
    if (idx >= ws.length) { setPlaying(false); playingRef.current = false; return }
    const b = ws[idx].b
    const blk = blocks.current[b]
    const startW = ws[idx].w
    const texts = blk.words.slice(startW).map((sp) => sp.map((s) => s.textContent).join(''))
    const offs: number[] = []
    let acc = 0
    texts.forEach((t) => { offs.push(acc); acc += t.length + 1 })
    const u = new SpeechSynthesisUtterance(texts.join(' '))
    const p = prefsRef.current
    const v = sysVoices.find((x) => x.voiceURI === p.voice.slice(7)) || sysVoices.find((x) => x.default && x.lang.startsWith('en')) || sysVoices.find((x) => x.lang.startsWith('en'))
    if (v) { u.voice = v; u.lang = v.lang }
    u.rate = p.rate; u.pitch = p.pitch; u.volume = p.volume
    const base = idx - 0
    u.onboundary = (e) => {
      if (e.name && e.name !== 'word') return
      let k = 0
      while (k + 1 < offs.length && offs[k + 1] <= e.charIndex) k++
      sysIdx.current = base + k
      highlight(base + k); setTime((base + k) / WPS); savePos((base + k) / WPS)
    }
    u.onend = () => {
      if (!playingRef.current || u !== curUtter.current) return
      const next = base + texts.length
      if (stopAt.current !== null) { stopAt.current = null; setPlaying(false); playingRef.current = false; sysIdx.current = next; return }
      sysIdx.current = next
      speakFrom(next)
    }
    curUtter.current = u
    sysIdx.current = idx
    highlight(idx); setTime(idx / WPS)
    speechSynthesis.speak(u)
  }, [sysVoices, highlight, savePos])
  const curUtter = useRef<SpeechSynthesisUtterance | null>(null)

  // ---------- engine switching
  useEffect(() => {
    if (!open) return
    const was = playingRef.current
    const pos = isNeural ? null : time
    userSeek.current = false
    pause()
    clearHighlight()
    if (isNeural) {
      loadNeural(neuralId).then(() => { const a = audio.current!; const t = time; const set = () => { const target = pendingTime.current ?? (userSeek.current ? null : t); pendingTime.current = null; if (target !== null && target > 0) a.currentTime = Math.min(target, (a.duration || 1e9) - 0.5); if (was || wantPlay.current) { wantPlay.current = false; playRef.current() } }; if (a.readyState >= 1) set(); else a.addEventListener('loadedmetadata', set, { once: true }) })
    } else {
      loadedFor.current = ''
      audio.current?.removeAttribute('src')
      buildSystemWords()
      sysIdx.current = Math.min(words.current.length - 1, Math.round((pos ?? 0) * WPS))
      if (was) setTimeout(() => play(), 50)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.voice, open])

  // ---------- transport
  const play = useCallback(() => {
    playingRef.current = true; setPlaying(true)
    lostRef.current = false; setLost(false)
    if (isNeural) {
      if (loadedFor.current !== slug + ':' + neuralId) { wantPlay.current = true; return }
      audio.current?.play().catch(() => { playingRef.current = false; setPlaying(false) })
    }
    else speakFrom(Math.max(0, sysIdx.current))
    setMediaSession()
  }, [isNeural, speakFrom, slug, neuralId])
  const wantPlay = useRef(false)
  const pause = useCallback(() => {
    wantPlay.current = false
    playingRef.current = false; setPlaying(false)
    audio.current?.pause()
    if (typeof speechSynthesis !== 'undefined') { curUtter.current = null; speechSynthesis.cancel() }
  }, [])
  const toggle = () => (playingRef.current ? pause() : play())
  const userSeek = useRef(false)
  const pendingTime = useRef<number | null>(null) // a seek asked for before the audio knew its length
  const seekTime = useCallback((t: number) => {
    userSeek.current = true
    t = Math.max(0, Math.min(t, dur || 0))
    if (isNeural) { if (audio.current) { if (audio.current.readyState < 1) pendingTime.current = t; audio.current.currentTime = t } setTime(t); const i = wordAtTime(t); if (i >= 0) { lostRef.current = false; setLost(false); highlight(i) } }
    else { const i = Math.min(words.current.length - 1, Math.round(t * WPS)); sysIdx.current = i; setTime(t); highlight(i); if (playingRef.current) speakFrom(i) }
  }, [dur, isNeural, highlight, speakFrom])
  const skip = (s: number) => seekTime((isNeural ? audio.current?.currentTime ?? 0 : sysIdx.current / WPS) + s)
  const seekWord = useCallback((b: number, w: number, andPlay = true, onlyBlock = false) => {
    const i = wordIndex.current.get(`${b}.${w}`) ?? [...wordIndex.current.entries()].find(([k]) => k.startsWith(b + '.'))?.[1]
    if (i === undefined) return
    const word = words.current[i]
    userSeek.current = true
    stopAt.current = null
    if (onlyBlock) {
      const last = [...words.current].reverse().find((x) => x.b === b)
      stopAt.current = isNeural ? (last?.t1 ?? word.t1) + 0.15 : 1
    }
    lostRef.current = false; setLost(false)
    if (isNeural) { if (audio.current) { if (audio.current.readyState < 1) pendingTime.current = word.t0; audio.current.currentTime = word.t0 } setTime(word.t0); highlight(i); if (andPlay) play() }
    else { sysIdx.current = i; setTime(i / WPS); highlight(i); if (andPlay) { playingRef.current = true; setPlaying(true); speakFrom(i) } }
  }, [isNeural, highlight, play, speakFrom])
  const setRate = (r: number) => {
    setPrefs((p) => ({ ...p, rate: r }))
    if (audio.current) { audio.current.playbackRate = r; (audio.current as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true }
    if (!isNeural && playingRef.current) setTimeout(() => speakFrom(sysIdx.current), 0)
  }
  useEffect(() => { if (audio.current) { audio.current.playbackRate = prefs.rate; audio.current.volume = prefs.volume } }, [prefs.rate, prefs.volume, open])

  // ---------- Media Session
  const setMediaSession = () => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: 'Aniruddha Adak', album: 'OpenFile blog', artwork: [{ src: new URL(pub(slug, 'cover.webp'), location.href).href, sizes: '800x500', type: 'image/webp' }] })
    const h: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => play()], ['pause', () => pause()], ['seekbackward', () => skip(-10)], ['seekforward', () => skip(10)],
      ['seekto', (d) => d.seekTime !== undefined && seekTime(d.seekTime)],
      ['previoustrack', () => { const t = isNeural ? audio.current?.currentTime ?? 0 : sysIdx.current / WPS; const c = [...chaptersRef.current].reverse().find((x) => x.t < t - 2); seekTime(c?.t ?? 0) }],
      ['nexttrack', () => { const t = isNeural ? audio.current?.currentTime ?? 0 : sysIdx.current / WPS; const c = chaptersRef.current.find((x) => x.t > t + 0.5); if (c) seekTime(c.t) }],
    ]
    for (const [a, fn] of h) { try { navigator.mediaSession.setActionHandler(a, fn) } catch { /* unsupported */ } }
  }
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
    try { if (dur > 0) navigator.mediaSession.setPositionState({ duration: dur, position: Math.min(time, dur), playbackRate: isNeural ? prefs.rate : 1 }) } catch { /* ignore */ }
  }, [playing, time, dur, prefs.rate, isNeural])

  // ---------- audio element events and recovery (release links redirect to short lived URLs)
  useEffect(() => {
    const a = audio.current!
    const onEnd = () => { playingRef.current = false; setPlaying(false); savePos(0) }
    const onPause = () => { if (playingRef.current && !a.ended && isNeural && document.visibilityState === 'visible' && stopAt.current === null) { /* paused by the system */ playingRef.current = false; setPlaying(false) } else if (!playingRef.current) setPlaying(false) }
    const onPlay = () => { playingRef.current = true; setPlaying(true) }
    const onLeave = () => { if (loadedFor.current && a.currentTime > 1) savePos(a.currentTime) }
    a.addEventListener('pause', onLeave); addEventListener('pagehide', onLeave)
    let retries = 0
    const onErr = () => {
      if (!loadedFor.current || retries > 3) return
      retries++
      const t = a.currentTime, was = playingRef.current
      a.src = audioUrl(slug, neuralId) + `?r=${Date.now()}`
      a.addEventListener('loadedmetadata', () => { a.currentTime = t; if (was) a.play().catch(() => {}) }, { once: true })
    }
    const onMeta = () => { if (pendingTime.current !== null) { a.currentTime = pendingTime.current; pendingTime.current = null } }
    a.addEventListener('loadedmetadata', onMeta)
    const onWait = () => setLoading(true)
    const onCan = () => setLoading(false)
    a.addEventListener('ended', onEnd); a.addEventListener('pause', onPause); a.addEventListener('play', onPlay); a.addEventListener('error', onErr)
    a.addEventListener('waiting', onWait); a.addEventListener('canplay', onCan); a.addEventListener('playing', onCan)
    return () => { a.removeEventListener('ended', onEnd); a.removeEventListener('pause', onPause); a.removeEventListener('play', onPlay); a.removeEventListener('error', onErr); a.removeEventListener('loadedmetadata', onMeta); a.removeEventListener('pause', onLeave); removeEventListener('pagehide', onLeave); a.removeEventListener('waiting', onWait); a.removeEventListener('canplay', onCan); a.removeEventListener('playing', onCan) }
  }, [slug, neuralId, isNeural, savePos])

  // ---------- open / restore
  const doOpen = useCallback((andPlay = false) => {
    if (!open) {
      setOpen(true)
      ensureBlocks()
      const pos = savedPos()
      if (pos > 2) setTime(pos)
      if (andPlay) setTimeout(() => playRef.current(), 120)
    } else if (andPlay) play()
  }, [open, ensureBlocks, play])
  const playRef = useRef(play); playRef.current = play
  const seekWordRef = useRef(seekWord); seekWordRef.current = seekWord
  useImperativeHandle(ref, () => ({
    open: (p) => doOpen(p),
    isOpen: () => open,
    playFromHeading: (id) => {
      if (!open) doOpen(false)
      setTimeout(() => { const bl = ensureBlocks(); const b = bl.findIndex((x) => x.el.id === id); if (b >= 0) seekWordRef.current(b, 0, true) }, open ? 0 : 400)
    },
  }), [doOpen, open, ensureBlocks])

  // when words load after opening, apply a pending seek (deep link) or the saved position
  useEffect(() => {
    if (!open) return
    const id = setInterval(() => {
      if (!words.current.length) return
      clearInterval(id)
      const p = pendingSeek.current
      if (p) { pendingSeek.current = null; seekWordRef.current(p.b, p.w, p.play) }
      else { const pos = savedPos(); if (pos > 2) seekTime(pos) }
    }, 150)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefs.voice])

  // deep link #read=b.w
  useEffect(() => {
    const m = location.hash.match(/^#read=(\d+)\.(\d+)/)
    if (!m) return
    pendingSeek.current = { b: +m[1], w: +m[2], play: false }
    const t = setTimeout(() => { doOpen(false); setTimeout(() => { const bl = ensureBlocks(); bl[+m[1]]?.words[+m[2]]?.[0]?.scrollIntoView({ block: 'center' }) }, 300) }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // ---------- word clicks, context menu, manual scroll detection, keyboard
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const locate = (target: EventTarget | null) => {
      const el = target as HTMLElement | null
      const span = el?.closest?.('span.rw') as HTMLElement | null
      const bl = ensureBlocks()
      const blockEl = (span || el)?.closest?.('.rb') as HTMLElement | null
      const b = bl.findIndex((x) => x.el === blockEl)
      if (b < 0) return null
      return { b, w: span ? +span.dataset.w! : 0, span }
    }
    const onClick = (e: MouseEvent) => {
      if (!open) return
      const el = e.target as HTMLElement
      if (el.closest('a, button, input, select, textarea, label, .not-prose')) return
      if (getSelection()?.toString()) return
      const loc = locate(e.target)
      if (!loc?.span) return
      seekWord(loc.b, loc.w, true)
    }
    const onCtx = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('a, .not-prose, input, textarea')) return
      ensureBlocks()
      const loc = locate(e.target)
      if (!loc) return
      e.preventDefault()
      setMenu({ x: Math.min(e.clientX, innerWidth - 230), y: Math.min(e.clientY, innerHeight - 170), b: loc.b, w: loc.w })
    }
    root.addEventListener('click', onClick)
    root.addEventListener('contextmenu', onCtx)
    const title = titleRef.current
    title?.addEventListener('contextmenu', onCtx)
    return () => { root.removeEventListener('click', onClick); root.removeEventListener('contextmenu', onCtx); title?.removeEventListener('contextmenu', onCtx) }
  }, [rootRef, titleRef, open, seekWord, ensureBlocks])

  useEffect(() => {
    if (!open) return
    const manual = () => { if (playingRef.current && prefsRef.current.follow && Date.now() - autoScrolling.current > 700) { lostRef.current = true; setLost(true) } }
    const onKeyScroll = (e: KeyboardEvent) => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) manual() }
    addEventListener('wheel', manual, { passive: true }); addEventListener('touchmove', manual, { passive: true }); addEventListener('keydown', onKeyScroll)
    return () => { removeEventListener('wheel', manual); removeEventListener('touchmove', manual); removeEventListener('keydown', onKeyScroll) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === ' ' || e.key === 'k') { if (t.closest('button, a')) return; e.preventDefault(); toggle() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); skip(10) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); skip(-10) }
      else if (e.key === '+' || e.key === '=') { const i = SPEEDS.indexOf(prefsRef.current.rate); setRate(SPEEDS[Math.min(SPEEDS.length - 1, i + 1)]) }
      else if (e.key === '-' || e.key === '_') { const i = SPEEDS.indexOf(prefsRef.current.rate); setRate(SPEEDS[Math.max(0, i - 1)]) }
      else if (e.key === 'Escape') { setMenu(null); setPanel('none') }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  useEffect(() => { document.documentElement.classList.toggle('read-mode', open); return () => document.documentElement.classList.remove('read-mode') }, [open])
  useEffect(() => () => { pause(); clearHighlight() }, [slug, pause])
  useEffect(() => {
    if (!menu) return
    const c = (e: Event) => { if (!(e.target as HTMLElement)?.closest?.('[role="menu"]')) setMenu(null) }
    const t = setTimeout(() => { addEventListener('pointerdown', c, true); addEventListener('resize', c) }, 0)
    return () => { clearTimeout(t); removeEventListener('pointerdown', c, true); removeEventListener('resize', c) }
  }, [menu])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 1800); return () => clearTimeout(t) }, [toast])

  const backToReading = () => {
    lostRef.current = false; setLost(false)
    const w = words.current[cur.current]
    const sp = w && blocks.current[w.b]?.words[w.w]?.[0]
    if (sp) { autoScrolling.current = Date.now(); sp.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }) }
  }
  const close = () => { pause(); clearHighlight(); setOpen(false); setPanel('none') }
  const pct = dur ? (time / dur) * 100 : 0
  const nv = neural.find((v) => v.id === neuralId)

  const menuEl = menu && createPortal(
    <div role="menu" className="fixed z-[80] w-56 overflow-hidden rounded-xl border border-border bg-surface p-1 text-sm shadow-2xl" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
      <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-surface-2 cursor-pointer" onClick={() => { const m = menu; setMenu(null); if (!open) { pendingSeek.current = { b: m.b, w: m.w, play: true }; doOpen(false) } else seekWord(m.b, m.w, true) }}><Play className="size-4 text-accent" /> Read from here</button>
      <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-surface-2 cursor-pointer" onClick={() => { const m = menu; setMenu(null); if (!open) { doOpen(false); setTimeout(() => seekWordRef.current(m.b, 0, true, true), 700) } else seekWord(m.b, 0, true, true) }}><Pilcrow className="size-4 text-accent" /> Read this paragraph</button>
      <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-surface-2 cursor-pointer" onClick={async () => { const m = menu; setMenu(null); const url = `${location.origin}${location.pathname}#read=${m.b}.${m.w}`; if (await copyText(url)) setToast('Link copied') }}><Link2 className="size-4 text-accent" /> Copy link to here</button>
    </div>, document.body)

  return <>
    <audio ref={audio} preload="none" className="hidden" />
    {menuEl}
    {toast && createPortal(<div role="status" className="fixed bottom-28 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-fg px-4 py-2 text-sm text-bg shadow-lg">{toast}</div>, document.body)}
    {open && lost && createPortal(<button onClick={backToReading} className="fixed bottom-32 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full border border-accent bg-surface px-4 py-2 text-sm font-medium shadow-glow cursor-pointer"><LocateFixed className="size-4 text-accent" /> Back to reading</button>, document.body)}
    {open && createPortal(
      <div role="region" aria-label="Read aloud player" className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/80" data-read-skip>
        <div className="mx-auto max-w-5xl px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 sm:px-5">
          <div className="relative">
            <input type="range" aria-label="Seek" min={0} max={Math.max(1, dur)} step={0.1} value={Math.min(time, dur || 0)} onChange={(e) => seekTime(+e.target.value)} className="of-range w-full" style={{ ['--pct' as string]: pct + '%' }} />
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2">{chapters.map((c) => <span key={c.id + c.t} className="absolute top-0 h-1.5 w-0.5 bg-bg" style={{ left: `${dur ? (c.t / dur) * 100 : 0}%` }} />)}</div>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 sm:gap-2">
            <button aria-label="Back 10 seconds" title="Back 10 s (Left arrow)" onClick={() => skip(-10)} className="grid size-9 place-items-center rounded-full text-muted hover:text-fg cursor-pointer"><RotateCcw className="size-4" /></button>
            <button aria-label={playing ? 'Pause' : 'Play'} title="Play or pause (Space)" onClick={toggle} className="grid size-11 place-items-center rounded-full bg-accent text-on-accent shadow-glow cursor-pointer">{loading && playing ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-px" />}</button>
            <button aria-label="Forward 10 seconds" title="Forward 10 s (Right arrow)" onClick={() => skip(10)} className="grid size-9 place-items-center rounded-full text-muted hover:text-fg cursor-pointer"><RotateCw className="size-4" /></button>
            <div className="min-w-0 flex-1 px-1">
              <div className="truncate text-xs font-medium sm:text-sm">{curChapter || title}</div>
              <div className="text-[11px] tabular-nums text-muted">{fmtTime(time)} / {fmtTime(dur)}{!isNeural && ' (estimate)'}</div>
            </div>
            <select aria-label="Speed" value={prefs.rate} onChange={(e) => setRate(+e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-1.5 text-xs cursor-pointer">{SPEEDS.map((s) => <option key={s} value={s}>{s}x</option>)}</select>
            <select aria-label="Voice" value={prefs.voice} onChange={(e) => setPrefs((p) => ({ ...p, voice: e.target.value }))} className="hidden h-9 max-w-44 rounded-lg border border-border bg-surface px-1.5 text-xs sm:block cursor-pointer">
              {neural.length > 0 && <optgroup label="Natural voices (recorded)">{neural.map((v) => <option key={v.id} value={'neural:' + v.id}>{v.label}, {v.gender}, {v.accent}</option>)}</optgroup>}
              <option value="system:">System default voice</option>
              {voiceGroups.map(([lang, vs]) => <optgroup key={lang} label={lang}>{vs.map((v) => <option key={v.voiceURI} value={'system:' + v.voiceURI}>{v.name}{v.localService ? '' : ' (online)'}</option>)}</optgroup>)}
            </select>
            <button aria-label="Chapters" title="Chapters" onClick={() => setPanel(panel === 'chapters' ? 'none' : 'chapters')} className={cn('grid size-9 place-items-center rounded-full hover:text-fg cursor-pointer', panel === 'chapters' ? 'text-accent' : 'text-muted')}><ListOrdered className="size-4" /></button>
            <button aria-label="Player settings" title="Settings" onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')} className={cn('grid size-9 place-items-center rounded-full hover:text-fg cursor-pointer', panel === 'settings' ? 'text-accent' : 'text-muted')}><Settings2 className="size-4" /></button>
            {isNeural && nv && <a aria-label="Download MP3" title={`Download MP3${nv.mp3 ? ` (${(nv.mp3 / 1e6).toFixed(1)} MB)` : ''}`} href={mp3Url(slug, nv.id)} download={`${slug}-${nv.id}.mp3`} className="hidden size-9 place-items-center rounded-full text-muted hover:text-fg sm:grid"><Download className="size-4" /></a>}
            <button aria-label="Close player" title="Close" onClick={close} className="grid size-9 place-items-center rounded-full text-muted hover:text-fg cursor-pointer"><X className="size-4" /></button>
          </div>
          {panel === 'chapters' && (
            <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-border bg-surface p-1 scrollbar-thin">
              {chapters.length ? chapters.map((c, i) => <button key={c.id + i} onClick={() => { seekTime(c.t); if (!playingRef.current) play() }} className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-surface-2 cursor-pointer', curChapter === c.label && 'text-accent')}><span className="w-10 shrink-0 text-xs tabular-nums text-muted">{fmtTime(c.t)}</span>{c.label}</button>) : <div className="p-3 text-sm text-muted">No chapters yet.</div>}
            </div>
          )}
          {panel === 'settings' && (
            <div className="mt-2 grid gap-3 rounded-xl border border-border bg-surface p-3 text-sm sm:grid-cols-2">
              <label className="grid gap-1 sm:hidden"><span className="text-xs text-muted">Voice</span>
                <select value={prefs.voice} onChange={(e) => setPrefs((p) => ({ ...p, voice: e.target.value }))} className="h-9 rounded-lg border border-border bg-bg px-2 text-sm">
                  {neural.length > 0 && <optgroup label="Natural voices (recorded)">{neural.map((v) => <option key={v.id} value={'neural:' + v.id}>{v.label}, {v.gender}, {v.accent}</option>)}</optgroup>}
                  <option value="system:">System default voice</option>
                  {voiceGroups.map(([lang, vs]) => <optgroup key={lang} label={lang}>{vs.map((v) => <option key={v.voiceURI} value={'system:' + v.voiceURI}>{v.name}</option>)}</optgroup>)}
                </select></label>
              <label className="grid gap-1"><span className="flex items-center gap-1.5 text-xs text-muted"><Volume2 className="size-3.5" /> Volume {Math.round(prefs.volume * 100)}%</span>
                <input type="range" min={0} max={1} step={0.05} value={prefs.volume} onChange={(e) => setPrefs((p) => ({ ...p, volume: +e.target.value }))} className="of-range" style={{ ['--pct' as string]: prefs.volume * 100 + '%' }} /></label>
              <label className="grid gap-1"><span className="text-xs text-muted">Pitch {prefs.pitch.toFixed(1)}{isNeural ? ' (system voices only)' : ''}</span>
                <input type="range" min={0.5} max={2} step={0.1} disabled={isNeural} value={prefs.pitch} onChange={(e) => { setPrefs((p) => ({ ...p, pitch: +e.target.value })); if (!isNeural && playingRef.current) setTimeout(() => speakFrom(sysIdx.current), 0) }} className="of-range disabled:opacity-40" style={{ ['--pct' as string]: ((prefs.pitch - 0.5) / 1.5) * 100 + '%' }} /></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={prefs.follow} onChange={(e) => { setPrefs((p) => ({ ...p, follow: e.target.checked })); lostRef.current = false; setLost(false) }} className="accent-[var(--accent)]" /> Follow the spoken word (auto scroll)</label>
              {isNeural && nv && <a href={mp3Url(slug, nv.id)} download={`${slug}-${nv.id}.mp3`} className="flex items-center gap-2 text-accent sm:hidden"><Download className="size-4" /> Download MP3</a>}
              <p className="text-xs text-muted sm:col-span-2">Click any word to read from there. Right click for more. Keys: Space play or pause, Left and Right skip 10 s, plus and minus change speed. Natural voices are recorded with Piper, an open source neural voice that runs offline.</p>
            </div>
          )}
        </div>
      </div>, document.body)}
  </>
})

/** Button that opens the player, with the listen time */
export function ListenButton({ minutes, onClick, className }: { minutes: number; onClick: () => void; className?: string }) {
  return <button onClick={onClick} className={cn('inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 hover:border-accent hover:text-fg cursor-pointer', className)}><Headphones className="size-3.5 text-accent" /> Listen, {minutes} min</button>
}
