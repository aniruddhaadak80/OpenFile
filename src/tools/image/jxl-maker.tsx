import { useState } from 'react'
import { FileImage } from 'lucide-react'
import { Button, Label, Slider, Switch, ToolGrid, Progress, Segmented } from '@/components/ui'
import { toast } from '@/components/toast'
import { baseName } from '@/lib/files'
import { blobToRGBA } from '@/lib/b3/anim'
import { BatchResults, ImageDrop, ThumbGrid, useImageList, type Result } from './_img/kit'
import { Note } from '@/tools/video/_media/ui'

async function encodeJxl(id: ImageData, o: { quality: number; lossless: boolean; effort: number; progressive: boolean }) {
  const { default: encode } = await import('@jsquash/jxl/encode')
  return new Uint8Array(await encode(id, { quality: o.quality, lossless: o.lossless, effort: o.effort, progressive: o.progressive }))
}

export default function JxlMaker() {
  const { items, add, remove, clear } = useImageList()
  const [quality, setQuality] = useState(85)
  const [lossless, setLossless] = useState(false)
  const [effort, setEffort] = useState('7')
  const [progressive, setProgressive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)
  const [results, setResults] = useState<Result[]>([])
  const run = async () => {
    setBusy(true); setResults([]); setDone(0)
    const out: Result[] = []
    try {
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        const { rgba, width, height } = await blobToRGBA(it.file)
        const jxl = await encodeJxl(new ImageData(new Uint8ClampedArray(rgba), width, height), { quality, lossless, effort: +effort, progressive })
        out.push({ id: it.id, name: `${baseName(it.file.name)}.jxl`, blob: new Blob([jxl as BlobPart], { type: 'image/jxl' }), originalSize: it.file.size, note: `${width}×${height}` })
        setDone(i + 1); setResults([...out])
        await new Promise((r) => setTimeout(r, 0))
      }
    } catch (e: any) { toast(e?.message || 'Encoding failed', 'error') } finally { setBusy(false) }
  }
  const reset = () => { clear(); setResults([]) }
  if (!items.length) return <ImageDrop onFiles={add} label="Drop images to convert to JPEG XL" sub="JPG, PNG, WEBP, AVIF and more. Encoded with libjxl on your device." />
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<ThumbGrid items={items} onRemove={remove} onAdd={add} />}
        side={<>
          <Switch checked={lossless} onChange={setLossless} label="Lossless (pixel perfect)" />
          {!lossless && <Slider label="Quality" value={quality} onChange={setQuality} min={1} max={100} />}
          <div><Label hint="higher is smaller but slower">Effort</Label><Segmented value={effort} onChange={setEffort} options={['3', '5', '7', '9'].map((v) => ({ value: v, label: v }))} /></div>
          <Switch checked={progressive} onChange={setProgressive} label="Progressive (loads in passes)" />
          <Button size="lg" className="w-full" icon={<FileImage className="size-5" />} onClick={run} loading={busy}>Convert {items.length} image{items.length > 1 ? 's' : ''}</Button>
          {busy && <Progress value={done / items.length} label={`${done} of ${items.length}`} />}
          <Note>JPEG XL is supported by Safari, Photoshop, GIMP and many viewers. Chrome and Firefox need a flag or an extension. Animated JPEG XL is not available here; use APNG or WebP for animation.</Note>
        </>}
      />
      {results.length > 0 && <BatchResults results={results} zipName="jpeg-xl.zip" onReset={reset} title="JPEG XL files ready" />}
    </div>
  )
}
