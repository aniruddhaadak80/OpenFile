import { useState } from 'react'
import { Stamp, ImagePlus, Type, X } from 'lucide-react'
import { Button, Dropzone, Field, Input, ResultCard, Select, Segmented, Slider, Switch, ToolGrid, Progress, ErrorNote, useJob, Label } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName, canvasToBlob, createCanvas, loadImage } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, LivePreview, PDF_ACCEPT, PageScope, PositionPicker, ops, readBytes, scopePages, usePdfDoc, FONTS_LIST } from './_core/kit'
import type { FontName, Pos9, WatermarkOpts } from './_core/ops'

const POS9: Pos9[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br']

async function prepareImage(f: File): Promise<{ bytes: Uint8Array; type: 'png' | 'jpg'; url: string }> {
  const url = URL.createObjectURL(f)
  if (f.type === 'image/png') return { bytes: await readBytes(f), type: 'png', url }
  if (f.type === 'image/jpeg') return { bytes: await readBytes(f), type: 'jpg', url }
  // webp / svg / gif / etc → PNG via canvas (keeps transparency)
  const img = await loadImage(url)
  const w = img.naturalWidth || 1200, h = img.naturalHeight || 1200
  const s = Math.min(1, 2400 / Math.max(w, h))
  const { canvas, ctx } = createCanvas(w * s, h * s)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { bytes: new Uint8Array(await (await canvasToBlob(canvas, 'image/png')).arrayBuffer()), type: 'png', url }
}

export default function PdfWatermark() {
  const [file, setFile] = useState<File | null>(null)
  const { numPages, error } = usePdfDoc(file)
  const [kind, setKind] = useState<'text' | 'image'>('text')
  const [text, setText] = useState('CONFIDENTIAL')
  const [font, setFont] = useState<FontName>('Helvetica-Bold')
  const [size, setSize] = useState(64)
  const [color, setColor] = useState('#e11d48')
  const [image, setImage] = useState<{ bytes: Uint8Array; type: 'png' | 'jpg'; url: string } | null>(null)
  const [imageScale, setImageScale] = useState(40)
  const [opacity, setOpacity] = useState(25)
  const [angle, setAngle] = useState(45)
  const [tile, setTile] = useState(false)
  const [position, setPosition] = useState<Pos9>('mc')
  const [gap, setGap] = useState(80)
  const [scope, setScope] = useState<'all' | 'range'>('all')
  const [range, setRange] = useState('')
  const [preview, setPreview] = useState(0)
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setResult(null); setPreview(0) }
  const dirty = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setResult(null) }

  const opts = (): WatermarkOpts => ({
    kind, text, font, size, color, image: image ?? undefined, imageScale: imageScale / 100, opacity: opacity / 100, angle,
    position: tile ? 'tile' : position, tileGap: gap, pages: scopePages(scope, range, numPages),
  })
  const deps = [kind, text, font, size, color, image, imageScale, opacity, angle, tile, position, gap, scope, range, numPages]
  const ready = kind === 'text' ? !!text.trim() : !!image

  const run = () => job.run(async (setP) => {
    if (!file) return
    if (!ready) throw new Error(kind === 'text' ? 'Type the watermark text first.' : 'Choose a logo image first.')
    const o = await ops()
    setResult(pdfBlob(await o.watermark(await readBytes(file), opts()))); setP(1); toast('Watermark applied', 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to watermark" />

  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-watermarked.pdf`} title="Watermark applied" onReset={reset} />}
      <ToolGrid
        main={error ? <div className="text-sm text-danger">{error}</div> : numPages ? (
          ready ? <LivePreview file={file} pageIndex={preview} setPageIndex={setPreview} total={numPages} deps={deps}
            build={async (b, pi) => (await ops()).watermark(b, { ...opts(), indexBase: pi })}
            note={scope === 'range' ? 'Pages outside the chosen range are left untouched.' : undefined} />
            : <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-border text-sm text-muted">{kind === 'text' ? 'Type some watermark text to see the preview' : 'Choose a logo image to see the preview'}</div>
        ) : null}
        side={<>
          <Segmented value={kind} onChange={dirty(setKind)} className="w-full" options={[{ value: 'text', label: <span className="inline-flex items-center gap-1.5"><Type className="size-3.5" />Text</span> }, { value: 'image', label: <span className="inline-flex items-center gap-1.5"><ImagePlus className="size-3.5" />Image / logo</span> }]} />
          {kind === 'text' ? <>
            <Field label="Text"><Input value={text} onChange={(e) => { setText(e.target.value); setResult(null) }} placeholder="CONFIDENTIAL" /></Field>
            <div className="flex flex-wrap gap-1.5">{['CONFIDENTIAL', 'DRAFT', 'COPY', 'SAMPLE', 'DO NOT COPY', 'PAID'].map((t) => <button key={t} type="button" onClick={() => { setText(t); setResult(null) }} className="rounded-lg border border-border px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent cursor-pointer">{t}</button>)}</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Font"><Select value={font} onChange={dirty(setFont)} options={FONTS_LIST} /></Field>
              <Field label="Color"><input type="color" value={color} onChange={(e) => { setColor(e.target.value); setResult(null) }} className="h-10 w-full cursor-pointer rounded-xl border border-border bg-transparent p-1" /></Field>
            </div>
            <Slider label="Font size" value={size} min={8} max={200} onChange={dirty(setSize)} suffix="pt" />
          </> : <>
            {image ? (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/50 p-2">
                <div className="checker grid size-14 place-items-center overflow-hidden rounded-lg"><img src={image.url} alt="" className="max-h-full max-w-full" /></div>
                <div className="flex-1 text-xs text-muted">Logo ready ({image.type.toUpperCase()})</div>
                <button onClick={() => { setImage(null); setResult(null) }} className="rounded-lg p-1.5 text-muted hover:text-danger cursor-pointer" aria-label="Remove image"><X className="size-4" /></button>
              </div>
            ) : <Dropzone compact accept="image/*" onFiles={async (f) => { try { setImage(await prepareImage(f[0])); setResult(null) } catch (e: any) { toast(e.message, 'error') } }} label="Choose logo image" sub="PNG with transparency works best" />}
            <Slider label="Logo width" value={imageScale} min={5} max={100} onChange={dirty(setImageScale)} suffix="% of page" />
          </>}
          <Slider label="Opacity" value={opacity} min={5} max={100} onChange={dirty(setOpacity)} suffix="%" />
          <div>
            <Slider label="Rotation" value={angle} min={-180} max={180} onChange={dirty(setAngle)} suffix="°" />
            <div className="mt-1.5 flex gap-1.5">{[0, 45, -45, 90].map((a) => <button key={a} type="button" onClick={() => { setAngle(a); setResult(null) }} className="rounded-lg border border-border px-2 py-0.5 font-mono text-[11px] text-muted hover:border-accent hover:text-accent cursor-pointer">{a}°</button>)}</div>
          </div>
          <Switch checked={tile} onChange={dirty(setTile)} label="Tile across the page" />
          {tile ? <Slider label="Tile spacing" value={gap} min={0} max={300} onChange={dirty(setGap)} suffix="pt" />
            : <div><Label>Position</Label><PositionPicker value={position} onChange={dirty(setPosition)} options={POS9} rows={3} /></div>}
          <div><Label>Pages</Label><PageScope total={numPages} mode={scope} setMode={dirty(setScope)} range={range} setRange={dirty(setRange)} /></div>
          {job.busy && <Progress value={job.progress} label="Stamping…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<Stamp className="size-5" />} loading={job.busy} disabled={!numPages || !ready} onClick={run}>Apply watermark</Button>
        </>}
      />
    </div>
  )
}
