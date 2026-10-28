import { useState } from 'react'
import { Download, Package, Wand2 } from 'lucide-react'
import { Button, Dropzone, Field, FileChip, Input, Label, Progress, Segmented, Slider, Tabs, ToolGrid, ErrorNote, ResultCard, cn, useJob } from '@/components/ui'
import { baseName, downloadBlob, formatBytes, zipFiles } from '@/lib/files'
import { decodeAny, decodeICNS, decodeICO, rgbaToCanvas, extOf } from '@/lib/b2/codecs'
import { buildAniFile, buildIcnsFile, buildIcoFile, parseAniFile, ICNS_TYPES } from '@/lib/b2/icons'
import { hqResize } from '@/tools/image/_img/kit'

type Entry = { label: string; w: number; h: number; url: string; blob: Blob; hotspot?: [number, number] }
type Build = 'ico' | 'cur' | 'icns' | 'ani'
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

const toPng = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG export failed'))), 'image/png'))
const pngBytes = async (c: HTMLCanvasElement) => new Uint8Array(await (await toPng(c)).arrayBuffer())
function square(src: HTMLCanvasElement, s: number, pad = 0) {
  const inner = s * (1 - pad / 100)
  const k = Math.min(inner / src.width, inner / src.height)
  const scaled = hqResize(src, src.width * k, src.height * k)
  const c = document.createElement('canvas'); c.width = s; c.height = s
  c.getContext('2d')!.drawImage(scaled, (s - scaled.width) / 2, (s - scaled.height) / 2)
  return c
}

