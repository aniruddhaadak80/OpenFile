import { useCallback, useState } from 'react'
import { Minimize2, Plus, X, Download, Check, Sparkles, Image as ImageIcon, FileCheck2, Archive } from 'lucide-react'
import { Button, Dropzone, Field, Segmented, Slider, Switch, ToolGrid, Progress, ErrorNote, Badge, useJob, cn } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName, downloadBlob, formatBytes, zipFiles } from '@/lib/files'
import { toast } from '@/components/toast'
import { PDF_ACCEPT, readBytes, friendly, motion, AnimatePresence, usePdfDoc, usePageImage } from './_core/kit'
import type { Preset } from './_core/compress'

type Method = 'smart' | 'raster' | 'lossless'
type Row = { id: string; file: File; status: 'idle' | 'working' | 'done' | 'error'; out?: Blob; how?: string; error?: string; detail?: string }
const PRESET_INFO: Record<Preset, { label: string; desc: string; dpi: number; q: number }> = {
  low: { label: 'Low', desc: 'Best quality, light savings', dpi: 150, q: 82 },
  medium: { label: 'Medium', desc: 'Recommended balance', dpi: 120, q: 70 },
  high: { label: 'High', desc: 'Smaller, softer images', dpi: 96, q: 56 },
  extreme: { label: 'Extreme', desc: 'Smallest, visible loss', dpi: 72, q: 42 },
}
let uid = 0

