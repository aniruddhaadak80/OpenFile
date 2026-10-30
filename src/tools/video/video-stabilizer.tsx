import { useState } from 'react'
import { Vibrate } from 'lucide-react'
import { Label, Segmented, Switch } from '@/components/ui'
import { stabilizeOp } from '@/lib/b3/ffops'
import { VideoOpTool, inName, outName } from './_b3/shell'
import { Note } from './_media/ui'

export default function VideoStabilizer() {
  const [strength, setStrength] = useState<'light' | 'normal' | 'strong'>('normal')
  const [zoom, setZoom] = useState(true)
  return (
    <VideoOpTool
      dropLabel="Drop a shaky video to steady it" action="Stabilize" icon={<Vibrate className="size-5" />}
      side={({ meta }) => <>
        <div><Label>Strength</Label><Segmented value={strength} onChange={setStrength} options={[{ value: 'light', label: 'Light' }, { value: 'normal', label: 'Normal' }, { value: 'strong', label: 'Strong' }]} /></div>
        <p className="text-xs text-muted">{strength === 'light' ? 'Small hand tremors.' : strength === 'normal' ? 'Walking and handheld shots.' : 'Very shaky footage. Takes longer.'}</p>
        <Switch checked={zoom} onChange={setZoom} label="Zoom in slightly to hide moving edges" />
        <Note>Motion is analysed frame by frame on your device, so expect roughly real time or slower.{(meta?.width ?? 0) > 1920 ? ' 4K clips are slow; resize to 1080p first for speed.' : ''}</Note>
      </>}
      onRun={async ({ file, meta }, h) => {
        const info = await h.probe()
        h.setLabel('Stabilizing')
        const input = inName(file)
        // the frame size as shown (a phone clip flagged 90 degrees is decoded upright), so the zoom ends at the same size
        const turned = Math.abs(info.rotation ?? 0) % 180 === 90
        const size = meta?.width && meta?.height ? { w: meta.width, h: meta.height } : info.width && info.height ? (turned ? { w: info.height, h: info.width } : { w: info.width, h: info.height }) : undefined
        const blob = await h.run(stabilizeOp(input, strength, zoom, info.hasAudio, size), [{ name: input, file }])
        return { blob, name: outName(file, 'stabilized'), title: 'Stabilized' }
      }}
    />
  )
}
