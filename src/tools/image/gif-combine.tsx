import { useState } from 'react'
import { X } from 'lucide-react'
import { Button, Label, Segmented, Slider, ToolGrid, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { type Anim, type Frame, ANIM_ACCEPT, blank, blendOnto, decodeAnim, fitAnim, frameAt, hexToRgba, totalDuration } from '@/lib/b3/anim'
import { AnimDrop, AnimPlayer, AnimStats, ColorInput, ExportPanel, Loading, usePreview, AnimCanvas } from './_b3/anim-ui'

type Layout = 'sequence' | 'h' | 'v' | 'grid'

function combine(list: Anim[], layout: Layout, cell: number, gap: number, bg: [number, number, number, number], timing: 'longest' | 'shortest'): Anim {
  if (layout === 'sequence') {
    const W = Math.max(...list.map((a) => a.width)), H = Math.max(...list.map((a) => a.height))
    const s = Math.min(1, cell / Math.max(W, H))
    const w = Math.round(W * s), h = Math.round(H * s)
    return { width: w, height: h, loop: 0, frames: list.flatMap((a) => fitAnim(a, w, h, 'contain', bg).frames) }
  }
  // scale every clip to the same tile height (or width for vertical) then lay them out on a shared timeline
  const tiles = list.map((a) => {
    const s = layout === 'v' ? cell / a.width : cell / a.height
    return fitAnim(a, Math.max(1, Math.round(a.width * s)), Math.max(1, Math.round(a.height * s)), 'stretch')
  })
  const cols = layout === 'h' ? tiles.length : layout === 'v' ? 1 : Math.ceil(Math.sqrt(tiles.length))
  const rows = Math.ceil(tiles.length / cols)
  const colW = Array.from({ length: cols }, (_, c) => Math.max(...tiles.filter((_, i) => i % cols === c).map((t) => t.width)))
  const rowH = Array.from({ length: rows }, (_, r) => Math.max(...tiles.filter((_, i) => Math.floor(i / cols) === r).map((t) => t.height)))
  const W = colW.reduce((a, b) => a + b, 0) + gap * (cols - 1), H = rowH.reduce((a, b) => a + b, 0) + gap * (rows - 1)
  const durs = tiles.map(totalDuration)
  const total = timing === 'longest' ? Math.max(...durs) : Math.min(...durs)
  // timeline: union of every clip's frame change times, capped to keep things sane
  const marks = new Set<number>([0])
  tiles.forEach((t) => { let x = 0; for (let k = 0; k < 2000 && x < total; k++) for (const f of t.frames) { marks.add(Math.round(x)); x += f.delay; if (x >= total) break } })
  const times = [...marks].filter((t) => t < total).sort((a, b) => a - b).slice(0, 600)
  const frames: Frame[] = times.map((t, k) => {
    const px = blank(W, H, bg)
    tiles.forEach((tile, i) => {
      const c = i % cols, r = Math.floor(i / cols)
      const x = colW.slice(0, c).reduce((a, b) => a + b, 0) + gap * c + Math.round((colW[c] - tile.width) / 2)
      const y = rowH.slice(0, r).reduce((a, b) => a + b, 0) + gap * r + Math.round((rowH[r] - tile.height) / 2)
      blendOnto(px, W, H, tile.frames[frameAt(tile, t)].rgba, tile.width, tile.height, x, y)
    })
    return { rgba: px, delay: Math.max(20, (times[k + 1] ?? total) - t) }
  })
  return { width: W, height: H, frames, loop: 0 }
}

export default function GifCombine() {
  const [items, setItems] = useState<{ name: string; anim: Anim }[]>([])
  const [loading, setLoading] = useState(0)
  const [layout, setLayout] = useState<Layout>('h')
  const [cell, setCell] = useState(240)
  const [gap, setGap] = useState(0)
  const [bg, setBg] = useState('#ffffff')
  const [transparent, setTransparent] = useState(false)
  const [timing, setTiming] = useState<'longest' | 'shortest'>('longest')
  const add = async (files: File[]) => {
    for (let i = 0; i < files.length; i++) {
      setLoading((i + 0.5) / files.length)
      try { const anim = await decodeAnim(files[i]); setItems((l) => [...l, { name: files[i].name, anim }]) } catch (e: any) { toast(`${files[i].name}: ${e?.message || 'could not read'}`, 'error') }
    }
    setLoading(0)
  }
  const preview = usePreview(() => (items.length ? combine(items.map((x) => x.anim), layout, cell, gap, transparent ? [0, 0, 0, 0] : hexToRgba(bg), timing) : null), [items, layout, cell, gap, bg, transparent, timing], 250)
  const reset = () => setItems([])
  if (!items.length && !loading) return <AnimDrop multiple onFiles={add} accept={ANIM_ACCEPT + ',image/jpeg'} label="Drop two or more GIFs, APNGs or WebPs to combine" sub="Side by side, stacked, in a grid, or one after another." />
  if (loading && !items.length) return <Loading progress={loading} />
  return (
    <ToolGrid
      main={<>
        <div className="flex flex-wrap gap-2">
          {items.map((it, i) => <div key={i} className="relative w-24 overflow-hidden rounded-xl border border-border checker"><AnimCanvas anim={it.anim} style={{ maxHeight: 96 }} className="mx-auto" /><button onClick={() => setItems(items.filter((_, k) => k !== i))} aria-label={`Remove ${it.name}`} className="absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white cursor-pointer"><X className="size-3" /></button><div className="truncate px-1 text-[10px] text-muted">{it.name}</div></div>)}
          <label className="grid w-24 cursor-pointer place-items-center rounded-xl border border-dashed border-border text-xs text-muted hover:border-accent hover:text-accent">Add<input type="file" multiple accept={ANIM_ACCEPT} className="sr-only" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; add(f) }} /></label>
        </div>
        {preview.value && <><AnimPlayer anim={preview.value} /><AnimStats anim={preview.value} /></>}
      </>}
      side={<>
        <div><Label>Layout</Label><Segmented value={layout} onChange={setLayout} options={[{ value: 'h', label: 'Side by side' }, { value: 'v', label: 'Stacked' }, { value: 'grid', label: 'Grid' }, { value: 'sequence', label: 'One after another' }]} /></div>
        <Slider label={layout === 'v' ? 'Tile width' : layout === 'sequence' ? 'Max size' : 'Tile height'} value={cell} onChange={setCell} min={64} max={720} step={8} suffix="px" />
        {layout !== 'sequence' && <>
          <Slider label="Gap" value={gap} onChange={setGap} min={0} max={40} suffix="px" />
          <div><Label>Timing</Label><Segmented value={timing} onChange={setTiming} options={[{ value: 'longest', label: 'Longest (others loop)' }, { value: 'shortest', label: 'Shortest' }]} /></div>
        </>}
        <div><Label>Background</Label><Segmented value={transparent ? 't' : 'c'} onChange={(v) => setTransparent(v === 't')} options={[{ value: 'c', label: 'Colour' }, { value: 't', label: 'Transparent' }]} />{!transparent && <ColorInput className="mt-2" value={bg} onChange={setBg} />}</div>
        <ExportPanel anim={preview.value} name="combined" onReset={reset} />
        <p className={cn('text-xs text-muted', !preview.busy && 'invisible')}>Updating preview</p>
        <Button variant="ghost" size="sm" onClick={reset}>Start over</Button>
      </>}
    />
  )
}
