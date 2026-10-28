/* Shared layout for single-image effect tools: drop, live preview (downscaled), full-size export. */
import React, { useEffect, useRef, useState } from 'react'
import { Download, Eye } from 'lucide-react'
import { Button, Field, Segmented, Slider, ToolGrid, ErrorNote, FileChip, useJob } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { ImageDrop, useDebounced } from '../_img/kit'
import { decodeAny, encodeCanvas, type OutFmt } from '@/lib/b2/codecs'

/** k = rendered width / full-size width (1 for the final export, smaller for the live preview). */
export type Render = (src: HTMLCanvasElement, preview: boolean, k: number) => HTMLCanvasElement | Promise<HTMLCanvasElement>

export function scaled(src: HTMLCanvasElement, max: number) {
  const k = Math.min(1, max / Math.max(src.width, src.height))
  if (k === 1) return src
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(src.width * k)); c.height = Math.max(1, Math.round(src.height * k))
  const ctx = c.getContext('2d')!; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, c.width, c.height)
  return c
}

export function EffectShell({ render, deps, controls, suffix, defaultFmt = 'png', label, previewMax = 900, compare = true }: { render: Render; deps: unknown[]; controls: React.ReactNode; suffix: string; defaultFmt?: OutFmt; label?: string; previewMax?: number; compare?: boolean }) {
  const [file, setFile] = useState<File | null>(null)
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null)
  const [small, setSmall] = useState<HTMLCanvasElement | null>(null)
  const [fmt, setFmt] = useState<OutFmt>(defaultFmt)
  const [quality, setQuality] = useState(90)
  const [hold, setHold] = useState(false)
  const [perr, setPerr] = useState<string | null>(null)
  const view = useRef<HTMLCanvasElement>(null)
  const { busy, error, run } = useJob()
  const d = useDebounced(deps, 60)

  const open = (fs: File[]) => run(async () => {
    const { canvas } = await decodeAny(fs[0])
    setFile(fs[0]); setSrc(canvas); setSmall(scaled(canvas, previewMax))
  })
  useEffect(() => {
    if (!small || !view.current) return
    let dead = false
    ;(async () => {
      try {
        const out = hold ? small : await render(small, true, small.width / (src?.width || small.width))
        if (dead || !view.current) return
        const v = view.current; v.width = out.width; v.height = out.height
        const ctx = v.getContext('2d')!; ctx.clearRect(0, 0, v.width, v.height); ctx.drawImage(out, 0, 0); setPerr(null)
      } catch (e: any) { setPerr(e?.message || String(e)) }
    })()
    return () => { dead = true }
  }, [small, hold, ...d])

  const save = () => run(async () => {
    if (!src || !file) return
    const out = await render(src, false, 1)
    downloadBlob(await encodeCanvas(out, fmt, { quality }), `${file.name.replace(/\.[^.]+$/, '')}-${suffix}.${fmt}`)
  })

  if (!src || !file) return <div className="space-y-3"><ImageDrop multiple={false} onFiles={open} label={label} accept="image/*,.tif,.tiff,.jxl,.qoi,.psd,.heic,.tga" /><ErrorNote error={error} /></div>
  return (
    <ToolGrid
      main={<>
        <div className="checker relative grid min-h-64 place-items-center overflow-hidden rounded-2xl border border-border p-2">
          <canvas ref={view} className="max-h-[70vh] max-w-full" style={{ height: 'auto' }} />
          {compare && <button type="button" onPointerDown={() => setHold(true)} onPointerUp={() => setHold(false)} onPointerLeave={() => setHold(false)} onKeyDown={(e) => e.key === ' ' && setHold(true)} onKeyUp={() => setHold(false)} className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-[11px] text-white cursor-pointer select-none"><Eye className="size-3.5" />Hold to see original</button>}
        </div>
        <FileChip file={file} onRemove={() => { setFile(null); setSrc(null) }} extra={<span className="text-xs text-muted">{src.width}×{src.height}</span>} />
      </>}
      side={<>
        {controls}
        <Field label="Save as"><Segmented value={fmt} onChange={setFmt} options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WEBP' }]} /></Field>
        {fmt !== 'png' && <Slider label="Quality" value={quality} onChange={setQuality} min={40} max={100} suffix="%" />}
        <ErrorNote error={error || perr} />
        <Button size="lg" className="w-full" loading={busy} icon={<Download className="size-4" />} onClick={save}>Download full size</Button>
        <Button variant="ghost" className="w-full" onClick={() => { setFile(null); setSrc(null) }}>Start over</Button>
      </>}
    />
  )
}
