import { useState } from 'react'
import { RotateCw, RotateCcw, FlipHorizontal, FlipVertical } from 'lucide-react'
import { Button, Switch } from '@/components/ui'
import { rotateOp, rotateMetaOp, type Rotation } from '@/lib/b3/ffops'
import { extFromBlob } from './_media/engine'
import { VideoOpTool, inName, outName } from './_b3/shell'
import { VideoStage, Note } from './_media/ui'

export default function VideoRotate() {
  const [rot, setRot] = useState<Rotation>(90)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [lossless, setLossless] = useState(false)
  const transform = `rotate(${rot}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`
  const canLossless = !flipH && !flipV
  return (
    <VideoOpTool
      dropLabel="Drop a video to rotate or flip" action="Rotate video" icon={<RotateCw className="size-5" />}
      main={({ url, meta }) => (
        <div className="overflow-hidden rounded-2xl">
          <div className="transition-transform duration-300" style={{ transform: rot % 180 ? `${transform} scale(${meta?.width && meta.height ? Math.min(meta.height / meta.width, meta.width / meta.height) : 0.6})` : transform }}>
            <VideoStage src={url} playable={meta?.playable !== false} />
          </div>
        </div>
      )}
      side={({ file }) => <>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" icon={<RotateCcw className="size-4" />} onClick={() => setRot(((rot + 270) % 360) as Rotation)}>Left 90°</Button>
          <Button variant="outline" icon={<RotateCw className="size-4" />} onClick={() => setRot(((rot + 90) % 360) as Rotation)}>Right 90°</Button>
          <Button variant={flipH ? 'secondary' : 'outline'} icon={<FlipHorizontal className="size-4" />} onClick={() => setFlipH(!flipH)}>Mirror</Button>
          <Button variant={flipV ? 'secondary' : 'outline'} icon={<FlipVertical className="size-4" />} onClick={() => setFlipV(!flipV)}>Flip</Button>
        </div>
        <p className="text-sm">Rotation: <span className="font-mono text-accent">{rot}°</span>{flipH && ', mirrored'}{flipV && ', flipped'}</p>
        {canLossless && /\.(mp4|mov|m4v)$/i.test(file.name) && <div>
          <Switch checked={lossless} onChange={setLossless} label="Instant, no quality loss" />
          <p className="mt-1.5 text-xs text-muted">Only changes the rotation flag. Phones, browsers and most players respect it; a few old editors do not.</p>
        </div>}
        {!canLossless && <Note>Mirroring needs a re-encode, which takes a little longer.</Note>}
      </>}
      disabled={() => rot === 0 && !flipH && !flipV}
      onRun={async ({ file }, h) => {
        const input = inName(file)
        if (lossless && canLossless && /\.(mp4|mov|m4v)$/i.test(file.name)) {
          h.setLabel('Updating rotation flag')
          const ext = extFromBlob(file).slice(1) === 'mov' ? 'mov' : 'mp4'
          const blob = await h.run(rotateMetaOp(input, rot, ext), [{ name: input, file }])
          return { blob, name: outName(file, `rotated-${rot}`, ext), title: 'Rotated (no re-encode)' }
        }
        const info = await h.probe()
        h.setLabel('Rotating')
        const blob = await h.run(rotateOp(input, rot, flipH, flipV, info.hasAudio), [{ name: input, file }])
        return { blob, name: outName(file, `rotated-${rot}`), title: 'Rotated' }
      }}
    />
  )
}
