import { useEffect, useMemo, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Dropzone, Field, FileChip, Progress, Segmented, Slider, Switch, ToolGrid, ErrorNote, useJob } from '@/components/ui'
import { baseName, downloadBlob } from '@/lib/files'
import { encodeCanvas, type OutFmt } from '@/lib/b2/codecs'

type Op = 'aces' | 'reinhard' | 'hable' | 'linear'
type Img = { data: Float32Array; width: number; height: number; channels: number; flip: boolean; maxLum: number; avgLum: number }

const aces = (x: number) => Math.max(0, Math.min(1, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)))
const hableP = (x: number) => ((x * (0.15 * x + 0.05) + 0.004) / (x * (0.15 * x + 0.5) + 0.06)) - 0.02 / 0.3
const hable = (x: number) => hableP(x * 2) / hableP(11.2)
const srgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)

/** Pure tone mapper: linear HDR floats to 8-bit sRGB RGBA. */
export function toneMap(img: Img, exposure: number, op: Op, gamma: number, flip: boolean, out?: Uint8ClampedArray, step = 1): { data: Uint8ClampedArray; width: number; height: number } {
  const W = Math.ceil(img.width / step), H = Math.ceil(img.height / step)
  const o = out ?? new Uint8ClampedArray(W * H * 4)
  const k = Math.pow(2, exposure), ch = img.channels
  const map = op === 'aces' ? aces : op === 'reinhard' ? (x: number) => x / (1 + x) : op === 'hable' ? hable : (x: number) => Math.min(1, x)
  const g = gamma === 2.2 ? srgb : (v: number) => Math.pow(v, 1 / gamma)
  for (let y = 0; y < H; y++) {
    const sy = Math.min(img.height - 1, y * step), row = flip ? img.height - 1 - sy : sy
    for (let x = 0; x < W; x++) {
      const sx = Math.min(img.width - 1, x * step), i = (row * img.width + sx) * ch, j = (y * W + x) * 4
      for (let c = 0; c < 3; c++) { const v = img.data[i + Math.min(c, ch - 1)]; o[j + c] = Math.round(g(Math.max(0, map(Math.max(0, v * k)))) * 255) }
      o[j + 3] = ch === 4 ? Math.round(Math.max(0, Math.min(1, img.data[i + 3])) * 255) : 255
    }
  }
  return { data: o, width: W, height: H }
}

