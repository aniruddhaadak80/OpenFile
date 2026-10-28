// Live mini demos embedded in blog posts. Each one runs fully in the browser, like the tools themselves.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Check, X, Play, RotateCcw, Cpu, Keyboard, Volume2, ShieldCheck, ArrowRight } from 'lucide-react'
import { formatBytes } from '@/lib/files'
import { FORMAT_GROUPS, toolsForFormat } from '@/lib/formats'
import { toolBySlug, CATEGORIES } from '@/tools/registry'
import { getIcon } from '@/components/icons'
import { WatchPreview } from '@/components/ToolPreview'
import { Button, Segmented, Slider, cn } from '@/components/ui'

/** Frame used around every demo */
export function DemoFrame({ title, children, note }: { title: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <figure className="not-prose my-8 overflow-hidden rounded-2xl border border-border bg-surface">
      <figcaption className="flex items-center gap-2 border-b border-border bg-surface-2/50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
        <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-accent" /></span>
        Live demo | {title}
      </figcaption>
      <div className="p-4 sm:p-5">{children}</div>
      {note && <div className="border-t border-border px-4 py-2.5 text-xs text-muted">{note}</div>}
    </figure>
  )
}

/* ---------------- privacy: hash a file locally and count network requests ---------------- */
export function LocalHashDemo() {
  const [res, setRes] = useState<{ name: string; size: number; hash: string; ms: number; requests: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const run = async (f: File) => {
    setBusy(true)
    const before = performance.getEntriesByType('resource').length
    const t0 = performance.now()
    const buf = await f.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', buf)
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    const ms = Math.round(performance.now() - t0)
    await new Promise((r) => setTimeout(r, 150))
    setRes({ name: f.name, size: f.size, hash, ms, requests: performance.getEntriesByType('resource').length - before })
    setBusy(false)
  }
  return (
    <DemoFrame title="Hash a file without uploading it" note="The request counter reads the browser's own Performance API. Open DevTools, Network, and watch it stay empty while you try.">
      <input ref={ref} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(f); e.target.value = '' }} />
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => ref.current?.click()} loading={busy} icon={<Upload className="size-4" />}>Pick any file</Button>
        <span className="text-sm text-muted">Any size. It is read into this tab only.</span>
      </div>
      <AnimatePresence>
        {res && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat label="File" value={res.name} sub={formatBytes(res.size)} />
            <Stat label="Time" value={`${res.ms} ms`} sub="on your CPU" />
            <Stat label="Network requests" value={String(res.requests)} sub={res.requests === 0 ? 'nothing left the tab' : 'unrelated page assets'} good={res.requests === 0} />
            <div className="sm:col-span-3 rounded-xl border border-border bg-surface-2/40 p-3 font-mono text-xs break-all"><span className="text-muted">SHA-256 </span>{res.hash}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </DemoFrame>
  )
}
function Stat({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return <div className="rounded-xl border border-border bg-surface-2/40 p-3"><div className="text-[11px] uppercase tracking-wider text-muted">{label}</div><div className={cn('mt-1 truncate font-display text-lg font-semibold', good && 'text-success')}>{value}</div>{sub && <div className="text-xs text-muted">{sub}</div>}</div>
}

/* ---------------- pdf: page range parser ---------------- */
export function parseRanges(input: string, total: number): number[] {
  const out = new Set<number>()
  for (const part of input.split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d*)-(\d*)$/)
    if (m) { const a = m[1] ? Number(m[1]) : 1; const b = m[2] ? Number(m[2]) : total; for (let i = Math.max(1, a); i <= Math.min(total, b); i++) out.add(i) }
    else if (/^\d+$/.test(part)) { const n = Number(part); if (n >= 1 && n <= total) out.add(n) }
  }
  return [...out].sort((a, b) => a - b)
}
export function PageRangeDemo() {
  const [q, setQ] = useState('1-3, 7, 10-')
  const [total, setTotal] = useState(14)
  const pages = useMemo(() => parseRanges(q, total), [q, total])
  return (
    <DemoFrame title="Page range picker" note="This is the same syntax Split, Extract, Merge and Delete pages accept.">
      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <label className="block"><span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">Range</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} className="h-10 w-full rounded-xl border border-border bg-surface-2/60 px-3 font-mono text-sm outline-none focus:border-accent" /></label>
        <Slider label="Pages in the PDF" value={total} min={1} max={30} onChange={setTotal} />
      </div>
      <div className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-10">
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
          const on = pages.includes(n)
          return <motion.div key={n} layout animate={{ scale: on ? 1 : 0.94, opacity: on ? 1 : 0.45 }} className={cn('grid aspect-[3/4] place-items-center rounded-lg border text-xs font-semibold', on ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface-2/50 text-muted')}>{n}</motion.div>
        })}
      </div>
      <p className="mt-3 text-sm text-muted">{pages.length} of {total} pages selected{pages.length ? `: ${pages.join(', ')}` : ''}</p>
    </DemoFrame>
  )
}