export default function CompressPdf() {
  const [rows, setRows] = useState<Row[]>([])
  const [method, setMethod] = useState<Method>('smart')
  const [preset, setPreset] = useState<Preset>('medium')
  const [custom, setCustom] = useState(false)
  const [dpi, setDpi] = useState(120)
  const [quality, setQuality] = useState(70)
  const [strip, setStrip] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const job = useJob()

  const add = useCallback((files: File[]) => {
    const fresh = files.map((file) => ({ id: `c${++uid}`, file, status: 'idle' as const }))
    setRows((r) => [...r, ...fresh]); setActive((a) => a ?? fresh[0]?.id ?? null)
  }, [])
  const choosePreset = (p: Preset) => { setPreset(p); setDpi(PRESET_INFO[p].dpi); setQuality(PRESET_INFO[p].q); resetOutputs() }
  const resetOutputs = () => setRows((r) => r.map((x) => ({ ...x, status: 'idle', out: undefined, how: undefined, error: undefined, detail: undefined })))
  const reset = () => { setRows([]); setActive(null); job.setError(null) }

  const run = () => job.run(async (setP) => {
    const c = await import('./_core/compress')
    const p = c.PRESETS[preset]
    const q = custom ? quality / 100 : p.q
    const maxPx = custom ? Math.round(p.maxPx * (dpi / PRESET_INFO[preset].dpi)) : p.maxPx
    const list = rows
    let ok = 0
    for (let i = 0; i < list.length; i++) {
      const r = list[i]
      const step = (f: number) => setP((i + f) / list.length)
      setRows((s) => s.map((x) => (x.id === r.id ? { ...x, status: 'working', error: undefined } : x)))
      try {
        const bytes = await readBytes(r.file)
        const cands: { bytes: Uint8Array; how: string }[] = [{ bytes, how: 'Already as small as it gets, original kept' }]
        let detail = ''
        const ll = await c.lossless(bytes, strip); step(0.15)
        cands.push({ bytes: ll, how: 'Lossless re-save' })
        if (method === 'smart') {
          const s = await c.smartImages(ll, maxPx, q, (f) => step(0.15 + f * 0.8))
          detail = s.images ? `${s.changed} of ${s.images} images recompressed` : 'No raster images found'
          cands.push({ bytes: s.bytes, how: 'Smart image downsampling' })
        } else if (method === 'raster') {
          const rb = await c.rasterize(bytes, custom ? dpi : p.dpi, custom ? quality / 100 : p.rq, (f) => step(0.15 + f * 0.8))
          detail = `Pages re-rendered at ${custom ? dpi : p.dpi} DPI`
          cands.push({ bytes: rb, how: 'Rasterized pages' })
        }
        const best = cands.reduce((a, b) => (b.bytes.length < a.bytes.length ? b : a))
        setRows((s) => s.map((x) => (x.id === r.id ? { ...x, status: 'done', out: pdfBlob(best.bytes), how: best.how, detail } : x)))
        ok++
      } catch (e) {
        setRows((s) => s.map((x) => (x.id === r.id ? { ...x, status: 'error', error: friendly(e) } : x)))
      }
      step(1)
    }
    if (ok) toast(`Compressed ${ok} file${ok > 1 ? 's' : ''}`, 'success')
  })

  if (!rows.length) return <Dropzone accept={PDF_ACCEPT} multiple onFiles={add} label="Drop PDFs to compress" sub="One file or a whole batch, everything runs locally in your browser." />

  const done = rows.filter((r) => r.out)
  const before = done.reduce((a, r) => a + r.file.size, 0), after = done.reduce((a, r) => a + r.out!.size, 0)
  const activeRow = rows.find((r) => r.id === active) ?? rows[0]

  return (
    <ToolGrid
      main={<>
        {done.length > 0 && !job.busy && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-success/30 bg-success/5 p-5">
            <div className="flex flex-wrap items-center gap-4">
              <div className="grid size-12 place-items-center rounded-xl bg-success/15 text-success"><Check className="size-6" /></div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{before > after ? `Saved ${formatBytes(before - after)} (${((1 - after / before) * 100).toFixed(1)}%)` : 'These files were already well optimized'}</div>
                <div className="text-sm text-muted">{formatBytes(before)} → <span className="font-medium text-fg">{formatBytes(after)}</span> across {done.length} file{done.length > 1 ? 's' : ''}</div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={reset}>Start over</Button>
                {done.length === 1 ? <Button icon={<Download className="size-4" />} onClick={() => downloadBlob(done[0].out!, `${baseName(done[0].file.name)}-compressed.pdf`)}>Download</Button>
                  : <Button icon={<Archive className="size-4" />} onClick={async () => downloadBlob(await zipFiles(done.map((r) => ({ name: `${baseName(r.file.name)}-compressed.pdf`, data: r.out! }))), 'compressed-pdfs.zip')}>Download ZIP</Button>}
              </div>
            </div>
          </motion.div>
        )}
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {rows.map((r) => {
              const pct = r.out ? 1 - r.out.size / r.file.size : 0
              return (
                <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -16 }}
                  onClick={() => setActive(r.id)}
                  className={cn('flex cursor-pointer items-center gap-3 rounded-2xl border bg-surface px-4 py-3 transition', activeRow?.id === r.id ? 'border-accent/60' : 'border-border hover:border-accent/30')}>
                  <div className={cn('grid size-9 shrink-0 place-items-center rounded-xl', r.status === 'done' ? 'bg-success/15 text-success' : r.status === 'error' ? 'bg-danger/10 text-danger' : 'bg-accent/10 text-accent')}>
                    {r.status === 'working' ? <Minimize2 className="size-4 animate-pulse" /> : r.status === 'done' ? <FileCheck2 className="size-4" /> : <Minimize2 className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.file.name}</div>
                    <div className="text-xs text-muted">
                      {r.status === 'error' ? <span className="text-danger">{r.error}</span>
                        : r.out ? <>{formatBytes(r.file.size)} → <span className="font-medium text-fg">{formatBytes(r.out.size)}</span> · {r.how}{r.detail ? ` · ${r.detail}` : ''}</>
                          : r.status === 'working' ? 'Compressing…' : formatBytes(r.file.size)}
                    </div>
                    {r.out && <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"><motion.div initial={{ width: '100%' }} animate={{ width: `${Math.max(2, (r.out.size / r.file.size) * 100)}%` }} transition={{ duration: 0.6 }} className="h-full rounded-full bg-gradient-brand" /></div>}
                  </div>
                  {r.out && <Badge color={pct > 0.005 ? '#22c55e' : '#f59e0b'}>{pct > 0.005 ? `−${(pct * 100).toFixed(0)}%` : '0%'}</Badge>}
                  {r.out && <button onClick={(e) => { e.stopPropagation(); downloadBlob(r.out!, `${baseName(r.file.name)}-compressed.pdf`) }} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-accent cursor-pointer" aria-label="Download"><Download className="size-4" /></button>}
                  {!job.busy && <button onClick={(e) => { e.stopPropagation(); setRows((s) => s.filter((x) => x.id !== r.id)) }} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger cursor-pointer" aria-label="Remove"><X className="size-4" /></button>}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
        {!job.busy && <Dropzone compact accept={PDF_ACCEPT} multiple onFiles={add} label={<span className="inline-flex items-center gap-1.5"><Plus className="size-4" />Add more PDFs</span>} sub="Batch results download as a ZIP" />}
        {activeRow?.out && <BeforeAfter original={activeRow.file} compressed={activeRow.out} />}
      </>}
      side={<>
        <Field label="Method">
          <Segmented value={method} onChange={(m) => { setMethod(m); resetOutputs() }} className="w-full" options={[{ value: 'smart', label: 'Smart' }, { value: 'raster', label: 'Rasterize' }, { value: 'lossless', label: 'Lossless' }]} />
        </Field>
        <div className="flex gap-2 rounded-xl bg-surface-2/60 p-3 text-xs leading-relaxed text-muted">
          {method === 'smart' ? <><Sparkles className="size-4 shrink-0 text-accent" />Downsamples & re-encodes embedded photos. Text stays sharp, selectable and searchable.</>
            : method === 'raster' ? <><ImageIcon className="size-4 shrink-0 text-accent" />Re-renders every page as a JPEG. Strongest for scans; text becomes an image (not selectable).</>
              : <><FileCheck2 className="size-4 shrink-0 text-accent" />Recompresses streams and packs objects. Zero quality loss.</>}
        </div>
        {method !== 'lossless' && <>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(PRESET_INFO) as Preset[]).map((p) => (
              <button key={p} type="button" onClick={() => choosePreset(p)} className={cn('rounded-xl border p-2.5 text-left transition cursor-pointer', preset === p && !custom ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50')}>
                <div className="text-sm font-semibold">{PRESET_INFO[p].label}</div>
                <div className="text-[11px] leading-tight text-muted">{PRESET_INFO[p].desc}</div>
              </button>
            ))}
          </div>
          <Switch checked={custom} onChange={(v) => { setCustom(v); resetOutputs() }} label="Fine-tune DPI & quality" />
          {custom && <div className="space-y-4">
            <Slider label={method === 'smart' ? 'Image resolution (approx. DPI)' : 'Render DPI'} value={dpi} min={48} max={300} step={6} onChange={(v) => { setDpi(v); resetOutputs() }} />
            <Slider label="JPEG quality" value={quality} min={20} max={95} onChange={(v) => { setQuality(v); resetOutputs() }} suffix="%" />
          </div>}
        </>}
        <Switch checked={strip} onChange={(v) => { setStrip(v); resetOutputs() }} label="Strip XMP metadata" />
        <div className="text-xs text-muted">The smallest result wins, if compression wouldn't help, your original is kept so the file never grows.</div>
        {job.busy && <Progress value={job.progress} label={`Compressing ${rows.length > 1 ? `${rows.length} files` : ''}…`} />}
        <ErrorNote error={job.error} />
        <Button className="w-full" size="lg" icon={<Minimize2 className="size-5" />} loading={job.busy} onClick={run}>Compress {rows.length > 1 ? `${rows.length} PDFs` : 'PDF'}</Button>
      </>}
    />
  )
}

function BeforeAfter({ original, compressed }: { original: File; compressed: Blob }) {
  const a = usePdfDoc(original), b = usePdfDoc(compressed)
  const ia = usePageImage(a.doc, 1, 520), ib = usePageImage(b.doc, 1, 520)
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 text-sm font-medium">Page 1, before / after</div>
      <div className="grid grid-cols-2 gap-3">
        {[['Before', ia, original.size], ['After', ib, compressed.size]].map(([l, im, sz]: any) => (
          <div key={l} className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted"><span>{l}</span><span className="font-mono">{formatBytes(sz)}</span></div>
            <div className="checker flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl p-2">
              {im ? <img src={im.src} alt={l} className="max-h-full max-w-full bg-white shadow-lg" /> : <div className="size-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
