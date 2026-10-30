import { useState } from 'react'
import { Undo2 } from 'lucide-react'
import { Label, Segmented, Switch } from '@/components/ui'
import { VideoOpTool, inName, outName } from './_b3/shell'
import { reverseChunked } from './_b3/reverse-run'
import { Note } from './_media/ui'

type Mode = 'reverse' | 'boomerang'

export default function VideoReverse() {
  const [mode, setMode] = useState<Mode>('reverse')
  const [revAudio, setRevAudio] = useState(true)
  return (
    <VideoOpTool
      dropLabel="Drop a video to play it backwards" action={mode === 'reverse' ? 'Reverse video' : 'Make boomerang'} icon={<Undo2 className="size-5" />}
      side={({ meta }) => <>
        <div><Label>Effect</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'reverse', label: 'Reverse' }, { value: 'boomerang', label: 'Boomerang' }]} /></div>
        <p className="text-xs text-muted">{mode === 'reverse' ? 'The whole clip plays backwards.' : 'Plays forward, then backwards, for a seamless loop. Audio is removed.'}</p>
        {mode === 'reverse' && <Switch checked={revAudio} onChange={setRevAudio} label="Reverse the sound too" />}
        {mode === 'reverse' && !revAudio && <p className="text-[11px] text-muted">With this off, the result has no sound.</p>}
        {((meta?.duration ?? 0) > 30 || Math.max(meta?.width ?? 0, meta?.height ?? 0) > 2560) && <Note>Long or very large clips are reversed in short parts to stay within your browser's memory, so they take a while. Videos larger than 2560 px are scaled down to 1920 px.</Note>}
      </>}
      onRun={async ({ file, meta }, h) => {
        const info = await h.probe()
        const input = inName(file)
        const total = info.duration || meta?.duration || 0
        const src = { duration: total, width: info.width || meta?.width, height: info.height || meta?.height, fps: info.fps }
        const withAudio = mode === 'reverse' && revAudio && info.hasAudio
        h.setLabel(mode === 'reverse' ? 'Reversing' : 'Building boomerang')
        const blob = await reverseChunked(file, input, src, mode, withAudio, h.setProgress, h.setLabel)
        return { blob, name: outName(file, mode), title: mode === 'reverse' ? 'Reversed' : 'Boomerang ready' }
      }}
    />
  )
}
