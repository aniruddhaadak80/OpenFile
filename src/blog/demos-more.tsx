// More live mini demos for blog posts (second round). Each runs fully in this tab, like the tools.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, X, Upload, Play, Square, Eraser, Download, ArrowRight, Cpu } from 'lucide-react'
import { DemoFrame } from './demos'
import { formatBytes } from '@/lib/files'
import { detect, PLATFORM_LABEL, BROWSER_LABEL } from '@/lib/app/platform'
import { Button, Segmented, Slider, cn } from '@/components/ui'

function Row({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/40 px-3 py-2.5">
      <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', ok ? 'bg-success/15 text-success' : 'bg-surface-2 text-muted')}>{ok ? <Check className="size-4" /> : <X className="size-4" />}</span>
      <div className="min-w-0"><div className="text-sm font-medium">{label}</div><div className="text-xs text-muted">{detail}</div></div>
    </div>
  )
}
const field = 'of-field rounded-xl border border-border bg-surface-2/60 outline-none'

/* ---------------- install: what fits this device ---------------- */
const BEST: Record<string, string> = {
  web: 'Install the web app from your browser. It is a few megabytes and updates itself.',
  windows: 'Install the web app from Edge or Chrome, or get the Windows installer if you want every engine bundled for offline use.',
  macos: 'Use Safari, File, Add to Dock, or Chrome. The universal .dmg is there if you prefer a classic app.',
  linux: 'Install the web app from Chrome or Chromium, or grab the AppImage, .deb or .rpm.',
  android: 'Open the browser menu and choose Install app, or sideload the APK from the latest release.',
  ios: 'Open this site in Safari, tap Share, then Add to Home Screen.',
  chromeos: 'Install the web app from Chrome and pin it to the shelf.',
}
export function InstallCheckDemo() {
  const [d, setD] = useState<ReturnType<typeof detect> | null>(null)
  const [sw, setSw] = useState<boolean | null>(null)
  useEffect(() => {
    try { setD(detect()) } catch { setD(null) }
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then((r) => setSw(!!r?.active)).catch(() => setSw(false))
    else setSw(false)
  }, [])
  if (!d) return null
  return (
    <DemoFrame title="What fits this device" note="Read from your browser's own user agent and display mode. Nothing is sent anywhere.">
      <div className="grid gap-2 sm:grid-cols-2">
        <Row ok label={`${PLATFORM_LABEL[d.platform]} with ${BROWSER_LABEL[d.browser]}`} detail={d.mobile ? 'a phone or tablet' : 'a desktop or laptop'} />
        <Row ok={d.standalone || !!d.native} label={d.native ? `Inside the ${d.native === 'tauri' ? 'desktop' : 'mobile'} app` : d.standalone ? 'Running as an installed app' : 'Running in a browser tab'} detail={d.standalone || d.native ? 'already installed, nice' : 'installing gives it its own window'} />
        <Row ok={sw} label="Offline support" detail={sw === null ? 'checking' : sw ? 'the service worker is active on this device' : 'not active yet, open the site once more'} />
        <Row ok={'serviceWorker' in navigator} label="Can install as a web app" detail={'serviceWorker' in navigator ? 'this browser supports it' : 'try Chrome, Edge or Safari'} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/5 p-3 text-sm">
        <span className="min-w-0 flex-1"><strong>Best option here: </strong>{BEST[d.platform]}</span>
        <Link to="/install"><Button size="sm" icon={<ArrowRight className="size-4" />}>Open the install guide</Button></Link>
      </div>
    </DemoFrame>
  )
}

