import { useEffect, useRef, useState } from 'react'
import { Download, Package, Play, Pause, ShieldAlert } from 'lucide-react'
import { Button, Dropzone, Label, Progress, Slider, Switch, ToolGrid, ErrorNote, cn, useJob } from '@/components/ui'
import { downloadBlob, zipFiles } from '@/lib/files'
import type { Volume } from '@/lib/b2/medical'

export default function DicomViewer() {
  const [vol, setVol] = useState<Volume | null>(null)
  const [name, setName] = useState('')
  const [z, setZ] = useState(0)
  const [center, setCenter] = useState(0)
  const [width, setWidth] = useState(1)
  const [invert, setInvert] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [hideMeta, setHideMeta] = useState(true)
  const cv = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number; c: number; w: number } | null>(null)
  const { busy, progress, error, run } = useJob()

  const open = (fs: File[]) => run(async (setP) => {
    const m = await import('@/lib/b2/medical')
    const first = fs[0], lower = first.name.toLowerCase()
    let v: Volume
    if (/\.nii(\.gz)?$/.test(lower)) v = await m.readNifti(await first.arrayBuffer())
    else if (/\.nrrd$|\.nhdr$/.test(lower)) v = await m.readNrrd(await first.arrayBuffer())
    else {
      const items: { name: string; data: ArrayBuffer }[] = []
      for (let i = 0; i < fs.length; i++) { items.push({ name: fs[i].name, data: await fs[i].arrayBuffer() }); setP((i + 1) / fs.length / 2) }
      v = await m.readDicom(items)
    }
    setVol(v); setName(fs.length > 1 ? `${fs.length} files` : first.name); setZ(Math.floor(v.depth / 2)); setCenter(v.window.center); setWidth(v.window.width); setInvert(false)
  })

  useEffect(() => {
    if (!vol || !cv.current) return
    let raf = 0
    raf = requestAnimationFrame(async () => {
      const { renderSlice } = await import('@/lib/b2/medical')
      const c = cv.current!; c.width = vol.width; c.height = vol.height
      c.getContext('2d')!.putImageData(new ImageData(renderSlice(vol, z, center, width, invert) as Uint8ClampedArray<ArrayBuffer>, vol.width, vol.height), 0, 0)
    })
    return () => cancelAnimationFrame(raf)
  }, [vol, z, center, width, invert])
  useEffect(() => { if (!playing || !vol) return; const t = setInterval(() => setZ((s) => (s + 1) % vol.depth), 80); return () => clearInterval(t) }, [playing, vol])

  const sliceBlob = async (i: number) => {
    const { renderSlice } = await import('@/lib/b2/medical')
    const c = document.createElement('canvas'); c.width = vol!.width; c.height = vol!.height
    c.getContext('2d')!.putImageData(new ImageData(renderSlice(vol!, i, center, width, invert) as Uint8ClampedArray<ArrayBuffer>, vol!.width, vol!.height), 0, 0)
    return new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))
  }
  const exportAll = () => run(async (setP) => { const files = []; for (let i = 0; i < vol!.depth; i++) { files.push({ name: `slice-${String(i + 1).padStart(4, '0')}.png`, data: await sliceBlob(i) }); setP((i + 1) / vol!.depth) } downloadBlob(await zipFiles(files), 'slices.zip') })

  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, c: center, w: width }; (e.target as Element).setPointerCapture(e.pointerId) }
  const onMove = (e: React.PointerEvent) => { const d = drag.current; if (!d || !vol) return; const k = (vol.max - vol.min) / 400; setWidth(Math.max(1, d.w + (e.clientX - d.x) * k)); setCenter(d.c + (e.clientY - d.y) * k) }
  const onKey = (e: React.KeyboardEvent) => { if (!vol) return; if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { setZ((s) => Math.min(vol.depth - 1, s + 1)); e.preventDefault() } if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { setZ((s) => Math.max(0, s - 1)); e.preventDefault() } }

  if (!vol) return <div className="space-y-3"><Dropzone multiple accept=".dcm,.dicom,.ima,.nii,.gz,.nrrd,application/dicom" onFiles={open} label="Drop DICOM files (a whole series), or a NIfTI or NRRD volume" sub="CT, MR, X-ray and ultrasound · window and level, slice scrubbing, PNG export · never uploaded" />{busy && <Progress value={progress} label="Reading images" />}<ErrorNote error={error} /><p className="flex items-start gap-2 text-xs text-muted"><ShieldAlert className="size-4 shrink-0" />For viewing and education only. Not a medical device and not for diagnosis.</p></div>
  return (
    <ToolGrid
      main={<>
        <div className="relative grid place-items-center overflow-hidden rounded-2xl border border-border bg-black p-2">
          <canvas ref={cv} tabIndex={0} onKeyDown={onKey} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} onWheel={(e) => setZ((s) => Math.max(0, Math.min(vol.depth - 1, s + (e.deltaY > 0 ? 1 : -1))))} aria-label="Image. Drag to change window and level, scroll or arrow keys to change slice." className="max-h-[68vh] max-w-full cursor-crosshair outline-none focus-visible:ring-4 focus-visible:ring-accent/30" style={{ height: 'auto', imageRendering: 'auto' }} />
          <div className="pointer-events-none absolute left-3 top-3 font-mono text-[11px] text-white/80">{vol.format} · {vol.width}×{vol.height}{vol.depth > 1 ? ` · slice ${z + 1}/${vol.depth}` : ''}</div>
          <div className="pointer-events-none absolute bottom-3 left-3 font-mono text-[11px] text-white/80">W {Math.round(width)} · L {Math.round(center)}</div>
        </div>
        {vol.depth > 1 && <div className="flex items-center gap-3"><Button size="sm" variant="outline" icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'} /><Slider className="flex-1" value={z} onChange={setZ} min={0} max={vol.depth - 1} /></div>}
      </>}
      side={<>
        <div className="text-sm font-medium truncate">{name}</div>
        <Slider label="Window width" value={Math.round(width)} onChange={setWidth} min={1} max={Math.max(2, Math.round(vol.max - vol.min) * 2)} />
        <Slider label="Window level" value={Math.round(center)} onChange={setCenter} min={Math.round(vol.min)} max={Math.round(vol.max)} />
        {vol.format === 'DICOM' && vol.min < -500 && <div><Label>CT presets</Label><div className="flex flex-wrap gap-1.5">{[{ label: 'Soft tissue', c: 40, w: 400 }, { label: 'Lung', c: -600, w: 1500 }, { label: 'Bone', c: 400, w: 1800 }, { label: 'Brain', c: 40, w: 80 }].map((p) => <button key={p.label} onClick={() => { setCenter(p.c); setWidth(p.w) }} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent cursor-pointer">{p.label}</button>)}</div></div>}
        <Button size="sm" variant="ghost" onClick={() => { setCenter(vol.window.center); setWidth(vol.window.width) }}>Reset window</Button>
        <Switch checked={invert} onChange={setInvert} label="Invert" />
        <Button className="w-full" icon={<Download className="size-4" />} onClick={async () => downloadBlob(await sliceBlob(z), `slice-${z + 1}.png`)}>Save this slice (PNG)</Button>
        {vol.depth > 1 && <Button variant="outline" className="w-full" loading={busy} icon={<Package className="size-4" />} onClick={exportAll}>Save all slices (ZIP)</Button>}
        <div>
          <Label hint={<button className="underline cursor-pointer" onClick={() => setHideMeta(!hideMeta)}>{hideMeta ? 'Show patient data' : 'Hide patient data'}</button>}>Details</Label>
          <div className="max-h-64 space-y-1 overflow-auto text-xs scrollbar-thin">{vol.meta.map(([k, v]) => <div key={k} className="flex gap-2 border-b border-border/50 py-1"><span className="w-28 shrink-0 text-muted">{k}</span><span className={cn('break-all', hideMeta && /^Patient|Birth/.test(k) && 'blur-sm select-none')}>{v}</span></div>)}</div>
        </div>
        <ErrorNote error={error} />
        <p className="text-[11px] text-muted">Exported PNGs contain only pixels, no patient data. Not for diagnosis.</p>
        <Button variant="ghost" className="w-full" onClick={() => setVol(null)}>Open other files</Button>
      </>}
    />
  )
}
