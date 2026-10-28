import { useEffect, useMemo, useState } from 'react'
import { Palette, Download, Cpu, RotateCcw } from 'lucide-react'
import { Button, Field, FileChip, Progress, Segmented, Slider, ToolGrid, ErrorNote, useJob } from '@/components/ui'
import { downloadBlob, formatBytes } from '@/lib/files'
import { BeforeAfter, ImageDrop, useObjectUrl } from '@/tools/image/_img/kit'
import { decodeAny, encodeCanvas, type OutFmt } from '@/lib/b2/codecs'
import { DDCOLOR_SIZE, ddcolorInput, mergeAB, meanChroma } from '@/lib/b2/colorize'

// DDColor tiny (Apache-2.0, piddnad/DDColor), ONNX fp16 export with a fixed 512x512 input.
const MODEL_URL = 'https://huggingface.co/lensmera/lensmera-color-ddcolor/resolve/main/ddcolor_tiny_fp16.onnx'
const MODEL_SIZE = 135_779_326
const PREVIEW = 1200

function shrink(src: HTMLCanvasElement, max: number) {
  const k = Math.min(1, max / Math.max(src.width, src.height))
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(src.width * k)); c.height = Math.max(1, Math.round(src.height * k))
  const ctx = c.getContext('2d')!; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, c.width, c.height)
  return c
}
function merged(src: HTMLCanvasElement, ab: Float32Array, strength: number) {
  const ctx = src.getContext('2d')!, id = ctx.getImageData(0, 0, src.width, src.height)
  const out = mergeAB(id.data, src.width, src.height, ab, strength)
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height
  c.getContext('2d')!.putImageData(new ImageData(out as unknown as Uint8ClampedArray<ArrayBuffer>, src.width, src.height), 0, 0)
  return c
}
const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the preview.'))), 'image/jpeg', 0.9))

/** Predict the a/b colour channels for a photo. Returns planar [2,512,512]. */
async function predictAB(src: HTMLCanvasElement, onDl: (l: number, t: number) => void, onStage: (s: string) => void) {
  const { getSession } = await import('@/lib/b2/onnx')
  onStage('Loading AI model')
  const { session, ort, backend } = await getSession(MODEL_URL, onDl)
  const S = DDCOLOR_SIZE
  const c = document.createElement('canvas'); c.width = S; c.height = S
  const ctx = c.getContext('2d')!; ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S); ctx.drawImage(src, 0, 0, S, S)
  const input = ddcolorInput(ctx.getImageData(0, 0, S, S).data, S)
  onStage(`Adding colour (${backend === 'webgpu' ? 'GPU' : 'CPU'})`)
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, S, S]) })
  const t = out[session.outputNames[0]]
  const data = t.data as Float32Array
  if (data.length !== 2 * S * S) throw new Error('The AI model returned an unexpected result. Try again or use another photo.')
  return Float32Array.from(data)
}