/* ---------------- AI: is this device ready for on-device models ---------------- */
export function AiReadinessDemo() {
  const [rows, setRows] = useState<{ ok: boolean; label: string; detail: string }[] | null>(null)
  useEffect(() => {
    void (async () => {
      const nav = navigator as any
      let gpu = false, gpuName = ''
      try { const ad = nav.gpu ? await nav.gpu.requestAdapter() : null; gpu = !!ad; gpuName = ad?.info?.vendor || '' } catch { gpu = false }
      let quota = 0, usage = 0
      try { const e = await navigator.storage?.estimate?.(); quota = e?.quota || 0; usage = e?.usage || 0 } catch { /* not available */ }
      let models = 0
      try { if ('caches' in self && (await caches.has('openfile-models-v1'))) models = (await (await caches.open('openfile-models-v1')).keys()).length } catch { /* not available */ }
      setRows([
        { ok: gpu, label: 'WebGPU', detail: gpu ? `GPU available${gpuName ? ` (${gpuName})` : ''}, models run on it first` : 'not available, models fall back to WebAssembly on the CPU' },
        { ok: typeof Worker === 'function', label: 'Web Workers', detail: 'models run in a background thread so the page stays smooth' },
        { ok: (navigator.hardwareConcurrency || 0) >= 4, label: 'CPU cores', detail: `${navigator.hardwareConcurrency || 'unknown'} logical cores for the WebAssembly path` },
        { ok: (nav.deviceMemory || 8) >= 4, label: 'Memory hint', detail: nav.deviceMemory ? `about ${nav.deviceMemory} GB reported` : 'not reported by this browser' },
        { ok: quota > 1e9, label: 'Storage for models', detail: quota ? `${formatBytes(usage)} used of about ${formatBytes(quota)} this site may use` : 'not reported by this browser' },
        { ok: models > 0, label: 'Cached model files', detail: models ? `${models} model file${models === 1 ? '' : 's'} already saved, they load offline` : 'none yet, the first AI tool you open downloads one' },
      ])
    })()
  }, [])
  return (
    <DemoFrame title="Is this device ready for on-device AI" note="These checks run once in this tab. The storage figure is the browser's own estimate.">
      <div className="grid gap-2 sm:grid-cols-2">
        {(rows ?? []).map((r, i) => <motion.div key={r.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}><Row {...r} /></motion.div>)}
        {!rows && <div className="flex items-center gap-2 text-sm text-muted"><Cpu className="size-4 animate-pulse" /> Checking</div>}
      </div>
    </DemoFrame>
  )
}

/* ---------------- PDF: will it fit in an email ---------------- */
const LIMITS = [{ value: '25', label: 'Gmail 25 MB' }, { value: '20', label: 'Outlook 20 MB' }, { value: '10', label: 'Work server 10 MB' }, { value: '5', label: 'Web form 5 MB' }]
export function EmailFitDemo() {
  const [size, setSize] = useState(38)
  const [limit, setLimit] = useState('25')
  const [scan, setScan] = useState<'scan' | 'text'>('scan')
  const ref = useRef<HTMLInputElement>(null)
  const lim = Number(limit)
  const target = Math.round(lim * 0.85 * 10) / 10
  const ratio = size / target
  let advice: { tone: 'ok' | 'mid' | 'hard'; text: string; to: string; label: string }
  if (ratio <= 1) advice = { tone: 'ok', text: 'It already fits with room to spare. Send it as it is.', to: 'pdf-reader', label: 'Preview it' }
  else if (scan === 'text' && ratio > 1.3) advice = { tone: 'hard', text: `A text PDF this far over rarely shrinks enough. Split it by size into ${Math.ceil(size / target)} parts of up to ${target} MB each.`, to: 'split-pdf', label: 'Split PDF' }
  else if (ratio <= 1.6) advice = { tone: 'mid', text: 'Compress PDF on the Medium preset should be enough.', to: 'compress-pdf', label: 'Compress PDF' }
  else if (ratio <= 4) advice = { tone: 'mid', text: 'Try the High preset first, then Extreme if needed. Scans usually shrink this much.', to: 'compress-pdf', label: 'Compress PDF' }
  else advice = { tone: 'hard', text: `That is a big gap. Compress on High, and if it is still over, split by size into ${Math.ceil(size / 4 / target)} or more parts.`, to: 'split-pdf', label: 'Split PDF' }
  return (
    <DemoFrame title="Will it fit in an email" note="Rule of thumb only. Target is 85 percent of the limit, because mail encoding adds overhead on the way.">
      <input ref={ref} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setSize(Math.max(0.1, Math.round((f.size / 1048576) * 10) / 10)); e.target.value = '' }} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <Slider label="PDF size" value={size} onChange={setSize} min={1} max={200} suffix=" MB" />
          <Button size="sm" variant="outline" icon={<Upload className="size-4" />} onClick={() => ref.current?.click()}>Or read the size of a real PDF</Button>
          <Segmented value={scan} onChange={setScan} options={[{ value: 'scan', label: 'Scanned or photo heavy' }, { value: 'text', label: 'Mostly text' }]} />
        </div>
        <div className="space-y-3">
          <Segmented value={limit} onChange={setLimit} options={LIMITS} />
          <div className="h-3 overflow-hidden rounded-full bg-surface-2"><motion.div className={cn('h-full rounded-full', ratio <= 1 ? 'bg-success' : 'bg-orange')} animate={{ width: `${Math.min(100, (target / size) * 100)}%` }} /></div>
          <div className="text-xs text-muted">Aim for {target} MB or less. {ratio > 1 ? `You need to remove about ${Math.round((1 - 1 / ratio) * 100)} percent.` : 'You are under the target.'}</div>
        </div>
      </div>
      <div className={cn('mt-4 flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm', advice.tone === 'ok' ? 'border-success/40 bg-success/5' : advice.tone === 'mid' ? 'border-accent/40 bg-accent/5' : 'border-orange/40 bg-orange/5')}>
        <span className="min-w-0 flex-1">{advice.text}</span>
        <Link to={`/${advice.to}`}><Button size="sm" variant="outline" icon={<ArrowRight className="size-4" />}>{advice.label}</Button></Link>
      </div>
    </DemoFrame>
  )
}