export default function HdrExrViewer() {
  const [file, setFile] = useState<File | null>(null)
  const [img, setImg] = useState<Img | null>(null)
  const [exposure, setExposure] = useState(0)
  const [op, setOp] = useState<Op>('aces')
  const [flip, setFlip] = useState(false)
  const [alpha, setAlpha] = useState(true)
  const [fmt, setFmt] = useState<OutFmt>('png')
  const [probe, setProbe] = useState<string>('')
  const view = useRef<HTMLCanvasElement>(null)
  const { busy, error, run } = useJob()

  const open = (f: File) => run(async () => {
    const THREE = await import('three')
    const buf = await f.arrayBuffer()
    const head = new Uint8Array(buf.slice(0, 4))
    const isExr = head[0] === 0x76 && head[1] === 0x2f && head[2] === 0x31 && head[3] === 0x01
    let r: any
    if (isExr) { const { EXRLoader } = await import('three/examples/jsm/loaders/EXRLoader.js'); const l = new EXRLoader(); l.setDataType(THREE.FloatType); r = l.parse(buf) }
    else { const { HDRLoader } = await import('three/examples/jsm/loaders/HDRLoader.js'); const l = new HDRLoader(); l.setDataType(THREE.FloatType); r = l.parse(buf) }
    if (!r?.data) throw new Error('Could not decode this file. Supported: OpenEXR (.exr) and Radiance HDR (.hdr, .pic).')
    const data = r.data as Float32Array, n = r.width * r.height, ch = Math.round(data.length / n)
    // NaN, infinite and negative samples (common in renders) are skipped so peak and average stay real numbers
    let max = 0, sum = 0, count = 0
    for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 50000))) { const l = 0.2126 * data[i * ch] + 0.7152 * data[i * ch + Math.min(1, ch - 1)] + 0.0722 * data[i * ch + Math.min(2, ch - 1)]; if (!Number.isFinite(l)) continue; const v = Math.max(0, l); if (v > max) max = v; sum += Math.log(1e-4 + v); count++ }
    const avg = count ? Math.exp(sum / count) : 0.18
    setImg({ data, width: r.width, height: r.height, channels: ch, flip: isExr, maxLum: max, avgLum: avg })
    setFlip(isExr); setFile(f)
    setExposure(Math.round(Math.log2(0.18 / Math.max(1e-4, avg)) * 4) / 4)
  })

  const step = useMemo(() => (img ? Math.max(1, Math.ceil(Math.max(img.width, img.height) / 1400)) : 1), [img])
  useEffect(() => {
    if (!img || !view.current) return
    const t = toneMap({ ...img, channels: alpha ? img.channels : Math.min(3, img.channels) }, exposure, op, 2.2, flip, undefined, step)
    const v = view.current; v.width = t.width; v.height = t.height
    v.getContext('2d')!.putImageData(new ImageData(t.data as Uint8ClampedArray<ArrayBuffer>, t.width, t.height), 0, 0)
  }, [img, exposure, op, flip, alpha, step])

  const save = () => run(async () => {
    if (!img || !file) return
    const t = toneMap({ ...img, channels: alpha ? img.channels : Math.min(3, img.channels) }, exposure, op, 2.2, flip)
    const c = document.createElement('canvas'); c.width = t.width; c.height = t.height
    c.getContext('2d')!.putImageData(new ImageData(t.data as Uint8ClampedArray<ArrayBuffer>, t.width, t.height), 0, 0)
    downloadBlob(await encodeCanvas(c, fmt, { quality: 92 }), `${baseName(file.name)}.${fmt}`)
  })
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!img) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.floor(((e.clientX - r.left) / r.width) * img.width), y0 = Math.floor(((e.clientY - r.top) / r.height) * img.height)
    const y = flip ? img.height - 1 - y0 : y0
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return
    const i = (y * img.width + x) * img.channels
    setProbe(`x ${x}, y ${y0}: R ${img.data[i].toFixed(3)} G ${img.data[i + 1]?.toFixed(3)} B ${img.data[i + 2]?.toFixed(3)}`)
  }

  if (!img || !file) return <div className="space-y-3"><Dropzone accept=".exr,.hdr,.pic,.rgbe" onFiles={(f) => open(f[0])} label="Drop an EXR or HDR image" sub="OpenEXR and Radiance HDR · adjust exposure and tone-map to PNG or JPG" />{busy && <Progress value={0.5} label="Decoding" />}<ErrorNote error={error} /></div>
  return (
    <ToolGrid
      main={<>
        <div className="checker grid place-items-center overflow-hidden rounded-2xl border border-border p-2"><canvas ref={view} onPointerMove={onMove} onPointerLeave={() => setProbe('')} className="max-h-[70vh] max-w-full" style={{ height: 'auto' }} /></div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><span>{img.width}×{img.height} · {img.channels} channels · peak {img.maxLum.toFixed(2)} · average {img.avgLum.toFixed(3)}</span><span className="font-mono">{probe}</span></div>
      </>}
      side={<>
        <FileChip file={file} onRemove={() => { setFile(null); setImg(null) }} />
        <Slider label="Exposure" value={exposure} onChange={setExposure} min={-10} max={10} step={0.25} suffix=" EV" />
        <Field label="Tone mapping"><Segmented value={op} onChange={setOp} options={[{ value: 'aces', label: 'ACES' }, { value: 'reinhard', label: 'Reinhard' }, { value: 'hable', label: 'Filmic' }, { value: 'linear', label: 'Clip' }]} /></Field>
        <Switch checked={flip} onChange={setFlip} label="Flip vertically" />
        {img.channels === 4 && <Switch checked={alpha} onChange={setAlpha} label="Keep alpha channel" />}
        <Field label="Save as"><Segmented value={fmt} onChange={setFmt} options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WEBP' }, { value: 'avif', label: 'AVIF' }]} /></Field>
        <ErrorNote error={error} />
        <Button size="lg" className="w-full" loading={busy} icon={<Download className="size-4" />} onClick={save}>Download {fmt.toUpperCase()}</Button>
        <p className="text-[11px] text-muted">The preview is scaled for speed. The download is full resolution.</p>
      </>}
    />
  )
}
