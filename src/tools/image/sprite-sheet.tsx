import { useEffect, useMemo, useState } from 'react'
import { Download, LayoutGrid } from 'lucide-react'
import { Button, CopyButton, Dropzone, Input, Label, Segmented, Slider, Switch, Tabs, ToolGrid, ErrorNote } from '@/components/ui'
import { toast } from '@/components/toast'
import { baseName, downloadBlob, zipFiles } from '@/lib/files'
import { type Anim, ANIM_OR_VIDEO_ACCEPT, blobToRGBA, decodeAnim, encodePngFrame, fitAnim, frameToCanvas, resizeAnim } from '@/lib/b3/anim'
import { buildSheet, cutSheet, sheetCss, sheetJson } from '@/lib/b3/sprite'
import { AnimPlayer, AnimStats, ExportPanel, Loading } from './_b3/anim-ui'

export default function SpriteSheet() {
  const [tab, setTab] = useState<'make' | 'cut'>('make')
  return (
    <div className="space-y-4">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'make', label: 'Make a sprite sheet' }, { value: 'cut', label: 'Cut a sheet into frames' }]} />
      {tab === 'make' ? <Make /> : <Cut />}
    </div>
  )
}

function Make() {
  const [name, setName] = useState('sprite')
  const [anim, setAnim] = useState<Anim | null>(null)
  const [loading, setLoading] = useState(0)
  const [cols, setCols] = useState(8)
  const [pad, setPad] = useState(0)
  const [scale, setScale] = useState(100)
  const [view, setView] = useState<'css' | 'json'>('css')
  const open = async (files: File[]) => {
    setLoading(0.01)
    try {
      if (files.length === 1) { const a = await decodeAnim(files[0], { onProgress: setLoading, video: { fps: 12, width: 256, duration: 5 } }); setAnim(a); setCols(Math.min(8, a.frames.length)) }
      else {
        const sorted = files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        const first = await blobToRGBA(sorted[0])
        const frames = []
        for (let i = 0; i < sorted.length; i++) {
          const im = i === 0 ? first : await blobToRGBA(sorted[i])
          frames.push(fitAnim({ width: im.width, height: im.height, frames: [{ rgba: im.rgba, delay: 100 }], loop: 0 }, first.width, first.height, 'contain').frames[0])
          setLoading((i + 1) / sorted.length)
        }
        setAnim({ width: first.width, height: first.height, frames, loop: 0 }); setCols(Math.min(8, frames.length))
      }
      setName(baseName(files[0].name).replace(/[^a-z0-9_-]/gi, '-').slice(0, 40) || 'sprite')
    } catch (e: any) { toast(e?.message || 'Could not read the file', 'error') } finally { setLoading(0) }
  }
  const scaled = useMemo(() => (anim && scale !== 100 ? resizeAnim(anim, Math.round(anim.width * scale / 100), Math.round(anim.height * scale / 100), scale > 100 ? false : true) : anim), [anim, scale])
  const sheet = useMemo(() => (scaled ? buildSheet(scaled, cols, pad) : null), [scaled, cols, pad])
  const sheetUrl = useMemo(() => (sheet ? frameToCanvas(sheet.rgba, sheet.layout.width, sheet.layout.height).toDataURL('image/png') : ''), [sheet])
  const file = `${name}.png`
  const css = scaled && sheet ? sheetCss(name, scaled, sheet.layout, file) : ''
  const json = scaled && sheet ? JSON.stringify(sheetJson(name, scaled, sheet.layout, file), null, 2) : ''
  const download = async () => {
    if (!sheet) return
    const png = encodePngFrame(sheet.rgba, sheet.layout.width, sheet.layout.height)
    downloadBlob(await zipFiles([{ name: file, data: png }, { name: `${name}.css`, data: css }, { name: `${name}.json`, data: json }]), `${name}-spritesheet.zip`)
  }
  if (!anim && !loading) return <Dropzone multiple accept={ANIM_OR_VIDEO_ACCEPT + ',image/*'} onFiles={open} label="Drop a GIF, APNG, WebP, short video, or several images" sub="Frames are laid out in a grid with CSS animation and engine JSON." />
  if (loading) return <Loading progress={loading} />
  if (!scaled || !sheet) return null
  return (
    <ToolGrid
      main={<>
        <div className="checker overflow-auto rounded-2xl border border-border p-2"><img src={sheetUrl} alt="Sprite sheet" className="mx-auto max-h-[55vh] [image-rendering:pixelated]" /></div>
        <p className="text-center font-mono text-xs text-muted">{sheet.layout.width}×{sheet.layout.height} · {sheet.layout.cols}×{sheet.layout.rows} grid · frame {scaled.width}×{scaled.height}</p>
        <div className="flex items-center gap-2"><Segmented value={view} onChange={setView} options={[{ value: 'css', label: 'CSS' }, { value: 'json', label: 'JSON (Phaser, Pixi)' }]} /><div className="ml-auto"><CopyButton text={view === 'css' ? css : json} /></div></div>
        <pre className="max-h-64 overflow-auto rounded-xl border border-border bg-surface-2/40 p-3 font-mono text-[11px] scrollbar-thin">{view === 'css' ? css : json}</pre>
      </>}
      side={<>
        <div className="w-32"><AnimPlayer anim={scaled} showControls={false} maxH="128px" /></div>
        <label className="block"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value.replace(/[^a-z0-9_-]/gi, '-'))} /></label>
        <Slider label="Columns" value={cols} onChange={setCols} min={1} max={Math.max(1, scaled.frames.length)} />
        <Slider label="Padding" value={pad} onChange={setPad} min={0} max={16} suffix="px" />
        <Slider label="Scale" value={scale} onChange={setScale} min={25} max={400} step={25} suffix="%" />
        <Button size="lg" className="w-full" icon={<Download className="size-5" />} onClick={download}>Download PNG + CSS + JSON</Button>
        <Button variant="ghost" size="sm" onClick={() => setAnim(null)}>Start over</Button>
      </>}
    />
  )
}

