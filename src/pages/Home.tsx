import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, ArrowRight, ShieldCheck, Zap, Cpu, Workflow, Sparkles, GraduationCap, Users, Palette, Store, Check, X, Upload, Download, Lock, Infinity as Inf, Play, Star, ChevronDown } from 'lucide-react'
import { CATEGORIES, TOOLS, toolBySlug, type Category } from '@/tools/registry'
import { ToolCard } from '@/components/ToolCard'
import { getIcon } from '@/components/icons'
import { searchTools } from '@/components/CommandPalette'
import { Button, cn } from '@/components/ui'
import { formatBytes, canvasToBlob, loadImage, downloadBlob, renameExt } from '@/lib/files'
import { setHandoff, suggestFor } from '@/lib/handoff'
import { useFavorites, useRecent } from '@/lib/store'
import { REPO_URL } from '@/components/Layout'
import { Github } from '@/components/Logo'

const base = import.meta.env.BASE_URL

export default function Home() {
  useEffect(() => { document.title = 'OpenFile — Every file tool, private, in your browser' }, [])
  return (
    <div>
      <Hero />
      <SmartDrop />
      <Personal />
      <PopularTools />
      <LaunchVideo />
      <AllTools />
      <WorkspacePromo />
      <Why />
      <Compare />
      <Workflows />
      <Faq />
      <Cta />
    </div>
  )
}