function Extract() {
  const [file, setFile] = useState<File | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const { busy, error, run } = useJob()
  const open = (f: File) => run(async () => {
    setFile(f); setEntries([])
    const u8 = new Uint8Array(await f.arrayBuffer())
    const ext = extOf(f.name)
    const str4 = String.fromCharCode(...u8.slice(0, 4))
    const list: Entry[] = []
    const push = async (label: string, c: HTMLCanvasElement, hotspot?: [number, number]) => { const blob = await toPng(c); list.push({ label, w: c.width, h: c.height, url: URL.createObjectURL(blob), blob, hotspot }) }
    if (str4 === 'icns') { for (const e of await decodeICNS(u8)) await push(e.type, rgbaToCanvas(e.image)) }
    else if (str4 === 'RIFF') {
      const ani = parseAniFile(u8)
      for (let i = 0; i < ani.frames.length; i++) { const es = await decodeICO(ani.frames[i]); const best = es.sort((a, b) => b.width - a.width)[0]; if (best) await push(`Frame ${i + 1}`, rgbaToCanvas(best.image), best.hotspot) }
    } else if (u8[0] === 0 && u8[1] === 0 && (u8[2] === 1 || u8[2] === 2)) {
      for (const e of await decodeICO(u8)) await push(`${e.width}×${e.height} · ${e.png ? 'PNG' : e.bpp + '-bit'}`, rgbaToCanvas(e.image), e.hotspot)
    } else throw new Error(`This does not look like an ICO, CUR, ANI or ICNS file${ext ? ` (.${ext})` : ''}.`)
    if (!list.length) throw new Error('No images found inside this icon.')
    setEntries(list)
  })
  if (!file) return <Dropzone accept=".ico,.cur,.ani,.icns" onFiles={(f) => open(f[0])} label="Drop an ICO, CUR, ANI or ICNS file" sub="See every size inside and save them as PNG" />
  return (
    <div className="space-y-4">
      <FileChip file={file} onRemove={() => { setFile(null); setEntries([]) }} />
      <ErrorNote error={error} />
      {busy && <Progress value={0.5} label="Reading icon" />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {entries.map((e, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="checker grid aspect-square place-items-center p-2"><img src={e.url} alt={e.label} className="max-h-full max-w-full [image-rendering:pixelated]" style={{ width: Math.min(128, e.w * (e.w < 64 ? 2 : 1)) }} /></div>
            <div className="flex items-center justify-between gap-1 border-t border-border px-2 py-1.5 text-[11px]">
              <span className="truncate" title={e.label}>{e.label}{e.hotspot ? ` · hotspot ${e.hotspot.join(',')}` : ''}</span>
              <button onClick={() => downloadBlob(e.blob, `${baseName(file.name)}-${e.w}x${e.h}-${i + 1}.png`)} className="rounded p-1 text-muted hover:text-fg cursor-pointer" aria-label={`Download ${e.label}`}><Download className="size-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
      {entries.length > 1 && <Button icon={<Package className="size-4" />} onClick={async () => downloadBlob(await zipFiles(entries.map((e, i) => ({ name: `${baseName(file.name)}-${e.w}x${e.h}-${i + 1}.png`, data: e.blob }))), `${baseName(file.name)}-png.zip`)}>Download all as ZIP</Button>}
    </div>
  )
}

function Create() {
  const [files, setFiles] = useState<File[]>([])
  const [srcs, setSrcs] = useState<HTMLCanvasElement[]>([])
  const [preview, setPreview] = useState<string[]>([])
  const [kind, setKind] = useState<Build>('ico')
  const [sizes, setSizes] = useState<number[]>([16, 32, 48, 256])
  const [pad, setPad] = useState(0)
  const [hx, setHx] = useState(0); const [hy, setHy] = useState(0)
  const [curSize, setCurSize] = useState(32)
  const [fps, setFps] = useState(10)
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null)
  const { busy, error, run } = useJob()

  const add = (fs: File[]) => run(async () => {
    const cs: HTMLCanvasElement[] = []
    for (const f of fs) cs.push((await decodeAny(f)).canvas)
    setFiles((a) => [...a, ...fs]); setSrcs((a) => [...a, ...cs]); setPreview((a) => [...a, ...cs.map((c) => c.toDataURL())]); setResult(null)
  })

  const build = () => run(async () => {
    if (!srcs.length) return
    const name = baseName(files[0].name)
    let data: Uint8Array
    if (kind === 'ico') {
      if (!sizes.length) throw new Error('Pick at least one size.')
      const imgs = []
      for (const s of [...sizes].sort((a, b) => a - b)) { const src = srcs.find((c) => c.width === s && c.height === s) ?? srcs[0]; imgs.push({ width: s, height: s, png: await pngBytes(square(src, s, pad)) }) }
      data = buildIcoFile(imgs, 1)
    } else if (kind === 'cur') {
      const k = curSize / 32
      data = buildIcoFile([{ width: curSize, height: curSize, png: await pngBytes(square(srcs[0], curSize, pad)), hotspot: [Math.round(hx * k), Math.round(hy * k)] }], 2)
    } else if (kind === 'icns') {
      const chunks = []
      for (const t of ICNS_TYPES) chunks.push({ type: t.type, png: await pngBytes(square(srcs[0], t.px, pad)) })
      data = buildIcnsFile(chunks)
    } else {
      const k = curSize / 32
      const frames = []
      for (const src of srcs) frames.push(buildIcoFile([{ width: curSize, height: curSize, png: await pngBytes(square(src, curSize, pad)), hotspot: [Math.round(hx * k), Math.round(hy * k)] }], 2))
      data = buildAniFile(frames, 60 / fps, curSize)
    }
    setResult({ blob: new Blob([data as BlobPart], { type: 'application/octet-stream' }), name: `${name}.${kind}` })
  })

  if (!srcs.length) return <Dropzone multiple accept="image/*,.svg,.tif,.tiff,.jxl,.qoi,.psd,.heic" onFiles={add} label="Drop an image to turn into an icon" sub="PNG, SVG, JPG, WEBP and more. For an animated cursor, drop several frames in order." />
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <div className="flex flex-wrap gap-3">
            {preview.map((p, i) => <div key={i} className="checker grid size-28 place-items-center rounded-xl border border-border p-2"><img src={p} alt="" className="max-h-full max-w-full" /></div>)}
          </div>
          <Dropzone compact multiple accept="image/*,.svg" onFiles={add} label="Add images (extra sizes or cursor frames)" />
          {kind === 'ico' && <p className="text-xs text-muted">Tip: if you add images that are exactly 16×16 or 32×32, they are used for those sizes instead of a scaled copy.</p>}
        </>}
        side={<>
          <Field label="Create"><Segmented value={kind} onChange={(v) => { setKind(v); setResult(null) }} options={[{ value: 'ico', label: 'ICO' }, { value: 'icns', label: 'ICNS' }, { value: 'cur', label: 'CUR' }, { value: 'ani', label: 'ANI' }]} /></Field>
          {kind === 'ico' && <div>
            <Label hint={`${sizes.length} sizes`}>Sizes</Label>
            <div className="flex flex-wrap gap-1.5">{ICO_SIZES.map((s) => <button key={s} onClick={() => setSizes((a) => a.includes(s) ? a.filter((x) => x !== s) : [...a, s])} className={cn('rounded-lg border px-2.5 py-1 font-mono text-xs cursor-pointer', sizes.includes(s) ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted')}>{s}</button>)}</div>
          </div>}
          {kind === 'icns' && <p className="text-xs text-muted">Includes every macOS size from 16 px to 1024 px (512@2x). Use a 1024 px source for the sharpest result.</p>}
          {(kind === 'cur' || kind === 'ani') && <>
            <Field label="Cursor size"><Segmented value={String(curSize)} onChange={(v) => setCurSize(Number(v))} options={['32', '48', '64', '128']} /></Field>
            <div className="flex gap-2"><Field label="Hotspot X (of 32)" className="flex-1"><Input type="number" min={0} max={31} value={hx} onChange={(e) => setHx(Number(e.target.value))} /></Field><Field label="Hotspot Y" className="flex-1"><Input type="number" min={0} max={31} value={hy} onChange={(e) => setHy(Number(e.target.value))} /></Field></div>
          </>}
          {kind === 'ani' && <Slider label="Frame rate" value={fps} onChange={setFps} min={1} max={30} suffix=" fps" />}
          <Slider label="Padding" value={pad} onChange={setPad} min={0} max={30} suffix="%" />
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} icon={<Wand2 className="size-4" />} onClick={build}>Create {kind.toUpperCase()}</Button>
          <Button variant="ghost" className="w-full" onClick={() => { setFiles([]); setSrcs([]); setPreview([]); setResult(null) }}>Start over</Button>
        </>}
      />
      {result && <ResultCard blob={result.blob} filename={result.name} title={`Your ${kind.toUpperCase()} is ready (${formatBytes(result.blob.size)})`} />}
    </div>
  )
}

export default function IconConverter() {
  const [tab, setTab] = useState<'create' | 'extract'>('create')
  return (
    <div className="space-y-5">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'create', label: 'Image to icon' }, { value: 'extract', label: 'Icon to PNG' }]} />
      {tab === 'create' ? <Create /> : <Extract />}
    </div>
  )
}
