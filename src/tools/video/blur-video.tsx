import { useState } from 'react'
import { EyeOff, Plus, Trash2 } from 'lucide-react'
import { Button, Label, Segmented, Slider, Switch, cn } from '@/components/ui'
import { blurRegionOp } from '@/lib/b3/ffops'
import { VideoOpTool, inName, outName } from './_b3/shell'
import { RegionVideo } from './_b3/region-video'
import { RectInputs, type Rect } from './_b3/region'
import { TimeInput, Note } from './_media/ui'
import type { VideoMeta } from './_media/media'

export default function BlurVideo() {
  const [areas, setAreas] = useState<Rect[]>([])
  const [active, setActive] = useState(0)
  const [style, setStyle] = useState<'blur' | 'pixelate' | 'black'>('blur')
  const [amount, setAmount] = useState(12)
  const [timed, setTimed] = useState(false)
  const [t0, setT0] = useState(0), [t1, setT1] = useState(5)
  const def = (m: VideoMeta | null): Rect => (m?.width ? { x: Math.round(m.width * 0.35), y: Math.round(m.height * 0.3), w: Math.round(m.width * 0.3), h: Math.round(m.height * 0.3) } : { x: 0, y: 0, w: 0, h: 0 })
  const list = (m: VideoMeta | null) => (areas.length ? areas : [def(m)])
  const update = (m: VideoMeta | null, r: Rect) => { const l = [...list(m)]; l[Math.min(active, l.length - 1)] = r; setAreas(l) }
  return (
    <VideoOpTool
      dropLabel="Drop a video to blur or pixelate part of it" action={style === 'black' ? 'Black out areas' : style === 'pixelate' ? 'Pixelate areas' : 'Blur areas'} icon={<EyeOff className="size-5" />}
      onReset={() => { setAreas([]); setActive(0) }}
      main={({ url, meta }) => {
        const l = list(meta), cur = l[Math.min(active, l.length - 1)]
        const others = meta?.width ? l.map((r, i) => i === active ? null : <div key={i} className="pointer-events-none absolute border-2 border-dashed border-white/70 bg-white/10" style={{ left: `${r.x / meta.width * 100}%`, top: `${r.y / meta.height * 100}%`, width: `${r.w / meta.width * 100}%`, height: `${r.h / meta.height * 100}%` }} />) : null
        return <RegionVideo url={url} width={meta?.width ?? 0} height={meta?.height ?? 0} rect={cur} onChange={(r) => update(meta, r)} shade={false} overlay={others} label="Area to hide" />
      }}
      side={({ meta }) => {
        const l = list(meta)
        return <>
          <div>
            <Label>Areas</Label>
            <div className="flex flex-wrap gap-1.5">
              {l.map((_, i) => <button key={i} onClick={() => setActive(i)} className={cn('rounded-lg px-2.5 py-1 text-xs cursor-pointer', i === active ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted hover:text-fg')}>Area {i + 1}</button>)}
              <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => { setAreas([...l, def(meta)]); setActive(l.length) }} disabled={l.length >= 8}>Add</Button>
              {l.length > 1 && <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => { setAreas(l.filter((_, i) => i !== active)); setActive(0) }}>Remove</Button>}
            </div>
          </div>
          {meta?.width ? <RectInputs rect={l[Math.min(active, l.length - 1)]} onChange={(r) => update(meta, r)} W={meta.width} H={meta.height} /> : null}
          <div><Label>Style</Label><Segmented value={style} onChange={setStyle} options={[{ value: 'blur', label: 'Blur' }, { value: 'pixelate', label: 'Pixelate' }, { value: 'black', label: 'Black box' }]} /></div>
          {style !== 'black' && <Slider label="Strength" value={amount} onChange={setAmount} min={2} max={40} />}
          <Switch checked={timed} onChange={setTimed} label="Only part of the video" />
          {timed && <div className="grid grid-cols-2 gap-2"><TimeInput value={t0} onChange={setT0} label="From" /><TimeInput value={t1} onChange={setT1} label="To" /></div>}
          <Note>Areas stay in place. For a moving face, cover the path it takes or split the clip into parts.</Note>
        </>
      }}
      onRun={async ({ file, meta }, h) => {
        const info = await h.probe()
        h.setLabel('Hiding areas')
        const input = inName(file)
        const blob = await h.run(blurRegionOp(input, list(meta), style, amount, info.hasAudio, timed ? [t0, t1] : undefined), [{ name: input, file }])
        return { blob, name: outName(file, 'blurred'), title: 'Areas hidden' }
      }}
    />
  )
}