/* ---------------- images: can this browser open and save these formats ---------------- */
const ENC: [string, string][] = [['JPG', 'image/jpeg'], ['PNG', 'image/png'], ['WebP', 'image/webp'], ['AVIF', 'image/avif']]
const TOOL_FOR: Record<string, [string, string]> = { heic: ['heic-converter', 'HEIC Converter'], heif: ['heic-converter', 'HEIC Converter'], jxl: ['jxl-maker', 'JPEG XL Converter'], avif: ['image-converter', 'Image Converter'], tif: ['pro-image-converter', 'Pro Image Converter'], tiff: ['pro-image-converter', 'Pro Image Converter'] }
export function ImageSupportDemo() {
  const [enc, setEnc] = useState<Record<string, boolean> | null>(null)
  const [res, setRes] = useState<{ name: string; size: number; ok: boolean; w?: number; h?: number; ext: string } | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const c = document.createElement('canvas'); c.width = c.height = 8
    Promise.all(ENC.map(([, m]) => new Promise<boolean>((r) => { try { c.toBlob((b) => r(!!b && b.type === m), m, 0.8) } catch { r(false) } }))).then((v) => setEnc(Object.fromEntries(ENC.map(([n], i) => [n, v[i]]))))
  }, [])
  const test = async (f: File) => {
    const ext = (f.name.split('.').pop() || '').toLowerCase()
    try { const b = await createImageBitmap(f); setRes({ name: f.name, size: f.size, ok: true, w: b.width, h: b.height, ext }); b.close?.() }
    catch { setRes({ name: f.name, size: f.size, ok: false, ext }) }
  }
  const tool = res ? TOOL_FOR[res.ext] ?? ['image-converter', 'Image Converter'] : null
  return (
    <DemoFrame title="What your browser can open and save" note="Saving is tested by asking the canvas for each format. Opening is tested on the file you pick, which never leaves this tab.">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">Native encoders in this browser</div>
      <div className="mt-2 flex flex-wrap gap-2">{ENC.map(([n]) => <span key={n} className={cn('flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold', enc?.[n] ? 'border-success/40 text-success' : 'border-border text-muted')}>{enc?.[n] ? <Check className="size-3.5" /> : <X className="size-3.5" />}{n}</span>)}</div>
      <p className="mt-2 text-xs text-muted">Missing ones are not a problem in OpenFile: AVIF and JPEG XL encoders ship as WebAssembly.</p>
      <input ref={ref} type="file" accept="image/*,.heic,.heif,.jxl,.avif" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void test(f); e.target.value = '' }} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => ref.current?.click()} icon={<Upload className="size-4" />}>Test an image</Button>
        <span className="text-sm text-muted">Try a HEIC from an iPhone, an AVIF or a JPEG XL.</span>
      </div>
      {res && tool && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-2/40 p-3 text-sm">
          <span className={cn('grid size-7 place-items-center rounded-full', res.ok ? 'bg-success/15 text-success' : 'bg-orange/15 text-orange')}>{res.ok ? <Check className="size-4" /> : <X className="size-4" />}</span>
          <span className="min-w-0 flex-1"><strong className="break-all">{res.name}</strong> ({formatBytes(res.size)}): {res.ok ? `your browser opens it natively, ${res.w} by ${res.h} pixels.` : 'your browser cannot open this one on its own.'}</span>
          <Link to={`/${tool[0]}`} className="inline-flex items-center gap-1 text-accent hover:underline">{tool[1]} <ArrowRight className="size-3.5" /></Link>
        </motion.div>
      )}
    </DemoFrame>
  )
}

