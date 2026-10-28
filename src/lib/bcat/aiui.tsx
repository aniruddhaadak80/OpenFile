/* Shared UI for the Local AI tools: engine choice (AI model or quick mode), GPU switch, download progress and Cancel. */
import { useEffect, useState } from 'react'
import { Cpu, Zap, X, Gauge, Sparkles } from 'lucide-react'
import { Button, Label, Progress, Switch, Segmented, ErrorNote } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { StatusLine } from '@/lib/b4/ui'
import { hasWebGPU, cancelVision, visionRun, type VModel, type VCallbacks } from './vision'

export type Engine = 'ai' | 'quick'

export function useVision(model: VModel, opts: { quick?: boolean } = {}) {
  const [gpuOk, setGpuOk] = useState(false)
  const [gpu, setGpu] = useState(false)
  const [engine, setEngine] = useState<Engine>('ai')
  const [phase, setPhase] = useState<'idle' | 'loading' | 'running'>('idle')
  const [load, setLoad] = useState<{ loaded: number; total: number } | null>(null)
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { hasWebGPU().then((ok) => { setGpuOk(ok); setGpu(ok) }) }, [])
  const device: 'wasm' | 'webgpu' = gpu && gpuOk ? 'webgpu' : 'wasm'
  const cb = (extra: VCallbacks = {}): VCallbacks => ({
    onLoad: (l, t) => { setPhase('loading'); setLoad({ loaded: l, total: t }) },
    onStatus: (s) => setStatus(s),
    onReady: () => { setPhase('running'); setLoad(null); setStatus('Running the model on your device') },
    onProgress: (d, t) => { setProgress(d / Math.max(1, t)); setStatus(`Working: ${d} of ${t}`) },
    ...extra,
  })
  /** Run the model in the worker with progress wired up. */
  const infer = <T,>(input: any, options: any = {}, extra: VCallbacks = {}, m: VModel = model) => visionRun<T>(m, device, input, options, cb(extra))
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setError(null); setPhase('loading'); setStatus('Starting'); setProgress(null)
    try { return await fn() } catch (e: any) { if (e?.name !== 'CancelledError') setError(e?.message || String(e)); return undefined } finally { setPhase('idle'); setLoad(null); setProgress(null) }
  }
  const cancel = () => { cancelVision(); setPhase('idle'); setLoad(null); setProgress(null) }
  return { model, gpu, setGpu, gpuOk, device, engine: opts.quick ? engine : 'ai' as Engine, setEngine, hasQuick: !!opts.quick, phase, load, status, setStatus, progress, setProgress, error, setError, infer, run, cancel, busy: phase !== 'idle' }
}
export type VisionState = ReturnType<typeof useVision>

export function EnginePanel({ ai, quickLabel = 'Quick mode', quickNote }: { ai: VisionState; quickLabel?: string; quickNote?: string }) {
  return (
    <div className="space-y-3">
      {ai.hasQuick && (
        <div>
          <Label>Engine</Label>
          <Segmented value={ai.engine} onChange={ai.setEngine} options={[{ value: 'ai', label: <span className="inline-flex items-center gap-1.5"><Sparkles className="size-3.5" />AI model</span> }, { value: 'quick', label: <span className="inline-flex items-center gap-1.5"><Gauge className="size-3.5" />{quickLabel}</span> }]} />
        </div>
      )}
      {ai.engine === 'ai' ? (
        <>
          <div>
            <Label>AI model</Label>
            <div className="rounded-xl border border-border bg-surface-2/50 px-3 py-2 text-sm">{ai.model.label}</div>
            <p className="mt-1 text-xs text-muted">Download {ai.model.size}, once. After that it runs offline from your browser cache, and your files never leave this device.</p>
          </div>
          {ai.gpuOk ? <Switch checked={ai.gpu} onChange={ai.setGpu} label={<span className="inline-flex items-center gap-1.5"><Zap className="size-3.5 text-accent" />Use GPU (WebGPU, faster)</span>} />
            : <p className="flex gap-1.5 text-xs text-muted"><Cpu className="size-4 shrink-0" />WebGPU is not available here, so the model runs on the CPU in the background. It works, just slower.{ai.hasQuick ? ' Quick mode needs no download.' : ''}</p>}
        </>
      ) : <p className="text-xs text-muted">{quickNote ?? 'Quick mode uses simple rules instead of a model. It is instant and needs no download, but it is less accurate.'}</p>}
    </div>
  )
}

export function VisionProgress({ ai }: { ai: VisionState }) {
  if (ai.phase === 'idle') return <ErrorNote error={ai.error} />
  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface-2/50 p-3" role="status" aria-live="polite">
      {ai.phase === 'loading' && ai.load && ai.load.total > 0
        ? <Progress value={ai.load.loaded / ai.load.total} label={`Downloading model: ${formatBytes(ai.load.loaded)} of ${formatBytes(ai.load.total)}`} />
        : ai.progress != null ? <Progress value={ai.progress} label={ai.status} /> : <StatusLine text={ai.status || 'Working'} />}
      <Button variant="outline" size="sm" className="w-full" icon={<X className="size-4" />} onClick={ai.cancel}>Cancel</Button>
    </div>
  )
}
