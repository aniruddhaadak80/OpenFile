/* Shared UI for the AI Builder and Data Exports tools: tokenizer worker hook, export file loader (ZIP, folder or
 * single files), and small charts. */
import { useEffect, useRef, useState } from 'react'
import { Dropzone, ErrorNote, Progress, cn } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { FileBar } from '@/lib/cf/ui'

/* ---------------- tokenizers ---------------- */
export const TOKENIZERS = [
  { value: 'Xenova/gpt-4o', label: 'GPT-4o, GPT-4.1, GPT-5 (o200k)', ctx: 128000 },
  { value: 'Xenova/gpt-4', label: 'GPT-4, GPT-3.5 (cl100k)', ctx: 8192 },
  { value: 'Xenova/Meta-Llama-3.1-Tokenizer', label: 'Llama 3', ctx: 128000 },
  { value: 'Xenova/mistral-tokenizer-v3', label: 'Mistral', ctx: 32768 },
  { value: 'Qwen/Qwen2.5-0.5B-Instruct', label: 'Qwen 2.5', ctx: 32768 },
  { value: 'Xenova/gemma-tokenizer', label: 'Gemma', ctx: 8192 },
  { value: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3', ctx: 128000 },
  { value: 'Xenova/claude-tokenizer', label: 'Claude (old tokenizer, estimate)', ctx: 200000 },
] as const
export const QUICK = 'quick'

type Pending = { res: (v: any) => void; rej: (e: Error) => void; onProgress?: (d: number, t: number) => void }
let worker: Worker | null = null
let seq = 0
const pending = new Map<number, Pending>()
const listeners = new Set<(m: any) => void>()
function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./tok.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e) => {
    const m = e.data, p = pending.get(m.id)
    listeners.forEach((l) => l(m))
    if (!p) return
    if (m.type === 'done') { pending.delete(m.id); p.res(m.result) }
    else if (m.type === 'error') { pending.delete(m.id); p.rej(new Error(m.error)) }
    else if (m.type === 'progress') p.onProgress?.(m.done, m.total)
  }
  worker.onerror = (e) => { pending.forEach((p) => p.rej(new Error(e.message || 'The tokenizer stopped.'))); pending.clear(); worker = null }
  return worker
}

/** Run tokenizer jobs in the shared worker. Shows download progress the first time a tokenizer is used. */
export function useTokenizer(initial: string = TOKENIZERS[0].value) {
  const [model, setModel] = useState<string>(initial)
  const [load, setLoad] = useState<{ loaded: number; total: number } | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = useRef(new Set<string>())
  const call = <T,>(type: string, payload: any = {}, onProgress?: Pending['onProgress']): Promise<T> => {
    const id = ++seq
    const l = (m: any) => { if (m.id !== id) return; if (m.type === 'load') setLoad({ loaded: m.loaded, total: m.total }); else if (m.type === 'status') setStatus(m.text) }
    listeners.add(l)
    setBusy(true); setError(null)
    return new Promise<T>((res, rej) => { pending.set(id, { res, rej, onProgress }); getWorker().postMessage({ id, type, model, ...payload }) })
      .then((v) => { ready.current.add(model); return v })
      .catch((e) => { setError(`The tokenizer could not run: ${e.message}. Check your connection, or use Quick estimate.`); throw e })
      .finally(() => { listeners.delete(l); setBusy(false); setLoad(null); setStatus('') })
  }
  return { model, setModel, call, load, status, busy, error, setError, quick: model === QUICK, isReady: (m = model) => ready.current.has(m) }
}
export type TokState = ReturnType<typeof useTokenizer>

export function TokProgress({ tk }: { tk: TokState }) {
  if (!tk.busy && !tk.error) return null
  return (
    <div className="space-y-2">
      {tk.busy && tk.load && tk.load.total > 0 && <Progress value={(tk.load.loaded / tk.load.total) * 100} label={`Tokenizer ${formatBytes(tk.load.loaded)} of ${formatBytes(tk.load.total)} (once, then cached)`} />}
      {tk.busy && !tk.load && <p className="text-xs text-muted" role="status">{tk.status || 'Counting on your device'}</p>}
      <ErrorNote error={tk.error} />
    </div>
  )
}

/** Turn parser and ZIP library errors into plain words for the error note. */
export function plainError(x: any): string {
  const m = String(x?.message || x || '')
  if (x?.name === 'SyntaxError' || /JSON|Unexpected (token|end)/.test(m)) return 'This file is not valid JSON, so it could not be read. Use the file exactly as it came in your export, without edits.'
  if (/central directory|corrupted zip|zip file|end of data|invalid signature/i.test(m)) return 'This ZIP file is damaged or not complete. Download your export again and drop the new file here.'
  return m || 'This file could not be read.'
}

/* ---------------- export files: ZIP, folder or loose files ---------------- */
export interface Entry { path: string; size: number; read: () => Promise<string>; bytes: () => Promise<Uint8Array> }
const MAX_ENTRY = 400 * 1024 * 1024
export const EXPORT_ACCEPT = '.zip,.json,.js,.csv,.txt,.html,.htm'