/* ---------------- GIF: frame rate preview and size estimate ---------------- */
export function GifPlannerDemo() {
  const [fps, setFps] = useState(12)
  const [width, setWidth] = useState(480)
  const [secs, setSecs] = useState(4)
  const [colors, setColors] = useState<'64' | '128' | '256'>('256')
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = canvas.current; if (!c) return
    const ctx = c.getContext('2d')!; let raf = 0, last = 0, t = 0
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (now - last < 1000 / fps) return
      last = now; t = (now / 1000) % 2
      const x = 20 + (c.width - 40) * (t < 1 ? t : 2 - t)
      ctx.fillStyle = '#0b0b0b'; ctx.fillRect(0, 0, c.width, c.height)
      ctx.fillStyle = '#F5A524'; ctx.beginPath(); ctx.arc(x, c.height / 2, 14, 0, Math.PI * 2); ctx.fill()
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [fps])
  const h = Math.round((width * 9) / 16)
  const frames = fps * secs
  const bytes = width * h * frames * 0.45 * (Math.log2(Number(colors)) / 8)
  return (
    <DemoFrame title="Plan a GIF before you make it" note="The size is a rough rule of thumb for 16:9 footage with some motion. Static screen recordings come out much smaller, busy camera footage bigger.">
      <div className="grid gap-4 sm:grid-cols-[1fr_1.1fr]">
        <div className="space-y-3">
          <canvas ref={canvas} width={320} height={90} className="w-full rounded-xl border border-border" aria-label={`A ball moving at ${fps} frames per second`} />
          <p className="text-xs text-muted">The ball is drawn at {fps} frames per second. Below 10 it starts to look choppy.</p>
        </div>
        <div className="space-y-3">
          <Slider label="Frames per second" value={fps} onChange={setFps} min={5} max={30} />
          <Slider label="Width" value={width} onChange={setWidth} min={240} max={800} step={40} suffix=" px" />
          <Slider label="Length" value={secs} onChange={setSecs} min={1} max={15} suffix=" s" />
          <Segmented value={colors} onChange={setColors} options={[{ value: '64', label: '64 colours' }, { value: '128', label: '128' }, { value: '256', label: '256' }]} />
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-2/40 p-3"><div className="text-xs text-muted">Frames</div><div className="font-display text-xl font-bold">{frames}</div></div>
        <div className="rounded-xl border border-border bg-surface-2/40 p-3"><div className="text-xs text-muted">Frame size</div><div className="font-display text-xl font-bold">{width} x {h}</div></div>
        <div className={cn('rounded-xl border p-3', bytes > 8e6 ? 'border-orange/40 bg-orange/5' : 'border-success/40 bg-success/5')}><div className="text-xs text-muted">Rough GIF size</div><div className="font-display text-xl font-bold">{formatBytes(bytes)}</div></div>
      </div>
    </DemoFrame>
  )
}

/* ---------------- signing: draw a signature that stays here ---------------- */
export function SignaturePadDemo() {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [has, setHas] = useState(false)
  const [url, setUrl] = useState('')
  const [ink, setInk] = useState<'#111827' | '#1d4ed8' | '#F5A524'>('#1d4ed8')
  const pos = (e: React.PointerEvent) => { const c = ref.current!; const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height] }
  const down = (e: React.PointerEvent) => { const ctx = ref.current!.getContext('2d')!; drawing.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = ink }
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const ctx = ref.current!.getContext('2d')!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); if (!has) setHas(true) }
  const up = () => { drawing.current = false }
  const clear = () => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setHas(false); if (url) URL.revokeObjectURL(url); setUrl('') }
  const save = () => ref.current!.toBlob((b) => { if (!b) return; if (url) URL.revokeObjectURL(url); setUrl(URL.createObjectURL(b)) }, 'image/png')
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return (
    <DemoFrame title="Draw a signature" note="The drawing is a transparent PNG made by your browser's canvas. It is never uploaded, and it disappears when you leave this page.">
      <div className="rounded-xl border border-dashed border-border bg-white">
        <canvas ref={ref} width={640} height={200} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} className="block h-40 w-full cursor-crosshair touch-none" aria-label="Signature pad, draw with a mouse, finger or pen" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Segmented value={ink} onChange={setInk} options={[{ value: '#1d4ed8', label: 'Blue ink' }, { value: '#111827', label: 'Black ink' }, { value: '#F5A524', label: 'Gold' }]} />
        <Button size="sm" variant="outline" icon={<Eraser className="size-4" />} onClick={clear}>Clear</Button>
        <Button size="sm" disabled={!has} icon={<Download className="size-4" />} onClick={save}>Make PNG</Button>
        {url && <a href={url} download="signature.png" className="text-sm text-accent hover:underline">Save signature.png</a>}
      </div>
    </DemoFrame>
  )
}

