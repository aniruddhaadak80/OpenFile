/* Shared UI bits for the round 14 tools. */
import { useEffect, useRef, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { Button, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { fmtClock, plainText, parseSubtitles, type Cue, type SubDoc } from '@/lib/b4/subtitles'
import { readTextFile } from '@/lib/b4/text'

/** Scrollable cue list with times, used as a live preview. */
export function CueList({ cues, max = 400, className, highlight }: { cues: Cue[]; max?: number; className?: string; highlight?: number }) {
  return (
    <div className={cn('scrollbar-thin max-h-[420px] overflow-auto rounded-2xl border border-border bg-surface', className)}>
      {cues.slice(0, max).map((c, i) => (
        <div key={i} className={cn('grid grid-cols-[auto_1fr] gap-3 border-b border-border/60 px-3 py-2 text-sm', highlight === i && 'bg-accent/10')}>
          <span className="font-mono text-[11px] leading-5 text-muted">{fmtClock(c.start, '.')}<br />{fmtClock(c.end, '.')}</span>
          <span className="whitespace-pre-wrap break-words">{plainText(c.text)}</span>
        </div>
      ))}
      {cues.length > max && <div className="px-3 py-2 text-xs text-muted">Showing {max} of {cues.length} lines.</div>}
      {!cues.length && <div className="p-6 text-center text-sm text-muted">No lines</div>}
    </div>
  )
}

/** Read and parse a subtitle file with a friendly error. */
export async function readSubs(f: File): Promise<SubDoc> {
  const { text } = await readTextFile(f)
  return parseSubtitles(text, { name: f.name })
}

/** A small "Open file" button with a hidden input. */
export function OpenButton({ accept, multiple, onFiles, label = 'Open file', size = 'sm', variant = 'outline' }: { accept?: string; multiple?: boolean; onFiles: (f: File[]) => void; label?: string; size?: 'sm' | 'md'; variant?: 'outline' | 'secondary' | 'ghost' | 'primary' }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input ref={ref} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => { const l = Array.from(e.target.files ?? []); if (l.length) onFiles(l); e.target.value = '' }} />
      <Button size={size} variant={variant} icon={<FolderOpen className="size-4" />} onClick={() => ref.current?.click()}>{label}</Button>
    </>
  )
}

/** Run a task and toast its error. */
export async function attempt<T>(fn: () => Promise<T> | T, fallback = 'Something went wrong'): Promise<T | undefined> {
  try { return await fn() } catch (e: any) { console.error(e); toast(e?.message || fallback, 'error'); return undefined }
}

/** Object URL for a blob that is revoked on change. */
export function useBlobUrl(blob: Blob | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { if (!blob) { setUrl(null); return } const u = URL.createObjectURL(blob); setUrl(u); return () => URL.revokeObjectURL(u) }, [blob])
  return url
}

/** Small labelled stat tile. */
export function Tile({ label, value, sub }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="font-display text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  )
}

/** Preview an SVG string we generated ourselves (numbers only) through an <img>, never as live markup. */
export function SvgPreview({ svg, className, label = 'Drawing preview', dark }: { svg: string; className?: string; label?: string; dark?: boolean }) {
  const url = useBlobUrl(svg ? new Blob([svg], { type: 'image/svg+xml' }) : null)
  return <div className={cn('grid min-h-60 place-items-center overflow-hidden rounded-2xl border border-border p-3', dark ? 'bg-surface-2' : 'bg-white', className)}>{url ? <img src={url} alt={label} className="max-h-[65vh] max-w-full" /> : null}</div>
}