function Hero() {
  const [q, setQ] = useState('')
  const nav = useNavigate()
  const results = useMemo(() => (q ? searchTools(q).slice(0, 6) : []), [q])
  const floating = ['FileText', 'Image', 'Film', 'Music', 'Braces', 'QrCode', 'Lock', 'PenTool']
  return (
    <section className="relative overflow-hidden">
      <div className="grid-bg pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full opacity-40 blur-3xl" style={{ background: 'radial-gradient(closest-side, var(--accent), transparent), radial-gradient(closest-side, var(--accent-2), transparent)' }} />
      {floating.map((n, i) => { const I = getIcon(n === 'Image' ? 'ImageIcon' : n); return (
        <div key={n} className="animate-float pointer-events-none absolute hidden rounded-2xl border border-border bg-surface/80 p-3 text-accent shadow-xl lg:block"
          style={{ left: `${i % 2 ? 84 + (i % 3) * 3 : 4 + (i % 3) * 3}%`, top: `${14 + i * 9}%`, animationDelay: `${i * 0.7}s`, opacity: 0.85 }}><I className="size-5" /></div>) })}
      <div className="relative mx-auto max-w-5xl px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-28">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs text-muted backdrop-blur">
          <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" /><span className="relative inline-flex size-2 rounded-full bg-success" /></span>
          {TOOLS.length} tools · open source · zero uploads
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mt-6 font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl">
          Every file tool.<br /><span className="text-gradient">One private browser tab.</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mx-auto mt-6 max-w-2xl text-lg text-muted">
          Merge, split, sign and compress PDFs. Remove backgrounds, upscale photos, trim videos, transcribe audio and format code — all on your device, free forever.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="relative mx-auto mt-9 max-w-xl">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 shadow-2xl shadow-accent/10 focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
            <Search className="size-5 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) nav('/' + results[0].slug) }} placeholder="What do you need to do? Try “compress”, “sign”, “gif”…" className="h-14 flex-1 bg-transparent outline-none placeholder:text-muted" />
          </div>
          {results.length > 0 && (
            <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-2xl">
              {results.map((t) => { const I = getIcon(t.icon); return (
                <Link key={t.slug} to={'/' + t.slug} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"><I className="size-4 text-accent" /><span className="font-medium">{t.name}</span><span className="truncate text-xs text-muted">{t.desc}</span></Link>) })}
            </div>
          )}
        </motion.div>
        <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs">
          {['merge-pdf', 'compress-pdf', 'background-remover', 'video-to-gif', 'sign-pdf', 'qr-generator'].map((s) => { const t = toolBySlug(s)!; return <Link key={s} to={'/' + s} className="rounded-full border border-border bg-surface/70 px-3 py-1.5 text-muted hover:border-accent hover:text-fg">{t.name}</Link> })}
        </div>
        <div className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
          {[[TOOLS.length + '+', 'Tools'], ['0 bytes', 'Uploaded'], ['8', 'Categories'], ['100%', 'Free & open']].map(([a, b]) => (
            <div key={b} className="rounded-2xl border border-border bg-surface/60 p-4 backdrop-blur"><div className="font-display text-2xl font-bold">{a}</div><div className="text-xs text-muted">{b}</div></div>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Drop any file → instant suggestions + a real in-browser conversion demo for images */
function SmartDrop() {
  const [file, setFile] = useState<File | null>(null)
  const [over, setOver] = useState(false)
  const [demo, setDemo] = useState<{ blob: Blob; ms: number; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()
  const pick = async (f: File) => {
    setFile(f); setDemo(null)
    if (f.type.startsWith('image/') && f.type !== 'image/svg+xml') {
      setBusy(true)
      try {
        const t0 = performance.now(); const img = await loadImage(f)
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d')!.drawImage(img, 0, 0)
        const blob = await canvasToBlob(c, 'image/webp', 0.8)
        setDemo({ blob, ms: Math.round(performance.now() - t0), url: URL.createObjectURL(blob) })
      } catch {} finally { setBusy(false) }
    }
  }
  const sugg = file ? suggestFor(file).map(toolBySlug).filter(Boolean) : []
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-surface p-6 sm:p-10">
        <div className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative grid items-center gap-8 lg:grid-cols-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-accent">Smart drop · live sandbox</div>
            <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Drop any file. We’ll know what to do.</h2>
            <p className="mt-3 text-muted">OpenFile detects the file type and suggests the right tools. Drop an image and watch it convert to WebP right here — nothing leaves your machine.</p>
            <ul className="mt-5 space-y-2 text-sm">
              {['PDFs, images, video, audio, Office docs, data files', 'Opens the tool with your file already loaded', 'Works offline once loaded'].map((x) => <li key={x} className="flex items-center gap-2"><Check className="size-4 text-success" />{x}</li>)}
            </ul>
          </div>
          <div>
            <label onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) pick(f) }}
              className={cn('flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition', over ? 'border-accent bg-accent/10' : 'border-border bg-surface-2/40 hover:border-accent/60')}>
              <input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = '' }} />
              {!file ? (<><div className="grid size-14 place-items-center rounded-2xl bg-gradient-brand text-white shadow-lg"><Upload className="size-6" /></div><div className="font-semibold">Drop a file or click to choose</div><div className="text-xs text-muted">Try a photo for the live WebP demo</div></>) : (
                <div className="w-full text-left" onClick={(e) => e.preventDefault()}>
                  <div className="flex items-center justify-between gap-2"><div className="truncate font-medium">{file.name}</div><span className="shrink-0 text-xs text-muted">{formatBytes(file.size)}</span></div>
                  {busy && <div className="shimmer mt-3 h-2 rounded-full" />}
                  {demo && (
                    <div className="mt-3 flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 p-3">
                      <img src={demo.url} className="size-14 rounded-lg object-cover" alt="" />
                      <div className="min-w-0 flex-1 text-sm"><div className="font-medium">Converted to WebP in {demo.ms} ms</div><div className="text-muted">{formatBytes(file.size)} → <span className="text-success font-medium">{formatBytes(demo.blob.size)}</span></div></div>
                      <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => downloadBlob(demo.blob, renameExt(file.name, 'webp'))}>Save</Button>
                    </div>
                  )}
                  <div className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">Open with</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {sugg.map((t) => { const I = getIcon(t!.icon); return <button key={t!.slug} onClick={() => { setHandoff([file]); nav('/' + t!.slug) }} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs hover:border-accent hover:text-accent cursor-pointer"><I className="size-3.5" />{t!.name}</button> })}
                  </div>
                  <button onClick={() => { setFile(null); setDemo(null) }} className="mt-4 text-xs text-muted underline cursor-pointer">Choose another file</button>
                </div>
              )}
            </label>
          </div>
        </div>
      </div>
    </section>
  )
}