/* ---------------- images: before / after compression slider ---------------- */
function drawSample(c: HTMLCanvasElement) {
  const w = (c.width = 960), h = (c.height = 600)
  const g = c.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#0b1a2a'); sky.addColorStop(0.55, '#f5a524'); sky.addColorStop(1, '#3a1a05')
  g.fillStyle = sky; g.fillRect(0, 0, w, h)
  g.fillStyle = '#ffe2a3'; g.beginPath(); g.arc(w * 0.68, h * 0.5, 70, 0, Math.PI * 2); g.fill()
  for (let l = 0; l < 3; l++) {
    g.fillStyle = ['#2a1404', '#1a0c02', '#0a0501'][l]
    g.beginPath(); g.moveTo(0, h)
    for (let x = 0; x <= w; x += 8) g.lineTo(x, h * (0.62 + l * 0.1) + Math.sin(x * (0.01 + l * 0.004) + l) * (30 - l * 6) + Math.sin(x * 0.05) * 6)
    g.lineTo(w, h); g.fill()
  }
  // fine detail: noise and thin lines show compression artefacts clearly
  const img = g.getImageData(0, 0, w, h)
  let seed = 7
  for (let i = 0; i < img.data.length; i += 4) { seed = (seed * 16807) % 2147483647; const n = (seed / 2147483647 - 0.5) * 22; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n }
  g.putImageData(img, 0, 0)
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1
  for (let i = 0; i < 40; i++) { g.beginPath(); g.moveTo(40 + i * 6, 40); g.lineTo(40 + i * 6, 120); g.stroke() }
  g.font = 'bold 34px system-ui, sans-serif'; g.fillStyle = '#fff'; g.fillText('Fine text shows artefacts first', 40, 170)
  g.font = '15px system-ui, sans-serif'; g.fillText('Small letters, sharp edges and smooth gradients are where encoders struggle.', 40, 200)
}
export function BeforeAfterDemo() {
  const [q, setQ] = useState(40)
  const [fmt, setFmt] = useState<'image/jpeg' | 'image/webp'>('image/jpeg')
  const [pos, setPos] = useState(50)
  const [orig, setOrig] = useState<{ url: string; size: number } | null>(null)
  const [out, setOut] = useState<{ url: string; size: number } | null>(null)
  const src = useRef<HTMLCanvasElement | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const loadDefault = () => {
    const c = document.createElement('canvas'); drawSample(c); src.current = c
    c.toBlob((b) => { if (b) setOrig({ url: URL.createObjectURL(b), size: b.size }) }, 'image/png')
  }
  useEffect(loadDefault, [])
  const useFile = async (f: File) => {
    const bmp = await createImageBitmap(f)
    const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height); src.current = c
    setOrig({ url: URL.createObjectURL(f), size: f.size })
  }
  useEffect(() => {
    const c = src.current
    if (!c || !orig) return
    const t = setTimeout(() => c.toBlob((b) => { if (b) setOut((prev) => { if (prev) URL.revokeObjectURL(prev.url); return { url: URL.createObjectURL(b), size: b.size } }) }, fmt, q / 100), 60)
    return () => clearTimeout(t)
  }, [q, fmt, orig])
  const drag = (clientX: number) => { const r = box.current?.getBoundingClientRect(); if (r) setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100))) }
  return (
    <DemoFrame title="Drag to compare original and compressed" note="Encoding uses your browser's own JPG and WebP encoders, the same ones the image tools use.">
      <div ref={box} className="relative aspect-[8/5] w-full cursor-ew-resize touch-none select-none overflow-hidden rounded-xl bg-black"
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag(e.clientX) }} onPointerMove={(e) => { if (e.buttons) drag(e.clientX) }}
        role="slider" aria-label="Comparison position" aria-valuenow={Math.round(pos)} aria-valuemin={0} aria-valuemax={100} tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 4)); if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 4)) }}>
        {out && <img src={out.url} alt="Compressed" className="absolute inset-0 size-full object-cover" draggable={false} />}
        {orig && <img src={orig.url} alt="Original" className="absolute inset-0 size-full object-cover" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} draggable={false} />}
        <div className="absolute inset-y-0 w-0.5 bg-accent shadow-[0_0_12px_var(--accent)]" style={{ left: `${pos}%` }}><div className="absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-accent text-on-accent shadow-lg">||</div></div>
        <span className="absolute left-3 top-3 rounded-md bg-black/70 px-2 py-1 text-xs text-white">Original {orig ? formatBytes(orig.size) : ''}</span>
        <span className="absolute right-3 top-3 rounded-md bg-black/70 px-2 py-1 text-xs text-white">{fmt === 'image/jpeg' ? 'JPG' : 'WebP'} q{q} {out ? formatBytes(out.size) : ''}</span>
      </div>
      <div className="mt-4 grid items-end gap-4 sm:grid-cols-[1fr_auto_auto]">
        <Slider label="Quality" value={q} min={5} max={100} onChange={setQ} />
        <Segmented value={fmt} onChange={setFmt} options={[{ value: 'image/jpeg', label: 'JPG' }, { value: 'image/webp', label: 'WebP' }]} />
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void useFile(f); e.target.value = '' }} />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} icon={<Upload className="size-3.5" />}>Your photo</Button>
          <Button size="sm" variant="ghost" onClick={loadDefault} icon={<RotateCcw className="size-3.5" />}>Reset</Button>
        </div>
      </div>
      {orig && out && <p className="mt-3 text-sm"><span className="text-muted">Saved </span><span className={out.size < orig.size ? 'font-semibold text-success' : 'font-semibold text-warn'}>{Math.round((1 - out.size / orig.size) * 100)}%</span><span className="text-muted"> compared with the original.</span></p>}
    </DemoFrame>
  )
}

