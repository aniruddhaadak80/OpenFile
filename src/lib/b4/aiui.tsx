/* Shared UI for the on-device AI tools: model picker with size, GPU switch, download progress, and document input. */
import { useEffect, useRef, useState } from 'react'
import { Cpu, Zap, FileText, ClipboardPaste, X } from 'lucide-react'
import { Button, Dropzone, Label, Progress, Select, Switch, Tabs, Textarea, ErrorNote } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { hasWebGPU, cancelAi, type ModelInfo, type AiCallbacks } from './ai'
import { docPages, DOCTEXT_ACCEPT, type DocPage } from './doctext'
import { TopBar, StatusLine } from './ui'

export function useAiState(models: ModelInfo[]) {
  const [model, setModelRaw] = useState(models[0].id)
  const [gpuOk, setGpuOk] = useState(false)
  const [gpu, setGpu] = useState(false)
  // Without WebGPU the lightest model in the list is picked until the user chooses one, so the first run on a CPU
  // downloads and loads a small model instead of one that can run the tab out of memory.
  const picked = useRef(false)
  const setModel = (id: string) => { picked.current = true; setModelRaw(id) }
  const [phase, setPhase] = useState<'idle' | 'loading' | 'running'>('idle')
  const [load, setLoad] = useState<{ loaded: number; total: number } | null>(null)
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { hasWebGPU().then((ok) => { setGpuOk(ok); setGpu(ok); const light = models.find((m) => m.cpuDefault); if (!ok && light && !picked.current) setModelRaw(light.id) }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const info = models.find((m) => m.id === model) ?? models[0]
  const device: 'wasm' | 'webgpu' = gpu && gpuOk ? 'webgpu' : 'wasm'
  const callbacks = (extra: AiCallbacks = {}): AiCallbacks => ({
    onLoad: (l, t) => { setPhase('loading'); setLoad({ loaded: l, total: t }) },
    onStatus: (s) => setStatus(s),
    onReady: () => { setPhase('running'); setLoad(null) },
    ...extra,
  })
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setError(null); setPhase('loading'); setStatus('Starting the AI model'); setProgress(null)
    try { return await fn() } catch (e: any) { if (e?.name !== 'CancelledError') setError(e?.message || String(e)); return undefined } finally { setPhase('idle'); setLoad(null) }
  }
  const cancel = () => { cancelAi(); setPhase('idle'); setLoad(null) }
  /** The model to start with for a list: the light CPU one when there is no WebGPU. */
  const defaultFor = (list: ModelInfo[]) => (!gpuOk && list.find((m) => m.cpuDefault)) || list[0]
  return { model, setModel, defaultFor, info, gpu, setGpu, gpuOk, device, phase, load, status, setStatus, progress, setProgress, error, setError, callbacks, run, cancel, busy: phase !== 'idle' }
}
export type AiState = ReturnType<typeof useAiState>

export function ModelPanel({ ai, models, title = 'AI model' }: { ai: AiState; models: ModelInfo[]; title?: string }) {
  return (
    <div className="space-y-3">
      <div>
        <Label>{title}</Label>
        {models.length > 1 ? <Select value={ai.model} onChange={ai.setModel} options={models.map((m) => ({ value: m.id, label: m.label }))} /> : <div className="rounded-xl border border-border bg-surface-2/50 px-3 py-2 text-sm">{models[0].label}</div>}
        <p className="mt-1 text-xs text-muted">Download {ai.info.size}, once. After that it runs offline from your browser cache.{ai.info.note ? ' ' + ai.info.note : ''}</p>
      </div>
      {ai.gpuOk ? <Switch checked={ai.gpu} onChange={ai.setGpu} label={<span className="inline-flex items-center gap-1.5"><Zap className="size-3.5 text-accent" />Use GPU (WebGPU, faster)</span>} />
        : <p className="flex gap-1.5 text-xs text-muted"><Cpu className="size-4 shrink-0" />WebGPU is not available here, so the model runs on the CPU. It works, just slower.</p>}
    </div>
  )
}

export function AiProgress({ ai }: { ai: AiState }) {
  if (ai.phase === 'idle') return <ErrorNote error={ai.error} />
  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface-2/50 p-3">
      {ai.phase === 'loading' && ai.load && ai.load.total > 0 ? (
        <Progress value={ai.load.loaded / ai.load.total} label={`Downloading model: ${formatBytes(ai.load.loaded)} of ${formatBytes(ai.load.total)}`} />
      ) : ai.progress != null ? <Progress value={ai.progress} label={ai.status} /> : <StatusLine text={ai.status || 'Working'} />}
      <Button variant="outline" size="sm" className="w-full" icon={<X className="size-4" />} onClick={ai.cancel}>Cancel</Button>
    </div>
  )
}

/** Document input: a file (PDF, DOCX, EPUB, TXT...) or pasted text. */
export function useDocInput() {
  const [file, setFile] = useState<File | null>(null)
  const [pages, setPages] = useState<DocPage[] | null>(null)
  const [paste, setPaste] = useState('')
  const [mode, setMode] = useState<'file' | 'paste'>('file')
  const [reading, setReading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const open = async (f: File) => {
    setFile(f); setPages(null); setError(null); setReading('Reading document')
    try { setPages(await docPages(f, (_p, l) => l && setReading(l))) } catch (e: any) { setError(e?.message || 'Could not read this file.') } finally { setReading(null) }
  }
  const text = mode === 'paste' ? paste : (pages ?? []).map((p) => p.text).join('\n\n')
  const effectivePages: DocPage[] = mode === 'paste' ? (paste.trim() ? [{ page: 1, text: paste }] : []) : pages ?? []
  const reset = () => { setFile(null); setPages(null); setError(null) }
  // a problem with the dropped file (for example a scan with no text) does not apply to pasted text
  return { file, pages: effectivePages, text, paste, setPaste, mode, setMode, reading, error: mode === 'file' ? error : null, open, reset, ready: effectivePages.length > 0 && text.trim().length > 0, name: file?.name.replace(/\.[^.]+$/, '') ?? 'text' }
}
export type DocInputState = ReturnType<typeof useDocInput>

export function DocInput({ doc, label, sub, allowPaste = true }: { doc: DocInputState; label: string; sub: string; allowPaste?: boolean }) {
  const words = doc.text.split(/\s+/).filter(Boolean).length
  return (
    <div className="space-y-3">
      {allowPaste && <Tabs value={doc.mode} onChange={doc.setMode} tabs={[{ value: 'file', label: <span className="inline-flex items-center gap-1.5"><FileText className="size-4" />Document</span> }, { value: 'paste', label: <span className="inline-flex items-center gap-1.5"><ClipboardPaste className="size-4" />Paste text</span> }]} />}
      {doc.mode === 'paste' ? <Textarea value={doc.paste} onChange={(e) => doc.setPaste(e.target.value)} className="min-h-48 font-sans" placeholder="Paste the text here" aria-label="Text" />
        : !doc.file ? <Dropzone accept={DOCTEXT_ACCEPT} onFiles={(f) => doc.open(f[0])} label={label} sub={sub} compact />
        : <TopBar file={doc.file} onReset={doc.reset} extra={doc.pages.length ? <span className="text-xs text-muted">{doc.file.name.toLowerCase().endsWith('.pdf') ? `${doc.pages.length} pages · ` : ''}{words.toLocaleString()} words</span> : undefined} />}
      {doc.reading && <StatusLine text={doc.reading} />}
      <ErrorNote error={doc.error} />
    </div>
  )
}
