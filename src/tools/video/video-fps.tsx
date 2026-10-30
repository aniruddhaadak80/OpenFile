import { useState } from 'react'
import { Timer } from 'lucide-react'
import { Label, Segmented, Select, Slider } from '@/components/ui'
import { fpsOp, type FpsMode } from '@/lib/b3/ffops'
import { fmtTime } from './_media/media'
import { VideoOpTool, inName, outName } from './_b3/shell'
import { Note } from './_media/ui'

const MODES: { value: FpsMode; label: string; hint: string }[] = [
  { value: 'convert', label: 'Change frame rate', hint: 'Drops or repeats frames to hit the new rate. Fast.' },
  { value: 'smooth', label: 'Smooth (interpolate)', hint: 'Creates new in-between frames from motion. Very slow but silky.' },
  { value: 'slowmo', label: 'Slow motion', hint: 'Slows the clip and blends frames so it stays smooth. Audio is removed.' },
  { value: 'timelapse', label: 'Time-lapse', hint: 'Speeds the clip up a lot. Audio is removed.' },
  { value: 'stopmotion', label: 'Stop-motion look', hint: 'Few frames per second for a choppy, hand-made feel.' },
]

export default function VideoFps() {
  const [mode, setMode] = useState<FpsMode>('convert')
  const [fps, setFps] = useState('30')
  const [factor, setFactor] = useState(2)
  const [stop, setStop] = useState(8)
  const m = MODES.find((x) => x.value === mode)!
  return (
    <VideoOpTool
      dropLabel="Drop a video to change its frame rate" action={m.label} icon={<Timer className="size-5" />}
      side={({ meta }) => <>
        <div><Label>Effect</Label><Select aria-label="Effect" value={mode} onChange={(v) => setMode(v as FpsMode)} options={MODES.map((x) => ({ value: x.value, label: x.label }))} /></div>
        <p className="text-xs text-muted">{m.hint}</p>
        {mode === 'stopmotion' ? <Slider label="Frames per second" value={stop} onChange={setStop} min={2} max={15} />
          : <div><Label>Output frame rate</Label><Segmented value={fps} onChange={setFps} options={['24', '25', '30', '50', '60'].map((v) => ({ value: v, label: v }))} /></div>}
        {(mode === 'slowmo' || mode === 'timelapse') && <Slider label={mode === 'slowmo' ? 'Slower by' : 'Faster by'} value={factor} onChange={setFactor} min={mode === 'slowmo' ? 1.5 : 2} max={mode === 'slowmo' ? 8 : 60} step={0.5} suffix="×" />}
        {meta?.duration && (mode === 'slowmo' || mode === 'timelapse') ? <p className="text-sm">New length <span className="font-mono text-accent">{fmtTime(mode === 'slowmo' ? meta.duration * factor : meta.duration / factor, 1)}</span></p> : null}
        {mode === 'smooth' && <Note tone="warn">Interpolation is heavy. Try a short clip first.</Note>}
      </>}
      onRun={async ({ file, meta }, h) => {
        const info = await h.probe()
        h.setLabel(m.label)
        const input = inName(file)
        const rate = mode === 'stopmotion' ? stop : +fps
        const dur = (meta?.duration || info.duration) * (mode === 'slowmo' ? factor : mode === 'timelapse' ? 1 / factor : 1)
        // more frames per second than the source is allowed to make a bigger file
        const moreFrames = (mode === 'convert' || mode === 'smooth') && rate > (info.fps || 30) + 0.5
        const blob = await h.run(fpsOp(input, mode, rate, factor, info.hasAudio), [{ name: input, file }], dur, { pure: !moreFrames })
        return { blob, name: outName(file, mode === 'convert' ? `${rate}fps` : mode), title: 'Done' }
      }}
    />
  )
}