/* ---------------- video: what your browser supports ---------------- */
const SIMD_TEST = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])
export function CapabilityDemo() {
  const [caps, setCaps] = useState<{ label: string; ok: boolean; detail: string }[] | null>(null)
  const check = async () => {
    const nav = navigator as any
    let gpu = false
    try { gpu = !!(nav.gpu && (await nav.gpu.requestAdapter())) } catch { gpu = false }
    let simd = false
    try { simd = typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_TEST) } catch { simd = false }
    setCaps([
      { label: 'WebAssembly', ok: typeof WebAssembly === 'object', detail: 'runs ffmpeg, OCR and PDF engines' },
      { label: 'WASM SIMD', ok: simd, detail: 'faster pixel and audio math' },
      { label: 'Threads', ok: typeof SharedArrayBuffer !== 'undefined' && (self as any).crossOriginIsolated === true, detail: 'multi-core ffmpeg when isolated' },
      { label: 'WebGPU', ok: gpu, detail: 'speeds up on-device AI models' },
      { label: 'WebCodecs', ok: typeof (self as any).VideoEncoder === 'function', detail: 'hardware video encode and decode' },
      { label: 'CPU cores', ok: (navigator.hardwareConcurrency || 0) >= 4, detail: `${navigator.hardwareConcurrency || 'unknown'} logical cores` },
      { label: 'Memory hint', ok: (nav.deviceMemory || 8) >= 4, detail: nav.deviceMemory ? `about ${nav.deviceMemory} GB` : 'not reported by this browser' },
    ])
  }
  useEffect(() => { void check() }, [])
  return (
    <DemoFrame title="What your browser can do" note="Nothing here is sent anywhere. The checks run once, in this tab.">
      <div className="grid gap-2 sm:grid-cols-2">
        {(caps ?? []).map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/40 px-3 py-2.5">
            <span className={cn('grid size-7 place-items-center rounded-full', c.ok ? 'bg-success/15 text-success' : 'bg-surface-2 text-muted')}>{c.ok ? <Check className="size-4" /> : <X className="size-4" />}</span>
            <div className="min-w-0"><div className="text-sm font-medium">{c.label}</div><div className="truncate text-xs text-muted">{c.detail}</div></div>
          </motion.div>
        ))}
        {!caps && <div className="flex items-center gap-2 text-sm text-muted"><Cpu className="size-4 animate-pulse" /> Checking</div>}
      </div>
    </DemoFrame>
  )
}

