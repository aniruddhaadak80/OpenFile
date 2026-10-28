import { useState } from 'react'
import { Eraser } from 'lucide-react'
import { Switch } from '@/components/ui'
import { delogoOp } from '@/lib/b3/ffops'
import { VideoOpTool, inName, outName } from './_b3/shell'
import { RegionVideo } from './_b3/region-video'
import { RectInputs, type Rect } from './_b3/region'
import { TimeInput, Note } from './_media/ui'
import type { VideoMeta } from './_media/media'

export default function VideoDelogo() {
  const [rect, setRect] = useState<Rect | null>(null)
  const [timed, setTimed] = useState(false)
  const [t0, setT0] = useState(0), [t1, setT1] = useState(5)
  const eff = (m: VideoMeta | null): Rect => rect ?? (m?.width ? { x: Math.round(m.width * 0.78), y: Math.round(m.height * 0.05), w: Math.round(m.width * 0.18), h: Math.round(m.height * 0.1) } : { x: 0, y: 0, w: 0, h: 0 })
  return (
    <VideoOpTool
      dropLabel="Drop a video to remove a logo or timestamp" action="Remove logo" icon={<Eraser className="size-5" />}
      onReset={() => setRect(null)}
      main={({ url, meta }) => <RegionVideo url={url} width={meta?.width ?? 0} height={meta?.height ?? 0} rect={eff(meta)} onChange={setRect} shade={false} label="Logo area" />}
      side={({ meta }) => <>
        <p className="text-sm">Draw a box tightly around the logo, watermark or date stamp.</p>
        {meta?.width ? <RectInputs rect={eff(meta)} onChange={setRect} W={meta.width} H={meta.height} /> : null}
        <Switch checked={timed} onChange={setTimed} label="Only part of the video" />
        {timed && <div className="grid grid-cols-2 gap-2"><TimeInput value={t0} onChange={setT0} label="From" /><TimeInput value={t1} onChange={setT1} label="To" /></div>}
        <Note>The area is filled in from the pixels around it. It works best on small, still logos over a calm background.</Note>
      </>}
      disabled={({ meta }) => !eff(meta).w}
      onRun={async ({ file, meta }, h) => {
        const info = await h.probe()
        const W = info.width || meta?.width || 0, H = info.height || meta?.height || 0
        h.setLabel('Removing logo')
        const input = inName(file)
        const blob = await h.run(delogoOp(input, eff(meta), W, H, info.hasAudio, timed ? [t0, t1] : undefined), [{ name: input, file }])
        return { blob, name: outName(file, 'nologo'), title: 'Logo removed' }
      }}
    />
  )
}