/* ---------------- ebooks: reflowable text versus a fixed page ---------------- */
const BOOK = 'It was a quiet morning in the reading room. The rain had stopped an hour before, and the windows still held a thin layer of water that bent the light from the street. She opened the book to the page she had marked the night before and started again from the top, because the last paragraph had not made sense when she was tired.'
export function ReflowDemo() {
  const [width, setWidth] = useState(70)
  const [font, setFont] = useState(16)
  return (
    <DemoFrame title="Reflowable text versus a fixed page" note="Drag the screen width down to phone size. The EPUB side rewraps the words, the PDF side can only shrink the whole page.">
      <Slider label="Screen width" value={width} onChange={setWidth} min={35} max={100} suffix="%" />
      <Slider label="Font size (EPUB only)" value={font} onChange={setFont} min={12} max={24} suffix=" px" className="mt-2" />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">EPUB, reflowable</div>
          <div className="rounded-xl border border-border bg-surface-2/40 p-3" style={{ width: `${width}%` }}><p style={{ fontSize: font, lineHeight: 1.5 }}>{BOOK}</p></div>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">PDF, fixed page</div>
          <div className="overflow-hidden rounded-xl border border-border bg-surface-2/40" style={{ width: `${width}%` }}>
            <div style={{ width: 340, transformOrigin: 'top left', transform: `scale(${width / 100})`, height: 210 * (width / 100) }}><p className="p-3" style={{ fontSize: 14, lineHeight: 1.5, width: 340 }}>{BOOK}</p></div>
          </div>
        </div>
      </div>
    </DemoFrame>
  )
}