/* ---------------- workspace: animated pipeline ---------------- */
const STEPS = ['Resize to 1600 px', 'Add watermark', 'Strip EXIF', 'Convert to WebP', 'Zip everything']
export function PipelineDemo() {
  const [on, setOn] = useState<boolean[]>(STEPS.map(() => true))
  const [done, setDone] = useState(0)
  const [running, setRunning] = useState(false)
  const total = 24
  const active = STEPS.filter((_, i) => on[i])
  useEffect(() => {
    if (!running) return
    if (done >= total) { setRunning(false); return }
    const t = setTimeout(() => setDone((d) => d + 1), 60 + active.length * 18)
    return () => clearTimeout(t)
  }, [running, done, active.length])
  return (
    <DemoFrame title="A recipe, step by step" note="A simulation of the Workspace flow. The real one processes your files with the same steps.">
      <div className="space-y-2">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => !running && setOn((o) => o.map((v, k) => (k === i ? !v : v)))} className={cn('flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition cursor-pointer', on[i] ? 'border-accent/40 bg-accent/5' : 'border-border opacity-50')}>
            <span className={cn('grid size-6 place-items-center rounded-full text-[11px] font-bold', on[i] ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted')}>{i + 1}</span>
            <span className="flex-1">{s}</span>
            {running && on[i] && <span className="shimmer h-1.5 w-16 rounded-full" />}
            <span className="text-xs text-muted">{on[i] ? 'on' : 'off'}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => { setDone(0); setRunning(true) }} disabled={running || !active.length} icon={<Play className="size-4" />}>Run on {total} photos</Button>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><motion.div className="h-full bg-gradient-brand" animate={{ width: `${(done / total) * 100}%` }} /></div>
        <span className="font-mono text-xs text-muted">{done}/{total}</span>
      </div>
    </DemoFrame>
  )
}