function Personal() {
  const { fav } = useFavorites(); const { recent } = useRecent()
  const f = fav.map(toolBySlug).filter(Boolean); const r = recent.map(toolBySlug).filter(Boolean)
  if (!f.length && !r.length) return null
  return (
    <section className="mx-auto mt-16 max-w-7xl px-4 sm:px-6">
      {f.length > 0 && <><h3 className="mb-3 flex items-center gap-2 font-semibold"><Star className="size-4 text-warn" /> Your favorites</h3><div className="mb-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{f.map((t) => <ToolCard key={t!.slug} tool={t!} compact />)}</div></>}
      {r.length > 0 && <><h3 className="mb-3 flex items-center justify-between font-semibold text-muted"><span>Recently used</span><Link to="/history" className="text-sm font-normal text-accent hover:underline">View history →</Link></h3><div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{r.slice(0, 6).map((t) => <ToolCard key={t!.slug} tool={t!} compact />)}</div></>}
    </section>
  )
}

function SectionHead({ kicker, title, sub }: { kicker: string; title: React.ReactNode; sub?: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <div className="text-xs font-bold uppercase tracking-widest text-accent">{kicker}</div>
      <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-muted">{sub}</p>}
    </div>
  )
}

function PopularTools() {
  const [cat, setCat] = useState<Category | 'all'>('all')
  const list = TOOLS.filter((t) => t.popular && (cat === 'all' || t.category === cat))
  return (
    <section className="mx-auto mt-24 max-w-7xl px-4 sm:px-6">
      <SectionHead kicker="The essentials" title="Most used tools" sub="The fastest path from a raw file to a finished one." />
      <div className="mb-8 flex flex-wrap justify-center gap-2">
        {[{ id: 'all' as const, name: 'All' }, ...CATEGORIES].map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)} className={cn('rounded-full px-4 py-1.5 text-sm transition cursor-pointer', cat === c.id ? 'bg-fg text-bg' : 'border border-border text-muted hover:text-fg')}>{c.name}</button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{list.map((t) => <ToolCard key={t.slug} tool={t} />)}</div>
      {list.length === 0 && <p className="text-center text-muted">See all tools in this category below.</p>}
    </section>
  )
}

