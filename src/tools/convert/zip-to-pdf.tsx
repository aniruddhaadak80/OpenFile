import { useMemo, useState } from 'react'
import { FileArchive, FileImage, FileText, File as FileIcon, X } from 'lucide-react'
import { Button, Dropzone, ResultCard, Segmented, Slider, Switch, ToolGrid, Progress, ErrorNote, Field, cn, useJob } from '@/components/ui'
import { baseName, formatBytes } from '@/lib/files'
import { toast } from '@/components/toast'

type Kind = 'image' | 'tiff' | 'svg' | 'pdf' | 'text' | 'skip'
type Entry = { path: string; data: Uint8Array; kind: Kind; on: boolean }
const kindOf = (p: string): Kind => {
  const e = p.toLowerCase().split('.').pop() ?? ''
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'jfif'].includes(e)) return 'image'
  if (e === 'tif' || e === 'tiff') return 'tiff'
  if (e === 'svg') return 'svg'
  if (e === 'pdf') return 'pdf'
  if (['txt', 'md', 'csv', 'json', 'log', 'xml', 'yml', 'yaml', 'ini', 'html', 'htm'].includes(e)) return 'text'
  return 'skip'
}
const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const

export default function ZipToPdf() {
  const [zipName, setZipName] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [sort, setSort] = useState<'name' | 'zip'>('name')
  const [pageMode, setPageMode] = useState<'fit' | 'a4' | 'letter'>('fit')
  const [margin, setMargin] = useState(0)
  const [quality, setQuality] = useState(88)
  const [bookmarks, setBookmarks] = useState(true)
  const [result, setResult] = useState<Blob | null>(null)
  const open = useJob(), job = useJob()

  const load = (f: File) => open.run(async () => {
    const { unzipSync } = await import('fflate')
    let files: Record<string, Uint8Array>
    try { files = unzipSync(new Uint8Array(await f.arrayBuffer())) } catch { throw new Error('Could not open this ZIP. It may be damaged or use an unsupported compression method.') }
    const list = Object.entries(files).filter(([p, d]) => d.length && !p.endsWith('/') && !/(^|\/)(__MACOSX|\.)/.test(p)).map(([path, data]) => { const kind = kindOf(path); return { path, data, kind, on: kind !== 'skip' } })
    if (!list.length) throw new Error('The ZIP is empty.')
    setZipName(f.name); setEntries(list); setResult(null)
  })
  const shown = useMemo(() => (sort === 'name' ? [...entries].sort((a, b) => natural.compare(a.path, b.path)) : entries), [entries, sort])
  const chosen = shown.filter((e) => e.on && e.kind !== 'skip')

  const run = () => job.run(async (setP) => {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
    const out = await PDFDocument.create()
    const font = await out.embedFont(StandardFonts.Helvetica)
    const mono = await out.embedFont(StandardFonts.Courier)
    const mg = (margin * 72) / 25.4
    const marks: { title: string; page: number }[] = []
    const placeImage = async (bytes: Uint8Array, isJpg: boolean, isPng: boolean, w: number, h: number) => {
      const img = isJpg ? await out.embedJpg(bytes) : isPng ? await out.embedPng(bytes) : await out.embedJpg(bytes)
      let W: number, H: number
      if (pageMode === 'fit') { W = w * 0.75 + 2 * mg; H = h * 0.75 + 2 * mg } else { [W, H] = SIZES[pageMode]; if (w > h) [W, H] = [H, W] }
      const p = out.addPage([W, H])
      const s = Math.min((W - 2 * mg) / w, (H - 2 * mg) / h)
      p.drawImage(img, { x: (W - w * s) / 2, y: (H - h * s) / 2, width: w * s, height: h * s })
    }
    const viaCanvas = async (src: CanvasImageSource, w: number, h: number) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const ctx = c.getContext('2d')!; ctx.drawImage(src, 0, 0, w, h)
      const alpha = (() => { const d = ctx.getImageData(0, 0, w, h).data; for (let i = 3; i < d.length; i += 64) if (d[i] < 250) return true; return false })()
      if (!alpha) { const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/jpeg', quality / 100)); return { bytes: new Uint8Array(await b.arrayBuffer()), jpg: true, png: false } }
      const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/png')); return { bytes: new Uint8Array(await b.arrayBuffer()), jpg: false, png: true }
    }
    const skipped: string[] = []
    for (let i = 0; i < chosen.length; i++) {
      const e = chosen[i]
      const startPage = out.getPageCount()
      try {
        if (e.kind === 'pdf') {
          const src = await PDFDocument.load(e.data, { ignoreEncryption: true })
          const pages = await out.copyPages(src, src.getPageIndices()); pages.forEach((p) => out.addPage(p))
        } else if (e.kind === 'tiff') {
          const UTIF = (await import('utif')).default as any
          const buf = e.data.buffer.slice(e.data.byteOffset, e.data.byteOffset + e.data.byteLength)
          const ifds = UTIF.decode(buf)
          for (const ifd of ifds) {
            UTIF.decodeImage(buf, ifd)
            const rgba = new Uint8ClampedArray(UTIF.toRGBA8(ifd))
            const c = document.createElement('canvas'); c.width = ifd.width; c.height = ifd.height
            c.getContext('2d')!.putImageData(new ImageData(rgba, ifd.width, ifd.height), 0, 0)
            const r = await viaCanvas(c, ifd.width, ifd.height); await placeImage(r.bytes, r.jpg, r.png, ifd.width, ifd.height)
          }
        } else if (e.kind === 'image' || e.kind === 'svg') {
          const blob = new Blob([e.data as BlobPart], { type: e.kind === 'svg' ? 'image/svg+xml' : '' })
          const isJpg = e.data[0] === 0xff && e.data[1] === 0xd8, isPng = e.data[0] === 0x89 && e.data[1] === 0x50
          if (e.kind === 'svg') {
            const url = URL.createObjectURL(blob)
            const im = await new Promise<HTMLImageElement>((res, rej) => { const x = new Image(); x.onload = () => res(x); x.onerror = () => rej(new Error('bad svg')); x.src = url })
            const w = (im.naturalWidth || 800) * 2, h = (im.naturalHeight || 600) * 2
            const r = await viaCanvas(im, w, h); URL.revokeObjectURL(url); await placeImage(r.bytes, r.jpg, r.png, w / 2, h / 2)
          } else {
            const bmp = await createImageBitmap(blob)
            if (isJpg || isPng) await placeImage(e.data, isJpg, isPng, bmp.width, bmp.height)
            else { const r = await viaCanvas(bmp, bmp.width, bmp.height); await placeImage(r.bytes, r.jpg, r.png, bmp.width, bmp.height) }
            bmp.close()
          }
        } else if (e.kind === 'text') {
          const text = new TextDecoder().decode(e.data).replace(/\r\n?/g, '\n').replace(/\t/g, '    ')
          const isCode = /\.(csv|json|log|xml|ya?ml|ini|html?)$/i.test(e.path)
          const f = isCode ? mono : font, size = isCode ? 9 : 11, lh = size * 1.35
          const [W, H] = pageMode === 'fit' ? SIZES.a4 : SIZES[pageMode]
          const m = Math.max(mg, 50), maxW = W - 2 * m
          const safe = (s: string) => [...s].map((ch) => { try { f.encodeText(ch); return ch } catch { return '?' } }).join('')
          const lines: string[] = []
          for (const raw of text.split('\n')) {
            const words = safe(raw).split(/(\s+)/); let cur = ''
            for (const w of words) { if (f.widthOfTextAtSize(cur + w, size) > maxW && cur) { lines.push(cur.trimEnd()); cur = w.trimStart() } else cur += w }
            lines.push(cur)
          }
          let p = out.addPage([W, H]); let y = H - m
          p.drawText(safe(e.path), { x: m, y: y, size: 8, font, color: rgb(0.45, 0.45, 0.5) }); y -= lh * 1.6
          for (const l of lines) { if (y < m) { p = out.addPage([W, H]); y = H - m } if (l) p.drawText(l, { x: m, y, size, font: f, color: rgb(0.1, 0.1, 0.12) }); y -= lh }
        }
        if (out.getPageCount() > startPage) marks.push({ title: e.path.split('/').pop() ?? e.path, page: startPage })
      } catch { skipped.push(e.path) }
      setP((i + 1) / chosen.length)
    }
    if (!out.getPageCount()) throw new Error('None of the files could be converted.')
    if (bookmarks && marks.length > 1) { const C = await import('../pdf/_b1/core'); C.writeOutline(out, marks.map((m) => ({ ...m, level: 0 })), false) }
    out.setTitle(baseName(zipName)); out.setProducer('OpenFile')
    setResult(new Blob([(await out.save()) as BlobPart], { type: 'application/pdf' }))
    toast(skipped.length ? `Done. ${skipped.length} file${skipped.length > 1 ? 's' : ''} could not be read` : 'PDF ready', skipped.length ? 'info' : 'success')
  })

  if (!entries.length) return <div className="space-y-3"><Dropzone accept=".zip,application/zip,application/x-zip-compressed" onFiles={(f) => load(f[0])} label="Drop a ZIP file with images, PDFs or text files" sub="Everything inside becomes one PDF, in the order you choose." /><ErrorNote error={open.error} /></div>
  const ICON = { image: FileImage, tiff: FileImage, svg: FileImage, pdf: FileText, text: FileText, skip: FileIcon }
  return (
    <div className="space-y-4">
      {result && <ResultCard blob={result} filename={`${baseName(zipName)}.pdf`} title="PDF ready" onReset={() => { setEntries([]); setResult(null) }} />}
      <ToolGrid
        main={<div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm"><span className="font-medium">{zipName}</span><span className="text-muted">{chosen.length} of {entries.length} files included</span></div>
          <div className="max-h-[65vh] space-y-1 overflow-auto pr-1 scrollbar-thin">
            {shown.map((e) => { const I = ICON[e.kind]; return (
              <label key={e.path} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition', e.on && e.kind !== 'skip' ? 'border-accent/40 bg-accent/5' : 'border-border opacity-60', e.kind === 'skip' && 'cursor-not-allowed')}>
                <input type="checkbox" disabled={e.kind === 'skip'} checked={e.on && e.kind !== 'skip'} onChange={() => { setEntries((a) => a.map((x) => x.path === e.path ? { ...x, on: !x.on } : x)); setResult(null) }} className="size-4 accent-[var(--accent)]" />
                <I className="size-4 shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate">{e.path}</span>
                <span className="text-xs text-muted">{e.kind === 'skip' ? 'not supported' : formatBytes(e.data.length)}</span>
              </label>) })}
          </div>
          <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => { setEntries([]); setResult(null) }}>Choose another ZIP</Button>
        </div>}
        side={<>
          <Field label="Order"><Segmented value={sort} onChange={(v) => { setSort(v); setResult(null) }} options={[{ value: 'name', label: 'By name (1, 2, 10)' }, { value: 'zip', label: 'As stored in ZIP' }]} /></Field>
          <Field label="Image pages"><Segmented value={pageMode} onChange={(v) => { setPageMode(v); setResult(null) }} options={[{ value: 'fit', label: 'Fit image' }, { value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }]} /></Field>
          <Slider label="Margin" value={margin} min={0} max={30} onChange={(v) => { setMargin(v); setResult(null) }} suffix=" mm" />
          <Slider label="Quality for converted images" value={quality} min={50} max={100} onChange={(v) => { setQuality(v); setResult(null) }} suffix="%" />
          <Switch checked={bookmarks} onChange={(v) => { setBookmarks(v); setResult(null) }} label="Add a bookmark for each file" />
          <div className="rounded-xl bg-surface-2/60 p-3 text-xs leading-relaxed text-muted">JPEG and PNG images are placed without re-compression. PDFs inside the ZIP are merged as they are. Text files become simple text pages.</div>
          {job.busy && <Progress value={job.progress} label="Building PDF…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<FileArchive className="size-5" />} loading={job.busy} disabled={!chosen.length} onClick={run}>Create PDF</Button>
        </>}
      />
    </div>
  )
}