/* ---------------- sketch board: shortcut trainer ---------------- */
const DRILL: { keys: string; label: string; test: (e: KeyboardEvent) => boolean }[] = [
  { keys: '2', label: 'Rectangle tool', test: (e) => e.key === '2' },
  { keys: '4', label: 'Ellipse tool', test: (e) => e.key === '4' },
  { keys: '5', label: 'Arrow tool', test: (e) => e.key === '5' },
  { keys: '8', label: 'Text tool', test: (e) => e.key === '8' },
  { keys: 'S', label: 'Sticky note', test: (e) => e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && !e.altKey },
  { keys: 'Q', label: 'Keep the tool active after drawing', test: (e) => e.key.toLowerCase() === 'q' && !e.ctrlKey && !e.metaKey },
  { keys: 'Ctrl D', label: 'Duplicate selection', test: (e) => (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' },
  { keys: 'Ctrl G', label: 'Group selection', test: (e) => (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'g' },
  { keys: 'Shift 1', label: 'Zoom to fit everything', test: (e) => e.shiftKey && e.code === 'Digit1' },
  { keys: '?', label: 'Show all shortcuts', test: (e) => e.key === '?' },
]
export function ShortcutTrainer() {
  const [i, setI] = useState(0)
  const [hits, setHits] = useState(0)
  const [flash, setFlash] = useState<'ok' | 'no' | null>(null)
  const [focus, setFocus] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const cur = DRILL[i % DRILL.length]
  const onKey = (e: React.KeyboardEvent) => {
    if (['Shift', 'Control', 'Meta', 'Alt'].includes(e.key)) return
    e.preventDefault()
    if (cur.test(e.nativeEvent)) { setHits((h) => h + 1); setFlash('ok'); setTimeout(() => { setFlash(null); setI((x) => x + 1) }, 350) }
    else { setFlash('no'); setTimeout(() => setFlash(null), 350) }
  }
  return (
    <DemoFrame title="Shortcut trainer" note="Click the box, then press the keys. On a Mac, Cmd works where it says Ctrl.">
      <div ref={ref} tabIndex={0} onKeyDown={onKey} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        className={cn('grid min-h-40 place-items-center rounded-xl border-2 border-dashed p-6 text-center outline-none transition', focus ? 'border-accent bg-accent/5' : 'border-border', flash === 'ok' && 'border-success bg-success/10', flash === 'no' && 'border-danger bg-danger/10')}>
        {focus ? (
          <AnimatePresence mode="wait">
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <div className="text-sm text-muted">Press the shortcut for</div>
              <div className="mt-1 font-display text-2xl font-semibold">{cur.label}</div>
              <div className="mt-3 flex justify-center gap-1.5">{cur.keys.split(' ').map((k) => <kbd key={k} className="rounded-lg border border-border border-b-2 bg-surface px-2.5 py-1 font-mono text-sm">{k}</kbd>)}</div>
            </motion.div>
          </AnimatePresence>
        ) : <div className="flex items-center gap-2 text-muted"><Keyboard className="size-5" /> Click here to start</div>}
      </div>
      <p className="mt-3 text-sm text-muted">{hits} correct so far</p>
    </DemoFrame>
  )
}

/* ---------------- formats: interactive explorer ---------------- */
const FORMAT_INFO: Record<string, { what: string; good: string; bad: string; lossy?: boolean }> = {
  PDF: { what: 'A fixed page layout that looks the same everywhere.', good: 'Sharing, printing, signing, archiving.', bad: 'Editing text is awkward.' },
  DOCX: { what: 'The Word document format, a zip of XML files.', good: 'Documents people will keep editing.', bad: 'Layout can shift between apps.' },
  XLSX: { what: 'The Excel workbook format.', good: 'Tables with formulas and many sheets.', bad: 'Overkill for plain data, use CSV.' },
  EPUB: { what: 'A reflowable e-book made of HTML pages.', good: 'Reading on phones and e-readers.', bad: 'Not for fixed layouts.' },
  MD: { what: 'Plain text with light formatting marks.', good: 'Notes, READMEs, docs in git.', bad: 'No precise layout.' },
  HTML: { what: 'The language of web pages.', good: 'Anything shown in a browser.', bad: 'Needs a browser to look right.' },
  TXT: { what: 'Plain text, nothing else.', good: 'Logs, quick notes, anything simple.', bad: 'No formatting at all.' },
  JPG: { what: 'The classic photo format with lossy compression.', good: 'Photos, universal support.', bad: 'No transparency, smears sharp text.', lossy: true },
  PNG: { what: 'Lossless images with transparency.', good: 'Screenshots, logos, UI, text.', bad: 'Big files for photos.' },
  WEBP: { what: 'A modern format, lossy or lossless, with transparency.', good: 'Web images, usually 25 to 35 percent smaller than JPG.', bad: 'Some older apps cannot open it.', lossy: true },
  AVIF: { what: 'Newest image format, based on the AV1 video codec.', good: 'The smallest files at a given quality.', bad: 'Slow to encode.', lossy: true },
  GIF: { what: 'An old format for simple animation, 256 colors.', good: 'Short loops that play everywhere.', bad: 'Huge files, banding. Prefer MP4 or WebP.' },
  HEIC: { what: 'The default iPhone photo format.', good: 'Small photos on Apple devices.', bad: 'Poor support on Windows and the web.', lossy: true },
  SVG: { what: 'Vector graphics written as XML.', good: 'Icons and logos at any size.', bad: 'Not for photos.' },
  BMP: { what: 'Raw, uncompressed pixels.', good: 'Almost nothing today.', bad: 'Enormous files.' },
  TIFF: { what: 'A flexible format used in print and scanning.', good: 'Archival scans, print work.', bad: 'Large, patchy browser support.' },
  ICO: { what: 'Icon container with several sizes inside.', good: 'Favicons and Windows icons.', bad: 'Only for icons.' },
  MP4: { what: 'The most common video container, usually H.264 inside.', good: 'Plays on almost everything.', bad: 'Patent-encumbered codecs.', lossy: true },
  WEBM: { what: 'An open video container with VP9 or AV1 inside.', good: 'Web video, small files.', bad: 'Older Apple devices struggle.', lossy: true },
  MOV: { what: 'Apple QuickTime container.', good: 'Editing on Mac, iPhone footage.', bad: 'Large files, convert before sharing.', lossy: true },
  MKV: { what: 'A container that holds almost anything.', good: 'Multiple audio tracks and subtitles.', bad: 'Browsers rarely play it directly.' },
  AVI: { what: 'An old Windows video container.', good: 'Legacy files.', bad: 'Convert it to MP4.' },
  MP3: { what: 'The classic compressed audio format.', good: 'Music and podcasts, plays everywhere.', bad: 'Lower quality than AAC at the same size.', lossy: true },
  WAV: { what: 'Uncompressed audio.', good: 'Editing and recording masters.', bad: 'About 10 MB per minute.' },
  OGG: { what: 'Open audio container, usually Vorbis or Opus.', good: 'Games and the web.', bad: 'Some Apple apps skip it.', lossy: true },
  AAC: { what: 'The successor to MP3.', good: 'Better quality per byte than MP3.', bad: 'Slightly less universal.', lossy: true },
  FLAC: { what: 'Lossless compressed audio.', good: 'Archiving music at full quality.', bad: 'Files are about half of WAV, still big.' },
  M4A: { what: 'AAC audio in an MP4 container.', good: 'Apple music and voice memos.', bad: 'Same limits as AAC.', lossy: true },
  JSON: { what: 'Structured data as text.', good: 'APIs and config.', bad: 'No comments, verbose for tables.' },
  CSV: { what: 'Rows and columns separated by commas.', good: 'Spreadsheets and data exchange.', bad: 'No types, quoting can bite.' },
  XML: { what: 'Tagged structured data.', good: 'Documents and older APIs.', bad: 'Verbose.' },
  YAML: { what: 'Human friendly structured data.', good: 'Config files.', bad: 'Indentation mistakes are easy.' },
  SQL: { what: 'Database queries and dumps.', good: 'Working with databases.', bad: 'Dialects differ.' },
  ZIP: { what: 'A compressed archive of files.', good: 'Bundling many files.', bad: 'Weak legacy encryption.' },
}
export function FormatExplorer() {
  const [group, setGroup] = useState(FORMAT_GROUPS[0].id)
  const g = FORMAT_GROUPS.find((x) => x.id === group)!
  const [sel, setSel] = useState('PDF')
  const info = FORMAT_INFO[sel]
  const tools = toolsForFormat(sel).slice(0, 6)
  return (
    <DemoFrame title="Format explorer" note="Tool counts come from the live tool catalog.">
      <div className="flex flex-wrap gap-1.5">
        {FORMAT_GROUPS.map((x) => <button key={x.id} onClick={() => { setGroup(x.id); setSel(x.formats.find((f) => FORMAT_INFO[f]) ?? x.formats[0]) }} className={cn('rounded-full px-3 py-1 text-xs font-medium transition cursor-pointer', group === x.id ? 'text-on-accent' : 'border border-border text-muted hover:text-fg')} style={group === x.id ? { background: x.color } : undefined}>{x.name}</button>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {g.formats.map((f) => <motion.button key={f} layout whileHover={{ y: -2 }} onClick={() => setSel(f)} className={cn('rounded-lg border px-2.5 py-1.5 font-mono text-xs font-semibold transition cursor-pointer', sel === f ? 'border-transparent text-black' : 'border-border text-muted hover:text-fg')} style={sel === f ? { background: g.color } : undefined}>.{f.toLowerCase()}</motion.button>)}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={sel} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 grid gap-4 sm:grid-cols-[1.3fr_1fr]">
          <div className="rounded-xl border border-border bg-surface-2/40 p-4">
            <div className="flex items-center gap-2"><span className="font-display text-xl font-bold">{sel}</span>{info?.lossy !== undefined && <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold', info.lossy ? 'bg-orange/15 text-orange' : 'bg-success/15 text-success')}>{info.lossy ? 'LOSSY' : 'LOSSLESS'}</span>}</div>
            <p className="mt-2 text-sm">{info?.what ?? 'A format OpenFile can read or write.'}</p>
            {info && <dl className="mt-3 space-y-1.5 text-sm"><div className="flex gap-2"><dt className="w-16 shrink-0 text-success">Good for</dt><dd className="text-muted">{info.good}</dd></div><div className="flex gap-2"><dt className="w-16 shrink-0 text-orange">Watch out</dt><dd className="text-muted">{info.bad}</dd></div></dl>}
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted">{toolsForFormat(sel).length} tools work with {sel}</div>
            <div className="mt-2 space-y-1">{tools.map((t) => { const I = getIcon(t.icon); const c = CATEGORIES.find((x) => x.id === t.category)?.color; return <Link key={t.slug} to={`/${t.slug}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2"><I className="size-4" style={{ color: c }} />{t.name}</Link> })}</div>
            {tools.length > 0 && <Link to={`/tools?format=${sel}`} className="mt-1 inline-flex items-center gap-1 px-2 text-xs text-accent hover:underline">See all <ArrowRight className="size-3" /></Link>}
          </div>
        </motion.div>
      </AnimatePresence>
    </DemoFrame>
  )
}

/* ---------------- developer: live JSON formatter ---------------- */
export function JsonDemo() {
  const [txt, setTxt] = useState('{"name":"OpenFile","private":true,"tools":["pdf","image","video"],"version":1}')
  const [indent, setIndent] = useState<'2' | '4' | 'min'>('2')
  const out = useMemo(() => {
    try { const v = JSON.parse(txt); return { ok: true as const, text: indent === 'min' ? JSON.stringify(v) : JSON.stringify(v, null, Number(indent)) } }
    catch (e: any) { return { ok: false as const, text: String(e?.message || e) } }
  }, [txt, indent])
  return (
    <DemoFrame title="JSON formatter" note="Type broken JSON to see the error message. The full tool adds a tree view, search and JSON Schema checks.">
      <div className="grid gap-3 md:grid-cols-2">
        <textarea value={txt} onChange={(e) => setTxt(e.target.value)} spellCheck={false} className="min-h-44 w-full rounded-xl border border-border bg-surface-2/60 p-3 font-mono text-xs outline-none focus:border-accent" aria-label="JSON input" />
        <pre className={cn('min-h-44 overflow-auto rounded-xl border p-3 font-mono text-xs', out.ok ? 'border-border bg-bg' : 'border-danger/40 bg-danger/5 text-danger')}>{out.text}</pre>
      </div>
      <div className="mt-3"><Segmented value={indent} onChange={setIndent} options={[{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }, { value: 'min', label: 'Minify' }]} /></div>
    </DemoFrame>
  )
}

/* ---------------- voice: system voices check ---------------- */
export function VoiceCheckDemo() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[] | null>(null)
  const [text, setText] = useState('Hello. This sentence is spoken on your own device.')
  useEffect(() => {
    if (!('speechSynthesis' in window)) { setVoices([]); return }
    const load = () => setVoices(speechSynthesis.getVoices())
    load(); speechSynthesis.addEventListener?.('voiceschanged', load)
    const t = setTimeout(load, 800)
    return () => { clearTimeout(t); speechSynthesis.removeEventListener?.('voiceschanged', load) }
  }, [])
  const has = !!voices?.length
  return (
    <DemoFrame title="Does your browser have voices" note="If the count is zero, the Text to Speech tool switches to its in-browser neural voice automatically.">
      <div className="flex flex-wrap items-center gap-3">
        <div className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-sm', has ? 'border-success/40 text-success' : 'border-border text-muted')}><ShieldCheck className="size-4" /> {voices === null ? 'Checking' : `${voices.length} system voice${voices.length === 1 ? '' : 's'}`}</div>
        {has && <span className="text-xs text-muted">for example {voices!.slice(0, 3).map((v) => v.name).join(', ')}</span>}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input value={text} onChange={(e) => setText(e.target.value)} className="h-10 flex-1 rounded-xl border border-border bg-surface-2/60 px-3 text-sm outline-none focus:border-accent" aria-label="Text to speak" />
        {has ? <Button icon={<Volume2 className="size-4" />} onClick={() => { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(text)) }}>Speak</Button>
          : <Link to="/text-to-speech"><Button icon={<Volume2 className="size-4" />}>Try the neural voice</Button></Link>}
      </div>
    </DemoFrame>
  )
}

/* ---------------- tool cards + preview videos for a post ---------------- */
export function PostTools({ slugs }: { slugs: string[] }) {
  const tools = slugs.map(toolBySlug).filter((t): t is NonNullable<typeof t> => !!t)
  if (!tools.length) return null
  return (
    <div className="not-prose my-10">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Tools from this post</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {tools.map((t) => { const I = getIcon(t.icon); const c = CATEGORIES.find((x) => x.id === t.category)?.color ?? 'var(--accent)'; return (
          <Link key={t.slug} to={`/${t.slug}`} className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 transition hover:border-accent">
            <span className="grid size-9 place-items-center rounded-lg" style={{ background: c + '1a', color: c }}><I className="size-4" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{t.name}</span><span className="block truncate text-xs text-muted">{t.desc}</span></span>
            <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" />
          </Link>) })}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{tools.slice(0, 4).map((t) => <WatchPreview key={t.slug} slug={t.slug} name={t.name} />)}</div>
    </div>
  )
}
