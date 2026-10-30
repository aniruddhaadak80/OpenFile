import { Rewind } from 'lucide-react'
import { FxShell, AV_ACCEPT, runAudioFilter, type FxCtx } from './_b4/FxShell'
import { ffProbe } from '@/tools/video/_media/engine'
import { reverseChunked } from '@/tools/video/_b3/reverse-run'

/** Videos are reversed in short parts (the same way Video Reverse does it) so a long or HD clip does not run the
 *  browser out of memory; the sound is reversed in one pass while the parts are joined. */
async function reverse(ctx: FxCtx): Promise<Blob> {
  if (!ctx.isVideo || !['mp4', 'mov', 'm4v', 'mkv'].includes(ctx.outExt)) return runAudioFilter(ctx, 'areverse', { vf: ctx.isVideo ? 'reverse' : undefined })
  ctx.setLabel('Reading streams')
  const info = await ffProbe(ctx.file, ctx.inName).catch(() => null)
  const src = { duration: info?.duration || ctx.duration || 0, width: info?.width, height: info?.height, fps: info?.fps }
  ctx.setLabel('Reversing')
  return reverseChunked(ctx.file, ctx.inName, src, 'reverse', info?.hasAudio !== false, ctx.setProgress, ctx.setLabel, { output: ctx.outName, audio: ctx.acodec })
}

export default function AudioReverse() {
  return (
    <FxShell allowVideo accept={AV_ACCEPT} dropLabel="Drop an audio file to reverse" dropSub="Play any sound backwards. For videos, the picture is reversed too." actionLabel="Reverse" actionIcon={<Rewind className="size-5" />} suffix="reversed"
      videoNote="Video input: the picture and the sound are both reversed."
      note={<p className="text-xs text-muted">Videos are reversed in short parts to stay within your browser's memory, so long clips take a while.</p>}
      process={reverse} />
  )
}
