import { useState } from 'react'
import { Undo2 } from 'lucide-react'
import { Label, Segmented, Switch } from '@/components/ui'
import { concatList, forwardPieceOp, reverseJoinOp, reverseOrder, reversePieceOp, reversePlan, type ReversePlan } from '@/lib/b3/ffops'
import { VideoOpTool, inName, outName } from './_b3/shell'
import { ffRun, isCancel } from './_media/engine'
import { Note } from './_media/ui'

type Mode = 'reverse' | 'boomerang'

/** ffmpeg failures that mean "not enough memory" in ffmpeg.wasm, whatever words the log used. */
const isMemory = (m: string) => /memory|allocat|opening encoder|Aborted|out of bounds|unreachable|RuntimeError|code -1/i.test(m)

/** Plain words for the user instead of the raw ffmpeg log line. */
function reverseError(m: string): string {
  if (isMemory(m)) return 'Your browser ran out of memory while reversing this video. Trim it shorter or lower its resolution, then try again.'
  if (/could not be read|Invalid data/i.test(m)) return 'This video could not be read. It may be damaged or use a codec the engine does not support.'
  if (/no matching track/i.test(m)) return 'This file has no video track to reverse.'
  return 'This video could not be reversed. Try another file, or convert it to MP4 first with the Video Converter.'
}

/** Reverse (or boomerang) in short pieces so memory stays bounded, then join the pieces last first. */
async function runPlan(file: File, input: string, plan: ReversePlan, mode: Mode, withAudio: boolean, total: number, setProgress: (p: number) => void, setLabel: (s: string) => void): Promise<Blob> {
  const n = plan.pieces.length
  // progress weights: each piece by its length, the forward half of a boomerang by the clip length, the join a small share
  const lens = plan.pieces.map((p) => p.len || total || 1)
  const fwd = mode === 'boomerang' ? (total || lens.reduce((a, b) => a + b, 0)) : 0
  const join = Math.max(0.5, (total || 1) * (withAudio ? 0.15 : 0.05))
  const all = lens.reduce((a, b) => a + b, 0) + fwd + join
  let done = 0
  const step = (w: number) => (p: number) => setProgress(Math.min(0.995, (done + p * w) / all))
  const pieces: { name: string; file: Blob }[] = []
  // pieces are made last first, so the start of the result is ready early and the order matches the join
  for (let k = n - 1; k >= 0; k--) {
    setLabel(n > 1 ? `Reversing part ${n - k} of ${n}` : 'Reversing')
    const op = reversePieceOp(input, plan, k)
    const blob = await ffRun({ inputs: [{ name: input, file }], args: op.args, output: op.output, duration: lens[k], onProgress: step(lens[k]) })
    pieces.push({ name: op.output, file: blob })
    done += lens[k]
  }
  if (mode === 'boomerang') {
    setLabel('Adding the forward half')
    const op = forwardPieceOp(input, plan)
    const blob = await ffRun({ inputs: [{ name: input, file }], args: op.args, output: op.output, duration: fwd, onProgress: step(fwd) })
    pieces.push({ name: op.output, file: blob })
    done += fwd
  }
  setLabel(withAudio ? 'Joining the parts and reversing the sound' : 'Joining the parts')
  const list = new TextEncoder().encode(concatList(reverseOrder(plan, mode)))
  const op = reverseJoinOp('list.txt', withAudio ? input : undefined)
  const inputs: { name: string; file: Blob | Uint8Array }[] = [...pieces, { name: 'list.txt', file: list }, ...(withAudio ? [{ name: input, file }] : [])]
  return ffRun({ inputs, args: op.args, output: op.output, duration: (mode === 'boomerang' ? 2 : 1) * (total || 0) || undefined, onProgress: step(join) })
}

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
        let blob: Blob
        try {
          blob = await runPlan(file, input, reversePlan(src), mode, withAudio, total, h.setProgress, h.setLabel)
        } catch (e: any) {
          if (isCancel(e)) throw e
          const m = String(e?.message || e)
          if (!isMemory(m)) throw new Error(reverseError(m))
          // low memory: smaller parts and at most 1280 px, once
          h.setProgress(0); h.setLabel('Low on memory, trying smaller parts')
          try {
            blob = await runPlan(file, input, reversePlan(src, { budgetMB: 48, maxSide: 1280 }), mode, withAudio, total, h.setProgress, h.setLabel)
          } catch (e2: any) {
            if (isCancel(e2)) throw e2
            throw new Error(reverseError(String(e2?.message || e2)))
          }
        }
        return { blob, name: outName(file, mode), title: mode === 'reverse' ? 'Reversed' : 'Boomerang ready' }
      }}
    />
  )
}
