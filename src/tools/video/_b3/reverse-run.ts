/* Reverse a video in short pieces so ffmpeg.wasm memory stays bounded, then join the pieces last first.
 * Shared by Video Reverse and the video path of Audio Reverse. */
import { concatList, forwardPieceOp, reverseJoinOp, reverseOrder, reversePieceOp, reversePlan, type ReversePlan, type ReverseSource } from '@/lib/b3/ffops'
import { ffRun, isCancel } from '../_media/engine'

export type ReverseMode = 'reverse' | 'boomerang'
type Mode = ReverseMode

/** ffmpeg failures that mean "not enough memory" in ffmpeg.wasm, whatever words the log used. */
export const isMemory = (m: string) => /memory|allocat|opening encoder|Aborted|out of bounds|unreachable|RuntimeError|code -1/i.test(m)

/** Plain words for the user instead of the raw ffmpeg log line. */
export function reverseError(m: string): string {
  if (isMemory(m)) return 'Your browser ran out of memory while reversing this video. Trim it shorter or lower its resolution, then try again.'
  if (/could not be read|Invalid data/i.test(m)) return 'This video could not be read. It may be damaged or use a codec the engine does not support.'
  if (/no matching track/i.test(m)) return 'This file has no video track to reverse.'
  return 'This video could not be reversed. Try another file, or convert it to MP4 first with the Video Converter.'
}

/** Reverse (or boomerang) in short pieces so memory stays bounded, then join the pieces last first. */
async function runPlan(file: File, input: string, plan: ReversePlan, mode: Mode, withAudio: boolean, total: number, setProgress: (p: number) => void, setLabel: (s: string) => void, out: { output?: string; audio?: string[] } = {}): Promise<Blob> {
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
  const op = reverseJoinOp('list.txt', withAudio ? input : undefined, out.output, out.audio)
  const inputs: { name: string; file: Blob | Uint8Array }[] = [...pieces, { name: 'list.txt', file: list }, ...(withAudio ? [{ name: input, file }] : [])]
  return ffRun({ inputs, args: op.args, output: op.output, duration: (mode === 'boomerang' ? 2 : 1) * (total || 0) || undefined, onProgress: step(join) })
}

/** Reverse with the normal plan; when the browser runs out of memory, retry once with smaller parts at most 1280 px. */
export async function reverseChunked(file: File, input: string, src: ReverseSource, mode: Mode, withAudio: boolean, setProgress: (p: number) => void, setLabel: (s: string) => void, out: { output?: string; audio?: string[] } = {}): Promise<Blob> {
  const total = src.duration || 0
  try {
    return await runPlan(file, input, reversePlan(src), mode, withAudio, total, setProgress, setLabel, out)
  } catch (e: any) {
    if (isCancel(e)) throw e
    const m = String(e?.message || e)
    if (!isMemory(m)) throw new Error(reverseError(m))
    setProgress(0); setLabel('Low on memory, trying smaller parts')
    try {
      return await runPlan(file, input, reversePlan(src, { budgetMB: 48, maxSide: 1280 }), mode, withAudio, total, setProgress, setLabel, out)
    } catch (e2: any) {
      if (isCancel(e2)) throw e2
      throw new Error(reverseError(String(e2?.message || e2)))
    }
  }
}
