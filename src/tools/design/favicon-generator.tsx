import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Image as ImageIcon, Type, FileCode2, X, Wifi, Battery, Signal, Lock, RotateCw } from 'lucide-react'
import { Button, Card, Dropzone, Input, Label, Segmented, Select, Slider, Switch, Tabs, Textarea, CopyButton, Badge, useJob, Progress, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob, loadImage, canvasToBlob, zipFiles, formatBytes } from '@/lib/files'
import { ColorField } from './_design/ColorPicker'
import { encodeIco } from './_design/ico'

type Source = 'image' | 'text' | 'svg'
const FONTS = [
  { value: 'Inter, system-ui, sans-serif', label: 'Inter (sans)' }, { value: '"Space Grotesk", sans-serif', label: 'Space Grotesk' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Serif' }, { value: '"JetBrains Mono", monospace', label: 'Monospace' },
  { value: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif', label: 'Emoji' }, { value: 'Impact, "Arial Black", sans-serif', label: 'Impact' },
]
type Opts = { source: Source; text: string; font: string; weight: number; textColor: string; bg: string; transparentBg: boolean; radius: number; padding: number; scale: number; dy: number }
const OUT = [
  { name: 'favicon-16x16.png', size: 16 }, { name: 'favicon-32x32.png', size: 32 }, { name: 'favicon-48x48.png', size: 48 }, { name: 'favicon-64x64.png', size: 64 },
  { name: 'favicon-96x96.png', size: 96 }, { name: 'favicon-128x128.png', size: 128 }, { name: 'favicon-256x256.png', size: 256 }, { name: 'icon-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180, opaque: true }, { name: 'android-chrome-192x192.png', size: 192 }, { name: 'android-chrome-512x512.png', size: 512 },
  { name: 'mstile-150x150.png', size: 150 },
] as { name: string; size: number; opaque?: boolean }[]

/** Draw the icon at `size` px into a fresh canvas */
function render(size: number, o: Opts, img: HTMLImageElement | null, opaque = false) {
  const c = document.createElement('canvas'); c.width = c.height = size
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  const r = (o.radius / 100) * (size / 2)
  const fillBg = !o.transparentBg || opaque
  if (fillBg) {
    ctx.save(); ctx.beginPath(); opaque ? ctx.rect(0, 0, size, size) : ctx.roundRect(0, 0, size, size, r); ctx.fillStyle = o.bg; ctx.fill(); ctx.restore()
  }
  ctx.save()
  if (!opaque && o.radius > 0) { ctx.beginPath(); ctx.roundRect(0, 0, size, size, r); ctx.clip() }
  const pad = (o.padding / 100) * size, inner = size - pad * 2
  if (o.source === 'text') {
    const t = o.text || 'A'
    let fs = inner * o.scale
    ctx.font = `${o.weight} ${fs}px ${o.font}`
    const m = ctx.measureText(t); const w = m.width
    if (w > inner) { fs *= inner / w; ctx.font = `${o.weight} ${fs}px ${o.font}` }
    ctx.fillStyle = o.textColor; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
    const mm = ctx.measureText(t)
    const asc = mm.actualBoundingBoxAscent || fs * 0.72, desc = mm.actualBoundingBoxDescent || 0
    ctx.fillText(t, size / 2, size / 2 + (asc - desc) / 2 + (o.dy / 100) * size)
  } else if (img) {
    const iw = img.naturalWidth || 512, ih = img.naturalHeight || 512
    const s = Math.min(inner / iw, inner / ih) * o.scale
    const dw = iw * s, dh = ih * s
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2 + (o.dy / 100) * size, dw, dh)
  }
  ctx.restore()
  return c
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export default function FaviconGenerator() {
  const [o, setO] = useState<Opts>({ source: 'text', text: 'OF', font: FONTS[1].value, weight: 700, textColor: '#ffffff', bg: '#f5a524', transparentBg: false, radius: 22, padding: 10, scale: 0.9, dy: 0 })
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [svgText, setSvgText] = useState('')
  const [fileName, setFileName] = useState('')
  const [app, setApp] = useState({ name: 'My Website', short: 'Website', theme: '#f5a524', bgColor: '#ffffff', path: '/' })
  const [codeTab, setCodeTab] = useState<'html' | 'next' | 'react' | 'manifest' | 'browserconfig'>('html')
  const [mock, setMock] = useState<'tab' | 'ios' | 'android'>('tab')
  const [previews, setPreviews] = useState<Record<number, string>>({})
  const job = useJob()
  const upd = (p: Partial<Opts>) => setO((x) => ({ ...x, ...p }))

  const loadFile = async (f: File) => {
    try {
      setFileName(f.name)
      if (f.type === 'image/svg+xml' || f.name.toLowerCase().endsWith('.svg')) { const t = await f.text(); setSvgText(t); await applySvg(t) }
      else { const im = await loadImage(f); setImg(im); upd({ source: 'image', transparentBg: true, padding: 0, scale: 1, radius: 0 }) }
    } catch { toast('Could not load that file', 'error') }
  }
  const applySvg = async (t: string) => {
    let s = t
    if (!/xmlns=/.test(s)) s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    // give the svg an intrinsic size if it only has a viewBox
    if (!/<svg[^>]*\swidth=/.test(s)) s = s.replace('<svg', '<svg width="512" height="512"')
    const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s)
    try { await im.decode(); setImg(im); upd({ source: 'svg', transparentBg: true, padding: 0, scale: 1, radius: 0 }) } catch { toast('That SVG could not be rendered', 'error') }
  }
  // paste image
  useEffect(() => { const h = (e: ClipboardEvent) => { const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith('image/')); if (f) loadFile(f) }; window.addEventListener('paste', h); return () => window.removeEventListener('paste', h) }, [])

  // live previews
  useEffect(() => {
    const t = setTimeout(() => {
      if (o.source !== 'text' && !img) { setPreviews({}); return }
      const p: Record<number, string> = {}
      for (const s of [16, 32, 48, 180, 192, 512]) p[s] = render(s, o, img, s === 180).toDataURL()
      p[-1] = render(256, o, img).toDataURL()
      setPreviews(p)
    }, 60)
    return () => clearTimeout(t)
  }, [o, img])
  useEffect(() => { document.fonts?.ready.then(() => setO((x) => ({ ...x }))) }, [])

  const base = app.path.endsWith('/') ? app.path : app.path + '/'
  const manifest = JSON.stringify({ name: app.name, short_name: app.short, icons: [{ src: `${base}android-chrome-192x192.png`, sizes: '192x192', type: 'image/png' }, { src: `${base}android-chrome-512x512.png`, sizes: '512x512', type: 'image/png' }, { src: `${base}android-chrome-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }], theme_color: app.theme, background_color: app.bgColor, display: 'standalone', start_url: '/' }, null, 2)
  const browserconfig = `<?xml version="1.0" encoding="utf-8"?>\n<browserconfig>\n  <msapplication>\n    <tile>\n      <square150x150logo src="${base}mstile-150x150.png"/>\n      <TileColor>${app.theme}</TileColor>\n    </tile>\n  </msapplication>\n</browserconfig>`
  const hasSvg = o.source !== 'image'
  const html = [
    `<link rel="icon" href="${base}favicon.ico" sizes="48x48">`,
    hasSvg ? `<link rel="icon" href="${base}favicon.svg" type="image/svg+xml">` : '',
    `<link rel="icon" type="image/png" sizes="32x32" href="${base}favicon-32x32.png">`,
    `<link rel="icon" type="image/png" sizes="16x16" href="${base}favicon-16x16.png">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="${base}apple-touch-icon.png">`,
    `<link rel="manifest" href="${base}site.webmanifest">`,
    `<link rel="mask-icon" href="${base}safari-pinned-tab.svg" color="${app.theme}">`,
    `<meta name="msapplication-TileColor" content="${app.theme}">`,
    `<meta name="msapplication-config" content="${base}browserconfig.xml">`,
    `<meta name="theme-color" content="${app.theme}">`,
  ].filter(Boolean).join('\n')
  const next = `// Next.js App Router, copy favicon.ico, icon.png (512) and apple-icon.png (180) into /app,\n// put the rest in /public. Then in app/layout.tsx:\nimport type { Metadata, Viewport } from 'next'\n\nexport const metadata: Metadata = {\n  title: '${app.name}',\n  manifest: '/site.webmanifest',\n  icons: {\n    icon: [\n      { url: '/favicon.ico', sizes: '48x48' },${hasSvg ? `\n      { url: '/favicon.svg', type: 'image/svg+xml' },` : ''}\n      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },\n      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },\n    ],\n    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],\n    other: [{ rel: 'mask-icon', url: '/safari-pinned-tab.svg', color: '${app.theme}' }],\n  },\n  other: { 'msapplication-TileColor': '${app.theme}', 'msapplication-config': '/browserconfig.xml' },\n}\n\nexport const viewport: Viewport = { themeColor: '${app.theme}' }`
  const react = `// Vite / CRA: put all files in /public and paste the <link> tags into index.html <head>.\n// Or set them at runtime with react-helmet-async:\nimport { Helmet } from 'react-helmet-async'\n\nexport function Favicons() {\n  return (\n    <Helmet>\n${html.split('\n').map((l) => '      ' + l.replace(/>$/, ' />').replace(/sizes="(\d+x\d+)"/, 'sizes="$1"')).join('\n')}\n    </Helmet>\n  )\n}`
  const code = { html, next, react, manifest, browserconfig }[codeTab]

  const pinnedSvg = () => {
    if (o.source === 'text') return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><text x="8" y="8" text-anchor="middle" dominant-baseline="central" font-family="${esc(o.font)}" font-weight="${o.weight}" font-size="${Math.min(14, 22 / Math.max(1, o.text.length) * 0.9)}" fill="#000">${esc(o.text)}</text></svg>`
    if (o.source === 'svg') return svgText.replace(/fill="(?!none)[^"]*"/g, 'fill="#000"')
    return ''
  }
  const faviconSvg = () => {
    if (o.source === 'svg') return svgText
    const r = (o.radius / 100) * 50
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${o.transparentBg ? '' : `<rect width="100" height="100" rx="${r}" fill="${o.bg}"/>`}<text x="50" y="${50 + o.dy}" text-anchor="middle" dominant-baseline="central" font-family="${esc(o.font)}" font-weight="${o.weight}" font-size="${Math.round((100 - o.padding * 2) * o.scale * (o.text.length > 1 ? 1.4 / o.text.length : 0.85))}" fill="${o.textColor}">${esc(o.text)}</text></svg>`
  }

  const generate = () => job.run(async (setP) => {
    if (o.source !== 'text' && !img) throw new Error('Add an image or SVG first')
    await document.fonts?.ready
    const files: { name: string; data: Blob | string | Uint8Array }[] = []
    for (let i = 0; i < OUT.length; i++) { const f = OUT[i]; files.push({ name: f.name, data: await canvasToBlob(render(f.size, o, img, f.opaque)) }); setP((i + 1) / (OUT.length + 3)) }
    const icoImgs = [16, 32, 48].map((s) => { const c = render(s, o, img); return { size: s, rgba: c.getContext('2d')!.getImageData(0, 0, s, s).data } })
    files.push({ name: 'favicon.ico', data: encodeIco(icoImgs) })
    files.push({ name: 'site.webmanifest', data: manifest }, { name: 'browserconfig.xml', data: browserconfig })
    if (hasSvg) { files.push({ name: 'favicon.svg', data: faviconSvg() }); files.push({ name: 'safari-pinned-tab.svg', data: pinnedSvg() }) }
    files.push({ name: 'favicon-snippet.html', data: html + '\n' }, { name: 'nextjs-layout-metadata.ts', data: next + '\n' }, { name: 'README.txt', data: `Favicon pack generated by OpenFile\n\n1. Upload every file to your site root (${base}).\n2. Paste favicon-snippet.html into your <head>.\n3. safari-pinned-tab.svg must be a single-colour (black) SVG, ${o.source === 'image' ? 'raster sources cannot be converted automatically; trace your logo (e.g. with an image-to-SVG tool) and save it as safari-pinned-tab.svg.' : 'one was generated from your source, check it looks right.'}\n` })
    setP(0.95)
    const zip = await zipFiles(files)
    downloadBlob(zip, 'favicon-pack.zip'); setP(1); toast(`Favicon pack ready · ${formatBytes(zip.size)}`)
  })

  const ready = o.source === 'text' || !!img
  const P = previews
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-4">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <Segmented value={o.source === 'svg' ? 'image' : o.source} onChange={(v) => upd({ source: v === 'text' ? 'text' : img ? (svgText ? 'svg' : 'image') : 'image' })} options={[{ value: 'text', label: <span className="flex items-center gap-1.5"><Type className="size-3.5" />Text / emoji</span> }, { value: 'image', label: <span className="flex items-center gap-1.5"><ImageIcon className="size-3.5" />Image / SVG</span> }]} />
            {fileName && o.source !== 'text' && <span className="flex items-center gap-1 text-xs text-muted">{fileName}<button onClick={() => { setImg(null); setSvgText(''); setFileName('') }} className="rounded p-0.5 hover:text-danger cursor-pointer"><X className="size-3.5" /></button></span>}
          </div>
          {o.source !== 'text' && !img ? (
            <div className="space-y-3">
              <Dropzone accept="image/*,.svg" onFiles={(f) => loadFile(f[0])} label="Drop a logo (PNG, JPG, WEBP, SVG)" sub="Square images work best · at least 512×512 recommended · or paste (Ctrl+V)" compact />
              <details className="rounded-xl border border-border p-3"><summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><FileCode2 className="size-4 text-accent" />Paste SVG code</summary>
                <Textarea className="mt-3 h-28" placeholder="<svg viewBox=…>…</svg>" value={svgText} onChange={(e) => setSvgText(e.target.value)} />
                <Button size="sm" className="mt-2" disabled={!svgText.includes('<svg')} onClick={() => { setFileName('pasted.svg'); applySvg(svgText) }}>Use this SVG</Button>
              </details>
            </div>
          ) : (
            <div className="flex flex-wrap items-end justify-center gap-6 rounded-xl bg-surface-2/50 p-6 checker">
              {[512, 192, 180, 48, 32, 16].map((s) => P[s] && (
                <motion.div key={s} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-2">
                  <img src={P[s]} alt="" style={{ width: Math.max(16, Math.min(128, s / 4 + 12)), height: Math.max(16, Math.min(128, s / 4 + 12)), imageRendering: s <= 48 ? 'pixelated' : 'auto' }} className="drop-shadow-md" />
                  <span className="font-mono text-[10px] text-muted">{s}px</span>
                </motion.div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between"><h3 className="font-display font-semibold">Live mockups</h3><Segmented value={mock} onChange={setMock} options={[{ value: 'tab', label: 'Browser' }, { value: 'ios', label: 'iOS' }, { value: 'android', label: 'Android' }]} /></div>
          {mock === 'tab' && <div className="space-y-3">
            {[false, true].map((dark) => (
              <div key={String(dark)} className={cn('overflow-hidden rounded-xl border', dark ? 'border-neutral-700 bg-[#202124]' : 'border-neutral-200 bg-[#dee1e6]')}>
                <div className="flex items-end gap-1 px-2 pt-2">
                  <div className={cn('flex h-9 w-56 items-center gap-2 rounded-t-lg px-3 text-xs', dark ? 'bg-[#35363a] text-neutral-200' : 'bg-white text-neutral-800')}>{P[32] ? <img src={P[32]} className="size-4" alt="" /> : <span className="size-4 rounded bg-neutral-400" />}<span className="truncate">{app.name}</span><X className="ml-auto size-3 opacity-60" /></div>
                  <div className={cn('flex h-8 w-40 items-center gap-2 px-3 text-xs opacity-70', dark ? 'text-neutral-300' : 'text-neutral-600')}><span className="size-4 rounded-full bg-neutral-400/60" /><span className="truncate">Other tab</span></div>
                </div>
                <div className={cn('flex items-center gap-2 px-3 py-2', dark ? 'bg-[#35363a]' : 'bg-white')}><RotateCw className="size-3.5 text-neutral-500" /><div className={cn('flex flex-1 items-center gap-2 rounded-full px-3 py-1.5 text-xs', dark ? 'bg-[#202124] text-neutral-300' : 'bg-[#f1f3f4] text-neutral-700')}><Lock className="size-3" />{app.name.toLowerCase().replace(/\s+/g, '') || 'example'}.com</div></div>
              </div>
            ))}
          </div>}
          {mock === 'ios' && <div className="mx-auto w-72 overflow-hidden rounded-[2.5rem] border-[10px] border-neutral-900 bg-gradient-to-br from-sky-400 via-sky-500 to-amber-500 p-5 pb-10 shadow-2xl">
            <div className="mb-6 flex justify-between text-[11px] font-semibold text-white"><span>9:41</span><span className="flex gap-1"><Signal className="size-3" /><Wifi className="size-3" /><Battery className="size-3" /></span></div>
            <div className="grid grid-cols-4 gap-x-3 gap-y-4">
              {Array.from({ length: 12 }).map((_, i) => i === 5 ? (
                <div key={i} className="flex flex-col items-center gap-1"><img src={P[180]} alt="" className="size-14 rounded-[22%] shadow-lg" /><span className="w-16 truncate text-center text-[10px] text-white">{app.short}</span></div>
              ) : <div key={i} className="flex flex-col items-center gap-1"><div className="size-14 rounded-[22%] bg-white/25 backdrop-blur" /><span className="h-2 w-10 rounded bg-white/30" /></div>)}
            </div>
          </div>}
          {mock === 'android' && <div className="mx-auto w-72 overflow-hidden rounded-[2rem] border-[8px] border-neutral-800 bg-gradient-to-b from-emerald-700 to-teal-900 p-5 pb-8 shadow-2xl">
            <div className="mb-8 flex justify-between text-[11px] text-white/90"><span>12:30</span><span className="flex gap-1"><Wifi className="size-3" /><Battery className="size-3" /></span></div>
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => i === 2 ? (
                <div key={i} className="flex flex-col items-center gap-1"><img src={P[192]} alt="" className="size-14 rounded-full bg-white object-cover shadow-lg" /><span className="w-16 truncate text-center text-[10px] text-white">{app.short}</span></div>
              ) : <div key={i} className="flex flex-col items-center gap-1"><div className="size-14 rounded-full bg-white/20" /><span className="h-2 w-10 rounded bg-white/25" /></div>)}
            </div>
            <div className="mt-8 flex items-center gap-3 rounded-2xl bg-white/90 p-3"><img src={P[48]} alt="" className="size-8 rounded-lg" /><div className="text-xs"><div className="font-semibold text-neutral-900">Add {app.short} to Home screen</div><div className="text-neutral-500">Installable web app</div></div></div>
          </div>}
        </Card>

        <Card className="space-y-3">
          <div className="overflow-x-auto scrollbar-thin"><Tabs value={codeTab} onChange={setCodeTab} tabs={[{ value: 'html', label: 'HTML' }, { value: 'next', label: 'Next.js' }, { value: 'react', label: 'React' }, { value: 'manifest', label: 'site.webmanifest' }, { value: 'browserconfig', label: 'browserconfig.xml' }]} /></div>
          <Textarea readOnly value={code} className="h-52 text-[11px]" />
          <div className="flex flex-wrap items-center gap-2"><CopyButton text={code} /><span className="text-[11px] text-muted">safari-pinned-tab: {o.source === 'image' ? 'raster logos need a hand-traced single-colour SVG (see README in ZIP).' : 'generated as a black single-colour SVG.'}</span></div>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-5">
          {o.source === 'text' && <>
            <div><Label hint="1–2 letters or an emoji">Text</Label><Input value={o.text} maxLength={4} onChange={(e) => upd({ text: e.target.value })} className="text-lg" /></div>
            <div className="flex flex-wrap gap-1">{['🚀', '⚡', '🔥', '✨', '🎨', '📦', '💡', '🌈', '🍕', '🦄'].map((e) => <button key={e} onClick={() => upd({ text: e, font: FONTS[4].value })} className="rounded-lg p-1 text-lg hover:bg-surface-2 cursor-pointer">{e}</button>)}</div>
            <div className="grid grid-cols-2 gap-3"><div><Label>Font</Label><Select value={o.font} onChange={(font) => upd({ font })} options={FONTS} /></div><div><Label>Weight</Label><Select value={String(o.weight)} onChange={(v) => upd({ weight: +v })} options={['400', '500', '600', '700', '800', '900']} /></div></div>
            <ColorField label="Text colour" value={o.textColor} onChange={(textColor) => upd({ textColor })} alpha={false} />
          </>}
          <Switch checked={!o.transparentBg} onChange={(v) => upd({ transparentBg: !v })} label="Background fill" />
          {(!o.transparentBg || o.source !== 'text') && <ColorField label={o.transparentBg ? 'Background (apple-touch only)' : 'Background'} value={o.bg} onChange={(bg) => upd({ bg })} alpha={false} />}
          <Slider label="Corner rounding" value={o.radius} onChange={(radius) => upd({ radius })} min={0} max={100} suffix="%" />
          <Slider label="Padding" value={o.padding} onChange={(padding) => upd({ padding })} min={0} max={30} suffix="%" />
          <Slider label="Scale" value={Math.round(o.scale * 100)} onChange={(v) => upd({ scale: v / 100 })} min={30} max={150} suffix="%" />
          <Slider label="Vertical offset" value={o.dy} onChange={(dy) => upd({ dy })} min={-20} max={20} suffix="%" />
          <div className="space-y-3 border-t border-border pt-4">
            <Label>App details (manifest)</Label>
            <div className="grid grid-cols-2 gap-2"><Input value={app.name} onChange={(e) => setApp({ ...app, name: e.target.value })} placeholder="App name" /><Input value={app.short} onChange={(e) => setApp({ ...app, short: e.target.value })} placeholder="Short name" /></div>
            <div className="grid grid-cols-2 gap-2"><ColorField label="Theme" value={app.theme} onChange={(theme) => setApp({ ...app, theme })} alpha={false} /><ColorField label="Splash bg" value={app.bgColor} onChange={(bgColor) => setApp({ ...app, bgColor })} alpha={false} /></div>
            <div><Label>Icons path</Label><Input value={app.path} onChange={(e) => setApp({ ...app, path: e.target.value || '/' })} className="font-mono" /></div>
          </div>
          {job.busy && <Progress value={job.progress} label="Building pack…" />}
          <Button className="w-full" size="lg" disabled={!ready} loading={job.busy} onClick={generate} icon={<Download className="size-4" />}>Download favicon pack (.zip)</Button>
          <div className="flex flex-wrap gap-1">{['favicon.ico', 'PNG 16–512', 'apple-touch 180', 'android 192/512', 'mstile 150', 'manifest', 'browserconfig', ...(hasSvg ? ['SVG + pinned tab'] : [])].map((t) => <Badge key={t}>{t}</Badge>)}</div>
          {ready && <Button variant="outline" size="sm" className="w-full" onClick={() => job.run(async () => { const icoImgs = [16, 32, 48].map((s) => { const c = render(s, o, img); return { size: s, rgba: c.getContext('2d')!.getImageData(0, 0, s, s).data } }); downloadBlob(encodeIco(icoImgs), 'favicon.ico', 'image/x-icon') })}>Just favicon.ico</Button>}
        </Card>
      </aside>
    </div>
  )
}
