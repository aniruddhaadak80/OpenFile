import { useCallback, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Grid3x3, Download, Package } from 'lucide-react'
import { Button, ErrorNote, Field, Input, Label, Progress, Segmented, Switch, ToolGrid, cn, useJob } from '@/components/ui'
import { downloadBlob, zipFiles, baseName, formatBytes } from '@/lib/files'
import { ImageDrop, canvas, decode, exportCanvas } from './_img/kit'
import { safeBlobUrl } from '../../lib/safe'

const PRESETS: { label: string; r: number; c: number; crop?: number }[] = [
  ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ label: `1×${n}`, r: 1, c: n })),
  { label: '3×3 grid', r: 3, c: 3 }, { label: '2×2', r: 2, c: 2 }, { label: '3×2', r: 2, c: 3 },
]
type Tile = { name: string; blob: Blob; url: string; r: number; c: number }

export default function ImageSplitter() {
  const [file, setFile] = useState<File | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [rows, setRows] = useState(1)
  const [cols, setCols] = useState(3)
  const [crop, setCrop] = useState<'none' | '1:1' | '4:5'>('none')
  const [igOrder, setIgOrder] = useState(false)
  const [fmt, setFmt] = useState<'png' | 'jpg' | 'webp'>('jpg')
  const [tiles, setTiles] = useState<Tile[] | null>(null)
  const { busy, progress, error, run } = useJob()

  const onFiles = useCallback(async (f: File[]) => { const im = await decode(f[0]); setFile(f[0]); setImg(im); setUrl(URL.createObjectURL(f[0])); setTiles(null); setFmt(f[0].type === 'image/png' ? 'png' : 'jpg') }, [])
  const W = img?.naturalWidth ?? 1, H = img?.naturalHeight ?? 1
  // crop region (centered) so every tile has the requested aspect
  const area = useMemo(() => {
    if (crop === 'none') return { x: 0, y: 0, w: W, h: H }
    const a = crop === '1:1' ? 1 : 4 / 5
    const target = (cols * a) / rows
    let w = W, h = H
    if (W / H > target) w = H * target; else h = W / target
    return { x: (W - w) / 2, y: (H - h) / 2, w, h }
  }, [crop, rows, cols, W, H])
  const tw = Math.floor(area.w / cols), th = Math.floor(area.h / rows)
  const set = (r: number, c: number) => { setRows(Math.max(1, Math.min(20, r))); setCols(Math.max(1, Math.min(20, c))); setTiles(null) }

  const split = () => run(async (setP) => {
    if (!img || !file) return
    if (tw < 1 || th < 1) throw new Error('Too many tiles for this image size.')
    const out: Tile[] = []
    const n = rows * cols
    const pad = String(n).length
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const { canvas: t, ctx } = canvas(tw, th)
      ctx.drawImage(img, area.x + c * tw, area.y + r * th, tw, th, 0, 0, tw, th)
      const blob = await exportCanvas(t, fmt, 0.93)
      const seq = r * cols + c + 1
      const num = igOrder ? n - seq + 1 : seq
      out.push({ name: `${baseName(file.name)}_${String(num).padStart(pad, '0')}${igOrder ? '' : `_r${r + 1}c${c + 1}`}.${fmt}`, blob, url: URL.createObjectURL(blob), r, c })
      setP(out.length / n)
    }
    setTiles(out)
  })
  const zip = async () => { if (tiles) downloadBlob(await zipFiles(tiles.map((t) => ({ name: t.name, data: t.blob }))), `${baseName(file!.name)}-tiles.zip`) }
  const reset = () => { setFile(null); setImg(null); setTiles(null) }

  if (!file || !img || !url) return <ImageDrop multiple={false} onFiles={onFiles} label="Drop an image to split into tiles" sub="Perfect for Instagram carousels & grid posts." />

  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="relative mx-auto w-fit overflow-hidden rounded-xl">
              <img src={url} alt="" className="block max-h-[62vh] max-w-full" />
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute border-2 border-white/90" style={{ left: `${(area.x / W) * 100}%`, top: `${(area.y / H) * 100}%`, width: `${(area.w / W) * 100}%`, height: `${(area.h / H) * 100}%`, boxShadow: crop !== 'none' ? '0 0 0 9999px rgba(0,0,0,.55)' : undefined }}>
                  <div className="grid size-full" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
                    {Array.from({ length: rows * cols }).map((_, i) => <div key={i} className="grid place-items-center border border-white/80 shadow-[inset_0_0_0_1px_rgba(0,0,0,.25)]"><span className="rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-bold text-white">{igOrder ? rows * cols - i : i + 1}</span></div>)}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-2 text-center font-mono text-xs text-muted">{rows * cols} tiles · each {tw}×{th}px</div>
          </div>
          {tiles && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-success/30 bg-success/5 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">{tiles.length} tiles ready <span className="text-sm font-normal text-muted">· {formatBytes(tiles.reduce((a, t) => a + t.blob.size, 0))}</span></div>
                <div className="flex gap-2"><Button variant="ghost" onClick={reset}>Start over</Button><Button icon={<Package className="size-4" />} onClick={zip}>Download ZIP</Button></div>
              </div>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(cols, 10)}, minmax(0, 1fr))` }}>
                {tiles.map((t) => <button key={t.name} onClick={() => downloadBlob(t.blob, t.name)} title={`Download ${t.name}`} className="group relative overflow-hidden rounded-md cursor-pointer"><img src={safeBlobUrl(t.url)} alt="" className="w-full" /><span className="absolute inset-0 grid place-items-center bg-black/50 text-white opacity-0 transition group-hover:opacity-100"><Download className="size-4" /></span></button>)}
              </div>
            </motion.div>
          )}
        </>}
        side={<>
          <div>
            <Label>Instagram & quick presets</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {PRESETS.map((p) => <button key={p.label} onClick={() => set(p.r, p.c)} className={cn('rounded-lg border px-1.5 py-1.5 text-xs font-medium cursor-pointer', rows === p.r && cols === p.c ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:border-accent/50')}>{p.label}</button>)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Rows"><Input type="number" min={1} max={20} value={rows} onChange={(e) => set(Number(e.target.value) || 1, cols)} /></Field>
            <Field label="Columns"><Input type="number" min={1} max={20} value={cols} onChange={(e) => set(rows, Number(e.target.value) || 1)} /></Field>
          </div>
          <div>
            <Label>Tile shape</Label>
            <Segmented value={crop} onChange={(v) => { setCrop(v); setTiles(null) }} options={[{ value: 'none', label: 'Keep image' }, { value: '1:1', label: 'Square 1:1' }, { value: '4:5', label: 'Portrait 4:5' }]} />
            <p className="mt-1.5 text-[11px] text-muted">Instagram carousels need every slide the same shape: 1:1 or 4:5 crops the center.</p>
          </div>
          <Switch checked={igOrder} onChange={(v) => { setIgOrder(v); setTiles(null) }} label="Number in Instagram posting order" />
          {igOrder && <p className="-mt-3 text-[11px] text-muted">Post tile 1 first, the grid assembles correctly on your profile.</p>}
          <div><Label>Format</Label><Segmented value={fmt} onChange={(v) => { setFmt(v); setTiles(null) }} options={[{ value: 'jpg', label: 'JPG' }, { value: 'png', label: 'PNG' }, { value: 'webp', label: 'WEBP' }]} /></div>
          {busy && <Progress value={progress} label="Slicing" />}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} icon={<Grid3x3 className="size-4" />} onClick={split}>Split into {rows * cols} tiles</Button>
          <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
        </>}
      />
    </div>
  )
}
