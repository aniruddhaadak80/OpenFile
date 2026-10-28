import { Rewind } from 'lucide-react'
import { FxShell, AV_ACCEPT, runAudioFilter } from './_b4/FxShell'

export default function AudioReverse() {
  return (
    <FxShell allowVideo accept={AV_ACCEPT} dropLabel="Drop an audio file to reverse" dropSub="Play any sound backwards. For videos, the picture is reversed too." actionLabel="Reverse" actionIcon={<Rewind className="size-5" />} suffix="reversed"
      note={<p className="text-xs text-muted">Reversing needs the whole file in memory. Long videos may be slow, so trim them first if needed.</p>}
      process={(ctx) => runAudioFilter(ctx, 'areverse', { vf: ctx.isVideo ? 'reverse' : undefined })} />
  )
}
