/// <reference lib="webworker" />
/* Heavy audio analysis off the main thread: loudness (EBU R128) and tempo / key. */
import { measureLoudness, detectBpm, estimateKey } from './audio'

const post = (m: any) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m)
self.onmessage = (ev: MessageEvent) => {
  const { id, op, chans, sampleRate, opts = {} } = ev.data as { id: number; op: string; chans: Float32Array[]; sampleRate: number; opts: any }
  try {
    if (op === 'loudness') { post({ id, type: 'done', result: measureLoudness(chans, sampleRate, (p) => post({ id, type: 'progress', p })) }); return }
    if (op === 'bpm') {
      const mono = chans[0]
      post({ id, type: 'progress', p: 0.2 })
      const t = detectBpm(mono, sampleRate, opts.min ?? 60, opts.max ?? 200)
      post({ id, type: 'progress', p: 0.6 })
      const k = opts.key ? estimateKey(mono, sampleRate) : { key: '', score: 0 }
      post({ id, type: 'done', result: { ...t, key: k.key, keyScore: k.score } }); return
    }
    throw new Error('Unknown operation')
  } catch (e: any) { post({ id, type: 'error', message: e?.message || String(e) }) }
}
