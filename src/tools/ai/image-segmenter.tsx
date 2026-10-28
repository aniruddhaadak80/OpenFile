import { useEffect, useRef, useState } from 'react'
import { Shapes } from 'lucide-react'
import { Button, Dropzone, Label, Slider, ToolGrid, Segmented } from '@/components/ui'
import { baseName, canvasToBlob, loadImage } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { VMODELS } from '@/lib/bcat/vision'
import { useVision, EnginePanel, VisionProgress } from '@/lib/bcat/aiui'
import { kmeans, colorName } from '@/lib/bcat/quick'
import { imagePixels, DlButton, Pill, pal, hexRgb } from '@/lib/bcat/kit'

interface Seg { label: string; width: number; height: number; mask: Uint8Array; share: number }

export default function ImageSegmenter() {
  const [file, setFile] = useState<File | null>(null)
  const [segs, setSegs] = useState<Seg[] | null>(null)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [opacity, setOpacity] = useState(55)
  const [regions, setRegions] = useState(5)
  const [view, setView] = useState<'overlay' | 'cutout'>('overlay')
  const cv = useRef<HTMLCanvasElement>(null)
  const ai = useVision(VMODELS.segment, { quick: true })

  const go = () => ai.run(async () => {
    let out: Seg[]
    if (ai.engine === 'quick') {
      ai.setStatus('Grouping colours')
      const px = await imagePixels(file!, 320)
      const { centers, labels } = kmeans(px.data, regions, 10)
      out = centers.map((c, k) => { const mask = new Uint8Array(labels.length); let n = 0; labels.forEach((l, i) => { if (l === k) { mask[i] = 255; n++ } }); return { label: `${colorName(c)} area ${k + 1}`, width: px.w, height: px.h, mask, share: n / labels.length } })
    } else {
      const r = await ai.infer<Omit<Seg, 'share'>[]>(file, { maxSide: 640 })
      out = r.map((s) => ({ ...s, share: s.mask.reduce((a, v) => a + (v > 127 ? 1 : 0), 0) / s.mask.length }))
    }
    out.sort((a, b) => b.share - a.share)
    setSegs(out); setSel(new Set([0]))
  })

  const render = async (maxSide: number, mode: 'overlay' | 'cutout' | 'mask') => {
    const img = await loadImage(file!)
    const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s)
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const ctx = c.getContext('2d')!
    const m = document.createElement('canvas'); m.width = segs![0].width; m.height = segs![0].height
    const mc = m.getContext('2d')!, md = mc.createImageData(m.width, m.height)
    segs!.forEach((sg, k) => {
      const on = sel.has(k); if (mode !== 'overlay' && !on) return
      const [r, g, b] = hexRgb(pal(k))
      for (let i = 0; i < sg.mask.length; i++) if (sg.mask[i] > 127) { md.data[i * 4] = mode === 'overlay' ? r : 255; md.data[i * 4 + 1] = mode === 'overlay' ? g : 255; md.data[i * 4 + 2] = mode === 'overlay' ? b : 255; md.data[i * 4 + 3] = mode === 'overlay' ? (on ? 255 : 90) : 255 }
    })
    mc.putImageData(md, 0, 0)
    if (mode === 'overlay') { ctx.drawImage(img, 0, 0, w, h); ctx.globalAlpha = opacity / 100; ctx.drawImage(m, 0, 0, w, h); ctx.globalAlpha = 1 }
    else if (mode === 'mask') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); ctx.drawImage(m, 0, 0, w, h) }
    else { ctx.drawImage(img, 0, 0, w, h); ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(m, 0, 0, w, h) }
    return c
  }

  useEffect(() => {
    if (!segs || !cv.current) return
    let alive = true
    render(1100, view).then((c) => { if (!alive || !cv.current) return; cv.current.width = c.width; cv.current.height = c.height; cv.current.getContext('2d')!.drawImage(c, 0, 0) })
    return () => { alive = false }
  }, [segs, sel, opacity, view])

  if (!file) return <Dropzone accept="image/*" onFiles={(f) => { setFile(f[0]); setSegs(null) }} label="Drop a photo to split into regions" sub="Sky, people, buildings, trees, roads and 145 more scene parts. Runs on your device." />
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <TopBar file={file} onReset={() => { ai.cancel(); setFile(null); setSegs(null) }} />
          {segs ? (
            <>
              <Segmented value={view} onChange={setView} options={[{ value: 'overlay', label: 'Overlay' }, { value: 'cutout', label: 'Cut out selected' }]} />
              <canvas ref={cv} className="w-full rounded-2xl border border-border checker" aria-label="Segmentation result" />
            </>
          ) : <ImgPreview file={file} />}
        </div>
      }
      side={
        <>
          <EnginePanel ai={ai} quickLabel="Colour regions" quickNote="Colour regions groups pixels by colour with k-means. Instant and no download, but it does not know what things are." />
          {ai.engine === 'quick' && <Slider label="Regions" value={regions} onChange={setRegions} min={2} max={10} />}
          <VisionProgress ai={ai} />
          <Button className="w-full" icon={<Shapes className="size-4" />} loading={ai.busy} onClick={go}>{segs ? 'Run again' : 'Find regions'}</Button>
          {segs && (
            <>
              <div><Label>Regions (tap to select)</Label>
                <div className="flex max-h-56 flex-wrap gap-1.5 overflow-auto">{segs.map((s, k) => <Pill key={k} color={pal(k)} active={sel.has(k)} onClick={() => setSel((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n })}>{s.label} {Math.round(s.share * 100)}%</Pill>)}</div>
              </div>
              {view === 'overlay' && <Slider label="Overlay strength" value={opacity} onChange={setOpacity} min={10} max={100} suffix="%" />}
              <div className="flex flex-wrap gap-2">
                <DlButton variant="primary" disabled={!sel.size} name={baseName(file.name) + '-cutout.png'} data={async () => canvasToBlob(await render(4000, 'cutout'), 'image/png')}>Cutout PNG</DlButton>
                <DlButton disabled={!sel.size} name={baseName(file.name) + '-mask.png'} data={async () => canvasToBlob(await render(4000, 'mask'), 'image/png')}>Mask PNG</DlButton>
                <DlButton name={baseName(file.name) + '-overlay.png'} data={async () => canvasToBlob(await render(4000, 'overlay'), 'image/png')}>Overlay PNG</DlButton>
              </div>
            </>
          )}
        </>
      }
    />
  )
}

function ImgPreview({ file }: { file: File }) {
  const [u, setU] = useState<string | null>(null)
  useEffect(() => { const x = URL.createObjectURL(file); setU(x); return () => URL.revokeObjectURL(x) }, [file])
  return u ? <img src={u} alt="Your photo" className="w-full rounded-2xl border border-border" /> : null
}