function LaunchVideo() {
  const [play, setPlay] = useState(false)
  return (
    <section className="mx-auto mt-28 max-w-6xl px-4 sm:px-6">
      <SectionHead kicker="Launch film" title={<>See OpenFile in <span className="text-gradient">60 seconds</span></>} sub="A quick tour of the tools, the workspace and the privacy-first engine." />
      <div className="relative overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl shadow-accent/10">
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-3"><span className="size-3 rounded-full bg-[#ff5f57]" /><span className="size-3 rounded-full bg-[#febc2e]" /><span className="size-3 rounded-full bg-[#28c840]" /><span className="ml-3 font-mono text-xs text-muted">openfile · launch.mp4</span></div>
        {play ? (
          <video src={`${base}media/launch.mp4`} poster={`${base}media/poster.jpg`} controls autoPlay playsInline className="aspect-video w-full bg-black" />
        ) : (
          <button onClick={() => setPlay(true)} className="group relative block aspect-video w-full cursor-pointer">
            <img src={`${base}media/poster.jpg`} alt="OpenFile launch video" className="absolute inset-0 size-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <div className="absolute inset-0 grid place-items-center"><div className="grid size-20 place-items-center rounded-full bg-white/95 text-black shadow-2xl transition group-hover:scale-110"><Play className="ml-1 size-8 fill-current" /></div></div>
            <div className="absolute bottom-5 left-6 text-left text-white"><div className="font-display text-2xl font-bold">Introducing OpenFile</div><div className="text-sm text-white/80">Every file tool, in your browser.</div></div>
          </button>
        )}
      </div>
    </section>
  )
}

function AllTools() {
  return (
    <section id="tools" className="mx-auto mt-28 max-w-7xl px-4 sm:px-6">
      <SectionHead kicker="Full catalog" title={`All ${TOOLS.length} utilities`} sub="Dense, practical stations for documents, images, media and code." />
      <div className="space-y-14">
        {CATEGORIES.map((c) => {
          const list = TOOLS.filter((t) => t.category === c.id)
          return (
            <div key={c.id}>
              <div className="mb-4 flex items-end justify-between gap-4">
                <div><h3 className="flex items-center gap-2.5 font-display text-xl font-semibold"><span className="size-2.5 rounded-full" style={{ background: c.color }} />{c.name}<span className="text-sm font-normal text-muted">{list.length}</span></h3><p className="text-sm text-muted">{c.blurb}</p></div>
                <Link to={`/category/${c.id}`} className="shrink-0 text-sm text-accent hover:underline">View all →</Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{list.slice(0, 8).map((t) => <ToolCard key={t.slug} tool={t} />)}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function WorkspacePromo() {
  const steps = ['Resize 1600px', 'Watermark', 'Strip EXIF', 'Convert WebP', 'ZIP']
  const [i, setI] = useState(0)
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % (steps.length + 1)), 900); return () => clearInterval(t) }, [])
  return (
    <section className="mx-auto mt-28 max-w-6xl px-4 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-accent/15 via-surface to-accent-2/10 p-8 sm:p-12">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-accent"><Workflow className="size-3.5" /> OPENFILE WORKSPACE</div>
            <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Chain tools into one automated pipeline.</h2>
            <p className="mt-3 text-muted">Batch-process hundreds of images or PDFs with a reusable recipe. Save recipes, re-run them, and download everything as a ZIP.</p>
            <Link to="/workspace"><Button size="lg" className="mt-6" icon={<ArrowRight className="size-4" />}>Open Workspace</Button></Link>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between text-xs text-muted"><span className="font-mono">pipeline: product-photos</span><span>248 files</span></div>
            <div className="space-y-2">
              {steps.map((s, k) => (
                <div key={s} className={cn('flex items-center gap-3 rounded-xl border px-4 py-3 transition-all', k < i ? 'border-success/30 bg-success/5' : k === i ? 'border-accent bg-accent/10 scale-[1.02]' : 'border-border')}>
                  <div className={cn('grid size-6 place-items-center rounded-full text-[11px] font-bold', k < i ? 'bg-success text-white' : k === i ? 'bg-accent text-white' : 'bg-surface-2 text-muted')}>{k < i ? <Check className="size-3.5" /> : k + 1}</div>
                  <span className="text-sm font-medium">{s}</span>
                  {k === i && <div className="shimmer ml-auto h-1.5 w-20 rounded-full" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Why() {
  const items = [
    { i: ShieldCheck, t: 'Private by design', d: 'Files are processed with WebAssembly and Canvas inside your tab. Nothing is uploaded to a server.' },
    { i: Zap, t: 'Instant', d: 'No upload queues or download waits. Most jobs finish in milliseconds on your own CPU/GPU.' },
    { i: Cpu, t: 'On-device AI', d: 'Background removal, OCR, upscaling and Whisper transcription run locally with WASM/WebGPU.' },
    { i: Inf, t: 'No limits', d: 'No file caps, no daily quotas, no watermarks, no account. Ever.' },
    { i: Workflow, t: 'Batch pipelines', d: 'Chain steps into recipes and process hundreds of files in one go.' },
    { i: Github, t: 'Open source', d: 'MIT licensed. Audit the code, self-host it, or contribute a tool.' },
  ]
  return (
    <section className="mx-auto mt-28 max-w-7xl px-4 sm:px-6">
      <SectionHead kicker="Guarantees" title="Why OpenFile?" sub="Built for people who want dependable, high-throughput file work without a bloated editor." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ i: I, t, d }) => (
          <div key={t} className="rounded-2xl border border-border bg-surface p-6 transition hover:border-accent/40">
            <div className="grid size-11 place-items-center rounded-xl bg-gradient-brand text-white shadow-lg shadow-accent/20"><I className="size-5" /></div>
            <div className="mt-4 font-semibold">{t}</div><p className="mt-1.5 text-sm leading-relaxed text-muted">{d}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Compare() {
  const rows: [string, boolean, boolean][] = [['Files stay on your device', true, false], ['No sign-up or email', true, false], ['Unlimited file size & count', true, false], ['No watermarks', true, false], ['Works offline after load', true, false], ['On-device AI tools', true, false], ['Batch pipelines', true, false], ['Open source', true, false]]
  return (
    <section className="mx-auto mt-28 max-w-4xl px-4 sm:px-6">
      <SectionHead kicker="Compare" title="OpenFile vs. typical upload-based tools" />
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="grid grid-cols-[1fr_120px_120px] border-b border-border bg-surface-2/60 px-5 py-3 text-xs font-bold uppercase tracking-wide text-muted"><span>Feature</span><span className="text-center text-accent">OpenFile</span><span className="text-center">Others</span></div>
        {rows.map(([f, a, b]) => (
          <div key={f} className="grid grid-cols-[1fr_120px_120px] border-b border-border px-5 py-3 text-sm last:border-0"><span>{f}</span><span className="flex justify-center">{a ? <Check className="size-5 text-success" /> : <X className="size-5 text-danger" />}</span><span className="flex justify-center">{b ? <Check className="size-5 text-success" /> : <X className="size-5 text-muted" />}</span></div>
        ))}
      </div>
    </section>
  )
}

function Workflows() {
  const w = [
    { i: GraduationCap, t: 'Students', d: 'Scan notes to PDF, merge assignments, compress for portals and OCR handouts.', tools: ['image-to-pdf', 'merge-pdf', 'compress-pdf', 'ocr-pdf'] },
    { i: Users, t: 'Teams', d: 'Sign contracts, redact sensitive data, watermark drafts and compare versions.', tools: ['sign-pdf', 'redact-pdf', 'pdf-watermark', 'compare-pdf'] },
    { i: Palette, t: 'Creators', d: 'Remove backgrounds, upscale, make GIFs and polish screenshots for socials.', tools: ['background-remover', 'image-upscaler', 'video-to-gif', 'screenshot-studio'] },
    { i: Store, t: 'Storefronts', d: 'Batch-resize product photos, strip EXIF, convert to WebP and create invoices.', tools: ['image-resizer', 'image-converter', 'invoice-generator', 'barcode-generator'] },
  ]
  return (
    <section className="mx-auto mt-28 max-w-7xl px-4 sm:px-6">
      <SectionHead kicker="Scenarios" title="Workflows people actually use" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {w.map(({ i: I, t, d, tools }) => (
          <div key={t} className="rounded-2xl border border-border bg-surface p-6">
            <I className="size-6 text-accent" /><div className="mt-3 font-semibold">For {t}</div><p className="mt-1.5 text-sm text-muted">{d}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">{tools.map((s) => <Link key={s} to={'/' + s} className="rounded-md bg-surface-2 px-2 py-1 text-xs hover:text-accent">{toolBySlug(s)?.name}</Link>)}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Faq() {
  const qs = [
    ['Are my files uploaded anywhere?', 'No. Every tool processes files inside your browser using JavaScript, WebAssembly and Canvas. You can even disconnect from the internet after the page loads.'],
    ['Is OpenFile really free?', 'Yes — free and open source under the MIT license. No premium tier, no watermarks, no limits.'],
    ['Why do some tools take longer the first time?', 'Heavy engines like ffmpeg (video), Tesseract (OCR) and AI models are downloaded once on first use, then cached by your browser.'],
    ['Which browsers are supported?', 'Latest Chrome, Edge, Firefox and Safari. AI tools run fastest on Chromium browsers with WebGPU.'],
    ['Can I self-host it?', 'Yes. It is a static site: deploy to Vercel, Netlify, GitHub Pages or any static host. See the README on GitHub.'],
    ['Can I install it like an app?', 'Yes. OpenFile is a Progressive Web App — use your browser’s “Install” option to add it to your desktop or phone.'],
  ]
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section className="mx-auto mt-28 max-w-3xl px-4 sm:px-6">
      <SectionHead kicker="FAQ" title="Questions, answered" />
      <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
        {qs.map(([q, a], i) => (
          <div key={q}>
            <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium cursor-pointer">{q}<ChevronDown className={cn('size-4 shrink-0 transition', open === i && 'rotate-180')} /></button>
            {open === i && <p className="px-5 pb-5 text-sm leading-relaxed text-muted">{a}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}

function Cta() {
  return (
    <section className="mx-auto mt-28 max-w-5xl px-4 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-brand p-10 text-center text-white sm:p-16">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-20" />
        <Sparkles className="mx-auto size-8" />
        <h2 className="mt-4 font-display text-3xl font-bold sm:text-5xl">Your files. Your device. Done.</h2>
        <p className="mx-auto mt-3 max-w-xl text-white/85">Bookmark OpenFile, install it as an app, or star the repo to follow new tools.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href="#tools"><button className="h-12 rounded-xl bg-white px-6 font-semibold text-black shadow-xl cursor-pointer">Explore all tools</button></a>
          <a href={REPO_URL} target="_blank" rel="noreferrer"><button className="flex h-12 items-center gap-2 rounded-xl border border-white/40 px-6 font-semibold cursor-pointer"><Github className="size-4" /> Star on GitHub</button></a>
        </div>
        <div className="mt-6 flex justify-center gap-4 text-xs text-white/80"><span className="flex items-center gap-1"><Lock className="size-3" /> No uploads</span><span>·</span><span>MIT licensed</span></div>
      </div>
    </section>
  )
}