export default function ColorizePhoto() {
  const [file, setFile] = useState<File | null>(null)
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null)
  const [ab, setAb] = useState<Float32Array | null>(null)
  const [strength, setStrength] = useState(100)
  const [fmt, setFmt] = useState<OutFmt>('jpg')
  const [stage, setStage] = useState('')
  const [cached, setCached] = useState<boolean | null>(null)
  const [beforeBlob, setBeforeBlob] = useState<Blob | null>(null)
  const [afterBlob, setAfterBlob] = useState<Blob | null>(null)
  const { busy, progress, error, run, setProgress } = useJob()
  const beforeUrl = useObjectUrl(beforeBlob), afterUrl = useObjectUrl(afterBlob)
  useEffect(() => { import('@/lib/b2/onnx').then((m) => m.isModelCached(MODEL_URL)).then(setCached) }, [])

  const small = useMemo(() => (src ? shrink(src, PREVIEW) : null), [src])
  const hasColour = useMemo(() => { if (!small) return false; const d = small.getContext('2d')!.getImageData(0, 0, small.width, small.height).data; return meanChroma(d, small.width, small.height) > 8 }, [small])

  // greyscale "before" preview (what the model sees)
  useEffect(() => {
    if (!small) return
    const c = merged(small, new Float32Array(2 * DDCOLOR_SIZE * DDCOLOR_SIZE), 0)
    toBlob(c).then(setBeforeBlob)
  }, [small])
  // live colour preview at preview size
  useEffect(() => {
    if (!small || !ab) { setAfterBlob(null); return }
    const t = setTimeout(() => { toBlob(merged(small, ab, strength / 100)).then(setAfterBlob) }, 60)
    return () => clearTimeout(t)
  }, [small, ab, strength])

  const open = (fs: File[]) => run(async () => { const { canvas } = await decodeAny(fs[0]); setFile(fs[0]); setSrc(canvas); setAb(null); setAfterBlob(null) })
  const colorize = () => run(async (setP) => {
    if (!src) return
    setP(0.02)
    const r = await predictAB(src, (l, t) => setP(t ? (l / t) * 0.85 : 0.4), setStage)
    setAb(r); setCached(true); setStage(''); setProgress(1)
  })
  const save = () => run(async () => {
    if (!src || !ab || !file) return
    setStage('Building full-size image')
    await new Promise((r) => setTimeout(r, 30))
    const out = merged(src, ab, strength / 100)
    downloadBlob(await encodeCanvas(out, fmt, { quality: 92 }), `${file.name.replace(/\.[^.]+$/, '')}-colorized.${fmt}`)
    setStage('')
  })
  const reset = () => { setFile(null); setSrc(null); setAb(null); setAfterBlob(null); setBeforeBlob(null) }

  if (!src || !file) return <div className="space-y-3"><ImageDrop multiple={false} onFiles={open} label="Drop a black and white photo to add colour" accept="image/*,.tif,.tiff,.heic,.jxl,.psd" /><ErrorNote error={error} /></div>
  return (
    <ToolGrid
      main={<>
        {beforeUrl && afterUrl ? <BeforeAfter before={beforeUrl} after={afterUrl} labels={['Original', 'Colour']} checker={false} />
          : beforeUrl ? <div className="grid place-items-center overflow-hidden rounded-2xl border border-border p-2"><img src={beforeUrl} alt="Your photo in greyscale" className="max-h-[70vh] max-w-full" /></div>
          : <div className="skeleton h-72 rounded-2xl" />}
        <FileChip file={file} onRemove={reset} extra={<span className="text-xs text-muted">{src.width}×{src.height}</span>} />
        {hasColour && !ab && <p className="text-center text-xs text-muted">This photo already has some colour. Only its brightness is used, so the colours will be replaced with new ones.</p>}
      </>}
      side={<>
        {cached === false && <p className="flex gap-2 rounded-xl border border-border bg-surface-2/50 p-3 text-xs text-muted"><Cpu className="size-4 shrink-0 text-accent" />The first run downloads the DDColor model ({formatBytes(MODEL_SIZE)}). It is cached for next time and runs on your device.</p>}
        <Button size="lg" className="w-full" loading={busy && !ab} disabled={busy} icon={ab ? <RotateCcw className="size-4" /> : <Palette className="size-4" />} onClick={colorize}>{ab ? 'Run again' : 'Colorize'}</Button>
        {busy && <Progress value={progress} label={stage || 'Working'} />}
        <Slider label="Colour strength" value={strength} onChange={setStrength} min={0} max={160} suffix="%" />
        <p className="text-xs text-muted">Below 100% gives a softer, hand-tinted look. Above 100% makes colours bolder.</p>
        <Field label="Save as"><Segmented value={fmt} onChange={setFmt} options={[{ value: 'jpg', label: 'JPG' }, { value: 'png', label: 'PNG' }, { value: 'webp', label: 'WEBP' }]} /></Field>
        <ErrorNote error={error} />
        <Button variant="outline" className="w-full" disabled={!ab || busy} icon={<Download className="size-4" />} onClick={save}>Download full size</Button>
        <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
      </>}
    />
  )
}
