import { useState } from 'react'
import { Undo2 } from 'lucide-react'
import { Label, Segmented, Switch } from '@/components/ui'
import { reverseOp } from '@/lib/b3/ffops'
import { VideoOpTool, inName, outName } from './_b3/shell'
import { Note } from './_media/ui'

export default function VideoReverse() {
  const [mode, setMode] = useState<'reverse' | 'boomerang'>('reverse')
  const [revAudio, setRevAudio] = useState(true)
  return (
    <VideoOpTool
      dropLabel="Drop a video to play it backwards" action={mode === 'reverse' ? 'Reverse video' : 'Make boomerang'} icon={<Undo2 className="size-5" />}
      side={({ meta }) => <>
        <div><Label>Effect</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'reverse', label: 'Reverse' }, { value: 'boomerang', label: 'Boomerang' }]} /></div>
        <p className="text-xs text-muted">{mode === 'reverse' ? 'The whole clip plays backwards.' : 'Plays forward, then backwards, for a seamless loop. Audio is removed.'}</p>
        {mode === 'reverse' && <Switch checked={revAudio} onChange={setRevAudio} label="Reverse the sound too" />}
        {(meta?.duration ?? 0) > 60 && <Note tone="warn">Reversing holds every frame in memory. Clips over a minute may run out of memory; trim first if it fails.</Note>}
      </>}
      onRun={async ({ file }, h) => {
        const info = await h.probe()
        h.setLabel(mode === 'reverse' ? 'Reversing' : 'Building boomerang')
        const input = inName(file)
        const blob = await h.run(reverseOp(input, mode, info.hasAudio, revAudio), [{ name: input, file }], mode === 'boomerang' ? info.duration * 2 : info.duration)
        return { blob, name: outName(file, mode), title: mode === 'reverse' ? 'Reversed' : 'Boomerang ready' }
      }}
    />
  )
}
