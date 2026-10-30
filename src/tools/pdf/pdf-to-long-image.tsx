import { safeBlobUrl } from '../../lib/safe'
import { useEffect, useState } from 'react'
import { GalleryVertical, Download } from 'lucide-react'
import { Button, Dropzone, Field, Segmented, Slider, ToolGrid, Progress, ErrorNote, useJob, ResultCard, Input } from '@/components/ui'
import { openPdfJs, renderPage, pdfBlob } from '@/lib/pdf'
import { baseName, canvasToBlob, downloadBlob, zipFiles } from '@/lib/files'
import { FileBar, PDF_ACCEPT, readBytes, usePdfDoc } from './_core/kit'
import { stackPages } from '@/lib/b14/pdf'
import { useBlobUrl } from '@/lib/b14/ui'

const MAX_H = 16000 // tallest canvas most browsers allow safely

export default function PdfToLongImage() {
  const [file, setFile] = useState<File | null>(null)
  const { numPages, error } = usePdfDoc(file)
  const [mode, setMode] = useState<'image' | 'pdf'>('image')
  const [fmt, setFmt] = useState<'png' | 'jpeg' | 'webp'>('jpeg')
  const [width, setWidth] = useState(1200)
  const [gap, setGap] = useState(16)
  const [bg, setBg] = useState('#E5E7EB')
  const [out, setOut] = useState<{ blobs: Blob[]; ext: string } | null>(null)
  const preview = useBlobUrl(out?.blobs[0] ?? null)
  const job = useJob()
  useEffect(() => setOut(null), [mode, fmt, width, gap, bg])
  const run = () => job.run(async (setP) => {
    if (!file) return
    setOut(null)
    if (mode === 'pdf') { const parts = await stackPages(await readBytes(file), { gap, bg }); setOut({ blobs: parts.map(pdfBlob), ext: 'pdf' }); setP(1); return }
    const doc = await openPdfJs(await readBytes(file))
    const pages: HTMLCanvasElement[] = []
    for (let i = 1; i <= doc.numPages; i++) { const p = await doc.getPage(i); const vp = p.getViewport({ scale: 1 }); pages.push(await renderPage(doc, i, width / vp.width)); setP((i / doc.numPages) * 0.8) }
    // pack pages into canvases no taller than MAX_H
    const groups: HTMLCanvasElement[][] = [[]]; let h = 0
    for (const c of pages) { if (groups[groups.length - 1].length && h + gap + c.height > MAX_H) { groups.push([]); h = 0 } h += (groups[groups.length - 1].length ? gap : 0) + c.height; groups[groups.length - 1].push(c) }
    const blobs: Blob[] = []
    for (const g of groups) {
      const H = g.reduce((a, c) => a + c.height, 0) + gap * (g.length - 1)
      const W = Math.max(...g.map((c) => c.width))
      const can = document.createElement('canvas'); can.width = W; can.height = H
      const ctx = can.getContext('2d')!; ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
      let y = 0; for (const c of g) { ctx.drawImage(c, (W - c.width) / 2, y); y += c.height + gap }
      blobs.push(await canvasToBlob(can, `image/${fmt}`, 0.9))
    }
    setOut({ blobs, ext: fmt === 'jpeg' ? 'jpg' : fmt }); setP(1)
  })
  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF" sub="Stack every page into one long image for phones, chats and social posts, or into one tall PDF page for smooth scrolling." />
  const name = (i: number) => `${baseName(file.name)}-long${out && out.blobs.length > 1 ? `-${i + 1}` : ''}.${out?.ext}`
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={() => { setFile(null); setOut(null) }} />
      {out && (out.blobs.length === 1 ? <ResultCard blob={out.blobs[0]} filename={name(0)} originalSize={file.size} title="Long page ready" /> : <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-success/30 bg-success/5 p-4"><span className="flex-1 text-sm">Too tall for one file, split into {out.blobs.length} parts.</span><Button icon={<Download className="size-4" />} onClick={async () => downloadBlob(await zipFiles(out.blobs.map((b, i) => ({ name: name(i), data: b }))), `${baseName(file.name)}-long.zip`)}>Download ZIP</Button></div>)}
      <ToolGrid
        main={error ? <div className="text-sm text-danger">{error}</div> : out && preview && out.ext !== 'pdf' ? <div className="scrollbar-thin max-h-[75vh] overflow-auto rounded-2xl border border-border bg-surface-2/40 p-3"><img src={safeBlobUrl(preview)} alt="Long image preview" className="mx-auto w-full max-w-md" /></div>
          : <div className="grid min-h-60 place-items-center rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{numPages} pages will be joined top to bottom. Press the button to build it.</div>}
        side={<>
          <Field label="Output"><Segmented value={mode} onChange={setMode} options={[{ value: 'image', label: 'Long image' }, { value: 'pdf', label: 'One page PDF' }]} /></Field>
          {mode === 'image' ? <>
            <Field label="Format"><Segmented value={fmt} onChange={setFmt} options={[{ value: 'jpeg', label: 'JPG' }, { value: 'png', label: 'PNG' }, { value: 'webp', label: 'WEBP' }]} /></Field>
            <Slider label="Width" value={width} onChange={setWidth} min={600} max={2400} step={100} suffix=" px" />
          </> : <p className="text-xs text-muted">Keeps text and vectors sharp. PDF pages are limited to 200 inches, so very long files are split.</p>}
          <Slider label="Gap between pages" value={gap} onChange={setGap} min={0} max={80} suffix={mode === 'pdf' ? ' pt' : ' px'} />
          <Field label="Gap colour"><Input type="color" value={bg} onChange={(e) => setBg(e.target.value)} aria-label="Gap colour" /></Field>
          {job.busy && <Progress value={job.progress} label="Rendering pages" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<GalleryVertical className="size-5" />} loading={job.busy} disabled={!numPages} onClick={run}>Make long {mode === 'pdf' ? 'PDF' : 'image'}</Button>
        </>}
      />
    </div>
  )
}
