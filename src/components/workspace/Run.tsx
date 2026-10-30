/* Run controls (start, pause, resume, cancel, retry failed, concurrency, memory guard) and the results gallery
 * with before/after compare, size deltas and Download all as ZIP. */
import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, Square, RotateCcw, Download, Cpu, MemoryStick, Gauge, X, FileText, Check, Filter } from 'lucide-react'
import { Button, Slider, Switch, cn } from '@/components/ui'
import { downloadBlob, formatBytes, zipFiles } from '@/lib/files'
import { kindOf } from '@/pages/workspace/catalog'
import type { Item } from '@/pages/workspace/engine'
import type { InFile } from '@/pages/workspace/inputs'
import { CompareSlider, ProgressRing, Skeleton, fmtMs, useMotion, useObjectUrl } from './kit'
import { TextPeek } from './Steps'

export type RunInfo = { phase: 'idle' | 'running' | 'paused' | 'done' | 'cancelled'; overall: number; eta: number | null; started: number; ms: number; done: number; failed: number; total: number; log: string[] }

export function RunPanel({ info, files, conc, auto, onConc, onAuto, keep, onKeep, memory, onRun, onPause, onResume, onCancel, onRetry }: {
  info: RunInfo; files: number; conc: number; auto: number; onConc: (n: number) => void; onAuto: () => void; keep: boolean; onKeep: (v: boolean) => void; memory: number | null
  onRun: () => void; onPause: () => void; onResume: () => void; onCancel: () => void; onRetry: () => void
}) {
  const m = useMotion()
  const busy = info.phase === 'running' || info.phase === 'paused'
  const pct = Math.round(info.overall * 100)
  return (
    <div className="rounded-2xl border border-border bg-surface p-4" data-tour="run">
      <div className="flex items-center gap-4">
        <div className={cn('relative', busy && m === 'full' && 'ws-ring-glow')}>
          <ProgressRing value={info.overall} size={84} stroke={7} color={info.phase === 'done' ? '#10B981' : 'var(--accent)'} label={<span className="text-base">{busy || info.phase === 'done' ? `${pct}%` : files}</span>} />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5 text-xs">
          <div className="text-sm font-semibold">{info.phase === 'running' ? 'Running' : info.phase === 'paused' ? 'Paused' : info.phase === 'done' ? 'Finished' : info.phase === 'cancelled' ? 'Stopped' : `${files} file${files === 1 ? '' : 's'} ready`}</div>
          {busy && <div className="text-muted">About {fmtMs(info.eta)} left · {info.done}/{info.total} files</div>}
          {info.phase === 'paused' && <div className="text-muted">Steps in progress stop at their next page</div>}
          {info.phase === 'done' && <div className="text-muted">{info.done} done in {fmtMs(info.ms)}{info.failed ? ` · ${info.failed} failed` : ''}</div>}
          {info.phase === 'cancelled' && <div className="text-muted">{info.done ? `${info.done} of ${info.total} finished before you stopped it` : 'Stopped before any file finished'}</div>}
          {info.phase === 'idle' && <div className="text-muted">Ctrl + Enter to run</div>}
          {memory != null && <div className={cn('flex items-center gap-1', memory > 0.8 ? 'text-warn' : 'text-muted')}><MemoryStick className="size-3" /> Memory {Math.round(memory * 100)}%{memory > 0.8 ? ', slowing down to stay safe' : ''}</div>}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {!busy ? <Button className="col-span-2" size="lg" icon={<Play className="size-4" />} onClick={onRun} disabled={!files}>Run on {files} file{files === 1 ? '' : 's'}</Button>
          : <>
            {info.phase === 'running' ? <Button variant="outline" icon={<Pause className="size-4" />} onClick={onPause}>Pause</Button> : <Button icon={<Play className="size-4" />} onClick={onResume}>Resume</Button>}
            <Button variant="outline" icon={<Square className="size-4" />} onClick={onCancel} className="hover:border-danger hover:text-danger">Cancel</Button>
          </>}
        {!busy && info.failed > 0 && <Button className="col-span-2" variant="outline" icon={<RotateCcw className="size-4" />} onClick={onRetry}>Retry {info.failed} failed</Button>}
      </div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer select-none text-muted hover:text-fg">Engine settings</summary>
        <div className="mt-3 space-y-3">
          <Slider label={<span className="flex items-center gap-1"><Cpu className="size-3.5" /> Files at once</span>} value={conc} min={1} max={8} onChange={onConc} />
          <button onClick={onAuto} className="text-[11px] text-accent hover:underline cursor-pointer">Use the device default ({auto})</button>
          <label className="flex items-center justify-between gap-2"><span>Keep the original when a result is bigger</span><Switch checked={keep} onChange={onKeep} /></label>
          <p className="text-[11px] leading-snug text-muted">Image steps run in a pool of Web Workers. Video, OCR and AI steps share one engine, so they take one file at a time. When memory gets tight the engine waits and runs fewer files at once.</p>
        </div>
      </details>
      {info.log.length > 0 && (
        <details className="mt-2 text-xs" open={info.phase === 'done' && info.failed > 0}>
          <summary className="flex cursor-pointer select-none items-center gap-1 text-muted hover:text-fg"><Gauge className="size-3.5" /> Run log ({info.log.length})</summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded-xl border border-border bg-surface-2/50 p-2 font-mono text-[10px] leading-relaxed text-muted scrollbar-thin">{info.log.join('\n')}</pre>
        </details>
      )}
    </div>
  )
}