function Cut() {
  const [file, setFile] = useState<File | null>(null)
  const [img, setImg] = useState<{ rgba: Uint8ClampedArray; width: number; height: number } | null>(null)
  const [cols, setCols] = useState(4), [rows, setRows] = useState(4)
  const [pad, setPad] = useState(0), [margin, setMargin] = useState(0)
  const [count, setCount] = useState(0)
  const [delay, setDelay] = useState(100)
  const [skip, setSkip] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (!file) return; blobToRGBA(file).then(setImg).catch((e) => setError(e?.message || 'Could not read the image')) }, [file])
  const anim = useMemo(() => {
    if (!img) return null
    try { setError(null); return cutSheet(img.rgba, img.width, img.height, cols, rows, { pad, marginX: margin, marginY: margin, count: count || undefined, delay, skipEmpty: skip }) } catch (e: any) { setError(e?.message); return null }
  }, [img, cols, rows, pad, margin, count, delay, skip])
  const url = useMemo(() => (img ? frameToCanvas(img.rgba, img.width, img.height).toDataURL() : ''), [img])
  if (!file) return <Dropzone accept="image/*" onFiles={(f) => setFile(f[0])} label="Drop a sprite sheet image" sub="Set the grid, preview the animation, export GIF, APNG, WebP or a ZIP of frames." />
  if (!img) return <ErrorNote error={error} />
  const fw = (img.width - margin * 2 - pad * (cols - 1)) / cols, fh = (img.height - margin * 2 - pad * (rows - 1)) / rows
  return (
    <ToolGrid
      main={<>
        <div className="checker relative overflow-auto rounded-2xl border border-border p-2">
          <div className="relative mx-auto w-fit">
            <img src={url} alt="Sheet" className="block max-h-[50vh] [image-rendering:pixelated]" />
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${img.width} ${img.height}`} preserveAspectRatio="none">
              {Array.from({ length: cols * rows }).map((_, i) => <rect key={i} x={margin + (i % cols) * (fw + pad)} y={margin + Math.floor(i / cols) * (fh + pad)} width={fw} height={fh} fill="none" stroke="#F5A524" strokeWidth={Math.max(1, img.width / 400)} />)}
            </svg>
          </div>
        </div>
        {anim && <><AnimPlayer anim={anim} maxH="30vh" /><AnimStats anim={anim} /></>}
        <ErrorNote error={error} />
      </>}
      side={<>
        <div className="grid grid-cols-2 gap-2"><label><Label>Columns</Label><Input type="number" min={1} value={cols} onChange={(e) => setCols(Math.max(1, +e.target.value || 1))} /></label><label><Label>Rows</Label><Input type="number" min={1} value={rows} onChange={(e) => setRows(Math.max(1, +e.target.value || 1))} /></label></div>
        <p className="font-mono text-xs text-muted">Frame size {Math.floor(fw)}×{Math.floor(fh)}</p>
        <div className="grid grid-cols-2 gap-2"><Slider label="Gap" value={pad} onChange={setPad} min={0} max={32} /><Slider label="Margin" value={margin} onChange={setMargin} min={0} max={64} /></div>
        <label className="block"><Label hint="0 = all">Frame count</Label><Input type="number" min={0} value={count} onChange={(e) => setCount(Math.max(0, +e.target.value || 0))} /></label>
        <Switch checked={skip} onChange={setSkip} label="Skip empty cells" />
        <Slider label="Frame delay" value={delay} onChange={setDelay} min={20} max={1000} step={10} suffix=" ms" />
        {anim && <Button variant="outline" className="w-full" icon={<LayoutGrid className="size-4" />} onClick={async () => downloadBlob(await zipFiles(anim.frames.map((f, i) => ({ name: `frame_${String(i + 1).padStart(3, '0')}.png`, data: encodePngFrame(f.rgba, anim.width, anim.height) }))), `${baseName(file.name)}-frames.zip`)}>Frames as ZIP</Button>}
        <ExportPanel anim={anim} name={file.name} formats={['gif', 'apng', 'webp', 'mp4']} onReset={() => { setFile(null); setImg(null) }} />
      </>}
    />
  )
}
