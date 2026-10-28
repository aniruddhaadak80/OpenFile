import { useRef, useState } from 'react'
import { Snowflake, Crosshair } from 'lucide-react'
import { Button, Label, Slider } from '@/components/ui'
import { freezeOp } from '@/lib/b3/ffops'
import { fmtTime } from './_media/media'
import { TimeInput, VideoStage } from './_media/ui'
import { VideoOpTool, inName, outName } from './_b3/shell'

export default function FreezeFrame() {
  const [at, setAt] = useState(1)
  const [hold, setHold] = useState(2)
  const v = useRef<HTMLVideoElement>(null)
  return (
    <VideoOpTool
      dropLabel="Drop a video to freeze a moment" action="Add freeze frame" icon={<Snowflake className="size-5" />}
      main={({ url, meta }) => <VideoStage ref={v} src={url} playable={meta?.playable !== false} />}
      side={({ meta }) => <>
        <div>
          <Label>Freeze at</Label>
          <div className="flex gap-2"><TimeInput value={at} onChange={setAt} max={meta?.duration || Infinity} label="Freeze time" /><Button variant="secondary" icon={<Crosshair className="size-4" />} onClick={() => v.current && setAt(+v.current.currentTime.toFixed(2))}>Use current</Button></div>
          <p className="mt-1 text-xs text-muted">Pause the video on the moment you want, then press Use current.</p>
        </div>
        <Slider label="Hold for" value={hold} onChange={setHold} min={0.5} max={15} step={0.5} suffix=" s" />
        {meta?.duration ? <p className="text-sm">New length <span className="font-mono text-accent">{fmtTime(meta.duration + hold, 1)}</span></p> : null}
        <p className="text-xs text-muted">The sound pauses during the freeze and continues after it.</p>
      </>}
      disabled={({ meta }) => !!meta?.duration && at >= meta.duration}
      onRun={async ({ file }, h) => {
        const info = await h.probe()
        h.setLabel('Freezing frame')
        const input = inName(file)
        const blob = await h.run(freezeOp(input, at, hold, info.hasAudio), [{ name: input, file }], info.duration + hold)
        return { blob, name: outName(file, 'freeze'), title: `Frozen at ${fmtTime(at, 2)} for ${hold}s` }
      }}
    />
  )
}
