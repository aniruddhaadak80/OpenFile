import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Images, Maximize2, FileArchive, CheckSquare, Square } from 'lucide-react'
import { Button, Dropzone, ToolGrid, Field, Input, Segmented, Slider, Progress, ErrorNote, Label, Badge, Empty, useJob } from '@/components/ui'
import { usePdfThumbs } from '@/components/PdfThumbs'
import { toast } from '@/components/toast'
import { openPdfJs, renderPage } from '@/lib/pdf'
import { baseName, canvasToBlob, downloadBlob, formatBytes, parsePageRanges, zipFiles } from '@/lib/files'
import { FileBar, Lightbox, Reveal, ThumbGrid, pdfError } from './_conv/shared'

type Fmt = 'png' | 'jpg' | 'webp' | 'gif' | 'bmp' | 'tiff'
const MIMES: Record<Fmt, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', tiff: 'image/tiff' }
interface Out { page: number; blob: Blob; url: string; w: number; h: number; name: string }
const EXTRA = new Set<Fmt>(['gif', 'bmp', 'tiff'])

export default function PdfToImage() {
  const [file, setFile] = useState<File | null>(null)
  const [fmt, setFmt] = useState<Fmt>('png')
  const [dpi, setDpi] = useState(150)
  const [quality, setQuality] = useState(90)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [range, setRange] = useState('')
  const [outs, setOuts] = useState<Out[]>([])
  const [view, setView] = useState<number | null>(null)
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null)
  const { thumbs, numPages, error: thumbErr } = usePdfThumbs(file)
  const { busy, progress, error, run } = useJob()

  // select all pages once the page count is known
  useEffect(() => { if (numPages) setSelected(new Set(Array.from({ length: numPages }, (_, i) => i))) }, [numPages])
  useEffect(() => {
    if (!file) return
    let off = false
    openPdfJs(file).then((d) => d.getPage(1)).then((p) => { if (!off) { const v = p.getViewport({ scale: 1 }); setPageSize({ w: v.width, h: v.height }) } }).catch(() => {})
    return () => { off = true }
  }, [file])
  // Keep every preview URL alive while it is shown. Revoke only URLs that left the list, and all of them on unmount.
  // (Revoking on every outs change broke the lightbox for multi-page PDFs: earlier pages pointed at dead blob URLs.)
  const liveUrls = useRef<Set<string>>(new Set())
  useEffect(() => {
    const now = new Set(outs.map((o) => o.url))
    liveUrls.current.forEach((u) => { if (!now.has(u)) URL.revokeObjectURL(u) })
    liveUrls.current = now
  }, [outs])
  useEffect(() => () => liveUrls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  const reset = () => { setFile(null); setOuts([]); setView(null); setSelected(new Set()); setRange(''); setPageSize(null) }
  const toggle = useCallback((i: number) => setSelected((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n }), [])
  const applyRange = () => { const idx = parsePageRanges(range, numPages); if (!idx.length) return toast('No valid pages in that range', 'error'); setSelected(new Set(idx)) }

  const order = useMemo(() => [...selected].sort((a, b) => a - b), [selected])
  const px = pageSize ? `${Math.round((pageSize.w * dpi) / 72)} × ${Math.round((pageSize.h * dpi) / 72)} px` : '-'

  const convert = () => run(async (setP) => {
    if (!file || !order.length) throw new Error('Select at least one page.')
    setOuts([])
    const doc = await openPdfJs(file).catch((e) => { throw new Error(pdfError(e)) })
    const res: Out[] = []
    for (let k = 0; k < order.length; k++) {
      const n = order[k] + 1
      const page = await doc.getPage(n)
      const vp = page.getViewport({ scale: 1 })
      let scale = dpi / 72
      const maxPx = 50_000_000 // keep within browser canvas limits
      if (vp.width * vp.height * scale * scale > maxPx) scale = Math.sqrt(maxPx / (vp.width * vp.height))
      const c = await renderPage(doc, n, scale)
      let blob: Blob, previewUrl: string
      if (EXTRA.has(fmt)) {
        const { encodeCanvasExtra } = await import('./_b1/encoders')
        blob = await encodeCanvasExtra(c, fmt as 'gif' | 'bmp' | 'tiff', dpi)
        // browsers cannot show TIFF, so preview with a PNG copy
        previewUrl = URL.createObjectURL(fmt === 'tiff' ? await canvasToBlob(c, 'image/png') : blob)
      } else { blob = await canvasToBlob(c, MIMES[fmt], fmt === 'png' ? undefined : quality / 100); previewUrl = URL.createObjectURL(blob) }
      const name = `${baseName(file.name)}-page-${String(n).padStart(String(numPages).length, '0')}.${fmt === 'tiff' ? 'tif' : fmt}`
      res.push({ page: n, blob, url: previewUrl, w: c.width, h: c.height, name })
      c.width = c.height = 0
      setOuts([...res])
      setP((k + 1) / order.length)
    }
    toast(`Exported ${res.length} image${res.length > 1 ? 's' : ''}`, 'success')
  })

  const downloadZip = async () => { const z = await zipFiles(outs.map((o) => ({ name: o.name, data: o.blob }))); downloadBlob(z, `${baseName(file!.name)}-images.zip`) }
  const total = outs.reduce((s, o) => s + o.blob.size, 0)

  if (!file) return <Dropzone accept="application/pdf,.pdf" onFiles={(f) => setFile(f[0])} label="Drop a PDF to export its pages as images" />

  return (
    <div className="space-y-5">
      <FileBar name={file.name} size={file.size} sub={numPages ? `${numPages} page${numPages > 1 ? 's' : ''}` : 'reading…'} onReset={reset} />
      <ErrorNote error={thumbErr} />
      <ToolGrid
        main={<>
          {outs.length > 0 ? (
            <Reveal k="results" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm"><span className="font-semibold">{outs.length} image{outs.length > 1 ? 's' : ''}</span> <span className="text-muted">· {formatBytes(total)}</span></div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setOuts([])}>Back to pages</Button>
                  {outs.length > 1 && <Button size="sm" icon={<FileArchive className="size-4" />} onClick={downloadZip}>Download ZIP</Button>}
                  {outs.length === 1 && <Button size="sm" icon={<Download className="size-4" />} onClick={() => downloadBlob(outs[0].blob, outs[0].name)}>Download</Button>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {outs.map((o, i) => (
                  <motion.div key={o.url} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(i * 0.03, 0.3) }} className="group overflow-hidden rounded-xl border border-border bg-surface">
                    <button className="checker relative block w-full cursor-zoom-in" onClick={() => setView(i)}>
                      <img src={o.url} alt={`Page ${o.page}`} className="mx-auto aspect-[3/4] w-full object-contain" />
                      <span className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-white opacity-0 transition group-hover:opacity-100"><Maximize2 className="size-3.5" /></span>
                    </button>
                    <div className="flex items-center gap-2 border-t border-border px-2.5 py-2">
                      <div className="min-w-0 flex-1"><div className="text-xs font-semibold">Page {o.page}</div><div className="truncate font-mono text-[10px] text-muted">{o.w}×{o.h} · {formatBytes(o.blob.size)}</div></div>
                      <button onClick={() => downloadBlob(o.blob, o.name)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-accent cursor-pointer" aria-label="Download"><Download className="size-4" /></button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </Reveal>
          ) : (
            <Reveal k="pages" className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" icon={<CheckSquare className="size-4" />} onClick={() => setSelected(new Set(Array.from({ length: numPages }, (_, i) => i)))}>All</Button>
                <Button size="sm" variant="outline" icon={<Square className="size-4" />} onClick={() => setSelected(new Set())}>None</Button>
                <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); applyRange() }}>
                  <Input value={range} onChange={(e) => setRange(e.target.value)} placeholder="Pages e.g. 1-3, 5, 8-" className="h-8 min-w-0 flex-1 text-xs" />
                  <Button size="sm" variant="secondary" type="submit">Apply</Button>
                </form>
                <Badge>{selected.size} / {numPages || '…'} selected</Badge>
              </div>
              {numPages === 0 && !thumbErr ? <Empty>Reading PDF…</Empty> : <ThumbGrid thumbs={thumbs} numPages={numPages} selected={selected} onToggle={toggle} />}
            </Reveal>
          )}
        </>}
        side={<>
          <div><Label>Format</Label><Segmented value={fmt} onChange={setFmt} options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WEBP' }, { value: 'gif', label: 'GIF' }, { value: 'bmp', label: 'BMP' }, { value: 'tiff', label: 'TIFF' }]} />
            {fmt === 'gif' && <p className="mt-1 text-[11px] text-muted">GIF is limited to 256 colors, so photos may look grainy. Best for simple pages.</p>}
            {fmt === 'tiff' && <p className="mt-1 text-[11px] text-muted">One TIFF per page (LZW). For a single multi-page TIFF or black and white fax output, use PDF to TIFF.</p>}</div>
          <div>
            <Slider label="Resolution (DPI)" value={dpi} onChange={setDpi} min={72} max={300} step={1} />
            <div className="mt-2 flex flex-wrap gap-1.5">{[72, 96, 150, 200, 300].map((d) => <button key={d} onClick={() => setDpi(d)} className={`rounded-md border px-2 py-0.5 text-[11px] cursor-pointer ${dpi === d ? 'border-accent text-accent' : 'border-border text-muted hover:text-fg'}`}>{d}</button>)}</div>
            <div className="mt-2 text-xs text-muted">Page 1 output: <span className="font-mono text-fg">{px}</span></div>
          </div>
          {(fmt === 'jpg' || fmt === 'webp') && <Slider label="Quality" value={quality} onChange={setQuality} min={40} max={100} suffix="%" />}
          {busy && <Progress value={progress} label={`Rendering ${Math.min(order.length, Math.round(progress * order.length) + 1)} of ${order.length}`} />}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} disabled={!order.length || !!thumbErr} icon={<Images className="size-5" />} onClick={convert}>
            Convert {order.length || ''} page{order.length === 1 ? '' : 's'}
          </Button>
          <p className="text-xs text-muted">Pages render at true resolution in your browser, vector text stays sharp at 300 DPI.</p>
        </>}
      />
      <Lightbox items={outs.map((o) => ({ src: o.url, caption: `Page ${o.page} · ${o.w}×${o.h}` }))} index={view} onClose={() => setView(null)} onIndex={setView}
        actions={(i) => <Button size="sm" icon={<Download className="size-4" />} onClick={() => downloadBlob(outs[i].blob, outs[i].name)}>Download</Button>} />
    </div>
  )
}
