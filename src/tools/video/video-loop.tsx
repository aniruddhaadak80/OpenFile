import { useState } from 'react'
import { Repeat } from 'lucide-react'
import { Label, Segmented, Slider } from '@/components/ui'
import { loopOp, loopToDurationOp } from '@/lib/b3/ffops'
import { extFromBlob } from './_media/engine'
import { fmtTime } from './_media/media'
import { TimeInput } from './_media/ui'
import { VideoOpTool, inName, outName } from './_b3/shell'

export default function VideoLoop() {
  const [mode, setMode] = useState<'times' | 'length'>('times')
  const [times, setTimes] = useState(3)
  const [len, setLen] = useState(60)
  return (
    <VideoOpTool
      dropLabel="Drop a video to loop it" action="Loop video" icon={<Repeat className="size-5" />}
      side={({ meta }) => <>
        <div><Label>Repeat by</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'times', label: 'Number of times' }, { value: 'length', label: 'Target length' }]} /></div>
        {mode === 'times' ? <Slider label="Play" value={times} onChange={setTimes} min={2} max={50} suffix="×" /> : <div><Label>Total length</Label><TimeInput value={len} onChange={(v) => setLen(Math.max(1, Math.min(3600, v)))} max={3600} label="Total length" /></div>}
        {meta?.duration ? <p className="text-sm">New length <span className="font-mono text-accent">{fmtTime(mode === 'times' ? meta.duration * times : len, 1)}</span></p> : null}
        <p className="text-xs text-muted">{mode === 'times' ? 'Copies the clip end to end without re-encoding, so it is fast and lossless.' : 'Repeats the clip and cuts it at the exact length (re-encodes).'}</p>
      </>}
      onRun={async ({ file, meta }, h) => {
        const info = await h.probe()
        const input = inName(file)
        h.setLabel('Looping')
        if (mode === 'times') {
          const ext = extFromBlob(file).slice(1)
          const safe = ['mp4', 'mov', 'mkv', 'webm', 'm4v'].includes(ext) ? (ext === 'm4v' ? 'mp4' : ext) : 'mp4'
          const blob = await h.run(loopOp(input, times, info.hasAudio, safe), [{ name: input, file }], (meta?.duration || info.duration) * times)
          return { blob, name: outName(file, `loop${times}x`, safe), title: `Looped ${times} times` }
        }
        const blob = await h.run(loopToDurationOp(input, len, info.hasAudio), [{ name: input, file }], len)
        return { blob, name: outName(file, `loop-${Math.round(len)}s`), title: `Looped to ${fmtTime(len, 0)}` }
      }}
    />
  )
}
