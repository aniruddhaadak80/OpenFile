import { useState } from 'react'
import { Crop } from 'lucide-react'
import { Label, Segmented } from '@/components/ui'
import { cropOp } from '@/lib/b3/ffops'
import { VideoOpTool, inName, outName } from './_b3/shell'
import { RegionVideo } from './_b3/region-video'
import { RATIOS, RectInputs, aspectRect, type Rect } from './_b3/region'
import { Note } from './_media/ui'
import type { VideoMeta } from './_media/media'

export default function VideoCrop() {
  const [rect, setRect] = useState<Rect | null>(null)
  const [ratio, setRatio] = useState('free')
  const r = RATIOS.find((x) => x.value === ratio)?.r ?? null
  const eff = (meta: VideoMeta | null): Rect => rect ?? (meta?.width ? aspectRect(meta.width, meta.height, r) : { x: 0, y: 0, w: 0, h: 0 })
  return (
    <VideoOpTool
      dropLabel="Drop a video to crop" action="Crop video" icon={<Crop className="size-5" />}
      onReset={() => setRect(null)}
      main={({ url, meta }) => meta?.playable === false
        ? <Note tone="warn">Your browser cannot preview this video, so enter the crop area in numbers on the right.</Note>
        : <RegionVideo url={url} width={meta?.width ?? 0} height={meta?.height ?? 0} rect={eff(meta)} onChange={setRect} ratio={r} />}
      side={({ meta }) => <>
        <div><Label>Aspect ratio</Label><Segmented value={ratio} onChange={(v) => { setRatio(v); if (meta?.width) setRect(aspectRect(meta.width, meta.height, RATIOS.find((x) => x.value === v)?.r ?? null)) }} options={RATIOS.map((x) => ({ value: x.value, label: x.label }))} /></div>
        {meta?.width ? <RectInputs rect={eff(meta)} onChange={setRect} W={meta.width} H={meta.height} /> : null}
        <p className="text-xs text-muted">9:16 suits Reels, Shorts and TikTok. 1:1 and 4:5 suit feed posts.</p>
      </>}
      disabled={({ meta }) => !eff(meta).w}
      onRun={async ({ file, meta }, h) => {
        const box = eff(meta)
        const info = await h.probe()
        h.setLabel('Cropping')
        const input = inName(file)
        const blob = await h.run(cropOp(input, box, info.hasAudio), [{ name: input, file }])
        return { blob, name: outName(file, `crop-${box.w}x${box.h}`), title: `Cropped to ${box.w}×${box.h}` }
      }}
    />
  )
}
