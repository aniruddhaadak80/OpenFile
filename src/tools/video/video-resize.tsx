import { useState } from 'react'
import { Scaling, Link2, Link2Off } from 'lucide-react'
import { Button, Input, Label, Segmented } from '@/components/ui'
import { resizeOp, type FillMode } from '@/lib/b3/ffops'
import { ColorInput } from '@/tools/image/_img/kit'
import { VideoOpTool, inName, outName } from './_b3/shell'

const PRESETS: { id: string; label: string; w: number; h: number }[] = [
  { id: 'reel', label: 'Reels / Shorts / TikTok 9:16', w: 1080, h: 1920 },
  { id: 'square', label: 'Square post 1:1', w: 1080, h: 1080 },
  { id: 'portrait', label: 'Portrait post 4:5', w: 1080, h: 1350 },
  { id: 'yt', label: 'YouTube 1080p 16:9', w: 1920, h: 1080 },
  { id: '720', label: 'HD 720p 16:9', w: 1280, h: 720 },
  { id: '480', label: 'SD 480p 16:9', w: 854, h: 480 },
  { id: 'x', label: 'X / Twitter 16:9', w: 1280, h: 720 },
  { id: 'li', label: 'LinkedIn 1:1', w: 1080, h: 1080 },
]

export default function VideoResize() {
  const [w, setW] = useState(1080), [h, setH] = useState(1920)
  const [lock, setLock] = useState(false)
  const [mode, setMode] = useState<FillMode>('fit')
  const [pad, setPad] = useState<'blur' | 'color'>('blur')
  const [color, setColor] = useState('#000000')
  const [preset, setPreset] = useState('reel')
  return (
    <VideoOpTool
      dropLabel="Drop a video to resize or change its aspect ratio" action={`Resize to ${w}×${h}`} icon={<Scaling className="size-5" />}
      side={({ meta }) => {
        const ar = meta?.width ? meta.width / meta.height : 16 / 9
        return <>
          <div>
            <Label>Preset</Label>
            <select value={preset} onChange={(e) => { const p = PRESETS.find((x) => x.id === e.target.value); setPreset(e.target.value); if (p) { setW(p.w); setH(p.h) } }} className="h-10 w-full cursor-pointer rounded-xl border border-border bg-surface-2/60 px-3 text-sm text-fg outline-none focus:border-accent">
              {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              <option value="custom">Custom size</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex-1"><Label>Width</Label><Input type="number" min={16} value={w} onChange={(e) => { const v = Math.max(16, +e.target.value || 16); setW(v); setPreset('custom'); if (lock) setH(Math.round(v / ar)) }} /></label>
            <Button variant="ghost" size="sm" aria-label={lock ? 'Unlock aspect ratio' : 'Keep original aspect ratio'} onClick={() => { setLock(!lock); if (!lock) setH(Math.round(w / ar)) }} icon={lock ? <Link2 className="size-4" /> : <Link2Off className="size-4" />} />
            <label className="flex-1"><Label>Height</Label><Input type="number" min={16} value={h} onChange={(e) => { const v = Math.max(16, +e.target.value || 16); setH(v); setPreset('custom'); if (lock) setW(Math.round(v * ar)) }} /></label>
          </div>
          {meta?.width ? <div className="flex flex-wrap gap-1.5">{[0.25, 0.5, 0.75].map((s) => <Button key={s} size="sm" variant="secondary" onClick={() => { setW(Math.round(meta.width * s)); setH(Math.round(meta.height * s)); setPreset('custom') }}>{s * 100}%</Button>)}</div> : null}
          <div><Label>When the shape changes</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'fit', label: 'Fit (bars)' }, { value: 'fill', label: 'Fill (crop)' }, { value: 'stretch', label: 'Stretch' }]} /></div>
          {mode === 'fit' && <div className="space-y-2">
            <Segmented value={pad} onChange={setPad} options={[{ value: 'blur', label: 'Blurred fill' }, { value: 'color', label: 'Solid colour' }]} />
            {pad === 'color' && <ColorInput value={color} onChange={setColor} />}
          </div>}
        </>
      }}
      onRun={async ({ file }, hh) => {
        const info = await hh.probe()
        hh.setLabel('Resizing')
        const input = inName(file)
        const blob = await hh.run(resizeOp(input, w, h, mode, pad, color, info.hasAudio), [{ name: input, file }])
        return { blob, name: outName(file, `${w}x${h}`), title: `Resized to ${w}×${h}` }
      }}
    />
  )
}