/* ---------------- CAD: DXF is text, here is a tiny one ---------------- */
const DXF_SAMPLE = `0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nWALLS\n10\n0\n20\n0\n11\n120\n21\n0\n0\nLINE\n8\nWALLS\n10\n120\n20\n0\n11\n120\n21\n80\n0\nLINE\n8\nWALLS\n10\n120\n20\n80\n11\n0\n21\n80\n0\nLINE\n8\nWALLS\n10\n0\n20\n80\n11\n0\n21\n0\n0\nCIRCLE\n8\nFIXTURES\n10\n30\n20\n55\n40\n12\n0\nLINE\n8\nDIMENSIONS\n10\n0\n20\n-12\n11\n120\n21\n-12\n0\nENDSEC\n0\nEOF`
type Ent = { type: 'LINE' | 'CIRCLE'; layer: string; v: Record<string, number> }
function parseDxf(src: string): Ent[] {
  const l = src.split(/\r?\n/).map((s) => s.trim())
  const out: Ent[] = []; let cur: Ent | null = null
  for (let i = 0; i + 1 < l.length; i += 2) {
    const code = l[i], val = l[i + 1]
    if (code === '0') { if (cur) out.push(cur); cur = val === 'LINE' || val === 'CIRCLE' ? { type: val, layer: '0', v: {} } : null; continue }
    if (!cur) continue
    if (code === '8') cur.layer = val
    else if (!Number.isNaN(Number(val))) cur.v[code] = Number(val)
  }
  if (cur) out.push(cur)
  return out
}
const LAYER_COLOR: Record<string, string> = { WALLS: '#F5A524', FIXTURES: '#22D3EE', DIMENSIONS: '#10B981' }
export function DxfMiniDemo() {
  const [src, setSrc] = useState(DXF_SAMPLE)
  const ents = useMemo(() => parseDxf(src), [src])
  const layers = [...new Set(ents.map((e) => e.layer))]
  const [off, setOff] = useState<string[]>([])
  const shown = ents.filter((e) => !off.includes(e.layer))
  return (
    <DemoFrame title="A DXF file is just text" note="This is a real, minimal DXF entities section. Edit a number on the left (for example the 40 radius of the circle) and the drawing updates. Y points up in CAD, so the view flips it.">
      <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
        <textarea value={src} onChange={(e) => setSrc(e.target.value)} spellCheck={false} aria-label="DXF source" className={cn(field, 'h-64 w-full p-3 font-mono text-xs')} />
        <div>
          <svg viewBox="-20 -100 160 130" className="h-56 w-full rounded-xl border border-border bg-black" role="img" aria-label="Drawing from the DXF text">
            <g transform="scale(1,-1)" fill="none" strokeWidth="1.5">
              {shown.map((e, i) => e.type === 'LINE'
                ? <line key={i} x1={e.v['10'] ?? 0} y1={e.v['20'] ?? 0} x2={e.v['11'] ?? 0} y2={e.v['21'] ?? 0} stroke={LAYER_COLOR[e.layer] ?? '#e5e7eb'} strokeDasharray={e.layer === 'DIMENSIONS' ? '4 3' : undefined} />
                : <circle key={i} cx={e.v['10'] ?? 0} cy={e.v['20'] ?? 0} r={Math.max(0, e.v['40'] ?? 0)} stroke={LAYER_COLOR[e.layer] ?? '#e5e7eb'} />)}
            </g>
          </svg>
          <div className="mt-2 flex flex-wrap gap-1.5">{layers.map((ly) => { const on = !off.includes(ly); return <button key={ly} onClick={() => setOff(on ? [...off, ly] : off.filter((x) => x !== ly))} className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium cursor-pointer', on ? 'text-black' : 'border-border text-muted')} style={on ? { background: LAYER_COLOR[ly] ?? '#e5e7eb', borderColor: 'transparent' } : undefined}>{ly}</button> })}</div>
          <p className="mt-2 text-xs text-muted">{ents.length} entities on {layers.length} layers. Click a layer to hide it.</p>
        </div>
      </div>
    </DemoFrame>
  )
}

/* ---------------- DICOM: window and level on a synthetic CT slice ---------------- */
const PRESETS = [{ label: 'Soft tissue', c: 40, w: 400 }, { label: 'Lung', c: -600, w: 1500 }, { label: 'Bone', c: 400, w: 1800 }, { label: 'Brain', c: 40, w: 80 }]
function phantom(n: number) {
  // A made-up slice in Hounsfield units: air outside, fat ring, soft tissue, two lungs, a spine and a small lesion.
  const hu = new Float32Array(n * n)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x - n / 2) / (n / 2), v = (y - n / 2) / (n / 2)
    let h = -1000
    const body = (u * u) / 0.81 + (v * v) / 0.49
    if (body < 1) h = body > 0.82 ? -100 : 45
    const lung = (cx: number) => ((u - cx) ** 2) / 0.07 + ((v + 0.05) ** 2) / 0.16
    if (lung(-0.38) < 1 || lung(0.38) < 1) h = -850
    if ((u - 0.34) ** 2 + (v + 0.12) ** 2 < 0.004) h = 30
    if (u * u + (v - 0.48) ** 2 < 0.012) h = 700
    if ((u * u) / 0.02 + ((v + 0.05) ** 2) / 0.05 < 1) h = 40 + 15
    if (body < 1) h += ((x * 7 + y * 13) % 11) - 5
    hu[y * n + x] = h
  }
  return hu
}
export function WindowLevelDemo() {
  const N = 220
  const hu = useMemo(() => phantom(N), [])
  const ref = useRef<HTMLCanvasElement>(null)
  const [c, setC] = useState(40)
  const [w, setW] = useState(400)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d'); if (!ctx) return
    const img = ctx.createImageData(N, N), lo = c - w / 2
    for (let i = 0; i < hu.length; i++) { const g = Math.max(0, Math.min(255, ((hu[i] - lo) / w) * 255)); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g; img.data[i * 4 + 3] = 255 }
    ctx.putImageData(img, 0, 0)
  }, [c, w, hu])
  return (
    <DemoFrame title="Window and level on a CT style slice" note="A made-up slice built from typical Hounsfield values (air about -1000, lung about -850, fat about -100, soft tissue 40, bone 700). It is not a real scan.">
      <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
        <canvas ref={ref} width={N} height={N} className="mx-auto w-full max-w-[220px] rounded-xl border border-border bg-black [image-rendering:pixelated]" aria-label="Synthetic CT slice" />
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">{PRESETS.map((p) => <button key={p.label} onClick={() => { setC(p.c); setW(p.w) }} className={cn('rounded-lg border px-2.5 py-1 text-xs cursor-pointer', c === p.c && w === p.w ? 'border-accent text-accent' : 'border-border text-muted hover:text-fg')}>{p.label}</button>)}</div>
          <Slider label="Window level (centre)" value={c} onChange={setC} min={-1000} max={1000} step={10} suffix=" HU" />
          <Slider label="Window width" value={w} onChange={setW} min={20} max={2500} step={10} suffix=" HU" />
          <p className="text-xs text-muted">Values from {c - w / 2} to {c + w / 2} HU are spread across black to white. Anything below is black, anything above is white.</p>
        </div>
      </div>
    </DemoFrame>
  )
}