function ResultThumb({ it }: { it: Item }) {
  const isImg = kindOf(it.name, it.blob.type) === 'image'
  const url = useObjectUrl(isImg && it.blob.size < 40 * 1024 * 1024 ? it.blob : null)
  if (url) return <img src={url} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-lg object-cover" />
  return <div className="grid aspect-[4/3] w-full place-items-center rounded-lg bg-surface-2 text-muted"><div className="text-center"><FileText className="mx-auto size-7" /><div className="mt-1 font-mono text-[10px] uppercase">{(it.name.split('.').pop() || '').slice(0, 5)}</div></div></div>
}

function Delta({ a, b }: { a?: number; b: number }) {
  if (a == null) return null
  const d = (b - a) / Math.max(1, a)
  if (Math.abs(d) < 0.0005) return <span className="text-muted">same</span>
  return <span className={cn('font-semibold', d < 0 ? 'text-success' : 'text-warn')}>{d < 0 ? '−' : '+'}{Math.abs(d * 100).toFixed(1)}%</span>
}

export function Results({ outputs, inputs, running }: { outputs: Item[]; inputs: Map<string, InFile>; running: boolean }) {
  const [open, setOpen] = useState<Item | null>(null)
  const [zipping, setZipping] = useState(false)
  const [f, setF] = useState<'all' | 'smaller' | 'bigger' | 'kept'>('all')
  const m = useMotion()
  const totIn = useMemo(() => { const seen = new Set<string>(); let s = 0; outputs.forEach((o) => { const i = inputs.get(o.src); if (i && !seen.has(o.src)) { seen.add(o.src); s += i.blob.size } }); return s }, [outputs, inputs])
  const totOut = outputs.reduce((a, o) => a + o.blob.size, 0)
  const shown = outputs.filter((o) => { const i = inputs.get(o.src); if (f === 'kept') return o.kept; if (!i) return f === 'all'; if (f === 'smaller') return o.blob.size < i.blob.size; if (f === 'bigger') return o.blob.size > i.blob.size; return true })
  if (running && !outputs.length) return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="aspect-[4/3]" />)}</div>
  if (!outputs.length) return null
  const zipAll = async () => { setZipping(true); try { downloadBlob(await zipFiles(outputs.map((r) => ({ name: (r.path ? r.path.replace(/[^/]+$/, '') : '') + r.name, data: r.blob }))), 'openfile-pipeline.zip') } finally { setZipping(false) } }
  return (
    <section className="rounded-3xl border border-success/30 bg-success/5 p-4 sm:p-5" aria-label="Results" data-tour="results">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-success/15 text-success"><Check className="size-5" /></span>
        <div className="min-w-0 flex-1"><div className="font-semibold">{outputs.length} file{outputs.length === 1 ? '' : 's'} ready</div><div className="text-sm text-muted">{formatBytes(totIn)} in → <b className="text-fg">{formatBytes(totOut)}</b> out {totIn > 0 && <Delta a={totIn} b={totOut} />}</div></div>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-1 text-xs text-muted"><Filter className="size-3.5" /><span className="sr-only">Filter results</span>
            <select value={f} onChange={(e) => setF(e.target.value as any)} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs"><option value="all">All</option><option value="smaller">Smaller</option><option value="bigger">Bigger</option><option value="kept">Originals kept</option></select></label>
          {outputs.length === 1 ? <Button icon={<Download className="size-4" />} onClick={() => downloadBlob(outputs[0].blob, outputs[0].name)}>Download</Button>
            : <Button icon={<Download className="size-4" />} loading={zipping} onClick={zipAll}>Download all as ZIP</Button>}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <AnimatePresence initial={false}>
          {shown.slice(0, 120).map((o, i) => {
            const src = inputs.get(o.src)
            return (
              <motion.button key={o.id} layout={m === 'full'} initial={m === 'off' ? false : { opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: m === 'full' ? Math.min(i, 20) * 0.03 : 0 }}
                onClick={() => setOpen(o)} className="group rounded-2xl border border-border bg-surface p-2 text-left transition hover:-translate-y-0.5 hover:border-accent hover:shadow-xl cursor-pointer">
                <ResultThumb it={o} />
                <div className="mt-2 truncate text-xs font-medium" title={o.name}>{o.name}</div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted">{formatBytes(o.blob.size)} {src && !o.kept && <Delta a={src.blob.size} b={o.blob.size} />}{o.kept && <span className="text-accent">original kept</span>}</div>
              </motion.button>
            )
          })}
        </AnimatePresence>
      </div>
      {shown.length > 120 && <p className="mt-2 text-xs text-muted">Showing 120 of {shown.length}. The ZIP has all of them.</p>}
      <AnimatePresence>
        {open && (() => {
          const src = inputs.get(open.src)
          const both = src && kindOf(src.name, src.blob.type) === 'image' && kindOf(open.name, open.blob.type) === 'image'
          return (
            <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-3 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)} role="dialog" aria-modal="true" aria-label={`Result ${open.name}`}
              onKeyDown={(e) => e.key === 'Escape' && setOpen(null)}>
              <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl rounded-3xl border border-border bg-surface p-4">
                <div className="mb-3 flex items-center gap-2"><div className="min-w-0 flex-1"><div className="truncate font-semibold">{open.name}</div><div className="text-xs text-muted">{src ? `${src.name} · ${formatBytes(src.blob.size)} → ` : ''}{formatBytes(open.blob.size)} {src && <Delta a={src.blob.size} b={open.blob.size} />}{open.note ? ` · ${open.note}` : ''}</div></div>
                  <Button size="sm" icon={<Download className="size-4" />} onClick={() => downloadBlob(open.blob, open.name)}>Download</Button>
                  <button autoFocus onClick={() => setOpen(null)} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:text-fg cursor-pointer"><X className="size-5" /></button></div>
                {both ? <CompareSlider before={src!.blob} after={open.blob} /> : <MediaPeek it={open} />}
              </motion.div>
            </motion.div>
          )
        })()}
      </AnimatePresence>
    </section>
  )
}

function MediaPeek({ it }: { it: Item }) {
  const k = kindOf(it.name, it.blob.type)
  const url = useObjectUrl(k === 'image' || k === 'video' || k === 'audio' ? it.blob : null)
  if (k === 'image' && url) return <img src={url} alt={it.name} className="max-h-[60vh] w-full rounded-xl object-contain" />
  if (k === 'video' && url) return <video src={url} controls playsInline className="max-h-[60vh] w-full rounded-xl bg-black" />
  if (k === 'audio' && url) return <audio src={url} controls className="w-full" />
  if ((k === 'text' || k === 'data') && !/\.(xlsx|xls|ods)$/i.test(it.name)) return <TextPeek blob={it.blob} name={it.name} />
  return <div className="rounded-xl border border-border bg-surface-2/40 p-6 text-center text-sm text-muted">{it.name} · {formatBytes(it.blob.size)}<br /><span className="text-xs">Download it to open it in its app.</span></div>
}