/** Open dropped files. ZIP files are listed without unpacking; each entry is read only when a tool asks for it. */
export async function openEntries(files: File[]): Promise<Entry[]> {
  const out: Entry[] = []
  for (const f of files) {
    const head = new Uint8Array(await f.slice(0, 4).arrayBuffer())
    if (head[0] === 0x50 && head[1] === 0x4b) {
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(f)
      zip.forEach((path, e) => {
        if (e.dir || /(^|\/)(__MACOSX|\.DS_Store)/.test(path)) return
        const size = (e as any)._data?.uncompressedSize ?? 0
        const guard = () => { if (size > MAX_ENTRY) throw new Error(`${path} is larger than 400 MB, so it was skipped.`) }
        out.push({ path, size, read: async () => { guard(); return e.async('string') }, bytes: async () => { guard(); return e.async('uint8array') } })
      })
    } else {
      const path = (f as any).webkitRelativePath || f.name
      out.push({ path, size: f.size, read: () => f.text(), bytes: async () => new Uint8Array(await f.arrayBuffer()) })
    }
  }
  return out
}

/** Loader state for export tools. `pick` keeps the entries the tool can read. */
export function useExport(pick?: (path: string) => boolean) {
  const [files, setFiles] = useState<File[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = async (fs: File[]) => {
    setError(null); setBusy(true); setFiles(fs)
    try {
      const all = await openEntries(fs)
      const keep = pick ? all.filter((e) => pick(e.path)) : all
      if (!keep.length) throw new Error(all.length > 1 ? 'None of the files inside are the kind this tool reads. Check the file names in the help below.' : 'This is not a file this tool reads. Check the file names in the help below.')
      setEntries(keep)
    } catch (e: any) { setEntries([]); setError(plainError(e)) } finally { setBusy(false) }
  }
  const reset = () => { setFiles([]); setEntries([]); setError(null) }
  return { files, entries, busy, error, setError, open, reset }
}
export type ExportState = ReturnType<typeof useExport>

export function ExportDrop({ st, label, sub, accept = EXPORT_ACCEPT, extra }: { st: ExportState; label: string; sub: string; accept?: string; extra?: React.ReactNode }) {
  const size = st.files.reduce((a, f) => a + f.size, 0)
  return (
    <div className="space-y-3">
      {!st.files.length ? <Dropzone accept={accept} multiple onFiles={(f) => f.length && st.open(f)} label={label} sub={sub} />
        : <FileBar name={st.files.length === 1 ? st.files[0].name : `${st.files.length} files`} size={size} onReset={st.reset} extra={extra} />}
      {st.busy && <p className="text-sm text-muted" role="status">Reading the export on your device...</p>}
      <ErrorNote error={st.error} />
    </div>
  )
}

/** Read and JSON.parse an entry, accepting JS wrappers like "window.YTD.x.part0 = [...]". */
export async function readJson(e: Entry): Promise<any> {
  const t = (await e.read()).replace(/^\uFEFF/, '')
  try { return JSON.parse(t) } catch { return JSON.parse(t.replace(/^\s*[\w.$]+\s*=\s*/, '').trim().replace(/;\s*$/, '')) }
}

/* ---------------- charts ---------------- */
/** Vertical column chart. Labels are thinned when there are many columns. */
export function Columns({ data, color = '#F5A524', height = 140, unit = '', label }: { data: { label: string; value: number }[]; color?: string; height?: number; unit?: string; label: string }) {
  if (!data.length) return null
  const max = Math.max(1e-9, ...data.map((d) => d.value))
  const bw = data.length > 60 ? 8 : data.length > 30 ? 14 : 24, gap = bw > 10 ? 6 : 3
  const W = Math.max(280, data.length * (bw + gap) + 8)
  const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(W / 48))))
  return (
    <figure className="overflow-x-auto rounded-2xl border border-border bg-surface p-3 scrollbar-thin">
      <figcaption className="mb-1 text-xs font-semibold">{label}</figcaption>
      <svg viewBox={`0 0 ${W} ${height + 20}`} className="h-auto w-full" style={{ minWidth: Math.min(W, 640) }} role="img" aria-label={label}>
        {data.map((d, i) => {
          const h = (d.value / max) * height, x = 4 + i * (bw + gap)
          return <g key={d.label + i}><rect x={x} y={height - h} width={bw} height={Math.max(0, h)} rx="2" fill={color}><title>{`${d.label}: ${Number.isInteger(d.value) ? d.value : d.value.toFixed(1)}${unit}`}</title></rect>{i % every === 0 && <text x={x + bw / 2} y={height + 14} textAnchor="middle" fontSize="9" fill="currentColor" opacity=".6">{d.label}</text>}</g>
        })}
      </svg>
    </figure>
  )
}
export const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
export const hourData = (v: number[]) => v.map((value, i) => ({ label: HOURS[i], value }))

/** A small panel with a heading, used to group results. */
export function Panel({ title, hint, children, className }: { title: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={cn('min-w-0 rounded-2xl border border-border bg-surface p-4', className)}><div className="mb-2 flex flex-wrap items-baseline gap-2"><h3 className="text-sm font-semibold">{title}</h3>{hint && <span className="text-xs text-muted">{hint}</span>}</div>{children}</section>
}

export const fmtDate = (d?: Date) => (d && !isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '-')
export const fmtNum = (n: number) => n.toLocaleString()

/** Debounced value, for live recounting while typing. */
export function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v)
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms])
  return d
}

/** Privacy line shown under every export tool. */
export function LocalNote({ children }: { children?: React.ReactNode }) {
  return <p className="text-xs text-muted">{children ?? 'Your export is read inside this tab. Nothing is uploaded, and closing the tab clears it.'}</p>
}