/* ---------------- MIDI: notes are just numbers ---------------- */
// Ode to Joy, first phrase: [midi note, start beat, length in beats]
const TUNE: [number, number, number][] = [[64, 0, 1], [64, 1, 1], [65, 2, 1], [67, 3, 1], [67, 4, 1], [65, 5, 1], [64, 6, 1], [62, 7, 1], [60, 8, 1], [60, 9, 1], [62, 10, 1], [64, 11, 1], [64, 12, 1.5], [62, 13.5, 0.5], [62, 14, 2]]
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const noteName = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12)
export function MidiNotesDemo() {
  const [bpm, setBpm] = useState(120)
  const [shift, setShift] = useState(0)
  const [wave, setWave] = useState<OscillatorType>('triangle')
  const [playing, setPlaying] = useState(false)
  const [beat, setBeat] = useState(-1)
  const ac = useRef<AudioContext | null>(null)
  const timer = useRef(0)
  const stop = () => { cancelAnimationFrame(timer.current); try { void ac.current?.close() } catch { /* closed */ } ac.current = null; setPlaying(false); setBeat(-1) }
  useEffect(() => stop, [])
  const play = () => {
    stop()
    const Ctx = window.AudioContext || (window as any).webkitAudioContext; if (!Ctx) return
    const a = new Ctx(); ac.current = a
    const spb = 60 / bpm, t0 = a.currentTime + 0.05
    for (const [m, s, d] of TUNE) {
      const o = a.createOscillator(), g = a.createGain(), st = t0 + s * spb, en = st + d * spb * 0.95
      o.type = wave; o.frequency.value = hz(m + shift)
      g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(0.18, st + 0.01); g.gain.exponentialRampToValueAtTime(0.001, en)
      o.connect(g).connect(a.destination); o.start(st); o.stop(en + 0.02)
    }
    setPlaying(true)
    const total = 16
    const tick = () => { if (!ac.current) return; const b = (a.currentTime - t0) / spb; if (b > total) { stop(); return } setBeat(b); timer.current = requestAnimationFrame(tick) }
    timer.current = requestAnimationFrame(tick)
  }
  const lo = 60 + Math.min(0, shift), hi = 67 + Math.max(0, shift)
  return (
    <DemoFrame title="A melody stored as numbers" note="Each bar in the piano roll is one note event: a note number, a start time and a length. The sound is made by your browser's Web Audio API.">
      <div className="relative h-40 overflow-hidden rounded-xl border border-border bg-black">
        {TUNE.map(([m, s, d], i) => { const n = m + shift; const y = 100 - ((n - lo) / Math.max(1, hi - lo)) * 88; const on = beat >= s && beat < s + d; return <div key={i} className="absolute h-[9%] rounded-sm transition-colors" style={{ background: on ? '#F5A524' : 'rgba(20,184,166,.7)', left: `${(s / 16) * 100}%`, width: `${(d / 16) * 100 - 0.6}%`, top: `${y - 6}%` }} title={noteName(n)} /> })}
        {beat >= 0 && <div className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${(beat / 16) * 100}%` }} />}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {playing ? <Button icon={<Square className="size-4" />} onClick={stop}>Stop</Button> : <Button icon={<Play className="size-4" />} onClick={play}>Play</Button>}
        <Segmented value={wave} onChange={setWave} options={[{ value: 'triangle', label: 'Soft' }, { value: 'square', label: 'Chiptune' }, { value: 'sawtooth', label: 'Bright' }]} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Slider label="Tempo" value={bpm} onChange={setBpm} min={60} max={200} suffix=" BPM" />
        <Slider label="Transpose" value={shift} onChange={setShift} min={-12} max={12} suffix=" semitones" />
      </div>
      <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-surface-2/40 p-2 font-mono text-[11px] text-muted">
        {TUNE.slice(0, 6).map(([m, s, d], i) => <div key={i} className="whitespace-nowrap">note {m + shift} ({noteName(m + shift)}) at beat {s}, length {d}, velocity 90</div>)}
        <div>and {TUNE.length - 6} more</div>
      </div>
    </DemoFrame>
  )
}

/* ---------------- data: CSV to JSON and back ---------------- */
function parseCsv(src: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (q) { if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += ch; continue }
    if (ch === '"') q = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c !== ''))
}
const typed = (s: string): unknown => s === '' ? null : s === 'true' ? true : s === 'false' ? false : /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s
function unflatten(obj: Record<string, unknown>) {
  const out: any = {}
  for (const [k, v] of Object.entries(obj)) { const parts = k.split('.'); let o = out; parts.forEach((p, i) => { if (i === parts.length - 1) o[p] = v; else o = o[p] ??= {} }) }
  return out
}
export function CsvJsonDemo() {
  const [csv, setCsv] = useState('id,name,city,address.zip,active\n1,Asha,Kolkata,700001,true\n2,"Rahman, M.",Digha,721428,false\n3,Lee,"Mumbai",400001,true')
  const [nest, setNest] = useState(true)
  const out = useMemo(() => {
    const rows = parseCsv(csv)
    if (rows.length < 1) return { json: '[]', n: 0, cols: 0 }
    const [head, ...body] = rows
    const objs = body.map((r) => { const flat = Object.fromEntries(head.map((h, i) => [h, typed(r[i] ?? '')])); return nest ? unflatten(flat) : flat })
    return { json: JSON.stringify(objs, null, 2), n: objs.length, cols: head.length }
  }, [csv, nest])
  return (
    <DemoFrame title="CSV to JSON, live" note="Quoted cells with commas stay in one column. Numbers and true or false become real JSON types. Dotted headers like address.zip can become nested objects.">
      <div className="grid gap-3 md:grid-cols-2">
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} spellCheck={false} aria-label="CSV input" className={cn(field, 'min-h-48 w-full p-3 font-mono text-xs')} />
        <pre className="max-h-72 min-h-48 overflow-auto rounded-xl border border-border bg-bg p-3 font-mono text-xs">{out.json}</pre>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <Segmented value={nest ? 'nest' : 'flat'} onChange={(v) => setNest(v === 'nest')} options={[{ value: 'nest', label: 'Nest dotted columns' }, { value: 'flat', label: 'Keep flat' }]} />
        <span className="text-xs text-muted">{out.n} rows, {out.cols} columns</span>
      </div>
    </DemoFrame>
  )
}

/* ---------------- subtitles: SRT to VTT with a time shift ---------------- */
const SRT_SAMPLE = `1\n00:00:01,000 --> 00:00:03,200\nHello, and welcome back.\n\n2\n00:00:03,600 --> 00:00:06,000\nToday we fix subtitles\nthat drift out of sync.\n\n3\n00:00:06,400 --> 00:00:08,900\n<i>Let's start.</i>`
const toMs = (t: string) => { const m = t.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/); return m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4].padEnd(3, '0').slice(0, 3) : 0 }
const fmt = (ms: number, sep: string) => { ms = Math.max(0, Math.round(ms)); const p = (n: number, l = 2) => String(n).padStart(l, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}${sep}${p(ms % 1000, 3)}` }
export function SubtitleDemo() {
  const [srt, setSrt] = useState(SRT_SAMPLE)
  const [shift, setShift] = useState(0)
  const [to, setTo] = useState<'vtt' | 'srt'>('vtt')
  const cues = useMemo(() => srt.replace(/\r/g, '').split(/\n\s*\n/).map((b) => { const l = b.trim().split('\n'); const ti = l.findIndex((x) => x.includes('-->')); if (ti < 0) return null; const [a, z] = l[ti].split('-->'); return { start: toMs(a), end: toMs(z), text: l.slice(ti + 1).join('\n') } }).filter(Boolean) as { start: number; end: number; text: string }[], [srt])
  const out = to === 'vtt'
    ? 'WEBVTT\n\n' + cues.map((c) => `${fmt(c.start + shift, '.')} --> ${fmt(c.end + shift, '.')}\n${c.text}`).join('\n\n')
    : cues.map((c, i) => `${i + 1}\n${fmt(c.start + shift, ',')} --> ${fmt(c.end + shift, ',')}\n${c.text}`).join('\n\n')
  return (
    <DemoFrame title="SRT in, VTT out, with a shift" note="Paste your own SRT on the left. A positive shift makes every line appear later, a negative one earlier.">
      <div className="grid gap-3 md:grid-cols-2">
        <textarea value={srt} onChange={(e) => setSrt(e.target.value)} spellCheck={false} aria-label="SRT input" className={cn(field, 'min-h-56 w-full p-3 font-mono text-xs')} />
        <pre className="max-h-72 min-h-56 overflow-auto rounded-xl border border-border bg-bg p-3 font-mono text-xs">{out}</pre>
      </div>
      <div className="mt-3 grid items-end gap-3 sm:grid-cols-[1fr_auto]">
        <Slider label="Shift every line" value={shift} onChange={setShift} min={-3000} max={3000} step={100} suffix=" ms" />
        <Segmented value={to} onChange={setTo} options={[{ value: 'vtt', label: 'To VTT' }, { value: 'srt', label: 'Back to SRT' }]} />
      </div>
      <p className="mt-2 text-xs text-muted">{cues.length} cues read.</p>
    </DemoFrame>
  )
}
