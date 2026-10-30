/* ffmpeg job runner with progress and Cancel for the categories-fill media tools. Uses the shared self-hosted engine. */
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button, Progress, ErrorNote } from '@/components/ui'
import { cancelEngine, engineState, ffProbe, ffRun, isCancel, subscribeEngine, type ProbeInfo } from '@/tools/video/_media/engine'

export { ffProbe, ffRun }
export type { ProbeInfo }

export function useFfJob() {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [eng, setEng] = useState(engineState())
  useEffect(() => subscribeEngine(() => setEng({ ...engineState() })), [])
  const run = async <T,>(fn: (p: (x: number) => void, l: (s: string) => void) => Promise<T>): Promise<T | undefined> => {
    setBusy(true); setError(null); setProgress(0); setLabel('Loading the media engine')
    try { return await fn(setProgress, setLabel) }
    catch (e: any) { if (!isCancel(e)) setError(e?.message || String(e)); return undefined }
    finally { setBusy(false) }
  }
  const cancel = () => { cancelEngine(); setBusy(false); setLabel('') }
  return { busy, progress, label, error, setError, run, cancel, eng }
}
export type FfJob = ReturnType<typeof useFfJob>

export function FfProgress({ job }: { job: FfJob }) {
  if (!job.busy) return <ErrorNote error={job.error} />
  const loading = job.eng.status === 'loading' && job.eng.total > 0
  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface-2/50 p-3" role="status" aria-live="polite">
      {loading ? <Progress value={job.eng.loaded / job.eng.total} label="Downloading the media engine (once, then cached)" /> : <Progress value={job.progress} label={job.label || 'Working'} />}
      <Button variant="outline" size="sm" className="w-full" icon={<X className="size-4" />} onClick={job.cancel}>Cancel</Button>
    </div>
  )
}
export const extOf = (n: string) => (n.split('.').pop() || '').toLowerCase()
